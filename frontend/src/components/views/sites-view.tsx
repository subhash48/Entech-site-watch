"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useData } from "@/components/data-provider";
import { PageHeader } from "@/components/page-header";
import { SitesTable } from "@/components/sites-table";
import { SiteStatusBadge } from "@/components/status";
import { CardsSkeleton, ErrorState } from "@/components/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, sensorType, titleCase } from "@/lib/format";
import type { SiteSummary } from "@/lib/types";

function SiteCard({ site }: { site: SiteSummary }) {
  const pct = (n: number) => `${site.total_readings ? (n / site.total_readings) * 100 : 0}%`;
  return (
    <Link href={`/sites/${site.site_id}`} className="group rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <Card className="h-full gap-3 transition-colors group-hover:border-primary/30" data-testid={`site-card-${site.site_id}`}>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <CardTitle className="truncate">{site.site_name}</CardTitle>
            <CardDescription className="font-mono text-xs">{site.site_id}</CardDescription>
          </div>
          <SiteStatusBadge status={site.status} />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-label="Reading status mix">
            <span className="bg-normal" style={{ width: pct(site.normal_count) }} />
            <span className="bg-exceeded" style={{ width: pct(site.exceeded_count) }} />
            <span className="bg-missing" style={{ width: pct(site.missing_data_count) }} />
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center text-xs">
            <div><dt className="text-muted-foreground">Normal</dt><dd className="text-base font-semibold tabular">{site.normal_count}</dd></div>
            <div><dt className="text-muted-foreground">Exceeded</dt><dd className="text-base font-semibold text-exceeded tabular">{site.exceeded_count}</dd></div>
            <div><dt className="text-muted-foreground">Missing</dt><dd className="text-base font-semibold text-missing tabular">{site.missing_data_count}</dd></div>
          </dl>
          <p className="text-xs text-muted-foreground">
            {site.sensors.map((s) => titleCase(sensorType(s))).join(" · ")}
            {site.last_exceedance_at && <> · last alert {formatDateTime(site.last_exceedance_at)}</>}
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            View details <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

export function SitesView() {
  const { overview, error, refresh } = useData();
  return (
    <div className="space-y-6">
      <PageHeader title="Sites" description="Construction sites in the dataset with their current monitoring status." />
      {error && !overview ? <ErrorState error={error} onRetry={refresh} /> : !overview ? <CardsSkeleton count={3} /> : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {overview.sites.map((s) => <SiteCard key={s.site_id} site={s} />)}
          </div>
          <Card className="gap-3">
            <CardHeader><CardTitle>All sites</CardTitle></CardHeader>
            <CardContent className="px-2 sm:px-4"><SitesTable sites={overview.sites} /></CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
