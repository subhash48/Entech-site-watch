"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, toApiError } from "./api";

interface Result<T> {
  key: string;
  data?: T;
  error?: ApiError;
}

/**
 * Fetch data for a key. Changing the key refetches; `reload()` refetches the same key.
 * While a refetch is in flight the previous data stays visible (`loading` is true).
 * Pass `null` as the key to skip fetching.
 */
export function useApi<T>(key: string | null, fetcher: (signal: AbortSignal) => Promise<T>) {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<Result<T>>();
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const fullKey = key === null ? null : `${key}#${nonce}`;
  useEffect(() => {
    if (fullKey === null) return;
    const controller = new AbortController();
    fetcherRef.current(controller.signal).then(
      (data) => setResult({ key: fullKey, data }),
      (err) => {
        if (!controller.signal.aborted) setResult({ key: fullKey, error: toApiError(err) });
      },
    );
    return () => controller.abort();
  }, [fullKey]);

  const current = result?.key === fullKey ? result : undefined;
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return {
    data: current ? current.data : result?.data,
    error: current?.error,
    loading: fullKey !== null && !current,
    reload,
  };
}
