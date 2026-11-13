# SiteWatch AI

Construction-site monitoring dashboard for EnTech's New York City sites. Engineers and project managers can see which sites exceeded their configured **vibration**, **noise** and **dust** limits, when it happened and by how much. They can also generate a client-ready summary and ask **SiteWatch AI**, a project-only assistant, about the data.

- **Backend:** Python, FastAPI and Pydantic. It reads `readings.csv` and `thresholds.json`, validates every row, and classifies each reading as `NORMAL`, `EXCEEDED` or `MISSING_DATA`.
- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons and Recharts, with light and dark mode.
- **AI:** Claude through the Anthropic API, using read-only tools over the same validated data as the dashboard, plus local documentation retrieval.

The data comes from static files. It is not a live or real-time feed.

## Features

- **Overview:** total sites, affected sites, exceedances, normal and missing readings, sensor trend charts with the limit line, a sensor status breakdown, recent alerts and a site monitoring table.
- **Sites:** status, alert counts, and each site's readings grouped by sensor, with timestamps, units, configured limits and exceedance amounts.
- **Sensor readings:** searchable and paginated, with filters for site, sensor, status and time range, and sortable timestamp and value columns. Missing values are shown as "Missing" and never as zero.
- **Alerts:** confirmed exceedances only, with measured value, limit, excess and percentage over. Missing data is kept separate.
- **Reports:** a deterministic plain-English client report, for all sites or one site, with Copy and Download (.txt) buttons.
- **AI Assistant:** a floating panel and a dedicated page. Answers cite their sources (data files or documentation sections), and the assistant refuses unrelated questions.
- **Settings:** theme, API connection, data source, AI status and the configured thresholds.

## Repository layout

```
backend/            FastAPI service
  app/              config, schemas, errors, services/, ai/, api/routes.py
  data/             readings.csv, thresholds.json (the source data)
  tests/            pytest suite
frontend/           Next.js dashboard
  src/app/          one route per sidebar section
  src/components/   layout, widgets, tables, charts, chat
  e2e/              Playwright end-to-end tests
docs/               methodology.md, architecture.md (also indexed by the assistant)
```

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

Go to http://localhost:3000.

### 6. Enable and test the AI chat (optional)

The dashboard works fully without an AI key. To enable SiteWatch AI:

1. Create an API key in the Anthropic Console (https://platform.claude.com/, API keys).
2. Copy `backend\.env.example` to `backend\.env`.
3. Set `ANTHROPIC_API_KEY=` to your key in `backend\.env`. Do not paste it anywhere else; `.env` is git-ignored.
4. Restart the backend, then open http://localhost:3000/assistant and try a suggested prompt such as "Which sites exceeded their limits?".

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

The Playwright suite checks that the dashboard numbers match the CSV-derived values (3 sites, 3 affected, 5 exceedances, 9 normal, 1 missing). It also exercises filters, pagination, sorting, search, the time range filter, site details, alerts, report copy and download, dark mode, the offline error state, the AI setup message and the mobile layout.

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
| GET | `/api/overview` | Totals, site statuses, sensor breakdown, trends, recent alerts, validation warnings |
| GET | `/api/sites` | Site summaries with status and alert counts |
| GET | `/api/sites/{site_id}` | One site with readings grouped by sensor |
| GET | `/api/readings` | Filters: `site_id`, `sensor` (id or type), `status`, `start`, `end`, `q`. Sorting: `sort` (`timestamp`, `value`, `site`, `sensor`) and `order`. Pagination: `page`, `page_size` (max 100) |
| GET | `/api/exceedances` | Confirmed exceedances, filters `site_id`, `sensor`, `start`, `end`, `order` |
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
- **Configuration (`backend/.env`):** `ANTHROPIC_API_KEY`, `AI_MODEL` (default `claude-opus-5-5`), `AI_EFFORT`, `AI_TIMEOUT_SECONDS`, `AI_MAX_TOOL_ITERATIONS`. The provider sits behind a small interface (`app/ai/provider.py`); this version implements Anthropic.

## Troubleshooting

- **"Cannot reach the SiteWatch API":** start the backend and check that `NEXT_PUBLIC_API_BASE_URL` matches its port. Restart `npm run dev` after changing `.env.local`.
- **`[Errno 10048] only one usage of each socket address`:** the port is in use. Stop the other process or choose another port.
- **CORS errors:** add your frontend origin to `CORS_ORIGINS` in `backend/.env`.
- **Data changes:** edit `backend/data/readings.csv` or `thresholds.json`. The API reloads them automatically on the next request.
