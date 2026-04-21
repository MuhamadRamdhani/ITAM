"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPostJson } from "../../lib/api";

type AssetTypeItem = { code: string; label: string };
type StateItem = { code: string; label: string };
type ScopeVersionItem = {
  scope_json?: {
    asset_type_codes?: string[];
  };
};
type CoverageMode = "HARDWARE" | "SOFTWARE" | "SUBSCRIPTION" | "OTHER";

type CoverageView = {
  title: string;
  description: string;
  showWarranty: boolean;
  showSupport: boolean;
  showSubscription: boolean;
};

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

const STATUS_OPTIONS = ["AKTIF", "NON_AKTIF", "PENDING", "RUSAK", "PENSIUN", "DIHAPUS"] as const;

function emptyToNull(v: string) {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function normalizeAssetTypeCode(value: string) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeScopeAssetTypeCodes(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of value) {
    const code = normalizeAssetTypeCode(String(item ?? ""));
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }

  return out;
}

function getCoverageMode(assetTypeCode: string): CoverageMode {
  const code = normalizeAssetTypeCode(assetTypeCode);

  if (code === "HARDWARE" || code === "NETWORK") return "HARDWARE";
  if (code === "SOFTWARE") return "SOFTWARE";
  if (code === "SAAS" || code === "CLOUD" || code === "VM_CONTAINER") {
    return "SUBSCRIPTION";
  }

  return "OTHER";
}

function getCoverageView(assetTypeCode: string): CoverageView {
  const mode = getCoverageMode(assetTypeCode);

  if (mode === "HARDWARE") {
    return {
      title: "Warranty & Support Information",
      description:
        "Hardware and network assets use warranty dates as the main coverage, with support dates available when the vendor contract includes them.",
      showWarranty: true,
      showSupport: true,
      showSubscription: false,
    };
  }

  if (mode === "SOFTWARE") {
    return {
      title: "Software Coverage Information",
      description:
        "Software assets use subscription or license-term dates. Leave the dates blank only when the license is perpetual.",
      showWarranty: false,
      showSupport: false,
      showSubscription: true,
    };
  }

  if (mode === "SUBSCRIPTION") {
    return {
      title: "Subscription Information",
      description:
        "SaaS, cloud, and VM/container assets use subscription dates as the primary coverage window.",
      showWarranty: false,
      showSupport: false,
      showSubscription: true,
    };
  }

  return {
    title: "Coverage Information",
    description:
      "Fill the coverage dates that apply to this asset type. The form will only submit the fields that are relevant to the selected type.",
    showWarranty: true,
    showSupport: true,
    showSubscription: true,
  };
}

export default function NewAssetPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assetTypes, setAssetTypes] = useState<AssetTypeItem[]>([]);
  const [states, setStates] = useState<StateItem[]>([]);
  const [activeScopeAssetTypeCodes, setActiveScopeAssetTypeCodes] = useState<string[]>([]);
  const [activeScopeVersionNo, setActiveScopeVersionNo] = useState<number | null>(null);

  const [assetTag, setAssetTag] = useState("");
  const [name, setName] = useState("");
  const [assetTypeCode, setAssetTypeCode] = useState<string>("");
  const [stateCode, setStateCode] = useState<string>("");
  const [status, setStatus] = useState<string>("AKTIF");

  const [purchaseDate, setPurchaseDate] = useState("");
  const [warrantyStartDate, setWarrantyStartDate] = useState("");
  const [warrantyEndDate, setWarrantyEndDate] = useState("");
  const [supportStartDate, setSupportStartDate] = useState("");
  const [supportEndDate, setSupportEndDate] = useState("");
  const [subscriptionStartDate, setSubscriptionStartDate] = useState("");
  const [subscriptionEndDate, setSubscriptionEndDate] = useState("");
  const coverageView = getCoverageView(assetTypeCode);

  useEffect(() => {
    let mounted = true;

    async function loadConfig() {
      try {
        setLoading(true);
        setError(null);

        const [typesRes, statesRes, scopeRes] = await Promise.all([
          apiGet<{ items: AssetTypeItem[] }>("/api/v1/config/asset-types"),
          apiGet<{ items: StateItem[] }>("/api/v1/config/lifecycle-states"),
          apiGet<{ items: ScopeVersionItem[] }>(
            "/api/v1/governance/scope/versions?status=ACTIVE&page=1&page_size=1"
          ),
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
        const scopeItems =
          (scopeRes as any)?.data?.items ??
          (scopeRes as any)?.data?.data?.items ??
          [];

        setAssetTypes(Array.isArray(types) ? types : []);
        setStates(Array.isArray(st) ? st : []);

        const activeScope = Array.isArray(scopeItems) ? scopeItems[0] : null;
        const activeScopeCodes = normalizeScopeAssetTypeCodes(
          activeScope?.scope_json?.asset_type_codes
        );
        setActiveScopeAssetTypeCodes(activeScopeCodes);
        setActiveScopeVersionNo(
          Number.isFinite(Number((activeScope as any)?.version_no))
            ? Number((activeScope as any)?.version_no)
            : null
        );

        const allowedTypes = Array.isArray(types)
          ? activeScopeCodes.length > 0
            ? types.filter((row) => activeScopeCodes.includes(normalizeAssetTypeCode(row.code)))
            : types
          : [];

        if (allowedTypes.length > 0) {
          setAssetTypeCode((prev) => {
            const current = normalizeAssetTypeCode(prev);
            const currentAllowed = allowedTypes.some(
              (row) => normalizeAssetTypeCode(row.code) === current
            );
            return currentAllowed ? prev : allowedTypes[0].code;
          });
        } else if (Array.isArray(types) && types.length > 0) {
          setAssetTypeCode((prev) => prev || types[0].code);
        }

        if (Array.isArray(st) && st.length > 0) {
          setStateCode((prev) => prev || st[0].code);
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

  const visibleAssetTypes = activeScopeAssetTypeCodes.length
    ? assetTypes.filter((row) =>
        activeScopeAssetTypeCodes.includes(normalizeAssetTypeCode(row.code))
      )
    : assetTypes;

  const activeScopeSummary = activeScopeAssetTypeCodes.length
    ? visibleAssetTypes.map((row) => `${row.label} (${row.code})`)
    : [];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!assetTag.trim() || !name.trim() || !assetTypeCode || !stateCode) {
      setError("Please fill Asset Tag, Name, Type, and Initial State.");
      return;
    }

    if (
      activeScopeAssetTypeCodes.length > 0 &&
      !activeScopeAssetTypeCodes.includes(normalizeAssetTypeCode(assetTypeCode))
    ) {
      setError("Asset type ini berada di luar active governance scope tenant.");
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
        warranty_start_date: coverageView.showWarranty
          ? emptyToNull(warrantyStartDate)
          : null,
        warranty_end_date: coverageView.showWarranty
          ? emptyToNull(warrantyEndDate)
          : null,
        support_start_date: coverageView.showSupport
          ? emptyToNull(supportStartDate)
          : null,
        support_end_date: coverageView.showSupport
          ? emptyToNull(supportEndDate)
          : null,
        subscription_start_date: coverageView.showSubscription
          ? emptyToNull(subscriptionStartDate)
          : null,
        subscription_end_date: coverageView.showSubscription
          ? emptyToNull(subscriptionEndDate)
          : null,
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
              New Asset
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
              Create an asset using config-driven Type & Lifecycle State.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/assets")}
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Back
          </button>
        </div>

        <div className="mt-8 rounded-3xl border border-white bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          {loading ? (
            <p className="text-sm text-slate-600">Loading config...</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-6">
              {error ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="space-y-4">
                {activeScopeSummary.length > 0 ? (
                  <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
                    <div className="font-semibold">Active governance scope limits asset types</div>
                    <div className="mt-1">
                      {activeScopeVersionNo ? `Scope v${activeScopeVersionNo}: ` : ""}
                      {activeScopeSummary.join(", ")}
                    </div>
                  </div>
                ) : null}

                <div>
                  <label className="block text-sm font-medium text-slate-700">Asset Tag</label>
                  <input
                    value={assetTag}
                    onChange={(e) => setAssetTag(e.target.value)}
                    placeholder="e.g. LAPTOP-001"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Laptop Dell"
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Asset Type</label>
                    <select
                      value={assetTypeCode}
                      onChange={(e) => setAssetTypeCode(e.target.value)}
                      className={inputClass}
                    >
                      {visibleAssetTypes.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.label} ({t.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700">Initial State</label>
                    <select
                      value={stateCode}
                      onChange={(e) => setStateCode(e.target.value)}
                      className={inputClass}
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
                  <label className="block text-sm font-medium text-slate-700">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className={inputClass}
                  >
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
                  <h2 className="text-lg font-semibold text-slate-900">{coverageView.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {coverageView.description}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700">Purchase Date</label>
                    <input
                      type="date"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  {coverageView.showWarranty ? (
                    <>
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
                    </>
                  ) : null}

                  {coverageView.showSupport ? (
                    <>
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
                    </>
                  ) : null}

                  {coverageView.showSubscription ? (
                    <>
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
                    </>
                  ) : null}
                </div>
              </div>

              <div className="pt-2">
                <button
                  disabled={saving}
                  type="submit"
                  className="itam-primary-action"
                >
                  {saving ? "Saving..." : "Create Asset"}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="mt-4 text-xs text-slate-500">
          Uses API: <code>/api/v1/config/*</code> and <code>POST /api/v1/assets</code>
        </div>
      </div>
    </main>
  );
}
