"""Dashboard overview: totals, sensor breakdown, trend series, recent alerts, validation.

Accepts the same filters as /api/readings so every dashboard count follows the filter row.
"""
from datetime import datetime, timezone

from app.schemas import (DataSource, InvalidRow, Overview, ReadingStatus, SensorBreakdown, SensorTrend,
                         TrendPoint, Validation)
from app.services.dataset import Dataset, starter_info
from app.services.queries import filter_readings, sort_readings
from app.services.reporting import site_summary, to_exceedance, totals
from app.services.thresholds import find_threshold, sensor_label

STATIC_NOTE = ("Data is loaded from static readings.csv and thresholds.json files. "
               "It is not a live or real-time feed.")


def data_source(ds: Dataset) -> DataSource:
    info = ds.info or starter_info()
    if info.source == "starter":
        return DataSource(type="static_files", files=[info.readings_filename, info.thresholds_filename],
                          loaded_at=ds.loaded_at, note=STATIC_NOTE, dataset=info)
    note = (f"Data comes from uploaded dataset v{info.version} ('{info.name}'), stored as an immutable version. "
            "It is static uploaded data, not a live or real-time feed.")
    return DataSource(type="uploaded_dataset", files=[info.readings_filename, info.thresholds_filename],
                      loaded_at=ds.loaded_at, note=note, dataset=info)


def build_overview(ds: Dataset, site_id: str | None = None, sensor: str | None = None,
                   status: ReadingStatus | None = None, start: datetime | None = None,
                   end: datetime | None = None, recent_limit: int = 5) -> Overview:
    readings = filter_readings(ds, site_id, sensor, status, start, end)
    sites = [site_summary(s, readings) for s in ds.sites if not site_id or s.site_id == site_id]

    breakdown, trends = [], []
    for name in sorted({r.sensor for r in readings if r.sensor}):
        rows = [r for r in readings if r.sensor == name]
        t = find_threshold(name, ds.thresholds)
        label = sensor_label(name, t.unit if t else None)
        count = lambda s: sum(r.status == s for r in rows)
        breakdown.append(SensorBreakdown(
            sensor=name, label=label, unit=t.unit if t else None, threshold=t.limit if t else None,
            total=len(rows), normal=count(ReadingStatus.NORMAL), exceeded=count(ReadingStatus.EXCEEDED),
            missing_data=count(ReadingStatus.MISSING_DATA)))
        trends.append(SensorTrend(
            sensor=name, label=label, unit=t.unit if t else None, threshold=t.limit if t else None,
            points=[TrendPoint(reading_id=r.id, timestamp=r.timestamp, site_id=r.site_id, site_name=r.site_name,
                               value=r.value, status=r.status) for r in rows if r.timestamp]))

    exceeded = [r for r in readings if r.status == ReadingStatus.EXCEEDED]
    missing = [r for r in readings if r.status == ReadingStatus.MISSING_DATA]
    times = [r.timestamp for r in readings if r.timestamp]
    return Overview(
        generated_at=datetime.now(timezone.utc).replace(microsecond=0),
        data_source=data_source(ds),
        period_start=min(times, default=None), period_end=max(times, default=None),
        available_dates=sorted({r.timestamp.date() for r in ds.readings if r.timestamp}),
        totals=totals(sites, readings), sites=sites, sensor_breakdown=breakdown, trends=trends,
        recent_alerts=[to_exceedance(r) for r in sort_readings(exceeded, "timestamp", "desc")[:recent_limit]],
        validation=Validation(warnings=ds.warnings, invalid_rows=[
            InvalidRow(row=r.id, site_id=r.site_id, sensor=r.sensor, raw_timestamp=r.raw_timestamp,
                       raw_value=r.raw_value, issues=r.issues) for r in missing]),
    )

