"use client";

import { Database, FileText, ShieldCheck, Wrench } from "lucide-react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { useChat } from "@/components/chat/chat-provider";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TOOLS = ["get_sites", "get_site_details", "get_readings", "get_exceedances", "get_thresholds",
  "get_monitoring_summary", "search_project_docs"];

export function AssistantView() {
  const { status } = useChat();
  return (
    <div className="space-y-4">
      <PageHeader title="AI Assistant"
        description="SiteWatch AI answers questions about this project only, using read-only tools over the same validated data as the dashboard." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="h-[calc(100svh-12rem)] min-h-[480px] gap-0 overflow-hidden py-0 lg:col-span-2">
          <ChatPanel className="h-full" />
        </Card>
        <div className="space-y-4">
          <Card className="gap-3">
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> How answers are grounded</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Every data answer comes from a tool call over readings.csv and thresholds.json. Totals come from the same report the API produces, not from the model&apos;s memory.</p>
              <p>Questions about the application are answered from the README and docs, with section references.</p>
              <p>The dataset is static, not live. Exceeding a configured threshold does not by itself mean a regulatory violation.</p>
            </CardContent>
          </Card>
          <Card className="gap-3">
            <CardHeader><CardTitle className="flex items-center gap-2"><Wrench className="size-4 text-primary" /> Read-only tools</CardTitle></CardHeader>
            <CardContent>
              <ul className="flex flex-wrap gap-1.5">
                {TOOLS.map((t) => <li key={t} className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-xs">{t}</li>)}
              </ul>
            </CardContent>
          </Card>
          <Card className="gap-3">
            <CardHeader><CardTitle>Status</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="flex items-center gap-2"><Database className="size-4 text-muted-foreground" />
                {status ? (status.configured ? `Ready · ${status.provider} · ${status.model}` : "Not configured") : "Checking…"}</p>
              <p className="flex items-center gap-2 text-muted-foreground"><FileText className="size-4" /> Sources: data files and documentation sections</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
