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
    <DashCard icon={Bell} title="Sensor Alerts" testId="alerts-card" className="xl:h-[17.5rem]"
      subtitle={total ? `Latest ${shown.length} of ${total} threshold exceedance${total === 1 ? "" : "s"}` : "Recent threshold exceedances"}
      action={<Link href="/alerts" className="inline-flex shrink-0 items-center gap-1 text-[0.8rem] font-semibold text-primary hover:underline">View All Alerts <ArrowRight className="size-3.5" /></Link>}>
      {shown.length === 0 ? (
        <EmptyState title="No exceedances" description="No reading exceeded its configured limit for these filters." className="py-8" />
      ) : (
        <ul className="space-y-1.5" data-testid="alert-rows">
          {shown.map((a) => {
            const sev = SEVERITY[a.severity];
            const meta = sensorMeta(a.sensor);
            const Icon = meta.icon;
            return (
              <li key={a.reading_id}>
                <Link href={`/sites/${a.site_id}`} data-severity={a.severity}
                  className={cn("flex h-[3.625rem] items-center gap-2.5 rounded-xl px-3 transition-[filter] hover:brightness-[0.98]", sev.row)}>
                  <Icon className={cn("size-5 shrink-0", sev.icon)} strokeWidth={1.9} />
                  <span className="min-w-0 flex-1 sm:grid sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-2.5">
                    <span className="block min-w-0">
                      <span className="block truncate text-[0.85rem] font-semibold">{meta.name} Limit Exceeded</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{a.site_name} • {a.sensor}</span>
                    </span>
                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 sm:block">
                      <span className={cn("block text-[0.95rem] leading-tight font-bold tabular", sev.value)}>{formatNumber(a.value)} {a.unit}</span>
                      <span className="block text-[11px] text-muted-foreground tabular">(limit: {formatNumber(a.threshold)} {a.unit})</span>
                      <span className="text-xs text-muted-foreground tabular sm:hidden">· {formatTime(a.timestamp)}</span>
                    </span>
                    <span className="hidden text-right text-[0.8rem] whitespace-nowrap text-muted-foreground tabular sm:block">
                      {formatTime(a.timestamp)}
                      {multiDay && <span className="block text-xs">{formatDate(a.timestamp)}</span>}
                    </span>
                  </span>
                  <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold", sev.pill)}>{sev.label}</span>
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
