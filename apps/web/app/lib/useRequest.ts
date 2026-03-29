"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { apiGet, FetchOptions } from "./api";
import { useIsLoading } from "../components/GlobalLoadingProvider";

export type UseRequestOptions = FetchOptions & {
  /** Auto-fetch saat mount? default: true */
  autoFetch?: boolean;
  /** Dependencies untuk refetch otomatis */
  deps?: any[];
};

export type UseRequestResult<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

/**
 * Hook untuk fetch data dengan integrated loading state
 * Loading state di-track di GlobalLoadingContext
 *
 * Contoh:
 * const { data, loading, error, refetch } = useRequest(
 *   '/api/v1/assets',
 *   { loadingKey: 'assets_list', deps: [] }
 * );
 */
export function useRequest<T = any>(
  endpoint: string,
  options: UseRequestOptions = {}
): UseRequestResult<T> {
  const {
    autoFetch = true,
    deps = [endpoint],
    loadingKey = endpoint,
    ...apiOptions
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Get loading state dari context
  const contextLoading = useIsLoading(loadingKey as string);

  const fetchData = useCallback(async () => {
    if (!isMountedRef.current) return;

    // Cancel previous request jika ada
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    setError(null);

    try {
      const response = await apiGet<T>(endpoint, {
        ...apiOptions,
        loadingKey: loadingKey as string,
        signal: abortControllerRef.current.signal,
      });

      if (!isMountedRef.current) return;

      if (response.ok && response.data) {
        setData(response.data);
        setError(null);
      }
    } catch (err) {
      if (!isMountedRef.current) return;

      // Ignore abort errors (user navigated away)
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      setData(null);
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
    }
  }, [endpoint, apiOptions, loadingKey]);

  useEffect(() => {
    if (autoFetch) {
      fetchData();
    }
  }, deps);

  // Cleanup: abort request saat unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    data,
    loading: contextLoading,
    error,
    refetch: fetchData,
  };
}

/**
 * Hook untuk mutation (POST/PATCH/DELETE)
 *
 * Contoh:
 * const { mutate, loading, error } = useMutation('/api/v1/assets', 'POST', { loadingKey: 'create_asset' });
 * const result = await mutate({ name: 'New Asset' });
 */
export type UseMutationResult<T> = {
  mutate: (body?: any) => Promise<{ ok: boolean; data?: T; error?: string }>;
  loading: boolean;
  error: string | null;
  reset: () => void;
};

export function useMutation<T = any>(
  endpoint: string,
  method: "POST" | "PATCH" | "DELETE" = "POST",
  options: FetchOptions = {}
): UseMutationResult<T> {
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { loadingKey = endpoint, ...restOptions } = options;

  const contextLoading = useIsLoading(loadingKey as string);

  const mutate = useCallback(
    async (body?: any) => {
      // Cancel previous request jika ada
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      setError(null);

      try {
        let response;

        if (method === "POST") {
          const { apiPostJson } = await import("./api");
          response = await apiPostJson<T>(endpoint, body || {}, {
            ...restOptions,
            loadingKey: loadingKey as string,
            signal: abortControllerRef.current.signal,
          });
        } else if (method === "PATCH") {
          const { apiPatchJson } = await import("./api");
          response = await apiPatchJson<T>(endpoint, body || {}, {
            ...restOptions,
            loadingKey: loadingKey as string,
            signal: abortControllerRef.current.signal,
          });
        } else if (method === "DELETE") {
          const { apiGet } = await import("./api");
          response = await apiGet<T>(endpoint, {
            ...restOptions,
            loadingKey: loadingKey as string,
            signal: abortControllerRef.current.signal,
          } as any);
        }

        if (!isMountedRef.current) {
          return { ok: false, error: "Component unmounted" };
        }

        if (response?.ok && response?.data) {
          setError(null);
          return { ok: true, data: response.data };
        }

        const errorMsg = "Request failed";
        setError(errorMsg);
        return { ok: false, error: errorMsg };
      } catch (err) {
        if (!isMountedRef.current) return { ok: false, error: "Component unmounted" };

        // Ignore abort errors
        if (err instanceof Error && err.name === "AbortError") {
          return { ok: false, error: "Request cancelled" };
        }

        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        return { ok: false, error: errorMessage };
      }
    },
    [endpoint, method, restOptions, loadingKey]
  );

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    mutate,
    loading: contextLoading,
    error,
    reset: () => setError(null),
  };
}
