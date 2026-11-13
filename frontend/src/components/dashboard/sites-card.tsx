import Link from "next/link";
import { Building2, ChevronRight, MapPin } from "lucide-react";
import { DashCard } from "@/components/dashboard/dash-card";
import { EmptyState } from "@/components/states";
import { sensorType } from "@/lib/format";
import type { SiteStatus, SiteSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS: Record<SiteStatus, { label: string; cls: string; dot: string }> = {
  ALERT: { label: "Active Alerts", cls: "bg-exceeded-soft text-exceeded", dot: "bg-exceeded" },
  NEEDS_REVIEW: { label: "Needs Review", cls: "bg-missing-soft text-missing", dot: "bg-missing" },
  OK: { label: "All Clear", cls: "bg-normal-soft text-normal", dot: "bg-normal" },
};

export function SitesCard({ sites, total }: { sites: SiteSummary[]; total: number }) {
  return (
    <DashCard icon={MapPin} title="Sites" testId="sites-card"
      subtitle={`${total} construction site${total === 1 ? "" : "s"} in the dataset`}>
      {sites.length === 0 ? (
        <EmptyState title="No sites match these filters" />
      ) : (
        <div className="relative -mx-1 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm" data-testid="sites-table">
            <thead>
              <tr className="border-b text-left text-[0.8rem] font-semibold">
                <th className="px-1 pb-2.5 font-semibold">Site</th>
                <th className="px-1 pb-2.5 font-semibold">Status</th>
                <th className="px-1 pb-2.5 text-center font-semibold">Active Alerts</th>
                <th className="px-1 pb-2.5 text-center font-semibold" title="Readings with a value / readings received">Data Coverage</th>
                <th className="w-6 pb-2.5"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => {
                const st = STATUS[s.status];
                const withData = s.total_readings - s.missing_data_count;
                return (
                  <tr key={s.site_id} className="group relative border-b last:border-0 hover:bg-muted/50" data-testid={`site-row-${s.site_id}`}>
                    <td className="px-1 py-2.5">
                      <Link href={`/sites/${s.site_id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                        <span className="flex h-11 w-16 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#1d3f8a] to-[#0b1f47] text-white/90">
                          <Building2 className="size-5" strokeWidth={1.6} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{s.site_name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {s.site_id} · {s.sensors.map((x) => sensorType(x)).join(", ") || "no sensors"}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-1 py-2.5">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", st.cls)}>
                        <span className={cn("size-1.5 rounded-full", st.dot)} />{st.label}
                      </span>
                    </td>
                    <td className="px-1 py-2.5 text-center font-semibold tabular">{s.exceeded_count}</td>
                    <td className="px-1 py-2.5 text-center tabular">
                      <span className="font-semibold">{withData}</span><span className="text-muted-foreground"> / {s.total_readings}</span>
                    </td>
                    <td className="py-2.5 text-right">
                      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashCard>
  );
}
