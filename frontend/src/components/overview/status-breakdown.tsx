"use client";

import { Bar, BarChart, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { formatNumber } from "@/lib/format";
import type { SensorBreakdown } from "@/lib/types";

const config: ChartConfig = {
  normal: { label: "Normal", color: "var(--normal)" },
  exceeded: { label: "Exceeded", color: "var(--exceeded)" },
  missing_data: { label: "Missing data", color: "var(--missing)" },
};

function BreakdownTooltip({ active, payload }: { active?: boolean; payload?: { payload: SensorBreakdown }[] }) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{b.label}</p>
      <p className="tabular">Normal {b.normal} · Exceeded {b.exceeded} · Missing {b.missing_data}</p>
    </div>
  );
}

export function StatusBreakdown({ breakdown }: { breakdown: SensorBreakdown[] }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Sensor status breakdown</CardTitle>
        <CardDescription>Readings per sensor by classification.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChartContainer config={config} className="aspect-auto h-[150px] w-full">
          <BarChart data={breakdown} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }} barSize={18}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="label" width={104} tickLine={false} axisLine={false} fontSize={11} />
            <Tooltip cursor={{ fill: "var(--muted)" }} content={<BreakdownTooltip />} />
            <Bar dataKey="normal" stackId="s" fill="var(--color-normal)" isAnimationActive={false} />
            <Bar dataKey="exceeded" stackId="s" fill="var(--color-exceeded)" isAnimationActive={false} />
            <Bar dataKey="missing_data" stackId="s" fill="var(--color-missing_data)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
        <table className="w-full text-xs" data-testid="breakdown-table">
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 text-left font-medium">Sensor</th>
              <th className="py-1.5 text-right font-medium">Limit</th>
              <th className="py-1.5 text-right font-medium text-normal">Normal</th>
              <th className="py-1.5 text-right font-medium text-exceeded">Exceeded</th>
              <th className="py-1.5 text-right font-medium text-missing">Missing</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {breakdown.map((b) => (
              <tr key={b.sensor} className="border-b last:border-0">
                <td className="py-1.5">{b.label}</td>
                <td className="py-1.5 text-right text-muted-foreground">{formatNumber(b.threshold)} {b.unit}</td>
                <td className="py-1.5 text-right">{b.normal}</td>
                <td className="py-1.5 text-right">{b.exceeded}</td>
                <td className="py-1.5 text-right">{b.missing_data}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
