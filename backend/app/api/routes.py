"""HTTP endpoints. Business logic lives in app.services; the assistant lives in app.ai."""
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app import __version__
from app.ai.agent import answer
from app.ai.docs_index import load_index
from app.ai.provider import LLMProvider
from app.config import Settings
from app.errors import APIError
from app.schemas import (ChatRequest, ChatResponse, ChatStatus, ErrorResponse, Exceedance, Health, Overview, Page,
                         Reading, ReadingStatus, SensorInfo, SiteDetail, SiteSummary, Summary, Threshold)
from app.services import queries
from app.services.dataset import Dataset, load_dataset
from app.services.overview import build_overview
from app.services.reporting import build_summary

ERRORS = {404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, 503: {"model": ErrorResponse}}
router = APIRouter(responses=ERRORS)


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_dataset(settings: Annotated[Settings, Depends(get_settings)]) -> Dataset:
    return load_dataset(settings)


def get_llm(request: Request) -> LLMProvider | None:
    return request.app.state.llm


SettingsDep = Annotated[Settings, Depends(get_settings)]
DatasetDep = Annotated[Dataset, Depends(get_dataset)]
SiteQ = Annotated[str | None, Query(description="Site ID, e.g. S1")]
SensorQ = Annotated[str | None, Query(description="Sensor id (noise_dba) or sensor type (noise)")]
StartQ = Annotated[datetime | None, Query(description="Only readings at or after this ISO 8601 time")]
EndQ = Annotated[datetime | None, Query(description="Only readings at or before this ISO 8601 time")]
OrderQ = Annotated[queries.SortOrder, Query(description="asc or desc")]

NOT_CONFIGURED = ("SiteWatch AI is not configured. Set ANTHROPIC_API_KEY in the backend environment "
                  "(see backend/.env.example) and restart the API.")


@router.get("/health", response_model=Health, tags=["system"])
def health(ds: DatasetDep, settings: SettingsDep):
    """Liveness and data check. Returns 503 if the data files cannot be loaded."""
    return Health(status="ok", version=__version__, environment=settings.environment,
                  readings_loaded=len(ds.readings), sites_loaded=len(ds.sites),
                  thresholds_loaded=len(ds.thresholds), data_warnings=len(ds.warnings),
                  loaded_at=ds.loaded_at, ai_configured=settings.ai_configured)


@router.get("/api/overview", response_model=Overview, tags=["overview"])
def overview(ds: DatasetDep):
    """Dashboard data: totals, site statuses, sensor breakdown, trend series, recent alerts, validation."""
    return build_overview(ds)


@router.get("/api/sites", response_model=list[SiteSummary], tags=["sites"])
def list_sites(ds: DatasetDep):
    """Every site with its status and reading counts by classification."""
    return queries.list_sites(ds)


@router.get("/api/sites/{site_id}", response_model=SiteDetail, tags=["sites"])
def get_site(site_id: str, ds: DatasetDep):
    """One site with its readings grouped by sensor, limits, and exceedances."""
    return queries.site_detail(ds, site_id)


@router.get("/api/sensors", response_model=list[SensorInfo], tags=["sensors"])
def list_sensors(ds: DatasetDep):
    """Sensors present in the readings and the threshold rule applied to each."""
    return queries.list_sensors(ds)


@router.get("/api/thresholds", response_model=list[Threshold], tags=["sensors"])
def list_thresholds(ds: DatasetDep):
    return list(ds.thresholds.values())


@router.get("/api/readings", response_model=Page[Reading], tags=["readings"])
def list_readings(
    ds: DatasetDep, site_id: SiteQ = None, sensor: SensorQ = None,
    status: Annotated[ReadingStatus | None, Query(description="NORMAL, EXCEEDED or MISSING_DATA")] = None,
    start: StartQ = None, end: EndQ = None,
    q: Annotated[str | None, Query(max_length=100, description="Free-text search across site, sensor and status")] = None,
    sort: Annotated[queries.SortField, Query(description="timestamp, value, site or sensor")] = "timestamp",
    order: OrderQ = "asc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
):
    """Readings with filters, search, sorting and pagination. Missing values are null, never zero."""
    return queries.query_readings(ds, site_id=site_id, sensor=sensor, status=status, start=start, end=end, q=q,
                                  sort=sort, order=order, page=page, page_size=page_size)


@router.get("/api/exceedances", response_model=list[Exceedance], tags=["readings"])
def list_exceedances(ds: DatasetDep, site_id: SiteQ = None, sensor: SensorQ = None,
                     start: StartQ = None, end: EndQ = None, order: OrderQ = "asc"):
    """Confirmed threshold exceedances only (value > limit). Missing data is never included."""
    return queries.query_exceedances(ds, site_id=site_id, sensor=sensor, start=start, end=end, order=order)


@router.get("/api/summary", response_model=Summary, tags=["reports"])
def summary(ds: DatasetDep, site_id: SiteQ = None):
    """Totals, site-level alert counts, and a deterministic client-ready English report."""
    queries.check_site(ds, site_id)
    return build_summary(ds, site_id)


@router.get("/api/chat/status", response_model=ChatStatus, tags=["assistant"])
def chat_status(settings: SettingsDep, llm: Annotated[LLMProvider | None, Depends(get_llm)]):
    return ChatStatus(configured=llm is not None, provider=settings.ai_provider,
                      model=llm.model if llm else None,
                      message="SiteWatch AI is ready." if llm else NOT_CONFIGURED)


@router.post("/api/chat", response_model=ChatResponse, tags=["assistant"])
def chat(body: ChatRequest, ds: DatasetDep, settings: SettingsDep,
         llm: Annotated[LLMProvider | None, Depends(get_llm)]):
    """Ask SiteWatch AI a question about this project. Answers are grounded in read-only tools."""
    if llm is None:
        raise APIError(503, "AI_NOT_CONFIGURED", NOT_CONFIGURED)
    return answer(body, llm, ds, load_index(settings.docs_paths), settings.ai_max_iterations)
