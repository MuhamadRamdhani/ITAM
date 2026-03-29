"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPostJson } from "../../lib/api";

type AssetTypeItem = { code: string; label: string };
type StateItem = { code: string; label: string };

type CreateAssetPayload = {
  asset_tag: string;
  name: string;
  asset_type_code: string;
  initial_state_code: string;
  status: string | null;
  purchase_date: string | null;
  warranty_start_date: string | null;
  warranty_end_date: string | null;
  support_start_date: string | null;
  support_end_date: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
};

function emptyToNull(v: string) {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

export default function NewAssetPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assetTypes, setAssetTypes] = useState<AssetTypeItem[]>([]);
  const [states, setStates] = useState<StateItem[]>([]);

  const [assetTag, setAssetTag] = useState("");
  const [name, setName] = useState("");
  const [assetTypeCode, setAssetTypeCode] = useState<string>("");
  const [stateCode, setStateCode] = useState<string>("REQUESTED");
  const [status, setStatus] = useState<string>("AKTIF");

  const [purchaseDate, setPurchaseDate] = useState("");
  const [warrantyStartDate, setWarrantyStartDate] = useState("");
  const [warrantyEndDate, setWarrantyEndDate] = useState("");
  const [supportStartDate, setSupportStartDate] = useState("");
  const [supportEndDate, setSupportEndDate] = useState("");
  const [subscriptionStartDate, setSubscriptionStartDate] = useState("");
  const [subscriptionEndDate, setSubscriptionEndDate] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadConfig() {
      try {
        setLoading(true);
        setError(null);

        const [typesRes, statesRes] = await Promise.all([
          apiGet<{ items: AssetTypeItem[] }>("/api/v1/config/asset-types"),
          apiGet<{ items: StateItem[] }>("/api/v1/config/lifecycle-states"),
        ]);

        if (!mounted) return;

        const types =
          (typesRes as any)?.data?.items ??
          (typesRes as any)?.data?.data?.items ??
          [];

        const st =
          (statesRes as any)?.data?.items ??
          (statesRes as any)?.data?.data?.items ??
          [];

        setAssetTypes(Array.isArray(types) ? types : []);
        setStates(Array.isArray(st) ? st : []);

        if (Array.isArray(types) && types.length > 0) {
          setAssetTypeCode((prev) => prev || types[0].code);
        }
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

        setError(eAny?.message || "Failed to load config");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    loadConfig();

    return () => {
      mounted = false;
    };
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!assetTag.trim() || !name.trim() || !assetTypeCode || !stateCode) {
      setError("Please fill Asset Tag, Name, Type, and Initial State.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload: CreateAssetPayload = {
        asset_tag: assetTag.trim(),
        name: name.trim(),
        asset_type_code: assetTypeCode,
        initial_state_code: stateCode,
        status: emptyToNull(status),

        purchase_date: emptyToNull(purchaseDate),
        warranty_start_date: emptyToNull(warrantyStartDate),
        warranty_end_date: emptyToNull(warrantyEndDate),
        support_start_date: emptyToNull(supportStartDate),
        support_end_date: emptyToNull(supportEndDate),
        subscription_start_date: emptyToNull(subscriptionStartDate),
        subscription_end_date: emptyToNull(subscriptionEndDate),
      };

      const res = await apiPostJson<{ id: number }>("/api/v1/assets", payload);

      const id =
        (res as any)?.data?.id ??
        (res as any)?.data?.data?.id;

      router.push(`/assets/${id}`);
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

      setError(eAny?.message || "Failed to create asset");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">New Asset</h1>
            <p className="mt-1 text-sm text-gray-600">
              Create an asset using config-driven Type & Lifecycle State.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/assets")}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </button>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          {loading ? (
            <p className="text-sm text-gray-600">Loading config...</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-6">
              {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Asset Tag</label>
                  <input
                    value={assetTag}
                    onChange={(e) => setAssetTag(e.target.value)}
                    placeholder="e.g. LAPTOP-001"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Laptop Dell"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Asset Type</label>
                    <select
                      value={assetTypeCode}
                      onChange={(e) => setAssetTypeCode(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {assetTypes.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.label} ({t.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Initial State</label>
                    <select
                      value={stateCode}
                      onChange={(e) => setStateCode(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {states.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.label} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
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
                    Isi tanggal coverage aktual per asset bila tersedia.
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
                  {saving ? "Saving..." : "Create Asset"}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="mt-4 text-xs text-gray-500">
          Uses API: <code>/api/v1/config/*</code> and <code>POST /api/v1/assets</code>
        </div>
      </div>
    </main>
  );
}