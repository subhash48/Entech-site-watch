"use client";

import { useMemo, useState } from "react";
import { BarChart3, LineChart as LineIcon, RotateCcw } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis,
} from "recharts";
import { DashCard } from "@/components/dashboard/dash-card";
import { sensorMeta } from "@/components/dashboard/sensor-meta";
import { useData } from "@/components/data-provider";
import { FilterSelect } from "@/components/filter-select";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { ChartContainer } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, formatNumber, sensorType, titleCase, tsValue } from "@/lib/format";
import type { Overview, SensorTrend } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const SITE_COLORS = ["#2459d6", "#0f9f8f", "#9b5de5", "#e0791b", "#d6336c", "#4c6ef5", "#2b8a3e", "#868e96"];

function ExceedanceDot(props: { cx?: number; cy?: number; payload?: { status: string }; stroke?: string }) {
  const { cx, cy, payload, stroke } = props;
  if (cx === undefined || cy === undefined || payload === undefined) return null;
  if (payload.status === "EXCEEDED") {
    return <circle cx={cx} cy={cy} r={6} fill="var(--exceeded)" stroke="var(--card)" strokeWidth={2} data-exceedance />;
  }
  return <circle cx={cx} cy={cy} r={3.5} fill="var(--card)" stroke={stroke} strokeWidth={2} />;
}

interface Point { t: number; value: number | null; status: string; raw: string; site: string }

function HistoryTooltip({ active, payload, unit }: { active?: boolean; unit: string; payload?: { payload: Point; color: string; name: string }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{payload[0].name}</p>
      <p className="text-muted-foreground">{formatDateTime(p.raw)}</p>
      <p className="mt-1 tabular">{p.value === null ? "Missing (not plotted)" : `${formatNumber(p.value)} ${unit}`}
        {p.status === "EXCEEDED" && <span className="ml-1 font-semibold text-exceeded">exceeded</span>}</p>
    </div>
  );
}

/** Readings over time for one sensor, one line per site, with the configured limit and exceedance markers.
 *  Missing readings break the line; they are never drawn as zero, and nothing is interpolated. */
export function SensorHistoryChart({ trend }: { trend: SensorTrend }) {
  const series = useMemo(() => {
    const bySite = new Map<string, Point[]>();
    for (const p of trend.points) {
      const t = tsValue(p.timestamp);
      if (Number.isNaN(t)) continue;
      const list = bySite.get(p.site_id) ?? [];
      list.push({ t, value: p.value, status: p.status, raw: p.timestamp, site: p.site_name });
      bySite.set(p.site_id, list);
    }
    return [...bySite.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([site, points], i) => ({ site, name: points[0]?.site ?? site, color: SITE_COLORS[i % SITE_COLORS.length],
        points: points.sort((a, b) => a.t - b.t) }));
  }, [trend]);

  const values = trend.points.flatMap((p) => (p.value === null ? [] : [p.value]));
  const missing = trend.points.filter((p) => p.value === null).length;
  const exceeded = trend.points.filter((p) => p.status === "EXCEEDED").length;
  const top = Math.max(...values, trend.threshold ?? 0) * 1.15 || 1;
  const unit = trend.unit ?? "";
  const multiDay = (() => {
    const ts = trend.points.map((p) => tsValue(p.timestamp)).filter((t) => !Number.isNaN(t));
    return ts.length > 0 && Math.max(...ts) - Math.min(...ts) > 36 * 3_600_000;
  })();
  const tick = (ms: number) => {
    const d = new Date(ms);
    const h = d.getUTCHours();
    const time = `${h % 12 || 12}${d.getUTCMinutes() ? `:${String(d.getUTCMinutes()).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
    return multiDay ? `${formatDate(d.toISOString()).replace(/, \d{4}$/, "")} ${time}` : time;
  };

  if (!values.length) return <EmptyState title="No measured values" description="Every reading in this range is missing." className="py-8" />;
  return (
    <div className="space-y-2">
      <ChartContainer config={{}} className="aspect-auto h-[260px] w-full" data-testid="sensor-history-chart">
        <LineChart margin={{ top: 12, right: 16, left: -4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={tick}
            tickLine={false} axisLine={{ stroke: "var(--border)" }} fontSize={12} tickMargin={8} allowDuplicatedCategory={false} />
          <YAxis domain={[0, top]} tickLine={false} axisLine={false} fontSize={12} width={48}
            tickFormatter={(v: number) => formatNumber(Number(v.toPrecision(3)))} />
          <Tooltip content={<HistoryTooltip unit={unit} />} />
          {trend.threshold !== null && (
            <ReferenceLine y={trend.threshold} stroke="var(--exceeded)" strokeDasharray="6 4" strokeWidth={1.5}
              label={{ value: `Limit ${formatNumber(trend.threshold)} ${unit}`, position: "insideTopRight", fontSize: 11, fill: "var(--exceeded)" }} />
          )}
          {series.map((s) => (
            <Line key={s.site} data={s.points} dataKey="value" name={`${s.name} (${s.site})`} stroke={s.color} strokeWidth={2.25}
              connectNulls={false} isAnimationActive={false} dot={<ExceedanceDot />} activeDot={{ r: 6 }} />
          ))}
        </LineChart>
      </ChartContainer>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" data-testid="history-legend">
        {series.map((s) => (
          <span key={s.site} className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: s.color }} />{s.name}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-exceeded" /> Exceedance ({exceeded})</span>
        {trend.threshold !== null && <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-exceeded" /> Configured limit</span>}
        {missing > 0 && <span className="text-missing">{missing} missing reading{missing === 1 ? "" : "s"} shown as a gap, not zero</span>}
      </div>
    </div>
  );
}

interface CompareRow { site: string; [type: string]: number | string | null }

/** Each site's peak reading as a percentage of its configured limit, per sensor type. Normalising by the
 *  limit makes different units comparable; 100% is the limit. */
export function SiteComparisonChart({ overview }: { overview: Overview }) {
  const { rows, types } = useMemo(() => {
    const types = [...new Set(overview.trends.map((t) => sensorType(t.sensor)))];
    const rows: CompareRow[] = overview.sites.map((s) => {
      const row: CompareRow = { site: s.site_id, name: s.site_name };
      for (const t of overview.trends) {
        if (!t.threshold) continue;
        const vals = t.points.filter((p) => p.site_id === s.site_id && p.value !== null).map((p) => (p.value as number) / (t.threshold as number) * 100);
        if (!vals.length) continue;
        const key = sensorType(t.sensor);
        row[key] = Math.round(Math.max(Number(row[key] ?? 0), ...vals) * 10) / 10;
      }
      return row;
    });
    return { rows, types };
  }, [overview]);

  if (!rows.length) return <EmptyState title="No sites in range" description="Widen the date range." className="py-8" />;
  const max = Math.max(110, ...rows.flatMap((r) => types.map((t) => Number(r[t] ?? 0))));
  return (
    <div className="space-y-2">
      <ChartContainer config={{}} className="aspect-auto h-[260px] w-full" data-testid="site-comparison-chart">
        <BarChart data={rows} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="site" tickLine={false} axisLine={{ stroke: "var(--border)" }} fontSize={12} />
          <YAxis domain={[0, Math.ceil(max / 10) * 10]} tickLine={false} axisLine={false} fontSize={12} width={52}
            tickFormatter={(v: number) => `${v}%`} />
          <Tooltip formatter={(v, name) => [`${v}% of limit`, titleCase(String(name))]}
            labelFormatter={(label) => rows.find((r) => r.site === label)?.name ?? String(label)} />
          <ReferenceLine y={100} stroke="var(--exceeded)" strokeDasharray="6 4"
            label={{ value: "Limit", position: "insideTopLeft", fontSize: 11, fill: "var(--exceeded)" }} />
          {types.map((t, i) => (
            <Bar key={t} dataKey={t} name={t} fill={sensorMeta(t, i).color} radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={22} />
          ))}
        </BarChart>
      </ChartContainer>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {types.map((t, i) => <span key={t} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: sensorMeta(t, i).color }} />{titleCase(t)}</span>)}
        <span>Peak reading as % of its limit</span>
      </div>
    </div>
  );
}

/** Sensors page charts with shared filters: sensor, site and date range. */
export function SensorCharts() {
  const { overview: full } = useData();
  const sensors = full?.sensor_breakdown ?? [];
  const dates = full?.available_dates ?? [];
  const [sensor, setSensor] = useState("");
  const [site, setSite] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const selected = sensor || sensors[0]?.sensor || "";
  const query = { site_id: site || undefined, start: from ? `${from}T00:00:00` : undefined, end: to ? `${to}T23:59:59` : undefined };
  const key = full ? `charts:${JSON.stringify(query)}:${full.data_source.dataset.id}` : null;
  const { data, error, reload } = useApi(key, (signal) => api.overview(query, signal));
  const trend = data?.trends.find((t) => t.sensor === selected);
  const filtered = Boolean(site || from || to);

  return (
    <div className="space-y-4" data-testid="sensor-charts">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4 shadow-card">
        <FilterSelect label="Sensor" value={selected} onChange={setSensor} testId="chart-sensor"
          options={sensors.map((s) => ({ value: s.sensor, label: s.label }))} />
        <FilterSelect label="Site" value={site} onChange={setSite} allLabel="All sites" testId="chart-site"
          options={(full?.sites ?? []).map((s) => ({ value: s.site_id, label: `${s.site_name} (${s.site_id})` }))} />
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">From
          <Input type="date" value={from} min={dates[0]} max={to || dates.at(-1)} onChange={(e) => setFrom(e.target.value)}
            className="h-8 w-40" aria-label="Chart start date" data-testid="chart-from" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">To
          <Input type="date" value={to} min={from || dates[0]} max={dates.at(-1)} onChange={(e) => setTo(e.target.value)}
            className="h-8 w-40" aria-label="Chart end date" data-testid="chart-to" />
        </label>
        {filtered && <Button variant="ghost" size="sm" onClick={() => { setSite(""); setFrom(""); setTo(""); }}><RotateCcw /> Reset</Button>}
        <p className="ml-auto text-xs text-muted-foreground" data-testid="chart-coverage">Data covers {!dates.length ? "—"
          : dates.length === 1 ? formatDate(`${dates[0]}T00:00`) : `${formatDate(`${dates[0]}T00:00`)} – ${formatDate(`${dates.at(-1)}T00:00`)}`}</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <DashCard icon={LineIcon} title="Sensor readings over time" className="xl:col-span-3" testId="history-card-chart"
          subtitle={trend ? `${trend.label} by site, as recorded` : "Readings by site"}>
          {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Skeleton className="h-[260px]" />
            : trend ? <SensorHistoryChart trend={trend} />
              : <EmptyState title="No readings for this sensor" description="Try another sensor, site or date range." className="py-8" />}
        </DashCard>
        <DashCard icon={BarChart3} title="Site comparison" className="xl:col-span-2" testId="site-comparison-card"
          subtitle="Peak reading relative to each limit">
          {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Skeleton className="h-[260px]" /> : <SiteComparisonChart overview={data} />}
        </DashCard>
      </div>
    </div>
  );
}
