"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CheckCircle2, CircleDot, Database, DatabaseZap, Eye, FileCheck2, History, LoaderCircle, ShieldAlert, ShieldCheck,
  UploadCloud, Zap,
} from "lucide-react";
import { AdminAccess } from "@/components/data/admin-access";
import { FileDrop, formatBytes } from "@/components/data/file-drop";
import { HistoryTable } from "@/components/data/history-table";
import { VersionChart } from "@/components/charts/version-chart";
import { ComparisonTable, PreviewRows, StatTiles } from "@/components/data/preview-panel";
import { ValidationReport } from "@/components/data/validation-report";
import { DashCard } from "@/components/dashboard/dash-card";
import { useData } from "@/components/data-provider";
import { ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, toApiError, type ApiError } from "@/lib/api";
import { formatDateTime, formatLoadedAt } from "@/lib/format";
import type { DatasetPreview, DatasetVersion } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

const MAX_READINGS = 4 * 1024 * 1024;
const MAX_THRESHOLDS = 64 * 1024;
const fingerprint = (f: File | null) => (f ? `${f.name}:${f.size}:${f.lastModified}` : "-");

type Step = "select" | "validate" | "preview" | "activate";
const STEPS: { id: Step; label: string }[] = [
  { id: "select", label: "Select files" }, { id: "validate", label: "Validate" },
  { id: "preview", label: "Preview changes" }, { id: "activate", label: "Activate" },
];

function Steps({ current, done }: { current: Step; done: Step[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium" aria-label="Upload progress" data-testid="upload-steps">
      {STEPS.map((s, i) => {
        const complete = done.includes(s.id);
        const active = current === s.id;
        return (
          <li key={s.id} className="flex items-center gap-2" data-state={complete ? "done" : active ? "current" : "todo"}>
            {i > 0 && <span className="hidden h-px w-5 bg-border sm:block" aria-hidden />}
            <span className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1",
              complete ? "border-normal-border bg-normal-soft text-normal" : active ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground")}>
              {complete ? <CheckCircle2 className="size-3.5" /> : <CircleDot className="size-3.5" />} {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function DataView() {
  const { refresh } = useData();
  const admin = useApi("admin-status", (signal) => api.adminStatus(signal));
  const history = useApi("datasets", (signal) => api.datasets(signal));

  const [readings, setReadings] = useState<File | null>(null);
  const [thresholds, setThresholds] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<DatasetPreview | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "activate" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const status = admin.data;
  const storage = status?.storage ?? history.data?.storage;
  const isAdmin = !!status?.authenticated;
  const writable = !!storage?.writable;
  const active = history.data?.versions.find((v) => v.is_active);
  const selectionKey = `${fingerprint(readings)}|${fingerprint(thresholds)}`;
  const previewCurrent = preview !== null && previewKey === selectionKey;
  const hasFiles = !!(readings || thresholds);
  const canActivate = isAdmin && writable && previewCurrent && !!preview?.validation.valid && busy === null;

  const step: Step = busy === "activate" ? "activate" : previewCurrent ? (preview?.validation.valid ? "activate" : "validate")
    : busy === "preview" ? "validate" : hasFiles ? "validate" : "select";
  const done = useMemo<Step[]>(() => {
    const d: Step[] = [];
    if (hasFiles) d.push("select");
    if (previewCurrent && preview?.validation.valid) d.push("validate", "preview");
    return d;
  }, [hasFiles, previewCurrent, preview]);

  const setFile = (setter: (f: File | null) => void) => (f: File | null) => {
    setter(f);
    setNotice(null);
    setFailure(null);
  };

  const runPreview = async () => {
    setBusy("preview");
    setFailure(null);
    setNotice(null);
    try {
      const result = await api.previewDataset({ readings, thresholds });
      setPreview(result);
      setPreviewKey(selectionKey);
    } catch (err) {
      setFailure(toApiError(err));
      setPreview(null);
    } finally {
      setBusy(null);
    }
  };

  const afterChange = (message: string) => {
    setNotice(message);
    history.reload();
    admin.reload();
    refresh();               // header, sidebar and dashboard counts follow the new active version
  };

  const activateUpload = async () => {
    setBusy("activate");
    setFailure(null);
    try {
      const res = await api.createDataset({ readings, thresholds }, name.trim());
      setReadings(null);
      setThresholds(null);
      setName("");
      setPreview(null);
      setPreviewKey(null);
      afterChange(res.message);
    } catch (err) {
      setFailure(toApiError(err));
    } finally {
      setBusy(null);
    }
  };

  const activateVersion = async (v: DatasetVersion) => {
    setBusyId(v.id);
    setFailure(null);
    try {
      afterChange((await api.activateDataset(v.id)).message);
    } catch (err) {
      setFailure(toApiError(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      {storage && !storage.writable && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-missing-border bg-missing-soft/60 px-4 py-3" data-testid="storage-disabled">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-missing" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold">Dataset activation is unavailable</p>
            <p className="text-muted-foreground">{storage.message} You can still validate and preview files; nothing will be saved.</p>
          </div>
        </div>
      )}

      {notice && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-normal-border bg-normal-soft/60 px-4 py-3" data-testid="data-notice">
          <p className="flex items-center gap-2 text-sm font-medium text-normal"><CheckCircle2 className="size-4" /> {notice}</p>
          <Button asChild variant="outline" size="sm"><Link href="/">Open dashboard</Link></Button>
        </div>
      )}
      {failure && <ErrorState error={failure} onRetry={() => setFailure(null)} />}

      <div className="grid gap-5 xl:grid-cols-3">
        <DashCard icon={UploadCloud} title="Upload dataset" className="xl:col-span-2" testId="upload-card"
          subtitle="Validate, preview the result, then activate it."
          action={<Steps current={step} done={done} />}>
          <div className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <FileDrop kind="readings.csv" file={readings} onChange={setFile(setReadings)} maxBytes={MAX_READINGS}
                disabled={busy !== null} reuseName={active?.readings_filename} testId="drop-readings"
                templateHref="/templates/readings-template.csv"
                description={<>CSV with columns <code className="font-mono">site_id, site_name, sensor, timestamp, value</code>.
                  ISO 8601 timestamps (e.g. 2026-11-02T08:00:00). Leave <code className="font-mono">value</code> blank for a missing
                  measurement; it is stored as missing data, never zero. Up to {formatBytes(MAX_READINGS)} and 50,000 rows.</>} />
              <FileDrop kind="thresholds.json" file={thresholds} onChange={setFile(setThresholds)} maxBytes={MAX_THRESHOLDS}
                disabled={busy !== null} reuseName={active?.thresholds_filename} testId="drop-thresholds"
                templateHref="/templates/thresholds-template.json"
                description={<>JSON object keyed by sensor id or type, each with a numeric <code className="font-mono">limit</code> and
                  a <code className="font-mono">unit</code>, e.g. <code className="font-mono">{`{"noise_dba": {"limit": 85, "unit": "dBA"}}`}</code>.
                  Every sensor in readings.csv needs a matching threshold. Up to {formatBytes(MAX_THRESHOLDS)}.</>} />
            </div>

            <div className="flex flex-col gap-3 border-t pt-4 lg:flex-row lg:items-end">
              <div className="min-w-0 flex-1 space-y-1.5">
                <label htmlFor="dataset-name" className="text-sm font-medium">Dataset name <span className="font-normal text-muted-foreground">(optional)</span></label>
                <Input id="dataset-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Week 46 readings" className="h-9" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={!hasFiles || busy !== null || !isAdmin} onClick={runPreview} data-testid="preview-button">
                  {busy === "preview" ? <LoaderCircle className="animate-spin" /> : <Eye />} Preview changes
                </Button>
                <Button disabled={!canActivate} onClick={activateUpload} data-testid="activate-button">
                  {busy === "activate" ? <LoaderCircle className="animate-spin" /> : <Zap />} Activate dataset
                </Button>
              </div>
            </div>
            {!isAdmin && status?.admin_configured && (
              <p className="text-xs text-muted-foreground">Sign in as an administrator to validate and activate files.</p>
            )}
            {preview && !previewCurrent && (
              <p className="text-xs font-medium text-missing">The selected files changed since the last preview. Preview again before activating.</p>
            )}
            {busy === "preview" && (
              <div className="space-y-2" role="status" data-testid="validating">
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin text-primary" /> Uploading and validating files on the server…</p>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-1/3 animate-[progress_1.2s_ease-in-out_infinite] rounded-full bg-primary" /></div>
              </div>
            )}
          </div>
        </DashCard>

        <div className="space-y-5">
          <DashCard icon={Database} title="Active dataset" testId="active-dataset-card"
            subtitle="Used by every page and the AI.">
            {active ? (
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Dataset</dt>
                  <dd className="truncate font-semibold" data-testid="active-dataset-name">v{active.version} · {active.name}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd><Badge variant="outline" className="gap-1 border-normal-border bg-normal-soft text-normal"><CheckCircle2 className="size-3" /> Active</Badge></dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Uploaded</dt>
                  <dd>{active.source === "starter" ? "Starter (committed)" : formatLoadedAt(active.created_at)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Period</dt>
                  <dd className="text-right">{formatDateTime(active.stats.period_start)} – {formatDateTime(active.stats.period_end)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Rows · sites</dt>
                  <dd className="tabular">{active.stats.total_rows} · {active.stats.sites}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Storage</dt>
                  <dd className="flex items-center gap-1.5">
                    {storage?.writable ? <DatabaseZap className="size-3.5 text-normal" /> : <ShieldAlert className="size-3.5 text-missing" />}
                    {storage?.mode === "postgres" ? "PostgreSQL" : storage?.mode === "sqlite" ? "Local SQLite (dev)" : "Read-only"}
                  </dd>
                </div>
              </dl>
            ) : history.error ? <ErrorState error={history.error} onRetry={history.reload} /> : <Skeleton className="h-40" />}
          </DashCard>

          <DashCard icon={isAdmin ? ShieldCheck : FileCheck2} title="Administrator access" testId="admin-card"
            subtitle="Uploads and activation are restricted.">
            <AdminAccess status={status} onChange={() => { admin.reload(); history.reload(); }} />
          </DashCard>
        </div>
      </div>

      {preview && (
        <DashCard icon={FileCheck2} title="Validation and preview" testId="preview-card"
          subtitle={previewCurrent ? "Nothing has been saved. The active dataset changes only when you activate." : "Out of date: the selected files changed."}>
          <div className={cn("grid gap-6 lg:grid-cols-5", !previewCurrent && "opacity-60")}>
            <div className="space-y-4 lg:col-span-2">
              <ValidationReport report={preview.validation} />
              <ul className="space-y-1 text-xs text-muted-foreground">
                {preview.validation.files.map((f) => (
                  <li key={f.kind}><span className="font-mono text-foreground">{f.filename}</span> · {formatBytes(f.size_bytes)} ·{" "}
                    {f.source === "uploaded" ? "uploaded" : "reused from the active dataset"}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-5 lg:col-span-3">
              {preview.stats ? (
                <>
                  <StatTiles stats={preview.stats} warnings={preview.validation.warnings.reduce((n, w) => n + w.count, 0)} />
                  {preview.comparison && <ComparisonTable comparison={preview.comparison} />}
                </>
              ) : (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Statistics and the preview table appear once the blocking errors are fixed.
                </p>
              )}
            </div>
          </div>
          {preview.preview_rows.length > 0 && (
            <div className="mt-5 space-y-2">
              <h3 className="text-sm font-semibold">Preview table</h3>
              <PreviewRows preview={preview} />
            </div>
          )}
        </DashCard>
      )}

      <DashCard icon={History} title="Dataset history" testId="history-card"
        subtitle="Every import is an immutable version. Activate any version to roll back.">
        {history.data ? (
          <div className="space-y-5">
            <HistoryTable versions={history.data.versions} canActivate={isAdmin && writable} isAdmin={isAdmin}
              busyId={busyId} onActivate={activateVersion} />
            <VersionChart versions={history.data.versions} />
          </div>
        ) : history.error ? <ErrorState error={history.error} onRetry={history.reload} /> : <Skeleton className="h-32" />}
      </DashCard>
    </div>
  );
}
