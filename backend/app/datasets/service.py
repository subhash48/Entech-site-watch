"""Dataset service: the active dataset for every request, and validated uploads -> stored versions.

Every API endpoint and every assistant tool gets its data from `DatasetService.active_dataset()`:
- The active pointer is read from storage on each request, so all Vercel Function instances agree.
- Classified datasets are cached per immutable version id. A version never changes after it is
  stored, so a cached copy can never be stale; switching versions just changes which id is looked up.
- With nothing activated (or storage not configured) the committed starter files are used.
"""
import threading
from collections import OrderedDict
from dataclasses import replace
from datetime import datetime

from app.config import Settings
from app.datasets.models import (ActivationResponse, DatasetList, DatasetStats, DatasetVersion, PreviewResponse,
                                 StorageStatus, ValidationReport)
from app.datasets.preview import compare, dataset_from, preview_rows, stats_for
from app.datasets.store import STARTER_ID, DatasetStore, NewVersion, StorageError, VersionRecord, open_store
from app.datasets.validation import CurrentFiles, UploadedFile, ValidatedDataset, validate_dataset
from app.errors import APIError
from app.schemas import DatasetInfo
from app.services.dataset import Dataset, load_dataset, starter_info
from app.services.readings import to_naive_utc

CACHE_VERSIONS = 4


def new_version_from(validated: ValidatedDataset, name: str, actor: str) -> NewVersion:
    """Everything needed to store one validated upload. Only valid uploads can be stored."""
    if not validated.valid:
        raise ValueError("Only a dataset without blocking errors can be stored.")
    stats = stats_for(dataset_from(validated.rows, validated.thresholds))
    return NewVersion(
        name=name, created_by=actor,
        readings_filename=validated.readings_file.filename, thresholds_filename=validated.thresholds_file.filename,
        readings_sha256=validated.readings_file.sha256, thresholds_sha256=validated.thresholds_file.sha256,
        readings_csv=validated.readings_text, thresholds_json=validated.thresholds_text,
        stats=stats.model_dump(mode="json"), validation=validated.report.model_dump(mode="json"),
        rows=validated.rows, thresholds=validated.thresholds,
        measured_at={r.row_number: to_naive_utc(datetime.fromisoformat(r.timestamp)) for r in validated.rows},
        values={r.row_number: (float(r.value) if r.value else None) for r in validated.rows},
    )


def version_info(rec: VersionRecord, activated_at: datetime | None = None) -> DatasetInfo:
    return DatasetInfo(id=rec.id, version=rec.version, name=rec.name, source="upload", created_at=rec.created_at,
                       created_by=rec.created_by, activated_at=activated_at,
                       readings_filename=rec.readings_filename, thresholds_filename=rec.thresholds_filename)


def _upload_warnings(rec: VersionRecord) -> list[str]:
    """Validation warnings recorded at upload, as data-quality notes (missing values are listed per row
    elsewhere, so they are not repeated here)."""
    out = []
    for w in rec.validation.get("warnings", []):
        if w.get("code") == "MISSING_VALUE":
            continue
        rows = w.get("rows") or []
        where = f" (rows {', '.join(map(str, rows[:10]))}{'…' if w.get('count', 0) > 10 else ''})" if rows else ""
        examples = f": {'; '.join(w.get('examples', [])[:3])}" if w.get("examples") and not rows else ""
        out.append(f"{w.get('file')}: {w.get('message')}{where}{examples}")
    return out


class DatasetService:
    def __init__(self, settings: Settings, store: DatasetStore | None = None):
        self.settings = settings
        self.store = store or open_store(settings.database_url, settings.sqlite_path, settings.on_vercel)
        self._cache: OrderedDict[str, Dataset] = OrderedDict()
        self._lock = threading.Lock()

    # ---------- reads ----------

    def starter(self) -> Dataset:
        return load_dataset(self.settings)

    def active_dataset(self) -> Dataset:
        act = self.store.active()
        if act is None or act.dataset_id == STARTER_ID:
            return replace(self.starter(), info=starter_info(act.activated_at if act else None))
        return self.version_dataset(act.dataset_id, activated_at=act.activated_at)

    def version_dataset(self, dataset_id: str, activated_at: datetime | None = None) -> Dataset:
        """A stored version (or the starter) as a classified dataset."""
        if dataset_id == STARTER_ID:
            return replace(self.starter(), info=starter_info(activated_at))
        with self._lock:
            cached = self._cache.get(dataset_id)
            if cached:
                self._cache.move_to_end(dataset_id)
        if cached is None:
            rec = self.store.version(dataset_id)
            if rec is None:
                raise APIError(404, "DATASET_NOT_FOUND", f"Dataset '{dataset_id}' was not found.")
            rows, rules = self.store.contents(dataset_id)
            ds = dataset_from(rows, rules)
            cached = replace(ds, warnings=ds.warnings + _upload_warnings(rec), loaded_at=rec.created_at,
                             info=version_info(rec))
            with self._lock:
                self._cache[dataset_id] = cached
                while len(self._cache) > CACHE_VERSIONS:
                    self._cache.popitem(last=False)
        return replace(cached, info=cached.info.model_copy(update={"activated_at": activated_at}))

    def current_files(self) -> CurrentFiles:
        """Sources of the active dataset, reused when an upload contains only one file."""
        act = self.store.active()
        if act is None or act.dataset_id == STARTER_ID:
            return CurrentFiles("readings.csv", self.settings.readings_path.read_text(encoding="utf-8-sig"),
                                "thresholds.json", self.settings.thresholds_path.read_text(encoding="utf-8-sig"))
        rec = self.store.version(act.dataset_id)
        readings, thresholds = self.store.source_texts(act.dataset_id)
        return CurrentFiles(rec.readings_filename, readings, rec.thresholds_filename, thresholds)

    # ---------- versions ----------

    def storage_status(self) -> StorageStatus:
        return StorageStatus(mode=self.store.mode, writable=self.store.writable, message=self.store.message)

    def _require_writable(self) -> None:
        if not self.store.writable:
            raise APIError(503, "STORAGE_NOT_CONFIGURED", self.store.message)

    def _starter_version(self, active_id: str, activations: dict) -> DatasetVersion:
        ds = self.starter()
        return DatasetVersion(id=STARTER_ID, version=0, name=starter_info().name, source="starter", created_at=None,
                              created_by=None, readings_filename="readings.csv", thresholds_filename="thresholds.json",
                              readings_sha256=None, thresholds_sha256=None, stats=stats_for(ds),
                              warning_count=len(ds.warnings), is_active=active_id == STARTER_ID,
                              activated_at=activations.get(STARTER_ID))

    @staticmethod
    def _version(rec: VersionRecord, active_id: str, activations: dict) -> DatasetVersion:
        return DatasetVersion(id=rec.id, version=rec.version, name=rec.name, source="upload",
                              created_at=rec.created_at, created_by=rec.created_by,
                              readings_filename=rec.readings_filename, thresholds_filename=rec.thresholds_filename,
                              readings_sha256=rec.readings_sha256, thresholds_sha256=rec.thresholds_sha256,
                              stats=DatasetStats.model_validate(rec.stats),
                              warning_count=sum(w.get("count", 1) for w in rec.validation.get("warnings", [])),
                              is_active=rec.id == active_id, activated_at=activations.get(rec.id))

    def active_id(self) -> str:
        act = self.store.active()
        return act.dataset_id if act else STARTER_ID

    def list_versions(self) -> DatasetList:
        active_id = self.active_id()
        activations = self.store.last_activations()
        versions = [self._version(r, active_id, activations) for r in self.store.versions()]
        versions.append(self._starter_version(active_id, activations))
        return DatasetList(active_id=active_id, storage=self.storage_status(), versions=versions)

    def get_version(self, dataset_id: str) -> DatasetVersion:
        active_id, activations = self.active_id(), self.store.last_activations()
        if dataset_id == STARTER_ID:
            return self._starter_version(active_id, activations)
        rec = self.store.version(dataset_id)
        if rec is None:
            raise APIError(404, "DATASET_NOT_FOUND", f"Dataset '{dataset_id}' was not found.")
        return self._version(rec, active_id, activations)

    def validation_report(self, dataset_id: str) -> ValidationReport:
        if dataset_id == STARTER_ID:
            return validate_dataset(UploadedFile("readings.csv", self.settings.readings_path.read_bytes()),
                                    UploadedFile("thresholds.json", self.settings.thresholds_path.read_bytes()),
                                    None).report
        rec = self.store.version(dataset_id)
        if rec is None:
            raise APIError(404, "DATASET_NOT_FOUND", f"Dataset '{dataset_id}' was not found.")
        return ValidationReport.model_validate(rec.validation)

    # ---------- upload, preview, activation ----------

    def validate(self, readings: UploadedFile | None, thresholds: UploadedFile | None) -> ValidatedDataset:
        current = self.current_files() if readings is None or thresholds is None else None
        return validate_dataset(readings, thresholds, current)

    def preview(self, readings: UploadedFile | None, thresholds: UploadedFile | None) -> PreviewResponse:
        """Validate and evaluate without storing anything or changing the active dataset."""
        v = self.validate(readings, thresholds)
        if not v.valid:
            return PreviewResponse(validation=v.report, stats=None, comparison=None, preview_rows=[])
        proposed = dataset_from(v.rows, v.thresholds)
        active = self.active_dataset()
        label = f"v{active.info.version} · {active.info.name}"
        return PreviewResponse(validation=v.report, stats=stats_for(proposed),
                               comparison=compare(active, proposed, label), preview_rows=preview_rows(proposed))

    def create(self, readings: UploadedFile | None, thresholds: UploadedFile | None, name: str, actor: str,
               activate: bool) -> tuple[DatasetVersion, str, ValidationReport]:
        """Validate again (never trust an earlier preview), store an immutable version, and optionally make
        it active in the same transaction."""
        self._require_writable()
        v = self.validate(readings, thresholds)
        if not v.valid:
            raise APIError(422, "DATASET_INVALID", "The dataset has blocking validation errors and was not saved.",
                           v.report.model_dump(mode="json"))
        previous = self.active_id()
        try:
            rec = self.store.create(new_version_from(v, name, actor), activate=activate)
        except StorageError as e:
            raise APIError(503, "STORAGE_NOT_CONFIGURED", str(e)) from None
        return self.get_version(rec.id), previous, v.report

    def activate(self, dataset_id: str, actor: str) -> ActivationResponse:
        self._require_writable()
        try:
            previous = self.store.activate(dataset_id, actor)
        except ValueError:
            raise APIError(404, "DATASET_NOT_FOUND", f"Dataset '{dataset_id}' was not found.") from None
        version = self.get_version(dataset_id)
        return ActivationResponse(dataset=version, previous_active_id=previous,
                                  message=f"v{version.version} · {version.name} is now the active dataset.")
