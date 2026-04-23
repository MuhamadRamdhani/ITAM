"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  sidebarNavigation,
  type SidebarNavigationItem,
  type SidebarNavigationSection,
} from "./sidebarNavigation";

type AppSidebarProps = {
  onNavigate?: () => void;
};

function normalizePath(input: string) {
  return input.split("?")[0];
}

function isItemActive(pathname: string, href: string, matchPath?: string) {
  const target = normalizePath(matchPath ?? href);

  if (target === "/") {
    return pathname === "/";
  }

  return pathname === target || pathname.startsWith(`${target}/`);
}

export default function AppSidebar({ onNavigate }: AppSidebarProps) {
  const pathname = usePathname();

  const derivedOpenState = useMemo(() => {
    return Object.fromEntries(
      sidebarNavigation.map((section: SidebarNavigationSection) => {
        const hasActiveItem = section.items.some((item: SidebarNavigationItem) =>
          isItemActive(pathname, item.href, item.matchPath)
        );

        return [section.title, hasActiveItem];
      })
    ) as Record<string, boolean>;
  }, [pathname]);

  const [openSections, setOpenSections] =
    useState<Record<string, boolean>>(derivedOpenState);

  useEffect(() => {
    setOpenSections((prev) => ({
      ...prev,
      ...derivedOpenState,
    }));
  }, [derivedOpenState]);

  function toggleSection(title: string) {
    setOpenSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  }

  return (
    <aside
      className="
        flex h-full min-h-screen w-full flex-col
        border-r border-slate-200/80
        bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_22%),radial-gradient(circle_at_85%_12%,rgba(14,165,233,0.06),transparent_18%),linear-gradient(180deg,#f9fcfe_0%,#f4f9fc_45%,#eef6fb_100%)]
        text-slate-800
      "
    >
      <div className="flex h-full min-h-0 flex-col px-5 py-6">
        <div className="flex items-center gap-3 border-b border-slate-200 pb-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-500 text-xl font-bold text-white shadow-[0_14px_32px_rgba(6,182,212,0.18)]">
            C
          </div>

          <div className="min-w-0">
            <div className="text-[17px] font-bold tracking-tight text-slate-900">
              CAKKAVALA
            </div>
            <div className="mt-0.5 text-[15px] text-slate-600">ITAM Platform</div>
          </div>
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
          <nav className="flex flex-col gap-4">
            {sidebarNavigation.map((section: SidebarNavigationSection) => {
              const sectionActive = section.items.some((item: SidebarNavigationItem) =>
                isItemActive(pathname, item.href, item.matchPath)
              );

              const isOpen = openSections[section.title] ?? false;

              return (
                <div
                  key={section.title}
                  className={[
                    "w-full rounded-[22px] border transition",
                    sectionActive
                      ? "border-cyan-200 bg-white/90"
                      : "border-slate-200/80 bg-white/72",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection(section.title)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                  >
                    <span className="text-[16px] font-semibold text-slate-900">
                      {section.title}
                    </span>
                    <span
                      className={[
                        "text-xs text-slate-500 transition-transform duration-150",
                        isOpen ? "rotate-0" : "-rotate-90",
                      ].join(" ")}
                      aria-hidden="true"
                    >
                      ▾
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="flex flex-col gap-1 px-3 pb-3">
                      {section.items.map((item: SidebarNavigationItem) => {
                        const active = isItemActive(pathname, item.href, item.matchPath);

                        return (
                          <Link
                            key={`${section.title}-${item.label}`}
                            href={item.href}
                            onClick={onNavigate}
                            className={[
                              "group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-[15px] font-medium transition",
                              active
                                ? "bg-cyan-50 text-slate-900"
                                : "text-slate-700 hover:bg-slate-50 hover:text-slate-900",
                            ].join(" ")}
                          >
                            <span
                              className={[
                                "h-2.5 w-2.5 flex-shrink-0 rounded-full transition",
                                active ? "bg-cyan-500" : "bg-slate-300",
                              ].join(" ")}
                              aria-hidden="true"
                            />
                            <span className="leading-6">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="mt-5 border-t border-slate-200 pt-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-700">
            Enterprise Workspace
          </div>
          <div className="mt-2 text-[14px] leading-7 text-slate-600">
            IT Asset Management dashboard and module navigation.
          </div>
        </div>
      </div>
    </aside>
  );
}