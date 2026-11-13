import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { AppSidebar } from "@/components/app-sidebar";
import { ChatLauncher } from "@/components/chat/chat-launcher";
import { ChatProvider } from "@/components/chat/chat-provider";
import { DataProvider } from "@/components/data-provider";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: { default: "SiteWatch AI", template: "%s · SiteWatch AI" },
  description: "Construction-site vibration, noise and dust monitoring for EnTech's New York City sites.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#141a26" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable, geistMono.variable)}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={200}>
            <DataProvider>
              <ChatProvider>
                <SidebarProvider>
                  <AppSidebar />
                  <SidebarInset className="min-w-0">
                    <SiteHeader />
                    {/* SidebarInset already renders the page's <main> landmark. */}
                    <div className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</div>
                  </SidebarInset>
                  <ChatLauncher />
                </SidebarProvider>
              </ChatProvider>
            </DataProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
