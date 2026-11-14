"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all__";

/** A labelled select where an empty string means "no filter". */
export function FilterSelect({ label, value, onChange, options, allLabel, className, testId }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;            // omit for a required choice (no "all" option)
  className?: string;
  testId?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <Select value={value || (allLabel ? ALL : undefined)} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
        <SelectTrigger size="sm" className={className ?? "w-full sm:w-44"} aria-label={label} data-testid={testId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  );
}
