# SiteWatch AI

Construction-site monitoring dashboard for EnTech's New York City sites. Engineers and project managers can see which sites exceeded their configured **vibration**, **noise** and **dust** limits, when it happened and by how much. They can also generate a client-ready summary and ask **SiteWatch AI**, a project-only assistant, about the data.

- **Backend:** Python, FastAPI and Pydantic. It reads `readings.csv` and `thresholds.json`, validates every row, and classifies each reading as `NORMAL`, `EXCEEDED` or `MISSING_DATA`.
- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons and Recharts, with light and dark mode.
- **AI:** Claude (Anthropic API) or a Groq-hosted model such as `openai/gpt-oss-120b`, selected with `AI_PROVIDER`, using read-only tools over the same validated data as the dashboard, plus local documentation retrieval.

The data comes from static files. It is not a live or real-time feed.

## Features

- **Dashboard** (built from [design/sitewatch-reference.png](design/sitewatch-reference.png)):
  - KPI cards: Total Sites, Active Alerts, Data Coverage and Missing Data.
  - A filter row for site, sensor type, status and date. Every count and card follows it.
  - A Sites table and a Sensor Alerts list.
  - An Alert Trends chart with Alerts and Readings views.
  - The embedded Project AI Assistant.
- **Sites:** status, alert counts and data coverage per site. Each site's page groups its readings by sensor, with timestamps, units, configured limits and exceedance amounts.
- **Alerts:** confirmed exceedances only, with measured value, limit, excess and percentage over. Missing data is kept separate.
- **Sensors:** all readings, searchable and paginated, filterable by site, sensor, status and time range, with sortable timestamp and value columns. Missing values show as "Missing", never zero. The old `/readings` URL redirects here.
- **Reports:** a deterministic plain-English client report for all sites or one site, with Copy and Download (.txt) buttons.
- **AI Assistant:**
  - A floating panel, a dedicated page and the dashboard card.
  - Answers cite their sources (data files or documentation sections).
  - Unrelated questions are refused.
- **Settings:** theme, API connection, data source, AI status and configured thresholds.
- **Header:** per-page title, Ctrl/⌘+K search across readings, a notifications menu listing the real exceedances, and a workspace menu (theme, reload, settings, API docs). There is no sign-in, and the menu says so.
- **Layout:** responsive, with an expanded sidebar on desktop, an icon rail on tablet and an off-canvas menu on phones. Light theme by default; dark mode is in the workspace menu.

### Where the dashboard differs from the reference image, and why

The reference image contains some sample figures the supplied data cannot support. They were replaced with measured values instead of being invented:

| Reference shows | SiteWatch shows | Reason |
|---|---|---|
| "Sensors Online 28 / 30" | **Data Coverage**: readings with a value / readings received (14 / 15, 93%) | The CSV has no sensor connectivity data. |
| "+67% vs. last 7 days" style badges | Counts in the current view (e.g. "3 sites", "1 site") | The data covers one day, so there is no week-over-week change. |
| Seven daily points on Alert Trends | Hourly buckets (daily when the data spans more than two days) | No seven-day history exists in the data. |
| Borough names, site photos, sensor IDs such as "Vib-03" | Site ID, sensor types, and sensor names from the CSV | Not in the data. |
| A user photo | A workspace menu that states no sign-in is configured | There is no authentication in this demo. |
| "Real-time" wording | "Static dataset loaded" | The data is loaded from files, not a live feed. |

**Alert severity** (High / Medium / Low) is a display priority based on how far a reading was above its limit: High at 20% or more, Medium from 5% to under 20%, Low under 5%. It is not a regulatory classification. See [docs/methodology.md](docs/methodology.md).

## Repository layout

```
backend/            FastAPI service
  app/              config, schemas, errors, services/, ai/, api/routes.py
  data/             readings.csv, thresholds.json (the source data)
  tests/            pytest suite
  scripts/          bundle_docs.py (Vercel build step)
frontend/           Next.js dashboard
  src/app/          one route per sidebar section
  src/components/   layout, widgets, tables, charts, chat
  e2e/              Playwright end-to-end tests
docs/               methodology.md, architecture.md (also indexed by the assistant)
design/             sitewatch-reference.png (dashboard design reference)
vercel.json         Vercel Services: Next.js + FastAPI under one URL
```

## Deploy to Vercel (one URL)

The root [vercel.json](vercel.json) uses [Vercel Services](https://vercel.com/docs/services) to deploy both apps in one project:

| Path | Service |
| --- | --- |
| `/api/*`, `/health`, `/docs`, `/redoc`, `/openapi.json` | `api`: FastAPI (`backend/`, entrypoint `app.main:app`) |
| everything else | `web`: Next.js (`frontend/`) |

Vercel passes the original path to the service, so the backend's routes are unchanged. The frontend calls `/api/...` on its own origin, so no CORS setup is needed.

1. Import the GitHub repository in Vercel. Leave the Root Directory as the repository root; Vercel detects both services from `vercel.json`.
2. In **Project Settings > Environment Variables**, add `AI_PROVIDER` and the matching key: `groq` + `GROQ_API_KEY`, or `anthropic` + `ANTHROPIC_API_KEY` (server-side only). The optional `AI_*` settings are listed in [.env.example](.env.example). Do **not** set `NEXT_PUBLIC_API_BASE_URL`: leaving it unset makes the browser call the API on the same origin.
3. Deploy, then check `https://<your-app>.vercel.app/health` and `/docs`.

How the details are handled:
- `backend/data/readings.csv` and `thresholds.json` are committed and found through paths relative to the code, so they are bundled with the Python function.
- The function bundle contains only `backend/`, so the backend build step (`scripts/bundle_docs.py`) copies `README.md` and `docs/*.md` into `backend/project_docs/` for the assistant's doc search.
- The Python version is pinned in `backend/.python-version` (3.12) and dependencies come from `backend/requirements.txt`. The function's `maxDuration` is 300 s, which covers the assistant's 90 s deadline plus one slow model call with a retry.
- `ENVIRONMENT` falls back to Vercel's `VERCEL_ENV` (production / preview).

## Local setup on Windows

Prerequisites: **Python 3.12+**, **Node.js 20.9+** (Node 24 LTS recommended) and Git. Run the commands below in PowerShell or the VS Code terminal.

### 1. Install backend dependencies

```powershell
cd backend
python -m pip install -r requirements-dev.txt
```

### 2. Install frontend dependencies

```powershell
cd ..\frontend
npm install
copy .env.example .env.local
```

`frontend/.env.local` sets `NEXT_PUBLIC_API_BASE_URL=http://localhost:8001`.

### 3. Run FastAPI (terminal 1)

```powershell
cd backend
python -m uvicorn app.main:app --reload --port 8001
```

- API: http://localhost:8001
- Interactive API docs: http://localhost:8001/docs
- Health: http://localhost:8001/health

Port 8001 is used because 8000 is often taken by other local services. If you choose another port, update `NEXT_PUBLIC_API_BASE_URL` to match.

### 4. Run Next.js (terminal 2)

```powershell
cd frontend
npm run dev
```

### 5. Open the dashboard

Go to http://localhost:3100.

### 6. Enable and test the AI chat (optional)

The dashboard works fully without an AI key. To enable SiteWatch AI:

1. Create an API key in the Anthropic Console (https://platform.claude.com/, API keys), or a Groq key (https://console.groq.com/keys).
2. Copy `backend\.env.example` to `backend\.env`.
3. Set `ANTHROPIC_API_KEY=` to your key in `backend\.env` (for Groq: `AI_PROVIDER=groq` and `GROQ_API_KEY=`). Do not paste it anywhere else; `.env` is git-ignored.
4. Restart the backend, then open http://localhost:3100/assistant and try a suggested prompt such as "Which sites exceeded their limits?".

Without a key, the assistant shows these setup steps and `POST /api/chat` returns HTTP 503 with code `AI_NOT_CONFIGURED`. It never returns a made-up answer.

## Tests and checks

```powershell
# Backend: unit and API tests (warnings are treated as errors)
cd backend
python -m pytest

# Frontend: lint, type check and production build
cd ..\frontend
npm run lint
npm run typecheck
npm run build

# End to end: starts its own backend (port 8011) and production frontend (port 3011)
npx playwright install chromium   # first time only
npm run test:e2e
```

The pytest suite covers threshold comparisons (including values exactly at the limit), missing-data handling, validation of every field, filtering, sorting, pagination, response schemas, CORS, error codes, and the assistant's scope guard, tool allowlist, argument validation, iteration limits and prompt-injection handling. A scripted fake model is used, so no real API calls are made.

The Playwright suite (17 tests) checks that the dashboard numbers match the CSV-derived values: 3 sites, 5 exceedances, 14 of 15 readings with data, and 1 missing. It also covers:

- every dashboard filter
- the hourly trend chart
- site drill-down and notifications
- Ctrl+K search and the `/readings` redirect
- every sidebar page
- alerts, and report copy and download
- dark mode
- the offline error state
- the AI setup message and a mocked grounded chat answer
- zero horizontal overflow on every page at phone width, and the tablet icon rail

## Monitoring methodology

- Thresholds are looked up per sensor from `thresholds.json`: an exact sensor id first (`noise_dba`), then the sensor type (`noise`). Nothing is hardcoded. A rule without a numeric limit is reported as a warning and never treated as 0.
- A reading is **EXCEEDED** only when `value > limit` (strictly greater). A value equal to the limit is **NORMAL**.
- A reading is **MISSING_DATA** when its value is blank or invalid, its timestamp, site ID or sensor name is invalid, or no threshold is configured. Missing values stay null and are never treated as zero.
- Exceeding a configured monitoring threshold does not by itself mean a regulatory violation.

See [docs/methodology.md](docs/methodology.md) for details.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness, loaded data counts, AI configured flag |
| GET | `/api/overview` | Totals, site statuses, sensor breakdown, trends, recent alerts, validation warnings. Accepts the same filters as `/api/readings`: `site_id`, `sensor`, `status`, `start`, `end` |
| GET | `/api/sites` | Site summaries with status and alert counts |
| GET | `/api/sites/{site_id}` | One site with readings grouped by sensor |
| GET | `/api/readings` | Filters: `site_id`, `sensor` (id or type), `status`, `start`, `end`, `q`. Sorting: `sort` (`timestamp`, `value`, `site`, `sensor`) and `order`. Pagination: `page`, `page_size` (max 100) |
| GET | `/api/exceedances` | Confirmed exceedances with `severity`. Filters: `site_id`, `sensor`, `start`, `end`, `order` |
| GET | `/api/summary` | Deterministic client report, optional `site_id` |
| GET | `/api/sensors`, `/api/thresholds` | Sensors present and configured rules |
| GET | `/api/chat/status` | Whether the assistant is configured |
| POST | `/api/chat` | Ask SiteWatch AI. Body: `{"messages": [{"role": "user", "content": "..."}]}` |

Every error has the same shape: `{"error": {"code": "SITE_NOT_FOUND", "message": "...", "details": {...}}}`.

## SiteWatch AI assistant

- **Scope:** sites, readings, thresholds, exceedances, missing data, comparisons and time ranges, client summaries, and this application's architecture, features, API and methodology. Unrelated questions get a brief refusal.
- **Tools (read-only allowlist):** `get_sites`, `get_site_details`, `get_readings`, `get_exceedances`, `get_thresholds`, `get_monitoring_summary`, `search_project_docs`. They call the same validated service functions as the API, so the model never computes authoritative totals from memory.
- **Retrieval:** `README.md` and `docs/*.md` are split by heading and ranked with BM25 keyword scoring, so no vector database is needed. Sources are returned as, for example, `README.md › Monitoring methodology`.
- **Safety:**
  - The key stays server-side.
  - Tool arguments are validated with strict Pydantic models.
  - Unknown tools are rejected.
  - Each turn is limited to 5 model steps, 6 tool calls per step, 12,000 characters per tool output, a time limit and a 6,000-character answer.
  - Instruction-like lines in retrieved documents are removed, and the model is told to ignore instructions inside tool results.
  - There are no tools that write files, run commands or reach other systems.
- **Configuration (`backend/.env`):** `AI_PROVIDER` (`anthropic` or `groq`), `ANTHROPIC_API_KEY` or `GROQ_API_KEY`, `AI_MODEL` (default `claude-opus-5-5`, or `openai/gpt-oss-120b` for Groq), `AI_EFFORT`, `AI_TIMEOUT_SECONDS`, `AI_MAX_TOOL_ITERATIONS`. Providers sit behind a small interface (`app/ai/provider.py`).
- **Groq rate limits:** Groq's free tier allows about 8,000 tokens per minute for `openai/gpt-oss-120b`, roughly one or two multi-step questions a minute. The backend waits and retries once for short limits and otherwise answers with HTTP 429 and the suggested wait time.

## Troubleshooting

- **"Could not load data. Cannot reach the SiteWatch API at http://localhost:8001":** the backend is not running. Start it from the `backend` folder with `python -m uvicorn app.main:app --reload --port 8001`, then click Try again. If you run the backend on another port, set `NEXT_PUBLIC_API_BASE_URL` in `frontend/.env.local` to match and restart `npm run dev`.
- **Ports:** the frontend dev server uses port 3100 and the backend uses 8001. The backend's default `CORS_ORIGINS` allows `http://localhost:3100` and `http://127.0.0.1:3100`. If you change the frontend port, add the new origin to `CORS_ORIGINS` in `backend/.env`.
- **`[Errno 10048] only one usage of each socket address`:** the port is in use. Stop the other process or choose another port.
- **CORS errors:** add your frontend origin to `CORS_ORIGINS` in `backend/.env`.
- **Data changes:** edit `backend/data/readings.csv` or `thresholds.json`. The API reloads them automatically on the next request.
