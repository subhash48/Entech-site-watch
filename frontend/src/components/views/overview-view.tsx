"use client";

import Link from "next/link";
import { CircleDashed } from "lucide-react";
import { useData } from "@/components/data-provider";
import { KpiCards } from "@/components/overview/kpi-cards";
import { RecentAlerts } from "@/components/overview/recent-alerts";
import { StatusBreakdown } from "@/components/overview/status-breakdown";
import { TrendsChart } from "@/components/overview/trends-chart";
import { PageHeader } from "@/components/page-header";
import { SitesTable } from "@/components/sites-table";
import { CardsSkeleton, ErrorState } from "@/components/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatTime } from "@/lib/format";

export function OverviewView() {
  const { overview, error, refresh } = useData();

  if (error && !overview) {
    return (
      <div className="space-y-6">
        <PageHeader title="Overview" />
        <ErrorState error={error} onRetry={refresh} />
      </div>
    );
  }
  if (!overview) {
    return (
      <div className="space-y-6" aria-busy="true">
        <PageHeader title="Overview" description="Loading monitoring data…" />
        <CardsSkeleton />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-[380px] lg:col-span-2" />
          <Skeleton className="h-[380px]" />
        </div>
      </div>
    );
  }

  const { totals, period_start, period_end, validation } = overview;
  const period = period_start && period_end
    ? `${formatDate(period_start)}, ${formatTime(period_start)} – ${formatTime(period_end)}`
    : "No timestamped readings";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={<>Monitoring period: <span className="font-medium text-foreground">{period}</span> · {totals.total_readings} readings from {totals.total_sites} sites</>}
      />
      <KpiCards totals={totals} />

      {(validation.invalid_rows.length > 0 || validation.warnings.length > 0) && (
        <div className="flex items-start gap-3 rounded-lg border border-missing-border bg-missing-soft/50 px-4 py-3 text-sm" data-testid="validation-notice">
          <CircleDashed className="mt-0.5 size-4 shrink-0 text-missing" />
          <div className="space-y-1">
            <p className="font-medium">
              {validation.invalid_rows.length} reading{validation.invalid_rows.length === 1 ? "" : "s"} could not be evaluated
              {validation.warnings.length > 0 && ` · ${validation.warnings.length} file warning${validation.warnings.length === 1 ? "" : "s"}`}
            </p>
            <ul className="text-muted-foreground">
              {validation.invalid_rows.map((r) => (
                <li key={r.row}>Row {r.row}: {r.site_id} {r.sensor} at {formatTime(r.raw_timestamp)}: {r.issues.join("; ")}. Not treated as zero.</li>
              ))}
              {validation.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
            <Link href="/sensors?status=MISSING_DATA" className="text-xs font-medium text-primary hover:underline">Review missing data</Link>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><TrendsChart trends={overview.trends} /></div>
        <StatusBreakdown breakdown={overview.sensor_breakdown} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-3 lg:col-span-2">
          <CardHeader>
            <CardTitle>Site monitoring</CardTitle>
            <CardDescription>Status and alert counts per construction site.</CardDescription>
          </CardHeader>
          <CardContent className="px-2 sm:px-4"><SitesTable sites={overview.sites} /></CardContent>
        </Card>
        <RecentAlerts alerts={overview.recent_alerts} />
      </div>
    </div>
  );
}
