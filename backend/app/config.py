"""Runtime settings, read from environment variables (see backend/.env.example)."""
import os
from dataclasses import dataclass, field
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent      # backend/
REPO_DIR = BASE_DIR.parent                              # repository root
DEFAULT_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"


def load_env_file(path: Path = BASE_DIR / ".env") -> None:
    """Load KEY=VALUE lines from backend/.env without overriding real environment variables."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key.strip() and value:
            os.environ.setdefault(key.strip(), value)


def _split(value: str) -> list[str]:
    return [item.strip().rstrip("/") for item in value.split(",") if item.strip()]


def _int(name: str, default: int, low: int, high: int) -> int:
    try:
        return max(low, min(high, int(os.getenv(name, default))))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    readings_path: Path
    thresholds_path: Path
    cors_origins: list[str] = field(default_factory=list)
    cors_origin_regex: str | None = None
    environment: str = "development"
    # Documents indexed for the assistant's search_project_docs tool.
    docs_paths: list[Path] = field(default_factory=list)
    # AI assistant. The key stays server-side and is excluded from repr/logs.
    ai_provider: str = "anthropic"
    ai_model: str = "claude-opus-5-5"
    ai_effort: str = "medium"
    ai_timeout_seconds: int = 45
    ai_max_iterations: int = 5
    anthropic_api_key: str | None = field(default=None, repr=False)

    @property
    def ai_configured(self) -> bool:
        return self.ai_provider == "anthropic" and bool(self.anthropic_api_key)

    @classmethod
    def from_env(cls) -> "Settings":
        load_env_file()
        data_dir = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))
        docs = os.getenv("DOCS_PATHS")
        effort = os.getenv("AI_EFFORT", "medium")
        return cls(
            readings_path=Path(os.getenv("READINGS_PATH", data_dir / "readings.csv")),
            thresholds_path=Path(os.getenv("THRESHOLDS_PATH", data_dir / "thresholds.json")),
            # Exact origins allowed to call the API from a browser, e.g. your deployed frontend URL.
            cors_origins=_split(os.getenv("CORS_ORIGINS", DEFAULT_ORIGINS)),
            cors_origin_regex=os.getenv("CORS_ORIGIN_REGEX") or None,
            environment=os.getenv("ENVIRONMENT", "development"),
            docs_paths=[Path(p) for p in _split(docs)] if docs else [REPO_DIR / "README.md", REPO_DIR / "docs"],
            ai_provider=os.getenv("AI_PROVIDER", "anthropic").strip().lower(),
            ai_model=os.getenv("AI_MODEL", "claude-opus-5-5").strip(),
            ai_effort=effort if effort in {"low", "medium", "high", "xhigh", "max"} else "medium",
            ai_timeout_seconds=_int("AI_TIMEOUT_SECONDS", 45, 5, 120),
            ai_max_iterations=_int("AI_MAX_TOOL_ITERATIONS", 5, 1, 8),
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY") or None,
        )
