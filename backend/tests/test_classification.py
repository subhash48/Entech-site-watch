"""Validation and NORMAL / EXCEEDED / MISSING_DATA classification rules."""
import pytest

from app.schemas import Threshold
from app.services.readings import RawRow, evaluate_row
from app.services.thresholds import find_threshold, parse_thresholds, sensor_label

LOOKUP, _ = parse_thresholds({"noise_dba": {"limit": 85, "unit": "dBA"}})


def classify(value="80", sensor="noise_dba", timestamp="2026-11-02T10:00:00", site_id="S1", lookup=LOOKUP):
    row = RawRow(row_number=2, site_id=site_id, site_name="Test", sensor=sensor, timestamp=timestamp, value=value)
    return evaluate_row(row, lookup, "Test")


@pytest.mark.parametrize("value, status", [("84.9", "NORMAL"), ("85", "NORMAL"), ("85.01", "EXCEEDED")])
def test_strictly_greater_than_limit_is_exceeded(value, status):
    assert classify(value).status == status


def test_blank_value_is_missing_data_not_zero():
    r = classify("")
    assert r.status == "MISSING_DATA" and r.value is None and r.issues == ["Value is blank"]
    # Threshold context is still shown so the table can display it.
    assert (r.threshold, r.unit) == (85, "dBA")


def test_blank_is_not_zero_even_with_negative_style_limit():
    # If blank were treated as 0, a limit below 0 would flag it as EXCEEDED.
    lookup, _ = parse_thresholds({"noise_dba": {"limit": -1, "unit": "dBA"}})
    assert classify("", lookup=lookup).status == "MISSING_DATA"


@pytest.mark.parametrize("kwargs, issue", [
    ({"value": "abc"}, "Value 'abc' is not a number"),
    ({"value": "nan"}, "Value 'nan' is not a number"),
    ({"value": "-3"}, "Value -3 is negative, which is not a valid measurement"),
    ({"timestamp": "yesterday"}, "Timestamp 'yesterday' is not a valid ISO 8601 date-time"),
    ({"timestamp": ""}, "Timestamp is blank"),
    ({"site_id": ""}, "Site ID is blank"),
    ({"site_id": "S 1!"}, "Site ID 'S 1!' is not valid"),
    ({"sensor": ""}, "Sensor name is blank"),
    ({"sensor": "noise dba"}, "Sensor name 'noise dba' is not valid"),
    ({"sensor": "co2_ppm"}, "No threshold configured for sensor 'co2_ppm'"),
])
def test_invalid_fields_become_missing_data(kwargs, issue):
    r = classify(**kwargs)
    assert r.status == "MISSING_DATA" and issue in r.issues


def test_sensor_name_is_case_insensitive():
    assert classify("90", sensor="Noise_DBA").status == "EXCEEDED"


def test_timezone_aware_timestamp_normalised_to_utc():
    assert classify(timestamp="2026-11-02T10:00:00-05:00").timestamp.isoformat() == "2026-11-02T15:00:00"


def test_lookup_by_sensor_type_and_exact_id_wins():
    lookup, _ = parse_thresholds({"noise": {"limit": 85, "unit": "dBA"}, "noise_dba": {"limit": 70, "unit": "dBA"},
                                  "vibration": {"limit": 0.5, "unit": "in/s"}})
    assert find_threshold("noise_dba", lookup).limit == 70
    assert find_threshold("noise_leq", lookup).limit == 85
    assert find_threshold("vibration_ppv", lookup).limit == 0.5
    assert find_threshold("dust_pm10", lookup) is None


def test_each_sensor_uses_its_own_threshold():
    lookup, _ = parse_thresholds({"vibration": {"limit": 0.5, "unit": "in/s"}, "noise": {"limit": 85, "unit": "dBA"}})
    assert classify("0.6", sensor="vibration_ppv", lookup=lookup).status == "EXCEEDED"
    assert classify("80", sensor="noise_dba", lookup=lookup).status == "NORMAL"  # 0.5 does not apply to noise


def test_bad_threshold_entries_are_warnings_not_zero():
    lookup, warnings = parse_thresholds({"noise": {"unit": "dBA"}, "dust": {"limit": "high"},
                                         "flag": {"limit": True}, "vibration": {"limit": 0, "unit": "in/s"}})
    assert list(lookup) == ["vibration"] and lookup["vibration"] == Threshold(sensor="vibration", limit=0, unit="in/s")
    assert len(warnings) == 3


@pytest.mark.parametrize("sensor, unit, label", [
    ("vibration_ppv", "in/s", "Vibration (PPV)"), ("noise_dba", "dBA", "Noise"), ("dust_pm10", "ug/m3", "Dust (PM10)"),
])
def test_sensor_labels(sensor, unit, label):
    assert sensor_label(sensor, unit) == label
