"use client";

import { useGlobalLoading } from "./GlobalLoadingProvider";

export function useGlobalLoadingAction() {
  const { show, hide, setLoadingKey } = useGlobalLoading();

  /**
   * Run async action dengan global overlay loading
   * @param action - Function yang akan dijalankan
   * @param message - Loading message (optional)
   * @param loadingDelay - Delay sebelum tampilkan loading (defalt: instant)
   */
  async function runWithLoading<T>(
    action: () => Promise<T>,
    message?: string,
    loadingDelay?: number
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | null = null;

    try {
      // Setup timeout untuk delay loading indicator (prevent flicker)
      if (loadingDelay && loadingDelay > 0) {
        timeoutId = setTimeout(() => {
          show(message || "Loading...");
        }, loadingDelay);
      } else {
        show(message || "Loading...");
      }

      return await action();
    } catch (err) {
      hide();
      throw err;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      hide();
    }
  }

  /**
   * Run action dengan per-key loading state (untuk component-level loading)
   * @param key - Unique identifier untuk loading state (e.g., 'asset_create', 'approval_approve')
   * @param action - Function yang akan dijalankan
   */
  async function runWithKeyLoading<T>(
    key: string,
    action: () => Promise<T>
  ): Promise<T> {
    setLoadingKey(key, true);

    try {
      return await action();
    } catch (err) {
      throw err;
    } finally {
      setLoadingKey(key, false);
    }
  }

  return {
    show,
    hide,
    setLoadingKey,
    runWithLoading,
    runWithKeyLoading,
  };
}