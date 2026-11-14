import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import type { ValidationIssue, ValidationReport as Report } from "@/lib/types";
import { cn } from "@/lib/utils";

function IssueItem({ issue }: { issue: ValidationIssue }) {
  const error = issue.level === "error";
  const more = issue.count - issue.rows.length;
  return (
    <li className={cn("rounded-lg border px-3 py-2.5 text-sm",
      error ? "border-exceeded-border bg-exceeded-soft/50" : "border-missing-border bg-missing-soft/50")}
      data-testid={`issue-${issue.code}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={cn("font-mono text-[11px] font-semibold", error ? "text-exceeded" : "text-missing")}>{issue.code}</span>
        <span className="text-xs text-muted-foreground">{issue.file}{issue.count > 1 ? ` · ${issue.count} occurrences` : ""}</span>
      </div>
      <p className="mt-0.5 font-medium">{issue.message}</p>
      {issue.rows.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground" data-testid={`issue-rows-${issue.code}`}>
          {issue.rows.length === 1 && issue.count === 1 ? "Row " : "Rows "}
          <span className="font-mono text-foreground">{issue.rows.join(", ")}</span>
          {more > 0 && ` and ${more} more`}
        </p>
      )}
      {issue.examples.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {issue.examples.map((ex) => <li key={ex} className="font-mono break-all">{ex}</li>)}
        </ul>
      )}
    </li>
  );
}

/** Blocking errors and warnings, kept visibly separate, with offending CSV row numbers. */
export function ValidationReport({ report }: { report: Report }) {
  const errorCount = report.errors.reduce((n, i) => n + i.count, 0);
  const warningCount = report.warnings.reduce((n, i) => n + i.count, 0);
  return (
    <div className="space-y-4" data-testid="validation-report" data-valid={report.valid}>
      {report.valid ? (
        <div className="flex items-start gap-3 rounded-xl border border-normal-border bg-normal-soft/60 px-4 py-3">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-normal" aria-hidden />
          <div>
            <p className="font-semibold text-normal">No blocking errors</p>
            <p className="text-sm text-muted-foreground">
              The files can be activated{warningCount ? `. Review the ${warningCount} warning${warningCount === 1 ? "" : "s"} below first` : ""}.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-exceeded-border bg-exceeded-soft/60 px-4 py-3">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-exceeded" aria-hidden />
          <div>
            <p className="font-semibold text-exceeded">{errorCount} blocking error{errorCount === 1 ? "" : "s"}</p>
            <p className="text-sm text-muted-foreground">Fix these in your files and preview again. Nothing was saved.</p>
          </div>
        </div>
      )}

      {report.errors.length > 0 && (
        <section aria-label="Blocking errors" className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><CircleAlert className="size-4 text-exceeded" /> Blocking errors</h3>
          <ul className="space-y-2">{report.errors.map((i) => <IssueItem key={`${i.code}-${i.message}`} issue={i} />)}</ul>
        </section>
      )}
      {report.warnings.length > 0 && (
        <section aria-label="Warnings" className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><TriangleAlert className="size-4 text-missing" /> Warnings</h3>
          <ul className="space-y-2">{report.warnings.map((i) => <IssueItem key={`${i.code}-${i.message}`} issue={i} />)}</ul>
        </section>
      )}
    </div>
  );
}
