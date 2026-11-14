"""Durable, versioned dataset storage.

- PostgreSQL (DATABASE_URL) in production, through the pure-Python pg8000 driver.
- SQLite only for local development, never on Vercel: a Vercel Function's filesystem is not durable.
- No storage configured on Vercel: read-only. The dashboard serves the committed starter dataset and
  uploads are refused with a clear explanation instead of pretending to be saved.

Every import is an immutable version (the database rejects UPDATE/DELETE on version rows). The active
version is one pointer row, switched in the same transaction that records the activation.
"""
import json
import logging
import re
import sqlite3
import ssl
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qs, unquote, urlparse

from app.errors import DataLoadError
from app.services.readings import RawRow

log = logging.getLogger("sitewatch.datasets")
MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
INSERT_CHUNK = 500          # rows per multi-row INSERT (9 parameters each)
STARTER_ID = "starter"


class StorageError(Exception):
    """Storage is not configured, not writable, or failed."""


@dataclass(frozen=True)
class VersionRecord:
    id: str
    version: int
    name: str
    created_at: datetime
    created_by: str
    readings_filename: str
    thresholds_filename: str
    readings_sha256: str
    thresholds_sha256: str
    row_count: int
    stats: dict
    validation: dict


@dataclass(frozen=True)
class Activation:
    dataset_id: str            # STARTER_ID for the starter dataset
    activated_at: datetime
    activated_by: str


@dataclass(frozen=True)
class NewVersion:
    name: str
    created_by: str
    readings_filename: str
    thresholds_filename: str
    readings_sha256: str
    thresholds_sha256: str
    readings_csv: str
    thresholds_json: str
    stats: dict
    validation: dict
    rows: list[RawRow]
    thresholds: dict[str, dict]
    measured_at: dict[int, datetime]   # row_number -> parsed timestamp (naive UTC)
    values: dict[int, float | None]    # row_number -> parsed value


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def _dt(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    dt = datetime.fromisoformat(str(value))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _json(value: Any) -> dict:
    return value if isinstance(value, dict) else json.loads(value)


def split_sqlite(script: str) -> list[str]:
    """SQLite statements, keeping CREATE TRIGGER ... BEGIN ...; END; blocks whole."""
    out, buf = [], ""
    for line in script.splitlines(keepends=True):
        if not buf and line.strip().startswith("--"):
            continue
        buf += line
        if sqlite3.complete_statement(buf):
            out.append(buf.strip().rstrip(";").strip())
            buf = ""
    if buf.strip():
        out.append(buf.strip())
    return [stmt for stmt in out if stmt]


def split_sql(script: str) -> list[str]:
    """Split a PostgreSQL migration into statements, respecting quotes, $$ bodies and -- comments."""
    out, buf, i, quote, dollar = [], [], 0, None, None
    while i < len(script):
        ch = script[i]
        if dollar:
            if script.startswith(dollar, i):
                buf.append(dollar); i += len(dollar); dollar = None; continue
        elif quote:
            if ch == quote:
                quote = None
        elif script.startswith("--", i):
            end = script.find("\n", i)
            i = len(script) if end < 0 else end
            continue
        elif ch == "'":
            quote = ch
        elif ch == "$":
            m = re.match(r"\$[A-Za-z_]*\$", script[i:])
            if m:
                dollar = m.group(0); buf.append(dollar); i += len(dollar); continue
        elif ch == ";":
            stmt = "".join(buf).strip()
            if stmt:
                out.append(stmt)
            buf, i = [], i + 1
            continue
        buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        out.append(tail)
    return out


# ---------- connections ----------

class _Backend:
    """Minimal adapter so the same SQL (with ? placeholders) runs on SQLite and PostgreSQL."""
    dialect: str

    def connect(self):
        raise NotImplementedError

    def sql(self, query: str) -> str:
        return query

    def begin(self, conn) -> None:
        pass


class _Sqlite(_Backend):
    dialect = "sqlite"

    def __init__(self, path: Path):
        self.path = path

    def connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path, timeout=10, isolation_level=None, check_same_thread=False)
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        return conn

    def begin(self, conn) -> None:
        conn.execute("BEGIN IMMEDIATE")         # serialize writers


class _Postgres(_Backend):
    dialect = "postgres"

    def __init__(self, url: str):
        u = urlparse(url)
        q = {k: v[-1] for k, v in parse_qs(u.query).items()}
        self.kwargs = dict(user=unquote(u.username or ""), password=unquote(u.password or "") or None,
                           host=u.hostname or "localhost", port=u.port or 5432,
                           database=unquote((u.path or "/").lstrip("/")) or "postgres", timeout=15,
                           application_name="sitewatch-api")
        mode = q.get("sslmode", "prefer" if self.kwargs["host"] in ("localhost", "127.0.0.1") else "require")
        if mode in ("disable", "allow", "prefer") and self.kwargs["host"] in ("localhost", "127.0.0.1"):
            self.kwargs["ssl_context"] = None
        elif mode in ("verify-ca", "verify-full"):
            self.kwargs["ssl_context"] = ssl.create_default_context()
        else:
            # libpq "require": encrypted, certificate not verified (matches hosted providers' defaults).
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            self.kwargs["ssl_context"] = ctx

    def connect(self):
        import pg8000.dbapi  # imported lazily: only needed when DATABASE_URL is set

        conn = pg8000.dbapi.connect(**self.kwargs)
        conn.autocommit = True
        return conn

    def sql(self, query: str) -> str:
        return query.replace("?", "%s")

    def begin(self, conn) -> None:
        conn.cursor().execute("BEGIN")


class DatasetStore:
    """Read/write access to stored versions. Methods are safe to call from FastAPI's thread pool."""

    def __init__(self, backend: _Backend | None, mode: str, writable: bool, message: str):
        self.backend, self.mode, self.writable, self.message = backend, mode, writable, message
        self._local = threading.local()
        self._migrated = False
        self._lock = threading.Lock()

    # -- plumbing --

    def _conn(self):
        conn = getattr(self._local, "conn", None)
        if conn is None:
            try:
                conn = self.backend.connect()
            except Exception as e:  # network, auth, TLS
                log.error("Dataset storage connection failed: %s", type(e).__name__)
                raise DataLoadError("Dataset storage is unavailable. Check DATABASE_URL and that the database is "
                                    "reachable.") from None
            self._local.conn = conn
        return conn

    def close(self) -> None:
        """Close this thread's connection (tests; a Function instance keeps it for reuse)."""
        self._drop_conn()

    def _drop_conn(self) -> None:
        conn = getattr(self._local, "conn", None)
        self._local.conn = None
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass

    def _run(self, fn, write: bool = False):
        """Run fn(cursor) on this thread's connection, in a transaction when writing.
        A broken connection (e.g. dropped by the server between invocations) is retried once."""
        if self.backend is None:
            raise StorageError(self.message)
        self.migrate()
        for attempt in (1, 2):
            conn = self._conn()
            try:
                cur = conn.cursor()
                if write:
                    self.backend.begin(conn)
                try:
                    result = fn(cur)
                    if write:
                        cur.execute("COMMIT")
                    return result
                except Exception:
                    if write:
                        try:
                            cur.execute("ROLLBACK")
                        except Exception:
                            pass
                    raise
            except (StorageError, DataLoadError, ValueError):
                raise
            except Exception as e:
                self._drop_conn()
                if attempt == 1 and _is_connection_error(e):
                    continue
                log.error("Dataset storage query failed: %s: %s", type(e).__name__, str(e)[:200])
                raise DataLoadError("Dataset storage failed while reading or writing data.") from None
        raise AssertionError("unreachable")

    def _q(self, cur, query: str, params: Iterable = ()) -> None:
        cur.execute(self.backend.sql(query), tuple(params))

    def migrate(self) -> None:
        if self._migrated or self.backend is None:
            return
        with self._lock:
            if self._migrated:
                return
            conn = self._conn()
            cur = conn.cursor()
            pg = self.backend.dialect == "postgres"
            try:
                if pg:
                    cur.execute("SELECT pg_advisory_lock(727001)")   # one migrator across instances
                cur.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, "
                            "name TEXT NOT NULL, applied_at TEXT NOT NULL)")
                cur.execute("SELECT version FROM schema_migrations")
                done = {r[0] for r in cur.fetchall()}
                for path in sorted((MIGRATIONS_DIR / self.backend.dialect).glob("*.sql")):
                    number = int(path.name.split("_", 1)[0])
                    if number in done:
                        continue
                    log.info("Applying migration %s", path.name)
                    self.backend.begin(conn)
                    try:
                        text = path.read_text(encoding="utf-8")
                        for stmt in (split_sql(text) if pg else split_sqlite(text)):
                            cur.execute(stmt)
                        cur.execute(self.backend.sql("INSERT INTO schema_migrations (version, name, applied_at) "
                                                     "VALUES (?, ?, ?)"), (number, path.name, _now().isoformat()))
                        cur.execute("COMMIT")
                    except Exception:
                        cur.execute("ROLLBACK")
                        raise
            except DataLoadError:
                raise
            except Exception as e:
                self._drop_conn()
                log.error("Dataset storage migration failed: %s: %s", type(e).__name__, str(e)[:200])
                raise DataLoadError("Dataset storage could not be initialised (migration failed).") from None
            finally:
                if pg:
                    try:
                        cur.execute("SELECT pg_advisory_unlock(727001)")
                    except Exception:
                        pass
            self._migrated = True

    # -- reads --

    VERSION_COLS = ("id, version, name, created_at, created_by, readings_filename, thresholds_filename, "
                    "readings_sha256, thresholds_sha256, row_count, stats, validation")

    @staticmethod
    def _record(row) -> VersionRecord:
        return VersionRecord(id=row[0], version=row[1], name=row[2], created_at=_dt(row[3]), created_by=row[4],
                             readings_filename=row[5], thresholds_filename=row[6], readings_sha256=row[7].strip(),
                             thresholds_sha256=row[8].strip(), row_count=row[9], stats=_json(row[10]),
                             validation=_json(row[11]))

    def active(self) -> Activation | None:
        """The active pointer, read from the database on every call (no per-instance caching), so all
        function instances agree. None means nothing was ever activated: the starter dataset is active."""
        if self.backend is None:
            return None

        def q(cur):
            self._q(cur, "SELECT dataset_id, activated_at, activated_by FROM active_dataset")
            row = cur.fetchone()
            return Activation(row[0] or STARTER_ID, _dt(row[1]), row[2]) if row else None
        return self._run(q)

    def versions(self) -> list[VersionRecord]:
        if self.backend is None:
            return []

        def q(cur):
            self._q(cur, f"SELECT {self.VERSION_COLS} FROM dataset_versions ORDER BY version DESC")
            return [self._record(r) for r in cur.fetchall()]
        return self._run(q)

    def version(self, dataset_id: str) -> VersionRecord | None:
        if self.backend is None or dataset_id == STARTER_ID:
            return None

        def q(cur):
            self._q(cur, f"SELECT {self.VERSION_COLS} FROM dataset_versions WHERE id = ?", (dataset_id,))
            row = cur.fetchone()
            return self._record(row) if row else None
        return self._run(q)

    def last_activations(self) -> dict[str, datetime]:
        """Most recent activation time per dataset id (STARTER_ID for the starter)."""
        if self.backend is None:
            return {}

        def q(cur):
            self._q(cur, "SELECT dataset_id, MAX(activated_at) FROM dataset_activations GROUP BY dataset_id")
            return {(r[0] or STARTER_ID): _dt(r[1]) for r in cur.fetchall()}
        return self._run(q)

    def contents(self, dataset_id: str) -> tuple[list[RawRow], dict[str, dict]]:
        """The stored rows (file order) and thresholds of one immutable version."""
        def q(cur):
            self._q(cur, "SELECT row_number, site_id, site_name, sensor, timestamp_raw, value_raw "
                         "FROM dataset_readings WHERE dataset_id = ? ORDER BY row_number", (dataset_id,))
            rows = [RawRow(row_number=r[0], site_id=r[1], site_name=r[2], sensor=r[3], timestamp=r[4], value=r[5])
                    for r in cur.fetchall()]
            self._q(cur, "SELECT sensor, limit_value, unit FROM dataset_thresholds WHERE dataset_id = ?", (dataset_id,))
            rules = {r[0]: {"limit": float(r[1]), "unit": r[2]} for r in cur.fetchall()}
            return rows, rules
        return self._run(q)

    def source_texts(self, dataset_id: str) -> tuple[str, str]:
        def q(cur):
            self._q(cur, "SELECT readings_csv, thresholds_json FROM dataset_versions WHERE id = ?", (dataset_id,))
            row = cur.fetchone()
            if not row:
                raise StorageError(f"Dataset {dataset_id} not found.")
            return row[0], row[1]
        return self._run(q)

    # -- writes --

    def _require_writable(self) -> None:
        if not self.writable:
            raise StorageError(self.message)

    def create(self, new: NewVersion, activate: bool) -> VersionRecord:
        """Store an immutable version (rows, thresholds, sources) and optionally make it active, all in one
        transaction: either everything is saved and switched, or nothing is."""
        self._require_writable()
        dataset_id = str(uuid.uuid4())
        created = _now()

        def tx(cur):
            if self.backend.dialect == "postgres":
                cur.execute("SELECT pg_advisory_xact_lock(727002)")   # serialize version numbering
            self._q(cur, "SELECT COALESCE(MAX(version), 0) + 1 FROM dataset_versions")
            number = cur.fetchone()[0]
            ts = created if self.backend.dialect == "postgres" else created.isoformat()
            self._q(cur, "INSERT INTO dataset_versions (id, version, name, created_at, created_by, readings_filename, "
                         "thresholds_filename, readings_sha256, thresholds_sha256, readings_csv, thresholds_json, "
                         "row_count, stats, validation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (dataset_id, number, new.name, ts, new.created_by, new.readings_filename,
                     new.thresholds_filename, new.readings_sha256, new.thresholds_sha256, new.readings_csv,
                     new.thresholds_json, len(new.rows), json.dumps(new.stats, default=str),
                     json.dumps(new.validation, default=str)))
            for sensor, rule in new.thresholds.items():
                self._q(cur, "INSERT INTO dataset_thresholds (dataset_id, sensor, limit_value, unit) VALUES (?, ?, ?, ?)",
                        (dataset_id, sensor, rule["limit"], rule["unit"]))
            for start in range(0, len(new.rows), INSERT_CHUNK):
                chunk = new.rows[start:start + INSERT_CHUNK]
                params: list = []
                for r in chunk:
                    m = new.measured_at[r.row_number]
                    params += [dataset_id, r.row_number, r.site_id, r.site_name, r.sensor, r.timestamp,
                               m if self.backend.dialect == "postgres" else m.isoformat(), r.value,
                               new.values[r.row_number]]
                values = ", ".join(["(?, ?, ?, ?, ?, ?, ?, ?, ?)"] * len(chunk))
                self._q(cur, "INSERT INTO dataset_readings (dataset_id, row_number, site_id, site_name, sensor, "
                             f"timestamp_raw, measured_at, value_raw, value) VALUES {values}", params)
            if activate:
                self._set_active(cur, dataset_id, new.created_by, created)
            return number

        number = self._run(tx, write=True)
        return VersionRecord(id=dataset_id, version=number, name=new.name, created_at=created,
                             created_by=new.created_by, readings_filename=new.readings_filename,
                             thresholds_filename=new.thresholds_filename, readings_sha256=new.readings_sha256,
                             thresholds_sha256=new.thresholds_sha256, row_count=len(new.rows), stats=new.stats,
                             validation=new.validation)

    def activate(self, dataset_id: str, actor: str) -> str:
        """Point the active dataset at an existing version (or the starter). Returns the previous active id."""
        self._require_writable()

        def tx(cur):
            if dataset_id != STARTER_ID:
                self._q(cur, "SELECT 1 FROM dataset_versions WHERE id = ?", (dataset_id,))
                if not cur.fetchone():
                    raise ValueError(dataset_id)
            self._q(cur, "SELECT dataset_id FROM active_dataset")
            row = cur.fetchone()
            previous = (row[0] or STARTER_ID) if row else STARTER_ID
            self._set_active(cur, dataset_id, actor, _now())
            return previous
        return self._run(tx, write=True)

    def _set_active(self, cur, dataset_id: str, actor: str, when: datetime) -> None:
        target = None if dataset_id == STARTER_ID else dataset_id
        ts = when if self.backend.dialect == "postgres" else when.isoformat()
        self._q(cur, "DELETE FROM active_dataset")
        self._q(cur, "INSERT INTO active_dataset (dataset_id, activated_at, activated_by) VALUES (?, ?, ?)",
                (target, ts, actor))
        self._q(cur, "INSERT INTO dataset_activations (dataset_id, activated_at, activated_by) VALUES (?, ?, ?)",
                (target, ts, actor))


def _is_connection_error(e: Exception) -> bool:
    name = type(e).__name__
    return name in ("InterfaceError", "OperationalError", "ConnectionResetError", "BrokenPipeError") or \
        isinstance(e, (ConnectionError, OSError))


def open_store(database_url: str | None, sqlite_path: Path, on_vercel: bool) -> DatasetStore:
    """Choose the storage backend from configuration. Never falls back silently to non-durable storage
    on Vercel."""
    url = (database_url or "").strip()
    if url.startswith(("postgres://", "postgresql://")):
        return DatasetStore(_Postgres(url), "postgres", True,
                            "Uploads are stored in PostgreSQL as immutable, versioned datasets.")
    if url.startswith("sqlite:///") and not on_vercel:
        return DatasetStore(_Sqlite(Path(url[len("sqlite:///"):])), "sqlite", True,
                            "Local development storage (SQLite). Not used on Vercel.")
    if url:
        return DatasetStore(None, "none", False, "DATABASE_URL must be a postgres:// or postgresql:// URL "
                                                 "(SQLite is not durable on Vercel). Uploads are disabled.")
    if on_vercel:
        return DatasetStore(None, "none", False,
                            "Dataset uploads are disabled: no database is configured. Set DATABASE_URL to a "
                            "PostgreSQL database in Vercel to store uploads durably. The dashboard is showing "
                            "the read-only starter dataset.")
    return DatasetStore(_Sqlite(sqlite_path), "sqlite", True,
                        "Local development storage (SQLite). Not used on Vercel.")
