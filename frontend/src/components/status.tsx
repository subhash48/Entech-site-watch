import { CheckCircle2, CircleDashed, TriangleAlert, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReadingStatus, SiteStatus } from "@/lib/types";

const TONES = {
  exceeded: "border-exceeded-border bg-exceeded-soft text-exceeded",
  missing: "border-missing-border bg-missing-soft text-missing",
  normal: "border-normal-border bg-normal-soft text-normal",
} as const;

const READING: Record<ReadingStatus, { label: string; tone: keyof typeof TONES; Icon: LucideIcon }> = {
  NORMAL: { label: "Normal", tone: "normal", Icon: CheckCircle2 },
  EXCEEDED: { label: "Exceeded", tone: "exceeded", Icon: TriangleAlert },
  MISSING_DATA: { label: "Missing data", tone: "missing", Icon: CircleDashed },
};

const SITE: Record<SiteStatus, { label: string; tone: keyof typeof TONES; Icon: LucideIcon }> = {
  ALERT: { label: "Alert", tone: "exceeded", Icon: TriangleAlert },
  NEEDS_REVIEW: { label: "Needs review", tone: "missing", Icon: CircleDashed },
  OK: { label: "OK", tone: "normal", Icon: CheckCircle2 },
};

export const STATUS_LABEL: Record<ReadingStatus, string> = {
  NORMAL: "Normal",
  EXCEEDED: "Exceeded",
  MISSING_DATA: "Missing data",
};

export function ReadingStatusBadge({ status, className }: { status: ReadingStatus; className?: string }) {
  const { label, tone, Icon } = READING[status];
  return (
    <Badge variant="outline" data-status={status} className={cn("gap-1 font-medium", TONES[tone], className)}>
      <Icon aria-hidden className="size-3" />
      {label}
    </Badge>
  );
}

export function SiteStatusBadge({ status, className }: { status: SiteStatus; className?: string }) {
  const { label, tone, Icon } = SITE[status];
  return (
    <Badge variant="outline" data-status={status} className={cn("gap-1 font-medium", TONES[tone], className)}>
      <Icon aria-hidden className="size-3" />
      {label}
    </Badge>
  );
}

/** Row tint for tables: red for exceeded, amber for missing data. */
export function rowTone(status: ReadingStatus): string {
  if (status === "EXCEEDED") return "bg-exceeded-soft/70 hover:bg-exceeded-soft shadow-[inset_3px_0_0_var(--exceeded)]";
  if (status === "MISSING_DATA") return "bg-missing-soft/70 hover:bg-missing-soft shadow-[inset_3px_0_0_var(--missing)]";
  return "";
}
