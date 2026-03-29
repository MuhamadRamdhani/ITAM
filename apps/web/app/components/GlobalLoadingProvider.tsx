"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

type GlobalLoadingContextValue = {
  // Existing API (backward compatible)
  visible: boolean;
  message: string;
  show: (message?: string) => void;
  hide: () => void;
  
  // New: Per-key loading state (untuk track multiple concurrent requests)
  loadingKeys: Set<string>;
  setLoadingKey: (key: string, isLoading: boolean) => void;
  isLoadingKey: (key: string) => boolean;
  isAnyLoading: () => boolean;
};

const GlobalLoadingContext = createContext<GlobalLoadingContextValue | null>(
  null
);

export default function GlobalLoadingProvider(props: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("Loading...");
  
  // New: Per-key loading tracking (untuk track list, detail, action separately)
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());

  const show = useCallback((nextMessage?: string) => {
    setMessage(nextMessage?.trim() || "Loading...");
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    setVisible(false);
    setMessage("Loading...");
  }, []);
  
  // New: Set/unset loading key
  const setLoadingKey = useCallback((key: string, isLoading: boolean) => {
    setLoadingKeys((prev) => {
      const next = new Set(prev);
      if (isLoading) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);
  
  // New: Check jika key tertentu loading
  const isLoadingKey = useCallback((key: string) => {
    return loadingKeys.has(key);
  }, [loadingKeys]);
  
  // New: Check jika ada key yang loading
  const isAnyLoading = useCallback(() => {
    return loadingKeys.size > 0;
  }, [loadingKeys]);

  // Listen untuk loading key changes dari api.ts
  useEffect(() => {
    const handleLoadingKeyChange = (event: Event) => {
      if (event instanceof CustomEvent) {
        const { key, isLoading } = event.detail;
        setLoadingKey(key, isLoading);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("global-loading-key-change", handleLoadingKeyChange);
      return () => {
        window.removeEventListener("global-loading-key-change", handleLoadingKeyChange);
      };
    }
  }, [setLoadingKey]);

  // Auto-hide global overlay saat route change
  useEffect(() => {
    hide();
  }, [pathname, searchParams, hide]);

  const value = useMemo(
    () => ({
      visible,
      message,
      show,
      hide,
      loadingKeys,
      setLoadingKey,
      isLoadingKey,
      isAnyLoading,
    }),
    [visible, message, show, hide, loadingKeys, setLoadingKey, isLoadingKey, isAnyLoading]
  );

  return (
    <GlobalLoadingContext.Provider value={value}>
      {props.children}
      <GlobalLoadingOverlay visible={visible} message={message} />
    </GlobalLoadingContext.Provider>
  );
}

export function useGlobalLoading() {
  const ctx = useContext(GlobalLoadingContext);
  if (!ctx) {
    throw new Error("useGlobalLoading must be used within GlobalLoadingProvider");
  }
  return ctx;
}

/**
 * Hook untuk track specific loading key (e.g., 'assets_list', 'approval_detail')
 * Useful untuk component-level loading indicators
 */
export function useIsLoading(key: string): boolean {
  const ctx = useContext(GlobalLoadingContext);
  if (!ctx) {
    throw new Error("useIsLoading must be used within GlobalLoadingProvider");
  }
  return ctx.isLoadingKey(key);
}

/**
 * Hook untuk check jika ada request yang sedang berlangsung
 */
export function useIsAnyLoading(): boolean {
  const ctx = useContext(GlobalLoadingContext);
  if (!ctx) {
    throw new Error("useIsAnyLoading must be used within GlobalLoadingProvider");
  }
  return ctx.isAnyLoading();
}

function GlobalLoadingOverlay(props: { visible: boolean; message: string }) {
  if (!props.visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="min-w-[240px] rounded-xl bg-white px-6 py-5 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          <div>
            <div className="text-sm font-semibold text-gray-900">
              Please wait
            </div>
            <div className="text-sm text-gray-600">{props.message}</div>
          </div>
        </div>
      </div>
    </div>
  );
}