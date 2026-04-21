"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPostJson } from "../../lib/api";
import {
  displayLookup,
  parseActiveScopeJson,
  resolveLookupLabel,
  resolveScopedLookupLabel,
  lookupMatchesScope,
} from "../../lib/governanceScope";

type LookupItem = {
  id: number;
  name?: string;
  label?: string;
  display_name?: string;
  email?: string;
};

type OwnershipHistoryItem = {
  id: number;
  owner_department_id: number | null;
  custodian_identity_id: number | null;
  location_id: number | null;
  effective_from: string;
  effective_to: string | null;
  change_reason?: string | null;
  owner_department_name?: string | null;
  custodian_display_name?: string | null;
  location_name?: string | null;
};

type OwnershipHistoryData = {
  items: OwnershipHistoryItem[];
};

type ActiveScopeVersionItem = {
  version_no?: number | string | null;
  scope_json?: unknown;
};

function extractItems(json: any) {
  return json?.data?.items ?? json?.items ?? [];
}

export default function OwnershipPanel(props: {
  assetId: number | string;
  currentOwnerDepartmentId: number | null;
  currentCustodianIdentityId: number | null;
  currentLocationId: number | null;
  canEdit?: boolean;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<OwnershipHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);

  const [deptOptions, setDeptOptions] = useState<LookupItem[]>([]);
  const [idenOptions, setIdenOptions] = useState<LookupItem[]>([]);
  const [locOptions, setLocOptions] = useState<LookupItem[]>([]);
  const [activeScopeDepartmentTokens, setActiveScopeDepartmentTokens] = useState<string[]>([]);
  const [activeScopeLocationTokens, setActiveScopeLocationTokens] = useState<string[]>([]);

  const [ownerDepartmentId, setOwnerDepartmentId] = useState<number | "">("");
  const [custodianIdentityId, setCustodianIdentityId] = useState<number | "">("");
  const [locationId, setLocationId] = useState<number | "">("");

  async function loadHistory() {
    try {
      setLoading(true);
      setError(null);

      const json = await apiGet<OwnershipHistoryData>(
        `/api/v1/assets/${props.assetId}/ownership-history`
      );

      const items =
        (json as any)?.data?.items ??
        (json as any)?.data?.data?.items ??
        [];

      setHistory(Array.isArray(items) ? items : []);
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
      setError(eAny?.message || "Failed to load ownership history");
    } finally {
      setLoading(false);
    }
  }

  async function loadLookup(
    kind: "departments" | "identities" | "locations"
  ) {
    const qs = new URLSearchParams();
    qs.set("page", "1");
    qs.set("page_size", "50");

    const json = await apiGet<any>(`/api/v1/${kind}?${qs.toString()}`);
    return extractItems(json) as LookupItem[];
  }

  async function loadActiveScope() {
    const json = await apiGet<{ items: ActiveScopeVersionItem[] }>(
      "/api/v1/governance/scope/versions?status=ACTIVE&page=1&page_size=1"
    );

    const items =
      (json as any)?.data?.items ??
      (json as any)?.data?.data?.items ??
      [];

    const active = Array.isArray(items) ? items[0] ?? null : null;
    const parsed = parseActiveScopeJson(active?.scope_json, active?.version_no ?? null);
    setActiveScopeDepartmentTokens(parsed.departmentTokens);
    setActiveScopeLocationTokens(parsed.locationTokens);
  }

  useEffect(() => {
    loadHistory();
  }, [props.assetId]);

  useEffect(() => {
    if (!open) return;

    setModalErr(null);

    setOwnerDepartmentId(props.currentOwnerDepartmentId ?? "");
    setCustodianIdentityId(props.currentCustodianIdentityId ?? "");
    setLocationId(props.currentLocationId ?? "");

    (async () => {
      try {
        const [d, i, l] = await Promise.all([
          loadLookup("departments"),
          loadLookup("identities"),
          loadLookup("locations"),
        ]);
        await loadActiveScope();
        setDeptOptions(d);
        setIdenOptions(i);
        setLocOptions(l);
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
        setModalErr(eAny?.message || "Failed to load lookup data");
      }
    })();
  }, [open, props.currentOwnerDepartmentId, props.currentCustodianIdentityId, props.currentLocationId, router]);

  const visibleDeptOptions = activeScopeDepartmentTokens.length
    ? deptOptions.filter((item) => lookupMatchesScope(item, activeScopeDepartmentTokens))
    : deptOptions;

  const visibleLocOptions = activeScopeLocationTokens.length
    ? locOptions.filter((item) => lookupMatchesScope(item, activeScopeLocationTokens))
    : locOptions;

  const currentOwnerLabel = resolveScopedLookupLabel(
    visibleDeptOptions,
    props.currentOwnerDepartmentId,
    activeScopeDepartmentTokens
  );
  const currentCustodianLabel = resolveLookupLabel(idenOptions, props.currentCustodianIdentityId);
  const currentLocationLabel = resolveScopedLookupLabel(
    visibleLocOptions,
    props.currentLocationId,
    activeScopeLocationTokens
  );
  const currentOwnerDepartmentItem = deptOptions.find(
    (item) => Number(item.id) === Number(props.currentOwnerDepartmentId)
  );
  const currentLocationItem = locOptions.find(
    (item) => Number(item.id) === Number(props.currentLocationId)
  );

  const ownerOutOfScope =
    props.currentOwnerDepartmentId != null &&
    activeScopeDepartmentTokens.length > 0 &&
    !!currentOwnerDepartmentItem &&
    !lookupMatchesScope(currentOwnerDepartmentItem, activeScopeDepartmentTokens);
  const locationOutOfScope =
    props.currentLocationId != null &&
    activeScopeLocationTokens.length > 0 &&
    !!currentLocationItem &&
    !lookupMatchesScope(currentLocationItem, activeScopeLocationTokens);

  async function submitChange() {
    try {
      setSaving(true);
      setModalErr(null);

      const payload: any = {
        owner_department_id: ownerDepartmentId === "" ? null : Number(ownerDepartmentId),
        custodian_identity_id: custodianIdentityId === "" ? null : Number(custodianIdentityId),
        location_id: locationId === "" ? null : Number(locationId),
        change_reason: null,
      };

      await apiPostJson(`/api/v1/assets/${props.assetId}/ownership-changes`, payload);

      setOpen(false);
      await loadHistory();
      router.refresh();
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
      setModalErr(eAny?.message || "Failed to change ownership");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current Snapshot</p>
          <p className="mt-1 text-sm text-slate-600">
            (nilai department dan location hanya muncul jika berada di active governance scope)
          </p>
        </div>
        {props.canEdit !== false ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="itam-primary-action"
          >
            Change Ownership
          </button>
        ) : (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-500">
            Read only
          </span>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Owner Department</p>
          <p className="mt-2 text-sm font-medium text-slate-900">{currentOwnerLabel ?? "-"}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Custodian</p>
          <p className="mt-2 text-sm font-medium text-slate-900">{currentCustodianLabel ?? "-"}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Location</p>
          <p className="mt-2 text-sm font-medium text-slate-900">{currentLocationLabel ?? "-"}</p>
        </div>
      </div>

      <div className="mt-8">
        <p className="text-sm font-semibold text-slate-900">Ownership History</p>
        {loading ? (
          <p className="mt-2 text-sm text-slate-600">Loading history...</p>
        ) : error ? (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : history.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No ownership history yet.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200">
            <table className="w-full table-auto text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-3 py-2">From</th>
                  <th className="px-3 py-2">To</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2">Custodian</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="px-4 py-3 text-slate-700">{new Date(h.effective_from).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {h.effective_to ? new Date(h.effective_to).toLocaleString() : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {h.owner_department_name ?? h.owner_department_id ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {h.custodian_display_name ?? h.custodian_identity_id ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {h.location_name ?? h.location_id ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{h.change_reason ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 text-xs text-slate-500">
          API: <code>GET /api/v1/assets/:id/ownership-history</code> +{" "}
          <code>POST /api/v1/assets/:id/ownership-changes</code>
        </div>
      </div>

      {open && props.canEdit !== false ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Change Ownership</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            {modalErr ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {modalErr}
              </div>
            ) : null}

            <div className="mt-5 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700">Owner Department</label>
                <select
                  value={ownerDepartmentId}
                  onChange={(e) => setOwnerDepartmentId(e.target.value ? Number(e.target.value) : "")}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="">(empty)</option>
                  {visibleDeptOptions.map((x) => (
                    <option key={x.id} value={x.id}>
                      {displayLookup(x)}
                    </option>
                  ))}
                </select>
                {activeScopeDepartmentTokens.length > 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Only departments inside the active governance scope are selectable.
                  </p>
                ) : null}
                {ownerOutOfScope ? (
                  <p className="mt-2 text-xs font-medium text-amber-700">
                    Current owner department is outside the active scope and will not appear in the dropdown.
                  </p>
                ) : null}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Custodian (Identity)</label>
                <select
                  value={custodianIdentityId}
                  onChange={(e) => setCustodianIdentityId(e.target.value ? Number(e.target.value) : "")}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="">(empty)</option>
                  {idenOptions.map((x) => (
                    <option key={x.id} value={x.id}>
                      {displayLookup(x)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Location</label>
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : "")}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="">(empty)</option>
                  {visibleLocOptions.map((x) => (
                    <option key={x.id} value={x.id}>
                      {displayLookup(x)}
                    </option>
                  ))}
                </select>
                {activeScopeLocationTokens.length > 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Only locations inside the active governance scope are selectable.
                  </p>
                ) : null}
                {locationOutOfScope ? (
                  <p className="mt-2 text-xs font-medium text-amber-700">
                    Current location is outside the active scope and will not appear in the dropdown.
                  </p>
                ) : null}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={submitChange}
                  className="itam-primary-action"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
