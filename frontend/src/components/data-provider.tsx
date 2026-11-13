"use client";

import { createContext, useContext } from "react";
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
    const [overview, health] = await Promise.all([api.overview(signal), api.health(signal)]);
    return { overview, health, fetchedAt: new Date() };
  });
  return (
    <DataContext.Provider value={{ ...data, error, loading, refresh: reload }}>{children}</DataContext.Provider>
  );
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>");
  return ctx;
}
