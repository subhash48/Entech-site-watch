import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { ChatProvider } from "@/components/chat/chat-provider";
import { DataProvider } from "@/components/data-provider";
import { AppShell } from "@/components/shell/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: { default: "SiteWatch AI", template: "%s · SiteWatch AI" },
  description: "Construction-site vibration, noise and dust monitoring for EnTech's New York City sites.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", inter.variable, mono.variable)}>
      <body>
        {/* Light is the reference design; dark mode is available from the workspace menu. */}
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={200}>
            <DataProvider>
              <ChatProvider>
                <AppShell>{children}</AppShell>
              </ChatProvider>
            </DataProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
