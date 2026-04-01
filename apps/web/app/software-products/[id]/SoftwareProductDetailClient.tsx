"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiGet, apiPatchJson } from "@/app/lib/api";
import { ErrorState } from "@/app/lib/loadingComponents";

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

type VendorItem = {
  id: number;
  vendor_code: string;
  vendor_name: string;
  status: string;
};

type SoftwareProductDetailResponse = {
  ok: boolean;
  data: SoftwareProduct;
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

type EditForm = {
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

function emptyForm(): EditForm {
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

export default function SoftwareProductDetailClient() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id || "");

  const [item, setItem] = useState<SoftwareProduct | null>(null);
  const [vendors, setVendors] = useState<VendorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [editForm, setEditForm] = useState<EditForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const detailUrl = useMemo(() => `${API_BASE}/${id}`, [id]);

  const loadDetail = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setErr(null);

    try {
      const res = (await apiGet(detailUrl)) as SoftwareProductDetailResponse;
      const data = res?.data || null;

      setItem(data);

      if (data) {
        setEditForm({
          product_code: data.product_code || "",
          product_name: data.product_name || "",
          publisher_vendor_id: data.publisher_vendor_id
            ? String(data.publisher_vendor_id)
            : "",
          category: data.category || "OFFICE_PRODUCTIVITY",
          deployment_model: data.deployment_model || "SAAS",
          licensing_metric: data.licensing_metric || "SUBSCRIPTION",
          status: data.status || "ACTIVE",
          version_policy: data.version_policy || "VERSIONLESS",
          notes: data.notes || "",
        });
      }
    } catch (error) {
      setErr(getErrorMessage(error, "Gagal memuat detail software product."));
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [detailUrl, id]);

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
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  function updateForm<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submitSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    setSaveErr(null);
    setSaveOk(null);
    setSaving(true);

    try {
      const payload: any = {
        product_code: editForm.product_code.trim(),
        product_name: editForm.product_name.trim(),
        category: editForm.category,
        deployment_model: editForm.deployment_model,
        licensing_metric: editForm.licensing_metric,
        status: editForm.status,
        version_policy: editForm.version_policy,
        notes: editForm.notes.trim() || null,
      };

      if (editForm.publisher_vendor_id.trim()) {
        payload.publisher_vendor_id = Number(editForm.publisher_vendor_id);
      } else {
        payload.publisher_vendor_id = null;
      }

      const res = (await apiPatchJson(detailUrl, payload)) as {
        ok: boolean;
        data: SoftwareProduct;
      };

      setItem(res?.data || null);

      if (res?.data) {
        setEditForm({
          product_code: res.data.product_code || "",
          product_name: res.data.product_name || "",
          publisher_vendor_id: res.data.publisher_vendor_id
            ? String(res.data.publisher_vendor_id)
            : "",
          category: res.data.category || "OFFICE_PRODUCTIVITY",
          deployment_model: res.data.deployment_model || "SAAS",
          licensing_metric: res.data.licensing_metric || "SUBSCRIPTION",
          status: res.data.status || "ACTIVE",
          version_policy: res.data.version_policy || "VERSIONLESS",
          notes: res.data.notes || "",
        });
      }

      setSaveOk("Software product berhasil diperbarui.");
    } catch (error) {
      setSaveErr(getErrorMessage(error, "Gagal memperbarui software product."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            Loading software product detail...
          </div>
      </div>
    );
  }

  if (err || !item) {
    return (
      <div className="space-y-6">
          <ErrorState
            error={err || "Software product tidak ditemukan."}
            onRetry={loadDetail}
          />
          <div className="mt-4">
          <Link
            href="/software-products"
            className="itam-secondary-action"
          >
            Back to Software Products
          </Link>
          </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-white/80 bg-white/75 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-700">
              Software Product Detail
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              {item.product_name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {item.product_code}
              </span>
              <span className={statusPillClass(item.status)}>{item.status}</span>
              <span className={deploymentPillClass(item.deployment_model)}>
                {item.deployment_model}
              </span>
            </div>
          </div>

          <Link
            href="/software-products"
            className="itam-secondary-action"
          >
            Back
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <h2 className="mb-4 text-lg font-semibold tracking-tight text-slate-900">Overview</h2>

            <dl className="grid grid-cols-1 gap-4 text-sm">
              <div>
                <dt className="text-slate-500">Product Code</dt>
                <dd className="font-medium text-slate-900">{item.product_code}</dd>
              </div>

              <div>
                <dt className="text-slate-500">Product Name</dt>
                <dd className="font-medium text-slate-900">{item.product_name}</dd>
              </div>

              <div>
                <dt className="text-slate-500">Publisher Vendor</dt>
                <dd className="font-medium text-slate-900">
                  {item.publisher_vendor_name || "-"}
                </dd>
                <div className="text-xs text-slate-500">
                  {item.publisher_vendor_code || "-"}
                </div>
              </div>

              <div>
                <dt className="text-slate-500">Category</dt>
                <dd className="font-medium text-slate-900">{item.category}</dd>
              </div>

              <div>
                <dt className="text-slate-500">Deployment Model</dt>
                <dd className="font-medium text-slate-900">
                  {item.deployment_model}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">Licensing Metric</dt>
                <dd className="font-medium text-slate-900">
                  {item.licensing_metric}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">Version Policy</dt>
                <dd className="font-medium text-slate-900">
                  {item.version_policy}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">Notes</dt>
                <dd className="font-medium whitespace-pre-wrap text-slate-900">
                  {item.notes || "-"}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">Created At</dt>
                <dd className="font-medium text-slate-900">
                  {item.created_at
                    ? new Date(item.created_at).toLocaleString()
                    : "-"}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">Updated At</dt>
                <dd className="font-medium text-slate-900">
                  {item.updated_at
                    ? new Date(item.updated_at).toLocaleString()
                    : "-"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <h2 className="mb-4 text-lg font-semibold tracking-tight text-slate-900">
              Edit Software Product
            </h2>

            {saveErr ? (
              <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {saveErr}
              </div>
            ) : null}

            {saveOk ? (
              <div className="mb-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {saveOk}
              </div>
            ) : null}

            <form onSubmit={submitSave} className="grid grid-cols-1 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Product Code
                </label>
                <input
                  value={editForm.product_code}
                  onChange={(e) =>
                    updateForm("product_code", e.target.value.toUpperCase())
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={saving}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Product Name
                </label>
                <input
                  value={editForm.product_name}
                  onChange={(e) => updateForm("product_name", e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={saving}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Publisher Vendor
                </label>
                <select
                  value={editForm.publisher_vendor_id}
                  onChange={(e) =>
                    updateForm("publisher_vendor_id", e.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={saving || loadingVendors}
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
                  value={editForm.category}
                  onChange={(e) => updateForm("category", e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={saving}
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
                  value={editForm.deployment_model}
                  onChange={(e) =>
                    updateForm("deployment_model", e.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={saving}
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
                  value={editForm.licensing_metric}
                  onChange={(e) =>
                    updateForm("licensing_metric", e.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={saving}
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
                  value={editForm.status}
                  onChange={(e) =>
                    updateForm("status", e.target.value as EditForm["status"])
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={saving}
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
                  value={editForm.version_policy}
                  onChange={(e) =>
                    updateForm(
                      "version_policy",
                      e.target.value as EditForm["version_policy"]
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={saving}
                >
                  <option value="VERSIONLESS">VERSIONLESS</option>
                  <option value="VERSIONED">VERSIONED</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Notes
                </label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => updateForm("notes", e.target.value)}
                  className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  disabled={saving}
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="itam-primary-action"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
