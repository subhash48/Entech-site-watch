"use client";

import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { DashCard } from "@/components/dashboard/dash-card";
import { sensorMeta } from "@/components/dashboard/sensor-meta";
import { EmptyState } from "@/components/states";
import { ChartContainer } from "@/components/ui/chart";
import { formatDate, sensorType, tsValue } from "@/lib/format";
import type { SensorTrend } from "@/lib/types";
import { cn } from "@/lib/utils";

type Mode = "alerts" | "readings";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function bucketLabel(ms: number, size: number) {
  const d = new Date(ms);
  if (size === DAY) return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${d.getUTCDate()}`;
  const h = d.getUTCHours();
  return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
}

interface Series {
  key: string;
  name: string;
  color: string;
  exceeded: number;
  readings: number;
}

const ORDER = ["vibration", "noise", "dust"];
/** Vibration, noise, dust first (as in the design), then any other sensor types alphabetically. */
function ordered(list: Series[]) {
  const rank = (k: string) => (ORDER.includes(k) ? ORDER.indexOf(k) : ORDER.length);
  return list.sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
}

/** Build hourly (or daily, for spans over two days) buckets from the readings actually in view. */
function useTrendData(trends: SensorTrend[], mode: Mode) {
  return useMemo(() => {
    const series = new Map<string, Series>();
    const events: { t: number; type: string; exceeded: boolean }[] = [];
    trends.forEach((tr, i) => {
      const meta = sensorMeta(tr.sensor, i);
      const s = series.get(meta.type) ?? { key: meta.type, name: meta.name, color: meta.color, exceeded: 0, readings: 0 };
      for (const p of tr.points) {
        const t = tsValue(p.timestamp);
        if (Number.isNaN(t)) continue;
        events.push({ t, type: sensorType(tr.sensor), exceeded: p.status === "EXCEEDED" });
        s.readings += 1;
        if (p.status === "EXCEEDED") s.exceeded += 1;
      }
      series.set(meta.type, s);
    });
    if (!events.length) return { rows: [], series: ordered([...series.values()]), size: HOUR, first: "" };

    const min = Math.min(...events.map((e) => e.t));
    const max = Math.max(...events.map((e) => e.t));
    const size = max - min > 2 * DAY ? DAY : HOUR;
    const start = Math.floor(min / size) * size;
    const end = Math.floor(max / size) * size;
    const rows: Record<string, number | string>[] = [];
    for (let b = start; b <= end; b += size) {
      const row: Record<string, number | string> = { t: b, label: bucketLabel(b, size) };
      for (const s of series.values()) {
        row[s.key] = mode === "alerts"
          ? events.filter((e) => e.type === s.key && e.exceeded && e.t < b + size).length   // cumulative
          : events.filter((e) => e.type === s.key && e.t >= b && e.t < b + size).length;   // per bucket
      }
      rows.push(row);
    }
    const iso = new Date(start).toISOString();
    return { rows, series: ordered([...series.values()]), size, first: iso };
  }, [trends, mode]);
}

function TrendTooltip({ active, payload, label, mode }: {
  active?: boolean; label?: string; mode: Mode;
  payload?: { dataKey: string; value: number; color: string; name: string }[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 tabular">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold">{p.value}</span>
        </p>
      ))}
      <p className="mt-1 text-muted-foreground">{mode === "alerts" ? "Cumulative exceedances" : "Readings in this hour"}</p>
    </div>
  );
}

export function TrendsCard({ trends }: { trends: SensorTrend[] }) {
  const [mode, setMode] = useState<Mode>("alerts");
  const { rows, series, size, first } = useTrendData(trends, mode);
  const total = series.reduce((n, s) => n + (mode === "alerts" ? s.exceeded : s.readings), 0);

  return (
    <DashCard icon={TrendingUp} title="Alert Trends" testId="trends-card" className="xl:h-[25rem]"
      subtitle={mode === "alerts" ? "Cumulative threshold exceedances by sensor type" : "Readings received by sensor type"}
      action={
        <div role="group" aria-label="Chart mode" className="flex shrink-0 rounded-xl border bg-muted p-1">
          {(["alerts", "readings"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
              className={cn("rounded-lg px-3.5 py-1.5 text-sm font-semibold capitalize transition-colors",
                mode === m ? "bg-[#1e3a8a] text-white shadow-sm dark:bg-primary dark:text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {m}
            </button>
          ))}
        </div>
      }>
      {!rows.length ? (
        <EmptyState title="No timestamped readings" description="Nothing to chart for these filters." className="py-8" />
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-4 sm:flex-row">
          <div className="flex min-h-[220px] min-w-0 flex-1 flex-col">
            <ChartContainer config={{}} className="aspect-auto h-full min-h-[200px] w-full" data-testid="trends-chart">
              <AreaChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  {series.map((s) => (
                    <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border)" }} fontSize={12} tickMargin={8} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={36}
                  label={{ value: mode === "alerts" ? "Alerts" : "Readings", angle: -90, position: "insideLeft", offset: 14, fontSize: 12, fill: "var(--muted-foreground)" }} />
                <Tooltip content={<TrendTooltip mode={mode} />} />
                {series.map((s) => (
                  <Area key={s.key} dataKey={s.key} name={s.name} type="monotone" stroke={s.color} strokeWidth={2.5}
                    fill={`url(#fill-${s.key})`} isAnimationActive={false}
                    dot={{ r: 4, fill: "var(--card)", stroke: s.color, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                ))}
              </AreaChart>
            </ChartContainer>
            <p className="pt-1 text-xs text-muted-foreground">
              {size === DAY ? "Daily" : "Hourly"} buckets · times as recorded{size === HOUR && first ? ` on ${formatDate(first)}` : ""}
            </p>
          </div>
          <ul className="grid shrink-0 gap-2.5 sm:w-44 sm:content-center" data-testid="trend-legend">
            {series.map((s) => {
              const value = mode === "alerts" ? s.exceeded : s.readings;
              return (
                <li key={s.key} className="flex items-start justify-between gap-2 rounded-xl bg-muted/70 px-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className="size-2.5 rounded-full" style={{ background: s.color }} />{s.name}
                  </span>
                  <span className="text-right">
                    <span className="block text-base leading-tight font-bold tabular">{value}</span>
                    <span className="block text-[11px] whitespace-nowrap text-muted-foreground tabular">
                      {mode === "alerts" ? `of ${s.readings} readings` : `${s.exceeded} exceeded`}
                    </span>
                  </span>
                </li>
              );
            })}
            <li className="px-1 text-xs text-muted-foreground tabular">{total} {mode === "alerts" ? "exceedances" : "readings"} in view</li>
          </ul>
        </div>
      )}
    </DashCard>
  );
}
