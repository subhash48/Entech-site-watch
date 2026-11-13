import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Card chrome used across the dashboard: icon, title, subtitle and an optional action. */
export function DashCard({ icon: Icon, title, subtitle, action, children, className, bodyClassName, testId }: {
  icon: LucideIcon; title: string; subtitle?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode;
  className?: string; bodyClassName?: string; testId?: string;
}) {
  return (
    <section data-testid={testId} className={cn("flex min-w-0 flex-col rounded-2xl border bg-card shadow-card", className)}>
      <header className="flex items-start gap-3 px-5 pt-5 pb-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
          <Icon className="size-5" strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg leading-tight font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className={cn("min-h-0 flex-1 px-5 pb-5", bodyClassName)}>{children}</div>
    </section>
  );
}
