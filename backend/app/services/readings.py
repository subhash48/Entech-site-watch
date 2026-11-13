"""Load readings.csv, validate each row, and classify it against its sensor's threshold."""
import csv
import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.errors import DataLoadError
from app.schemas import Reading, ReadingStatus, Threshold
from app.services.thresholds import find_threshold, sensor_label

REQUIRED_COLUMNS = ("site_id", "site_name", "sensor", "timestamp", "value")
SITE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
SENSOR_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


@dataclass(frozen=True)
class RawRow:
    row_number: int
    site_id: str
    site_name: str
    sensor: str
    timestamp: str
    value: str


def to_naive_utc(dt: datetime) -> datetime:
    """Timezone-aware timestamps are converted to UTC so all comparisons are consistent."""
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


def load_rows(path: Path) -> list[RawRow]:
    try:
        f = open(path, newline="", encoding="utf-8-sig")  # utf-8-sig tolerates Excel's BOM
    except FileNotFoundError:
        raise DataLoadError(f"Readings file not found: {path.name}") from None
    with f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise DataLoadError(f"Readings file {path.name} is empty.")
        reader.fieldnames = [name.strip().lower() for name in reader.fieldnames]
        missing = [c for c in REQUIRED_COLUMNS if c not in reader.fieldnames]
        if missing:
            raise DataLoadError(f"Readings file {path.name} is missing required column(s): {', '.join(missing)}.")
        return [RawRow(row_number=i, **{c: (row.get(c) or "").strip() for c in REQUIRED_COLUMNS})
                for i, row in enumerate(reader, start=2)]


def evaluate_row(row: RawRow, lookup: dict[str, Threshold], site_name: str) -> Reading:
    """Validate one row and classify it as NORMAL, EXCEEDED or MISSING_DATA.

    Any problem (bad site id, bad sensor name, bad timestamp, blank/invalid value, or no
    threshold) makes the reading MISSING_DATA with the reason in `issues`. A blank value
    stays null and is never treated as zero.
    """
    issues: list[str] = []

    if not row.site_id:
        issues.append("Site ID is blank")
    elif not SITE_ID_RE.match(row.site_id):
        issues.append(f"Site ID '{row.site_id}' is not valid")

    sensor = row.sensor.lower()
    threshold = None
    if not sensor:
        issues.append("Sensor name is blank")
    elif not SENSOR_RE.match(sensor):
        issues.append(f"Sensor name '{row.sensor}' is not valid")
    else:
        threshold = find_threshold(sensor, lookup)
        if threshold is None:
            issues.append(f"No threshold configured for sensor '{sensor}'")

    timestamp = None
    if not row.timestamp:
        issues.append("Timestamp is blank")
    else:
        try:
            timestamp = to_naive_utc(datetime.fromisoformat(row.timestamp))
        except ValueError:
            issues.append(f"Timestamp '{row.timestamp}' is not a valid ISO 8601 date-time")

    value = None
    if not row.value:
        issues.append("Value is blank")
    else:
        try:
            value = float(row.value)
            if not math.isfinite(value):
                raise ValueError
            if value < 0:
                issues.append(f"Value {row.value} is negative, which is not a valid measurement")
        except ValueError:
            value = None
            issues.append(f"Value '{row.value}' is not a number")

    if issues:
        status, exceeded_by = ReadingStatus.MISSING_DATA, None
    elif value > threshold.limit:  # strictly greater: a value at the limit is NORMAL
        status, exceeded_by = ReadingStatus.EXCEEDED, round(value - threshold.limit, 6)
    else:
        status, exceeded_by = ReadingStatus.NORMAL, None

    unit = threshold.unit if threshold else None
    return Reading(
        id=row.row_number, site_id=row.site_id, site_name=site_name, sensor=sensor,
        sensor_label=sensor_label(sensor, unit) if sensor else "Unknown sensor",
        timestamp=timestamp, raw_timestamp=row.timestamp, value=value, raw_value=row.value,
        threshold=threshold.limit if threshold else None, unit=unit,
        threshold_source=threshold.sensor if threshold else None,
        status=status, exceeded_by=exceeded_by, issues=issues,
    )
