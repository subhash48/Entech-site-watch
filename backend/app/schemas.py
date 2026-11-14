"""API response models."""
from datetime import date, datetime
from enum import Enum
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, Field, model_validator

T = TypeVar("T")


class ReadingStatus(str, Enum):
    NORMAL = "NORMAL"              # value at or below its threshold
    EXCEEDED = "EXCEEDED"          # value strictly above its threshold
    MISSING_DATA = "MISSING_DATA"  # blank/invalid data or no threshold: not evaluated


class SiteStatus(str, Enum):
    ALERT = "ALERT"                # at least one exceedance
    NEEDS_REVIEW = "NEEDS_REVIEW"  # no exceedances, but some readings could not be evaluated
    OK = "OK"


class Threshold(BaseModel):
    sensor: str = Field(description="Key in thresholds.json: a sensor id (noise_dba) or type (noise)")
    limit: float
    unit: str


class Site(BaseModel):
    site_id: str
    site_name: str


class Reading(BaseModel):
    id: int = Field(description="Row number in readings.csv (the header is row 1)")
    site_id: str
    site_name: str
    sensor: str
    sensor_label: str
    timestamp: datetime | None
    raw_timestamp: str
    value: float | None = Field(description="Null when the value is blank or invalid, never zero")
    raw_value: str
    threshold: float | None
    unit: str | None
    threshold_source: str | None = Field(description="thresholds.json key that was applied")
    status: ReadingStatus
    exceeded_by: float | None = None
    issues: list[str] = Field(default_factory=list)


class SiteSummary(Site):
    status: SiteStatus
    total_readings: int
    normal_count: int
    exceeded_count: int
    missing_data_count: int
    sensors: list[str]
    first_reading_at: datetime | None
    last_reading_at: datetime | None
    last_exceedance_at: datetime | None


class SiteSensorGroup(BaseModel):
    sensor: str
    label: str
    threshold: Threshold | None
    readings: list[Reading]
    exceeded_count: int
    missing_data_count: int
    max_value: float | None


class SensorInfo(BaseModel):
    sensor: str
    label: str
    threshold: Threshold | None
    reading_count: int


class Exceedance(BaseModel):
    reading_id: int
    site_id: str
    site_name: str
    sensor: str
    sensor_label: str
    timestamp: datetime
    value: float
    threshold: float
    unit: str
    exceeded_by: float
    exceeded_by_pct: float | None = Field(description="Percent over the limit; null when the limit is 0")
    severity: Literal["high", "medium", "low"] = Field(
        description="Display priority derived from percent over the limit: high >= 20%, medium >= 5%, low < 5%. "
                    "Not a regulatory classification.")


class SiteDetail(SiteSummary):
    sensor_groups: list[SiteSensorGroup]
    exceedances: list[Exceedance]


class SensorBreakdown(BaseModel):
    sensor: str
    label: str
    unit: str | None
    threshold: float | None
    total: int
    normal: int
    exceeded: int
    missing_data: int


class TrendPoint(BaseModel):
    reading_id: int
    timestamp: datetime
    site_id: str
    site_name: str
    value: float | None = Field(description="Null for missing data, so charts show a gap rather than zero")
    status: ReadingStatus


class SensorTrend(BaseModel):
    sensor: str
    label: str
    unit: str | None
    threshold: float | None
    points: list[TrendPoint]


class InvalidRow(BaseModel):
    row: int
    site_id: str
    sensor: str
    raw_timestamp: str
    raw_value: str
    issues: list[str]


class Validation(BaseModel):
    warnings: list[str] = Field(description="File-level problems, e.g. a threshold entry with no limit")
    invalid_rows: list[InvalidRow] = Field(description="Rows classified MISSING_DATA and why")


class DatasetInfo(BaseModel):
    """The dataset every endpoint and the assistant are currently using."""
    id: str = Field(description="'starter' for the read-only dataset committed with the app")
    version: int = Field(description="0 = starter; uploads are numbered 1, 2, 3, ...")
    name: str
    source: Literal["starter", "upload"]
    status: Literal["active"] = "active"
    created_at: datetime | None = Field(None, description="Upload time (null for the starter dataset)")
    created_by: str | None = None
    activated_at: datetime | None = Field(None, description="When this version became active")
    readings_filename: str
    thresholds_filename: str


class DataSource(BaseModel):
    type: Literal["static_files", "uploaded_dataset"] = "static_files"
    files: list[str]
    loaded_at: datetime
    note: str
    dataset: DatasetInfo


class Overview(BaseModel):
    generated_at: datetime
    data_source: DataSource
    period_start: datetime | None
    period_end: datetime | None
    available_dates: list[date] = Field(description="Every date with readings in the full dataset (filter options)")
    totals: "Totals"
    sites: list[SiteSummary]
    sensor_breakdown: list[SensorBreakdown]
    trends: list[SensorTrend]
    recent_alerts: list[Exceedance]
    validation: Validation


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int


class Totals(BaseModel):
    total_sites: int
    total_readings: int
    normal_readings: int
    exceeded_readings: int
    missing_data_readings: int
    sites_with_alerts: int


class Summary(BaseModel):
    generated_at: datetime
    scope: str
    period_start: datetime | None
    period_end: datetime | None
    totals: Totals
    sites: list[SiteSummary]
    exceedances: list[Exceedance]
    data_quality: list[str]
    report: str = Field(description="Client-ready plain-text report")


class Health(BaseModel):
    status: Literal["ok"]
    version: str
    environment: str
    readings_loaded: int
    sites_loaded: int
    thresholds_loaded: int
    data_warnings: int
    loaded_at: datetime
    ai_configured: bool
    dataset: DatasetInfo
    storage: Literal["postgres", "sqlite", "none"] = Field(description="Where uploaded datasets are stored")


# ---------- AI assistant ----------

class ChatMessage(BaseModel):
    model_config = {"extra": "forbid"}
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)

    @model_validator(mode="after")
    def _limit_user_length(self):
        if self.role == "user" and len(self.content) > 4000:
            raise ValueError("User messages are limited to 4000 characters.")
        return self


class ChatRequest(BaseModel):
    model_config = {"extra": "forbid"}
    messages: list[ChatMessage] = Field(min_length=1, max_length=20,
                                        description="Session history, oldest first; the last must be from the user")


class Source(BaseModel):
    type: Literal["data", "doc"]
    name: str = Field(description="e.g. readings.csv, thresholds.json, or 'README.md › Monitoring methodology'")


class ToolCallRecord(BaseModel):
    name: str
    arguments: dict[str, Any]
    ok: bool


class ChatResponse(BaseModel):
    answer: str
    sources: list[Source]
    tool_calls: list[ToolCallRecord]
    refused: bool = Field(description="True when the question was outside SiteWatch's scope")
    model: str | None


class ChatStatus(BaseModel):
    configured: bool
    provider: str
    model: str | None
    message: str


class ErrorBody(BaseModel):
    code: str
    message: str
    details: Any = None


class ErrorResponse(BaseModel):
    error: ErrorBody


Overview.model_rebuild()
