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
from app.datasets.preview import dataset_from, stats_for
from app.datasets.store import STARTER_ID, DatasetStore, NewVersion, VersionRecord, open_store
from app.datasets.validation import CurrentFiles, ValidatedDataset
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
