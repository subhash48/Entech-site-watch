"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, ChartColumn, Database, House, MapPin, Radio, Settings, Sparkles, type LucideIcon,
} from "lucide-react";
import { useData } from "@/components/data-provider";
import { LogoMark } from "@/components/shell/logo";
import { Skyline } from "@/components/shell/skyline";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton,
  SidebarMenuItem, SidebarRail, useSidebar,
} from "@/components/ui/sidebar";
import { formatLoadedAt } from "@/lib/format";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: House },
  { href: "/sites", label: "Sites", icon: MapPin },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/sensors", label: "Sensors", icon: Radio },
  { href: "/reports", label: "Reports", icon: ChartColumn },
  { href: "/data", label: "Data Management", icon: Database },
  { href: "/assistant", label: "AI Assistant", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const pathname = usePathname();
  const { overview, error } = useData();
  const dataset = overview?.data_source.dataset;
  const { isMobile, setOpenMobile } = useSidebar();
  const alerts = overview?.totals.exceeded_readings ?? 0;

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="px-4 pt-5 pb-3 group-data-[collapsible=icon]:px-2">
        <Link href="/" className="flex items-center gap-2.5 px-1" onClick={() => isMobile && setOpenMobile(false)}>
          <LogoMark className="size-7 shrink-0" />
          <span className="truncate text-[1.2rem] font-bold tracking-tight text-white group-data-[collapsible=icon]:hidden">
            SiteWatch AI
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="relative z-10 px-3 pt-2 group-data-[collapsible=icon]:px-2">
        <SidebarMenu className="gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={label}
                  className={cn(
                    "h-10 gap-3 rounded-xl px-3.5 text-[0.9rem] font-medium text-sidebar-foreground [&_svg]:size-[1.15rem]!",
                    "hover:bg-white/8 hover:text-white",
                    "data-[active=true]:bg-sidebar-primary! data-[active=true]:text-white! data-[active=true]:shadow-[0_6px_18px_-6px_rgb(43_91_215/0.8)]",
                  )}
                >
                  <Link href={href} onClick={() => isMobile && setOpenMobile(false)} aria-current={active ? "page" : undefined}>
                    <Icon />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
                {href === "/alerts" && alerts > 0 && (
                  <SidebarMenuBadge
                    data-testid="nav-alert-count"
                    aria-label={`${alerts} exceedances`}
                    className="top-1/2! right-3 size-5 -translate-y-1/2 rounded-full bg-[#e5484d] px-0 text-[11px] font-semibold text-white!"
                  >
                    {alerts}
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter
        className="relative z-10 mx-3 mb-3 gap-0.5 rounded-xl border border-white/10 bg-[#081738]/80 px-3 py-2 backdrop-blur-[2px] group-data-[collapsible=icon]:hidden"
        title={dataset?.source === "upload" && dataset.created_at
          ? `Uploaded ${formatLoadedAt(dataset.created_at)}. Static uploaded data, not a live feed.`
          : "readings.csv and thresholds.json. Static data, not a live feed."}>
        <p className="flex items-center gap-2 text-xs font-medium text-sidebar-foreground/90" data-testid="data-source-status"
          data-state={error ? "offline" : overview ? "connected" : "connecting"}>
          <span className={cn("size-2 shrink-0 rounded-full", error ? "bg-[#ff6b6b]" : overview ? "bg-[#4ade80]" : "animate-pulse bg-white/50")} />
          {error ? "API offline" : overview ? (dataset?.source === "upload" ? "Uploaded dataset active" : "Static dataset loaded")
            : "Connecting to API…"}
        </p>
        <p className="flex min-w-0 items-center gap-1 pl-4 text-[11px] text-sidebar-foreground/60">
          <span className="truncate" data-testid="active-dataset-label">
            {dataset ? `v${dataset.version} · ${dataset.name}` : "readings.csv · thresholds.json"}
          </span>
          <span className="shrink-0">· not live</span>
        </p>
      </SidebarFooter>

      <Skyline className="pointer-events-none absolute inset-x-0 bottom-0 h-56 w-full group-data-[collapsible=icon]:hidden" />
      <SidebarRail />
    </Sidebar>
  );
}
