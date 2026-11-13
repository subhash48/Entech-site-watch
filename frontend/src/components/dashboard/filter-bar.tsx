"use client";

import { CalendarDays, Layers, MapPin, Radio, RotateCcw, type LucideIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import type { Overview, ReadingStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface DashboardFilters {
  site_id: string;
  sensor: string;
  status: "" | ReadingStatus;
  date: string; // YYYY-MM-DD or "" for all dates
}

export const EMPTY_FILTERS: DashboardFilters = { site_id: "", sensor: "", status: "", date: "" };
const ALL = "__all__";

function FilterSelect({ icon: Icon, value, onChange, allLabel, options, label, testId, className }: {
  icon: LucideIcon; value: string; onChange: (v: string) => void; allLabel: string; label: string;
  options: { value: string; label: string }[]; testId: string; className?: string;
}) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
      <SelectTrigger aria-label={label} data-testid={testId}
        className={cn("h-11! w-full rounded-xl bg-card px-3.5 text-sm font-medium shadow-card data-[size=default]:h-11 [&>span]:flex [&>span]:items-center [&>span]:gap-2.5", className)}>
        <Icon aria-hidden className="size-[1.1rem] shrink-0 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Filter row. Options always come from the unfiltered dataset so nothing disappears while filtering. */
export function FilterBar({ options, value, onChange }: {
  options?: Overview; value: DashboardFilters; onChange: (f: DashboardFilters) => void;
}) {
  const set = (patch: Partial<DashboardFilters>) => onChange({ ...value, ...patch });
  const active = Object.values(value).some(Boolean);
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center" data-testid="dashboard-filters">
      <span className="text-sm font-semibold lg:mr-1">Filters:</span>
      <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:flex lg:items-center">
        <FilterSelect icon={MapPin} label="Site" value={value.site_id} onChange={(v) => set({ site_id: v })}
          allLabel="All Sites" testId="filter-site" className="lg:w-[15.5rem]"
          options={(options?.sites ?? []).map((s) => ({ value: s.site_id, label: s.site_name }))} />
        <FilterSelect icon={Radio} label="Sensor type" value={value.sensor} onChange={(v) => set({ sensor: v })}
          allLabel="All Sensor Types" testId="filter-sensor" className="lg:w-[15.5rem]"
          options={(options?.sensor_breakdown ?? []).map((s) => ({ value: s.sensor, label: s.label }))} />
        <FilterSelect icon={Layers} label="Status" value={value.status} onChange={(v) => set({ status: v as DashboardFilters["status"] })}
          allLabel="All Statuses" testId="filter-status" className="lg:w-[15.5rem]"
          options={[{ value: "EXCEEDED", label: "Exceeded" }, { value: "NORMAL", label: "Normal" }, { value: "MISSING_DATA", label: "Missing data" }]} />
        {active && (
          <button type="button" onClick={() => onChange(EMPTY_FILTERS)}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium text-primary hover:bg-accent">
            <RotateCcw className="size-4" /> Reset
          </button>
        )}
        <FilterSelect icon={CalendarDays} label="Date" value={value.date} onChange={(v) => set({ date: v })}
          allLabel="All Dates" testId="filter-date" className="lg:ml-auto lg:w-[11.5rem]"
          options={(options?.available_dates ?? []).map((d) => ({ value: d, label: formatDate(`${d}T00:00`) }))} />
      </div>
    </div>
  );
}
