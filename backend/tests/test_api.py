"""Endpoint tests over the real data files, plus edge cases over custom data."""
from tests.conftest import ORIGIN

EXPECTED_EXCEEDANCES = [
    ("S3", "07:30", "noise_dba", 91, 85),
    ("S2", "09:00", "dust_pm10", 171, 150),
    ("S1", "10:00", "noise_dba", 88, 85),
    ("S1", "10:00", "vibration_ppv", 0.62, 0.5),
    ("S3", "11:30", "vibration_ppv", 0.55, 0.5),
]


# ---------- health & sites ----------

def test_health(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert (body["readings_loaded"], body["sites_loaded"], body["thresholds_loaded"]) == (15, 3, 3)


def test_sites_with_alert_counts(client):
    sites = {s["site_id"]: s for s in client.get("/api/sites").json()}
    assert {k: (s["site_name"], s["status"], s["total_readings"], s["normal_count"], s["exceeded_count"],
                s["missing_data_count"]) for k, s in sites.items()} == {
        "S1": ("125 Broad St", "ALERT", 5, 3, 2, 0),
        "S2": ("40 Atlantic Ave", "ALERT", 5, 3, 1, 1),
        "S3": ("Queens Plaza North", "ALERT", 5, 3, 2, 0),
    }
    assert sites["S1"]["last_exceedance_at"] == "2026-11-02T10:00:00"


def test_single_site_and_unknown_site(client):
    assert client.get("/api/sites/S2").json()["missing_data_count"] == 1
    res = client.get("/api/sites/NOPE")
    assert res.status_code == 404
    assert res.json()["error"] == {"code": "SITE_NOT_FOUND", "message": "Unknown site_id 'NOPE'.",
                                   "details": {"known_site_ids": ["S1", "S2", "S3"]}}


def test_sensors_and_thresholds_come_from_json(client):
    sensors = {s["sensor"]: s for s in client.get("/api/sensors").json()}
    assert {k: (s["threshold"]["limit"], s["threshold"]["unit"], s["reading_count"]) for k, s in sensors.items()} == {
        "dust_pm10": (150, "ug/m3", 5), "noise_dba": (85, "dBA", 5), "vibration_ppv": (0.5, "in/s", 5)}
    assert len(client.get("/api/thresholds").json()) == 3


# ---------- readings: filters & pagination ----------

def test_readings_default_page(client):
    body = client.get("/api/readings").json()
    assert (body["total"], body["page"], body["page_size"], body["total_pages"]) == (15, 1, 25, 1)
    stamps = [r["timestamp"] for r in body["items"]]
    assert stamps == sorted(stamps)


def test_readings_pagination(client):
    pages = [client.get("/api/readings", params={"page": p, "page_size": 4}).json() for p in (1, 2, 3, 4, 5)]
    assert [len(p["items"]) for p in pages] == [4, 4, 4, 3, 0]
    assert {p["total_pages"] for p in pages} == {4}
    ids = [r["id"] for p in pages for r in p["items"]]
    assert sorted(ids) == list(range(2, 17))  # every CSV row exactly once


def test_readings_desc_order(client):
    items = client.get("/api/readings", params={"order": "desc"}).json()["items"]
    assert items[0]["timestamp"] == "2026-11-02T14:00:00"


def test_readings_filters(client):
    get = lambda **p: client.get("/api/readings", params=p).json()
    assert get(status="EXCEEDED")["total"] == 5
    assert get(status="NORMAL")["total"] == 9
    missing = get(status="MISSING_DATA")["items"]
    assert [(r["site_id"], r["sensor"], r["value"], r["issues"]) for r in missing] == [
        ("S2", "dust_pm10", None, ["Value is blank"])]
    assert get(site_id="S1", sensor="noise_dba")["total"] == 2
    assert get(site_id="S3", status="EXCEEDED")["total"] == 2
    assert get(start="2026-11-02T10:00:00", end="2026-11-02T11:30:00")["total"] == 5


def test_readings_show_threshold_and_unit(client):
    r = next(r for r in client.get("/api/readings").json()["items"] if r["id"] == 3)
    assert (r["value"], r["threshold"], r["unit"], r["status"], r["exceeded_by"]) == (0.62, 0.5, "in/s", "EXCEEDED", 0.12)


def test_readings_invalid_params(client):
    for params, code, status in [
        ({"page": 0}, "VALIDATION_ERROR", 422),
        ({"page_size": 101}, "VALIDATION_ERROR", 422),
        ({"status": "BROKEN"}, "VALIDATION_ERROR", 422),
        ({"start": "not-a-date"}, "VALIDATION_ERROR", 422),
        ({"start": "2026-11-03T00:00:00", "end": "2026-11-02T00:00:00"}, "INVALID_RANGE", 422),
        ({"site_id": "NOPE"}, "SITE_NOT_FOUND", 404),
        ({"sensor": "co2_ppm"}, "SENSOR_NOT_FOUND", 404),
    ]:
        res = client.get("/api/readings", params=params)
        assert (res.status_code, res.json()["error"]["code"]) == (status, code), params
    details = client.get("/api/readings", params={"page": 0}).json()["error"]["details"]
    assert details[0]["field"] == "page"


# ---------- exceedances & summary ----------

def test_exceedances(client):
    got = [(e["site_id"], e["timestamp"][11:16], e["sensor"], e["value"], e["threshold"])
           for e in client.get("/api/exceedances").json()]
    assert got == EXPECTED_EXCEEDANCES
    s1 = client.get("/api/exceedances", params={"site_id": "S1"}).json()
    assert [(e["exceeded_by"], e["exceeded_by_pct"]) for e in s1] == [(3, 3.5), (0.12, 24.0)]


def test_summary_totals_and_report(client):
    body = client.get("/api/summary").json()
    assert body["totals"] == {"total_sites": 3, "total_readings": 15, "normal_readings": 9,
                              "exceeded_readings": 5, "missing_data_readings": 1, "sites_with_alerts": 3}
    assert (body["period_start"], body["period_end"]) == ("2026-11-02T07:30:00", "2026-11-02T14:00:00")
    report = body["report"]
    assert "Monitoring period: November 2, 2026, 7:30 AM – 2:00 PM" in report
    assert "5 readings (33%) exceeded their limits at 3 sites, 9 were within limits, and 1 could not be evaluated" in report
    assert "10:00 AM – Vibration (PPV): 0.62 in/s against a limit of 0.5 in/s (+0.12 in/s, 24% over)" in report
    assert "40 Atlantic Ave (S2) – Dust (PM10) at 1:00 PM: Value is blank" in report
    assert "not treated as zero" in report
    assert body["data_quality"] == ["40 Atlantic Ave – Dust (PM10) (row 10): Value is blank"]


def test_summary_for_one_site(client):
    body = client.get("/api/summary", params={"site_id": "S1"}).json()
    assert body["scope"] == "125 Broad St (S1)"
    assert body["totals"]["exceeded_readings"] == 2 and body["totals"]["missing_data_readings"] == 0
    assert "All readings were complete and valid." in body["report"]
    assert client.get("/api/summary", params={"site_id": "NOPE"}).status_code == 404


# ---------- CORS & errors ----------

def test_cors_allows_configured_origin_only(client):
    ok = client.get("/api/sites", headers={"Origin": ORIGIN})
    assert ok.headers["access-control-allow-origin"] == ORIGIN
    bad = client.get("/api/sites", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in bad.headers
    preflight = client.options("/api/sites", headers={"Origin": ORIGIN, "Access-Control-Request-Method": "PUT"})
    assert preflight.status_code == 400
    # The admin header and credentials are granted to the configured origin only.
    admin = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-sitewatch-admin"}
    good = client.options("/api/datasets", headers={"Origin": ORIGIN, **admin})
    assert good.status_code == 200 and good.headers["access-control-allow-credentials"] == "true"
    evil = client.options("/api/datasets", headers={"Origin": "https://evil.example", **admin})
    assert evil.status_code == 400 and "access-control-allow-origin" not in evil.headers


def test_unknown_route_and_method(client):
    assert client.get("/api/nope").json()["error"]["code"] == "NOT_FOUND"
    assert client.post("/api/sites").status_code == 405


# ---------- edge-case datasets ----------

def test_missing_column_is_503(make_client):
    res = make_client(["S1,Site,noise_dba,2026-11-02T10:00:00"], header="site_id,site_name,sensor,timestamp\n").get("/health")
    assert res.status_code == 503
    assert res.json()["error"] == {"code": "DATA_UNAVAILABLE", "details": None,
                                   "message": "Readings file readings.csv is missing required column(s): value."}


def test_invalid_threshold_json_is_503(make_client):
    res = make_client(["S1,Site,noise_dba,2026-11-02T10:00:00,80"], thresholds="{not json").get("/api/sites")
    assert res.status_code == 503 and "not valid JSON" in res.json()["error"]["message"]


def test_mixed_bad_rows(make_client):
    c = make_client([
        "S1,Alpha,noise_dba,2026-11-02T10:00:00,90",
        "S1,Alpha,noise_dba,2026-11-02T11:00:00,",
        "S1,Alpha,noise_dba,soon,80",
        "S1,Alpha,co2_ppm,2026-11-02T12:00:00,400",
        ",Nowhere,noise_dba,2026-11-02T12:00:00,80",
        "S2,,dust_pm10,2026-11-02T12:00:00,10",
    ], thresholds={"noise": {"limit": 85, "unit": "dBA"}, "dust": {"unit": "ug/m3"}})
    body = c.get("/api/summary").json()
    assert body["totals"]["exceeded_readings"] == 1
    assert body["totals"]["missing_data_readings"] == 5
    assert body["totals"]["total_readings"] == 6
    assert [s["site_id"] for s in body["sites"]] == ["S1", "S2"]
    assert any("Threshold 'dust' has no limit" in d for d in body["data_quality"])
    assert any("site name is blank" in d for d in body["data_quality"])
    assert c.get("/health").json()["data_warnings"] == 2
    # undated row sorts last
    assert c.get("/api/readings").json()["items"][-1]["raw_timestamp"] == "soon"


def test_no_exceedances_report(make_client):
    body = make_client(["S1,Alpha,noise_dba,2026-11-02T10:00:00,80"]).get("/api/summary").json()
    assert "None recorded in this period." in body["report"]
    assert "No action required" in body["report"]


def test_data_reloads_when_file_changes(make_client, tmp_path):
    c = make_client(["S1,Alpha,noise_dba,2026-11-02T10:00:00,80"])
    assert c.get("/api/exceedances").json() == []
    (tmp_path / "readings.csv").write_text(
        "site_id,site_name,sensor,timestamp,value\nS1,Alpha,noise_dba,2026-11-02T10:00:00,99.5\n", encoding="utf-8")
    assert [e["value"] for e in c.get("/api/exceedances").json()] == [99.5]


# ---------- deployment (Vercel) ----------

def test_docs_fall_back_to_bundled_copy_when_repo_root_absent(monkeypatch, tmp_path):
    """On Vercel only backend/ is bundled; the assistant then reads backend/project_docs/."""
    from app import config
    monkeypatch.setattr(config, "REPO_DIR", tmp_path / "missing-repo")
    assert config.default_docs_paths() == [config.BASE_DIR / "project_docs"]


def test_bundle_docs_script_copies_readme_and_docs(tmp_path):
    import shutil
    import subprocess
    import sys
    from pathlib import Path
    repo = tmp_path / "repo"
    (repo / "docs").mkdir(parents=True)
    (repo / "README.md").write_text("# Readme\n", encoding="utf-8")
    (repo / "docs" / "methodology.md").write_text("# Method\n", encoding="utf-8")
    script = Path(__file__).resolve().parents[1] / "scripts" / "bundle_docs.py"
    (repo / "backend" / "scripts").mkdir(parents=True)
    shutil.copy(script, repo / "backend" / "scripts" / "bundle_docs.py")
    subprocess.run([sys.executable, str(repo / "backend" / "scripts" / "bundle_docs.py")], check=True,
                   capture_output=True)
    assert sorted(p.name for p in (repo / "backend" / "project_docs").iterdir()) == ["README.md", "methodology.md"]


def test_environment_falls_back_to_vercel_env(monkeypatch):
    from app import config
    monkeypatch.setattr(config, "load_env_file", lambda *a, **k: None)
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.setenv("VERCEL_ENV", "production")
    assert config.Settings.from_env().environment == "production"
