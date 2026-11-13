"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Database, FileText, KeyRound, RotateCcw, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Markdown } from "@/components/chat/markdown";
import { useChat, type UIMessage } from "@/components/chat/chat-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const SUGGESTED_PROMPTS = [
  "Which sites exceeded their limits?",
  "What was the highest vibration reading?",
  "Show all noise exceedances.",
  "Which sensors have missing data?",
  "Summarize the monitoring results for a client.",
];

function SetupNotice({ message }: { message: string }) {
  return (
    <div data-testid="ai-setup" className="m-4 space-y-3 rounded-lg border border-missing-border bg-missing-soft/60 p-4 text-sm">
      <div className="flex items-center gap-2 font-semibold">
        <KeyRound className="size-4 text-missing" /> SiteWatch AI is not configured
      </div>
      <p className="text-muted-foreground">{message}</p>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>Copy <code className="font-mono text-xs">backend/.env.example</code> to <code className="font-mono text-xs">backend/.env</code>.</li>
        <li>Set <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> to your Anthropic API key.</li>
        <li>Restart the backend, then reload this page.</li>
      </ol>
      <p className="text-xs text-muted-foreground">The key stays on the server. The browser never receives it. The rest of the dashboard works without it.</p>
    </div>
  );
}

function Sources({ message }: { message: UIMessage }) {
  const sources = message.response?.sources ?? [];
  if (!sources.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Sources">
      {sources.map((s) => (
        <span key={`${s.type}:${s.name}`} className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {s.type === "data" ? <Database className="size-3 shrink-0" /> : <FileText className="size-3 shrink-0" />}
          <span className="truncate">{s.name}</span>
        </span>
      ))}
    </div>
  );
}

function Bubble({ message, onRetry }: { message: UIMessage; onRetry: () => void }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }
  if (message.error) {
    return (
      <div role="alert" className="flex items-start gap-2 rounded-lg border border-exceeded-border bg-exceeded-soft/60 p-3 text-sm">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-exceeded" />
        <div className="flex-1 space-y-2">
          <p>{message.error}</p>
          <Button size="xs" variant="outline" onClick={onRetry}><RotateCcw /> Retry</Button>
        </div>
      </div>
    );
  }
  const refused = message.response?.refused;
  return (
    <div data-testid="assistant-message" className="group space-y-1.5">
      <div className={cn("rounded-2xl rounded-bl-sm border bg-card px-3.5 py-2.5", refused && "bg-muted/40 text-muted-foreground")}>
        <Markdown>{message.content}</Markdown>
        <Sources message={message} />
      </div>
      <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
        <CopyButton text={message.content} label="Copy response" size="xs" variant="ghost" />
      </div>
    </div>
  );
}

export function ChatPanel({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const { messages, pending, status, statusError, send, retry, clear } = useChat();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const notConfigured = status && !status.configured;
  const disabled = pending || !!notConfigured || !!statusError;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending]);

  const submit = (text = draft) => {
    if (!text.trim() || disabled) return;
    send(text);
    setDraft("");
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-semibold">SiteWatch AI</p>
          <p className="truncate text-xs text-muted-foreground">Answers from this project&apos;s data and documentation</p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="icon-sm" onClick={clear} aria-label="Clear conversation">
            <Trash2 />
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="chat-log" aria-live="polite">
        {notConfigured && <SetupNotice message={status.message} />}
        {statusError && (
          <p role="alert" className="m-4 rounded-lg border border-exceeded-border bg-exceeded-soft/60 p-3 text-sm">{statusError}</p>
        )}
        {messages.length === 0 && !notConfigured && !statusError ? (
          <div className="space-y-4 p-4">
            <p className="text-sm text-muted-foreground">
              Ask about sites, readings, thresholds, exceedances, missing data, or how SiteWatch works. Answers are
              grounded in the project&apos;s files, with sources.
            </p>
            <div className="flex flex-col gap-2">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={disabled}
                  onClick={() => submit(p)}
                  className="rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            {messages.map((m) => <Bubble key={m.id} message={m} onRetry={retry} />)}
            {pending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="chat-pending">
                <span className="flex gap-1">
                  {[0, 150, 300].map((d) => (
                    <span key={d} className="size-1.5 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </span>
                Checking the project data…
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring/40">
          <Textarea
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
            placeholder={notConfigured ? "Configure an AI key to start chatting" : "Ask about sites, sensors, alerts…"}
            aria-label="Message SiteWatch AI"
            className="max-h-32 min-h-9 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Button type="submit" size="icon" disabled={disabled || !draft.trim()} aria-label="Send message">
            <ArrowUp />
          </Button>
        </div>
        <p className="px-1 pt-1.5 text-[11px] text-muted-foreground">
          Static project data. An exceedance of a configured threshold is not necessarily a regulatory violation.
        </p>
      </form>
    </div>
  );
}
