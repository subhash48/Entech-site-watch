"""Every endpoint follows the active dataset version; switching is visible to all instances immediately."""
from fastapi.testclient import TestClient

from app.datasets.service import new_version_from
from app.datasets.store import STARTER_ID
from app.datasets.validation import UploadedFile, validate_dataset
from app.main import create_app
from tests.conftest import DATA_DIR, settings_for

WEEK_46 = """site_id,site_name,sensor,timestamp,value
S1,125 Broad St,noise_dba,2026-11-09T08:00:00,92
S1,125 Broad St,vibration_ppv,2026-11-09T08:00:00,0.31
S4,Pier 17,dust_pm10,2026-11-09T09:00:00,
S4,Pier 17,dust_pm10,2026-11-09T10:00:00,120
"""
RULES = '{"vibration_ppv": {"limit": 0.5, "unit": "in/s"}, "noise_dba": {"limit": 90, "unit": "dBA"}, ' \
        '"dust_pm10": {"limit": 150, "unit": "ug/m3"}}'


def make_app(db_path):
    s = settings_for(DATA_DIR / "readings.csv", DATA_DIR / "thresholds.json")
    s = s.__class__(**{**s.__dict__, "database_url": f"sqlite:///{db_path}", "on_vercel": False})
    return create_app(s)


def store_week46(app, activate=True, name="Week 46"):
    v = validate_dataset(UploadedFile("week46.csv", WEEK_46.encode()), UploadedFile("rules.json", RULES.encode()), None)
    assert v.valid
    return app.state.datasets.store.create(new_version_from(v, name, "admin"), activate=activate)


def test_all_endpoints_switch_to_the_activated_version(tmp_path):
    app = make_app(tmp_path / "db.sqlite3")
    c = TestClient(app)
    assert c.get("/api/overview").json()["totals"]["total_readings"] == 15
    rec = store_week46(app)

    ov = c.get("/api/overview").json()
    assert ov["totals"] == {"total_sites": 2, "total_readings": 4, "normal_readings": 2, "exceeded_readings": 1,
                            "missing_data_readings": 1, "sites_with_alerts": 1}
    src = ov["data_source"]
    assert src["type"] == "uploaded_dataset" and src["files"] == ["week46.csv", "rules.json"]
    assert src["dataset"]["version"] == 1 and src["dataset"]["name"] == "Week 46"
    assert src["dataset"]["activated_at"] and "not a live" in src["note"]
    assert ov["available_dates"] == ["2026-11-09"]                                  # filter options
    assert {t["sensor"] for t in ov["trends"]} == {"noise_dba", "vibration_ppv", "dust_pm10"}   # charts

    assert [s["site_id"] for s in c.get("/api/sites").json()] == ["S1", "S4"]
    assert c.get("/api/sites/S4").json()["missing_data_count"] == 1
    assert c.get("/api/sites/S2").status_code == 404
    assert c.get("/api/readings").json()["total"] == 4
    ex = c.get("/api/exceedances").json()
    assert [(e["site_id"], e["value"], e["threshold"]) for e in ex] == [("S1", 92.0, 90.0)]
    assert {t["sensor"]: t["limit"] for t in c.get("/api/thresholds").json()}["noise_dba"] == 90
    assert "Pier 17" in c.get("/api/summary").json()["report"]
    assert {s["sensor"] for s in c.get("/api/sensors").json()} == {"noise_dba", "vibration_ppv", "dust_pm10"}
    h = c.get("/health").json()
    assert (h["readings_loaded"], h["dataset"]["id"], h["storage"]) == (4, rec.id, "sqlite")

    # Missing measurement stays null, never zero.
    missing = c.get("/api/readings", params={"status": "MISSING_DATA"}).json()["items"][0]
    assert missing["value"] is None and missing["raw_value"] == ""


def test_rollback_to_starter_and_back(tmp_path):
    app = make_app(tmp_path / "db.sqlite3")
    c = TestClient(app)
    rec = store_week46(app)
    app.state.datasets.store.activate(STARTER_ID, "admin")
    ov = c.get("/api/overview").json()
    assert ov["totals"]["total_readings"] == 15 and ov["data_source"]["dataset"]["version"] == 0
    app.state.datasets.store.activate(rec.id, "admin")
    assert c.get("/api/overview").json()["totals"]["total_readings"] == 4


def test_stored_but_inactive_version_is_not_served(tmp_path):
    app = make_app(tmp_path / "db.sqlite3")
    store_week46(app, activate=False)
    assert TestClient(app).get("/api/overview").json()["totals"]["total_readings"] == 15


def test_two_instances_never_serve_a_stale_version(tmp_path):
    """Separate apps (= separate Vercel Function instances) sharing one database."""
    db = tmp_path / "db.sqlite3"
    a, b = make_app(db), make_app(db)
    ca, cb = TestClient(a), TestClient(b)
    assert cb.get("/api/overview").json()["totals"]["total_readings"] == 15     # b warms its caches
    rec = store_week46(a)
    assert cb.get("/api/overview").json()["totals"]["total_readings"] == 4
    a.state.datasets.store.activate(STARTER_ID, "admin")
    assert cb.get("/api/exceedances").json()[0]["site_id"] == "S3"               # starter again in b
    b.state.datasets.store.activate(rec.id, "admin")
    assert ca.get("/api/sites").json()[-1]["site_id"] == "S4"


def test_versions_are_cached_by_immutable_id(tmp_path, monkeypatch):
    app = make_app(tmp_path / "db.sqlite3")
    store_week46(app)
    svc = app.state.datasets
    calls = []
    original = svc.store.contents
    monkeypatch.setattr(svc.store, "contents", lambda i: calls.append(i) or original(i))
    c = TestClient(app)
    for _ in range(3):
        c.get("/api/overview")
    assert len(calls) == 1


def test_upload_warnings_become_data_quality_notes(tmp_path):
    app = make_app(tmp_path / "db.sqlite3")
    dup = WEEK_46 + "S1,125 Broad St,noise_dba,2026-11-09T08:00:00,92\n"
    v = validate_dataset(UploadedFile("w.csv", dup.encode()), UploadedFile("r.json", RULES.encode()), None)
    app.state.datasets.store.create(new_version_from(v, "dup", "admin"), activate=True)
    warnings = TestClient(app).get("/api/overview").json()["validation"]["warnings"]
    assert any("duplicate" in w.lower() and "6" in w for w in warnings)
