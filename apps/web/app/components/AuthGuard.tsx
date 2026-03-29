"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useGlobalLoading } from "./GlobalLoadingProvider";

/**
 * AuthGuard Component
 * Mendengarkan event session-expired dan redirect ke login
 * Juga menampilkan toast notification untuk user
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { show, hide } = useGlobalLoading();

  useEffect(() => {
    // Handler untuk session expired event
    const handleSessionExpired = (event: any) => {
      const { code, message } = event.detail || {};

      console.warn("[AuthGuard] Session expired:", { code, message });

      // Jangan redirect jika sudah di login page
      if (pathname === "/login") {
        return;
      }

      // Show loading message
      show(`Session telah berakhir. Redirect ke login...`);

      // Delay sedikit untuk user bisa lihat message
      setTimeout(() => {
        hide();
        // Redirect ke login
        router.push("/login");
      }, 1500);
    };

    // Handler untuk refresh network error
    const handleRefreshError = (event: any) => {
      const { code, message } = event.detail || {};

      console.error("[AuthGuard] Refresh error:", { code, message });

      // Tampilkan pesan error tapi jangan langsung logout
      // User bisa retry dengan aksi yang sama
      show(message || "Network error saat menyegarkan session");

      setTimeout(() => {
        hide();
      }, 3000);
    };

    // Subscribe ke events
    window.addEventListener("session-expired", handleSessionExpired);
    window.addEventListener("session-refresh-error", handleRefreshError);

    return () => {
      window.removeEventListener("session-expired", handleSessionExpired);
      window.removeEventListener("session-refresh-error", handleRefreshError);
    };
  }, [pathname, router, show, hide]);

  return <>{children}</>;
}
