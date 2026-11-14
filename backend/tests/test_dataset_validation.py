"""Upload validation: blocking errors vs warnings, row numbers, limits, single-file reuse, stats and comparison."""
import json

import pytest

from app.datasets import validation as v
from app.datasets.preview import compare, dataset_from, preview_rows, stats_for
from app.datasets.validation import CurrentFiles, UploadedFile, validate_dataset
from app.schemas import ReadingStatus
from tests.conftest import DATA_DIR

STARTER_CSV = (DATA_DIR / "readings.csv").read_text(encoding="utf-8")
STARTER_JSON = (DATA_DIR / "thresholds.json").read_text(encoding="utf-8")
HEADER = "site_id,site_name,sensor,timestamp,value\n"
RULES = {"vibration_ppv": {"limit": 0.5, "unit": "in/s"}, "noise_dba": {"limit": 85, "unit": "dBA"},
         "dust_pm10": {"limit": 150, "unit": "ug/m3"}}
CURRENT = CurrentFiles("readings.csv", STARTER_CSV, "thresholds.json", STARTER_JSON)


def csv_file(*rows, header=HEADER, name="readings.csv"):
    return UploadedFile(name, (header + "\n".join(rows) + "\n").encode())


def json_file(rules=RULES, name="thresholds.json"):
    return UploadedFile(name, (rules if isinstance(rules, str) else json.dumps(rules)).encode())


def run(*rows, rules=RULES, **kw):
    return validate_dataset(csv_file(*rows, **kw), json_file(rules), None)


def codes(result, level="errors"):
    return {i.code for i in getattr(result.report, level)}


def issue(result, code):
    return next(i for i in result.report.errors + result.report.warnings if i.code == code)


# ---------- valid uploads ----------

def test_starter_files_are_valid_and_match_dashboard_numbers():
    r = validate_dataset(UploadedFile("readings.csv", STARTER_CSV.encode()),
                         UploadedFile("thresholds.json", STARTER_JSON.encode()), None)
    assert r.valid and r.report.errors == []
    assert codes(r, "warnings") == {"MISSING_VALUE"}
    s = stats_for(dataset_from(r.rows, r.thresholds))
    assert (s.total_rows, s.valid_readings, s.normal_readings, s.exceeded_readings, s.missing_readings) == (15, 14, 9, 5, 1)
    assert (s.sites, s.sensor_categories) == (3, ["dust", "noise", "vibration"])


def test_missing_value_is_kept_as_missing_data_not_zero():
    r = run("S1,Main St,noise_dba,2026-11-02T08:00:00,", "S1,Main St,noise_dba,2026-11-02T09:00:00,90")
    assert r.valid and issue(r, "MISSING_VALUE").rows == [2]
    ds = dataset_from(r.rows, r.thresholds)
    missing = next(x for x in ds.readings if x.id == 2)
    assert missing.status == ReadingStatus.MISSING_DATA and missing.value is None
    assert stats_for(ds).exceeded_readings == 1


def test_single_file_upload_reuses_active_thresholds():
    r = validate_dataset(csv_file("S9,New Site,dust_pm10,2026-11-03T08:00:00,200"), None, CURRENT)
    assert r.valid
    sources = {f.kind: f.source for f in r.report.files}
    assert sources == {"readings.csv": "uploaded", "thresholds.json": "active_dataset"}
    assert stats_for(dataset_from(r.rows, r.thresholds)).exceeded_readings == 1


def test_single_file_upload_reuses_active_readings_with_new_thresholds():
    stricter = {**RULES, "noise_dba": {"limit": 80, "unit": "dBA"}}
    r = validate_dataset(None, json_file(stricter), CURRENT)
    assert r.valid and r.report.files[0].source == "active_dataset"
    assert stats_for(dataset_from(r.rows, r.thresholds)).exceeded_readings > 5


def test_no_files_and_no_active_dataset():
    assert "NO_FILES" in codes(validate_dataset(None, None, CURRENT))
    assert "NO_ACTIVE_FILE" in codes(validate_dataset(csv_file("S1,A,noise_dba,2026-11-02T08:00:00,1"), None, None))


# ---------- readings.csv errors ----------

@pytest.mark.parametrize("row,code", [
    ("S 1,Main St,noise_dba,2026-11-02T08:00:00,80", "INVALID_SITE_ID"),
    ("S1,Main St,Noise Level,2026-11-02T08:00:00,80", "INVALID_SENSOR_NAME"),
    ("S1,Main St,temp_c,2026-11-02T08:00:00,20", "UNKNOWN_SENSOR"),
    ("S1,Main St,noise_dba,02/11/2026 8am,80", "INVALID_TIMESTAMP"),
    ("S1,Main St,noise_dba,2026-11-02T08:00:00,loud", "INVALID_VALUE"),
    ("S1,Main St,noise_dba,2026-11-02T08:00:00,1_000", "INVALID_VALUE"),
    ("S1,Main St,noise_dba,2026-11-02T08:00:00,NaN", "NON_FINITE_VALUE"),
    ("S1,Main St,noise_dba,2026-11-02T08:00:00,inf", "NON_FINITE_VALUE"),
    ("S1,Main St,noise_dba,2026-11-02T08:00:00,1e999", "NON_FINITE_VALUE"),
    ("S1,Main St,noise_dba,2026-11-02T08:00:00,-3", "NEGATIVE_VALUE"),
    (",Main St,noise_dba,2026-11-02T08:00:00,80", "BLANK_REQUIRED_FIELD"),
    ("S1,,noise_dba,2026-11-02T08:00:00,80", "BLANK_REQUIRED_FIELD"),
    ("S1,Main St,noise_dba,,80", "BLANK_REQUIRED_FIELD"),
    ("S1,Main St,noise_dba,2026-11-02T08:00:00,80,extra", "TOO_MANY_FIELDS"),
])
def test_row_errors_block_and_name_the_row(row, code):
    r = run("S1,Main St,noise_dba,2026-11-02T07:00:00,70", row)
    assert not r.valid and r.rows == []
    found = issue(r, code)
    assert found.level == "error" and found.rows == [3]


def test_row_numbers_point_at_the_spreadsheet_row():
    r = run(*[f"S1,Main St,noise_dba,2026-11-02T{h:02d}:00:00,70" for h in range(10)],
            "S1,Main St,noise_dba,bad-time,70")
    assert issue(r, "INVALID_TIMESTAMP").rows == [12]
    assert issue(r, "INVALID_TIMESTAMP").examples == ["row 12: 'bad-time'"]


def test_conflicting_site_names_block():
    r = run("S1,Main St,noise_dba,2026-11-02T07:00:00,70", "S1,Main Street,noise_dba,2026-11-02T08:00:00,70")
    i = issue(r, "CONFLICTING_SITE_NAME")
    assert not r.valid and i.rows == [3] and "Main St" in i.examples[0]


def test_exact_duplicates_warn_and_are_ignored_conflicting_duplicates_block():
    dup = run("S1,Main St,noise_dba,2026-11-02T07:00:00,70", "S1,Main St,noise_dba,2026-11-02T07:00:00,70")
    assert dup.valid and issue(dup, "DUPLICATE_ROW").examples == ["row 3 repeats row 2"] and len(dup.rows) == 1
    clash = run("S1,Main St,noise_dba,2026-11-02T07:00:00,70", "S1,Main St,noise_dba,2026-11-02T07:00:00,90")
    assert not clash.valid and issue(clash, "CONFLICTING_DUPLICATE").rows == [3]


def test_duplicate_detection_compares_parsed_timestamps():
    r = run("S1,Main St,noise_dba,2026-11-02T07:00:00,70", "S1,Main St,noise_dba,2026-11-02T07:00:00+00:00,75")
    assert "CONFLICTING_DUPLICATE" in codes(r)


def test_many_bad_rows_are_grouped_with_bounded_listing():
    rows = [f"S1,Main St,noise_dba,2026-11-02T07:{m:02d}:00,abc" for m in range(60)]
    i = issue(run(*rows), "INVALID_VALUE")
    assert i.count == 60 and len(i.rows) == v.MAX_LISTED_ROWS and len(i.examples) == v.MAX_EXAMPLES


def test_header_problems():
    assert "MISSING_COLUMNS" in codes(run("S1,Main St,noise_dba,2026-11-02", header="site_id,site_name,sensor,timestamp\n"))
    assert "DUPLICATE_COLUMNS" in codes(run("S1,A,noise_dba,2026-11-02T07:00:00,1,1",
                                            header="site_id,site_name,sensor,timestamp,value,value\n"))
    extra = run("S1,A,noise_dba,2026-11-02T07:00:00,1,note", header="site_id,site_name,sensor,timestamp,value,notes\n")
    assert extra.valid and "EXTRA_COLUMNS" in codes(extra, "warnings")
    assert "NO_DATA_ROWS" in codes(validate_dataset(UploadedFile("r.csv", HEADER.encode()), json_file(), None))


def test_header_is_case_and_space_insensitive_and_bom_is_ok():
    f = UploadedFile("readings.csv", ("\ufeff Site_ID ,Site_Name,SENSOR,timestamp,Value\n"
                                      "S1,A,noise_dba,2026-11-02T07:00:00,1\n").encode())
    assert validate_dataset(f, json_file(), None).valid


# ---------- file-level checks ----------

def test_wrong_extension_binary_non_utf8_empty():
    assert "WRONG_FILE_TYPE" in codes(validate_dataset(UploadedFile("readings.xlsx", b"x"), json_file(), None))
    assert "WRONG_FILE_TYPE" in codes(validate_dataset(csv_file("S1,A,noise_dba,2026-11-02T07:00:00,1"),
                                                       UploadedFile("thresholds.txt", b"{}"), None))
    assert "NOT_A_TEXT_FILE" in codes(validate_dataset(UploadedFile("r.csv", b"PK\x03\x04\x00\x00"), json_file(), None))
    assert "NOT_UTF8" in codes(validate_dataset(UploadedFile("r.csv", HEADER.encode() + b"S1,Caf\xe9,noise_dba,x,1"),
                                                json_file(), None))
    assert "EMPTY_FILE" in codes(validate_dataset(UploadedFile("r.csv", b"  \n"), json_file(), None))


def test_oversized_files_are_rejected(monkeypatch):
    monkeypatch.setattr(v, "MAX_READINGS_BYTES", 100)
    big = csv_file(*["S1,Main St,noise_dba,2026-11-02T07:00:00,70"] * 5)
    assert issue(validate_dataset(big, json_file(), None), "FILE_TOO_LARGE").level == "error"
    monkeypatch.setattr(v, "MAX_THRESHOLDS_BYTES", 10)
    assert "FILE_TOO_LARGE" in codes(validate_dataset(None, json_file(), CURRENT))


def test_too_many_rows(monkeypatch):
    monkeypatch.setattr(v, "MAX_ROWS", 3)
    rows = [f"S1,A,noise_dba,2026-11-02T07:0{m}:00,70" for m in range(5)]
    assert "TOO_MANY_ROWS" in codes(run(*rows))


def test_filename_is_sanitized_for_display():
    assert v.safe_filename("../../etc/passwd.csv", "readings.csv") == "passwd.csv"
    assert v.safe_filename("C:\\Users\\me\\Week 46 <final>.csv", "readings.csv") == "Week 46 _final_.csv"
    assert v.safe_filename("", "readings.csv") == "readings.csv"


def test_formula_like_text_is_stored_as_plain_data():
    r = run('S1,"=HYPERLINK(""http://x"")",noise_dba,2026-11-02T07:00:00,70')
    assert r.valid and r.rows[0].site_name.startswith("=HYPERLINK")


# ---------- thresholds.json ----------

@pytest.mark.parametrize("rules,code", [
    ("{not json", "INVALID_JSON"),
    ("[1, 2]", "NOT_AN_OBJECT"),
    ("{}", "NO_THRESHOLDS"),
    ('{"noise_dba": {"limit": 85, "unit": "dBA"}, "NOISE_DBA": {"limit": 80, "unit": "dBA"}}', "DUPLICATE_THRESHOLD"),
    ({"Noise Level": {"limit": 85, "unit": "dBA"}}, "INVALID_SENSOR_NAME"),
    ({"noise_dba": 85}, "INVALID_THRESHOLD"),
    ({"noise_dba": {"unit": "dBA"}}, "MISSING_LIMIT"),
    ({"noise_dba": {"limit": "85", "unit": "dBA"}}, "INVALID_LIMIT"),
    ({"noise_dba": {"limit": True, "unit": "dBA"}}, "INVALID_LIMIT"),
    ({"noise_dba": {"limit": -1, "unit": "dBA"}}, "NEGATIVE_LIMIT"),
    ({"noise_dba": {"limit": 85}}, "MISSING_UNIT"),
    ({"noise_dba": {"limit": 85, "unit": "x" * 40}}, "INVALID_UNIT"),
])
def test_threshold_errors(rules, code):
    r = validate_dataset(None, json_file(rules), CURRENT)
    assert not r.valid and code in codes(r)


def test_threshold_warnings():
    rules = {**RULES, "noise_dba": {"limit": 85, "unit": "mm/s", "note": "x"}, "dust_pm25": {"limit": 35, "unit": "ug/m3"}}
    r = validate_dataset(None, json_file(rules), CURRENT)
    assert r.valid
    assert {"UNEXPECTED_UNIT", "EXTRA_THRESHOLD_FIELDS", "UNUSED_THRESHOLD"} <= codes(r, "warnings")


def test_type_level_threshold_matches_specific_sensor():
    r = run("S1,Main St,noise_dba,2026-11-02T07:00:00,90", rules={"noise": {"limit": 85, "unit": "dBA"}})
    assert r.valid and stats_for(dataset_from(r.rows, r.thresholds)).exceeded_readings == 1


# ---------- preview and comparison ----------

def test_preview_rows_and_comparison():
    starter = validate_dataset(UploadedFile("r.csv", STARTER_CSV.encode()), UploadedFile("t.json", STARTER_JSON.encode()), None)
    current = dataset_from(starter.rows, starter.thresholds)
    r = run("S1,125 Broad St,noise_dba,2026-11-03T08:00:00,99", "S4,Pier 17,dust_pm10,2026-11-03T08:00:00,",
            rules={**RULES, "noise_dba": {"limit": 90, "unit": "dBA"}})
    proposed = dataset_from(r.rows, r.thresholds)
    assert [x.id for x in preview_rows(proposed)] == [2, 3]
    c = compare(current, proposed, "v0 · Starter dataset")
    m = {x.metric: x for x in c.metrics}
    assert (m["total_rows"].current, m["total_rows"].proposed, m["total_rows"].change) == (15, 2, -13)
    assert c.sites_added == ["S4"] and c.sites_removed == ["S2", "S3"]
    assert [(t.sensor, t.change, t.current, t.proposed) for t in c.threshold_changes] == [
        ("noise_dba", "changed", "85 dBA", "90 dBA")]
