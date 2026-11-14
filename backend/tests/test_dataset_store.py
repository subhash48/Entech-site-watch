"""Versioned storage on SQLite, and on PostgreSQL when TEST_DATABASE_URL points at a disposable test database."""
import os
from pathlib import Path

import pytest

from app.datasets.service import new_version_from
from app.datasets.store import STARTER_ID, DatasetStore, StorageError, open_store, split_sql
from app.datasets.validation import UploadedFile, validate_dataset
from app.errors import DataLoadError
from tests.conftest import DATA_DIR

TEST_PG = os.getenv("TEST_DATABASE_URL", "")
STARTER_CSV = (DATA_DIR / "readings.csv").read_bytes()
STARTER_JSON = (DATA_DIR / "thresholds.json").read_bytes()
TABLES = ["active_dataset", "dataset_activations", "dataset_readings", "dataset_thresholds", "dataset_versions",
          "schema_migrations"]


def reset_postgres(url: str) -> None:
    import pg8000.dbapi
    from urllib.parse import urlparse
    u = urlparse(url)
    assert "test" in u.path, "TEST_DATABASE_URL must name a disposable *test* database"
    conn = pg8000.dbapi.connect(user=u.username, password=u.password, host=u.hostname, port=u.port or 5432,
                                database=u.path.lstrip("/"))
    conn.autocommit = True
    cur = conn.cursor()
    for t in TABLES:
        cur.execute(f"DROP TABLE IF EXISTS {t} CASCADE")
    cur.execute("DROP FUNCTION IF EXISTS sitewatch_reject_change() CASCADE")
    conn.close()



@pytest.fixture(params=["sqlite", "postgres"])
def make_store(request, tmp_path):
    if request.param == "postgres":
        if not TEST_PG:
            pytest.skip("TEST_DATABASE_URL not set")
        reset_postgres(TEST_PG)
        url = TEST_PG
    else:
        url = f"sqlite:///{tmp_path / 'store.sqlite3'}"
    created: list[DatasetStore] = []

    def factory() -> DatasetStore:
        created.append(open_store(url, tmp_path / "unused.sqlite3", on_vercel=False))
        return created[-1]
    yield factory
    for s in created:
        s.close()


def upload(csv: bytes = STARTER_CSV, rules: bytes = STARTER_JSON, name="Week 46", actor="admin"):
    v = validate_dataset(UploadedFile("readings.csv", csv), UploadedFile("thresholds.json", rules), None)
    assert v.valid, v.report.errors
    return new_version_from(v, name, actor)


def raw(store: DatasetStore, sql: str):
    def q(cur):
        cur.execute(sql)
    return store._run(q, write=True)


# ---------- behaviour on both databases ----------

def test_empty_store_means_starter_is_active(make_store):
    s = make_store()
    assert s.active() is None and s.versions() == [] and s.writable


def test_create_and_activate_round_trip(make_store):
    s = make_store()
    rec = s.create(upload(), activate=True)
    assert rec.version == 1 and rec.row_count == 15 and rec.stats["exceeded_readings"] == 5
    act = s.active()
    assert act.dataset_id == rec.id and act.activated_by == "admin"
    rows, rules = s.contents(rec.id)
    assert [r.row_number for r in rows] == list(range(2, 17))
    missing = next(r for r in rows if r.row_number == 10)
    assert missing.value == "" and missing.sensor == "dust_pm10"            # blank stays blank, never "0"
    assert rules == {"vibration_ppv": {"limit": 0.5, "unit": "in/s"}, "noise_dba": {"limit": 85.0, "unit": "dBA"},
                     "dust_pm10": {"limit": 150.0, "unit": "ug/m3"}}
    assert s.source_texts(rec.id) == (STARTER_CSV.decode(), STARTER_JSON.decode())


def test_preview_style_create_without_activation_keeps_active(make_store):
    s = make_store()
    first = s.create(upload(), activate=True)
    second = s.create(upload(name="Draft"), activate=False)
    assert second.version == 2 and s.active().dataset_id == first.id
    assert [v.version for v in s.versions()] == [2, 1]


def test_activate_and_rollback_including_starter(make_store):
    s = make_store()
    v1 = s.create(upload(), activate=True)
    v2 = s.create(upload(name="v2"), activate=True)
    assert s.activate(v1.id, "admin") == v2.id and s.active().dataset_id == v1.id
    assert s.activate(STARTER_ID, "admin") == v1.id and s.active().dataset_id == STARTER_ID
    with pytest.raises(ValueError):
        s.activate("no-such-id", "admin")
    assert s.active().dataset_id == STARTER_ID
    assert set(s.last_activations()) == {v1.id, v2.id, STARTER_ID}


def test_persistence_across_independent_instances(make_store):
    """Two store objects stand in for two Vercel Function instances."""
    a, b = make_store(), make_store()
    rec = a.create(upload(), activate=True)
    assert b.active().dataset_id == rec.id and b.version(rec.id).name == "Week 46"
    b.activate(STARTER_ID, "admin")
    assert a.active().dataset_id == STARTER_ID                 # no stale pointer cached in `a`


def test_versions_are_immutable(make_store):
    s = make_store()
    s.create(upload(), activate=True)
    for sql in ("UPDATE dataset_versions SET name = 'x'", "DELETE FROM dataset_readings",
                "UPDATE dataset_thresholds SET limit_value = 1"):
        with pytest.raises(DataLoadError):
            raw(s, sql)
    assert s.versions()[0].name == "Week 46"


def test_failed_write_stores_nothing(make_store):
    s = make_store()
    good = s.create(upload(), activate=True)
    broken = upload(name="broken")
    broken.measured_at.pop(broken.rows[-1].row_number)          # fails mid-transaction
    with pytest.raises(Exception):
        s.create(broken, activate=True)
    assert [v.version for v in s.versions()] == [1] and s.active().dataset_id == good.id


def test_migrations_are_idempotent(make_store):
    s1, s2 = make_store(), make_store()
    s1.migrate(); s2.migrate()
    assert s2.versions() == []


def test_large_upload_uses_chunked_inserts(make_store):
    lines = ["site_id,site_name,sensor,timestamp,value"]
    lines += [f"S{i % 7},Site {i % 7},noise_dba,2026-11-02T{(i // 60) % 24:02d}:{i % 60:02d}:{(i // 1440) % 60:02d},"
              f"{70 + i % 30}" for i in range(6000)]
    s = make_store()
    rec = s.create(upload(("\n".join(lines) + "\n").encode()), activate=True)
    assert rec.row_count == 6000 and len(s.contents(rec.id)[0]) == 6000


# ---------- configuration ----------

def test_open_store_selection(tmp_path):
    assert open_store(None, tmp_path / "x.db", on_vercel=False).mode == "sqlite"
    off = open_store(None, tmp_path / "x.db", on_vercel=True)
    assert (off.mode, off.writable) == ("none", False) and "DATABASE_URL" in off.message
    assert off.active() is None and off.versions() == []
    with pytest.raises(StorageError):
        off.create(upload(), activate=True)
    assert open_store("sqlite:///tmp.db", tmp_path / "x.db", on_vercel=True).mode == "none"   # never SQLite on Vercel
    assert open_store("mysql://x", tmp_path / "x.db", on_vercel=False).mode == "none"
    pg = open_store("postgresql://u:p%40ss@db.example.com:6543/app?sslmode=require", tmp_path / "x.db", on_vercel=True)
    assert pg.mode == "postgres" and pg.backend.kwargs["password"] == "p@ss" and pg.backend.kwargs["port"] == 6543
    assert pg.backend.kwargs["ssl_context"] is not None


def test_unreachable_database_is_a_clear_503_error(tmp_path):
    s = open_store("postgresql://u:p@127.0.0.1:1/none?sslmode=disable", tmp_path / "x.db", on_vercel=True)
    with pytest.raises(DataLoadError, match="Dataset storage"):
        s.active()
    s.close()


def test_split_sqlite_keeps_trigger_bodies_whole():
    from app.datasets.store import split_sqlite
    stmts = split_sqlite("-- c\nCREATE TABLE a (x);\nCREATE TRIGGER t BEFORE DELETE ON a\n"
                         "BEGIN SELECT RAISE(ABORT, 'no'); END;\n")
    assert len(stmts) == 2 and stmts[1].endswith("END")


def test_split_sql_keeps_function_bodies_whole():
    stmts = split_sql("CREATE TABLE a (x text); -- note; here\nCREATE FUNCTION f() RETURNS trigger AS $$ BEGIN "
                      "RAISE EXCEPTION 'no; way'; END; $$ LANGUAGE plpgsql;\nSELECT ';'")
    assert len(stmts) == 3 and stmts[1].endswith("LANGUAGE plpgsql") and stmts[2] == "SELECT ';'"


def test_sqlite_file_is_never_inside_the_source_tree_on_vercel(tmp_path):
    s = open_store(None, Path("backend/.local/x.sqlite3"), on_vercel=True)
    assert s.backend is None and not s.writable
