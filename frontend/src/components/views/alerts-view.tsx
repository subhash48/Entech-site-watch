"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleDashed } from "lucide-react";
import { useData } from "@/components/data-provider";
import { FilterSelect } from "@/components/filter-select";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber, sensorType, titleCase } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

export function AlertsView() {
  const { overview } = useData();
  const [siteId, setSiteId] = useState("");
  const [sensor, setSensor] = useState("");
  const query = { site_id: siteId || undefined, sensor: sensor || undefined, order: "desc" as const };
  const { data, error, loading, reload } = useApi(JSON.stringify(query), (signal) => api.exceedances(query, signal));

  const types = [...new Set((overview?.sensor_breakdown ?? []).map((b) => sensorType(b.sensor)))];
  const missing = overview?.totals.missing_data_readings ?? 0;
  const sitesAffected = new Set((data ?? []).map((e) => e.site_id)).size;

  return (
    <div className="space-y-4">
      <PageHeader title="Alerts"
        description="Confirmed threshold exceedances only: readings strictly above their sensor's configured limit." />

      {missing > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-missing-border bg-missing-soft/50 px-4 py-3 text-sm" data-testid="missing-callout">
          <CircleDashed className="mt-0.5 size-4 shrink-0 text-missing" />
          <p>
            <span className="font-medium">Missing data is not an exceedance.</span>{" "}
            <span className="text-muted-foreground">{missing} reading{missing === 1 ? "" : "s"} could not be evaluated and {missing === 1 ? "is" : "are"} excluded here.</span>{" "}
            <Link href="/readings?status=MISSING_DATA" className="font-medium text-primary hover:underline">Review missing data</Link>
          </p>
        </div>
      )}

      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-end">
          <FilterSelect label="Site" value={siteId} onChange={setSiteId} allLabel="All sites" testId="alerts-site"
            options={(overview?.sites ?? []).map((s) => ({ value: s.site_id, label: `${s.site_name} (${s.site_id})` }))} />
          <FilterSelect label="Sensor" value={sensor} onChange={setSensor} allLabel="All sensors" testId="alerts-sensor"
            options={types.map((t) => ({ value: t, label: titleCase(t) }))} />
          {data && (
            <p className="text-sm text-muted-foreground sm:ml-auto tabular" data-testid="alerts-count">
              <span className="font-semibold text-exceeded">{data.length}</span> exceedance{data.length === 1 ? "" : "s"} at {sitesAffected} site{sitesAffected === 1 ? "" : "s"}
            </p>
          )}
        </div>
        {error ? (
          <ErrorState error={error} onRetry={reload} className="m-4" />
        ) : !data ? (
          <TableSkeleton rows={5} cols={7} />
        ) : data.length === 0 ? (
          <EmptyState title="No exceedances" description="No reading exceeded its configured limit for this selection." />
        ) : (
          <div className={cn("overflow-x-auto", loading && "opacity-60")}>
            <Table data-testid="alerts-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Site</TableHead>
                  <TableHead>Sensor</TableHead>
                  <TableHead className="text-right">Measured</TableHead>
                  <TableHead className="text-right">Limit</TableHead>
                  <TableHead className="text-right">Excess</TableHead>
                  <TableHead className="text-right">% over</TableHead>
                  <TableHead className="pr-4">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((e) => (
                  <TableRow key={e.reading_id} className="shadow-[inset_3px_0_0_var(--exceeded)]">
                    <TableCell className="pl-4">
                      <Link href={`/sites/${e.site_id}`} className="font-medium hover:underline">{e.site_name}</Link>
                      <span className="ml-1.5 font-mono text-xs text-muted-foreground">{e.site_id}</span>
                    </TableCell>
                    <TableCell>{e.sensor_label}</TableCell>
                    <TableCell className="text-right font-semibold text-exceeded tabular">{formatNumber(e.value)} {e.unit}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular">{formatNumber(e.threshold)} {e.unit}</TableCell>
                    <TableCell className="text-right tabular">+{formatNumber(e.exceeded_by)} {e.unit}</TableCell>
                    <TableCell className="text-right font-medium text-exceeded tabular">
                      {e.exceeded_by_pct === null ? "—" : `${formatNumber(e.exceeded_by_pct)}%`}
                    </TableCell>
                    <TableCell className="pr-4 whitespace-nowrap tabular">{formatDateTime(e.timestamp)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">
        An exceedance means a reading was above a monitoring threshold configured for this project. It does not by itself indicate a regulatory violation.
      </p>
    </div>
  );
}
