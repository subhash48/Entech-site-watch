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
        <div className="relative -mx-1 overflow-x-auto sm:overflow-x-visible">
          {/* Fixed layout: the Site column takes the remaining width and truncates, so the table never
              scrolls sideways at desktop widths (a narrow phone may still scroll inside the card). */}
          <table className="w-full min-w-[30rem] table-fixed text-sm sm:min-w-0" data-testid="sites-table">
            <colgroup>
              <col />
              <col className="w-[7.75rem]" />
              <col className="w-[4.5rem]" />
              <col className="w-[5.25rem]" />
              <col className="w-6" />
            </colgroup>
            <thead>
              <tr className="border-b text-left text-xs font-semibold text-muted-foreground">
                <th className="px-1 pb-2 font-semibold">Site</th>
                <th className="px-1 pb-2 font-semibold">Status</th>
                <th className="px-1 pb-2 text-center font-semibold">Alerts</th>
                <th className="px-1 pb-2 text-center font-semibold" title="Readings with a value / readings received">Coverage</th>
                <th className="pb-2"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => {
                const st = STATUS[s.status];
                const withData = s.total_readings - s.missing_data_count;
                const detail = s.sensors.map((x) => sensorType(x)).join(", ") || "no sensors";
                return (
                  <tr key={s.site_id} className="group relative border-b last:border-0 hover:bg-muted/50" data-testid={`site-row-${s.site_id}`}>
                    <td className="px-1 py-2">
                      <Link href={`/sites/${s.site_id}`} className="flex min-w-0 items-center gap-2.5 after:absolute after:inset-0"
                        title={`${s.site_name} (${s.site_id}): ${detail}`}>
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#1d3f8a] to-[#0b1f47] text-white/90">
                          <Building2 className="size-4" strokeWidth={1.7} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[0.85rem] font-semibold">{s.site_name}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{s.site_id} · {detail}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-1 py-2">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", st.cls)}>
                        <span className={cn("size-1.5 rounded-full", st.dot)} />{st.label}
                      </span>
                    </td>
                    <td className="px-1 py-2 text-center font-semibold tabular">{s.exceeded_count}</td>
                    <td className="px-1 py-2 text-center whitespace-nowrap tabular">
                      <span className="font-semibold">{withData}</span><span className="text-muted-foreground"> / {s.total_readings}</span>
                    </td>
                    <td className="py-2 text-right">
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
