"""Dataset endpoints and admin access: auth, CSRF, preview without activation, upload, rollback, limits."""
import time

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.api import datasets as datasets_api
from app.datasets import validation as v
from app.main import create_app
from tests.conftest import DATA_DIR, ORIGIN, settings_for

TOKEN = "test-admin-token-0123456789"
WRITE = {"X-SiteWatch-Admin": "1"}
BEARER = {"Authorization": f"Bearer {TOKEN}"}
WEEK_46 = ("site_id,site_name,sensor,timestamp,value\n"
           "S1,125 Broad St,noise_dba,2026-11-09T08:00:00,92\n"
           "S4,Pier 17,dust_pm10,2026-11-09T09:00:00,\n"
           "S4,Pier 17,dust_pm10,2026-11-09T10:00:00,120\n")
RULES = (DATA_DIR / "thresholds.json").read_text()


@pytest.fixture(autouse=True)
def fresh_throttle(monkeypatch):
    monkeypatch.setattr(datasets_api, "throttle", auth.LoginThrottle())


def make_app(tmp_path, token=TOKEN, storage=True):
    s = settings_for(DATA_DIR / "readings.csv", DATA_DIR / "thresholds.json")
    extra = {"admin_token": token}
    if storage:
        extra |= {"database_url": f"sqlite:///{tmp_path / 'db.sqlite3'}", "on_vercel": False}
    return create_app(s.__class__(**{**s.__dict__, **extra}))


def signed_in(tmp_path, **kw) -> TestClient:
    # HTTPS so the Secure cookie set under Vercel-like settings is sent back, as in production.
    c = TestClient(make_app(tmp_path, **kw), base_url="https://testserver")
    assert c.post("/api/admin/session", json={"token": TOKEN}).status_code == 200
    return c


def files(readings=WEEK_46, rules=RULES, rname="week46.csv", tname="thresholds.json"):
    out = {}
    if readings is not None:
        out["readings"] = (rname, readings.encode() if isinstance(readings, str) else readings, "text/csv")
    if rules is not None:
        out["thresholds"] = (tname, rules.encode(), "application/json")
    return out


# ---------- admin access ----------

def test_uploads_require_an_administrator(tmp_path):
    c = TestClient(make_app(tmp_path))
    for method, path in [("post", "/api/datasets/preview"), ("post", "/api/datasets"),
                         ("post", "/api/datasets/starter/activate"), ("get", "/api/datasets/starter/validation")]:
        res = getattr(c, method)(path, headers=WRITE, **({"files": files()} if method == "post" else {}))
        assert res.status_code == 401 and res.json()["error"]["code"] == "ADMIN_REQUIRED", path
    assert c.get("/api/datasets").status_code == 200 and c.get("/api/datasets/active").status_code == 200


def test_sign_in_sets_a_hardened_session_cookie(tmp_path):
    c = TestClient(make_app(tmp_path))
    assert c.get("/api/admin/session").json()["authenticated"] is False
    res = c.post("/api/admin/session", json={"token": TOKEN})
    cookie = res.headers["set-cookie"].lower()
    assert res.json()["authenticated"] and "httponly" in cookie and "samesite=strict" in cookie and "path=/api" in cookie
    assert TOKEN.lower() not in cookie
    assert c.get("/api/admin/session").json()["authenticated"] is True
    c.delete("/api/admin/session")
    assert c.get("/api/admin/session").json()["authenticated"] is False


def test_wrong_token_and_throttling(tmp_path):
    c = TestClient(make_app(tmp_path))
    for _ in range(auth.MAX_FAILURES):
        assert c.post("/api/admin/session", json={"token": "nope"}).json()["error"]["code"] == "INVALID_ADMIN_TOKEN"
    assert c.post("/api/admin/session", json={"token": TOKEN}).status_code == 429


def test_cookie_writes_need_the_csrf_header(tmp_path):
    c = signed_in(tmp_path)
    res = c.post("/api/datasets/preview", files=files())
    assert res.status_code == 403 and res.json()["error"]["code"] == "CSRF_CHECK_FAILED"
    assert c.post("/api/datasets/preview", files=files(), headers=WRITE).status_code == 200


def test_bearer_token_works_for_scripts_without_cookie(tmp_path):
    c = TestClient(make_app(tmp_path))
    assert c.post("/api/datasets/preview", files=files(), headers=BEARER).status_code == 200
    assert c.post("/api/datasets/preview", files=files(), headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_tampered_or_expired_session_is_rejected(tmp_path):
    app = make_app(tmp_path)
    settings = app.state.settings
    value, _ = auth.sign_session(settings)
    assert auth.verify_session(settings, value)
    assert auth.verify_session(settings, value[:-2] + "xx") is None
    old, _ = auth.sign_session(settings, now=time.time() - auth.SESSION_SECONDS - 10)
    assert auth.verify_session(settings, old) is None
    rotated = settings.__class__(**{**settings.__dict__, "admin_token": TOKEN + "-rotated"})
    assert auth.verify_session(rotated, value) is None


def test_admin_disabled_without_token(tmp_path):
    c = TestClient(make_app(tmp_path, token=None))
    assert c.get("/api/admin/session").json()["admin_configured"] is False
    assert c.post("/api/admin/session", json={"token": "x"}).json()["error"]["code"] == "ADMIN_NOT_CONFIGURED"
    assert c.post("/api/datasets/preview", files=files(), headers=WRITE).status_code == 503
    short = TestClient(make_app(tmp_path, token="short"))                 # too short to be accepted
    assert short.get("/api/admin/session").json()["admin_configured"] is False


# ---------- preview ----------

def test_preview_reports_results_without_activating(tmp_path):
    c = signed_in(tmp_path)
    body = c.post("/api/datasets/preview", files=files(), headers=WRITE).json()
    assert body["validation"]["valid"] and body["activated"] is False
    assert body["stats"]["total_rows"] == 3 and body["stats"]["exceeded_readings"] == 1
    assert body["stats"]["missing_readings"] == 1 and body["stats"]["sensor_categories"] == ["dust", "noise"]
    assert [r["id"] for r in body["preview_rows"]] == [2, 3, 4]
    assert body["comparison"]["against"] == "v0 · Starter dataset" and body["comparison"]["sites_added"] == ["S4"]
    assert c.get("/api/overview").json()["totals"]["total_readings"] == 15        # nothing changed
    assert c.get("/api/datasets").json()["versions"][0]["id"] == "starter"       # nothing stored


def test_preview_of_invalid_files_lists_blocking_errors_with_rows(tmp_path):
    c = signed_in(tmp_path)
    bad = WEEK_46 + "S 5,Bad Site,noise_dba,yesterday,loud\n"
    body = c.post("/api/datasets/preview", files=files(bad), headers=WRITE).json()
    assert body["validation"]["valid"] is False and body["stats"] is None
    errs = {e["code"]: e["rows"] for e in body["validation"]["errors"]}
    assert errs == {"INVALID_SITE_ID": [5], "INVALID_TIMESTAMP": [5], "INVALID_VALUE": [5]}


def test_single_file_preview_reuses_active_thresholds(tmp_path):
    c = signed_in(tmp_path)
    body = c.post("/api/datasets/preview", files=files(rules=None), headers=WRITE).json()
    assert body["validation"]["valid"]
    assert [f["source"] for f in body["validation"]["files"]] == ["uploaded", "active_dataset"]


def test_unknown_sensor_and_bad_thresholds_block(tmp_path):
    c = signed_in(tmp_path)
    unknown = c.post("/api/datasets/preview", headers=WRITE,
                     files=files(WEEK_46 + "S1,125 Broad St,temp_c,2026-11-09T11:00:00,20\n")).json()
    assert [e["code"] for e in unknown["validation"]["errors"]] == ["UNKNOWN_SENSOR"]
    bad_rules = c.post("/api/datasets/preview", headers=WRITE,
                       files=files(rules='{"noise_dba": {"limit": "loud", "unit": "dBA"}}')).json()
    assert "INVALID_LIMIT" in [e["code"] for e in bad_rules["validation"]["errors"]]


def test_wrong_file_types_are_rejected(tmp_path):
    c = signed_in(tmp_path)
    body = c.post("/api/datasets/preview", headers=WRITE, files=files(rname="readings.xlsx")).json()
    assert body["validation"]["errors"][0]["code"] == "WRONG_FILE_TYPE"


def test_oversized_files_and_requests_are_rejected(tmp_path, monkeypatch):
    c = signed_in(tmp_path)
    monkeypatch.setattr(v, "MAX_READINGS_BYTES", 64)
    res = c.post("/api/datasets/preview", files=files(), headers=WRITE)
    assert res.status_code == 413 and res.json()["error"]["code"] == "FILE_TOO_LARGE"
    big = c.post("/api/datasets/preview", headers={**WRITE, "Content-Length": "9000000"}, content=b"x")
    assert big.status_code == 413 and big.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


# ---------- store, activate, roll back ----------

def test_upload_activate_and_rollback(tmp_path):
    c = signed_in(tmp_path)
    res = c.post("/api/datasets", files=files(), data={"name": "  Week   46 upload "}, headers=WRITE)
    assert res.status_code == 201
    body = res.json()
    v1 = body["dataset"]
    assert body["activated"] and v1["version"] == 1 and v1["name"] == "Week 46 upload" and v1["is_active"]
    assert body["previous_active_id"] == "starter" and v1["created_by"] == "admin"
    assert c.get("/api/overview").json()["totals"]["total_readings"] == 3
    assert c.get("/api/datasets/active").json()["id"] == v1["id"]

    draft = c.post("/api/datasets", files=files(rules=None), data={"name": "Draft", "activate": "false"},
                   headers=WRITE).json()
    assert draft["activated"] is False and c.get("/api/datasets/active").json()["id"] == v1["id"]

    listed = c.get("/api/datasets").json()
    assert [x["version"] for x in listed["versions"]] == [2, 1, 0]
    assert [x["is_active"] for x in listed["versions"]] == [False, True, False]
    assert listed["storage"] == {"mode": "sqlite", "writable": True, "message": listed["storage"]["message"]}

    back = c.post("/api/datasets/starter/activate", headers=WRITE).json()
    assert back["previous_active_id"] == v1["id"] and back["dataset"]["is_active"]
    assert c.get("/api/overview").json()["totals"]["total_readings"] == 15
    assert c.post(f"/api/datasets/{draft['dataset']['id']}/activate", headers=WRITE).status_code == 200
    assert c.get("/api/overview").json()["data_source"]["dataset"]["name"] == "Draft"


def test_invalid_upload_is_not_stored(tmp_path):
    c = signed_in(tmp_path)
    res = c.post("/api/datasets", files=files(WEEK_46 + "S1,125 Broad St,noise_dba,bad,1\n"), headers=WRITE)
    assert res.status_code == 422 and res.json()["error"]["code"] == "DATASET_INVALID"
    assert res.json()["error"]["details"]["errors"][0]["rows"] == [5]
    assert len(c.get("/api/datasets").json()["versions"]) == 1


def test_unknown_and_malformed_dataset_ids(tmp_path):
    c = signed_in(tmp_path)
    assert c.post("/api/datasets/00000000-0000-0000-0000-000000000000/activate", headers=WRITE).status_code == 404
    assert c.post("/api/datasets/..%2F..%2Fetc/activate", headers=WRITE).status_code in (404, 422)
    assert c.get("/api/datasets/not-an-id/validation").status_code == 422


def test_stored_validation_report(tmp_path):
    c = signed_in(tmp_path)
    dup = WEEK_46 + "S1,125 Broad St,noise_dba,2026-11-09T08:00:00,92\n"
    v1 = c.post("/api/datasets", files=files(dup), headers=WRITE).json()["dataset"]
    report = c.get(f"/api/datasets/{v1['id']}/validation").json()
    assert report["valid"] and {w["code"] for w in report["warnings"]} == {"MISSING_VALUE", "DUPLICATE_ROW", "UNUSED_THRESHOLD"}
    assert c.get("/api/datasets/starter/validation").json()["valid"] is True


def test_persistence_between_independent_app_instances(tmp_path):
    c1 = signed_in(tmp_path)
    v1 = c1.post("/api/datasets", files=files(), headers=WRITE).json()["dataset"]
    c2 = TestClient(make_app(tmp_path))                      # a cold start: new process state, same database
    assert c2.get("/api/datasets/active").json()["id"] == v1["id"]
    assert c2.get("/api/sites").json()[-1]["site_name"] == "Pier 17"


def test_secure_cookie_on_vercel_is_not_sent_over_plain_http(tmp_path):
    app = make_app(tmp_path, storage=False)                   # on_vercel=True -> Secure cookie
    c = TestClient(app)
    assert "secure" in c.post("/api/admin/session", json={"token": TOKEN}).headers["set-cookie"].lower()
    assert c.get("/api/admin/session").json()["authenticated"] is False


def test_without_storage_preview_works_but_saving_is_refused(tmp_path):
    c = signed_in(tmp_path, storage=False)
    status = c.get("/api/admin/session").json()["storage"]
    assert status["writable"] is False and "DATABASE_URL" in status["message"]
    assert c.post("/api/datasets/preview", files=files(), headers=WRITE).json()["validation"]["valid"]
    res = c.post("/api/datasets", files=files(), headers=WRITE)
    assert res.status_code == 503 and res.json()["error"]["code"] == "STORAGE_NOT_CONFIGURED"
    assert c.post("/api/datasets/starter/activate", headers=WRITE).status_code == 503
    assert c.get("/api/overview").json()["totals"]["total_readings"] == 15


def test_cross_origin_admin_requests_from_the_configured_origin(tmp_path):
    c = signed_in(tmp_path)
    res = c.post("/api/datasets/preview", files=files(), headers={**WRITE, "Origin": ORIGIN})
    assert res.status_code == 200 and res.headers["access-control-allow-credentials"] == "true"
