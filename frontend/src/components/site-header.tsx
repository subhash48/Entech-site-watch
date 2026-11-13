"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { useData } from "@/components/data-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatLoadedAt } from "@/lib/format";
import { cn } from "@/lib/utils";

function DataSourceStatus() {
  const { overview, error, loading } = useData();
  const state = error ? "offline" : overview ? "connected" : "connecting";
  const label = { offline: "API offline", connected: "Static CSV · connected", connecting: "Connecting…" }[state];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-testid="data-source-status"
          data-state={state}
          className="hidden items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground md:inline-flex"
        >
          <span className={cn("size-2 rounded-full", {
            "bg-normal": state === "connected",
            "bg-exceeded": state === "offline",
            "animate-pulse bg-muted-foreground": state === "connecting" || loading,
          })} />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {error ? error.message : overview ? overview.data_source.note : "Contacting the SiteWatch API"}
      </TooltipContent>
    </Tooltip>
  );
}

export function SiteHeader() {
  const router = useRouter();
  const { overview, refresh, loading } = useData();
  const [query, setQuery] = useState("");

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
      <div className="hidden min-w-0 flex-col leading-tight sm:flex">
        <span className="truncate text-sm font-semibold">Construction Site Monitoring</span>
        <span className="truncate text-xs text-muted-foreground" data-testid="last-refresh">
          Data loaded {overview ? formatLoadedAt(overview.data_source.loaded_at) : "…"}
        </span>
      </div>

      <form
        role="search"
        className="ml-auto flex w-full max-w-xs items-center sm:ml-6"
        onSubmit={(e) => {
          e.preventDefault();
          const q = query.trim();
          router.push(q ? `/readings?q=${encodeURIComponent(q)}` : "/readings");
        }}
      >
        <div className="relative w-full">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search readings…"
            aria-label="Search sensor readings"
            className="h-8 pl-8"
          />
        </div>
      </form>

      <div className="ml-auto flex items-center gap-1 sm:ml-2">
        <DataSourceStatus />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={refresh} aria-label="Refresh data" disabled={loading}>
              <RefreshCw className={cn(loading && "animate-spin")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reload data from the API</TooltipContent>
        </Tooltip>
        <ThemeToggle />
      </div>
    </header>
  );
}
