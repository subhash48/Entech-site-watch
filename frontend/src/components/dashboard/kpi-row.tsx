import Link from "next/link";
import { Activity, Building2, Check, Database, TriangleAlert, type LucideIcon } from "lucide-react";
import type { Overview } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tone = "blue" | "red" | "green" | "amber";

const TONE: Record<Tone, { card: string; tile: string; pill: string }> = {
  blue: {
    card: "bg-gradient-to-br from-[#f3f7ff] to-card dark:from-[#14213d]",
    tile: "bg-[#e6eefe] text-[#2459d6] dark:bg-[#1c2d55] dark:text-[#8fb0ff]",
    pill: "bg-[#e6eefe] text-[#2459d6] dark:bg-[#1c2d55] dark:text-[#8fb0ff]",
  },
  red: {
    card: "border-exceeded-border/70 bg-gradient-to-br from-exceeded-soft to-card",
    tile: "bg-exceeded-soft text-exceeded ring-1 ring-exceeded-border/60",
    pill: "bg-exceeded-soft text-exceeded",
  },
  green: {
    card: "border-normal-border/70 bg-gradient-to-br from-normal-soft to-card",
    tile: "bg-normal-soft text-normal ring-1 ring-normal-border/60",
    pill: "bg-normal-soft text-normal",
  },
  amber: {
    card: "border-missing-border/70 bg-gradient-to-br from-missing-soft to-card",
    tile: "bg-missing-soft text-missing ring-1 ring-missing-border/60",
    pill: "bg-missing-soft text-missing",
  },
};

interface Kpi {
  id: string;
  label: string;
  value: React.ReactNode;
  pill: string;
  pillIcon?: LucideIcon;
  caption: string;
  icon: LucideIcon;
  tone: Tone;
  href: string;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function KpiRow({ overview }: { overview: Overview }) {
  const t = overview.totals;
  const withData = t.total_readings - t.missing_data_readings;
  const coverage = t.total_readings ? Math.round((withData / t.total_readings) * 100) : 0;
  const missingSites = overview.sites.filter((s) => s.missing_data_count > 0).length;

  const kpis: Kpi[] = [
    { id: "sites", label: "Total Sites", value: t.total_sites, icon: Building2, tone: "blue", href: "/sites",
      pill: `${t.sites_with_alerts} alerting`, caption: "sites with exceedances" },
    { id: "alerts", label: "Active Alerts", value: t.exceeded_readings, icon: TriangleAlert,
      tone: t.exceeded_readings ? "red" : "green", href: "/alerts",
      pill: plural(t.sites_with_alerts, "site"), caption: "readings above limit" },
    { id: "coverage", label: "Readings with Data", icon: Activity, tone: "green", href: "/sensors",
      value: <>{withData}<span className="text-[0.8em] font-semibold text-muted-foreground"> / {t.total_readings}</span></>,
      pill: `${coverage}%`, pillIcon: Check, caption: "of readings evaluated" },
    { id: "missing", label: "Missing Data", value: t.missing_data_readings, icon: Database,
      tone: t.missing_data_readings ? "amber" : "green", href: "/sensors?status=MISSING_DATA",
      pill: plural(missingSites, "site"), caption: "not evaluated, never zero" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map(({ id, label, value, pill, pillIcon: PillIcon, caption, icon: Icon, tone, href }) => (
        <Link key={id} href={href} data-testid={`kpi-${id}`}
          className={cn("group flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-card transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none", TONE[tone].card)}>
          <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-2xl", TONE[tone].tile)}>
            <Icon className="size-7" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.95rem] font-semibold">{label}</span>
            <span className="block text-3xl leading-tight font-bold tracking-tight tabular" data-testid={`kpi-${id}-value`}>{value}</span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1 self-start pt-1 text-right">
            <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold", TONE[tone].pill)}>
              {PillIcon && <PillIcon className="size-3" strokeWidth={3} />}{pill}
            </span>
            <span className="max-w-[7.5rem] text-xs leading-snug text-muted-foreground">{caption}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
