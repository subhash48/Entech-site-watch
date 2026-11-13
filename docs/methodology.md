# Monitoring methodology

## Data sources

SiteWatch Mini reads two static files from `backend/data/`:

- `readings.csv` with the columns `site_id`, `site_name`, `sensor`, `timestamp`, `value`. Each row is one sensor reading.
- `thresholds.json`, an object keyed by sensor name. Each entry has a `limit` and a `unit`, for example `"vibration_ppv": {"limit": 0.5, "unit": "in/s"}`.

The data is loaded from these files when the API starts and reloaded automatically when either file changes. It is not a live or real-time feed. Timestamps are shown exactly as recorded by the site sensors; they carry no time zone.

## Threshold lookup

Thresholds are never hardcoded. For each reading the backend looks up its rule in `thresholds.json`:

1. An exact match on the sensor id (for example `noise_dba`).
2. Otherwise a match on the sensor type, which is the part before the first underscore (for example `noise`).

So `0.5 in/s` applies only to vibration readings, while noise and dust readings use their own configured limits. A threshold entry with no limit, or with a non-numeric limit, is skipped and reported as a validation warning. It is never treated as a limit of zero.

## Classification

Every reading is classified as exactly one of:

- **NORMAL**: the value is at or below its sensor's limit.
- **EXCEEDED**: the value is strictly greater than the limit (`value > limit`). A value exactly at the limit is NORMAL.
- **MISSING_DATA**: the reading could not be evaluated. This happens when the value is blank or not a number, the value is negative, the timestamp is blank or not valid ISO 8601, the site ID or sensor name is blank or invalid, or no threshold is configured for the sensor.

Missing data is kept separate from exceedances. A blank value is stored as null and is never treated as zero, so it can never create a false alert or hide a real one. Every CSV row appears in the results; nothing is silently dropped.

## Site status

- **ALERT**: the site has at least one EXCEEDED reading.
- **NEEDS_REVIEW**: no exceedances, but at least one reading is MISSING_DATA.
- **OK**: every reading is NORMAL.

## Exceedance amounts

For an exceedance, `exceeded_by` is `value - limit` in the sensor's unit, and `exceeded_by_pct` is `exceeded_by / limit × 100`, rounded to one decimal place.

## Alert severity

The dashboard labels each exceedance with a display severity. It is derived only from how far the reading was above its configured limit:

- **High**: 20% or more over the limit (or any excess when the limit is 0).
- **Medium**: at least 5% and less than 20% over the limit.
- **Low**: less than 5% over the limit.

Severity is a display priority for triage. It is not a regulatory classification. With the supplied data, the vibration reading of 0.62 in/s at 125 Broad St (24% over) is High, and the noise reading of 88 dBA at 125 Broad St (3.5% over) is Low.

## Interpreting exceedances

An exceedance means a reading was above a monitoring threshold configured for this project. It does not by itself mean a regulatory, legal or permit violation. Whether any requirement was breached depends on the applicable rules, averaging periods and conditions, which this application does not evaluate.

## Validation warnings

The API exposes data-quality problems so they can be reviewed:

- Per-reading issues are listed in each reading's `issues` field and in `/api/overview` under `validation.invalid_rows`.
- File-level problems, such as a threshold entry without a limit or a site ID used with two different site names, are listed under `validation.warnings`.
- A missing data file, a missing required CSV column, or invalid JSON makes the API return HTTP 503 with error code `DATA_UNAVAILABLE`.

## Client summary report

`GET /api/summary` produces a deterministic plain-English report built only from the classified readings. It covers the overview, each exceedance with its value, limit, excess and percentage over, data-quality notes, and recommended follow-up. The same inputs always produce the same report, so the numbers can be audited against the CSV.
