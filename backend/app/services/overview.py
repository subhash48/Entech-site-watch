"""Dashboard overview: totals, sensor breakdown, trend series, recent alerts, validation."""
from datetime import datetime, timezone

from app.schemas import (DataSource, InvalidRow, Overview, ReadingStatus, SensorBreakdown, SensorTrend,
                         TrendPoint, Validation)
from app.services.dataset import Dataset
from app.services.queries import list_sites, query_exceedances
from app.services.reporting import totals
from app.services.thresholds import find_threshold, sensor_label

STATIC_NOTE = ("Data is loaded from static readings.csv and thresholds.json files. "
               "It is not a live or real-time feed.")


def build_overview(ds: Dataset, recent_limit: int = 5) -> Overview:
    sites = list_sites(ds)
    breakdown, trends = [], []
    for sensor in ds.sensors:
        rows = [r for r in ds.readings if r.sensor == sensor]
        t = find_threshold(sensor, ds.thresholds)
        label = sensor_label(sensor, t.unit if t else None)
        count = lambda status: sum(r.status == status for r in rows)
        breakdown.append(SensorBreakdown(
            sensor=sensor, label=label, unit=t.unit if t else None, threshold=t.limit if t else None,
            total=len(rows), normal=count(ReadingStatus.NORMAL), exceeded=count(ReadingStatus.EXCEEDED),
            missing_data=count(ReadingStatus.MISSING_DATA)))
        trends.append(SensorTrend(
            sensor=sensor, label=label, unit=t.unit if t else None, threshold=t.limit if t else None,
            points=[TrendPoint(reading_id=r.id, timestamp=r.timestamp, site_id=r.site_id, site_name=r.site_name,
                               value=r.value, status=r.status) for r in rows if r.timestamp]))

    missing = [r for r in ds.readings if r.status == ReadingStatus.MISSING_DATA]
    times = [r.timestamp for r in ds.readings if r.timestamp]
    return Overview(
        generated_at=datetime.now(timezone.utc).replace(microsecond=0),
        data_source=DataSource(files=["readings.csv", "thresholds.json"], loaded_at=ds.loaded_at, note=STATIC_NOTE),
        period_start=min(times, default=None), period_end=max(times, default=None),
        totals=totals(sites, ds.readings), sites=sites, sensor_breakdown=breakdown, trends=trends,
        recent_alerts=query_exceedances(ds, order="desc")[:recent_limit],
        validation=Validation(warnings=ds.warnings, invalid_rows=[
            InvalidRow(row=r.id, site_id=r.site_id, sensor=r.sensor, raw_timestamp=r.raw_timestamp,
                       raw_value=r.raw_value, issues=r.issues) for r in missing]),
    )
