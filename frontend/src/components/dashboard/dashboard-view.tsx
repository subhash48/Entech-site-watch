"use client";

import { useMemo, useState } from "react";
import { AlertsCard } from "@/components/dashboard/alerts-card";
import { EMPTY_FILTERS, FilterBar, type DashboardFilters } from "@/components/dashboard/filter-bar";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { SitesCard } from "@/components/dashboard/sites-card";
import { useData } from "@/components/data-provider";
import { ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { OverviewQuery } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

export function toQuery(f: DashboardFilters): OverviewQuery {
  return {
    site_id: f.site_id || undefined,
    sensor: f.sensor || undefined,
    status: f.status || undefined,
    start: f.date ? `${f.date}T00:00:00` : undefined,
    end: f.date ? `${f.date}T23:59:59` : undefined,
  };
}

export function DashboardView() {
  const { overview: all, error: allError, refresh } = useData();
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);
  const filtered = Object.values(filters).some(Boolean);
  const query = useMemo(() => toQuery(filters), [filters]);

  // Unfiltered data is already loaded by DataProvider; only fetch when filters are active.
  const { data: filteredData, error: filteredError, loading, reload } = useApi(
    filtered ? `overview:${JSON.stringify(query)}` : null, (signal) => api.overview(query, signal));
  const overview = filtered ? filteredData : all;
  const error = filtered ? filteredError : allError;
  const multiDay = (all?.available_dates.length ?? 0) > 1;

  return (
    <div className="space-y-5">
      {!overview && !error ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[98px] rounded-2xl" />)}
        </div>
      ) : overview ? <KpiRow overview={overview} /> : null}

      <FilterBar options={all} value={filters} onChange={setFilters} />

      {error ? (
        <ErrorState error={error} onRetry={filtered ? reload : refresh} />
      ) : !overview ? (
        <div className="grid gap-5 xl:grid-cols-2" aria-busy="true">
          <Skeleton className="h-[280px] rounded-2xl" />
          <Skeleton className="h-[280px] rounded-2xl" />
        </div>
      ) : (
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-60")} data-testid="dashboard-body">
          <div className="grid gap-5 xl:grid-cols-2">
            <SitesCard sites={overview.sites} total={all?.totals.total_sites ?? overview.totals.total_sites} />
            <AlertsCard alerts={overview.recent_alerts} total={overview.totals.exceeded_readings} multiDay={multiDay} />
          </div>
        </div>
      )}
    </div>
  );
}
