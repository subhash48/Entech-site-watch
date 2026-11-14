import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Card chrome used across the dashboard: icon, title, subtitle and an optional action. */
export function DashCard({ icon: Icon, title, subtitle, action, children, className, bodyClassName, testId }: {
  icon: LucideIcon; title: string; subtitle?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode;
  className?: string; bodyClassName?: string; testId?: string;
}) {
  return (
    <section data-testid={testId} className={cn("flex min-w-0 flex-col rounded-2xl border bg-card shadow-card", className)}>
      <header className="flex flex-wrap items-center gap-2.5 px-4 pt-3.5 pb-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
          <Icon className="size-4" strokeWidth={2} />
        </span>
        <div className="min-w-[9rem] flex-1">
          <h2 className="text-base leading-tight font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="truncate text-[0.8rem] text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className={cn("min-h-0 flex-1 px-4 pb-4", bodyClassName)}>{children}</div>
    </section>
  );
}
