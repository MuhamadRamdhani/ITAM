"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet } from "../lib/api";
import { SkeletonTableRow, ErrorState } from "../lib/loadingComponents";

type MeData = {
  tenant_id: number;
  user_id: number;
  roles: string[];
  identity_id: number | null;
};

type UiConfig = {
  page_size_options: number[];
  documents_page_size_default: number;
};

type ConfigItem = {
  code: string;
  label: string;
};

type AssetItem = {
  id: number | string;
  asset_tag: string;
  name: string;
  asset_type?: { code: string; label: string } | null;
  state?: { code: string; label: string } | null;
};

type AssetsListData = {
  total: number;
  items: AssetItem[];
  page: number;
  page_size: number;
};

function pickInt(value: string | null, fallback: number) {
  const n = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return fallback;
  return n;
}

function buildAssetsHref(params: {
  q: string;
  type_code: string;
  state_code: string;
  page?: number;
  pageSize?: number;
}) {
  const p = new URLSearchParams();
  if (params.q) p.set("q", params.q);
  if (params.type_code) p.set("type_code", params.type_code);
  if (params.state_code) p.set("state_code", params.state_code);
  if (params.pageSize && params.pageSize > 0) p.set("page_size", String(params.pageSize));
  if (params.page && params.page > 0) p.set("page", String(params.page));
  const qs = p.toString();
  return qs ? `/assets?${qs}` : "/assets";
}

export default function AssetsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [meLoading, setMeLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);

  const [pageSizeOptions, setPageSizeOptions] = useState<number[]>([]);
  const [pageSizeDefault, setPageSizeDefault] = useState<number>(10);

  const [assetTypesItems, setAssetTypesItems] = useState<ConfigItem[]>([]);
  const [statesItems, setStatesItems] = useState<ConfigItem[]>([]);

  const [data, setData] = useState<AssetsListData>({
    total: 0,
    items: [],
    page: 1,
    page_size: 10,
  });

  const [qInput, setQInput] = useState("");
  const [typeCodeInput, setTypeCodeInput] = useState("");
  const [stateCodeInput, setStateCodeInput] = useState("");
  const [pageSizeInput, setPageSizeInput] = useState("10");

  const [err, setErr] = useState<string | null>(null);

  const q = searchParams.get("q")?.trim() || "";
  const type_code = searchParams.get("type_code")?.trim() || "";
  const state_code = searchParams.get("state_code")?.trim() || "";
  const page = pickInt(searchParams.get("page"), 1);

  const pageSize = useMemo(() => {
    const candidate = pickInt(searchParams.get("page_size"), pageSizeDefault);
    return pageSizeOptions.includes(candidate) ? candidate : pageSizeDefault;
  }, [searchParams, pageSizeDefault, pageSizeOptions]);

  const total = Number(data.total ?? 0);
  const items = Array.isArray(data.items) ? data.items : [];
  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  useEffect(() => {
    setQInput(q);
    setTypeCodeInput(type_code);
    setStateCodeInput(state_code);
    setPageSizeInput(String(pageSize));
  }, [q, type_code, state_code, pageSize]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setErr(null);
      setMeLoading(true);
      setConfigLoading(true);

      try {
        await apiGet<MeData>("/api/v1/auth/me");
        if (cancelled) return;

        const [cfgRes, assetTypesRes, statesRes] = await Promise.all([
          apiGet<UiConfig>("/api/v1/config/ui"),
          apiGet<any>("/api/v1/config/asset-types"),
          apiGet<any>("/api/v1/config/lifecycle-states"),
        ]);

        if (cancelled) return;

        const cfg = cfgRes.data;
        const options = Array.isArray(cfg?.page_size_options)
          ? cfg.page_size_options
              .map((x) => Number(x))
              .filter((n) => Number.isFinite(n) && n > 0)
          : [];

        const def = Number(cfg?.documents_page_size_default);
        const nextDefault = options.includes(def) ? def : options[0] || 10;

        setPageSizeOptions(options);
        setPageSizeDefault(nextDefault);

        const assetTypes: ConfigItem[] =
          (assetTypesRes as any)?.data?.items ??
          (assetTypesRes as any)?.data?.data?.items ??
          (assetTypesRes as any)?.data?.data ??
          [];

        const states: ConfigItem[] =
          (statesRes as any)?.data?.items ??
          (statesRes as any)?.data?.data?.items ??
          (statesRes as any)?.data?.data ??
          [];

        setAssetTypesItems(Array.isArray(assetTypes) ? assetTypes : []);
        setStatesItems(Array.isArray(states) ? states : []);
      } catch (eAny: any) {
        if (
          eAny?.code === "AUTH_REQUIRED" ||
          eAny?.code === "AUTH_UNAUTHORIZED" ||
          eAny?.http_status === 401
        ) {
          router.replace("/login");
          router.refresh();
          return;
        }
        setErr(eAny?.message || "Failed to initialize assets page");
      } finally {
        if (!cancelled) {
          setMeLoading(false);
          setConfigLoading(false);
        }
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function loadAssets() {
      if (meLoading || configLoading) return;
      if (!pageSize) return;

      setListLoading(true);
      setErr(null);

      try {
        const qs = new URLSearchParams();
        if (q) qs.set("q", q);
        if (type_code) qs.set("type_code", type_code);
        if (state_code) qs.set("state_code", state_code);
        qs.set("page", String(page));
        qs.set("page_size", String(pageSize));

        const res = await apiGet<any>(`/api/v1/assets?${qs.toString()}`);
        if (cancelled) return;

        const out: AssetsListData =
          (res as any)?.data?.data ??
          (res as any)?.data ?? {
            total: 0,
            items: [],
            page,
            page_size: pageSize,
          };

        setData({
          total: Number(out.total ?? 0),
          items: Array.isArray(out.items) ? out.items : [],
          page: Number(out.page ?? page),
          page_size: Number(out.page_size ?? pageSize),
        });
      } catch (eAny: any) {
        if (
          eAny?.code === "AUTH_REQUIRED" ||
          eAny?.code === "AUTH_UNAUTHORIZED" ||
          eAny?.http_status === 401
        ) {
          router.replace("/login");
          router.refresh();
          return;
        }

        if (eAny?.code === "INVALID_PAGE_SIZE") {
          setErr("Page size tidak valid menurut config server.");
          return;
        }

        setErr(eAny?.message || "Failed to load assets");
      } finally {
        if (!cancelled) setListLoading(false);
      }
    }

    loadAssets();
    return () => {
      cancelled = true;
    };
  }, [meLoading, configLoading, q, type_code, state_code, page, pageSize, router]);

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();

    const nextHref = buildAssetsHref({
      q: qInput.trim(),
      type_code: typeCodeInput.trim(),
      state_code: stateCodeInput.trim(),
      page: 1,
      pageSize: Number(pageSizeInput),
    });

    router.push(nextHref);
  }

  if (meLoading || configLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm text-sm text-gray-600">
        Loading assets...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {err ? (
        <ErrorState
          error={err}
          onRetry={() => {
            // Trigger refetch by simulating route change
            window.location.reload();
          }}
        />
      ) : null}

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <form
          className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"
          onSubmit={onSearchSubmit}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={typeCodeInput}
              onChange={(e) => setTypeCodeInput(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="">All types</option>
              {assetTypesItems.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label} ({t.code})
                </option>
              ))}
            </select>

            <select
              value={stateCodeInput}
              onChange={(e) => setStateCodeInput(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="">All states</option>
              {statesItems.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label} ({s.code})
                </option>
              ))}
            </select>

            <select
              value={pageSizeInput}
              onChange={(e) => setPageSizeInput(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={String(n)}>
                  {n} / page
                </option>
              ))}
            </select>

            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search tag/name..."
              className="w-full rounded-md border px-3 py-2 text-sm sm:w-72"
            />

            <button className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">
              Search
            </button>
          </div>
        </form>

        <div className="mt-4 text-sm text-gray-500">Total: {total}</div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-2 pr-4">Asset Tag</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">State</th>
                <th className="py-2 pr-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                // Skeleton loading - 3 placeholder rows
                <>
                  <SkeletonTableRow cols={5} />
                  <SkeletonTableRow cols={5} />
                  <SkeletonTableRow cols={5} />
                </>
              ) : items.length === 0 ? (
                <tr className="border-t">
                  <td colSpan={5} className="py-6 text-gray-600">
                    Tidak ada assets.
                  </td>
                </tr>
              ) : (
                items.map((a) => (
                  <tr key={String(a.id)} className="border-t">
                    <td className="py-2 pr-4 font-mono text-xs">
                      <Link
                        className="text-blue-700 hover:underline"
                        href={`/assets/${a.id}`}
                      >
                        {a.asset_tag}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{a.name}</td>
                    <td className="py-2 pr-4">
                      {a.asset_type?.label
                        ? `${a.asset_type.label} (${a.asset_type.code})`
                        : "-"}
                    </td>
                    <td className="py-2 pr-4">
                      {a.state?.label
                        ? `${a.state.label} (${a.state.code})`
                        : "-"}
                    </td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">
                      <Link
                        className="text-blue-700 hover:underline"
                        href={`/assets/${a.id}`}
                      >
                        View
                      </Link>
                      <span className="mx-2 text-gray-300">|</span>
                      <Link
                        className="text-blue-700 hover:underline"
                        href={`/assets/${a.id}/edit`}
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-500">
            Page {page} / {totalPages} (page_size: {pageSize})
          </div>

          <div className="flex gap-2">
            {canPrev ? (
              <Link
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                href={buildAssetsHref({
                  q,
                  type_code,
                  state_code,
                  page: page - 1,
                  pageSize,
                })}
              >
                Prev
              </Link>
            ) : (
              <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                Prev
              </span>
            )}

            {canNext ? (
              <Link
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                href={buildAssetsHref({
                  q,
                  type_code,
                  state_code,
                  page: page + 1,
                  pageSize,
                })}
              >
                Next
              </Link>
            ) : (
              <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                Next
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 text-xs text-gray-500">
          Tip: filter type/state diambil dari config master (tenant scoped).
        </div>
      </div>
    </div>
  );
}