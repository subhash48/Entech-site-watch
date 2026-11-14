import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { ReadingStatusBadge, rowTone } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatNumber, titleCase } from "@/lib/format";
import type { DatasetComparison, DatasetPreview, DatasetStats } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatTiles({ stats, warnings }: { stats: DatasetStats; warnings: number }) {
  const tiles: [string, string | number, string][] = [
    ["Total rows", stats.total_rows, ""],
    ["Valid readings", stats.valid_readings, ""],
    ["Normal", stats.normal_readings, "text-normal"],
    ["Exceedances", stats.exceeded_readings, "text-exceeded"],
    ["Missing readings", stats.missing_readings, "text-missing"],
    ["Sites", stats.sites, ""],
    ["Sensor categories", stats.sensor_categories.map(titleCase).join(", ") || "—", "text-base"],
    ["Warnings", warnings, warnings ? "text-missing" : ""],
  ];
  return (
    <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" data-testid="preview-stats">
      {tiles.map(([label, value, tone]) => (
        <div key={label} className="rounded-xl border bg-card px-3 py-2.5">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className={cn("text-xl font-bold tabular", tone === "text-base" ? "leading-snug" : "truncate", tone)} data-testid={`stat-${label}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Change({ value }: { value: number | null }) {
  if (value === null || value === 0) return <span className="inline-flex items-center gap-1 text-muted-foreground"><Minus className="size-3.5" /> 0</span>;
  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return <span className="inline-flex items-center gap-1 font-semibold"><Icon className="size-3.5" />{up ? "+" : ""}{formatNumber(value)}</span>;
}

export function ComparisonTable({ comparison }: { comparison: DatasetComparison }) {
  const chips = (label: string, items: string[], tone: string) => items.length > 0 && (
    <p className="text-sm"><span className="text-muted-foreground">{label}: </span>
      {items.map((x) => <Badge key={x} variant="outline" className={cn("mr-1 font-mono", tone)}>{x}</Badge>)}</p>
  );
  return (
    <div className="space-y-3" data-testid="preview-comparison">
      <p className="text-sm text-muted-foreground">Compared with the active dataset <span className="font-medium text-foreground">{comparison.against}</span></p>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead className="text-right">Active now</TableHead>
              <TableHead className="text-right">After activation</TableHead>
              <TableHead className="text-right">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comparison.metrics.map((m) => (
              <TableRow key={m.metric}>
                <TableCell className="font-medium">{m.label}</TableCell>
                <TableCell className="text-right tabular">{formatNumber(m.current)}</TableCell>
                <TableCell className="text-right tabular">{formatNumber(m.proposed)}</TableCell>
                <TableCell className="text-right tabular"><Change value={m.change} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {chips("Sites added", comparison.sites_added, "border-normal-border text-normal")}
      {chips("Sites removed", comparison.sites_removed, "border-exceeded-border text-exceeded")}
      {chips("Sensors added", comparison.sensors_added, "border-normal-border text-normal")}
      {chips("Sensors removed", comparison.sensors_removed, "border-exceeded-border text-exceeded")}
      {comparison.threshold_changes.length > 0 && (
        <div className="text-sm">
          <p className="text-muted-foreground">Threshold changes:</p>
          <ul className="mt-1 space-y-0.5">
            {comparison.threshold_changes.map((t) => (
              <li key={t.sensor}><span className="font-mono">{t.sensor}</span>{" "}
                <span className="text-muted-foreground">{t.change}</span>: {t.current ?? "—"} → <span className="font-semibold">{t.proposed ?? "—"}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function PreviewRows({ preview }: { preview: DatasetPreview }) {
  return (
    <div className="overflow-x-auto rounded-xl border" data-testid="preview-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14">Row</TableHead>
            <TableHead>Site</TableHead>
            <TableHead>Sensor</TableHead>
            <TableHead>Timestamp</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead className="text-right">Limit</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {preview.preview_rows.map((r) => (
            <TableRow key={r.id} className={rowTone(r.status)}>
              <TableCell className="font-mono text-xs text-muted-foreground">{r.id}</TableCell>
              <TableCell><span className="font-medium">{r.site_name}</span> <span className="font-mono text-xs text-muted-foreground">{r.site_id}</span></TableCell>
              <TableCell>{r.sensor_label}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDateTime(r.raw_timestamp)}</TableCell>
              <TableCell className="text-right tabular">{r.value === null ? <span className="text-missing">blank</span> : `${formatNumber(r.value)} ${r.unit ?? ""}`}</TableCell>
              <TableCell className="text-right tabular text-muted-foreground">{r.threshold === null ? "—" : `${formatNumber(r.threshold)} ${r.unit ?? ""}`}</TableCell>
              <TableCell><ReadingStatusBadge status={r.status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {preview.stats && preview.stats.total_rows > preview.preview_rows.length && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          Showing the first {preview.preview_rows.length} of {preview.stats.total_rows} rows.
        </p>
      )}
    </div>
  );
}
