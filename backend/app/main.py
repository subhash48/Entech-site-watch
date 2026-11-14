"""FastAPI application factory.

Run locally:  uvicorn app.main:app --reload --port 8001   (from the backend/ folder)
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.ai.provider import build_provider
from app.api.routes import router
from app.config import Settings
from app.datasets.service import DatasetService
from app.errors import register_error_handlers

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
    # GET for data, POST only for /api/chat. No cookies/credentials are accepted cross-origin.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
        allow_credentials=False,
        max_age=600,
    )
    register_error_handlers(app)
    app.include_router(router)
    return app


app = create_app()
