"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { api, toApiError } from "@/lib/api";
import type { ChatResponse, ChatStatus, ChatTurn } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: ChatResponse;
  error?: string;
}

interface ChatContextValue {
  messages: UIMessage[];
  pending: boolean;
  status?: ChatStatus;
  statusError?: string;
  send: (text: string) => void;
  retry: () => void;
  clear: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);
const MAX_HISTORY = 20;
let counter = 0;
const nextId = () => `m${Date.now()}-${counter++}`;

/** Holds the conversation for this browser session, shared by the floating panel and the AI page. */
export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [pending, setPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { data: status, error: statusErr } = useApi("chat-status", (signal) => api.chatStatus(signal));

  const ask = useCallback(async (history: UIMessage[]) => {
    // Send only successful turns, oldest first, starting with a user turn.
    let turns: ChatTurn[] = history.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    turns = turns.slice(-MAX_HISTORY);
    while (turns.length && turns[0].role !== "user") turns = turns.slice(1);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);
    try {
      const response = await api.chat(turns, controller.signal);
      setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: response.answer, response }]);
    } catch (err) {
      if (controller.signal.aborted) return;
      const e = toApiError(err);
      setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: "", error: e.message }]);
    } finally {
      if (abortRef.current === controller) setPending(false);
    }
  }, []);

  const send = useCallback((text: string) => {
    const content = text.trim().slice(0, 2000);
    if (!content || pending) return;
    const next = [...messages, { id: nextId(), role: "user" as const, content }];
    setMessages(next);
    void ask(next);
  }, [ask, messages, pending]);

  const retry = useCallback(() => {
    if (pending) return;
    const withoutErrors = messages.filter((m) => !m.error);
    if (!withoutErrors.length || withoutErrors[withoutErrors.length - 1].role !== "user") return;
    setMessages(withoutErrors);
    void ask(withoutErrors);
  }, [ask, messages, pending]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setPending(false);
    setMessages([]);
  }, []);

  return (
    <ChatContext.Provider value={{ messages, pending, status, statusError: statusErr?.message, send, retry, clear }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}
