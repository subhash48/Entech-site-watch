"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime, formatNumber, formatTick, formatTime, tsValue } from "@/lib/format";
import type { ReadingStatus, SensorTrend } from "@/lib/types";

const SITE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const HOUR = 60 * 60 * 1000;

/** Round up to a readable axis maximum: 1, 2, 2.5 or 5 × 10^n. */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * exp >= v) ?? 10;
  return step * exp;
}

interface Point {
  t: number;
  value: number | null;
  status: ReadingStatus;
  site_name: string;
  timestamp: string;
  id: number;
}

interface DotProps {
  cx?: number;
  cy?: number;
  stroke?: string;
  payload?: Point;
}

function Dot({ cx, cy, stroke, payload }: DotProps) {
  if (cx == null || cy == null || !payload || payload.value == null) return <g key={payload?.id ?? "empty"} />;
  const exceeded = payload.status === "EXCEEDED";
  return (
    <circle
      key={payload.id}
      cx={cx}
      cy={cy}
      r={exceeded ? 5 : 3.5}
      fill={exceeded ? "var(--exceeded)" : "var(--card)"}
      stroke={exceeded ? "var(--card)" : stroke}
      strokeWidth={exceeded ? 1.5 : 2}
    />
  );
}

function TrendTooltip({ active, payload, unit }: {
  active?: boolean; payload?: { payload: Point; color?: string }[]; unit: string | null;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{p.site_name}</p>
      <p className="text-muted-foreground">{formatDateTime(p.timestamp)}</p>
      <p className="mt-1 tabular">
        {p.value == null ? <span className="text-missing">Missing data</span> : (
          <span className={p.status === "EXCEEDED" ? "font-semibold text-exceeded" : ""}>
            {formatNumber(p.value)} {unit} {p.status === "EXCEEDED" && "· exceeded"}
          </span>
        )}
      </p>
    </div>
  );
}

export function TrendsChart({ trends }: { trends: SensorTrend[] }) {
  const [selected, setSelected] = useState(trends[0]?.sensor ?? "");
  const trend = trends.find((t) => t.sensor === selected) ?? trends[0];

  const { series, config, domain, ticks, yMax, missing } = useMemo(() => {
    if (!trend) return { series: [], config: {}, domain: [0, 1] as [number, number], ticks: [], yMax: 1, missing: [] };
    const bySite = new Map<string, { name: string; points: Point[] }>();
    for (const p of trend.points) {
      const entry = bySite.get(p.site_id) ?? { name: p.site_name, points: [] };
      entry.points.push({ t: tsValue(p.timestamp), value: p.value, status: p.status, site_name: p.site_name,
        timestamp: p.timestamp, id: p.reading_id });
      bySite.set(p.site_id, entry);
    }
    const ids = [...bySite.keys()].sort();
    const cfg: ChartConfig = {};
    ids.forEach((id, i) => { cfg[id] = { label: bySite.get(id)!.name, color: SITE_COLORS[i % SITE_COLORS.length] }; });
    const times = trend.points.map((p) => tsValue(p.timestamp));
    const start = Math.floor(Math.min(...times) / HOUR) * HOUR;
    const end = Math.ceil(Math.max(...times) / HOUR) * HOUR;
    const span = Math.max(end - start, HOUR);
    const step = span > 12 * HOUR ? 4 * HOUR : span > 6 * HOUR ? 2 * HOUR : HOUR;
    const hourTicks: number[] = [];
    for (let t = start; t <= end; t += step) hourTicks.push(t);
    const values = trend.points.flatMap((p) => (p.value == null ? [] : [p.value]));
    return {
      series: ids.map((id) => ({ id, ...bySite.get(id)! })),
      config: cfg,
      domain: [start, Math.max(end, start + HOUR)] as [number, number],
      ticks: hourTicks,
      yMax: niceCeil(Math.max(...values, trend.threshold ?? 0) * 1.1),
      missing: trend.points.filter((p) => p.value == null),
    };
  }, [trend]);

  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Sensor trends</CardTitle>
          <CardDescription>
            Readings by site over time. Red points exceeded the configured limit (dashed line).
          </CardDescription>
        </div>
        <Tabs value={trend?.sensor} onValueChange={setSelected}>
          <TabsList>
            {trends.map((t) => <TabsTrigger key={t.sensor} value={t.sensor}>{t.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="space-y-3">
        {trend && (
          <>
            <ChartContainer config={config} className="aspect-auto h-[260px] w-full" data-testid="trends-chart">
              <LineChart margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" scale="time" domain={domain} ticks={ticks} tickFormatter={formatTick}
                  tickLine={false} axisLine={false} minTickGap={16} fontSize={11} allowDuplicatedCategory={false} />
                <YAxis domain={[0, yMax]} tickLine={false} axisLine={false} width={44} fontSize={11}
                  tickFormatter={(v: number) => formatNumber(v)} />
                <Tooltip content={<TrendTooltip unit={trend.unit} />} />
                {trend.threshold != null && (
                  <ReferenceLine y={trend.threshold} stroke="var(--exceeded)" strokeDasharray="5 4" ifOverflow="extendDomain"
                    label={{ value: `Limit ${formatNumber(trend.threshold)} ${trend.unit ?? ""}`, position: "insideTopRight",
                      fill: "var(--exceeded)", fontSize: 11 }} />
                )}
                {series.map((s) => (
                  <Line key={s.id} data={s.points} dataKey="value" name={s.name} type="monotone"
                    stroke={`var(--color-${s.id})`} strokeWidth={2} connectNulls={false} isAnimationActive={false}
                    dot={<Dot />} activeDot={{ r: 6 }} />
                ))}
              </LineChart>
            </ChartContainer>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {series.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1.5">
                  {/* The legend sits outside ChartContainer, so use the color value directly. */}
                  <span className="h-0.5 w-3 rounded" style={{ background: config[s.id]?.color }} />
                  {s.name}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-exceeded" /> Exceeded
              </span>
              <span>Unit: {trend.unit ?? "n/a"}</span>
            </div>
            {missing.length > 0 && (
              <p className="rounded-md border border-missing-border bg-missing-soft/60 px-3 py-2 text-xs">
                <span className="font-medium text-missing">{missing.length} missing reading{missing.length > 1 ? "s" : ""}</span>{" "}
                shown as a gap, not zero: {missing.map((m) => `${m.site_name} at ${formatTime(m.timestamp)}`).join("; ")}.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
