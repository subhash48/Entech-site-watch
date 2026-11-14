-- SiteWatch dataset storage (PostgreSQL).
-- Every import is an immutable version; the active version is a single pointer row that is
-- switched atomically. Applied automatically by app/datasets/store.py (tracked in schema_migrations).

CREATE TABLE IF NOT EXISTS dataset_versions (
    id                  TEXT PRIMARY KEY,                 -- uuid4
    version             INTEGER NOT NULL UNIQUE CHECK (version > 0),
    name                TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          TEXT NOT NULL,
    readings_filename   TEXT NOT NULL,
    thresholds_filename TEXT NOT NULL,
    readings_sha256     CHAR(64) NOT NULL,
    thresholds_sha256   CHAR(64) NOT NULL,
    readings_csv        TEXT NOT NULL,                    -- source text, kept for single-file re-uploads and audit
    thresholds_json     TEXT NOT NULL,
    row_count           INTEGER NOT NULL,
    stats               JSONB NOT NULL,
    validation          JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS dataset_thresholds (
    dataset_id  TEXT NOT NULL REFERENCES dataset_versions (id) ON DELETE RESTRICT,
    sensor      TEXT NOT NULL,
    limit_value DOUBLE PRECISION NOT NULL CHECK (limit_value >= 0),
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
    measured_at   TIMESTAMP NOT NULL,                     -- naive UTC
    value_raw     TEXT NOT NULL,
    value         DOUBLE PRECISION,                       -- NULL = missing measurement, never zero
    PRIMARY KEY (dataset_id, row_number)
);
CREATE INDEX IF NOT EXISTS dataset_readings_site_sensor ON dataset_readings (dataset_id, site_id, sensor);

-- One row. dataset_id NULL means the read-only starter dataset committed with the app.
CREATE TABLE IF NOT EXISTS active_dataset (
    singleton    BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    dataset_id   TEXT REFERENCES dataset_versions (id) ON DELETE RESTRICT,
    activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    activated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dataset_activations (
    id           BIGSERIAL PRIMARY KEY,
    dataset_id   TEXT REFERENCES dataset_versions (id) ON DELETE RESTRICT,   -- NULL = starter
    activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    activated_by TEXT NOT NULL
);

-- Versions, their readings and thresholds are immutable once written.
CREATE OR REPLACE FUNCTION sitewatch_reject_change() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'SiteWatch dataset versions are immutable (% on %)', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dataset_versions_immutable ON dataset_versions;
CREATE TRIGGER dataset_versions_immutable BEFORE UPDATE OR DELETE ON dataset_versions
    FOR EACH ROW EXECUTE FUNCTION sitewatch_reject_change();
DROP TRIGGER IF EXISTS dataset_readings_immutable ON dataset_readings;
CREATE TRIGGER dataset_readings_immutable BEFORE UPDATE OR DELETE ON dataset_readings
    FOR EACH ROW EXECUTE FUNCTION sitewatch_reject_change();
DROP TRIGGER IF EXISTS dataset_thresholds_immutable ON dataset_thresholds;
CREATE TRIGGER dataset_thresholds_immutable BEFORE UPDATE OR DELETE ON dataset_thresholds
    FOR EACH ROW EXECUTE FUNCTION sitewatch_reject_change();
