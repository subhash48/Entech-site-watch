"""The evaluated dataset, cached in memory and reloaded when either source file changes."""
import threading
from dataclasses import dataclass
from datetime import datetime, timezone

from app.config import Settings
from app.errors import DataLoadError
from app.schemas import Reading, Site, Threshold
from app.services.readings import SITE_ID_RE, evaluate_row, load_rows
from app.services.thresholds import load_thresholds


@dataclass(frozen=True)
class Dataset:
    readings: list[Reading]           # every CSV row, sorted by time; nothing is dropped
    sites: list[Site]
    thresholds: dict[str, Threshold]
    warnings: list[str]               # file-level problems (threshold config, site names)
    loaded_at: datetime

    @property
    def site_ids(self) -> set[str]:
        return {s.site_id for s in self.sites}

    @property
    def sensors(self) -> list[str]:
        return sorted({r.sensor for r in self.readings if r.sensor})


def build_dataset(settings: Settings) -> Dataset:
    lookup, warnings = load_thresholds(settings.thresholds_path)
    rows = load_rows(settings.readings_path)

    names: dict[str, str] = {}
    for row in rows:
        if not row.site_id:
            continue
        if not row.site_name:
            warnings.append(f"Row {row.row_number}: site name is blank; using site ID '{row.site_id}'.")
        elif row.site_id not in names:
            names[row.site_id] = row.site_name
        elif names[row.site_id] != row.site_name:
            warnings.append(f"Row {row.row_number}: site {row.site_id} is named '{row.site_name}', "
                            f"but earlier rows use '{names[row.site_id]}'.")

    readings = [evaluate_row(r, lookup, names.get(r.site_id) or r.site_id or "Unknown site") for r in rows]
    readings.sort(key=lambda r: (r.timestamp is None, r.timestamp or datetime.min, r.site_id, r.sensor, r.id))
    site_ids = sorted({r.site_id for r in readings if SITE_ID_RE.match(r.site_id)})
    sites = [Site(site_id=s, site_name=names.get(s, s)) for s in site_ids]
    return Dataset(readings=readings, sites=sites, thresholds=lookup, warnings=warnings,
                   loaded_at=datetime.now(timezone.utc).replace(microsecond=0))


_cache: dict[tuple, tuple[tuple, Dataset]] = {}
_lock = threading.Lock()


def _stamp(settings: Settings) -> tuple:
    try:
        return tuple((p.stat().st_mtime_ns, p.stat().st_size)
                     for p in (settings.readings_path, settings.thresholds_path))
    except FileNotFoundError as e:
        raise DataLoadError(f"Data file not found: {e.filename}") from None


def load_dataset(settings: Settings) -> Dataset:
    """Return the cached dataset, rebuilding it if readings.csv or thresholds.json changed."""
    key = (settings.readings_path, settings.thresholds_path)
    stamp = _stamp(settings)
    with _lock:
        cached = _cache.get(key)
        if cached and cached[0] == stamp:
            return cached[1]
        dataset = build_dataset(settings)
        _cache[key] = (stamp, dataset)
        return dataset
