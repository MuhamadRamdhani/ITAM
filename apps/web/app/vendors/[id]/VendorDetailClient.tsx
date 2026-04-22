"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiPatchJson } from "@/app/lib/api";
import { canManageVendors } from "@/app/lib/vendorAccess";
import Link from "next/link";

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

type VendorDetailResponse = {
  ok: boolean;
  data: Vendor;
};

type VendorForm = {
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

function mapVendorToForm(v: Vendor): VendorForm {
  return {
    vendor_code: v.vendor_code || "",
    vendor_name: v.vendor_name || "",
    vendor_type: v.vendor_type || "SOFTWARE_PUBLISHER",
    status: v.status || "ACTIVE",
    primary_contact_name: v.primary_contact_name || "",
    primary_contact_email: v.primary_contact_email || "",
    primary_contact_phone: v.primary_contact_phone || "",
    notes: v.notes || "",
  };
}

export default function VendorDetailClient({ vendorId }: { vendorId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawReturnTo = searchParams.get("return_to")?.trim() || "";
  const backHref = useMemo(() => {
    if (!rawReturnTo) return "/vendors";
    if (!rawReturnTo.startsWith("/")) return "/vendors";
    if (rawReturnTo.startsWith("//")) return "/vendors";
    return rawReturnTo;
  }, [rawReturnTo]);

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [form, setForm] = useState<VendorForm | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [canWrite, setCanWrite] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);

    try {
      const res = (await apiGet(`${API_BASE}/${vendorId}`)) as VendorDetailResponse;
      const data = res?.data || null;
      setVendor(data);
      setForm(data ? mapVendorToForm(data) : null);
    } catch (err) {
      setLoadErr(getErrorMessage(err, "Gagal memuat detail vendor."));
      setVendor(null);
      setForm(null);
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    let active = true;

    async function loadMe() {
      setMeLoading(true);
      try {
        const res = await apiGet<{ roles?: string[] }>("/api/v1/auth/me", {
          loadingKey: "vendors_detail_me",
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

  function updateForm<K extends keyof VendorForm>(key: K, value: VendorForm[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function submitSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form || saving) return;

    setSaveErr(null);
    setSaveOk(null);
    setSaving(true);

    try {
      const res = (await apiPatchJson(`${API_BASE}/${vendorId}`, {
        vendor_code: form.vendor_code,
        vendor_name: form.vendor_name,
        vendor_type: form.vendor_type,
        status: form.status,
        primary_contact_name: form.primary_contact_name || null,
        primary_contact_email: form.primary_contact_email || null,
        primary_contact_phone: form.primary_contact_phone || null,
        notes: form.notes || null,
      })) as VendorDetailResponse;

      const updated = res?.data || null;
      setVendor(updated);
      setForm(updated ? mapVendorToForm(updated) : form);
      setSaveOk("Vendor berhasil diupdate.");
    } catch (err) {
      setSaveErr(getErrorMessage(err, "Gagal menyimpan perubahan vendor."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white bg-white/80 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Vendor Detail
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              Vendor Detail
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
              Detail dan update vendor tenant-scoped.
            </p>
          </div>

          <Link
  href={backHref}
  className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
>
  Back
</Link>
        </div>
      </div>

      {(loadErr || saveErr || saveOk) && (
        <div className="space-y-2">
          {loadErr ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadErr}
            </div>
          ) : null}

          {saveErr ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {saveErr}
            </div>
          ) : null}

          {saveOk ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {saveOk}
            </div>
          ) : null}
        </div>
      )}

      {loading ? (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          Loading vendor detail...
        </div>
      ) : null}

      {!loading && vendor && form ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Vendor Code
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{vendor.vendor_code}</div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Vendor Name
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{vendor.vendor_name}</div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Status
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{vendor.status}</div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold tracking-tight text-slate-900">Edit Vendor</div>
                <div className="mt-1 text-sm text-slate-700">
                  Update code, name, type, contact, dan notes vendor.
                </div>
              </div>
              {meLoading ? (
                <span className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-400">
                  Loading access...
                </span>
              ) : canWrite ? null : (
                <span className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
                  Read-only access
                </span>
              )}
            </div>

            {canWrite ? (
              <form onSubmit={submitSave} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Vendor Code</label>
                  <input
                    value={form.vendor_code}
                    onChange={(e) => updateForm("vendor_code", e.target.value.toUpperCase())}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={saving}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Vendor Name</label>
                  <input
                    value={form.vendor_name}
                    onChange={(e) => updateForm("vendor_name", e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={saving}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Vendor Type</label>
                  <select
                    value={form.vendor_type}
                    onChange={(e) =>
                      updateForm("vendor_type", e.target.value as VendorForm["vendor_type"])
                    }
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={saving}
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
                    value={form.status}
                    onChange={(e) =>
                      updateForm("status", e.target.value as "ACTIVE" | "INACTIVE")
                    }
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={saving}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Primary Contact Name</label>
                  <input
                    value={form.primary_contact_name}
                    onChange={(e) => updateForm("primary_contact_name", e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Primary Contact Email</label>
                  <input
                    type="email"
                    value={form.primary_contact_email}
                    onChange={(e) => updateForm("primary_contact_email", e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Primary Contact Phone</label>
                  <input
                    value={form.primary_contact_phone}
                    onChange={(e) => updateForm("primary_contact_phone", e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={saving}
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-slate-700">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => updateForm("notes", e.target.value)}
                    className="mt-1 min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={saving}
                  />
                </div>

                <div className="md:col-span-3 flex gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="itam-primary-action"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>

                  <button
                    type="button"
                    onClick={loadDetail}
                    disabled={saving || loading}
                    className="itam-secondary-action"
                  >
                    Refresh
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Vendor detail hanya bisa dibaca oleh role tanpa hak tulis. Silakan login sebagai
                <span className="font-medium"> TENANT_ADMIN</span>,{" "}
                <span className="font-medium">ITAM_MANAGER</span>,{" "}
                <span className="font-medium">PROCUREMENT_CONTRACT_MANAGER</span>, atau{" "}
                <span className="font-medium">SUPERADMIN</span> untuk mengubah data vendor.
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <div>
              Created:{" "}
              {vendor.created_at ? new Date(vendor.created_at).toLocaleString() : "-"}
            </div>
            <div>
              Updated:{" "}
              {vendor.updated_at ? new Date(vendor.updated_at).toLocaleString() : "-"}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}