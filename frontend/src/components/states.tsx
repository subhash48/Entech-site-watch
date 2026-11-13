import { CircleOff, RefreshCw, ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ErrorState({ error, onRetry, className }: { error: ApiError; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-exceeded-border bg-exceeded-soft/40 px-6 py-10 text-center", className)}>
      <ServerCrash aria-hidden className="size-8 text-exceeded" />
      <div className="space-y-1">
        <p className="text-sm font-semibold">Could not load data</p>
        <p className="max-w-md text-sm text-muted-foreground">{error.message}</p>
        {error.code !== "NETWORK_ERROR" && <p className="font-mono text-xs text-muted-foreground">{error.code}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, description, action, className }: {
  title: string; description?: string; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-12 text-center", className)}>
      <CircleOff aria-hidden className="size-7 text-muted-foreground/70" />
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }, (_, c) => <Skeleton key={c} className="h-6 flex-1" />)}
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className="h-[104px] rounded-lg" />)}
    </div>
  );
}
