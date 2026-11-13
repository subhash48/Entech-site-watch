"""Validated read-only queries over the dataset.

Both the HTTP routes and the AI assistant's tools call these functions, so the assistant
can only ever see exactly what the API returns.
"""
import math
from datetime import datetime
from typing import Literal

from app.errors import APIError
from app.schemas import (Exceedance, Page, Reading, ReadingStatus, SensorInfo, SiteDetail, SiteSensorGroup,
                         SiteSummary)
from app.services.dataset import Dataset
from app.services.readings import to_naive_utc
from app.services.reporting import site_summary, to_exceedance
from app.services.thresholds import find_threshold, sensor_label, sensor_type

SortField = Literal["timestamp", "value", "site", "sensor"]
SortOrder = Literal["asc", "desc"]


def check_site(ds: Dataset, site_id: str | None) -> None:
    if site_id and site_id not in ds.site_ids:
        raise APIError(404, "SITE_NOT_FOUND", f"Unknown site_id '{site_id}'.",
                       {"known_site_ids": sorted(ds.site_ids)})


def resolve_sensor(ds: Dataset, sensor: str | None) -> list[str] | None:
    """Accept an exact sensor id ('noise_dba') or a sensor type ('noise'). None = no filter."""
    if not sensor:
        return None
    s = sensor.strip().lower()
    matches = [x for x in ds.sensors if x == s] or [x for x in ds.sensors if sensor_type(x) == s]
    if not matches:
        raise APIError(404, "SENSOR_NOT_FOUND", f"Unknown sensor '{sensor}'.",
                       {"known_sensors": ds.sensors, "known_sensor_types": sorted({sensor_type(x) for x in ds.sensors})})
    return matches


def time_range(start: datetime | None, end: datetime | None) -> tuple[datetime | None, datetime | None]:
    start, end = (to_naive_utc(start) if start else None), (to_naive_utc(end) if end else None)
    if start and end and start > end:
        raise APIError(422, "INVALID_RANGE", "'start' must be earlier than or equal to 'end'.")
    return start, end


def _matches(r: Reading, q: str) -> bool:
    haystack = " ".join([r.site_id, r.site_name, r.sensor, r.sensor_label, r.status.value, r.raw_value]).lower()
    return all(term in haystack for term in q.lower().split())


def filter_readings(ds: Dataset, site_id: str | None = None, sensor: str | None = None,
                    status: ReadingStatus | None = None, start: datetime | None = None,
                    end: datetime | None = None, q: str | None = None) -> list[Reading]:
    check_site(ds, site_id)
    sensors = resolve_sensor(ds, sensor)
    start, end = time_range(start, end)
    return [r for r in ds.readings
            if (not site_id or r.site_id == site_id)
            and (sensors is None or r.sensor in sensors)
            and (not status or r.status == status)
            and (not start or (r.timestamp is not None and r.timestamp >= start))
            and (not end or (r.timestamp is not None and r.timestamp <= end))
            and (not q or _matches(r, q))]


def sort_readings(rows: list[Reading], sort: SortField = "timestamp", order: SortOrder = "asc") -> list[Reading]:
    """Rows missing the sort key (no timestamp / no value) always sort last."""
    key_of = {
        "timestamp": lambda r: r.timestamp,
        "value": lambda r: r.value,
        "site": lambda r: r.site_name.lower() or None,
        "sensor": lambda r: r.sensor or None,
    }[sort]
    present = [r for r in rows if key_of(r) is not None]
    absent = [r for r in rows if key_of(r) is None]
    present.sort(key=lambda r: (key_of(r), r.timestamp or datetime.min, r.site_id, r.sensor, r.id),
                 reverse=order == "desc")
    return present + absent


def paginate(rows: list[Reading], page: int, page_size: int) -> Page[Reading]:
    first = (page - 1) * page_size
    return Page[Reading](items=rows[first:first + page_size], total=len(rows), page=page, page_size=page_size,
                         total_pages=math.ceil(len(rows) / page_size))


def query_readings(ds: Dataset, *, site_id=None, sensor=None, status=None, start=None, end=None, q=None,
                   sort: SortField = "timestamp", order: SortOrder = "asc", page: int = 1,
                   page_size: int = 25) -> Page[Reading]:
    rows = filter_readings(ds, site_id, sensor, status, start, end, q)
    return paginate(sort_readings(rows, sort, order), page, page_size)


def query_exceedances(ds: Dataset, *, site_id=None, sensor=None, start=None, end=None,
                      order: SortOrder = "asc") -> list[Exceedance]:
    rows = filter_readings(ds, site_id, sensor, ReadingStatus.EXCEEDED, start, end)
    return [to_exceedance(r) for r in sort_readings(rows, "timestamp", order)]


def list_sites(ds: Dataset) -> list[SiteSummary]:
    return [site_summary(s, ds.readings) for s in ds.sites]


def site_detail(ds: Dataset, site_id: str) -> SiteDetail:
    check_site(ds, site_id)
    site = next(s for s in ds.sites if s.site_id == site_id)
    mine = [r for r in ds.readings if r.site_id == site_id]
    groups = []
    for sensor in sorted({r.sensor for r in mine if r.sensor}):
        rows = [r for r in mine if r.sensor == sensor]
        t = find_threshold(sensor, ds.thresholds)
        values = [r.value for r in rows if r.value is not None]
        groups.append(SiteSensorGroup(
            sensor=sensor, label=sensor_label(sensor, t.unit if t else None), threshold=t,
            readings=rows, exceeded_count=sum(r.status == ReadingStatus.EXCEEDED for r in rows),
            missing_data_count=sum(r.status == ReadingStatus.MISSING_DATA for r in rows),
            max_value=max(values, default=None),
        ))
    return SiteDetail(**site_summary(site, ds.readings).model_dump(), sensor_groups=groups,
                      exceedances=[to_exceedance(r) for r in mine if r.status == ReadingStatus.EXCEEDED])


def list_sensors(ds: Dataset) -> list[SensorInfo]:
    out = []
    for sensor in ds.sensors:
        t = find_threshold(sensor, ds.thresholds)
        out.append(SensorInfo(sensor=sensor, label=sensor_label(sensor, t.unit if t else None), threshold=t,
                              reading_count=sum(r.sensor == sensor for r in ds.readings)))
    return out
