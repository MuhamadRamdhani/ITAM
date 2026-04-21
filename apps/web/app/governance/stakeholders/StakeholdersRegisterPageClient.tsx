"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { canManageGovernance } from "../../lib/governanceAccess";
import { apiGet, apiPatchJson, apiPostJson } from "../../lib/api";
import { SkeletonTableRow } from "../../lib/loadingComponents";

type StakeholderRow = {
  id: number | string;
  tenant_id: number | string;
  name: string;
  category_code: string;
  priority_code: string;
  status_code: string;
  expectations: string;
  owner_identity_id?: number | string | null;
  review_date?: string | null;
  created_by_user_id?: number | string | null;
  updated_by_user_id?: number | string | null;
  created_at: string;
  updated_at: string;
};

type StakeholdersListData = {
  items: StakeholderRow[];
  total: number;
  page: number;
  page_size: number;
};

type UiConfigNormalized = {
  pageSizeOptions: number[];
  pageSizeDefault: number;
};

type IdentityItem = {
  id: number;
  display_name: string;
};

const STATUS_OPTIONS = ["ALL", "OPEN", "MONITORING", "CLOSED"] as const;
const CATEGORY_OPTIONS = [
  "ALL",
  "INTERNAL",
  "REGULATOR",
  "VENDOR",
  "CUSTOMER",
  "PARTNER",
  "EXTERNAL",
] as const;
const PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

function pickInt(raw: string | null | undefined, fallback: number) {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return fallback;
  return n;
}

function fmtDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function statusPill(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "OPEN") return "rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-800";
  if (s === "MONITORING")
    return "rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800";
  if (s === "CLOSED") return "rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700";
  return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
}

function priorityPill(priority: string) {
  const p = String(priority || "").toUpperCase();
  if (p === "LOW") return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
  if (p === "MEDIUM") return "rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-800";
  if (p === "HIGH") return "rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800";
  if (p === "CRITICAL") return "rounded-full bg-red-50 px-2 py-1 text-xs text-red-800";
  return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
}

function getErrorMessage(error: unknown, fallback = "Failed to load stakeholders register") {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;
  const e = error as any;
  return e?.error?.message || e?.message || fallback;
}

function normalizeUiConfig(res: any): UiConfigNormalized {
  const raw = res?.data?.data ?? res?.data ?? {};
  const optionsRaw = raw?.page_size_options ?? raw?.ui?.page_size?.options ?? [];
  const pageSizeOptions = Array.isArray(optionsRaw)
    ? optionsRaw.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0)
    : [];

  const safeOptions = pageSizeOptions.length > 0 ? pageSizeOptions : [10, 20, 50];
  const defaultRaw = Number(
    raw?.documents_page_size_default ?? raw?.ui?.documents?.page_size?.default ?? safeOptions[0]
  );
  const pageSizeDefault = safeOptions.includes(defaultRaw) ? defaultRaw : safeOptions[0];

  return { pageSizeOptions: safeOptions, pageSizeDefault };
}

function normalizeStakeholdersList(res: any): StakeholdersListData {
  const raw = res?.data?.data ?? res?.data ?? {};
  return {
    items: Array.isArray(raw?.items) ? raw.items : [],
    total: Number(raw?.total ?? 0),
    page: Number(raw?.page ?? 1),
    page_size: Number(raw?.page_size ?? 10),
  };
}

function normalizeIdentities(res: any): IdentityItem[] {
  const raw = res?.data?.data ?? res?.data ?? {};
  const items = Array.isArray(raw?.items) ? raw.items : [];

  return items
    .map((row: any) => ({
      id: Number(row?.id),
      display_name: String(
        row?.display_name ?? row?.full_name ?? row?.name ?? row?.email ?? `Identity #${row?.id ?? ""}`
      ).trim(),
    }))
    .filter((row: IdentityItem) => Number.isFinite(row.id) && row.id > 0 && row.display_name);
}

function buildHref(params: {
  status: string;
  category: string;
  q: string;
  page?: number;
  pageSize?: number;
}) {
  const p = new URLSearchParams();
  if (params.status && params.status !== "ALL") p.set("status", params.status);
  if (params.category && params.category !== "ALL") p.set("category", params.category);
  if (params.q) p.set("q", params.q);
  if (params.page && params.page > 0) p.set("page", String(params.page));
  if (params.pageSize && params.pageSize > 0) p.set("page_size", String(params.pageSize));
  const qs = p.toString();
  return qs ? `/governance/stakeholders?${qs}` : "/governance/stakeholders";
}

function blankForm() {
  return {
    name: "",
    category_code: "INTERNAL",
    priority_code: "MEDIUM",
    status_code: "OPEN",
    expectations: "",
    owner_identity_id: "",
    review_date: "",
  };
}

export default function StakeholdersRegisterPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const status = (searchParams.get("status") || "ALL").trim().toUpperCase() || "ALL";
  const category = (searchParams.get("category") || "ALL").trim().toUpperCase() || "ALL";
  const q = (searchParams.get("q") || "").trim();
  const pageFromUrl = pickInt(searchParams.get("page"), 1);
  const pageSizeFromUrl = pickInt(searchParams.get("page_size"), 0);

  const currentStakeholdersHref = useMemo(() => {
    return buildHref({
      status,
      category,
      q,
      page: pageFromUrl,
      pageSize: pageSizeFromUrl > 0 ? pageSizeFromUrl : undefined,
    });
  }, [status, category, q, pageFromUrl, pageSizeFromUrl]);

  const contextHref = useMemo(() => {
    return `/governance/context?return_to=${encodeURIComponent(currentStakeholdersHref)}`;
  }, [currentStakeholdersHref]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<StakeholderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSizeOptions, setPageSizeOptions] = useState<number[]>([10, 20, 50]);
  const [pageSize, setPageSize] = useState<number>(10);
  const [identities, setIdentities] = useState<IdentityItem[]>([]);
  const [canManage, setCanManage] = useState(false);

  const [searchText, setSearchText] = useState(q);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    setSearchText(q);
  }, [q]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        const cfgRes = await apiGet<any>("/api/v1/config/ui", {
          loadingKey: "stakeholders_config",
        });
        const cfg = normalizeUiConfig(cfgRes);

        if (!active) return;

        setPageSizeOptions(cfg.pageSizeOptions);

        const effectivePageSize = cfg.pageSizeOptions.includes(pageSizeFromUrl)
          ? pageSizeFromUrl
          : cfg.pageSizeDefault;

        setPageSize(effectivePageSize);

        const qs = new URLSearchParams();
        if (status && status !== "ALL") qs.set("status", status);
        if (category && category !== "ALL") qs.set("category", category);
        if (q) qs.set("q", q);
        qs.set("page", String(pageFromUrl));
        qs.set("page_size", String(effectivePageSize));

        const [listRes, meRes] = await Promise.all([
          apiGet<any>(`/api/v1/governance/stakeholders?${qs.toString()}`, {
            loadingKey: "stakeholders_list",
            loadingDelay: 300,
          }),
          apiGet<any>("/api/v1/auth/me", {
            loadingKey: "stakeholders_me",
          }).catch(() => null),
        ]);

        if (!active) return;

        const listData = normalizeStakeholdersList(listRes);
        setItems(listData.items);
        setTotal(listData.total);

        const meData = meRes?.data?.data ?? meRes?.data ?? {};
        const roles = Array.isArray(meData?.roles) ? meData.roles : [];
        const nextCanManage = canManageGovernance(roles);
        setCanManage(nextCanManage);

        if (nextCanManage) {
          const identitiesRes = await apiGet<any>("/api/v1/admin/identities", {
            loadingKey: "stakeholders_identities",
          });

          if (!active) return;

          const identityRows = normalizeIdentities(identitiesRes);
          setIdentities(identityRows);
        }
      } catch (error) {
        if (!active) return;
        setErr(getErrorMessage(error));
        setItems([]);
        setTotal(0);
        setCanManage(false);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [status, category, q, pageFromUrl, pageSizeFromUrl]);

  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const canPrev = pageFromUrl > 1;
  const canNext = pageFromUrl < totalPages;

  const identityMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const row of identities) {
      m.set(row.id, row.display_name);
    }
    return m;
  }, [identities]);

  function startCreate() {
    setEditingId(null);
    setForm(blankForm());
    setSaveErr(null);
  }

  function startEdit(row: StakeholderRow) {
    setEditingId(Number(row.id));
    setForm({
      name: row.name || "",
      category_code: row.category_code || "INTERNAL",
      priority_code: row.priority_code || "MEDIUM",
      status_code: row.status_code || "OPEN",
      expectations: row.expectations || "",
      owner_identity_id: row.owner_identity_id ? String(row.owner_identity_id) : "",
      review_date: row.review_date ? String(row.review_date).slice(0, 10) : "",
    });
    setSaveErr(null);
  }

  async function saveForm() {
    setSaving(true);
    setSaveErr(null);

    try {
      const body = {
        name: form.name.trim(),
        category_code: form.category_code,
        priority_code: form.priority_code,
        status_code: form.status_code,
        expectations: form.expectations.trim(),
        owner_identity_id: form.owner_identity_id ? Number(form.owner_identity_id) : null,
        review_date: form.review_date || null,
      };

      if (!body.name) {
        throw new Error("Name wajib diisi.");
      }

      if (editingId) {
        await apiPatchJson(`/api/v1/governance/stakeholders/${editingId}`, body);
      } else {
        await apiPostJson("/api/v1/governance/stakeholders", body);
      }

      startCreate();
      router.refresh();
      router.push(
        buildHref({
          status,
          category,
          q,
          page: 1,
          pageSize,
        })
      );
    } catch (error) {
      setSaveErr(getErrorMessage(error, "Failed to save stakeholder register"));
    } finally {
      setSaving(false);
    }
  }

  function onPageSizeChange(nextPageSize: number) {
    router.push(
      buildHref({
        status,
        category,
        q,
        page: 1,
        pageSize: nextPageSize,
      })
    );
  }

  function onSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    router.push(
      buildHref({
        status,
        category,
        q: searchText.trim(),
        page: 1,
        pageSize,
      })
    );
  }

  return (
    <main className="relative z-10">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="rounded-3xl border border-white bg-white/80 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">
                Governance Stakeholders
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-gray-900">Governance Stakeholders</h1>
              <p className="mt-1 text-sm text-gray-600">
                MVP1.6 - stakeholder register for ITAM interested parties and expectations.
              </p>
            </div>

            <Link href="/" className="itam-secondary-action md:self-end">
              Back
            </Link>
          </div>
        </div>

        <div className="mt-16 rounded-3xl border border-white bg-white/80 p-10 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex justify-end">
            <Link href={contextHref} className="itam-secondary-action">
              Context
            </Link>
          </div>

          <div className="mt-12 space-y-12">
            {canManage ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-gray-900">
                      {editingId ? "Edit Stakeholder Entry" : "New Stakeholder Entry"}
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      Catat stakeholder dan ekspektasinya terhadap ITAM.
                    </div>
                  </div>

                  {editingId ? (
                    <button
                      type="button"
                      onClick={startCreate}
                      className="itam-secondary-action-sm"
                    >
                      Cancel Edit
                    </button>
                  ) : null}
                </div>

                <div className="mt-5 space-y-5">
                  <div>
                    <div className="text-sm font-medium text-gray-700">Name</div>
                    <input
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                      value={form.name}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                      disabled={saving}
                      placeholder="e.g. Internal Audit, Vendor ABC, Regulator XYZ"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <div className="text-sm font-medium text-gray-700">Category</div>
                      <select
                        className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                        value={form.category_code}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, category_code: e.target.value }))
                        }
                        disabled={saving}
                      >
                        {CATEGORY_OPTIONS.filter((x) => x !== "ALL").map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-gray-700">Priority</div>
                      <select
                        className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                        value={form.priority_code}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, priority_code: e.target.value }))
                        }
                        disabled={saving}
                      >
                        {PRIORITY_OPTIONS.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-gray-700">Status</div>
                      <select
                        className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                        value={form.status_code}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, status_code: e.target.value }))
                        }
                        disabled={saving}
                      >
                        {STATUS_OPTIONS.filter((x) => x !== "ALL").map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-sm font-medium text-gray-700">Owner Identity</div>
                      <select
                        className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                        value={form.owner_identity_id}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, owner_identity_id: e.target.value }))
                        }
                        disabled={saving}
                      >
                        <option value="">- Unassigned -</option>
                        {identities.map((row) => (
                          <option key={row.id} value={String(row.id)}>
                            {row.display_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-gray-700">Review Date</div>
                      <input
                        type="date"
                        className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                        value={form.review_date}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, review_date: e.target.value }))
                        }
                        disabled={saving}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-gray-700">Expectations</div>
                    <textarea
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                      rows={6}
                      value={form.expectations}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, expectations: e.target.value }))
                      }
                      disabled={saving}
                      placeholder="Describe stakeholder needs, expectations, or requirements towards ITAM..."
                    />
                  </div>

                  {saveErr ? (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {saveErr}
                    </div>
                  ) : null}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={saveForm}
                      disabled={saving}
                      className="itam-primary-action disabled:opacity-50"
                    >
                      {saving ? "Saving..." : editingId ? "Save Changes" : "Create Stakeholder Entry"}
                    </button>
                  </div>
                </div>
              </section>
            ) : (
              <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
                <div className="text-base font-semibold text-gray-900">Stakeholder Register</div>
                <div className="mt-1 text-sm text-gray-600">
                  Read only. Create/edit stakeholder register is restricted to SUPERADMIN,
                  TENANT_ADMIN, and ITAM_MANAGER.
                </div>
              </section>
            )}

            <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto whitespace-nowrap text-sm font-medium text-gray-600 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {STATUS_OPTIONS.map((s) => (
                    <Link
                      key={s}
                      href={buildHref({
                        status: s,
                        category,
                        q,
                        page: 1,
                        pageSize,
                      })}
                      className={
                        status === s
                          ? "border-b-2 border-blue-600 pb-1 text-blue-700"
                          : "pb-1 hover:text-gray-900"
                      }
                    >
                      {s}
                    </Link>
                  ))}
                </div>

                <form
                  className="flex flex-col gap-2 sm:flex-row sm:items-center"
                  onSubmit={onSearchSubmit}
                >
                  <select
                    value={category}
                    onChange={(e) =>
                      router.push(
                        buildHref({
                          status,
                          category: e.target.value,
                          q,
                          page: 1,
                          pageSize,
                        })
                      )
                    }
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    {CATEGORY_OPTIONS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>

                  <select
                    value={String(pageSize)}
                    onChange={(e) => onPageSizeChange(Number(e.target.value))}
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    {pageSizeOptions.map((n) => (
                      <option key={n} value={String(n)}>
                        {n} / page
                      </option>
                    ))}
                  </select>

                  <input
                    className="rounded-md border px-3 py-2 text-sm"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Search name/expectations..."
                  />

                  <button className="itam-primary-action">Search</button>
                </form>
              </div>

              <div className="mt-4 text-sm text-gray-500">Total: {total}</div>

              {err ? (
                <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {err}
                </div>
              ) : null}

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500">
                    <tr>
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Category</th>
                      <th className="py-2 pr-4">Priority</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Owner</th>
                      <th className="py-2 pr-4">Review Date</th>
                      <th className="py-2 pr-4">Updated</th>
                      <th className="py-2 pr-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <>
                        <SkeletonTableRow cols={8} />
                        <SkeletonTableRow cols={8} />
                        <SkeletonTableRow cols={8} />
                        <SkeletonTableRow cols={8} />
                        <SkeletonTableRow cols={8} />
                      </>
                    ) : items.length === 0 ? (
                      <tr className="border-t">
                        <td colSpan={8} className="py-6 text-gray-600">
                          Tidak ada stakeholder register.
                        </td>
                      </tr>
                    ) : (
                      items.map((row) => (
                        <tr key={String(row.id)} className="border-t align-top">
                          <td className="py-3 pr-4">
                            <div className="font-medium text-gray-900">{row.name}</div>
                            <div className="mt-1 text-xs text-gray-500 line-clamp-2">
                              {row.expectations || "-"}
                            </div>
                          </td>
                          <td className="py-3 pr-4">{row.category_code || "-"}</td>
                          <td className="py-3 pr-4">
                            <span className={priorityPill(row.priority_code)}>
                              {row.priority_code || "-"}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={statusPill(row.status_code)}>
                              {row.status_code || "-"}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            {row.owner_identity_id
                              ? identityMap.get(Number(row.owner_identity_id)) || `Identity #${row.owner_identity_id}`
                              : "-"}
                          </td>
                          <td className="whitespace-nowrap py-3 pr-4">{row.review_date || "-"}</td>
                          <td className="whitespace-nowrap py-3 pr-4">{fmtDateTime(row.updated_at)}</td>
                          <td className="whitespace-nowrap py-3 pr-4 text-right">
                            {canManage ? (
                              <button
                                type="button"
                                onClick={() => startEdit(row)}
                                className="text-blue-700 hover:underline"
                              >
                                Edit
                              </button>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-gray-500">
                  Page {pageFromUrl} / {totalPages} (page_size: {pageSize})
                </div>

                <div className="flex gap-2">
                  {canPrev ? (
                    <Link
                      className="itam-secondary-action-sm"
                      href={buildHref({
                        status,
                        category,
                        q,
                        page: pageFromUrl - 1,
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
                      className="itam-secondary-action-sm"
                      href={buildHref({
                        status,
                        category,
                        q,
                        page: pageFromUrl + 1,
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
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}