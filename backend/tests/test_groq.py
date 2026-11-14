"""Groq provider: config, OpenAI-format translation, the full tool loop through /api/chat, and error mapping.

Groq's HTTP endpoint is replaced by a scripted fake, so these tests never call the network.
"""
import io
import json
import urllib.error

import pytest
from fastapi.testclient import TestClient

from app.ai.provider import GroqProvider, build_provider
from app.errors import APIError
from app.main import create_app
from tests.conftest import DATA_DIR, settings_for

SECRET = "gsk_test_secret_value_123"


def groq_settings(**over):
    s = settings_for(DATA_DIR / "readings.csv", DATA_DIR / "thresholds.json")
    return s.__class__(**{**s.__dict__, "ai_provider": "groq", "ai_model": "openai/gpt-oss-120b",
                          "groq_api_key": SECRET, **over})


def completion(content=None, tool_calls=None, finish="stop"):
    msg = {"role": "assistant", "content": content}
    if tool_calls:
        msg["tool_calls"] = [{"id": f"call_{i}", "type": "function",
                              "function": {"name": n, "arguments": json.dumps(a) if isinstance(a, dict) else a}}
                             for i, (n, a) in enumerate(tool_calls)]
    return {"model": "openai/gpt-oss-120b", "choices": [{"index": 0, "message": msg, "finish_reason": finish}]}


class FakeGroq:
    """Stands in for GroqProvider._post: returns scripted responses (or raises) and records payloads."""

    def __init__(self, *steps):
        self.steps, self.payloads = list(steps), []

    def __call__(self, payload):
        self.payloads.append(json.loads(json.dumps(payload)))
        step = self.steps.pop(0)
        if isinstance(step, Exception):
            raise step
        return step


def http_error(code, body, headers=None):
    return urllib.error.HTTPError(GroqProvider.URL, code, "err", headers or {}, io.BytesIO(json.dumps(body).encode()))


def client_with(fake, monkeypatch, **over):
    monkeypatch.setattr(GroqProvider, "_post", lambda self, payload: fake(payload))
    return TestClient(create_app(groq_settings(**over)))


def ask(c, text):
    return c.post("/api/chat", json={"messages": [{"role": "user", "content": text}]})


# ---------- configuration ----------

def test_groq_settings_from_env(monkeypatch):
    from app import config
    monkeypatch.setattr(config, "load_env_file", lambda *a, **k: None)
    for k in ("AI_MODEL", "ANTHROPIC_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("AI_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_API_KEY", SECRET)
    monkeypatch.setenv("GROQ_MODEL", "openai/gpt-oss-20b")
    s = config.Settings.from_env()
    assert s.ai_configured and s.ai_model == "openai/gpt-oss-20b" and SECRET not in repr(s)
    monkeypatch.delenv("GROQ_MODEL")
    assert config.Settings.from_env().ai_model == "openai/gpt-oss-120b"
    assert isinstance(build_provider(s), GroqProvider)


def test_groq_without_key_explains_setup():
    c = TestClient(create_app(groq_settings(groq_api_key=None)))
    status = c.get("/api/chat/status").json()
    assert status["configured"] is False and status["provider"] == "groq" and "GROQ_API_KEY" in status["message"]
    assert ask(c, "Which sites exceeded their limits?").status_code == 503


def test_groq_key_never_exposed(monkeypatch):
    c = client_with(FakeGroq(), monkeypatch)
    status = c.get("/api/chat/status").json()
    assert status["configured"] is True and status["model"] == "openai/gpt-oss-120b"
    for path in ["/health", "/api/chat/status", "/openapi.json"]:
        assert SECRET not in c.get(path).text


# ---------- full tool loop ----------

def test_tool_loop_grounds_answer_in_tool_results(monkeypatch):
    fake = FakeGroq(completion(tool_calls=[("get_exceedances", {})], finish="tool_calls"),
                    completion("S1, S2 and S3 each had readings above their limits."))
    res = ask(client_with(fake, monkeypatch), "Which sites exceeded their limits?")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "S1" in body["answer"] and body["tool_calls"] == [{"name": "get_exceedances", "arguments": {}, "ok": True}]
    assert any(s["name"] == "readings.csv" for s in body["sources"])

    first, second = fake.payloads
    assert first["model"] == "openai/gpt-oss-120b" and first["reasoning_effort"] == "medium"
    assert first["messages"][0]["role"] == "system" and first["messages"][1] == {
        "role": "user", "content": "Which sites exceeded their limits?"}
    assert {t["function"]["name"] for t in first["tools"]} >= {"get_exceedances", "search_project_docs"}
    assert all(t["type"] == "function" and t["function"]["parameters"]["type"] == "object" for t in first["tools"])
    # The second request carries the assistant tool call and the tool result in OpenAI format.
    assistant, tool = second["messages"][-2:]
    assert assistant["role"] == "assistant" and assistant["tool_calls"][0]["function"]["name"] == "get_exceedances"
    assert tool["role"] == "tool" and tool["tool_call_id"] == "call_0"
    assert "noise_dba" in tool["content"]          # real exceedance data reached the model


def test_invalid_tool_arguments_are_returned_to_model(monkeypatch):
    fake = FakeGroq(completion(tool_calls=[("get_site_details", "{not json")], finish="tool_calls"),
                    completion("Site S1 is 125 Main St."))
    body = ask(client_with(fake, monkeypatch), "Tell me about site S1").json()
    assert body["tool_calls"][0]["ok"] is False
    assert "Invalid arguments" in fake.payloads[1]["messages"][-1]["content"]


def test_unknown_tool_is_rejected(monkeypatch):
    fake = FakeGroq(completion(tool_calls=[("delete_files", {})], finish="tool_calls"), completion("Done."))
    body = ask(client_with(fake, monkeypatch), "Which sites exceeded their limits?").json()
    assert body["tool_calls"] == [{"name": "delete_files", "arguments": {}, "ok": False}]


def test_off_topic_question_is_refused_without_calling_groq(monkeypatch):
    fake = FakeGroq()
    body = ask(client_with(fake, monkeypatch), "Write me a poem about pizza").json()
    assert body["refused"] is True and fake.payloads == []


def test_length_limit_is_reported(monkeypatch):
    body = ask(client_with(FakeGroq(completion("Partial", finish="length")), monkeypatch),
               "Summarize the monitoring results for a client.").json()
    assert "length limit" in body["answer"]


# ---------- errors and retries ----------

@pytest.mark.parametrize("code,expected", [(401, "AI_AUTH_FAILED"), (404, "AI_MODEL_NOT_FOUND"),
                                           (429, "AI_RATE_LIMITED"), (413, "AI_RATE_LIMITED")])
def test_http_errors_are_mapped(monkeypatch, code, expected):
    fake = FakeGroq(http_error(code, {"error": {"message": "x"}}))
    res = ask(client_with(fake, monkeypatch), "Which sites exceeded their limits?")
    assert res.json()["error"]["code"] == expected and SECRET not in res.text
    assert len(fake.payloads) == 1


def test_tool_use_failed_and_5xx_are_retried_once(monkeypatch):
    fake = FakeGroq(http_error(400, {"error": {"code": "tool_use_failed", "message": "bad"}}),
                    completion("Three sites are monitored."))
    assert ask(client_with(fake, monkeypatch), "How many sites are there?").status_code == 200
    fake = FakeGroq(http_error(503, {}), http_error(503, {}))
    res = ask(client_with(fake, monkeypatch), "How many sites are there?")
    assert res.json()["error"]["code"] == "AI_PROVIDER_ERROR" and len(fake.payloads) == 2


def test_timeout_is_retried_then_reported(monkeypatch):
    fake = FakeGroq(TimeoutError(), TimeoutError())
    res = ask(client_with(fake, monkeypatch), "How many sites are there?")
    assert res.status_code == 504 and res.json()["error"]["code"] == "AI_TIMEOUT"


def test_unreachable(monkeypatch):
    fake = FakeGroq(urllib.error.URLError("no route"))
    assert ask(client_with(fake, monkeypatch), "How many sites are there?").json()["error"]["code"] == "AI_UNREACHABLE"


def test_translation_of_foreign_assistant_blocks():
    msgs = GroqProvider.to_openai("sys", [
        {"role": "user", "content": "q"},
        {"role": "assistant", "content": [{"type": "text", "text": "checking"},
                                          {"type": "tool_use", "id": "t1", "name": "get_sites", "input": {}}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t1", "content": "[]"}]},
    ])
    assert [m["role"] for m in msgs] == ["system", "user", "assistant", "tool"]
    assert msgs[2]["tool_calls"][0]["function"] == {"name": "get_sites", "arguments": "{}"}


def test_error_raises_api_error_directly():
    p = GroqProvider(groq_settings())
    p._post = FakeGroq(http_error(401, {}))
    with pytest.raises(APIError) as e:
        p.create("s", [{"role": "user", "content": "q"}], [])
    assert e.value.code == "AI_AUTH_FAILED"


# ---------- regressions found in live testing ----------

def test_optional_tool_params_are_nullable_for_groq_and_nulls_are_dropped(monkeypatch):
    """Live: gpt-oss sent {"site_id": null} and Groq rejected it with 400 tool_use_failed."""
    fake = FakeGroq(completion(tool_calls=[("get_monitoring_summary", {"site_id": None})], finish="tool_calls"),
                    completion("There are 5 exceedances in total."))
    body = ask(client_with(fake, monkeypatch), "How many threshold exceedances are there in total?").json()
    assert body["tool_calls"] == [{"name": "get_monitoring_summary", "arguments": {}, "ok": True}]
    tools = {t["function"]["name"]: t["function"]["parameters"] for t in fake.payloads[0]["tools"]}
    assert tools["get_monitoring_summary"]["properties"]["site_id"]["type"] == ["string", "null"]
    assert tools["get_site_details"]["properties"]["site_id"]["type"] == "string"     # required stays strict


def test_completion_budget_fits_groq_free_tier(monkeypatch):
    """Live: max_completion_tokens=8000 alone exceeded the 8K tokens-per-minute limit."""
    fake = FakeGroq(completion("Three sites are monitored."))
    ask(client_with(fake, monkeypatch), "How many sites are there?")
    assert fake.payloads[0]["max_completion_tokens"] <= 2048


def test_short_rate_limit_waits_and_retries(monkeypatch):
    waits = []
    monkeypatch.setattr("app.ai.provider.time.sleep", waits.append)
    fake = FakeGroq(http_error(429, {"error": {"code": "rate_limit_exceeded"}}, {"retry-after": "3"}),
                    completion("Three sites are monitored."))
    assert ask(client_with(fake, monkeypatch), "How many sites are there?").status_code == 200
    assert waits and 3 <= waits[0] < 4


def test_long_rate_limit_reports_wait_time(monkeypatch):
    monkeypatch.setattr("app.ai.provider.time.sleep", lambda s: pytest.fail("must not wait this long"))
    fake = FakeGroq(http_error(429, {"error": {}}, {"retry-after": "44"}))
    res = ask(client_with(fake, monkeypatch), "How many sites are there?")
    assert res.status_code == 429 and "about 45 seconds" in res.json()["error"]["message"]


def test_request_too_large_has_specific_message(monkeypatch):
    res = ask(client_with(FakeGroq(http_error(413, {"error": {}})), monkeypatch), "How many sites are there?")
    assert "per-minute limit" in res.json()["error"]["message"]


def test_readings_tool_states_its_ordering_and_how_to_find_maximums():
    """Live: the model asked for order=desc without sort=value and reported the latest reading as the highest."""
    from app.ai.tools import ToolContext, run_tool, tool_definitions
    from app.ai.docs_index import DocIndex
    from app.services.dataset import load_dataset
    ctx = ToolContext(dataset=load_dataset(groq_settings()), docs=DocIndex([]))
    out = json.loads(run_tool("get_readings", {"sensor": "vibration", "order": "desc", "page_size": 1}, ctx).content)
    assert out["sorted_by"] == "timestamp desc"
    top = json.loads(run_tool("get_readings", {"sensor": "vibration", "sort": "value", "order": "desc",
                                               "page_size": 1}, ctx).content)
    assert (top["items"][0]["site_id"], top["items"][0]["value"]) == ("S1", 0.62)
    schema = next(t for t in tool_definitions() if t["name"] == "get_readings")["input_schema"]
    assert "sort=value" in schema["properties"]["sort"]["description"]
