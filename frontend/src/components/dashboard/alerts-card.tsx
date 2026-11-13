import Link from "next/link";
import { ArrowRight, Bell, Info } from "lucide-react";
import { DashCard } from "@/components/dashboard/dash-card";
import { sensorMeta } from "@/components/dashboard/sensor-meta";
import { EmptyState } from "@/components/states";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate, formatNumber, formatTime } from "@/lib/format";
import type { Exceedance } from "@/lib/types";
import { cn } from "@/lib/utils";

const SEVERITY = {
  high: { label: "High", row: "bg-exceeded-soft", pill: "bg-exceeded-border/60 text-exceeded", value: "text-exceeded", icon: "text-exceeded" },
  medium: { label: "Medium", row: "bg-missing-soft", pill: "bg-missing-border/60 text-missing", value: "text-missing", icon: "text-missing" },
  low: { label: "Low", row: "bg-missing-soft/60", pill: "bg-muted text-muted-foreground", value: "text-missing", icon: "text-missing" },
} as const;

export const SHOWN_ALERTS = 3;

export function AlertsCard({ alerts, total, multiDay }: { alerts: Exceedance[]; total: number; multiDay: boolean }) {
  const shown = alerts.slice(0, SHOWN_ALERTS);
  return (
    <DashCard icon={Bell} title="Sensor Alerts" testId="alerts-card"
      subtitle={total ? `Latest ${shown.length} of ${total} threshold exceedance${total === 1 ? "" : "s"}` : "Recent threshold exceedances"}
      action={<Link href="/alerts" className="inline-flex shrink-0 items-center gap-1 pt-1 text-sm font-semibold text-primary hover:underline">View All Alerts <ArrowRight className="size-4" /></Link>}>
      {shown.length === 0 ? (
        <EmptyState title="No exceedances" description="No reading exceeded its configured limit for these filters." className="py-8" />
      ) : (
        <ul className="space-y-2.5" data-testid="alert-rows">
          {shown.map((a) => {
            const sev = SEVERITY[a.severity];
            const meta = sensorMeta(a.sensor);
            const Icon = meta.icon;
            return (
              <li key={a.reading_id}>
                <Link href={`/sites/${a.site_id}`} data-severity={a.severity}
                  className={cn("grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl px-3.5 py-3 transition-[filter] hover:brightness-[0.98] sm:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_auto_auto]", sev.row)}>
                  <Icon className={cn("size-6", sev.icon)} strokeWidth={1.8} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{meta.name} Limit Exceeded</span>
                    <span className="block truncate text-xs text-muted-foreground">{a.site_name} • {a.sensor}</span>
                  </span>
                  <span className="col-start-2 min-w-0 sm:col-start-auto">
                    <span className={cn("block text-base font-bold tabular", sev.value)}>{formatNumber(a.value)} {a.unit}</span>
                    <span className="block text-xs text-muted-foreground tabular">(limit: {formatNumber(a.threshold)} {a.unit})</span>
                  </span>
                  <span className="hidden text-right text-sm whitespace-nowrap text-muted-foreground tabular sm:block">
                    {formatTime(a.timestamp)}
                    {multiDay && <span className="block text-xs">{formatDate(a.timestamp)}</span>}
                  </span>
                  <span className={cn("row-start-1 rounded-md px-2.5 py-1 text-xs font-semibold sm:row-start-auto", sev.pill)}>
                    {sev.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {total > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          Severity = how far above the configured limit
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="How severity is calculated"><Info className="size-3.5" /></button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              High: 20% or more over the limit. Medium: 5% to under 20%. Low: under 5%. A display priority only, not a regulatory classification.
            </TooltipContent>
          </Tooltip>
        </p>
      )}
    </DashCard>
  );
}
