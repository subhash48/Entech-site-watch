"""LLM provider interface and the Anthropic (Claude) implementation.

The agent only depends on `LLMProvider`, so another provider can be added by implementing
`create()`; select it with AI_PROVIDER: "anthropic" (Claude) or "groq" (OpenAI-compatible API).
"""
import json
import logging
import socket
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.config import Settings
from app.errors import APIError

log = logging.getLogger("sitewatch.ai")


@dataclass
class ToolUse:
    id: str
    name: str
    input: Any


@dataclass
class ProviderTurn:
    text: str
    tool_uses: list[ToolUse]
    stop_reason: str            # end_turn | tool_use | max_tokens | refusal | pause_turn
    assistant_content: Any      # appended back to the conversation unchanged
    model: str
    extra: dict = field(default_factory=dict)


class LLMProvider(Protocol):
    name: str
    model: str

    def create(self, system: str, messages: list[dict], tools: list[dict]) -> ProviderTurn: ...


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, settings: Settings):
        import anthropic  # imported lazily so the API runs without the SDK when AI is off

        self._anthropic = anthropic
        self.model = settings.ai_model
        self.effort = settings.ai_effort
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key,
                                          timeout=float(settings.ai_timeout_seconds), max_retries=1)

    def create(self, system: str, messages: list[dict], tools: list[dict]) -> ProviderTurn:
        a = self._anthropic
        try:
            response = self.client.beta.messages.create(
                model=self.model,
                max_tokens=8000,
                # Stable system prompt + tool list first, so the prefix can be cached.
                system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                tools=tools,
                messages=messages,
                output_config={"effort": self.effort},
                # If a request is declined by a safety classifier, the API retries it on a
                # suitable fallback model within the same call.
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except a.AuthenticationError:
            raise APIError(502, "AI_AUTH_FAILED", "The AI provider rejected the configured API key. "
                           "Check ANTHROPIC_API_KEY in the backend environment.") from None
        except a.PermissionDeniedError:
            raise APIError(502, "AI_PERMISSION_DENIED", "The configured API key cannot use this model. "
                           "Check AI_MODEL and your Anthropic account access.") from None
        except a.NotFoundError:
            raise APIError(502, "AI_MODEL_NOT_FOUND", f"The AI model '{self.model}' was not found.") from None
        except a.RateLimitError:
            raise APIError(429, "AI_RATE_LIMITED", "The AI provider is rate limiting requests. "
                           "Please try again shortly.") from None
        except a.APITimeoutError:
            raise APIError(504, "AI_TIMEOUT", "The AI provider took too long to respond. Please try again.") from None
        except a.APIConnectionError:
            raise APIError(502, "AI_UNREACHABLE", "Could not reach the AI provider. Check network access.") from None
        except a.APIStatusError as e:
            raise APIError(502, "AI_PROVIDER_ERROR", f"The AI provider returned an error (HTTP {e.status_code}).") from None

        text = "".join(b.text for b in response.content if b.type == "text")
        uses = [ToolUse(b.id, b.name, b.input) for b in response.content if b.type == "tool_use"]
        return ProviderTurn(text=text, tool_uses=uses, stop_reason=response.stop_reason or "end_turn",
                            assistant_content=response.content, model=response.model)


class GroqProvider:
    """Groq's OpenAI-compatible Chat Completions API with tool calling (e.g. openai/gpt-oss-120b).

    The agent keeps its conversation in the Anthropic shape (tool_use / tool_result blocks); this class
    translates it to OpenAI messages on every call. Uses only the standard library.
    """
    name = "groq"
    URL = "https://api.groq.com/openai/v1/chat/completions"
    EFFORT = {"low": "low", "medium": "medium", "high": "high", "xhigh": "high", "max": "high"}
    # Groq counts the requested completion budget against the tokens-per-minute limit (8K on the
    # free tier), so keep it modest; answers are capped at ~250 words.
    MAX_COMPLETION_TOKENS = 2048
    MAX_RATE_LIMIT_WAIT = 20.0   # seconds; a longer wait is reported to the user instead

    def __init__(self, settings: Settings):
        self.model = settings.ai_model
        self.effort = self.EFFORT.get(settings.ai_effort, "medium")
        self.timeout = float(settings.ai_timeout_seconds)
        self._key = settings.groq_api_key

    # ---- message translation ----

    @staticmethod
    def to_openai(system: str, messages: list[dict]) -> list[dict]:
        out: list[dict] = [{"role": "system", "content": system}]
        for m in messages:
            content = m["content"]
            if isinstance(content, str):
                out.append({"role": m["role"], "content": content})
            elif isinstance(content, dict) and "openai" in content:   # a turn this provider produced
                out.append(content["openai"])
            elif m["role"] == "user":                                 # tool results
                for b in content:
                    if b.get("type") == "tool_result":
                        out.append({"role": "tool", "tool_call_id": b["tool_use_id"], "content": str(b["content"])})
                    elif b.get("type") == "text":
                        out.append({"role": "user", "content": b["text"]})
            else:                                                     # assistant blocks from another provider
                text = "".join(b.get("text", "") for b in content if b.get("type") == "text")
                calls = [{"id": b["id"], "type": "function",
                          "function": {"name": b["name"], "arguments": json.dumps(b.get("input") or {})}}
                         for b in content if b.get("type") == "tool_use"]
                msg = {"role": "assistant", "content": text}
                if calls:
                    msg["tool_calls"] = calls
                out.append(msg)
        return out

    @staticmethod
    def to_openai_tools(tools: list[dict]) -> list[dict]:
        """Groq validates tool calls against the schema server-side, and models often send null for an
        optional filter. Declare optional properties as nullable; nulls are dropped before validation."""
        out = []
        for t in tools:
            schema = json.loads(json.dumps(t["input_schema"]))
            required = set(schema.get("required", []))
            for name, prop in schema.get("properties", {}).items():
                if name not in required and isinstance(prop.get("type"), str):
                    prop["type"] = [prop["type"], "null"]
            out.append({"type": "function", "function": {"name": t["name"], "description": t["description"],
                                                         "parameters": schema}})
        return out

    # ---- HTTP ----

    def _post(self, payload: dict) -> dict:
        req = urllib.request.Request(self.URL, data=json.dumps(payload).encode(), method="POST", headers={
            "Authorization": f"Bearer {self._key}", "Content-Type": "application/json",
            "Accept": "application/json", "User-Agent": "sitewatch-api"})
        with urllib.request.urlopen(req, timeout=self.timeout) as res:
            return json.loads(res.read().decode("utf-8"))

    def _call(self, payload: dict) -> dict:
        """One retry for transient failures and Groq's 400 tool_use_failed (malformed tool call)."""
        for attempt in (1, 2):
            try:
                return self._post(payload)
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", "replace")
                try:
                    err = json.loads(body).get("error", {})
                except ValueError:
                    err = {}
                code = err.get("code") or ""
                if code == "tool_use_failed":
                    log.warning("Groq rejected a tool call (attempt %d): %s | generated: %.300s", attempt,
                                err.get("message"), json.dumps(err.get("failed_generation")))
                wait = _retry_after(e.headers)
                retryable = e.code >= 500 or (e.code == 400 and code == "tool_use_failed")
                if attempt == 1 and e.code == 429 and wait is not None and wait <= self.MAX_RATE_LIMIT_WAIT:
                    time.sleep(wait + 0.25)
                    continue
                if attempt == 1 and retryable:
                    continue
                if e.code == 401:
                    raise APIError(502, "AI_AUTH_FAILED", "The AI provider rejected the configured API key. "
                                   "Check GROQ_API_KEY in the backend environment.") from None
                if e.code == 403:
                    raise APIError(502, "AI_PERMISSION_DENIED", "The configured API key cannot use this model. "
                                   "Check AI_MODEL and your Groq account access.") from None
                if e.code == 404:
                    raise APIError(502, "AI_MODEL_NOT_FOUND", f"The AI model '{self.model}' was not found.") from None
                if e.code == 413:
                    raise APIError(429, "AI_RATE_LIMITED", "This question needs more tokens than the Groq plan's "
                                   "per-minute limit allows. Ask a narrower question, for example about one site.") from None
                if e.code == 429:
                    when = f"in about {int(wait) + 1} seconds" if wait is not None else "shortly"
                    raise APIError(429, "AI_RATE_LIMITED", "The AI provider's rate limit was reached (Groq "
                                   f"tokens per minute). Please try again {when}.") from None
                raise APIError(502, "AI_PROVIDER_ERROR",
                               f"The AI provider returned an error (HTTP {e.code}{', ' + code if code else ''}).") from None
            except (TimeoutError, socket.timeout):
                if attempt == 1:
                    continue
                raise APIError(504, "AI_TIMEOUT", "The AI provider took too long to respond. Please try again.") from None
            except urllib.error.URLError as e:
                if isinstance(e.reason, (TimeoutError, socket.timeout)):
                    if attempt == 1:
                        continue
                    raise APIError(504, "AI_TIMEOUT", "The AI provider took too long to respond. "
                                   "Please try again.") from None
                raise APIError(502, "AI_UNREACHABLE", "Could not reach the AI provider. Check network access.") from None
        raise AssertionError("unreachable")

    def create(self, system: str, messages: list[dict], tools: list[dict]) -> ProviderTurn:
        payload = {"model": self.model, "messages": self.to_openai(system, messages),
                   "tools": self.to_openai_tools(tools), "tool_choice": "auto",
                   "temperature": 0.2, "max_completion_tokens": self.MAX_COMPLETION_TOKENS}
        if self.model.startswith("openai/gpt-oss"):
            payload["reasoning_effort"] = self.effort
            payload["include_reasoning"] = False
        data = self._call(payload)
        try:
            choice = data["choices"][0]
            msg = choice["message"]
        except (KeyError, IndexError, TypeError):
            raise APIError(502, "AI_PROVIDER_ERROR", "The AI provider returned an unexpected response.") from None
        calls = msg.get("tool_calls") or []
        uses = []
        for c in calls:
            raw = c.get("function", {}).get("arguments") or "{}"
            try:
                args = json.loads(raw)
            except ValueError:
                args = raw   # run_tool rejects non-object arguments with a validation error the model can fix
            if isinstance(args, dict):
                args = {k: v for k, v in args.items() if v is not None}   # null = "no filter" -> defaults
            uses.append(ToolUse(c["id"], c["function"]["name"], args))
        finish = choice.get("finish_reason") or "stop"
        stop = ("tool_use" if uses else
                {"length": "max_tokens", "content_filter": "refusal"}.get(finish, "end_turn"))
        echo = {"role": "assistant", "content": msg.get("content") or ""}
        if calls:
            echo["tool_calls"] = [{"id": c["id"], "type": "function", "function": c["function"]} for c in calls]
        return ProviderTurn(text=msg.get("content") or "", tool_uses=uses, stop_reason=stop,
                            assistant_content={"openai": echo}, model=data.get("model") or self.model)


def _retry_after(headers) -> float | None:
    """Seconds from a Retry-After header, if present and numeric."""
    try:
        value = float(headers.get("retry-after")) if headers and headers.get("retry-after") else None
    except (TypeError, ValueError):
        return None
    return max(0.0, value) if value is not None else None


PROVIDERS = {"anthropic": AnthropicProvider, "groq": GroqProvider}


def build_provider(settings: Settings) -> LLMProvider | None:
    """None means the assistant is not configured; the API then returns a setup message."""
    if not settings.ai_configured:
        return None
    cls = PROVIDERS.get(settings.ai_provider)
    return cls(settings) if cls else None
