"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPostJson } from "../../lib/api";

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

function extractItems(json: any) {
  return json?.data?.items ?? json?.items ?? [];
}

function displayLookup(x: LookupItem) {
  return x.name || x.label || x.display_name || x.email || `#${x.id}`;
}

export default function OwnershipPanel(props: {
  assetId: number | string;
  currentOwnerDepartmentId: number | null;
  currentCustodianIdentityId: number | null;
  currentLocationId: number | null;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<OwnershipHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);

  const [deptQ, setDeptQ] = useState("");
  const [idenQ, setIdenQ] = useState("");
  const [locQ, setLocQ] = useState("");

  const [deptOptions, setDeptOptions] = useState<LookupItem[]>([]);
  const [idenOptions, setIdenOptions] = useState<LookupItem[]>([]);
  const [locOptions, setLocOptions] = useState<LookupItem[]>([]);

  const [ownerDepartmentId, setOwnerDepartmentId] = useState<number | "">("");
  const [custodianIdentityId, setCustodianIdentityId] = useState<number | "">("");
  const [locationId, setLocationId] = useState<number | "">("");
  const [reason, setReason] = useState("");

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
    kind: "departments" | "identities" | "locations",
    q: string
  ) {
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    qs.set("page", "1");
    qs.set("page_size", "50");

    const json = await apiGet<any>(`/api/v1/${kind}?${qs.toString()}`);
    return extractItems(json) as LookupItem[];
  }

  useEffect(() => {
    loadHistory();
  }, [props.assetId]);

  useEffect(() => {
    if (!open) return;

    setModalErr(null);
    setReason("");

    setOwnerDepartmentId(props.currentOwnerDepartmentId ?? "");
    setCustodianIdentityId(props.currentCustodianIdentityId ?? "");
    setLocationId(props.currentLocationId ?? "");

    (async () => {
      try {
        const [d, i, l] = await Promise.all([
          loadLookup("departments", ""),
          loadLookup("identities", ""),
          loadLookup("locations", ""),
        ]);
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

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const d = await loadLookup("departments", deptQ);
        setDeptOptions(d);
      } catch {}
    })();
  }, [deptQ, open]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const i = await loadLookup("identities", idenQ);
        setIdenOptions(i);
      } catch {}
    })();
  }, [idenQ, open]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const l = await loadLookup("locations", locQ);
        setLocOptions(l);
      } catch {}
    })();
  }, [locQ, open]);

  async function submitChange() {
    try {
      setSaving(true);
      setModalErr(null);

      const payload: any = {
        owner_department_id: ownerDepartmentId === "" ? null : Number(ownerDepartmentId),
        custodian_identity_id: custodianIdentityId === "" ? null : Number(custodianIdentityId),
        location_id: locationId === "" ? null : Number(locationId),
        change_reason: reason?.trim() ? reason.trim() : null,
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
    <div className="rounded-b-lg border border-t-0 border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">Current Snapshot</p>
          <p className="mt-1 text-xs text-gray-500">
            (sementara tampil ID dulu; nanti kalau BE resolve label, otomatis bisa tampil nama)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Change Ownership
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-md border border-gray-200 p-3">
          <p className="text-xs font-semibold uppercase text-gray-500">Owner Department</p>
          <p className="mt-1 text-sm text-gray-900">{props.currentOwnerDepartmentId ?? "-"}</p>
        </div>
        <div className="rounded-md border border-gray-200 p-3">
          <p className="text-xs font-semibold uppercase text-gray-500">Custodian</p>
          <p className="mt-1 text-sm text-gray-900">{props.currentCustodianIdentityId ?? "-"}</p>
        </div>
        <div className="rounded-md border border-gray-200 p-3">
          <p className="text-xs font-semibold uppercase text-gray-500">Location</p>
          <p className="mt-1 text-sm text-gray-900">{props.currentLocationId ?? "-"}</p>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm font-medium text-gray-900">Ownership History</p>
        {loading ? (
          <p className="mt-2 text-sm text-gray-600">Loading history...</p>
        ) : error ? (
          <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : history.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">No ownership history yet.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-md border border-gray-200">
            <table className="w-full table-auto text-sm">
              <thead className="bg-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-3 py-2">From</th>
                  <th className="px-3 py-2">To</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2">Custodian</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="px-3 py-2">{new Date(h.effective_from).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      {h.effective_to ? new Date(h.effective_to).toLocaleString() : "-"}
                    </td>
                    <td className="px-3 py-2">
                      {h.owner_department_name ?? h.owner_department_id ?? "-"}
                    </td>
                    <td className="px-3 py-2">
                      {h.custodian_display_name ?? h.custodian_identity_id ?? "-"}
                    </td>
                    <td className="px-3 py-2">
                      {h.location_name ?? h.location_id ?? "-"}
                    </td>
                    <td className="px-3 py-2">{h.change_reason ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 text-xs text-gray-500">
          API: <code>GET /api/v1/assets/:id/ownership-history</code> +{" "}
          <code>POST /api/v1/assets/:id/ownership-changes</code>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Change Ownership</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            {modalErr ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {modalErr}
              </div>
            ) : null}

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Owner Department</label>
                <input
                  value={deptQ}
                  onChange={(e) => setDeptQ(e.target.value)}
                  placeholder="Search department..."
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={ownerDepartmentId}
                  onChange={(e) => setOwnerDepartmentId(e.target.value ? Number(e.target.value) : "")}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">(empty)</option>
                  {deptOptions.map((x) => (
                    <option key={x.id} value={x.id}>
                      {displayLookup(x)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Custodian (Identity)</label>
                <input
                  value={idenQ}
                  onChange={(e) => setIdenQ(e.target.value)}
                  placeholder="Search identity..."
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={custodianIdentityId}
                  onChange={(e) => setCustodianIdentityId(e.target.value ? Number(e.target.value) : "")}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
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
                <label className="block text-sm font-medium text-gray-700">Location</label>
                <input
                  value={locQ}
                  onChange={(e) => setLocQ(e.target.value)}
                  placeholder="Search location..."
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : "")}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">(empty)</option>
                  {locOptions.map((x) => (
                    <option key={x.id} value={x.id}>
                      {displayLookup(x)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Reason (optional)</label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Reassign to new department"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={submitChange}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
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