"""Server-side validation of uploaded readings.csv and thresholds.json.

Uploaded content is untrusted. It is decoded, parsed and checked in memory only: nothing is
written to disk, and the uploaded filename is used for display alone, never as a path.

Blocking errors prevent storage and activation. Warnings are reported but do not block. A blank
measurement is not an error: the reading is kept with a null value and classified MISSING_DATA,
never zero.
"""
import csv
import hashlib
import io
import json
import math
import re
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime

from app.datasets.models import FileInfo, ValidationIssue, ValidationReport
from app.services.readings import REQUIRED_COLUMNS, SENSOR_RE, SITE_ID_RE, RawRow, to_naive_utc
from app.services.thresholds import find_threshold, parse_thresholds, sensor_type

# Vercel Functions accept request bodies up to 4.5 MB, so both files together must stay below that.
MAX_READINGS_BYTES = 4 * 1024 * 1024
MAX_THRESHOLDS_BYTES = 64 * 1024
MAX_ROWS = 50_000
MAX_LISTED_ROWS = 25
MAX_EXAMPLES = 5

READINGS, THRESHOLDS = "readings.csv", "thresholds.json"
NUMBER_RE = re.compile(r"^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$")
NON_FINITE_RE = re.compile(r"^[+-]?(nan|inf|infinity)$", re.I)
SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._() -]+")
MAX_UNIT_LENGTH = 32
# Units we expect per sensor type; anything else is a warning, not an error.
EXPECTED_UNITS = {"vibration": {"in/s", "mm/s"}, "noise": {"dba", "db", "db(a)"},
                  "dust": {"ug/m3", "µg/m3", "µg/m³", "ug/m³", "mg/m3"}}


@dataclass(frozen=True)
class UploadedFile:
    filename: str
    data: bytes


@dataclass(frozen=True)
class CurrentFiles:
    """The active dataset's sources, reused when only one file is uploaded."""
    readings_filename: str
    readings_text: str
    thresholds_filename: str
    thresholds_text: str


@dataclass
class ValidatedDataset:
    report: ValidationReport
    rows: list[RawRow]                       # accepted rows (exact duplicates removed); [] when invalid
    thresholds: dict[str, dict]              # {sensor: {"limit": float, "unit": str}}
    readings_text: str
    thresholds_text: str
    readings_file: FileInfo
    thresholds_file: FileInfo

    @property
    def valid(self) -> bool:
        return self.report.valid


class _Issues:
    """Groups repeated problems so a 50,000-row file yields a readable report, not 50,000 lines."""

    def __init__(self):
        self._groups: OrderedDict[tuple, dict] = OrderedDict()

    def add(self, level: str, code: str, file: str, message: str, row: int | None = None,
            example: str | None = None) -> None:
        g = self._groups.setdefault((level, code, file, message), {"rows": [], "count": 0, "examples": []})
        g["count"] += 1
        if row is not None and len(g["rows"]) < MAX_LISTED_ROWS:
            g["rows"].append(row)
        if example and len(g["examples"]) < MAX_EXAMPLES:
            g["examples"].append(example)

    def has_errors(self) -> bool:
        return any(k[0] == "error" for k in self._groups)

    def build(self, level: str) -> list[ValidationIssue]:
        return [ValidationIssue(level=lv, code=code, file=file, message=msg, rows=g["rows"], count=g["count"],
                                examples=g["examples"])
                for (lv, code, file, msg), g in self._groups.items() if lv == level]


def safe_filename(name: str | None, default: str) -> str:
    """Display-only name: basename, safe characters, bounded length."""
    base = (name or "").replace("\\", "/").rsplit("/", 1)[-1].strip()
    base = SAFE_NAME_RE.sub("_", base)[:100].strip(" .")
    return base or default


def _short(value: str, limit: int = 40) -> str:
    return value if len(value) <= limit else value[:limit] + "…"


def _decode(f: UploadedFile, kind: str, ext: str, max_bytes: int, issues: _Issues) -> str | None:
    name = safe_filename(f.filename, kind)
    if not name.lower().endswith(ext):
        issues.add("error", "WRONG_FILE_TYPE", kind, f"{kind} must be a {ext} file; got '{name}'.")
        return None
    if len(f.data) > max_bytes:
        issues.add("error", "FILE_TOO_LARGE", kind,
                   f"{name} is {len(f.data) / 1024 / 1024:.1f} MB; the limit is {max_bytes // 1024} KB.")
        return None
    if not f.data.strip():
        issues.add("error", "EMPTY_FILE", kind, f"{name} is empty.")
        return None
    if b"\x00" in f.data:
        issues.add("error", "NOT_A_TEXT_FILE", kind, f"{name} contains binary data; upload a plain-text {ext} file.")
        return None
    try:
        return f.data.decode("utf-8-sig")
    except UnicodeDecodeError as e:
        issues.add("error", "NOT_UTF8", kind,
                   f"{name} is not UTF-8 text (byte {e.start}). Save it as 'CSV UTF-8' or UTF-8 JSON and retry.")
        return None


def _file_info(kind: str, filename: str, text: str, source: str) -> FileInfo:
    raw = text.encode("utf-8")
    return FileInfo(kind=kind, filename=filename, size_bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(),
                    source=source)


# ---------- thresholds.json ----------

def _reject_duplicate_keys(pairs):
    seen: dict[str, object] = {}
    dupes = []
    for k, v in pairs:
        key = str(k).strip().lower()
        if key in seen:
            dupes.append(k)
        seen[key] = v
    if dupes:
        raise ValueError("duplicate keys: " + ", ".join(map(str, dupes)))
    return dict(pairs)


def validate_thresholds(text: str, issues: _Issues) -> dict[str, dict]:
    try:
        data = json.loads(text, object_pairs_hook=_reject_duplicate_keys)
    except json.JSONDecodeError as e:
        issues.add("error", "INVALID_JSON", THRESHOLDS, f"thresholds.json is not valid JSON (line {e.lineno}: {e.msg}).")
        return {}
    except ValueError as e:
        issues.add("error", "DUPLICATE_THRESHOLD", THRESHOLDS,
                   f"thresholds.json defines the same sensor more than once ({e}).")
        return {}
    if not isinstance(data, dict):
        issues.add("error", "NOT_AN_OBJECT", THRESHOLDS,
                   'thresholds.json must be an object keyed by sensor, e.g. {"noise_dba": {"limit": 85, "unit": "dBA"}}.')
        return {}
    if not data:
        issues.add("error", "NO_THRESHOLDS", THRESHOLDS, "thresholds.json does not define any sensor thresholds.")
        return {}

    out: dict[str, dict] = {}
    for key, rule in data.items():
        sensor = str(key).strip().lower()
        if not SENSOR_RE.match(sensor):
            issues.add("error", "INVALID_SENSOR_NAME", THRESHOLDS,
                       "Threshold keys must be sensor ids or types: lowercase letters, digits and '_' "
                       "starting with a letter.", example=f"'{_short(str(key))}'")
            continue
        if not isinstance(rule, dict):
            issues.add("error", "INVALID_THRESHOLD", THRESHOLDS,
                       'Each threshold must be an object with "limit" and "unit".', example=f"{sensor}")
            continue
        ok = True
        limit = rule.get("limit")
        if limit is None or limit == "":
            issues.add("error", "MISSING_LIMIT", THRESHOLDS, 'A threshold has no "limit".', example=sensor)
            ok = False
        elif isinstance(limit, bool) or not isinstance(limit, (int, float)):
            issues.add("error", "INVALID_LIMIT", THRESHOLDS, '"limit" must be a number (not text or true/false).',
                       example=f"{sensor}: {_short(json.dumps(limit))}")
            ok = False
        elif not math.isfinite(limit):
            issues.add("error", "INVALID_LIMIT", THRESHOLDS, '"limit" must be a finite number.', example=sensor)
            ok = False
        elif limit < 0:
            issues.add("error", "NEGATIVE_LIMIT", THRESHOLDS, '"limit" cannot be negative.',
                       example=f"{sensor}: {limit}")
            ok = False
        elif limit == 0:
            issues.add("warning", "ZERO_LIMIT", THRESHOLDS,
                       "A limit of 0 means every positive reading counts as an exceedance.", example=sensor)
        unit = rule.get("unit")
        if not isinstance(unit, str) or not unit.strip():
            issues.add("error", "MISSING_UNIT", THRESHOLDS, 'Each threshold needs a "unit" such as "dBA" or "in/s".',
                       example=sensor)
            ok = False
        elif len(unit.strip()) > MAX_UNIT_LENGTH:
            issues.add("error", "INVALID_UNIT", THRESHOLDS, f'"unit" must be at most {MAX_UNIT_LENGTH} characters.',
                       example=sensor)
            ok = False
        elif sensor_type(sensor) in EXPECTED_UNITS and unit.strip().lower() not in EXPECTED_UNITS[sensor_type(sensor)]:
            issues.add("warning", "UNEXPECTED_UNIT", THRESHOLDS,
                       "A unit is unusual for its sensor type; check it is correct.",
                       example=f"{sensor}: {_short(unit.strip(), 20)}")
        extra = sorted(set(rule) - {"limit", "unit"})
        if extra:
            issues.add("warning", "EXTRA_THRESHOLD_FIELDS", THRESHOLDS,
                       'Only "limit" and "unit" are used; other fields are ignored.',
                       example=f"{sensor}: {', '.join(map(str, extra))[:60]}")
        if ok:
            out[sensor] = {"limit": float(limit), "unit": unit.strip()}
    return out


# ---------- readings.csv ----------

def _parse_value(raw: str) -> tuple[float | None, str | None]:
    """(value, error_code). Blank -> (None, None): a missing measurement, not an error."""
    if raw == "":
        return None, None
    if NON_FINITE_RE.match(raw):
        return None, "NON_FINITE_VALUE"
    if not NUMBER_RE.match(raw):
        return None, "INVALID_VALUE"
    value = float(raw)
    if not math.isfinite(value):
        return None, "NON_FINITE_VALUE"
    if value < 0:
        return None, "NEGATIVE_VALUE"
    return value, None


VALUE_MESSAGES = {
    "INVALID_VALUE": "value must be a number; leave it blank if the measurement is missing.",
    "NON_FINITE_VALUE": "value must be a finite number (NaN and infinity are not measurements).",
    "NEGATIVE_VALUE": "value cannot be negative for vibration, noise or dust measurements.",
}


def validate_readings(text: str, thresholds: dict[str, dict], issues: _Issues) -> list[RawRow]:
    """`thresholds` holds only the valid rules; sensors are matched against them when there are any."""
    lookup = parse_thresholds(thresholds)[0]
    check_sensors = bool(lookup)
    reader = csv.reader(io.StringIO(text, newline=""))
    try:
        header = next(reader)
    except StopIteration:
        issues.add("error", "EMPTY_FILE", READINGS, "readings.csv has no header row.")
        return []
    except csv.Error as e:
        issues.add("error", "INVALID_CSV", READINGS, f"readings.csv could not be parsed as CSV ({e}).")
        return []
    columns = [h.strip().lower() for h in header]
    dupes = sorted({c for c in columns if c and columns.count(c) > 1})
    if dupes:
        issues.add("error", "DUPLICATE_COLUMNS", READINGS, f"Column(s) appear more than once: {', '.join(dupes)}.", row=1)
    missing = [c for c in REQUIRED_COLUMNS if c not in columns]
    if missing:
        issues.add("error", "MISSING_COLUMNS", READINGS,
                   f"Missing required column(s): {', '.join(missing)}. Required: {', '.join(REQUIRED_COLUMNS)}.", row=1)
        return []
    extra = [c for c in columns if c not in REQUIRED_COLUMNS]
    if extra:
        issues.add("warning", "EXTRA_COLUMNS", READINGS,
                   f"Column(s) not used and ignored: {', '.join(_short(c, 20) for c in extra[:10])}.", row=1)
    index = {c: columns.index(c) for c in REQUIRED_COLUMNS}

    rows: list[RawRow] = []
    names: dict[str, tuple[str, int]] = {}
    seen: dict[tuple, tuple[int, float | None]] = {}
    data_rows = 0
    try:
        for record in reader:
            n = reader.line_num
            if not record or all(not cell.strip() for cell in record):
                continue                                  # blank line
            data_rows += 1
            if data_rows > MAX_ROWS:
                issues.add("error", "TOO_MANY_ROWS", READINGS,
                           f"readings.csv has more than {MAX_ROWS:,} data rows. Split it into smaller uploads.")
                return []
            if len(record) > len(header):
                issues.add("error", "TOO_MANY_FIELDS", READINGS,
                           f"A row has more fields than the header ({len(header)}). Check for unquoted commas.",
                           row=n, example=f"row {n}: {len(record)} fields")
                continue
            cell = {c: (record[i].strip() if i < len(record) else "") for c, i in index.items()}
            row_ok = True
            for c in ("site_id", "site_name", "sensor", "timestamp"):
                if not cell[c]:
                    issues.add("error", "BLANK_REQUIRED_FIELD", READINGS, f"{c} is required and is blank.", row=n,
                               example=f"row {n}")
                    row_ok = False

            site_id = cell["site_id"]
            if site_id and not SITE_ID_RE.match(site_id):
                issues.add("error", "INVALID_SITE_ID", READINGS,
                           "site_id must be letters, digits, '-' or '_' (up to 64 characters, no spaces).",
                           row=n, example=f"row {n}: '{_short(site_id)}'")
                row_ok = False

            sensor = cell["sensor"].lower()
            if sensor and not SENSOR_RE.match(sensor):
                issues.add("error", "INVALID_SENSOR_NAME", READINGS,
                           "sensor must be a lowercase id such as vibration_ppv, noise_dba or dust_pm10.",
                           row=n, example=f"row {n}: '{_short(cell['sensor'])}'")
                row_ok = False
            elif sensor and check_sensors and find_threshold(sensor, lookup) is None:
                issues.add("error", "UNKNOWN_SENSOR", READINGS,
                           f"Sensor '{sensor}' has no valid matching threshold in thresholds.json.", row=n,
                           example=f"row {n}")
                row_ok = False

            ts = None
            if cell["timestamp"]:
                try:
                    ts = to_naive_utc(datetime.fromisoformat(cell["timestamp"]))
                except ValueError:
                    issues.add("error", "INVALID_TIMESTAMP", READINGS,
                               "timestamp must be ISO 8601, e.g. 2026-11-02T08:00:00.", row=n,
                               example=f"row {n}: '{_short(cell['timestamp'])}'")
                    row_ok = False

            value, value_error = _parse_value(cell["value"])
            if value_error:
                issues.add("error", value_error, READINGS, VALUE_MESSAGES[value_error], row=n,
                           example=f"row {n}: '{_short(cell['value'])}'")
                row_ok = False

            if site_id and cell["site_name"] and SITE_ID_RE.match(site_id):
                first = names.setdefault(site_id, (cell["site_name"], n))
                if first[0] != cell["site_name"]:
                    issues.add("error", "CONFLICTING_SITE_NAME", READINGS,
                               "The same site_id is used with different site names.", row=n,
                               example=f"{site_id}: '{_short(first[0], 30)}' (row {first[1]}) vs "
                                       f"'{_short(cell['site_name'], 30)}' (row {n})")
                    row_ok = False

            if not row_ok:
                continue
            key = (site_id, sensor, ts)
            if key in seen:
                first_row, first_value = seen[key]
                if first_value == value:
                    issues.add("warning", "DUPLICATE_ROW", READINGS,
                               "Exact duplicate records (same site, sensor, timestamp and value) are ignored.",
                               row=n, example=f"row {n} repeats row {first_row}")
                else:
                    issues.add("error", "CONFLICTING_DUPLICATE", READINGS,
                               "The same site, sensor and timestamp appear with different values.", row=n,
                               example=f"rows {first_row} and {n}: {first_value} vs {value}")
                continue
            seen[key] = (n, value)
            if value is None:
                issues.add("warning", "MISSING_VALUE", READINGS,
                           "Blank measurements are kept as MISSING_DATA (null, never zero).", row=n,
                           example=f"row {n}: {site_id} {sensor}")
            rows.append(RawRow(row_number=n, site_id=site_id, site_name=cell["site_name"], sensor=sensor,
                               timestamp=cell["timestamp"], value=cell["value"]))
    except csv.Error as e:
        issues.add("error", "INVALID_CSV", READINGS, f"readings.csv could not be parsed near row {reader.line_num} ({e}).",
                   row=reader.line_num)
        return []

    if data_rows == 0:
        issues.add("error", "NO_DATA_ROWS", READINGS, "readings.csv has a header but no data rows.")
    if check_sensors:
        used = {t.sensor for t in (find_threshold(r.sensor, lookup) for r in rows) if t}
        for sensor in sorted(set(lookup) - used):
            issues.add("warning", "UNUSED_THRESHOLD", THRESHOLDS,
                       "A threshold has no matching readings in readings.csv.", example=sensor)
    return rows


# ---------- both files ----------

def limits() -> dict[str, int]:
    return {"max_readings_bytes": MAX_READINGS_BYTES, "max_thresholds_bytes": MAX_THRESHOLDS_BYTES,
            "max_rows": MAX_ROWS}


def validate_dataset(readings: UploadedFile | None, thresholds: UploadedFile | None,
                     current: CurrentFiles | None) -> ValidatedDataset:
    """Validate an upload. A file that is not uploaded is reused from the active dataset (`current`)."""
    issues = _Issues()
    if readings is None and thresholds is None:
        issues.add("error", "NO_FILES", READINGS, "Upload readings.csv, thresholds.json, or both.")

    def source(f: UploadedFile | None, kind, ext, max_bytes, cur_name, cur_text):
        if f is not None:
            text = _decode(f, kind, ext, max_bytes, issues)
            return safe_filename(f.filename, kind), text, "uploaded"
        if current is None:
            issues.add("error", "NO_ACTIVE_FILE", kind, f"No active dataset to reuse {kind} from; upload it too.")
            return kind, None, "active_dataset"
        return cur_name, cur_text, "active_dataset"

    r_name, r_text, r_src = source(readings, READINGS, ".csv", MAX_READINGS_BYTES,
                                   current and current.readings_filename, current and current.readings_text)
    t_name, t_text, t_src = source(thresholds, THRESHOLDS, ".json", MAX_THRESHOLDS_BYTES,
                                   current and current.thresholds_filename, current and current.thresholds_text)

    rules = validate_thresholds(t_text, issues) if t_text is not None else {}
    rows = validate_readings(r_text, rules, issues) if r_text is not None else []

    valid = not issues.has_errors()
    files = [_file_info(READINGS, r_name or READINGS, r_text or "", r_src),
             _file_info(THRESHOLDS, t_name or THRESHOLDS, t_text or "", t_src)]
    report = ValidationReport(valid=valid, errors=issues.build("error"), warnings=issues.build("warning"),
                              files=files, limits=limits())
    return ValidatedDataset(report=report, rows=rows if valid else [], thresholds=rules,
                            readings_text=r_text or "", thresholds_text=t_text or "",
                            readings_file=files[0], thresholds_file=files[1])
