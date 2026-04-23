"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPostJson } from "@/app/lib/api";
import { SkeletonTableRow } from "@/app/lib/loadingComponents";
import { canManageVendors } from "@/app/lib/vendorAccess";
import Link from "next/link";
import { WorkspaceSection } from "@/app/components/WorkspaceLayout";

type Vendor = {
  id: number;
  tenant_id: number;
  vendor_code: string;
  vendor_name: string;
  vendor_type: string;
  status: "ACTIVE" | "INACTIVE";
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type VendorListResponse = {
  ok: boolean;
  data: {
    items: Vendor[];
    total: number;
    page: number;
    page_size: number;
    filters: {
      search: string;
      status: string | null;
    };
  };
};

type CreateVendorForm = {
  vendor_code: string;
  vendor_name: string;
  vendor_type: string;
  status: "ACTIVE" | "INACTIVE";
  primary_contact_name: string;
  primary_contact_email: string;
  primary_contact_phone: string;
  notes: string;
};

const API_BASE = "/api/v1/vendors";

const VENDOR_TYPE_OPTIONS = [
  "SOFTWARE_PUBLISHER",
  "HARDWARE_SUPPLIER",
  "SERVICE_PROVIDER",
  "CLOUD_PROVIDER",
  "MSP",
  "OTHER",
] as const;

function getErrorMessage(err: unknown, fallback = "Terjadi kesalahan.") {
  if (!err) return fallback;
  if (typeof err === "string") return err;

  const anyErr = err as {
    error?: { message?: string };
    message?: string;
    response?: {
      data?: {
        error?: { message?: string };
        message?: string;
      };
    };
  };
  return (
    anyErr?.error?.message ||
    anyErr?.message ||
    anyErr?.response?.data?.error?.message ||
    anyErr?.response?.data?.message ||
    fallback
  );
}

function emptyCreateForm(): CreateVendorForm {
  return {
    vendor_code: "",
    vendor_name: "",
    vendor_type: "SOFTWARE_PUBLISHER",
    status: "ACTIVE",
    primary_contact_name: "",
    primary_contact_email: "",
    primary_contact_phone: "",
    notes: "",
  };
}

function digitsOnly(value: string): string {
  return String(value ?? "").replace(/\D+/g, "");
}

export default function VendorsClient() {
  const router = useRouter();

  const [items, setItems] = useState<Vendor[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [canWrite, setCanWrite] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateVendorForm>(emptyCreateForm);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createOk, setCreateOk] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const totalPages = useMemo(() => {
    return total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  }, [total, pageSize]);

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);

    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (search.trim()) params.set("search", search.trim());
      if (status.trim()) params.set("status", status.trim());

      const res = (await apiGet(
        `${API_BASE}?${params.toString()}`
      )) as VendorListResponse;

      setItems(Array.isArray(res?.data?.items) ? res.data.items : []);
      setTotal(Number(res?.data?.total || 0));
    } catch (err) {
      setLoadErr(getErrorMessage(err, "Gagal memuat vendor."));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, status]);

  useEffect(() => {
    let active = true;

    async function loadMe() {
      setMeLoading(true);
      try {
        const res = await apiGet<{ roles?: string[] }>("/api/v1/auth/me", {
          loadingKey: "vendors_me",
        });
        if (!active) return;
        setCanWrite(canManageVendors(res?.data?.roles ?? []));
      } catch {
        if (active) setCanWrite(false);
      } finally {
        if (active) setMeLoading(false);
      }
    }

    void loadMe();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function submitFilter(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function updateCreateForm<K extends keyof CreateVendorForm>(
    key: K,
    value: CreateVendorForm[K]
  ) {
    setCreateForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setCreateErr(null);
    setCreateOk(null);
    setSubmitting(true);

    try {
      const res = (await apiPostJson(API_BASE, {
        vendor_code: createForm.vendor_code,
        vendor_name: createForm.vendor_name,
        vendor_type: createForm.vendor_type,
        status: createForm.status,
        primary_contact_name: createForm.primary_contact_name || null,
        primary_contact_email: createForm.primary_contact_email || null,
        primary_contact_phone: createForm.primary_contact_phone || null,
        notes: createForm.notes || null,
      })) as {
        ok: boolean;
        data: Vendor;
      };

      const createdId = Number(res?.data?.id || 0);

      setCreateOk("Vendor berhasil dibuat.");
      setCreateForm(emptyCreateForm());
      setShowCreate(false);

      if (createdId > 0) {
        router.push(`/vendors/${createdId}`);
        return;
      }

      await loadData();
    } catch (err) {
      setCreateErr(getErrorMessage(err, "Gagal membuat vendor."));
    } finally {
      setSubmitting(false);
    }
  }

  function goToDetail(id: number) {
    router.push(`/vendors/${id}`);
  }

  return (
    <div className="space-y-8">
      <WorkspaceSection className="space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Vendor Registry
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              Vendors
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
              Registry vendor tenant-scoped untuk publisher, supplier, dan service provider.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Back
          </Link>
        </div>
      </WorkspaceSection>

      {(loadErr || createErr || createOk) && (
        <div className="space-y-2">
          {loadErr ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadErr}
            </div>
          ) : null}

          {createErr ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {createErr}
            </div>
          ) : null}

          {createOk ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {createOk}
            </div>
          ) : null}
        </div>
      )}

      <WorkspaceSection className="space-y-8">
        <div className="flex justify-end">
          {meLoading ? (
            <span className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-400">
              Loading access...
            </span>
          ) : canWrite ? (
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="itam-primary-action"
              disabled={submitting}
            >
              {showCreate ? "Hide Form" : "New Vendor"}
            </button>
          ) : (
            <span className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800">
              Read-only access
            </span>
          )}
        </div>

        {showCreate && canWrite ? (
          <div className="mt-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <div>
              <div className="text-lg font-semibold tracking-tight text-slate-900">
                Create Vendor
              </div>
              <div className="mt-1 text-sm text-slate-700">
                Tambahkan vendor tenant untuk software, hardware, cloud, atau service.
              </div>
            </div>

            <form onSubmit={submitCreate} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">Vendor Code</label>
                <input
                  value={createForm.vendor_code}
                  onChange={(e) => updateCreateForm("vendor_code", e.target.value.toUpperCase())}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  placeholder="MICROSOFT"
                  disabled={submitting}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Vendor Name</label>
                <input
                  value={createForm.vendor_name}
                  onChange={(e) => updateCreateForm("vendor_name", e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Microsoft Indonesia"
                  disabled={submitting}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Vendor Type</label>
                <select
                  value={createForm.vendor_type}
                  onChange={(e) =>
                    updateCreateForm(
                      "vendor_type",
                      e.target.value as CreateVendorForm["vendor_type"]
                    )
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={submitting}
                >
                  {VENDOR_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Status</label>
                <select
                  value={createForm.status}
                  onChange={(e) =>
                    updateCreateForm("status", e.target.value as "ACTIVE" | "INACTIVE")
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={submitting}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Primary Contact Name</label>
                <input
                  value={createForm.primary_contact_name}
                  onChange={(e) => updateCreateForm("primary_contact_name", e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Primary Contact Email</label>
                <input
                  type="email"
                  value={createForm.primary_contact_email}
                  onChange={(e) => updateCreateForm("primary_contact_email", e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Primary Contact Phone</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="tel"
                  value={createForm.primary_contact_phone}
                  onChange={(e) =>
                    updateCreateForm("primary_contact_phone", digitsOnly(e.target.value))
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={submitting}
                  placeholder="081234567890"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  value={createForm.notes}
                  onChange={(e) => updateCreateForm("notes", e.target.value)}
                  className="mt-1 min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={submitting}
                />
              </div>

              <div className="md:col-span-3 flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="itam-primary-action"
                >
                  {submitting ? "Creating..." : "Create Vendor"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCreateForm(emptyCreateForm());
                    setCreateErr(null);
                    setCreateOk(null);
                    setShowCreate(false);
                  }}
                  disabled={submitting}
                  className="itam-secondary-action"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <div className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <form
              onSubmit={submitFilter}
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search code/name/type/contact..."
                className="w-full sm:w-72 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                disabled={loading}
              />

              <select
                value={status}
                onChange={(e) => {
                  setPage(1);
                  setStatus(e.target.value);
                }}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                disabled={loading}
              >
                <option value="">ALL</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>

              <button className="itam-primary-action-sm">
                {loading ? "Loading..." : "Search"}
              </button>
            </form>
          </div>

          <div className="mt-4 text-sm text-slate-500">Total: {total}</div>

          <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-[960px] w-full text-[13px] leading-6">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-4 pr-6 font-semibold uppercase tracking-[0.16em]">Code</th>
                    <th className="px-4 py-4 pr-6 font-semibold uppercase tracking-[0.16em]">Name</th>
                    <th className="px-4 py-4 pr-6 font-semibold uppercase tracking-[0.16em]">Type</th>
                    <th className="px-4 py-4 pr-6 font-semibold uppercase tracking-[0.16em]">Status</th>
                    <th className="px-4 py-4 pr-6 font-semibold uppercase tracking-[0.16em]">Primary Contact</th>
                    <th className="px-4 py-4 pr-6 font-semibold uppercase tracking-[0.16em]">Updated</th>
                    <th className="px-4 py-4 pr-6 text-right font-semibold uppercase tracking-[0.16em]">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <>
                      <SkeletonTableRow cols={7} />
                      <SkeletonTableRow cols={7} />
                      <SkeletonTableRow cols={7} />
                      <SkeletonTableRow cols={7} />
                      <SkeletonTableRow cols={7} />
                    </>
                  ) : items.length === 0 ? (
                    <tr className="border-t border-slate-200">
                      <td colSpan={7} className="px-4 py-8 text-slate-600">
                        Belum ada vendor.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id} className="border-t border-slate-200 align-top">
                        <td className="px-4 py-5 pr-6 font-medium text-slate-900">{item.vendor_code}</td>
                        <td className="px-4 py-5 pr-6 text-slate-900">{item.vendor_name}</td>
                        <td className="px-4 py-5 pr-6 text-slate-900">{item.vendor_type}</td>
                        <td className="px-4 py-5 pr-6 text-slate-900">{item.status}</td>
                        <td className="px-4 py-5 pr-6">
                          <div className="text-slate-900">{item.primary_contact_name || "-"}</div>
                          <div className="text-xs text-slate-500">
                            {item.primary_contact_email || "-"}
                          </div>
                        </td>
                        <td className="px-4 py-5 pr-6 text-slate-900">
                          {item.updated_at
                            ? new Date(item.updated_at).toLocaleString()
                            : "-"}
                        </td>
                        <td className="px-4 py-5 pr-6 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => goToDetail(item.id)}
                            className="itam-secondary-action-sm"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-500">
            Page {page} / {totalPages} (page_size: {pageSize})
          </div>

          <div className="flex gap-2">
            {canPrev ? (
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="itam-secondary-action-sm"
              >
                Prev
              </button>
            ) : (
              <span className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-400">
                Prev
              </span>
            )}

            {canNext ? (
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="itam-secondary-action-sm"
              >
                Next
              </button>
            ) : (
              <span className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-400">
                Next
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          Tip: vendor akan dipakai sebagai baseline untuk kontrak, software publisher, dan supplier.
        </div>
      </WorkspaceSection>
    </div>
  );
}
