"""Statistics, preview rows and comparisons for datasets (proposed or stored)."""
from app.datasets.models import DatasetComparison, DatasetStats, MetricChange, ThresholdChange
from app.schemas import Reading, ReadingStatus
from app.services.dataset import Dataset, assemble_dataset
from app.services.readings import RawRow
from app.services.thresholds import parse_thresholds, sensor_type

PREVIEW_ROWS = 25


def dataset_from(rows: list[RawRow], thresholds: dict[str, dict]) -> Dataset:
    lookup, warnings = parse_thresholds(thresholds)
    return assemble_dataset(rows, lookup, warnings)


def stats_for(ds: Dataset) -> DatasetStats:
    count = lambda s: sum(r.status == s for r in ds.readings)
    times = [r.timestamp for r in ds.readings if r.timestamp]
    normal, exceeded = count(ReadingStatus.NORMAL), count(ReadingStatus.EXCEEDED)
    return DatasetStats(
        total_rows=len(ds.readings), valid_readings=normal + exceeded, normal_readings=normal,
        exceeded_readings=exceeded, missing_readings=count(ReadingStatus.MISSING_DATA),
        sites=len(ds.sites), site_ids=sorted(ds.site_ids), sensors=ds.sensors,
        sensor_categories=sorted({sensor_type(s) for s in ds.sensors}), thresholds=len(ds.thresholds),
        period_start=min(times, default=None), period_end=max(times, default=None))


def preview_rows(ds: Dataset, limit: int = PREVIEW_ROWS) -> list[Reading]:
    """The first rows in file order, classified exactly as the dashboard would show them."""
    return sorted(ds.readings, key=lambda r: r.id)[:limit]


METRICS = [("total_rows", "Total rows"), ("valid_readings", "Valid readings"), ("normal_readings", "Normal"),
           ("exceeded_readings", "Exceedances"), ("missing_readings", "Missing readings"), ("sites", "Sites"),
           ("thresholds", "Threshold rules")]


def _rule(ds: Dataset, sensor: str) -> str | None:
    t = ds.thresholds.get(sensor)
    return f"{t.limit:g} {t.unit}".strip() if t else None


def compare(current: Dataset, proposed: Dataset, against: str) -> DatasetComparison:
    a, b = stats_for(current), stats_for(proposed)
    metrics = [MetricChange(metric=m, label=label, current=getattr(a, m), proposed=getattr(b, m),
                            change=getattr(b, m) - getattr(a, m)) for m, label in METRICS]
    changes = []
    for sensor in sorted(set(current.thresholds) | set(proposed.thresholds)):
        old, new = _rule(current, sensor), _rule(proposed, sensor)
        if old != new:
            kind = "added" if old is None else "removed" if new is None else "changed"
            changes.append(ThresholdChange(sensor=sensor, change=kind, current=old, proposed=new))
    return DatasetComparison(
        against=against, metrics=metrics,
        sites_added=sorted(set(b.site_ids) - set(a.site_ids)), sites_removed=sorted(set(a.site_ids) - set(b.site_ids)),
        sensors_added=sorted(set(b.sensors) - set(a.sensors)), sensors_removed=sorted(set(a.sensors) - set(b.sensors)),
        threshold_changes=changes)
