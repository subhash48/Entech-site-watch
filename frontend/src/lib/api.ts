import type {
  ChatResponse, ChatStatus, ChatTurn, Exceedance, Health, Overview, OverviewQuery, Page, Reading, ReadingsQuery, SensorInfo,
  SiteDetail, SiteSummary, Summary, Threshold,
} from "./types";

/** Backend base URL. Public by design: it is embedded in the browser bundle. Never put secrets here. */
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001").replace(/\/+$/, "");

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
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal,
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
      cache: "no-store",
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError(0, "NETWORK_ERROR",
      `Cannot reach the SiteWatch API at ${API_BASE_URL}. Make sure the backend is running.`);
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
};
