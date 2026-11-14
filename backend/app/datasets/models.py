"""API models for dataset upload, validation, preview, versions and activation."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas import Reading

FileKind = Literal["readings.csv", "thresholds.json"]


class ValidationIssue(BaseModel):
    level: Literal["error", "warning"] = Field(description="error blocks activation; warning does not")
    code: str = Field(description="Stable machine-readable code, e.g. INVALID_TIMESTAMP")
    file: FileKind
    message: str
    rows: list[int] = Field(default_factory=list, description="Offending CSV row numbers (header is row 1); "
                                                              "at most 25 are listed")
    count: int = Field(1, description="How many rows or entries have this problem")
    examples: list[str] = Field(default_factory=list, description="Up to 5 short examples, e.g. \"row 7: 'abc'\"")


class FileInfo(BaseModel):
    kind: FileKind
    filename: str = Field(description="Sanitized display name; never used as a filesystem path")
    size_bytes: int
    sha256: str
    source: Literal["uploaded", "active_dataset"] = Field(
        description="uploaded in this request, or reused from the active dataset")


class ValidationReport(BaseModel):
    valid: bool = Field(description="True when there are no blocking errors")
    errors: list[ValidationIssue]
    warnings: list[ValidationIssue]
    files: list[FileInfo]
    limits: dict[str, int] = Field(description="Upload limits applied (bytes and rows)")


class DatasetStats(BaseModel):
    total_rows: int
    valid_readings: int = Field(description="Readings with a measured value that could be evaluated")
    normal_readings: int
    exceeded_readings: int
    missing_readings: int = Field(description="MISSING_DATA: blank measurements (kept as null, never zero)")
    sites: int
    site_ids: list[str]
    sensors: list[str]
    sensor_categories: list[str] = Field(description="Sensor types, e.g. vibration, noise, dust")
    thresholds: int
    period_start: datetime | None
    period_end: datetime | None


class MetricChange(BaseModel):
    metric: str
    label: str
    current: float | int | None
    proposed: float | int | None
    change: float | int | None


class ThresholdChange(BaseModel):
    sensor: str
    change: Literal["added", "removed", "changed"]
    current: str | None = Field(description="e.g. '85 dBA'")
    proposed: str | None


class DatasetComparison(BaseModel):
    against: str = Field(description="Label of the dataset compared with, e.g. 'v2 · Week 46 upload'")
    metrics: list[MetricChange]
    sites_added: list[str]
    sites_removed: list[str]
    sensors_added: list[str]
    sensors_removed: list[str]
    threshold_changes: list[ThresholdChange]


class PreviewResponse(BaseModel):
    validation: ValidationReport
    stats: DatasetStats | None = Field(description="Null when blocking errors prevent evaluation")
    comparison: DatasetComparison | None
    preview_rows: list[Reading] = Field(description="First rows as they would be classified")
    activated: Literal[False] = Field(False, description="A preview never changes the active dataset")


class DatasetVersion(BaseModel):
    id: str
    version: int = Field(description="0 is the read-only starter dataset committed with the app")
    name: str
    source: Literal["starter", "upload"]
    created_at: datetime | None
    created_by: str | None
    readings_filename: str
    thresholds_filename: str
    readings_sha256: str | None
    thresholds_sha256: str | None
    stats: DatasetStats
    warning_count: int
    is_active: bool
    activated_at: datetime | None = Field(None, description="When it last became active")


class StorageStatus(BaseModel):
    mode: Literal["postgres", "sqlite", "none"]
    writable: bool
    message: str


class DatasetList(BaseModel):
    active_id: str
    storage: StorageStatus
    versions: list[DatasetVersion] = Field(description="Newest first; the starter dataset is always last")


class ActivationResponse(BaseModel):
    dataset: DatasetVersion
    previous_active_id: str
    message: str
