"""Threshold rules from thresholds.json and the sensor -> rule lookup."""
import json
import math
from pathlib import Path

from app.errors import DataLoadError
from app.schemas import Threshold


def sensor_type(sensor: str) -> str:
    """'vibration_ppv' -> 'vibration', 'noise_dba' -> 'noise', 'dust_pm10' -> 'dust'."""
    return sensor.strip().lower().partition("_")[0]


def sensor_label(sensor: str, unit: str | None = None) -> str:
    """Human label derived from the sensor id: 'vibration_ppv' -> 'Vibration (PPV)'.

    The qualifier is dropped when it just repeats the unit ('noise_dba' + 'dBA' -> 'Noise').
    """
    kind, _, qualifier = sensor.strip().partition("_")
    label = kind.replace("-", " ").title() or sensor
    q = qualifier.replace("_", " ").upper()
    if q and q != (unit or "").upper():
        label += f" ({q})"
    return label


def parse_thresholds(data: dict) -> tuple[dict[str, Threshold], list[str]]:
    """Build the lookup. Entries without a usable numeric limit are skipped with a
    warning; they are never defaulted to 0."""
    lookup: dict[str, Threshold] = {}
    warnings: list[str] = []
    for key, rule in data.items():
        name = str(key).strip().lower()
        limit = rule.get("limit") if isinstance(rule, dict) else None
        if limit is None or limit == "":
            warnings.append(f"Threshold '{key}' has no limit; its readings are not evaluated.")
            continue
        try:
            if isinstance(limit, bool):
                raise ValueError
            limit = float(limit)
            if not math.isfinite(limit):
                raise ValueError
        except (TypeError, ValueError):
            warnings.append(f"Threshold '{key}' has a non-numeric limit ({limit!r}); its readings are not evaluated.")
            continue
        lookup[name] = Threshold(sensor=name, limit=limit, unit=str(rule.get("unit") or ""))
    return lookup, warnings


def load_thresholds(path: Path) -> tuple[dict[str, Threshold], list[str]]:
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        raise DataLoadError(f"Threshold file not found: {path.name}") from None
    except json.JSONDecodeError as e:
        raise DataLoadError(f"Threshold file {path.name} is not valid JSON (line {e.lineno}: {e.msg}).") from None
    if not isinstance(data, dict):
        raise DataLoadError(f"Threshold file {path.name} must be a JSON object keyed by sensor name.")
    return parse_thresholds(data)


def find_threshold(sensor: str, lookup: dict[str, Threshold]) -> Threshold | None:
    """An exact sensor id ('vibration_ppv') wins; otherwise fall back to its type ('vibration')."""
    return lookup.get(sensor.strip().lower()) or lookup.get(sensor_type(sensor))
