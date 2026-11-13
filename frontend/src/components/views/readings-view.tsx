"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, RotateCcw, Search } from "lucide-react";
import { useData } from "@/components/data-provider";
import { FilterSelect } from "@/components/filter-select";
import { PageHeader } from "@/components/page-header";
import { ReadingStatusBadge, rowTone, STATUS_LABEL } from "@/components/status";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { ReadingsQuery, ReadingStatus } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

type SortField = NonNullable<ReadingsQuery["sort"]>;
const STATUSES: ReadingStatus[] = ["NORMAL", "EXCEEDED", "MISSING_DATA"];

interface Filters {
  q: string;
  site_id: string;
  sensor: string;
  status: string;
  start: string;
  end: string;
}

function SortHeader({ field, label, sort, order, onSort, className }: {
  field: SortField; label: string; sort: SortField; order: "asc" | "desc"; onSort: (f: SortField) => void; className?: string;
}) {
  const active = sort === field;
  const Icon = !active ? ArrowUpDown : order === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 hover:text-foreground"
        data-testid={`sort-${field}`}>
        {label} <Icon className={cn("size-3.5", !active && "opacity-50")} />
      </button>
    </TableHead>
  );
}

function ReadingsExplorer({ initial }: { initial: Filters }) {
  const { overview } = useData();
  const [filters, setFilters] = useState<Filters>(initial);
  const [search, setSearch] = useState(initial.q);
  const [sort, setSort] = useState<SortField>("timestamp");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Debounce the free-text search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === search.trim() ? f : { ...f, q: search.trim() }));
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const update = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const onSort = (field: SortField) => {
    if (field === sort) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else { setSort(field); setOrder(field === "value" ? "desc" : "asc"); }
    setPage(1);
  };

  const query: ReadingsQuery = useMemo(() => ({
    q: filters.q || undefined,
    site_id: filters.site_id || undefined,
    sensor: filters.sensor || undefined,
    status: (filters.status || undefined) as ReadingStatus | undefined,
    start: filters.start || undefined,
    end: filters.end || undefined,
    sort, order, page, page_size: pageSize,
  }), [filters, sort, order, page, pageSize]);

  const { data, error, loading, reload } = useApi(JSON.stringify(query), (signal) => api.readings(query, signal));
  const hasFilters = Object.values(filters).some(Boolean);
  const siteOptions = (overview?.sites ?? []).map((s) => ({ value: s.site_id, label: `${s.site_name} (${s.site_id})` }));
  const sensorOptions = (overview?.sensor_breakdown ?? []).map((s) => ({ value: s.sensor, label: s.label }));

  const first = data && data.total ? (data.page - 1) * data.page_size + 1 : 0;
  const last = data ? Math.min(data.page * data.page_size, data.total) : 0;

  return (
    <div className="space-y-4">
      <PageHeader title="Sensor readings"
        description="Every reading from readings.csv with the threshold applied to it. Missing values are shown explicitly and never treated as zero." />

      <Card className="gap-0 py-0">
        <div className="grid items-end gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[1.4fr_repeat(5,1fr)_auto]">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Search
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Site, sensor or status"
                className="h-8 pl-8" aria-label="Search readings" data-testid="readings-search" />
            </div>
          </label>
          <FilterSelect label="Site" value={filters.site_id} onChange={(v) => update({ site_id: v })}
            options={siteOptions} allLabel="All sites" testId="filter-site" className="w-full" />
          <FilterSelect label="Sensor" value={filters.sensor} onChange={(v) => update({ sensor: v })}
            options={sensorOptions} allLabel="All sensors" testId="filter-sensor" className="w-full" />
          <FilterSelect label="Status" value={filters.status} onChange={(v) => update({ status: v })}
            options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} allLabel="All statuses"
            className="w-full" testId="filter-status" />
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            From
            <Input type="datetime-local" value={filters.start} onChange={(e) => update({ start: e.target.value })}
              className="h-8 w-full" aria-label="From time" data-testid="filter-start" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            To
            <Input type="datetime-local" value={filters.end} onChange={(e) => update({ end: e.target.value })}
              className="h-8 w-full" aria-label="To time" data-testid="filter-end" />
          </label>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); update({ q: "", site_id: "", sensor: "", status: "", start: "", end: "" }); }}>
              <RotateCcw /> Reset
            </Button>
          )}
        </div>

        {error ? (
          <ErrorState error={error} onRetry={reload} className="m-4" />
        ) : !data ? (
          <TableSkeleton rows={8} cols={7} />
        ) : data.total === 0 ? (
          <EmptyState title="No readings match these filters" description="Try widening the time range or clearing filters."
            action={hasFilters ? <Button variant="outline" size="sm" onClick={() => { setSearch(""); update({ q: "", site_id: "", sensor: "", status: "", start: "", end: "" }); }}>Clear filters</Button> : undefined} />
        ) : (
          <div className={cn("overflow-x-auto transition-opacity", loading && "opacity-60")}>
            <Table data-testid="readings-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Site</TableHead>
                  <TableHead>Sensor</TableHead>
                  <SortHeader field="timestamp" label="Timestamp" sort={sort} order={order} onSort={onSort} />
                  <SortHeader field="value" label="Value" sort={sort} order={order} onSort={onSort} className="text-right" />
                  <TableHead className="text-right">Threshold</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="pr-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((r) => (
                  <TableRow key={r.id} className={rowTone(r.status)} data-status={r.status}>
                    <TableCell className="pl-4">
                      <span className="font-medium">{r.site_name}</span>
                      <span className="ml-1.5 font-mono text-xs text-muted-foreground">{r.site_id}</span>
                    </TableCell>
                    <TableCell>{r.sensor_label}</TableCell>
                    <TableCell className="whitespace-nowrap tabular">{formatDateTime(r.timestamp ?? r.raw_timestamp)}</TableCell>
                    <TableCell className="text-right tabular">
                      {r.value === null ? (
                        <span className="font-medium text-missing italic" data-testid="missing-value">Missing</span>
                      ) : (
                        <span className={r.status === "EXCEEDED" ? "font-semibold text-exceeded" : ""}>{formatNumber(r.value)}</span>
                      )}
                      {r.status === "EXCEEDED" && r.exceeded_by !== null && (
                        <span className="block text-[11px] text-exceeded">+{formatNumber(r.exceeded_by)} over</span>
                      )}
                      {r.issues.length > 0 && (
                        <span className="block max-w-[220px] text-[11px] whitespace-normal text-missing">{r.issues.join("; ")}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular">{formatNumber(r.threshold)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.unit ?? "—"}</TableCell>
                    <TableCell className="pr-4"><ReadingStatusBadge status={r.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {data && data.total > 0 && (
          <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground tabular" data-testid="pagination-summary">
              Showing {first}–{last} of {data.total} readings
            </p>
            <div className="flex items-center gap-2">
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger size="sm" className="w-28" aria-label="Rows per page" data-testid="page-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50].map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground tabular">Page {data.page} of {Math.max(1, data.total_pages)}</span>
              <Button variant="outline" size="icon-sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="Previous page">
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => setPage((p) => p + 1)} disabled={page >= data.total_pages}
                aria-label="Next page" data-testid="next-page">
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export function ReadingsView() {
  const params = useSearchParams();
  const initial: Filters = {
    q: params.get("q") ?? "",
    site_id: params.get("site_id") ?? "",
    sensor: params.get("sensor") ?? "",
    status: STATUSES.includes(params.get("status") as ReadingStatus) ? (params.get("status") as string) : "",
    start: "",
    end: "",
  };
  // Re-mount when the URL changes (e.g. a new header search) so filters follow the link.
  return <ReadingsExplorer key={params.toString()} initial={initial} />;
}
