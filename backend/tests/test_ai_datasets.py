"""The assistant reads the active uploaded dataset through read-only tools, and cannot modify datasets."""
import json

from fastapi.testclient import TestClient

from app.ai.guard import in_scope
from app.ai.tools import TOOLS, ToolContext, run_tool
from app.ai.docs_index import DocIndex
from app.datasets.catalog import ReadOnlyCatalog
from app.datasets.store import STARTER_ID
from tests.test_chat import FakeProvider, ask
from tests.test_dataset_sync import make_app, store_week46
from tests.test_groq import FakeGroq, completion, provider_with


def setup(tmp_path, fake=None):
    app = make_app(tmp_path / "db.sqlite3")
    rec = store_week46(app)
    app.state.llm = fake
    return app, rec


def tool_output(fake, index):
    return [json.loads(b["content"]) for b in fake.tool_results(index)]


def test_tools_read_the_active_upload_not_sample_data(tmp_path):
    fake = FakeProvider([[("get_dataset_info", {}), ("get_exceedances", {})], "v1 has one exceedance."])
    app, rec = setup(tmp_path, fake)
    body = ask(TestClient(app), "Which sites exceeded their limits in the current dataset?").json()
    info, exceedances = tool_output(fake, 1)
    assert info["active"]["version"] == 1 and info["active"]["name"] == "Week 46" and info["active"]["id"] == rec.id
    assert info["active"]["stats"]["total_rows"] == 4 and "not live" in info["note"]
    assert [h["version"] for h in info["history"]] == [1, 0] and info["history"][0]["is_active"]
    assert [(e["site_id"], e["value"]) for e in exceedances] == [("S1", 92.0)]      # not the starter's 5
    assert {s["name"] for s in body["sources"]} == {"week46.csv (dataset v1)", "rules.json (dataset v1)"}


def test_compare_defaults_to_active_vs_previous(tmp_path):
    fake = FakeProvider([[("compare_dataset_versions", {})], "Here is what changed."])
    app, _ = setup(tmp_path, fake)
    ask(TestClient(app), "What changed after the new upload?")
    (cmp,) = tool_output(fake, 1)
    assert (cmp["base"]["version"], cmp["target"]["version"]) == (0, 1)
    m = {x["metric"]: x for x in cmp["metrics"]}
    assert (m["total_rows"]["current"], m["total_rows"]["proposed"]) == (15, 4)
    assert cmp["sites_added"] == ["S4"] and cmp["sites_removed"] == ["S2", "S3"]
    assert cmp["threshold_changes"] == [{"sensor": "noise_dba", "change": "changed", "current": "85 dBA",
                                         "proposed": "90 dBA"}]
    assert [(e["site_id"], e["value"]) for e in cmp["exceedances_new_in_target"]] == [("S1", 92.0)]
    assert ("S2", 171.0) in [(e["site_id"], e["value"]) for e in cmp["exceedances_only_in_base"]]


def test_compare_explicit_versions_and_errors(tmp_path):
    fake = FakeProvider([[("compare_dataset_versions", {"base_version": 1, "target_version": 0}),
                          ("compare_dataset_versions", {"target_version": 0}),
                          ("compare_dataset_versions", {"base_version": 7})], "done"])
    app, _ = setup(tmp_path, fake)
    body = ask(TestClient(app), "Compare this dataset with the previous version").json()
    ok, no_earlier, missing = tool_output(fake, 1)
    assert ok["base"]["version"] == 1 and ok["target"]["version"] == 0
    assert no_earlier["code"] == "NO_EARLIER_VERSION" and missing["code"] == "VERSION_NOT_FOUND"
    assert [t["ok"] for t in body["tool_calls"]] == [True, False, False]


def test_rollback_is_seen_by_the_assistant_immediately(tmp_path):
    fake = FakeProvider([[("get_monitoring_summary", {})], "ok"])
    app, _ = setup(tmp_path, fake)
    app.state.datasets.store.activate(STARTER_ID, "admin")
    ask(TestClient(app), "Summarize the current monitoring dataset.")
    (summary,) = tool_output(fake, 1)
    assert summary["totals"]["total_readings"] == 15


def test_assistant_cannot_modify_datasets(tmp_path):
    app, _ = setup(tmp_path)
    catalog = ReadOnlyCatalog(app.state.datasets)
    assert not hasattr(catalog, "__dict__")
    assert {n for n in dir(catalog) if not n.startswith("_")} == {"versions", "dataset"}
    assert set(TOOLS) == {"get_sites", "get_site_details", "get_readings", "get_exceedances", "get_thresholds",
                          "get_monitoring_summary", "get_dataset_info", "compare_dataset_versions",
                          "search_project_docs"}
    ctx = ToolContext(dataset=app.state.datasets.active_dataset(), docs=DocIndex([]), catalog=catalog)
    for name in ("activate_dataset", "upload_dataset", "create_dataset"):
        assert not run_tool(name, {}, ctx).ok
    before = app.state.datasets.store.active().dataset_id
    for name in TOOLS:
        run_tool(name, {}, ctx)
    assert app.state.datasets.store.active().dataset_id == before


def test_dataset_questions_pass_the_scope_guard(tmp_path):
    app, _ = setup(tmp_path)
    ds = app.state.datasets.active_dataset()
    for q in ["What changed after the new upload?", "Compare this dataset with the previous version.",
              "Which sensor recorded the highest reading?", "Which sites have missing readings?",
              "Summarize the current monitoring dataset."]:
        assert in_scope(q, has_history=False, ds=ds), q
    assert not in_scope("What is the capital of France?", has_history=False, ds=ds)


def test_groq_answers_what_changed_from_the_active_upload(tmp_path):
    fake = FakeGroq(completion(tool_calls=[("compare_dataset_versions", {})], finish="tool_calls"),
                    completion("Week 46 (v1) replaced the starter dataset: S4 was added and S1 noise exceeded 90 dBA."))
    app, _ = setup(tmp_path)
    app.state.llm = provider_with(fake)
    body = TestClient(app).post("/api/chat", json={"messages": [
        {"role": "user", "content": "What changed after the new upload?"}]}).json()
    assert body["tool_calls"] == [{"name": "compare_dataset_versions", "arguments": {}, "ok": True}]
    tool_msg = fake.payloads[1]["messages"][-1]
    assert tool_msg["role"] == "tool" and '"sites_added": ["S4"]' in tool_msg["content"]
    names = {t["function"]["name"] for t in fake.payloads[0]["tools"]}
    assert {"get_dataset_info", "compare_dataset_versions"} <= names
    assert "S4" in body["answer"]


def test_value_ranking_across_sensor_types_is_reported_per_type(tmp_path):
    """Live: 'highest reading' compared ug/m3 with dBA. The tool now flags mixed units and gives per-type maxima."""
    app, _ = setup(tmp_path)
    ctx = ToolContext(dataset=app.state.datasets.active_dataset(), docs=DocIndex([]))
    out = json.loads(run_tool("get_readings", {"sort": "value", "order": "desc", "page_size": 1}, ctx).content)
    assert "not comparable" in out["note"]
    assert {t: (r["site_id"], r["value"]) for t, r in out["by_sensor_type"].items()} == {
        "dust": ("S4", 120.0), "noise": ("S1", 92.0), "vibration": ("S1", 0.31)}
    one_type = json.loads(run_tool("get_readings", {"sensor": "noise", "sort": "value", "order": "desc"}, ctx).content)
    assert "note" not in one_type
