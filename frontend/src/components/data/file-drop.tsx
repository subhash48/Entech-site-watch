"use client";

import { useId, useRef, useState } from "react";
import { Download, FileJson2, FileSpreadsheet, RotateCcw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Drag-and-drop zone with a file picker for one dataset file. The browser check (extension and size)
 * is only for quick feedback; the server validates everything again.
 */
export function FileDrop({ kind, file, onChange, maxBytes, disabled, reuseName, templateHref, description, testId }: {
  kind: "readings.csv" | "thresholds.json";
  file: File | null;
  onChange: (file: File | null) => void;
  maxBytes: number;
  disabled?: boolean;
  reuseName?: string;
  templateHref: string;
  description: React.ReactNode;
  testId: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ext = kind === "readings.csv" ? ".csv" : ".json";
  const Icon = kind === "readings.csv" ? FileSpreadsheet : FileJson2;

  const accept = (f: File | undefined | null) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(ext)) {
      setProblem(`Choose a ${ext} file (got ${f.name}).`);
      return;
    }
    if (f.size > maxBytes) {
      setProblem(`${f.name} is ${formatBytes(f.size)}; the limit is ${formatBytes(maxBytes)}.`);
      return;
    }
    setProblem(null);
    onChange(f);
  };

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 text-primary" aria-hidden /> {kind}
        </label>
        <a href={templateHref} download className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <Download className="size-3.5" aria-hidden /> Example template
        </a>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) accept(e.dataTransfer.files?.[0]);
        }}
        data-dragging={dragging || undefined}
        className={cn(
          "flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : file ? "border-normal-border bg-normal-soft/40" : "border-border bg-muted/30",
          disabled && "opacity-60",
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={kind === "readings.csv" ? ".csv,text/csv" : ".json,application/json"}
          className="sr-only"
          disabled={disabled}
          aria-describedby={`${id}-help`}
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {file ? (
          <>
            <Icon className="size-7 text-normal" aria-hidden />
            <p className="max-w-full truncate text-sm font-semibold" data-testid={`${testId}-name`}>{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(file.size)} · ready to validate</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
                <RotateCcw /> Replace
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null)}
                aria-label={`Remove ${file.name}`}>
                <X /> Remove
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="flex size-10 items-center justify-center rounded-full bg-card shadow-sm">
              <Upload className="size-5 text-primary" aria-hidden />
            </span>
            <p className="text-sm"><span className="font-semibold">Drag and drop</span> {kind} here</p>
            <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
              Choose file
            </Button>
            {reuseName && (
              <p className="text-xs text-muted-foreground">Or leave empty to reuse the active <span className="font-mono">{reuseName}</span></p>
            )}
          </>
        )}
      </div>
      {problem && <p role="alert" className="text-xs font-medium text-exceeded">{problem}</p>}
      <div id={`${id}-help`} className="text-xs leading-relaxed text-muted-foreground">{description}</div>
    </div>
  );
}
