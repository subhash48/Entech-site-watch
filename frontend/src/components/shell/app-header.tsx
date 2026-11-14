"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bell, BookOpen, ChevronDown, RefreshCw, Search, Settings, TriangleAlert, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import { useData } from "@/components/data-provider";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { API_BASE_URL } from "@/lib/api";
import { formatNumber, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Meta {
  eyebrow: string;
  title: string;
  subtitle: string;
}

const META: [string, Meta][] = [
  ["/sites/", { eyebrow: "Sites", title: "Site Details", subtitle: "Readings grouped by sensor with configured limits and exceedance amounts." }],
  ["/sites", { eyebrow: "Sites", title: "Construction Sites", subtitle: "Monitoring status, alert counts and data coverage for each site in the dataset." }],
  ["/alerts", { eyebrow: "Alerts", title: "Threshold Exceedances", subtitle: "Confirmed readings above their sensor's configured limit. Missing data is kept separate." }],
  ["/sensors", { eyebrow: "Sensors", title: "Sensor Readings", subtitle: "Every reading with the threshold applied to it. Missing values are shown explicitly, never as zero." }],
  ["/reports", { eyebrow: "Reports", title: "Client Reports", subtitle: "Deterministic, client-ready summaries generated from the classified readings." }],
  ["/data", { eyebrow: "Data", title: "Data Management", subtitle: "Upload, validate, preview and activate sensor datasets. Every import is stored as an immutable version." }],
  ["/assistant", { eyebrow: "Workspace", title: "AI Assistant", subtitle: "Ask questions about this project's sites, sensors, alerts and documentation." }],
  ["/settings", { eyebrow: "Settings", title: "Settings", subtitle: "Appearance, API connection, data source and configured thresholds." }],
];
const DASHBOARD: Meta = {
  eyebrow: "",
  title: "Operations Dashboard",
  subtitle: "Construction site sensor monitoring, alerts, and AI-powered insights.",
};

function metaFor(pathname: string): Meta {
  return META.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? DASHBOARD;
}

const subscribe = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function SearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const mac = useSyncExternalStore(subscribe, isMac, () => false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      className="relative min-w-0 flex-1 lg:w-[20rem] lg:flex-none xl:w-[23rem]"
      onSubmit={(e) => {
        e.preventDefault();
        const q = query.trim();
        router.push(q ? `/sensors?q=${encodeURIComponent(q)}` : "/sensors");
      }}
    >
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search sites, sensors, alerts…"
        aria-label="Search sensor readings"
        className="h-10 w-full rounded-xl border bg-card pr-16 pl-9 text-sm shadow-card outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border bg-muted px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground sm:block">
        {mac ? "⌘ K" : "Ctrl K"}
      </kbd>
    </form>
  );
}

function Notifications() {
  const { overview } = useData();
  const alerts = overview?.recent_alerts ?? [];
  const count = overview?.totals.exceeded_readings ?? 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Notifications: ${count} threshold exceedances`} data-testid="notifications"
          className="relative flex size-10 shrink-0 items-center justify-center rounded-xl text-foreground hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none">
          <Bell className="size-5" />
          {count > 0 && <span className="absolute top-2 right-2 size-2.5 rounded-full border-2 border-background bg-[#e5484d]" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Threshold exceedances <span className="text-xs font-normal text-muted-foreground">{count} total</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {alerts.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">No exceedances in the dataset.</p>}
        {alerts.map((a) => (
          <DropdownMenuItem key={a.reading_id} asChild>
            <Link href={`/sites/${a.site_id}`} className="flex items-start gap-2.5">
              <TriangleAlert className="mt-0.5 size-4 text-exceeded" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{a.sensor_label} · {a.site_name}</span>
                <span className="block text-xs text-muted-foreground tabular">
                  {formatNumber(a.value)} {a.unit} (limit {formatNumber(a.threshold)}) · {formatTime(a.timestamp)}
                </span>
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/alerts" className="justify-center font-medium text-primary">View all alerts</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountMenu() {
  const { theme, setTheme } = useTheme();
  const { refresh } = useData();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Workspace menu"
          className="flex shrink-0 items-center gap-1.5 rounded-full p-0.5 pr-1 hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none">
          <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#2b5bd7] to-[#0b1f47] text-white shadow-card">
            <UserRound className="size-[1.1rem]" />
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <span className="block text-sm">Demo workspace</span>
          <span className="block text-xs font-normal text-muted-foreground">No sign-in configured</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mounted ? theme : undefined} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={refresh}><RefreshCw /> Reload data</DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/settings"><Settings /> Settings</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><a href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer"><BookOpen /> API documentation</a></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  const meta = metaFor(pathname);
  return (
    <header className="flex flex-col gap-3 px-4 pt-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:px-7 lg:pt-5">
      <div className="flex min-w-0 items-start gap-2">
        <SidebarTrigger className="mt-0.5 -ml-1 size-9 lg:hidden" />
        <div className="min-w-0">
          {meta.eyebrow && <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{meta.eyebrow}</p>}
          <h1 className="text-[1.4rem] leading-tight font-bold tracking-tight sm:text-[1.55rem]">{meta.title}</h1>
          <p className="mt-0.5 text-[0.85rem] text-muted-foreground sm:text-sm">{meta.subtitle}</p>
        </div>
      </div>
      <div className={cn("flex items-center gap-2 sm:gap-3")}>
        <SearchBox />
        <Notifications />
        <Separator orientation="vertical" className="hidden data-[orientation=vertical]:h-7 sm:block" />
        <AccountMenu />
      </div>
    </header>
  );
}
