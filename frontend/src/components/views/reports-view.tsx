"use client";

import { useState } from "react";
import { Download, FileDown, FileSpreadsheet } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { useData } from "@/components/data-provider";
import { FilterSelect } from "@/components/filter-select";
import { SiteStatusBadge } from "@/components/status";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, exportUrl } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ReportsView() {
  const { overview } = useData();
  const [siteId, setSiteId] = useState("");
  const { data, error, loading, reload } = useApi(`summary:${siteId}`, (signal) => api.summary(siteId || undefined, signal));

  const filename = `sitewatch-report-${siteId || "all-sites"}-${(data?.period_start ?? "").slice(0, 10) || "period"}.txt`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-end gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={exportUrl.exceedances({ site_id: siteId || undefined })} download data-testid="report-exceedances-csv">
              <FileSpreadsheet /> Exceedances CSV
            </a>
          </Button>
          <Button asChild size="sm">
            <a href={exportUrl.summaryPdf({ site_id: siteId || undefined })} download data-testid="report-pdf">
              <FileDown /> Download PDF
            </a>
          </Button>
          <FilterSelect label="Scope" value={siteId} onChange={setSiteId} allLabel="All sites" testId="report-scope"
            options={(overview?.sites ?? []).map((s) => ({ value: s.site_id, label: `${s.site_name} (${s.site_id})` }))} />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="gap-3 lg:col-span-2">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle>Client summary</CardTitle>
                <CardDescription>{data ? data.scope : "Generating…"}</CardDescription>
              </div>
              <div className="flex gap-2">
                <CopyButton text={data?.report ?? ""} label="Copy report" />
                <Button variant="outline" size="sm" disabled={!data} onClick={() => data && download(data.report, filename)}>
                  <Download /> Download .txt
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!data ? (
                <div className="space-y-2">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-4" style={{ width: `${90 - (i % 4) * 12}%` }} />)}</div>
              ) : (
                <pre data-testid="report-text"
                  className={cn("rounded-lg border bg-muted/30 p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap transition-opacity", loading && "opacity-60")}>
                  {data.report}
                </pre>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="gap-3">
              <CardHeader><CardTitle>Totals</CardTitle></CardHeader>
              <CardContent>
                {data ? (
                  <dl className="grid grid-cols-2 gap-3 text-sm" data-testid="report-totals">
                    {[
                      ["Readings", data.totals.total_readings, ""],
                      ["Sites", data.totals.total_sites, ""],
                      ["Exceeded", data.totals.exceeded_readings, "text-exceeded"],
                      ["Normal", data.totals.normal_readings, "text-normal"],
                      ["Missing data", data.totals.missing_data_readings, "text-missing"],
                      ["Sites with alerts", data.totals.sites_with_alerts, ""],
                    ].map(([label, value, tone]) => (
                      <div key={label as string} className="rounded-md border px-3 py-2">
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className={cn("text-lg font-semibold tabular", tone as string)}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : <Skeleton className="h-40" />}
              </CardContent>
            </Card>
            <Card className="gap-3">
              <CardHeader><CardTitle>Sites</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data?.sites.map((s) => (
                  <div key={s.site_id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{s.site_name}</span>
                    <SiteStatusBadge status={s.status} />
                  </div>
                )) ?? <Skeleton className="h-20" />}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
