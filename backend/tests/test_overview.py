"""/api/overview, /api/sites/{id} detail, readings search and sorting."""


def test_overview_matches_csv(client):
    body = client.get("/api/overview").json()
    assert body["totals"] == {"total_sites": 3, "total_readings": 15, "normal_readings": 9,
                              "exceeded_readings": 5, "missing_data_readings": 1, "sites_with_alerts": 3}
    assert body["data_source"]["type"] == "static_files"
    assert "not a live or real-time feed" in body["data_source"]["note"]
    breakdown = {b["sensor"]: (b["total"], b["normal"], b["exceeded"], b["missing_data"], b["threshold"])
                 for b in body["sensor_breakdown"]}
    assert breakdown == {"dust_pm10": (5, 3, 1, 1, 150), "noise_dba": (5, 3, 2, 0, 85),
                         "vibration_ppv": (5, 3, 2, 0, 0.5)}
    dust = next(t for t in body["trends"] if t["sensor"] == "dust_pm10")
    gap = next(p for p in dust["points"] if p["status"] == "MISSING_DATA")
    assert gap["value"] is None  # charts show a gap, not zero
    assert [a["timestamp"][11:16] for a in body["recent_alerts"]] == ["11:30", "10:00", "10:00", "09:00", "07:30"]
    assert body["validation"]["invalid_rows"] == [{"row": 10, "site_id": "S2", "sensor": "dust_pm10",
                                                   "raw_timestamp": "2026-11-02T13:00:00", "raw_value": "",
                                                   "issues": ["Value is blank"]}]


def test_site_detail_groups_by_sensor(client):
    body = client.get("/api/sites/S1").json()
    assert (body["site_name"], body["status"], body["exceeded_count"]) == ("125 Broad St", "ALERT", 2)
    groups = {g["sensor"]: g for g in body["sensor_groups"]}
    assert set(groups) == {"dust_pm10", "noise_dba", "vibration_ppv"}
    vib = groups["vibration_ppv"]
    assert (vib["threshold"]["limit"], vib["threshold"]["unit"], vib["exceeded_count"], vib["max_value"]) == (0.5, "in/s", 1, 0.62)
    assert [r["exceeded_by"] for r in vib["readings"]] == [None, 0.12]
    assert [(e["sensor"], e["exceeded_by_pct"]) for e in body["exceedances"]] == [("noise_dba", 3.5), ("vibration_ppv", 24.0)]


def test_readings_search(client):
    get = lambda **p: client.get("/api/readings", params=p).json()
    assert get(q="atlantic")["total"] == 5
    assert get(q="atlantic dust")["total"] == 2
    assert get(q="exceeded")["total"] == 5
    assert get(q="zzz")["total"] == 0


def test_readings_sort_by_value_puts_missing_last(client):
    items = client.get("/api/readings", params={"sensor": "dust", "sort": "value", "order": "desc"}).json()["items"]
    assert [r["value"] for r in items] == [171, 95, 88, 60, None]
    items = client.get("/api/readings", params={"sensor": "dust", "sort": "value"}).json()["items"]
    assert [r["value"] for r in items] == [60, 88, 95, 171, None]


def test_sensor_type_filter(client):
    assert client.get("/api/readings", params={"sensor": "vibration"}).json()["total"] == 5
    assert len(client.get("/api/exceedances", params={"sensor": "noise"}).json()) == 2
    res = client.get("/api/readings", params={"sort": "colour"})
    assert res.status_code == 422


def test_exceedances_desc(client):
    got = [e["timestamp"][11:16] for e in client.get("/api/exceedances", params={"order": "desc"}).json()]
    assert got == ["11:30", "10:00", "10:00", "09:00", "07:30"]


def test_response_schemas_documented(client):
    spec = client.get("/openapi.json").json()
    for path in ["/health", "/api/overview", "/api/sites", "/api/sites/{site_id}", "/api/readings",
                 "/api/exceedances", "/api/summary", "/api/chat"]:
        assert path in spec["paths"], path
    assert "ErrorResponse" in spec["components"]["schemas"]


def test_overview_filters_narrow_every_count(client):
    s1 = client.get("/api/overview", params={"site_id": "S1"}).json()
    assert [s["site_id"] for s in s1["sites"]] == ["S1"]
    assert s1["totals"] == {"total_sites": 1, "total_readings": 5, "normal_readings": 3, "exceeded_readings": 2,
                            "missing_data_readings": 0, "sites_with_alerts": 1}
    noise = client.get("/api/overview", params={"sensor": "noise"}).json()
    assert [b["sensor"] for b in noise["sensor_breakdown"]] == ["noise_dba"]
    assert noise["totals"]["exceeded_readings"] == 2 and noise["totals"]["sites_with_alerts"] == 2
    missing = client.get("/api/overview", params={"status": "MISSING_DATA"}).json()
    assert missing["totals"]["total_readings"] == 1 and missing["recent_alerts"] == []
    window = client.get("/api/overview", params={"start": "2026-11-02T10:00:00", "end": "2026-11-02T11:30:00"}).json()
    assert window["totals"]["total_readings"] == 5 and window["totals"]["exceeded_readings"] == 3
    assert window["available_dates"] == ["2026-11-02"]  # options always come from the full dataset
    empty = client.get("/api/overview", params={"start": "2026-11-03T00:00:00"}).json()
    assert empty["totals"]["total_readings"] == 0 and empty["period_start"] is None
    assert client.get("/api/overview", params={"site_id": "NOPE"}).status_code == 404


def test_alert_severity_rule(client):
    got = {(e["site_id"], e["sensor"]): (e["exceeded_by_pct"], e["severity"])
           for e in client.get("/api/exceedances").json()}
    assert got == {("S1", "vibration_ppv"): (24.0, "high"), ("S2", "dust_pm10"): (14.0, "medium"),
                   ("S3", "vibration_ppv"): (10.0, "medium"), ("S3", "noise_dba"): (7.1, "medium"),
                   ("S1", "noise_dba"): (3.5, "low")}
