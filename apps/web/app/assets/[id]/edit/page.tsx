"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiGet, apiPatchJson } from "../../../lib/api";

type AssetType = { code: string; label: string };
type StateType = { code: string; label: string };

type AssetDetailResponse = {
  asset: {
    id: number;
    asset_tag: string;
    name: string;
    status: string | null;
    asset_type: AssetType;
    state: StateType;
    owner_department_id: number | null;
    current_custodian_identity_id: number | null;
    location_id: number | null;

    purchase_date: string | null;
    warranty_start_date: string | null;
    warranty_end_date: string | null;
    support_start_date: string | null;
    support_end_date: string | null;
    subscription_start_date: string | null;
    subscription_end_date: string | null;
  };
};

const STATUS_OPTIONS = ["AKTIF", "NON_AKTIF", "PENDING", "RUSAK", "PENSIUN", "DIHAPUS"] as const;

function valueOrEmpty(v?: string | null) {
  return v ? String(v).slice(0, 10) : "";
}

function emptyToNull(v: string) {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

export default function EditAssetPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const assetId = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assetTag, setAssetTag] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");

  const [purchaseDate, setPurchaseDate] = useState("");
  const [warrantyStartDate, setWarrantyStartDate] = useState("");
  const [warrantyEndDate, setWarrantyEndDate] = useState("");
  const [supportStartDate, setSupportStartDate] = useState("");
  const [supportEndDate, setSupportEndDate] = useState("");
  const [subscriptionStartDate, setSubscriptionStartDate] = useState("");
  const [subscriptionEndDate, setSubscriptionEndDate] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!assetId) return;

      try {
        setLoading(true);
        setError(null);

        const res = await apiGet<AssetDetailResponse>(`/api/v1/assets/${assetId}`);

        const asset =
          (res as any)?.data?.asset ??
          (res as any)?.data?.data?.asset;

        if (!mounted) return;

        setAssetTag(asset.asset_tag);
        setName(asset.name);
        setStatus(asset.status ?? "");

        setPurchaseDate(valueOrEmpty(asset.purchase_date));
        setWarrantyStartDate(valueOrEmpty(asset.warranty_start_date));
        setWarrantyEndDate(valueOrEmpty(asset.warranty_end_date));
        setSupportStartDate(valueOrEmpty(asset.support_start_date));
        setSupportEndDate(valueOrEmpty(asset.support_end_date));
        setSubscriptionStartDate(valueOrEmpty(asset.subscription_start_date));
        setSubscriptionEndDate(valueOrEmpty(asset.subscription_end_date));
      } catch (eAny: any) {
        if (!mounted) return;

        if (
          eAny?.code === "AUTH_REQUIRED" ||
          eAny?.code === "AUTH_UNAUTHORIZED" ||
          eAny?.http_status === 401
        ) {
          router.replace("/login");
          router.refresh();
          return;
        }

        setError(eAny?.message || "Failed to load asset");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [assetId, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assetId) return;

    try {
      setSaving(true);
      setError(null);

      const payload = {
        name: name.trim(),
        status: status.trim(),

        purchase_date: emptyToNull(purchaseDate),
        warranty_start_date: emptyToNull(warrantyStartDate),
        warranty_end_date: emptyToNull(warrantyEndDate),
        support_start_date: emptyToNull(supportStartDate),
        support_end_date: emptyToNull(supportEndDate),
        subscription_start_date: emptyToNull(subscriptionStartDate),
        subscription_end_date: emptyToNull(subscriptionEndDate),
      };

      await apiPatchJson(`/api/v1/assets/${assetId}`, payload);

      router.push(`/assets/${assetId}`);
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

      setError(eAny?.message || "Failed to update asset");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900">
      <div className="absolute inset-x-0 top-0 h-64 pointer-events-none bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_60%)]" />

      <div className="relative mx-auto max-w-5xl px-6 py-8 lg:px-10 lg:py-10">
        <div className="flex flex-col gap-4 rounded-3xl border border-white bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Assets
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              Edit Asset
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
              {assetTag || (assetId ? `Asset #${assetId}` : "")}
            </p>
          </div>

          <button
            type="button"
            onClick={() => assetId && router.push(`/assets/${assetId}`)}
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Back
          </button>
        </div>

        <div className="mt-8 rounded-3xl border border-white bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          {!assetId ? (
            <p className="text-sm text-slate-600">Loading route...</p>
          ) : loading ? (
            <p className="text-sm text-slate-600">Loading asset...</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-6">
              {error ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Asset Tag (read-only)</label>
                  <input
                    value={assetTag}
                    readOnly
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className={inputClass}
                  >
                    {status && !STATUS_OPTIONS.includes(status.toUpperCase() as (typeof STATUS_OPTIONS)[number]) ? (
                      <option value={status}>{status}</option>
                    ) : null}
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-6">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-slate-900">Coverage Information</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Ubah tanggal coverage aktual untuk asset ini.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Purchase Date</label>
                    <input
                      type="date"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div />

                  <div>
                    <label className="block text-sm font-medium text-slate-700">Warranty Start Date</label>
                    <input
                      type="date"
                      value={warrantyStartDate}
                      onChange={(e) => setWarrantyStartDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700">Warranty End Date</label>
                    <input
                      type="date"
                      value={warrantyEndDate}
                      onChange={(e) => setWarrantyEndDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700">Support Start Date</label>
                    <input
                      type="date"
                      value={supportStartDate}
                      onChange={(e) => setSupportStartDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700">Support End Date</label>
                    <input
                      type="date"
                      value={supportEndDate}
                      onChange={(e) => setSupportEndDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700">Subscription Start Date</label>
                    <input
                      type="date"
                      value={subscriptionStartDate}
                      onChange={(e) => setSubscriptionStartDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700">Subscription End Date</label>
                    <input
                      type="date"
                      value={subscriptionEndDate}
                      onChange={(e) => setSubscriptionEndDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
              <button
                disabled={saving}
                type="submit"
                className="itam-primary-action"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              </div>
            </form>
          )}
        </div>

        {assetId ? (
          <div className="mt-4 text-xs text-slate-500">
            Uses API: <code>GET /api/v1/assets/{assetId}</code> and{" "}
            <code>PATCH /api/v1/assets/{assetId}</code>
          </div>
        ) : null}
      </div>
    </main>
  );
}
