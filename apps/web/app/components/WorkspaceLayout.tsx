"use client";

import type { ReactNode } from "react";

export function WorkspacePage({ children }: { children: ReactNode }) {
  return (
    <main className="itam-page-shell">
      <div className="itam-page-shell-inner w-full min-w-0 space-y-8">{children}</div>
    </main>
  );
}

export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <section className="itam-page-card-soft w-full p-5 md:p-6 lg:p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="max-w-4xl">
          <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
            {eyebrow}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
              {description}
            </p>
          ) : null}
        </div>

        {action ? <div className="shrink-0 md:pt-1">{action}</div> : null}
      </div>
    </section>
  );
}

export function WorkspaceSection({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`itam-page-card-soft w-full p-5 md:p-6 ${className}`.trim()}>
      {children}
    </section>
  );
}

export function WorkspaceCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`itam-page-card w-full overflow-hidden ${className}`.trim()}>
      {children}
    </div>
  );
}
