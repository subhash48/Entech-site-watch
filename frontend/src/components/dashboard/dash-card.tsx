import { Info, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Card chrome used across the dashboard: icon, title, subtitle and an optional action. */
export function DashCard({ icon: Icon, title, subtitle, info, action, children, className, bodyClassName, testId }: {
  icon: LucideIcon; title: string; subtitle?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode;
  /** Optional explanation shown from an info button next to the title. */
  info?: string;
  className?: string; bodyClassName?: string; testId?: string;
}) {
  return (
    <section data-testid={testId} className={cn("flex min-w-0 flex-col rounded-2xl border bg-card shadow-card", className)}>
      <header className="flex flex-wrap items-center gap-2.5 px-4 pt-3.5 pb-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
          <Icon className="size-4" strokeWidth={2} />
        </span>
        <div className="min-w-[9rem] flex-1">
          <h2 className="flex items-center gap-1.5 text-base leading-tight font-bold tracking-tight">
            {title}
            {info && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label={`About ${title}`} className="text-muted-foreground hover:text-foreground">
                    <Info className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs font-normal">{info}</TooltipContent>
              </Tooltip>
            )}
          </h2>
          {subtitle && <p className="truncate text-[0.8rem] text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className={cn("min-h-0 flex-1 px-4 pb-4", bodyClassName)}>{children}</div>
    </section>
  );
}
