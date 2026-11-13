// Timestamps from the API are as recorded by the site sensors (no time zone), e.g.
// "2026-11-02T10:00:00". They are formatted from the string itself so the browser's
// time zone never shifts them.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TS_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

function parts(ts: string) {
  const m = TS_RE.exec(ts);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return { y: +y, mo: +mo, d: +d, h: +h, mi: +mi };
}

export function formatTime(ts: string | null | undefined): string {
  const p = ts ? parts(ts) : null;
  if (!p) return ts || "—";
  return `${p.h % 12 || 12}:${String(p.mi).padStart(2, "0")} ${p.h < 12 ? "AM" : "PM"}`;
}

export function formatDate(ts: string | null | undefined): string {
  const p = ts ? parts(ts) : null;
  if (!p) return ts || "—";
  return `${MONTHS[p.mo - 1]} ${p.d}, ${p.y}`;
}

export function formatDateTime(ts: string | null | undefined): string {
  const p = ts ? parts(ts) : null;
  if (!p) return ts || "—";
  return `${formatDate(ts)}, ${formatTime(ts)}`;
}

/** Sortable epoch-like number for charts; treats the timestamp as UTC to avoid zone shifts. */
export function tsValue(ts: string): number {
  const p = parts(ts);
  return p ? Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) : NaN;
}

export function formatTick(ms: number): string {
  const d = new Date(ms);
  const h = d.getUTCHours();
  return `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function formatNumber(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
}

/** Moment the backend loaded the files (UTC ISO), shown in the viewer's local time. */
export function formatLoadedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function sensorType(sensor: string): string {
  return sensor.split("_")[0];
}

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
