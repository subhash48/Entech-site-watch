import type {
  ActivationResponse, AdminStatus, ChatResponse, ChatStatus, ChatTurn, CreateDatasetResponse, DatasetList, DatasetPreview,
  DatasetVersion, Exceedance, Health, Overview, OverviewQuery, Page, Reading, ReadingsQuery, SensorInfo, SiteDetail,
  SiteSummary, Summary, Threshold, ValidationReport,
} from "./types";

/**
 * Backend base URL. Public by design: it is embedded in the browser bundle. Never put secrets here.
 * - Local dev: NEXT_PUBLIC_API_BASE_URL from .env.local, else http://localhost:8001.
 * - Production (Vercel Services): leave it unset; "" means same-origin requests such as /api/sites,
 *   which vercel.json routes to the FastAPI service.
 */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? (process.env.NODE_ENV === "development" ? "http://localhost:8001" : "")
).replace(/\/+$/, "");

/** True when the API runs on this machine, so setup hints about starting uvicorn make sense. */
export const IS_LOCAL_API = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API_BASE_URL);

/** Human-readable API location for status text. */
export const API_LABEL = API_BASE_URL || "this site (same origin)";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError(0, "UNKNOWN", err instanceof Error ? err.message : "Something went wrong.");
}

type Query = Record<string, string | number | undefined | null>;

function qs(params: Query = {}): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : "";
}

async function request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    const json = init.body && !(init.body instanceof FormData);
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal,
      // The admin session is an HttpOnly cookie. "include" also sends it to the API in local development
      // (frontend on port 3100, API on 8001); on Vercel the API is same-origin.
      credentials: "include",
      headers: { Accept: "application/json", ...(json ? { "Content-Type": "application/json" } : {}), ...init.headers },
      cache: "no-store",
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError(0, "NETWORK_ERROR",
      IS_LOCAL_API
        ? `Cannot reach the SiteWatch API at ${API_BASE_URL}. Make sure the backend is running.`
        : `Cannot reach the SiteWatch API at ${API_LABEL}. Please try again in a moment.`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? "HTTP_ERROR",
      body?.error?.message ?? `Request failed with status ${res.status}.`, body?.error?.details);
  }
  return body as T;
}

export const api = {
  health: (signal?: AbortSignal) => request<Health>("/health", {}, signal),
  overview: (query: OverviewQuery = {}, signal?: AbortSignal) =>
    request<Overview>(`/api/overview${qs(query as Query)}`, {}, signal),
  sites: (signal?: AbortSignal) => request<SiteSummary[]>("/api/sites", {}, signal),
  site: (siteId: string, signal?: AbortSignal) =>
    request<SiteDetail>(`/api/sites/${encodeURIComponent(siteId)}`, {}, signal),
  sensors: (signal?: AbortSignal) => request<SensorInfo[]>("/api/sensors", {}, signal),
  thresholds: (signal?: AbortSignal) => request<Threshold[]>("/api/thresholds", {}, signal),
  readings: (query: ReadingsQuery, signal?: AbortSignal) =>
    request<Page<Reading>>(`/api/readings${qs(query as Query)}`, {}, signal),
  exceedances: (query: { site_id?: string; sensor?: string; order?: "asc" | "desc" }, signal?: AbortSignal) =>
    request<Exceedance[]>(`/api/exceedances${qs(query)}`, {}, signal),
  summary: (siteId?: string, signal?: AbortSignal) =>
    request<Summary>(`/api/summary${qs({ site_id: siteId })}`, {}, signal),
  chatStatus: (signal?: AbortSignal) => request<ChatStatus>("/api/chat/status", {}, signal),
  chat: (messages: ChatTurn[], signal?: AbortSignal) =>
    request<ChatResponse>("/api/chat", { method: "POST", body: JSON.stringify({ messages }) }, signal),

  // ---------- datasets and admin access ----------
  datasets: (signal?: AbortSignal) => request<DatasetList>("/api/datasets", {}, signal),
  activeDataset: (signal?: AbortSignal) => request<DatasetVersion>("/api/datasets/active", {}, signal),
  adminStatus: (signal?: AbortSignal) => request<AdminStatus>("/api/admin/session", {}, signal),
  signIn: (token: string) =>
    request<AdminStatus>("/api/admin/session", { method: "POST", body: JSON.stringify({ token }) }),
  signOut: () => request<AdminStatus>("/api/admin/session", { method: "DELETE", headers: ADMIN_HEADER }),
  previewDataset: (files: DatasetFiles, signal?: AbortSignal) =>
    request<DatasetPreview>("/api/datasets/preview", { method: "POST", body: form(files), headers: ADMIN_HEADER }, signal),
  createDataset: (files: DatasetFiles, name: string, activate = true) =>
    request<CreateDatasetResponse>("/api/datasets", {
      method: "POST", body: form(files, { name, activate: String(activate) }), headers: ADMIN_HEADER,
    }),
  activateDataset: (id: string) =>
    request<ActivationResponse>(`/api/datasets/${encodeURIComponent(id)}/activate`, { method: "POST", headers: ADMIN_HEADER }),
  datasetValidation: (id: string, signal?: AbortSignal) =>
    request<ValidationReport>(`/api/datasets/${encodeURIComponent(id)}/validation`, {}, signal),
};

/** Sent with every admin write; the API rejects cookie-authenticated writes without it (CSRF protection). */
const ADMIN_HEADER = { "X-SiteWatch-Admin": "1" };

export interface DatasetFiles {
  readings?: File | null;
  thresholds?: File | null;
}

function form(files: DatasetFiles, fields: Record<string, string> = {}): FormData {
  const data = new FormData();
  if (files.readings) data.append("readings", files.readings, files.readings.name);
  if (files.thresholds) data.append("thresholds", files.thresholds, files.thresholds.name);
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

/** Download links, served by the API from the active dataset version. */
export const exportUrl = {
  readings: (query: Query = {}) => `${API_BASE_URL}/api/exports/readings.csv${qs(query)}`,
  exceedances: (query: Query = {}) => `${API_BASE_URL}/api/exports/exceedances.csv${qs(query)}`,
  summaryPdf: (query: Query = {}) => `${API_BASE_URL}/api/reports/summary.pdf${qs(query)}`,
};
