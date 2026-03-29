"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPostJson } from "@/app/lib/api";
import { SkeletonTableRow } from "@/app/lib/loadingComponents";

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

  const anyErr = err as any;
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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-3xl font-semibold text-gray-900">Vendors</div>
          <div className="mt-1 text-sm text-gray-600">
            Registry vendor tenant-scoped untuk publisher, supplier, dan service provider.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </button>

          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={submitting}
          >
            {showCreate ? "Hide Form" : "New Vendor"}
          </button>
        </div>
      </div>

      {(loadErr || createErr || createOk) && (
        <div className="space-y-2">
          {loadErr ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {loadErr}
            </div>
          ) : null}

          {createErr ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {createErr}
            </div>
          ) : null}

          {createOk ? (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {createOk}
            </div>
          ) : null}
        </div>
      )}

      {showCreate ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div>
            <div className="text-base font-semibold text-gray-900">Create Vendor</div>
            <div className="mt-1 text-sm text-gray-600">
              Tambahkan vendor tenant untuk software, hardware, cloud, atau service.
            </div>
          </div>

          <form onSubmit={submitCreate} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Vendor Code</label>
              <input
                value={createForm.vendor_code}
                onChange={(e) => updateCreateForm("vendor_code", e.target.value.toUpperCase())}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="MICROSOFT"
                disabled={submitting}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Vendor Name</label>
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
              <label className="block text-sm font-medium text-gray-700">Vendor Type</label>
              <select
                value={createForm.vendor_type}
                onChange={(e) =>
                  updateCreateForm(
                    "vendor_type",
                    e.target.value as CreateVendorForm["vendor_type"]
                  )
                }
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
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
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <select
                value={createForm.status}
                onChange={(e) =>
                  updateCreateForm("status", e.target.value as "ACTIVE" | "INACTIVE")
                }
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                disabled={submitting}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Primary Contact Name</label>
              <input
                value={createForm.primary_contact_name}
                onChange={(e) => updateCreateForm("primary_contact_name", e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                disabled={submitting}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Primary Contact Email</label>
              <input
                type="email"
                value={createForm.primary_contact_email}
                onChange={(e) => updateCreateForm("primary_contact_email", e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                disabled={submitting}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Primary Contact Phone</label>
              <input
                value={createForm.primary_contact_phone}
                onChange={(e) => updateCreateForm("primary_contact_phone", e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                disabled={submitting}
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700">Notes</label>
              <textarea
                value={createForm.notes}
                onChange={(e) => updateCreateForm("notes", e.target.value)}
                className="mt-1 min-h-[100px] w-full rounded-md border px-3 py-2 text-sm"
                disabled={submitting}
              />
            </div>

            <div className="md:col-span-3 flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
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
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form
            onSubmit={submitFilter}
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search code/name/type/contact..."
              className="w-full sm:w-72 rounded-md border px-3 py-2 text-sm"
              disabled={loading}
            />

            <select
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
              className="rounded-md border px-3 py-2 text-sm"
              disabled={loading}
            >
              <option value="">ALL</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>

            <button className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60">
              {loading ? "Loading..." : "Search"}
            </button>
          </form>
        </div>

        <div className="mt-4 text-sm text-gray-500">Total: {total}</div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Primary Contact</th>
                <th className="py-2 pr-4">Updated</th>
                <th className="py-2 pr-4 text-right">Action</th>
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
                <tr className="border-t">
                  <td colSpan={7} className="py-6 text-gray-600">
                    Belum ada vendor.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="py-3 pr-4">{item.vendor_code}</td>
                    <td className="py-3 pr-4">{item.vendor_name}</td>
                    <td className="py-3 pr-4">{item.vendor_type}</td>
                    <td className="py-3 pr-4">{item.status}</td>
                    <td className="py-3 pr-4">
                      <div>{item.primary_contact_name || "-"}</div>
                      <div className="text-xs text-gray-500">
                        {item.primary_contact_email || "-"}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      {item.updated_at
                        ? new Date(item.updated_at).toLocaleString()
                        : "-"}
                    </td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => goToDetail(item.id)}
                        className="text-blue-700 hover:underline"
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

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-500">
            Page {page} / {totalPages} (page_size: {pageSize})
          </div>

          <div className="flex gap-2">
            {canPrev ? (
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Prev
              </button>
            ) : (
              <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                Prev
              </span>
            )}

            {canNext ? (
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Next
              </button>
            ) : (
              <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                Next
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 text-xs text-gray-500">
          Tip: vendor akan dipakai sebagai baseline untuk kontrak, software publisher, dan supplier.
        </div>
      </div>
    </div>
  );
}