"""Dataset management endpoints.

Reads (list, active) are public metadata. Upload preview, storage, activation and stored validation
reports require an administrator. The AI assistant has no access to any of these routes or the
service methods behind them: its tools only read the active dataset.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Path, Request, Response, UploadFile
from pydantic import BaseModel, Field

from app.auth import (AdminSession, LoginThrottle, admin_configured, clear_session_cookie, client_address,
                      current_admin, require_admin, set_session_cookie, sign_session, token_matches)
from app.config import Settings
from app.datasets import validation as limits
from app.datasets.models import (ActivationResponse, DatasetList, DatasetVersion, PreviewResponse, StorageStatus,
                                 ValidationReport)
from app.datasets.service import DatasetService
from app.datasets.validation import UploadedFile
from app.errors import APIError
from app.schemas import ErrorResponse

ERRORS = {401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse},
          413: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, 503: {"model": ErrorResponse}}
router = APIRouter(responses=ERRORS)
throttle = LoginThrottle()
DATASET_ID = r"^(starter|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$"
DatasetId = Annotated[str, Path(pattern=DATASET_ID, description="Dataset id, or 'starter'")]


def settings_of(request: Request) -> Settings:
    return request.app.state.settings


def service_of(request: Request) -> DatasetService:
    return request.app.state.datasets


def admin_reader(request: Request) -> AdminSession:
    return require_admin(request, settings_of(request), write=False)


def admin_writer(request: Request) -> AdminSession:
    return require_admin(request, settings_of(request), write=True)


Service = Annotated[DatasetService, Depends(service_of)]
AdminRead = Annotated[AdminSession, Depends(admin_reader)]
AdminWrite = Annotated[AdminSession, Depends(admin_writer)]


async def _read(upload: UploadFile | None, max_bytes: int) -> UploadedFile | None:
    """Read at most max_bytes + 1 so an oversized file is detected without holding all of it."""
    if upload is None or not upload.filename:
        return None
    data = await upload.read(max_bytes + 1)
    return UploadedFile(upload.filename, data)


async def _files(readings: UploadFile | None, thresholds: UploadFile | None):
    r = await _read(readings, limits.MAX_READINGS_BYTES)
    t = await _read(thresholds, limits.MAX_THRESHOLDS_BYTES)
    for f, kind, cap in ((r, "readings.csv", limits.MAX_READINGS_BYTES), (t, "thresholds.json", limits.MAX_THRESHOLDS_BYTES)):
        if f is not None and len(f.data) > cap:
            raise APIError(413, "FILE_TOO_LARGE", f"{kind} is larger than the {cap // 1024} KB limit.",
                           {"file": kind, "limit_bytes": cap})
    return r, t


ReadingsFile = Annotated[UploadFile | None, File(description="readings.csv (optional: reuse the active one)")]
ThresholdsFile = Annotated[UploadFile | None, File(description="thresholds.json (optional: reuse the active one)")]


# ---------- admin session ----------

class SignIn(BaseModel):
    model_config = {"extra": "forbid"}
    token: str = Field(min_length=1, max_length=512)


class AdminStatus(BaseModel):
    admin_configured: bool
    authenticated: bool
    expires_at: int | None = Field(None, description="Unix time when the session ends")
    storage: StorageStatus


@router.get("/api/admin/session", response_model=AdminStatus, tags=["admin"])
def session_status(request: Request, svc: Service):
    settings = settings_of(request)
    s = current_admin(request, settings)
    return AdminStatus(admin_configured=admin_configured(settings), authenticated=s is not None,
                       expires_at=s.expires_at if s and s.expires_at else None, storage=svc.storage_status())


@router.post("/api/admin/session", response_model=AdminStatus, tags=["admin"])
def sign_in(body: SignIn, request: Request, response: Response, svc: Service):
    settings = settings_of(request)
    if not admin_configured(settings):
        raise APIError(503, "ADMIN_NOT_CONFIGURED", "Dataset management is disabled: ADMIN_TOKEN is not configured "
                                                    "on the server.")
    client = client_address(request)
    throttle.check(client)
    if not token_matches(settings, body.token):
        throttle.fail(client)
        raise APIError(401, "INVALID_ADMIN_TOKEN", "That admin access token is not valid.")
    throttle.clear(client)
    value, expires = sign_session(settings)
    set_session_cookie(response, request, settings, value)
    return AdminStatus(admin_configured=True, authenticated=True, expires_at=expires, storage=svc.storage_status())


@router.delete("/api/admin/session", response_model=AdminStatus, tags=["admin"])
def sign_out(request: Request, response: Response, svc: Service):
    settings = settings_of(request)
    clear_session_cookie(response, request, settings)
    return AdminStatus(admin_configured=admin_configured(settings), authenticated=False, storage=svc.storage_status())


# ---------- datasets ----------

@router.get("/api/datasets", response_model=DatasetList, tags=["datasets"])
def list_datasets(svc: Service):
    """Dataset history, newest first, with the read-only starter dataset last."""
    return svc.list_versions()


@router.get("/api/datasets/active", response_model=DatasetVersion, tags=["datasets"])
def active_dataset(svc: Service):
    return svc.get_version(svc.active_id())


@router.post("/api/datasets/preview", response_model=PreviewResponse, tags=["datasets"])
async def preview_dataset(svc: Service, _: AdminWrite, readings: ReadingsFile = None,
                          thresholds: ThresholdsFile = None):
    """Validate and evaluate uploaded files and compare them with the active dataset. Nothing is stored
    and the active dataset does not change. Invalid files return 200 with `validation.valid = false`."""
    r, t = await _files(readings, thresholds)
    return svc.preview(r, t)


class CreateResponse(BaseModel):
    dataset: DatasetVersion
    activated: bool
    previous_active_id: str
    validation: ValidationReport
    message: str


@router.post("/api/datasets", response_model=CreateResponse, status_code=201, tags=["datasets"])
async def create_dataset(svc: Service, admin: AdminWrite, readings: ReadingsFile = None,
                         thresholds: ThresholdsFile = None,
                         name: Annotated[str, Form(max_length=80)] = "",
                         activate: Annotated[bool, Form()] = True):
    """Validate (again, server-side), store an immutable version and, by default, activate it atomically."""
    r, t = await _files(readings, thresholds)
    label = " ".join(name.split())[:80] or None
    version, previous, report = svc.create(r, t, label or "Uploaded dataset", admin.actor, activate)
    msg = (f"v{version.version} · {version.name} was saved and is now active." if activate
           else f"v{version.version} · {version.name} was saved. The active dataset did not change.")
    return CreateResponse(dataset=version, activated=activate, previous_active_id=previous, validation=report,
                          message=msg)


@router.post("/api/datasets/{dataset_id}/activate", response_model=ActivationResponse, tags=["datasets"])
def activate_dataset(dataset_id: DatasetId, svc: Service, admin: AdminWrite):
    """Make a stored version (or the starter dataset) active, e.g. to roll back."""
    return svc.activate(dataset_id, admin.actor)


@router.get("/api/datasets/{dataset_id}/validation", response_model=ValidationReport, tags=["datasets"])
def dataset_validation(dataset_id: DatasetId, svc: Service, _: AdminRead):
    """The validation report recorded when the version was uploaded."""
    return svc.validation_report(dataset_id)
