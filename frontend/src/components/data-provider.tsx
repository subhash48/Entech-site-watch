"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { api, type ApiError } from "@/lib/api";
import type { Health, Overview } from "@/lib/types";
import { useApi } from "@/lib/use-api";

interface DataContextValue {
  overview?: Overview;
  health?: Health;
  fetchedAt?: Date;
  error?: ApiError;
  loading: boolean;
  refresh: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

/** Loads /api/overview and /health once and shares them with the header, sidebar and pages. */
export function DataProvider({ children }: { children: React.ReactNode }) {
  const { data, error, loading, reload } = useApi("overview", async (signal) => {
    const [overview, health] = await Promise.all([api.overview({}, signal), api.health(signal)]);
    return { overview, health, fetchedAt: new Date() };
  });
  // Another administrator (or tab) may activate a different dataset version: re-check when this tab
  // becomes visible again, at most once every 30 seconds.
  const last = useRef(0);
  useEffect(() => {
    last.current = Date.now();
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current > 30_000) {
        last.current = Date.now();
        reload();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);
  return (
    <DataContext.Provider value={{ ...data, error, loading, refresh: reload }}>{children}</DataContext.Provider>
  );
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>");
  return ctx;
}
