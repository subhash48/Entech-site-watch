"use client";

import { useState, useSyncExternalStore } from "react";
import { ChatLauncher } from "@/components/chat/chat-launcher";
import { AppHeader } from "@/components/shell/app-header";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

const DESKTOP = "(min-width: 1024px)";
const subscribe = (cb: () => void) => {
  const mql = window.matchMedia(DESKTOP);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
};

/** Expanded sidebar on desktop, icon rail on tablet, off-canvas sheet on mobile. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const isDesktop = useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => true);
  const [override, setOverride] = useState<{ open: boolean; desktop: boolean } | null>(null);
  // A manual toggle applies until the viewport crosses the desktop breakpoint.
  const open = override && override.desktop === isDesktop ? override.open : isDesktop;

  return (
    <SidebarProvider
      open={open}
      onOpenChange={(value) => setOverride({ open: value, desktop: isDesktop })}
      style={{ "--sidebar-width": "14rem" } as React.CSSProperties}
    >
      <AppSidebar />
      <SidebarInset className="min-w-0 bg-background">
        <AppHeader />
        <div className="w-full max-w-[1600px] flex-1 px-4 pt-5 pb-8 sm:px-6 lg:px-8">{children}</div>
      </SidebarInset>
      <ChatLauncher />
    </SidebarProvider>
  );
}
