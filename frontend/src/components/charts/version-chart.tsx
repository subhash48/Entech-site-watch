"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import type { DatasetVersion } from "@/lib/types";

const SERIES = [
  { key: "valid", name: "Valid readings", color: "#2459d6" },
  { key: "exceeded", name: "Exceedances", color: "var(--exceeded)" },
  { key: "missing", name: "Missing", color: "var(--missing)" },
] as const;

/** Totals of every stored version side by side (oldest first). Shown only when there is history to compare. */
export function VersionChart({ versions }: { versions: DatasetVersion[] }) {
  if (versions.length < 2) return null;
  const rows = [...versions].sort((a, b) => a.version - b.version).map((v) => ({
    label: `v${v.version}`, name: v.name, active: v.is_active,
    valid: v.stats.valid_readings, exceeded: v.stats.exceeded_readings, missing: v.stats.missing_readings,
  }));
  return (
    <div className="space-y-2" data-testid="version-chart">
      <h3 className="text-sm font-semibold">Dataset comparison</h3>
      <ChartContainer config={{}} className="aspect-auto h-[220px] w-full">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={3} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border)" }} fontSize={12} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={40} />
          <Tooltip labelFormatter={(label) => {
            const r = rows.find((x) => x.label === label);
            return r ? `${r.label} · ${r.name}${r.active ? " (active)" : ""}` : String(label);
          }} />
          {SERIES.map((s) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />)}
        </BarChart>
      </ChartContainer>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {SERIES.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.name}</span>)}
        <span>Counts per stored version, as uploaded</span>
      </div>
    </div>
  );
}
