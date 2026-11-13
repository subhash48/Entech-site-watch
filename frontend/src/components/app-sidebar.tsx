"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, Building2, FileText, LayoutDashboard, Radar, Settings, Sparkles, TriangleAlert, type LucideIcon,
} from "lucide-react";
import { useData } from "@/components/data-provider";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarRail,
} from "@/components/ui/sidebar";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const MONITORING: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/sites", label: "Sites", icon: Building2 },
  { href: "/readings", label: "Sensor Readings", icon: Activity },
  { href: "/alerts", label: "Alerts", icon: TriangleAlert },
  { href: "/reports", label: "Reports", icon: FileText },
];
const TOOLS: NavItem[] = [
  { href: "/assistant", label: "AI Assistant", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const pathname = usePathname();
  const { overview } = useData();
  const alerts = overview?.totals.exceeded_readings;

  const renderItems = (items: NavItem[]) =>
    items.map(({ href, label, icon: Icon }) => (
      <SidebarMenuItem key={href}>
        <SidebarMenuButton asChild isActive={isActive(pathname, href)} tooltip={label}>
          <Link href={href}>
            <Icon />
            <span>{label}</span>
          </Link>
        </SidebarMenuButton>
        {href === "/alerts" && alerts ? (
          <SidebarMenuBadge className="bg-exceeded-soft text-exceeded" aria-label={`${alerts} exceedances`}>
            {alerts}
          </SidebarMenuBadge>
        ) : null}
      </SidebarMenuItem>
    ));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="SiteWatch AI">
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Radar className="size-4" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">SiteWatch AI</span>
                  <span className="truncate text-xs text-muted-foreground">EnTech · NYC sites</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Monitoring</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(MONITORING)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(TOOLS)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <p className="px-2 pb-1 text-xs leading-relaxed text-muted-foreground">
          Static dataset from readings.csv and thresholds.json. Not a live feed.
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
