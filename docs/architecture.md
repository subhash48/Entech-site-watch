# Architecture

## Overview

SiteWatch Mini has two services that run side by side:

- **Backend**: Python, FastAPI and Pydantic in `backend/`. It loads and validates the data, classifies readings, and serves the JSON API and the SiteWatch AI assistant.
- **Frontend**: Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons and Recharts in `frontend/`. It calls the backend from the browser. All numbers shown in the dashboard come from the API; the frontend contains no monitoring data of its own.

There is no database in this version. The dataset is small and held in memory, cached until `readings.csv` or `thresholds.json` changes.

## Backend layout

- `app/config.py`: settings from environment variables.
- `app/schemas.py`: Pydantic response models shared by every endpoint.
- `app/errors.py`: consistent error responses: `{"error": {"code", "message", "details"}}`.
- `app/services/thresholds.py`: loads `thresholds.json` and does the per-sensor threshold lookup.
- `app/services/readings.py`: loads `readings.csv`, validates each row and classifies it.
- `app/services/dataset.py`: builds the cached dataset.
- `app/services/queries.py`: validated filtering, search, sorting and pagination. Used by both the API routes and the AI tools.
- `app/services/overview.py` and `app/services/reporting.py`: dashboard rollups and the client report.
- `app/ai/`: the SiteWatch AI assistant (tools, documentation retrieval, scope guard, provider and agent loop).
- `app/api/routes.py`: thin HTTP handlers.

## Frontend layout

- `src/app/`: one route per sidebar section: Overview, Sites, Sensor Readings, Alerts, Reports, AI Assistant and Settings.
- `src/components/`: the layout shell (collapsible sidebar and header), dashboard widgets, tables, charts and chat panel.
- `src/components/ui/`: shadcn/ui primitives.
- `src/lib/api.ts`: typed API client. The backend URL comes from `NEXT_PUBLIC_API_BASE_URL`.

## API endpoints

- `GET /health`: liveness, counts of loaded data and whether the AI assistant is configured.
- `GET /api/overview`: totals, site statuses, sensor status breakdown, trend series, recent alerts and validation warnings.
- `GET /api/sites` and `GET /api/sites/{site_id}`: site summaries, and one site's readings grouped by sensor.
- `GET /api/readings`: readings filtered by `site_id`, `sensor` (id or type), `status`, `start`, `end` and free-text `q`, sorted by `timestamp`, `value`, `site` or `sensor`, and paginated with `page` and `page_size` (max 100).
- `GET /api/exceedances`: confirmed threshold exceedances only.
- `GET /api/summary`: the deterministic client report, optionally for one `site_id`.
- `GET /api/sensors` and `GET /api/thresholds`: sensors present and the configured rules.
- `GET /api/chat/status` and `POST /api/chat`: the SiteWatch AI assistant.

Interactive API documentation is served by FastAPI at `/docs`.

## SiteWatch AI assistant

SiteWatch AI answers questions about this project only. It is a bounded tool-calling loop:

1. A deterministic scope check rejects first messages that have nothing to do with SiteWatch, without calling the model.
2. The model (Claude, through the Anthropic API) receives a fixed system prompt and a list of seven read-only tools: `get_sites`, `get_site_details`, `get_readings`, `get_exceedances`, `get_thresholds`, `get_monitoring_summary` and `search_project_docs`.
3. Each tool call is checked against the allowlist, its arguments are validated with a strict Pydantic model, and it runs the same query functions as the API. Unknown tools and invalid arguments return an error to the model instead of running.
4. The loop stops after at most 5 model steps (configurable with `AI_MAX_TOOL_ITERATIONS`), at most 6 tool calls per step, and a time limit. Tool outputs are capped at 12,000 characters and answers at 6,000.
5. The response lists the data files and documentation sections the tools used as sources.

Documentation retrieval uses simple local chunking by Markdown heading and BM25 keyword scoring over `README.md` and `docs/*.md`. No vector database is needed for a project this size. Retrieved text is treated as untrusted: lines that look like instructions to the model are removed before it sees them, and the system prompt tells the model to ignore instructions inside tool results.

## Security notes

- The AI provider key (`ANTHROPIC_API_KEY`) lives only in the backend environment. The browser never sees it; the frontend calls `/api/chat` on the backend.
- The assistant has no tools that write files, run commands or reach other systems.
- CORS allows only the origins in `CORS_ORIGINS`, only GET and POST, and no credentials.
- If no key is configured, `/api/chat` returns HTTP 503 with code `AI_NOT_CONFIGURED` and a setup message. It never returns a made-up answer.
