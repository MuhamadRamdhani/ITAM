"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, apiPostJson } from "@/app/lib/api";
import { ErrorState, SkeletonTableRow } from "@/app/lib/loadingComponents";
import { canManageSoftwareProducts } from "@/app/lib/softwareProductAccess";

type SoftwareProduct = {
  id: number;
  tenant_id: number;
  product_code: string;
  product_name: string;
  publisher_vendor_id: number | null;
  publisher_vendor_code: string | null;
  publisher_vendor_name: string | null;
  category: string;
  deployment_model: string;
  licensing_metric: string;
  status: "ACTIVE" | "INACTIVE";
  version_policy: "VERSIONED" | "VERSIONLESS";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type SoftwareProductsListResponse = {
  ok: boolean;
  data: {
    items: SoftwareProduct[];
    total: number;
    page: number;
    page_size: number;
    filters: {
      q: string;
      status: string | null;
      category: string | null;
      deployment_model: string | null;
      publisher_vendor_id: number | null;
    };
  };
};

type VendorItem = {
  id: number;
  vendor_code: string;
  vendor_name: string;
  status: string;
};

type VendorsListResponse = {
  ok: boolean;
  data: {
    items: VendorItem[];
    total: number;
    page: number;
    page_size: number;
  };
};

type CreateSoftwareProductForm = {
  product_code: string;
  product_name: string;
  publisher_vendor_id: string;
  category: string;
  deployment_model: string;
  licensing_metric: string;
  status: "ACTIVE" | "INACTIVE";
  version_policy: "VERSIONED" | "VERSIONLESS";
  notes: string;
};

const API_BASE = "/api/v1/software-products";
const VENDORS_API_BASE = "/api/v1/vendors";

const CATEGORY_OPTIONS = [
  "OPERATING_SYSTEM",
  "DATABASE",
  "OFFICE_PRODUCTIVITY",
  "SECURITY",
  "DEVELOPER_TOOL",
  "MIDDLEWARE",
  "BUSINESS_APPLICATION",
  "DESIGN_MULTIMEDIA",
  "COLLABORATION",
  "INFRASTRUCTURE_TOOL",
  "OTHER",
] as const;

const DEPLOYMENT_MODEL_OPTIONS = [
  "ON_PREMISE",
  "SAAS",
  "HYBRID",
  "CLOUD_MARKETPLACE",
  "OTHER",
] as const;

const LICENSING_METRIC_OPTIONS = [
  "USER",
  "NAMED_USER",
  "DEVICE",
  "CONCURRENT_USER",
  "CORE",
  "PROCESSOR",
  "SERVER",
  "INSTANCE",
  "VM",
  "SUBSCRIPTION",
  "SITE",
  "ENTERPRISE",
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

function emptyCreateForm(): CreateSoftwareProductForm {
  return {
    product_code: "",
    product_name: "",
    publisher_vendor_id: "",
    category: "OFFICE_PRODUCTIVITY",
    deployment_model: "SAAS",
    licensing_metric: "SUBSCRIPTION",
    status: "ACTIVE",
    version_policy: "VERSIONLESS",
    notes: "",
  };
}

function statusPillClass(status: string) {
  return status === "ACTIVE"
    ? "rounded-full bg-green-50 px-2 py-1 text-xs text-green-700"
    : "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
}

function deploymentPillClass(value: string) {
  if (value === "SAAS") {
    return "rounded-full bg-cyan-50 px-2 py-1 text-xs text-cyan-700";
  }
  if (value === "ON_PREMISE") {
    return "rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700";
  }
  if (value === "HYBRID") {
    return "rounded-full bg-violet-50 px-2 py-1 text-xs text-violet-700";
  }
  if (value === "CLOUD_MARKETPLACE") {
    return "rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700";
  }
  return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
}

export default function SoftwareProductsClient() {
  const router = useRouter();

  const [items, setItems] = useState<SoftwareProduct[]>([]);
  const [vendors, setVendors] = useState<VendorItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [deploymentModel, setDeploymentModel] = useState("");
  const [publisherVendorId, setPublisherVendorId] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [meLoading, setMeLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] =
    useState<CreateSoftwareProductForm>(emptyCreateForm);
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
      if (q.trim()) params.set("q", q.trim());
      if (status.trim()) params.set("status", status.trim());
      if (category.trim()) params.set("category", category.trim());
      if (deploymentModel.trim()) {
        params.set("deployment_model", deploymentModel.trim());
      }
      if (publisherVendorId.trim()) {
        params.set("publisher_vendor_id", publisherVendorId.trim());
      }

      const res = (await apiGet(
        `${API_BASE}?${params.toString()}`
      )) as SoftwareProductsListResponse;

      setItems(Array.isArray(res?.data?.items) ? res.data.items : []);
      setTotal(Number(res?.data?.total || 0));
    } catch (err) {
      setLoadErr(
        getErrorMessage(err, "Gagal memuat software products.")
      );
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, status, category, deploymentModel, publisherVendorId]);

  const loadVendors = useCallback(async () => {
    setLoadingVendors(true);

    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("pageSize", "100");

      const res = (await apiGet(
        `${VENDORS_API_BASE}?${params.toString()}`
      )) as VendorsListResponse;

      setVendors(Array.isArray(res?.data?.items) ? res.data.items : []);
    } catch {
      setVendors([]);
    } finally {
      setLoadingVendors(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  useEffect(() => {
    let active = true;

    async function loadMe() {
      setMeLoading(true);
      try {
        const res = await apiGet<{ roles?: string[] }>("/api/v1/auth/me", {
          loadingKey: "software_products_me",
        });
        if (!active) return;
        setCanWrite(canManageSoftwareProducts(res?.data?.roles ?? []));
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

  function submitFilter(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setQ(qInput.trim());
  }

  function resetFilter() {
    setPage(1);
    setQInput("");
    setQ("");
    setStatus("");
    setCategory("");
    setDeploymentModel("");
    setPublisherVendorId("");
  }

  function updateCreateForm<K extends keyof CreateSoftwareProductForm>(
    key: K,
    value: CreateSoftwareProductForm[K]
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
      const payload: any = {
        product_code: createForm.product_code.trim(),
        product_name: createForm.product_name.trim(),
        category: createForm.category,
        deployment_model: createForm.deployment_model,
        licensing_metric: createForm.licensing_metric,
        status: createForm.status,
        version_policy: createForm.version_policy,
        notes: createForm.notes.trim() || null,
      };

      if (createForm.publisher_vendor_id.trim()) {
        payload.publisher_vendor_id = Number(createForm.publisher_vendor_id);
      }

      const res = (await apiPostJson(API_BASE, payload)) as {
        ok: boolean;
        data: SoftwareProduct;
      };

      setCreateOk(
        `Software product ${res?.data?.product_code || ""} berhasil dibuat.`
      );
      setCreateForm(emptyCreateForm());
      setShowCreate(false);
      setPage(1);
      await loadData();
    } catch (err) {
      setCreateErr(
        getErrorMessage(err, "Gagal membuat software product.")
      );
    } finally {
      setSubmitting(false);
    }
  }

  function goToDetail(id: number) {
    router.push(`/software-products/${id}`);
  }

  return (
    <div className="space-y-12">
      <div className="rounded-[2rem] border border-white/80 bg-white/75 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-6">
  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
    <div className="max-w-3xl">
      <div className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-700">
        Software Registry
      </div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Software Products
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-700">
        Registry software product per tenant untuk kebutuhan software
        operations berikutnya.
      </p>
    </div>

    <div className="shrink-0">
      <Link
        href="/"
        className="itam-secondary-action"
      >
        Back
      </Link>
    </div>
  </div>
</div>

        <div className="mt-10 rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
  <div className="mb-6 flex items-center justify-end pt-1">
    {meLoading ? (
      <span className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-400">
        Loading access...
      </span>
    ) : canWrite ? (
      <button
        type="button"
        onClick={() => {
          setShowCreate((prev) => !prev);
          setCreateErr(null);
          setCreateOk(null);
        }}
        className="itam-primary-action"
      >
        {showCreate ? "Tutup Form" : "Create Software Product"}
      </button>
    ) : (
      <span className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800">
        Read-only access
      </span>
    )}
  </div>

          {(createErr || createOk) && (
            <div className="mt-4 space-y-3">
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

          {showCreate && canWrite ? (
          <div className="mt-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <h2 className="mb-4 text-lg font-semibold tracking-tight text-slate-900">
              Create Software Product
            </h2>

            <form onSubmit={submitCreate} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Product Code
                </label>
                <input
                  value={createForm.product_code}
                  onChange={(e) =>
                    updateCreateForm("product_code", e.target.value.toUpperCase())
                  }
                  placeholder="e.g. M365-E3"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Product Name
                </label>
                <input
                  value={createForm.product_name}
                  onChange={(e) =>
                    updateCreateForm("product_name", e.target.value)
                  }
                  placeholder="e.g. Microsoft 365 E3"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Publisher Vendor
                </label>
                <select
                  value={createForm.publisher_vendor_id}
                  onChange={(e) =>
                    updateCreateForm("publisher_vendor_id", e.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={submitting || loadingVendors}
                >
                  <option value="">No publisher vendor</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={String(vendor.id)}>
                      {vendor.vendor_code} - {vendor.vendor_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Category
                </label>
                <select
                  value={createForm.category}
                  onChange={(e) => updateCreateForm("category", e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={submitting}
                >
                  {CATEGORY_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Deployment Model
                </label>
                <select
                  value={createForm.deployment_model}
                  onChange={(e) =>
                    updateCreateForm("deployment_model", e.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={submitting}
                >
                  {DEPLOYMENT_MODEL_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Licensing Metric
                </label>
                <select
                  value={createForm.licensing_metric}
                  onChange={(e) =>
                    updateCreateForm("licensing_metric", e.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={submitting}
                >
                  {LICENSING_METRIC_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Status
                </label>
                <select
                  value={createForm.status}
                  onChange={(e) =>
                    updateCreateForm(
                      "status",
                      e.target.value as CreateSoftwareProductForm["status"]
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={submitting}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Version Policy
                </label>
                <select
                  value={createForm.version_policy}
                  onChange={(e) =>
                    updateCreateForm(
                      "version_policy",
                      e.target.value as CreateSoftwareProductForm["version_policy"]
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={submitting}
                >
                  <option value="VERSIONLESS">VERSIONLESS</option>
                  <option value="VERSIONED">VERSIONED</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Notes
                </label>
                <textarea
                  value={createForm.notes}
                  onChange={(e) => updateCreateForm("notes", e.target.value)}
                  placeholder="Optional notes"
                  className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={submitting}
                />
              </div>

              <div className="md:col-span-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setCreateErr(null);
                    setCreateOk(null);
                    setCreateForm(emptyCreateForm());
                  }}
                  className="itam-secondary-action"
                  disabled={submitting}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="itam-primary-action"
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
          ) : null}

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <form
            onSubmit={submitFilter}
            className="grid grid-cols-1 gap-4 md:grid-cols-5"
          >
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Search
              </label>
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Search code / name"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => {
                  setPage(1);
                  setStatus(e.target.value);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              >
                <option value="">All status</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => {
                  setPage(1);
                  setCategory(e.target.value);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              >
                <option value="">All category</option>
                {CATEGORY_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Deployment
              </label>
              <select
                value={deploymentModel}
                onChange={(e) => {
                  setPage(1);
                  setDeploymentModel(e.target.value);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              >
                <option value="">All deployment</option>
                {DEPLOYMENT_MODEL_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Publisher Vendor
              </label>
              <select
                value={publisherVendorId}
                onChange={(e) => {
                  setPage(1);
                  setPublisherVendorId(e.target.value);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                disabled={loadingVendors}
              >
                <option value="">All vendors</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={String(vendor.id)}>
                    {vendor.vendor_code} - {vendor.vendor_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-5 flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={resetFilter}
                className="itam-secondary-action"
              >
                Reset
              </button>

              <button
                type="submit"
                className="itam-primary-action"
              >
                Search
              </button>
            </div>
          </form>

          <div className="mt-4 text-sm text-slate-500">Total: {total}</div>

          {loadErr ? (
            <div className="mt-4">
              <ErrorState error={loadErr} onRetry={loadData} />
            </div>
          ) : null}

          <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
            <table className="min-w-[960px] w-full text-[13px] leading-6">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-4 pr-6 font-semibold uppercase tracking-[0.16em]">Code</th>
                  <th className="px-4 py-4 pr-6 font-semibold uppercase tracking-[0.16em]">Name</th>
                  <th className="px-4 py-4 pr-6 font-semibold uppercase tracking-[0.16em]">Publisher</th>
                  <th className="px-4 py-4 pr-6 font-semibold uppercase tracking-[0.16em]">Category</th>
                  <th className="px-4 py-4 pr-6 font-semibold uppercase tracking-[0.16em]">Deployment</th>
                  <th className="px-4 py-4 pr-6 font-semibold uppercase tracking-[0.16em]">Metric</th>
                  <th className="px-4 py-4 pr-6 font-semibold uppercase tracking-[0.16em]">Status</th>
                  <th className="px-4 py-4 pr-6 font-semibold uppercase tracking-[0.16em]">Version Policy</th>
                  <th className="px-4 py-4 pr-6 font-semibold uppercase tracking-[0.16em]">Updated</th>
                  <th className="px-4 py-4 pr-6 text-right font-semibold uppercase tracking-[0.16em]">Action</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <>
                    <SkeletonTableRow cols={10} />
                    <SkeletonTableRow cols={10} />
                    <SkeletonTableRow cols={10} />
                    <SkeletonTableRow cols={10} />
                    <SkeletonTableRow cols={10} />
                  </>
                ) : items.length === 0 ? (
                  <tr className="border-t border-slate-200">
                    <td colSpan={10} className="px-4 py-8 text-slate-600">
                      Belum ada software product.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="border-t border-slate-200 align-top">
                      <td className="px-4 py-5 pr-6 font-medium text-slate-900">{item.product_code}</td>
                      <td className="px-4 py-5 pr-6 text-slate-900">{item.product_name}</td>
                      <td className="px-4 py-5 pr-6">
                        <div className="text-slate-900">{item.publisher_vendor_name || "-"}</div>
                        <div className="text-xs text-slate-500">
                          {item.publisher_vendor_code || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-5 pr-6 text-slate-900">{item.category}</td>
                      <td className="px-4 py-5 pr-6">
                        <span className={deploymentPillClass(item.deployment_model)}>
                          {item.deployment_model}
                        </span>
                      </td>
                      <td className="px-4 py-5 pr-6 text-slate-900">{item.licensing_metric}</td>
                      <td className="px-4 py-5 pr-6">
                        <span className={statusPillClass(item.status)}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-5 pr-6 text-slate-900">{item.version_policy}</td>
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
                          Detail
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-slate-500">
              Page {page} of {totalPages}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!canPrev}
                onClick={() => setPage((prev) => prev - 1)}
                className="itam-secondary-action-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Prev
              </button>

              <button
                type="button"
                disabled={!canNext}
                onClick={() => setPage((prev) => prev + 1)}
                className="itam-secondary-action-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
