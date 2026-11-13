import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { Exceedance } from "@/lib/types";

export function RecentAlerts({ alerts }: { alerts: Exceedance[] }) {
  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle>Recent alerts</CardTitle>
          <CardDescription>Latest confirmed exceedances.</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/alerts">View all <ArrowRight /></Link>
        </Button>
      </CardHeader>
      <CardContent className="px-3">
        {alerts.length === 0 ? (
          <EmptyState title="No exceedances" description="No reading exceeded its configured limit." />
        ) : (
          <ul className="space-y-1" data-testid="recent-alerts">
            {alerts.map((a) => (
              <li key={a.reading_id}>
                <Link href={`/sites/${a.site_id}`} className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-exceeded-soft text-exceeded">
                    <TriangleAlert className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{a.site_name}</span>
                      <span className="shrink-0 text-xs font-semibold text-exceeded tabular">
                        +{formatNumber(a.exceeded_by_pct)}%
                      </span>
                    </span>
                    <span className="block text-xs text-muted-foreground tabular">
                      {a.sensor_label} {formatNumber(a.value)} {a.unit} · limit {formatNumber(a.threshold)}
                    </span>
                    <span className="block text-xs text-muted-foreground">{formatDateTime(a.timestamp)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
