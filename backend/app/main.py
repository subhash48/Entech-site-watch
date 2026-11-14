"""FastAPI application factory.

Run locally:  uvicorn app.main:app --reload --port 8001   (from the backend/ folder)
"""
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app.ai.provider import build_provider
from app.api.datasets import router as datasets_router
from app.api.routes import router
from app.config import Settings
from app.datasets.service import DatasetService
from app.errors import error_body, register_error_handlers

MAX_REQUEST_BYTES = 4_500_000

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    app = FastAPI(
        title="SiteWatch Mini API",
        version=__version__,
        description="Construction-site vibration, noise and dust monitoring against configured thresholds.",
    )
    app.state.settings = settings
    app.state.llm = build_provider(settings)  # None when no AI key is configured
    app.state.datasets = DatasetService(settings)  # active dataset version for every request
    # Only the configured origins (exact list, never "*") may call the API from a browser. Credentials are
    # allowed so the admin session cookie works in local development (frontend :3100 -> API :8001); on
    # Vercel the frontend and API share one origin and CORS is not involved.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type", "Authorization", "X-SiteWatch-Admin"],
        allow_credentials=True,
        max_age=600,
    )

    @app.middleware("http")
    async def limit_request_size(request: Request, call_next):
        """Reject oversized bodies before parsing them (Vercel's own limit is 4.5 MB)."""
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > MAX_REQUEST_BYTES:
            return JSONResponse(error_body("PAYLOAD_TOO_LARGE", "The request is larger than the 4.5 MB limit.",
                                           {"limit_bytes": MAX_REQUEST_BYTES}), status_code=413)
        return await call_next(request)

    register_error_handlers(app)
    app.include_router(router)
    app.include_router(datasets_router)
    return app


app = create_app()
