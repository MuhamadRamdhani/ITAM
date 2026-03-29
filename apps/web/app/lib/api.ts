import { authDebug } from "./authDebug";

export type ApiOk<T> = { ok: true; data: T; meta?: { request_id?: string } };

export type ApiErr = {
  ok: false;
  error: { code: string; message: string; details?: any };
  meta?: { request_id?: string };
};

export type FetchOptions = RequestInit & {
  /** Loading key untuk track di GlobalLoadingContext (e.g., 'assets_list') */
  loadingKey?: string;
  /** AbortSignal untuk cancel request (e.g., saat component unmount) */
  signal?: AbortSignal;
  /** Delay sebelum notify loading, prevents flicker (ms) */
  loadingDelay?: number;
};

let refreshInFlight: Promise<boolean> | null = null;

function mustBase() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
  return base.replace(/\/+$/, "");
}

async function readJson<T>(res: Response): Promise<ApiOk<T> | ApiErr | null> {
  try {
    const json = (await res.json()) as ApiOk<T> | ApiErr;
    return json;
  } catch {
    return null;
  }
}

function throwIfErr<T>(res: Response, json: ApiOk<T> | ApiErr | null): ApiOk<T> {
  const isErr = !res.ok || (json && (json as { ok?: unknown }).ok === false);
  if (!isErr) return json as ApiOk<T>;

  const err = (json as ApiErr | null)?.error;
  const e: any = new Error(err?.message || `HTTP ${res.status}`);
  e.code = err?.code;
  e.details = err?.details;
  e.http_status = res.status;

  // Dispatch global event untuk session expired (401 after auto-refresh attempt)
  if (res.status === 401 && typeof window !== "undefined") {
    const event = new CustomEvent("session-expired", {
      detail: { code: err?.code || "AUTH_UNAUTHORIZED", message: e.message },
    });
    window.dispatchEvent(event);
  }

  throw e;
}

async function refreshSession(base: string): Promise<boolean> {
  if (refreshInFlight) {
    authDebug.refreshAttempt("(in-flight, waiting for previous attempt)");
    return refreshInFlight;
  }

  authDebug.refreshAttempt("Initiating refresh token exchange");

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${base}/api/v1/auth/refresh`, {
        method: "POST",
        cache: "no-store",
        credentials: "include",
      });

      if (!res.ok) {
        authDebug.refreshFailure(`HTTP ${res.status}`);
        // Dispatch event untuk refresh failed (token benar-benar expired)
        if (typeof window !== "undefined") {
          const event = new CustomEvent("session-expired", {
            detail: {
              code: "REFRESH_TOKEN_EXPIRED",
              message: "Session telah berakhir. Silakan login kembali.",
            },
          });
          window.dispatchEvent(event);
        }
        return false;
      }

      authDebug.refreshSuccess();
      return true;
    } catch (error) {
      authDebug.refreshFailure(String(error));
      if (typeof window !== "undefined") {
        const event = new CustomEvent("session-refresh-error", {
          detail: {
            code: "REFRESH_NETWORK_ERROR",
            message: "Gagal menyegarkan session. Periksa koneksi internet Anda.",
          },
        });
        window.dispatchEvent(event);
      }
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function canAttemptRefresh(path: string) {
  const noRetryPaths = ["/api/v1/auth/refresh", "/api/v1/auth/login", "/api/v1/auth/logout"];
  return !noRetryPaths.includes(path);
}

async function fetchWithAutoRefresh<T>(
  path: string,
  init: RequestInit & { loadingKey?: string; loadingDelay?: number; signal?: AbortSignal }
): Promise<{ res: Response; json: ApiOk<T> | ApiErr | null }> {
  const base = mustBase();
  const { loadingKey, loadingDelay = 300, signal } = init;
  const cleanedInit = { ...init };
  delete (cleanedInit as any).loadingKey;
  delete (cleanedInit as any).loadingDelay;

  let loadingTimeoutId: NodeJS.Timeout | null = null;
  if (typeof window !== "undefined" && loadingKey) {
    loadingTimeoutId = setTimeout(() => {
      const event = new CustomEvent("global-loading-key-change", {
        detail: { key: loadingKey, isLoading: true },
      });
      window.dispatchEvent(event);
    }, loadingDelay);
  }

  try {
    let res = await fetch(`${base}${path}`, {
      cache: "no-store",
      credentials: "include",
      ...cleanedInit,
      signal,
    });
    let json = await readJson<T>(res);

    if (res.status === 401 && canAttemptRefresh(path)) {
      authDebug.autoRetry(path, 1);
      const ok = await refreshSession(base);
      if (ok) {
        authDebug.autoRetry(`${path} (retry after refresh)`, 2);
        res = await fetch(`${base}${path}`, {
          cache: "no-store",
          credentials: "include",
          ...cleanedInit,
          signal,
        });
        json = await readJson<T>(res);
      }
    }

    return { res, json };
  } finally {
    // Clear loading indicator
    if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
    if (typeof window !== "undefined" && loadingKey) {
      const event = new CustomEvent("global-loading-key-change", {
        detail: { key: loadingKey, isLoading: false },
      });
      window.dispatchEvent(event);
    }
  }
}

export async function apiGet<T>(path: string, options?: FetchOptions): Promise<ApiOk<T>> {
  const { res, json } = await fetchWithAutoRefresh<T>(path, {
    ...options,
  });
  return throwIfErr<T>(res, json);
}

export async function apiPostJson<T>(path: string, body: any, options?: FetchOptions): Promise<ApiOk<T>> {
  const { res, json } = await fetchWithAutoRefresh<T>(path, {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(body ?? {}),
  });
  return throwIfErr<T>(res, json);
}

export async function apiPatchJson<T>(path: string, body: any, options?: FetchOptions): Promise<ApiOk<T>> {
  const { res, json } = await fetchWithAutoRefresh<T>(path, {
    ...options,
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(body ?? {}),
  });
  return throwIfErr<T>(res, json);
}

export async function apiPostForm<T>(path: string, form: FormData, options?: FetchOptions): Promise<ApiOk<T>> {
  const { res, json } = await fetchWithAutoRefresh<T>(path, {
    ...options,
    method: "POST",
    body: form,
  });
  return throwIfErr<T>(res, json);
}
