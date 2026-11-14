"""CSV and PDF exports of the active dataset, including CSV formula-injection protection."""
import csv
import io

import pytest
from fastapi.testclient import TestClient

from app.datasets.service import new_version_from
from app.datasets.validation import UploadedFile, validate_dataset
from app.services import exports
from tests.test_dataset_sync import RULES, make_app


def pdf_text(content: bytes) -> str:
    """Uncompressed PDF text, with the PDF string escapes for parentheses removed."""
    return content.decode("latin-1").replace(r"\(", "(").replace(r"\)", ")")


def rows(text: str) -> list[dict]:
    assert text.startswith("\ufeff")
    return list(csv.DictReader(io.StringIO(text[1:])))


@pytest.fixture
def starter(tmp_path):
    return TestClient(make_app(tmp_path / "db.sqlite3"))


def test_readings_csv_is_filtered_and_keeps_missing_values_blank(starter):
    res = starter.get("/api/exports/readings.csv", params={"site_id": "S2"})
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/csv")
    assert res.headers["content-disposition"].startswith('attachment; filename="sitewatch-readings-v0-')
    data = rows(res.text)
    assert len(data) == 5 and {r["site_id"] for r in data} == {"S2"}
    missing = next(r for r in data if r["status"] == "MISSING_DATA")
    assert missing["value"] == "" and missing["row"] == "10" and "blank" in missing["issues"]
    assert data[0]["dataset_version"] == "v0" and data[0]["dataset_name"] == "Starter dataset"
    assert len(rows(starter.get("/api/exports/readings.csv", params={"sensor": "noise"}).text)) == 5


def test_exceedances_csv(starter):
    data = rows(starter.get("/api/exports/exceedances.csv").text)
    assert [(r["site_id"], r["value"], r["severity"]) for r in data][:2] == [("S3", "91.0", "medium"),
                                                                             ("S2", "171.0", "medium")]
    assert len(data) == 5 and float(data[3]["exceeded_by_pct"]) == 24.0


def test_csv_formula_injection_is_neutralized(tmp_path):
    app = make_app(tmp_path / "db.sqlite3")
    evil = ("site_id,site_name,sensor,timestamp,value\n"
            'S1,"=HYPERLINK(""http://x"",""click"")",noise_dba,2026-11-09T08:00:00,95\n'
            "S2,+cmd|' /C calc'!A0,noise_dba,2026-11-09T08:00:00,80\n"
            "S3,@SUM(1+1),noise_dba,2026-11-09T08:00:00,80\n"
            "S4,-2+3,noise_dba,2026-11-09T08:00:00,80\n")
    v = validate_dataset(UploadedFile("evil.csv", evil.encode()), UploadedFile("t.json", RULES.encode()), None)
    assert v.valid
    app.state.datasets.store.create(new_version_from(v, "=evil()", "admin"), activate=True)
    c = TestClient(app)
    data = rows(c.get("/api/exports/readings.csv").text)
    names = [r["site_name"] for r in data]
    assert all(n.startswith("'") for n in names), names
    assert data[0]["dataset_name"] == "'=evil()" and data[0]["dataset_version"] == "v1"
    assert rows(c.get("/api/exports/exceedances.csv").text)[0]["site_name"].startswith("'=HYPERLINK")


def test_safe_cell_keeps_numbers_numeric():
    assert exports.safe_cell(-3.5) == -3.5 and exports.safe_cell(None) == "" and exports.safe_cell("ok") == "ok"
    assert exports.safe_cell("\tx") == "'\tx"


def test_summary_pdf_reports_version_period_sites_exceedances_and_missing(starter, monkeypatch):
    monkeypatch.setattr(exports, "COMPRESS_PDF", False)
    res = starter.get("/api/reports/summary.pdf")
    assert res.status_code == 200 and res.headers["content-type"] == "application/pdf"
    assert res.content.startswith(b"%PDF")
    text = pdf_text(res.content)
    for expected in ["SiteWatch monitoring summary", "v0 - Starter dataset", "Analyzed period",
                     "Queens Plaza North", "Exceedances (5)", "Missing-data warnings (1)", "not treated as zero",
                     "not a live feed"]:
        assert expected in text, expected


def test_summary_pdf_filters_and_uploaded_version(tmp_path, monkeypatch):
    monkeypatch.setattr(exports, "COMPRESS_PDF", False)
    app = make_app(tmp_path / "db.sqlite3")
    from tests.test_dataset_sync import store_week46
    store_week46(app)
    c = TestClient(app)
    text = pdf_text(c.get("/api/reports/summary.pdf", params={"site_id": "S4"}).content)
    assert "v1 - Week 46" in text and "site S4" in text and "Pier 17" in text and "Exceedances (0)" in text
    assert c.get("/api/reports/summary.pdf", params={"site_id": "S9"}).status_code == 404
    ranged = pdf_text(c.get("/api/reports/summary.pdf", params={"start": "2026-11-09T09:30:00"}).content)
    assert "Missing-data warnings (0)" in ranged


def test_pdf_text_is_latin1_safe():
    assert exports.pdf_text("150 µg/m³ – ok • ✓") == "150 ug/m3 - ok - ?"
