import Link from "next/link";
import { Building2, CheckCircle2, CircleDashed, MapPinned, TriangleAlert, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Totals } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Kpi {
  id: string;
  label: string;
  value: number;
  hint: string;
  href: string;
  icon: LucideIcon;
  tone?: "exceeded" | "missing" | "normal";
}

export function KpiCards({ totals }: { totals: Totals }) {
  const kpis: Kpi[] = [
    { id: "sites", label: "Total sites", value: totals.total_sites, hint: "in this dataset", href: "/sites", icon: Building2 },
    { id: "affected", label: "Affected sites", value: totals.sites_with_alerts,
      hint: `of ${totals.total_sites} with an exceedance`, href: "/sites", icon: MapPinned,
      tone: totals.sites_with_alerts ? "exceeded" : "normal" },
    { id: "exceedances", label: "Exceedances", value: totals.exceeded_readings, hint: "readings above limit",
      href: "/alerts", icon: TriangleAlert, tone: totals.exceeded_readings ? "exceeded" : "normal" },
    { id: "normal", label: "Normal readings", value: totals.normal_readings,
      hint: `of ${totals.total_readings} readings`, href: "/readings?status=NORMAL", icon: CheckCircle2, tone: "normal" },
    { id: "missing", label: "Missing readings", value: totals.missing_data_readings, hint: "not evaluated, never zero",
      href: "/readings?status=MISSING_DATA", icon: CircleDashed, tone: totals.missing_data_readings ? "missing" : undefined },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {kpis.map(({ id, label, value, hint, href, icon: Icon, tone }) => (
        <Link key={id} href={href} className="group rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <Card data-testid={`kpi-${id}`} className="gap-2 px-4 py-4 transition-colors group-hover:border-primary/30">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              {label}
              <span className={cn("flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground", {
                "bg-exceeded-soft text-exceeded": tone === "exceeded",
                "bg-missing-soft text-missing": tone === "missing",
                "bg-normal-soft text-normal": tone === "normal",
              })}>
                <Icon className="size-3.5" />
              </span>
            </div>
            <div className={cn("text-2xl font-semibold tracking-tight tabular", {
              "text-exceeded": tone === "exceeded" && value > 0,
              "text-missing": tone === "missing" && value > 0,
            })} data-testid={`kpi-${id}-value`}>
              {value}
            </div>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
