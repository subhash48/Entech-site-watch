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
        className={cn("h-11! w-full justify-start gap-2.5 rounded-xl bg-card px-3.5 text-sm font-medium shadow-card data-[size=default]:h-11", className)}>
        <Icon aria-hidden className="size-[1.1rem] shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-left"><SelectValue /></span>
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
      <div className="flex items-center gap-2 lg:w-[4.5rem] lg:flex-col lg:items-start lg:gap-0">
        <span className="text-sm font-semibold">Filters:</span>
        {active && (
          <button type="button" onClick={() => onChange(EMPTY_FILTERS)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <RotateCcw className="size-3" /> Reset
          </button>
        )}
      </div>
      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FilterSelect icon={MapPin} label="Site" value={value.site_id} onChange={(v) => set({ site_id: v })}
          allLabel="All Sites" testId="filter-site"
          options={(options?.sites ?? []).map((s) => ({ value: s.site_id, label: s.site_name }))} />
        <FilterSelect icon={Radio} label="Sensor type" value={value.sensor} onChange={(v) => set({ sensor: v })}
          allLabel="All Sensor Types" testId="filter-sensor"
          options={(options?.sensor_breakdown ?? []).map((s) => ({ value: s.sensor, label: s.label }))} />
        <FilterSelect icon={Layers} label="Status" value={value.status} onChange={(v) => set({ status: v as DashboardFilters["status"] })}
          allLabel="All Statuses" testId="filter-status"
          options={[{ value: "EXCEEDED", label: "Exceeded" }, { value: "NORMAL", label: "Normal" }, { value: "MISSING_DATA", label: "Missing data" }]} />
        <FilterSelect icon={CalendarDays} label="Date" value={value.date} onChange={(v) => set({ date: v })}
          allLabel="All Dates" testId="filter-date"
          options={(options?.available_dates ?? []).map((d) => ({ value: d, label: formatDate(`${d}T00:00`) }))} />
      </div>
    </div>
  );
}
