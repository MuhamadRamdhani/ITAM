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

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Edit Asset</h1>
            <p className="mt-1 text-sm text-gray-600">
              {assetTag || (assetId ? `Asset #${assetId}` : "")}
            </p>
          </div>

          <button
            type="button"
            onClick={() => assetId && router.push(`/assets/${assetId}`)}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </button>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          {!assetId ? (
            <p className="text-sm text-gray-600">Loading route...</p>
          ) : loading ? (
            <p className="text-sm text-gray-600">Loading asset...</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-6">
              {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Asset Tag (read-only)</label>
                  <input
                    value={assetTag}
                    readOnly
                    className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <input
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    placeholder="AKTIF"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Coverage Information</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Ubah tanggal coverage aktual untuk asset ini.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Purchase Date</label>
                    <input
                      type="date"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div />

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Warranty Start Date</label>
                    <input
                      type="date"
                      value={warrantyStartDate}
                      onChange={(e) => setWarrantyStartDate(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Warranty End Date</label>
                    <input
                      type="date"
                      value={warrantyEndDate}
                      onChange={(e) => setWarrantyEndDate(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Support Start Date</label>
                    <input
                      type="date"
                      value={supportStartDate}
                      onChange={(e) => setSupportStartDate(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Support End Date</label>
                    <input
                      type="date"
                      value={supportEndDate}
                      onChange={(e) => setSupportEndDate(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Subscription Start Date</label>
                    <input
                      type="date"
                      value={subscriptionStartDate}
                      onChange={(e) => setSubscriptionStartDate(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Subscription End Date</label>
                    <input
                      type="date"
                      value={subscriptionEndDate}
                      onChange={(e) => setSubscriptionEndDate(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  disabled={saving}
                  type="submit"
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          )}
        </div>

        {assetId ? (
          <div className="mt-4 text-xs text-gray-500">
            Uses API: <code>GET /api/v1/assets/{assetId}</code> and{" "}
            <code>PATCH /api/v1/assets/{assetId}</code>
          </div>
        ) : null}
      </div>
    </main>
  );
}