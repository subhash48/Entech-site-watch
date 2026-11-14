"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ChartColumn, ChevronRight, FileText, Info, KeyRound, Layers, RotateCcw, SendHorizontal, Sparkles, Trash2,
  TriangleAlert, UserRound,
} from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Markdown } from "@/components/chat/markdown";
import { useChat, type UIMessage } from "@/components/chat/chat-provider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChatSource } from "@/lib/types";
import { cn } from "@/lib/utils";

export const SUGGESTED_PROMPTS = [
  "Which sites exceeded their limits?",
  "What was the highest vibration reading?",
  "Show all noise exceedances.",
  "Which sensors have missing data?",
  "Summarize the monitoring results for a client.",
];

/** Where each cited data file can be inspected in the app. */
const SOURCE_LINKS: Record<string, string> = { "readings.csv": "/sensors", "thresholds.json": "/settings" };

const KEY_HELP: Record<string, [string, string]> = {
  anthropic: ["ANTHROPIC_API_KEY", "Anthropic"],
  groq: ["GROQ_API_KEY", "Groq"],
};

function SetupNotice({ message, provider }: { message: string; provider: string }) {
  const [keyVar, vendor] = KEY_HELP[provider] ?? KEY_HELP.anthropic;
  return (
    <div data-testid="ai-setup" className="space-y-2.5 rounded-xl border border-missing-border bg-missing-soft/60 p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold"><KeyRound className="size-4 text-missing" /> SiteWatch AI is not configured</p>
      <p className="text-muted-foreground">{message}</p>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>Copy <code className="font-mono text-xs">backend/.env.example</code> to <code className="font-mono text-xs">backend/.env</code>.</li>
        <li>Set <code className="font-mono text-xs">{keyVar}</code> to your {vendor} API key.</li>
        <li>Restart the backend, then reload this page.</li>
      </ol>
      <p className="text-xs text-muted-foreground">The key stays on the server and is never sent to the browser. The rest of the dashboard works without it.</p>
    </div>
  );
}

function SourceChips({ sources }: { sources: ChatSource[] }) {
  if (!sources.length) return null;
  const data = sources.filter((s) => s.type === "data");
  const docs = sources.filter((s) => s.type === "doc");
  const chip = "inline-flex max-w-full items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-xs font-medium text-foreground/80";
  return (
    <div className="flex flex-wrap gap-1.5 pt-2.5" aria-label="Sources">
      {data.length > 0 && (
        <Link href={SOURCE_LINKS[data[0].name] ?? "/sensors"} className={cn(chip, "hover:border-primary/40")}>
          <ChartColumn className="size-3.5 shrink-0" />
          <span className="truncate">Source: {data.map((s) => s.name).join(", ")}</span>
          <ChevronRight className="size-3.5 shrink-0" />
        </Link>
      )}
      {docs.map((s) => (
        <span key={s.name} className={chip}>
          <FileText className="size-3.5 shrink-0" /><span className="truncate">{s.name}</span>
        </span>
      ))}
    </div>
  );
}

function AssistantAvatar() {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
      <Sparkles className="size-[1.1rem]" />
    </span>
  );
}

function Message({ message, onRetry }: { message: UIMessage; onRetry: () => void }) {
  if (message.role === "user") {
    return (
      <div className="flex items-start justify-end gap-2.5">
        <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-[#e6eefc] px-4 py-2.5 text-sm whitespace-pre-wrap text-foreground dark:bg-[#1c2d55]">
          {message.content}
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-card text-foreground">
          <UserRound className="size-[1.1rem]" />
        </span>
      </div>
    );
  }
  if (message.error) {
    return (
      <div className="flex items-start gap-3">
        <AssistantAvatar />
        <div role="alert" className="flex-1 space-y-2 rounded-2xl rounded-tl-md border border-exceeded-border bg-exceeded-soft/60 px-4 py-3 text-sm">
          <p className="flex items-start gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-exceeded" />{message.error}</p>
          <button type="button" onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs font-medium hover:bg-muted">
            <RotateCcw className="size-3" /> Retry
          </button>
        </div>
      </div>
    );
  }
  const refused = message.response?.refused;
  return (
    <div className="group flex items-start gap-3" data-testid="assistant-message">
      <AssistantAvatar />
      <div className="min-w-0 flex-1">
        <div className={cn("rounded-2xl rounded-tl-md bg-muted/80 px-4 py-3", refused && "text-muted-foreground")}>
          <Markdown>{message.content}</Markdown>
          <SourceChips sources={message.response?.sources ?? []} />
        </div>
        <div className="mt-1 opacity-70 transition-opacity group-hover:opacity-100">
          <CopyButton text={message.content} label="Copy response" size="xs" variant="ghost" />
        </div>
      </div>
    </div>
  );
}

/**
 * The SiteWatch AI chat. `compact` is the dashboard preview: a smaller header with a link to the full
 * assistant page; the conversation itself is shared with the panel and the page (same ChatProvider).
 */
export function ChatPanel({ className, autoFocus, compact = false }: { className?: string; autoFocus?: boolean; compact?: boolean }) {
  const { messages, pending, status, statusError, send, retry, clear } = useChat();
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const notConfigured = status && !status.configured;
  const disabled = pending || !!notConfigured || !!statusError;

  // Keep the newest message in view without scrolling the whole page.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending]);

  const submit = (text = draft) => {
    if (!text.trim() || disabled) return;
    send(text);
    setDraft("");
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className={cn("flex items-start gap-3", compact ? "items-center gap-2.5 px-4 pt-3.5 pb-2" : "px-5 pt-5 pb-3")}>
        <Sparkles className={cn("shrink-0 text-primary", compact ? "size-6" : "mt-0.5 size-7")} strokeWidth={1.7} />
        <div className="min-w-0 flex-1">
          <h2 className={cn("leading-tight font-bold tracking-tight", compact ? "text-base" : "text-lg")}>Project AI Assistant</h2>
          <p className={cn("truncate text-muted-foreground", compact ? "text-[0.8rem]" : "text-sm")}>Ask questions about your SiteWatch project data.</p>
        </div>
        <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent font-semibold text-accent-foreground",
          compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs")}>
          <Layers className="size-3.5" /> Agentic RAG
        </span>
        {compact && (
          <Link href="/assistant" className="hidden shrink-0 items-center gap-0.5 text-[0.8rem] font-semibold text-primary hover:underline sm:inline-flex"
            data-testid="open-assistant">
            Open <ChevronRight className="size-3.5" />
          </Link>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label="How the assistant works" className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground">
              <Info className="size-[1.15rem]" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            Answers come from read-only tools over readings.csv and thresholds.json and from a search of the project
            docs, with sources. The data is static, not live. Unrelated questions are declined.
          </TooltipContent>
        </Tooltip>
        {messages.length > 0 && (
          <button type="button" onClick={clear} aria-label="Clear conversation" className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground">
            <Trash2 className="size-[1.1rem]" />
          </button>
        )}
      </div>

      <div ref={logRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-2" data-testid="chat-log" aria-live="polite">
        {notConfigured && <SetupNotice message={status.message} provider={status.provider} />}
        {statusError && (
          <p role="alert" className="rounded-xl border border-exceeded-border bg-exceeded-soft/60 p-3 text-sm">{statusError}</p>
        )}
        {messages.length === 0 && !notConfigured && !statusError && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Grounded in this project&apos;s data and documentation. Try one of these:
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_PROMPTS.map((p) => (
                <button key={p} type="button" disabled={disabled} onClick={() => submit(p)}
                  className="rounded-full border bg-card px-3 py-1.5 text-left text-xs font-medium transition-colors hover:border-primary/40 hover:bg-accent disabled:opacity-50">
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => <Message key={m.id} message={m} onRetry={retry} />)}
        {pending && (
          <div className="flex items-center gap-3" data-testid="chat-pending">
            <AssistantAvatar />
            <span className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-muted/80 px-4 py-3 text-sm text-muted-foreground">
              <span className="flex gap-1">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="size-1.5 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: `${d}ms` }} />
                ))}
              </span>
              Checking the project data…
            </span>
          </div>
        )}
      </div>

      <form className="px-5 pt-3 pb-5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="flex items-end gap-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            maxLength={2000}
            rows={1}
            autoFocus={autoFocus}
            disabled={!!notConfigured}
            placeholder={notConfigured ? "Configure an AI key to start chatting" : "Ask a question about your sites, sensors, or alerts…"}
            aria-label="Message SiteWatch AI"
            className="max-h-28 min-h-12 flex-1 resize-none rounded-xl border bg-card px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 disabled:opacity-60"
          />
          <button type="submit" disabled={disabled || !draft.trim()} aria-label="Send message"
            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#3b82f6] text-white shadow-[0_6px_16px_-6px_rgb(59_130_246/0.8)] transition-colors hover:bg-[#2563eb] disabled:opacity-50 disabled:shadow-none">
            <SendHorizontal className="size-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
