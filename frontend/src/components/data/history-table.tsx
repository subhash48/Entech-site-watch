"use client";

import { Fragment, useState } from "react";
import { CheckCircle2, History, LoaderCircle, RotateCcw } from "lucide-react";
import { ValidationReport } from "@/components/data/validation-report";
import { ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatLoadedAt } from "@/lib/format";
import type { DatasetVersion } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

function StoredReport({ id }: { id: string }) {
  const { data, error, reload } = useApi(`validation:${id}`, (signal) => api.datasetValidation(id, signal));
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <p className="text-sm text-muted-foreground">Loading validation report…</p>;
  return <ValidationReport report={data} />;
}

/** Every stored version, newest first, with activation (rollback) for administrators. */
export function HistoryTable({ versions, canActivate, isAdmin, busyId, onActivate }: {
  versions: DatasetVersion[];
  canActivate: boolean;
  isAdmin: boolean;
  busyId: string | null;
  onActivate: (v: DatasetVersion) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const active = versions.find((v) => v.is_active);
  return (
    <div className="overflow-x-auto" data-testid="dataset-history">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Version</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead className="text-right">Rows</TableHead>
            <TableHead className="text-right">Exceedances</TableHead>
            <TableHead className="text-right">Missing</TableHead>
            <TableHead className="text-right">Warnings</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {versions.map((v) => (
            <Fragment key={v.id}>
              <TableRow data-testid={`version-row-${v.version}`} className={cn(v.is_active && "bg-primary/5")}>
                <TableCell>
                  <span className="font-semibold">v{v.version}</span>{" "}
                  <span className="font-medium">{v.name}</span>
                  <p className="max-w-[16rem] truncate font-mono text-[11px] text-muted-foreground">
                    {v.readings_filename} · {v.thresholds_filename}
                  </p>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {v.source === "starter" ? "Committed with the app" : formatLoadedAt(v.created_at)}
                  {v.created_by && <span className="block text-xs">by {v.created_by}</span>}
                </TableCell>
                <TableCell className="text-right tabular">{v.stats.total_rows}</TableCell>
                <TableCell className={cn("text-right tabular", v.stats.exceeded_readings && "font-semibold text-exceeded")}>{v.stats.exceeded_readings}</TableCell>
                <TableCell className={cn("text-right tabular", v.stats.missing_readings && "font-semibold text-missing")}>{v.stats.missing_readings}</TableCell>
                <TableCell className="text-right tabular">{v.warning_count}</TableCell>
                <TableCell>
                  {v.is_active ? (
                    <Badge variant="outline" className="gap-1 border-normal-border bg-normal-soft text-normal" data-testid="active-badge">
                      <CheckCircle2 className="size-3" /> Active
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">{v.activated_at ? `Last active ${formatLoadedAt(v.activated_at)}` : "Never activated"}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    {isAdmin && (
                      <Button variant="ghost" size="sm" onClick={() => setOpen(open === v.id ? null : v.id)}
                        aria-expanded={open === v.id} data-testid={`report-${v.version}`}>
                        <History /> Report
                      </Button>
                    )}
                    {!v.is_active && canActivate && (
                      <Button variant="outline" size="sm" disabled={busyId !== null} onClick={() => onActivate(v)}
                        data-testid={`activate-${v.version}`}>
                        {busyId === v.id ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
                        {active && v.version < active.version ? "Roll back" : "Activate"}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
              {open === v.id && (
                <TableRow>
                  <TableCell colSpan={8} className="bg-muted/30 p-4 whitespace-normal">
                    <StoredReport id={v.id} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
