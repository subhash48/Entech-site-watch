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
  data_source: { type: "static_files" | "uploaded_dataset"; files: string[]; loaded_at: string; note: string; dataset: DatasetInfo };
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
  dataset: DatasetInfo;
  storage: StorageMode;
}

// ---------- datasets ----------

export type StorageMode = "postgres" | "sqlite" | "none";

/** The dataset version every endpoint and the assistant are currently using. */
export interface DatasetInfo {
  id: string;
  version: number;
  name: string;
  source: "starter" | "upload";
  status: "active";
  created_at: string | null;
  created_by: string | null;
  activated_at: string | null;
  readings_filename: string;
  thresholds_filename: string;
}

export type FileKind = "readings.csv" | "thresholds.json";

export interface ValidationIssue {
  level: "error" | "warning";
  code: string;
  file: FileKind;
  message: string;
  rows: number[];
  count: number;
  examples: string[];
}

export interface FileInfo {
  kind: FileKind;
  filename: string;
  size_bytes: number;
  sha256: string;
  source: "uploaded" | "active_dataset";
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  files: FileInfo[];
  limits: { max_readings_bytes: number; max_thresholds_bytes: number; max_rows: number };
}

export interface DatasetStats {
  total_rows: number;
  valid_readings: number;
  normal_readings: number;
  exceeded_readings: number;
  missing_readings: number;
  sites: number;
  site_ids: string[];
  sensors: string[];
  sensor_categories: string[];
  thresholds: number;
  period_start: string | null;
  period_end: string | null;
}

export interface MetricChange {
  metric: string;
  label: string;
  current: number | null;
  proposed: number | null;
  change: number | null;
}

export interface DatasetComparison {
  against: string;
  metrics: MetricChange[];
  sites_added: string[];
  sites_removed: string[];
  sensors_added: string[];
  sensors_removed: string[];
  threshold_changes: { sensor: string; change: "added" | "removed" | "changed"; current: string | null; proposed: string | null }[];
}

export interface DatasetPreview {
  validation: ValidationReport;
  stats: DatasetStats | null;
  comparison: DatasetComparison | null;
  preview_rows: Reading[];
  activated: false;
}

export interface DatasetVersion {
  id: string;
  version: number;
  name: string;
  source: "starter" | "upload";
  created_at: string | null;
  created_by: string | null;
  readings_filename: string;
  thresholds_filename: string;
  readings_sha256: string | null;
  thresholds_sha256: string | null;
  stats: DatasetStats;
  warning_count: number;
  is_active: boolean;
  activated_at: string | null;
}

export interface StorageStatus {
  mode: StorageMode;
  writable: boolean;
  message: string;
}

export interface DatasetList {
  active_id: string;
  storage: StorageStatus;
  versions: DatasetVersion[];
}

export interface AdminStatus {
  admin_configured: boolean;
  authenticated: boolean;
  expires_at: number | null;
  storage: StorageStatus;
}

export interface CreateDatasetResponse {
  dataset: DatasetVersion;
  activated: boolean;
  previous_active_id: string;
  validation: ValidationReport;
  message: string;
}

export interface ActivationResponse {
  dataset: DatasetVersion;
  previous_active_id: string;
  message: string;
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
