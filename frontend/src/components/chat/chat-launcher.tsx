"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

/** Floating "Ask SiteWatch AI" button with a slide-over chat panel (hidden on the AI Assistant page). */
export function ChatLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (pathname === "/assistant") return null;

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-30 h-11 rounded-full px-4 shadow-lg shadow-primary/20 sm:right-6 sm:bottom-6"
        aria-label="Open SiteWatch AI assistant"
      >
        <Sparkles /> <span className="hidden sm:inline">Ask SiteWatch AI</span>
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetTitle className="sr-only">SiteWatch AI assistant</SheetTitle>
          <SheetDescription className="sr-only">Ask questions about this project&apos;s monitoring data.</SheetDescription>
          <ChatPanel className="h-full" autoFocus />
        </SheetContent>
      </Sheet>
    </>
  );
}
