"use client";

import { useState } from "react";
import AppSidebar from "./AppSidebar";

type AppShellProps = {
  children: React.ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  function closeMobileSidebar() {
    setMobileOpen(false);
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef6fb_100%)]">
      <div className="min-h-screen lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <div className="sticky top-0 h-screen">
            <AppSidebar />
          </div>
        </div>

        <div className="min-w-0">
          <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200/80 bg-slate-50/90 px-4 py-4 backdrop-blur lg:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="inline-flex flex-col justify-center gap-1 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
            >
              <span className="block h-0.5 w-5 rounded-full bg-slate-700" />
              <span className="block h-0.5 w-5 rounded-full bg-slate-700" />
              <span className="block h-0.5 w-5 rounded-full bg-slate-700" />
            </button>

            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-sky-500 text-sm font-bold text-white shadow-[0_12px_28px_rgba(6,182,212,0.20)]">
                C
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900">CAKKAVALA</div>
                <div className="text-xs text-slate-500">ITAM Platform</div>
              </div>
            </div>
          </div>

          <div className="px-4 py-4 lg:px-8 lg:py-7">
            <div className="mx-auto w-full max-w-[1180px]">
              {children}
            </div>
          </div>
        </div>

        {mobileOpen ? (
          <>
            <button
              type="button"
              onClick={closeMobileSidebar}
              aria-label="Close navigation"
              className="fixed inset-0 z-[70] bg-slate-950/50 lg:hidden"
            />
            <div className="fixed inset-y-0 left-0 z-[80] w-[min(296px,88vw)] lg:hidden">
              <AppSidebar onNavigate={closeMobileSidebar} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}