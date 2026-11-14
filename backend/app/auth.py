"""Server-validated admin access for dataset management (demo-grade; see README "Admin access").

- ADMIN_TOKEN is a server-side secret. Without it, admin features are disabled.
- Signing in exchanges the token for a signed, expiring session cookie (HMAC-SHA256, key derived from
  ADMIN_TOKEN, so rotating the token signs everyone out). HttpOnly, SameSite=Strict, Secure on HTTPS.
- Cookie-authenticated writes must also send the X-SiteWatch-Admin header. Browsers cannot add a custom
  header cross-site without a CORS preflight that only the configured origins pass (CSRF protection).
- Scripts may instead send `Authorization: Bearer <ADMIN_TOKEN>`.
- Failed sign-ins are throttled per client address (per function instance).

Limitations: one shared token (no individual accounts or roles), throttling is per instance, and the
session cannot be revoked individually except by rotating ADMIN_TOKEN.
"""
import base64
import hashlib
import hmac
import secrets
import threading
import time
from dataclasses import dataclass

from fastapi import Request, Response

from app.config import Settings
from app.errors import APIError

COOKIE = "sitewatch_admin"
CSRF_HEADER = "x-sitewatch-admin"
SESSION_SECONDS = 8 * 3600
MIN_TOKEN_LENGTH = 16
MAX_FAILURES, FAILURE_WINDOW = 5, 300      # 5 failed sign-ins per 5 minutes per client


@dataclass(frozen=True)
class AdminSession:
    actor: str
    expires_at: int
    via: str            # "cookie" or "bearer"


def _key(settings: Settings) -> bytes:
    return hashlib.sha256(b"sitewatch-admin-session:" + (settings.admin_token or "").encode()).digest()


def admin_configured(settings: Settings) -> bool:
    return bool(settings.admin_token) and len(settings.admin_token) >= MIN_TOKEN_LENGTH


def token_matches(settings: Settings, candidate: str) -> bool:
    if not admin_configured(settings):
        return False
    return hmac.compare_digest(hashlib.sha256(candidate.encode()).digest(),
                               hashlib.sha256(settings.admin_token.encode()).digest())


def sign_session(settings: Settings, now: float | None = None) -> tuple[str, int]:
    expires = int((now or time.time()) + SESSION_SECONDS)
    payload = f"{expires}.{secrets.token_urlsafe(16)}"
    sig = base64.urlsafe_b64encode(hmac.new(_key(settings), payload.encode(), hashlib.sha256).digest()).decode()
    return f"{payload}.{sig.rstrip('=')}", expires


def verify_session(settings: Settings, value: str | None, now: float | None = None) -> int | None:
    """Expiry time if the cookie is authentic and unexpired, else None."""
    if not value or not admin_configured(settings):
        return None
    try:
        expires_s, nonce, sig = value.split(".")
        expires = int(expires_s)
    except ValueError:
        return None
    expected = base64.urlsafe_b64encode(
        hmac.new(_key(settings), f"{expires_s}.{nonce}".encode(), hashlib.sha256).digest()).decode().rstrip("=")
    if not hmac.compare_digest(expected, sig) or expires < (now or time.time()):
        return None
    return expires


class LoginThrottle:
    def __init__(self):
        self._failures: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def check(self, client: str) -> None:
        now = time.time()
        with self._lock:
            recent = [t for t in self._failures.get(client, []) if now - t < FAILURE_WINDOW]
            self._failures[client] = recent
            if len(recent) >= MAX_FAILURES:
                raise APIError(429, "TOO_MANY_ATTEMPTS", "Too many failed sign-in attempts. Try again in a few minutes.")

    def fail(self, client: str) -> None:
        with self._lock:
            self._failures.setdefault(client, []).append(time.time())

    def clear(self, client: str) -> None:
        with self._lock:
            self._failures.pop(client, None)


def client_address(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def set_session_cookie(response: Response, request: Request, settings: Settings, value: str) -> None:
    secure = request.url.scheme == "https" or settings.on_vercel
    response.set_cookie(COOKIE, value, max_age=SESSION_SECONDS, httponly=True, secure=secure, samesite="strict",
                        path="/api")


def clear_session_cookie(response: Response, request: Request, settings: Settings) -> None:
    response.delete_cookie(COOKIE, path="/api", httponly=True, samesite="strict",
                           secure=request.url.scheme == "https" or settings.on_vercel)


def current_admin(request: Request, settings: Settings) -> AdminSession | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        if token_matches(settings, auth[7:].strip()):
            return AdminSession(actor="admin (API token)", expires_at=0, via="bearer")
        return None
    expires = verify_session(settings, request.cookies.get(COOKIE))
    return AdminSession(actor="admin", expires_at=expires, via="cookie") if expires else None


def require_admin(request: Request, settings: Settings, write: bool) -> AdminSession:
    if not admin_configured(settings):
        raise APIError(503, "ADMIN_NOT_CONFIGURED",
                       "Dataset management is disabled: ADMIN_TOKEN is not configured on the server "
                       f"(it must be at least {MIN_TOKEN_LENGTH} characters).")
    session = current_admin(request, settings)
    if session is None:
        raise APIError(401, "ADMIN_REQUIRED", "Sign in as an administrator to manage datasets.")
    if write and session.via == "cookie" and request.headers.get(CSRF_HEADER) != "1":
        raise APIError(403, "CSRF_CHECK_FAILED", "Missing the X-SiteWatch-Admin header required for this request.")
    return session
