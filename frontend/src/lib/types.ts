// Mirrors the FastAPI response models in backend/app/schemas.py.

export type ReadingStatus = "NORMAL" | "EXCEEDED" | "MISSING_DATA";
export type SiteStatus = "ALERT" | "NEEDS_REVIEW" | "OK";

export interface Threshold {
  sensor: string;
  limit: number;
  unit: string;
}

export interface Reading {
  id: number;
  site_id: string;
  site_name: string;
  sensor: string;
  sensor_label: string;
  timestamp: string | null;
  raw_timestamp: string;
  value: number | null;
  raw_value: string;
  threshold: number | null;
  unit: string | null;
  threshold_source: string | null;
  status: ReadingStatus;
  exceeded_by: number | null;
  issues: string[];
}

export interface SiteSummary {
  site_id: string;
  site_name: string;
  status: SiteStatus;
  total_readings: number;
  normal_count: number;
  exceeded_count: number;
  missing_data_count: number;
  sensors: string[];
  first_reading_at: string | null;
  last_reading_at: string | null;
  last_exceedance_at: string | null;
}

export interface Exceedance {
  reading_id: number;
  site_id: string;
  site_name: string;
  sensor: string;
  sensor_label: string;
  timestamp: string;
  value: number;
  threshold: number;
  unit: string;
  exceeded_by: number;
  exceeded_by_pct: number | null;
  /** Display priority from percent over the limit: high >= 20%, medium >= 5%, low < 5%. */
  severity: "high" | "medium" | "low";
}

export interface SiteSensorGroup {
  sensor: string;
  label: string;
  threshold: Threshold | null;
  readings: Reading[];
  exceeded_count: number;
  missing_data_count: number;
  max_value: number | null;
}

export interface SiteDetail extends SiteSummary {
  sensor_groups: SiteSensorGroup[];
  exceedances: Exceedance[];
}

export interface SensorInfo {
  sensor: string;
  label: string;
  threshold: Threshold | null;
  reading_count: number;
}

export interface Totals {
  total_sites: number;
  total_readings: number;
  normal_readings: number;
  exceeded_readings: number;
  missing_data_readings: number;
  sites_with_alerts: number;
}

export interface SensorBreakdown {
  sensor: string;
  label: string;
  unit: string | null;
  threshold: number | null;
  total: number;
  normal: number;
  exceeded: number;
  missing_data: number;
}

export interface TrendPoint {
  reading_id: number;
  timestamp: string;
  site_id: string;
  site_name: string;
  value: number | null;
  status: ReadingStatus;
}

export interface SensorTrend {
  sensor: string;
  label: string;
  unit: string | null;
  threshold: number | null;
  points: TrendPoint[];
}

export interface InvalidRow {
  row: number;
  site_id: string;
  sensor: string;
  raw_timestamp: string;
  raw_value: string;
  issues: string[];
}

export interface Overview {
  generated_at: string;
  data_source: { type: "static_files"; files: string[]; loaded_at: string; note: string };
  period_start: string | null;
  period_end: string | null;
  available_dates: string[];
  totals: Totals;
  sites: SiteSummary[];
  sensor_breakdown: SensorBreakdown[];
  trends: SensorTrend[];
  recent_alerts: Exceedance[];
  validation: { warnings: string[]; invalid_rows: InvalidRow[] };
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface Summary {
  generated_at: string;
  scope: string;
  period_start: string | null;
  period_end: string | null;
  totals: Totals;
  sites: SiteSummary[];
  exceedances: Exceedance[];
  data_quality: string[];
  report: string;
}

export interface Health {
  status: "ok";
  version: string;
  environment: string;
  readings_loaded: number;
  sites_loaded: number;
  thresholds_loaded: number;
  data_warnings: number;
  loaded_at: string;
  ai_configured: boolean;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSource {
  type: "data" | "doc";
  name: string;
}

export interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  tool_calls: { name: string; arguments: Record<string, unknown>; ok: boolean }[];
  refused: boolean;
  model: string | null;
}

export interface ChatStatus {
  configured: boolean;
  provider: string;
  model: string | null;
  message: string;
}

export interface ReadingsQuery {
  site_id?: string;
  sensor?: string;
  status?: ReadingStatus;
  start?: string;
  end?: string;
  q?: string;
  sort?: "timestamp" | "value" | "site" | "sensor";
  order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

export interface OverviewQuery {
  site_id?: string;
  sensor?: string;
  status?: ReadingStatus;
  start?: string;
  end?: string;
}
