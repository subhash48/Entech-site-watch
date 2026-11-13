"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ReadingStatusBadge, rowTone, SiteStatusBadge } from "@/components/status";
import { CardsSkeleton, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/use-api";

export function SiteDetailView() {
  const { siteId } = useParams<{ siteId: string }>();
  const { data: site, error, reload } = useApi(`site:${siteId}`, (signal) => api.site(siteId, signal));
  const [sensor, setSensor] = useState("all");

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link href="/sites"><ArrowLeft /> All sites</Link>
    </Button>
  );

  if (error) return <div className="space-y-4">{back}<ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} /></div>;
  if (!site) return <div className="space-y-4">{back}<CardsSkeleton count={4} /></div>;

  const groups = site.sensor_groups.filter((g) => sensor === "all" || g.sensor === sensor);
  const stats = [
    ["Readings", site.total_readings, ""],
    ["Exceeded", site.exceeded_count, "text-exceeded"],
    ["Missing data", site.missing_data_count, "text-missing"],
    ["Normal", site.normal_count, "text-normal"],
  ] as const;

  return (
    <div className="space-y-6">
      {back}
      <PageHeader
        title={site.site_name}
        description={<span className="inline-flex items-center gap-2"><span className="font-mono">{site.site_id}</span><SiteStatusBadge status={site.status} /></span>}
        actions={<Button variant="outline" size="sm" asChild><Link href={`/readings?site_id=${site.site_id}`}>Open in Sensor Readings <ArrowRight /></Link></Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stats.map(([label, value, tone]) => (
          <Card key={label} className="gap-1 px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-xl font-semibold tabular ${tone}`} data-testid={`site-stat-${label}`}>{value}</p>
          </Card>
        ))}
        <Card className="col-span-2 gap-1 px-4 py-3 lg:col-span-1">
          <p className="text-xs text-muted-foreground">Last exceedance</p>
          <p className="text-sm font-medium">{site.last_exceedance_at ? formatDateTime(site.last_exceedance_at) : "None"}</p>
        </Card>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold">Readings by sensor</h2>
        <ToggleGroup type="single" value={sensor} onValueChange={(v) => setSensor(v || "all")} variant="outline" size="sm" aria-label="Filter by sensor">
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          {site.sensor_groups.map((g) => <ToggleGroupItem key={g.sensor} value={g.sensor}>{g.label}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.sensor} className="gap-3" data-testid={`sensor-group-${g.sensor}`}>
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div className="space-y-1">
                <CardTitle>{g.label}</CardTitle>
                <CardDescription>
                  {g.threshold
                    ? <>Limit {formatNumber(g.threshold.limit)} {g.threshold.unit} <span className="font-mono text-[11px]">(thresholds.json: {g.threshold.sensor})</span></>
                    : <span className="text-missing">No threshold configured</span>}
                </CardDescription>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>Peak <span className="font-semibold text-foreground tabular">{formatNumber(g.max_value)} {g.threshold?.unit}</span></p>
                <p><span className="text-exceeded">{g.exceeded_count} exceeded</span> · <span className="text-missing">{g.missing_data_count} missing</span></p>
              </div>
            </CardHeader>
            <CardContent className="px-2 sm:px-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-right">Limit</TableHead>
                      <TableHead className="text-right">Excess</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.readings.map((r) => (
                      <TableRow key={r.id} className={rowTone(r.status)}>
                        <TableCell className="whitespace-nowrap tabular">{formatDateTime(r.timestamp ?? r.raw_timestamp)}</TableCell>
                        <TableCell className="text-right tabular">
                          {r.value === null ? <span className="text-missing italic">Missing</span> : <>{formatNumber(r.value)} {r.unit}</>}
                          {r.issues.length > 0 && <span className="block text-[11px] text-missing">{r.issues.join("; ")}</span>}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular">{formatNumber(r.threshold)}</TableCell>
                        <TableCell className="text-right tabular">
                          {r.exceeded_by !== null ? <span className="font-medium text-exceeded">+{formatNumber(r.exceeded_by)}</span> : "—"}
                        </TableCell>
                        <TableCell><ReadingStatusBadge status={r.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
