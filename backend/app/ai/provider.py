"""LLM provider interface and the Anthropic (Claude) implementation.

The agent only depends on `LLMProvider`, so another provider can be added by implementing
`create()`; select it with AI_PROVIDER. Only "anthropic" is implemented in this version.
"""
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.config import Settings
from app.errors import APIError


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


def build_provider(settings: Settings) -> LLMProvider | None:
    """None means the assistant is not configured; the API then returns a setup message."""
    if not settings.ai_configured:
        return None
    if settings.ai_provider == "anthropic":
        return AnthropicProvider(settings)
    return None
