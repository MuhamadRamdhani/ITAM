"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Item = { code: string; label: string };

function useDebounce<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function AssetsFilters({
  assetTypes,
  states,
}: {
  assetTypes: Item[];
  states: Item[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const current = useMemo(() => {
    return {
      q: (sp.get("q") ?? "").trim(),
      type_code: (sp.get("type_code") ?? "").trim(),
      state_code: (sp.get("state_code") ?? "").trim(),
      page: (sp.get("page") ?? "1").trim(),
      page_size: (sp.get("page_size") ?? "20").trim(),
    };
  }, [sp]);

  const [q, setQ] = useState(current.q);
  const [typeCode, setTypeCode] = useState(current.type_code);
  const [stateCode, setStateCode] = useState(current.state_code);

  // keep inputs synced on back/forward
  useEffect(() => setQ(current.q), [current.q]);
  useEffect(() => setTypeCode(current.type_code), [current.type_code]);
  useEffect(() => setStateCode(current.state_code), [current.state_code]);

  const qDebounced = useDebounce(q, 400);

  function buildUrl(next: Partial<typeof current>) {
    const params = new URLSearchParams(sp.toString());
    const merged = { ...current, ...next };

    // kalau filter/search berubah => reset page=1
    if (
      next.q !== undefined ||
      next.type_code !== undefined ||
      next.state_code !== undefined
    ) {
      merged.page = "1";
    }

    const setOrDelete = (key: string, val: string) => {
      const v = (val ?? "").trim();
      if (!v) params.delete(key);
      else params.set(key, v);
    };

    setOrDelete("q", merged.q);
    setOrDelete("type_code", merged.type_code);
    setOrDelete("state_code", merged.state_code);
    setOrDelete("page", merged.page);
    setOrDelete("page_size", merged.page_size);

    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  // apply search (debounced)
  useEffect(() => {
    router.replace(buildUrl({ q: qDebounced }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDebounced]);

  function onChangeType(v: string) {
    setTypeCode(v);
    router.replace(buildUrl({ type_code: v }));
  }

  function onChangeState(v: string) {
    setStateCode(v);
    router.replace(buildUrl({ state_code: v }));
  }

  function clearAll() {
    setQ("");
    setTypeCode("");
    setStateCode("");
    router.replace(pathname);
  }

  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-1 flex-col gap-3 md:flex-row">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">
              Search
            </label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari asset tag atau nama…"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="min-w-[220px]">
            <label className="block text-sm font-medium text-gray-700">
              Asset Type
            </label>
            <select
              value={typeCode}
              onChange={(e) => onChangeType(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All</option>
              {assetTypes.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label} ({t.code})
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[240px]">
            <label className="block text-sm font-medium text-gray-700">
              Lifecycle State
            </label>
            <select
              value={stateCode}
              onChange={(e) => onChangeState(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All</option>
              {states.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label} ({s.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <Link
            href="/assets/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + New Asset
          </Link>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="mt-2 text-xs text-gray-500">
        Filter tersimpan di URL (bisa di-copy/share).
      </div>
    </div>
  );
}