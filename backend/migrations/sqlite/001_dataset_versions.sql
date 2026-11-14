-- SiteWatch dataset storage (SQLite, local development only; never used on Vercel).
-- Mirrors migrations/postgres/001_dataset_versions.sql.

CREATE TABLE IF NOT EXISTS dataset_versions (
    id                  TEXT PRIMARY KEY,
    version             INTEGER NOT NULL UNIQUE CHECK (version > 0),
    name                TEXT NOT NULL,
    created_at          TEXT NOT NULL,                    -- ISO 8601 UTC
    created_by          TEXT NOT NULL,
    readings_filename   TEXT NOT NULL,
    thresholds_filename TEXT NOT NULL,
    readings_sha256     TEXT NOT NULL,
    thresholds_sha256   TEXT NOT NULL,
    readings_csv        TEXT NOT NULL,
    thresholds_json     TEXT NOT NULL,
    row_count           INTEGER NOT NULL,
    stats               TEXT NOT NULL,                    -- JSON
    validation          TEXT NOT NULL                     -- JSON
);

CREATE TABLE IF NOT EXISTS dataset_thresholds (
    dataset_id  TEXT NOT NULL REFERENCES dataset_versions (id) ON DELETE RESTRICT,
    sensor      TEXT NOT NULL,
    limit_value REAL NOT NULL CHECK (limit_value >= 0),
    unit        TEXT NOT NULL,
    PRIMARY KEY (dataset_id, sensor)
);

CREATE TABLE IF NOT EXISTS dataset_readings (
    dataset_id    TEXT NOT NULL REFERENCES dataset_versions (id) ON DELETE RESTRICT,
    row_number    INTEGER NOT NULL,
    site_id       TEXT NOT NULL,
    site_name     TEXT NOT NULL,
    sensor        TEXT NOT NULL,
    timestamp_raw TEXT NOT NULL,
    measured_at   TEXT NOT NULL,
    value_raw     TEXT NOT NULL,
    value         REAL,
    PRIMARY KEY (dataset_id, row_number)
);
CREATE INDEX IF NOT EXISTS dataset_readings_site_sensor ON dataset_readings (dataset_id, site_id, sensor);

CREATE TABLE IF NOT EXISTS active_dataset (
    singleton    INTEGER PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
    dataset_id   TEXT REFERENCES dataset_versions (id) ON DELETE RESTRICT,
    activated_at TEXT NOT NULL,
    activated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dataset_activations (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    dataset_id   TEXT REFERENCES dataset_versions (id) ON DELETE RESTRICT,
    activated_at TEXT NOT NULL,
    activated_by TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS dataset_versions_no_update BEFORE UPDATE ON dataset_versions
BEGIN SELECT RAISE(ABORT, 'SiteWatch dataset versions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS dataset_versions_no_delete BEFORE DELETE ON dataset_versions
BEGIN SELECT RAISE(ABORT, 'SiteWatch dataset versions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS dataset_readings_no_update BEFORE UPDATE ON dataset_readings
BEGIN SELECT RAISE(ABORT, 'SiteWatch dataset versions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS dataset_readings_no_delete BEFORE DELETE ON dataset_readings
BEGIN SELECT RAISE(ABORT, 'SiteWatch dataset versions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS dataset_thresholds_no_update BEFORE UPDATE ON dataset_thresholds
BEGIN SELECT RAISE(ABORT, 'SiteWatch dataset versions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS dataset_thresholds_no_delete BEFORE DELETE ON dataset_thresholds
BEGIN SELECT RAISE(ABORT, 'SiteWatch dataset versions are immutable'); END;
