"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatchJson, apiPostJson } from "@/app/lib/api";

type AssignmentStatus = "ACTIVE" | "REVOKED";
type AssignmentRole =
  | "PRIMARY_USER"
  | "SECONDARY_USER"
  | "ADMINISTRATOR"
  | "SERVICE_ACCOUNT";

type InstallationItem = {
  id: number;
  software_product_id: number;
  software_product_code: string;
  software_product_name: string;
  installation_status: string;
  installed_version: string | null;
};

type AssignmentItem = {
  id: number;
  tenant_id: number;
  asset_id: number;
  software_installation_id: number;
  identity_id: number;
  assignment_role: AssignmentRole;
  assignment_status: AssignmentStatus;
  assigned_at: string | null;
  unassigned_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  software_product_id: number;
  software_product_code: string;
  software_product_name: string;
  identity_code: string | null;
  identity_display_name: string;
  identity_email: string | null;
};

type IdentityOption = {
  id: number;
  identity_code: string | null;
  identity_display_name: string;
  identity_email: string | null;
  identity_status: string | null;
};

type Props = {
  assetId: number | string;
  installation: InstallationItem | null;
  isOpen: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
};

type FormState = {
  identity_id: string;
  assignment_role: AssignmentRole;
  assignment_status: AssignmentStatus;
  assigned_at: string;
  unassigned_at: string;
  notes: string;
};

const DEFAULT_FORM: FormState = {
  identity_id: "",
  assignment_role: "PRIMARY_USER",
  assignment_status: "ACTIVE",
  assigned_at: "",
  unassigned_at: "",
  notes: "",
};

function unwrapData<T = any>(payload: any): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return payload.data as T;
  }
  return payload as T;
}

function extractItems<T = any>(payload: any): T[] {
  const root = unwrapData<any>(payload);
  if (Array.isArray(root)) return root;
  if (Array.isArray(root?.items)) return root.items;
  return [];
}

function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toNullableText(value: string): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

function normalizeAssignment(item: any): AssignmentItem {
  return {
    id: Number(item?.id ?? 0),
    tenant_id: Number(item?.tenant_id ?? 0),
    asset_id: Number(item?.asset_id ?? 0),
    software_installation_id: Number(item?.software_installation_id ?? 0),
    identity_id: Number(item?.identity_id ?? 0),
    assignment_role: String(
      item?.assignment_role ?? "PRIMARY_USER"
    ).toUpperCase() as AssignmentRole,
    assignment_status: String(
      item?.assignment_status ?? "ACTIVE"
    ).toUpperCase() as AssignmentStatus,
    assigned_at: item?.assigned_at ? String(item.assigned_at) : null,
    unassigned_at: item?.unassigned_at ? String(item.unassigned_at) : null,
    notes: item?.notes ? String(item.notes) : null,
    created_at: String(item?.created_at ?? ""),
    updated_at: String(item?.updated_at ?? ""),
    software_product_id: Number(item?.software_product_id ?? 0),
    software_product_code: String(item?.software_product_code ?? ""),
    software_product_name: String(item?.software_product_name ?? ""),
    identity_code: item?.identity_code ? String(item.identity_code) : null,
    identity_display_name: String(item?.identity_display_name ?? "-"),
    identity_email: item?.identity_email ? String(item.identity_email) : null,
  };
}

function normalizeIdentity(item: any): IdentityOption {
  const code =
    item?.identity_code ??
    item?.employee_code ??
    item?.code ??
    null;

  const displayName =
    item?.identity_display_name ??
    item?.display_name ??
    item?.full_name ??
    item?.identity_name ??
    item?.employee_name ??
    item?.name ??
    item?.email ??
    `#${item?.id ?? "-"}`;

  const status =
    item?.identity_status ??
    item?.status_code ??
    item?.status ??
    null;

  return {
    id: Number(item?.id ?? 0),
    identity_code: code ? String(code) : null,
    identity_display_name: String(displayName),
    identity_email: item?.identity_email
      ? String(item.identity_email)
      : item?.email
      ? String(item.email)
      : null,
    identity_status: status ? String(status) : null,
  };
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const normalized = String(value).slice(0, 10);
  return normalized || "-";
}

export default function SoftwareAssignmentsModal({
  assetId,
  installation,
  isOpen,
  onClose,
  onChanged,
}: Props) {
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [identities, setIdentities] = useState<IdentityOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingIdentities, setLoadingIdentities] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    ...DEFAULT_FORM,
    assigned_at: todayIsoDate(),
  });

  const normalizedAssetId = useMemo(() => String(assetId), [assetId]);

  const installationAssignments = useMemo(() => {
    if (!installation) return [];
    return assignments.filter(
      (item) => Number(item.software_installation_id) === Number(installation.id)
    );
  }, [assignments, installation]);

  const activeIdentities = useMemo(() => {
    return identities.filter((item) => {
      if (!item.identity_status) return true;
      return String(item.identity_status).toUpperCase() !== "INACTIVE";
    });
  }, [identities]);

  const loadAssignments = useCallback(async () => {
    if (!installation) return;

    setLoading(true);
    setErr(null);

    try {
      const payload = await apiGet(
        `/api/v1/assets/${encodeURIComponent(normalizedAssetId)}/software-assignments`
      );
      const rows = extractItems(payload).map(normalizeAssignment);
      setAssignments(rows);
    } catch (e: any) {
      setErr(e?.message || "Failed to load software assignments.");
    } finally {
      setLoading(false);
    }
  }, [installation, normalizedAssetId]);

  const loadIdentities = useCallback(async () => {
    setLoadingIdentities(true);
    setErr(null);

    try {
      const payload = await apiGet(`/api/v1/admin/identities?page=1&page_size=100`);
      const rows = extractItems(payload).map(normalizeIdentity);
      setIdentities(rows);
    } catch (e: any) {
      setErr(e?.message || "Failed to load identities.");
    } finally {
      setLoadingIdentities(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !installation) return;

    setForm({
      ...DEFAULT_FORM,
      assigned_at: todayIsoDate(),
    });

    void loadAssignments();
    if (identities.length === 0) {
      void loadIdentities();
    }
  }, [identities.length, installation, isOpen, loadAssignments, loadIdentities]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!installation) return;

      setSaving(true);
      setErr(null);

      try {
        if (!form.identity_id) {
          throw new Error("Identity is required.");
        }

        const body = {
          software_installation_id: installation.id,
          identity_id: Number(form.identity_id),
          assignment_role: form.assignment_role,
          assignment_status: form.assignment_status,
          assigned_at: toNullableText(form.assigned_at),
          unassigned_at:
            form.assignment_status === "REVOKED"
              ? toNullableText(form.unassigned_at)
              : null,
          notes: toNullableText(form.notes),
        };

        await apiPostJson(
          `/api/v1/assets/${encodeURIComponent(normalizedAssetId)}/software-assignments`,
          body
        );

        await loadAssignments();
        await onChanged();

        setForm({
          ...DEFAULT_FORM,
          assigned_at: todayIsoDate(),
        });
      } catch (e: any) {
        setErr(e?.message || "Failed to create software assignment.");
      } finally {
        setSaving(false);
      }
    },
    [form, installation, loadAssignments, normalizedAssetId, onChanged]
  );

  const handleRevoke = useCallback(
    async (item: AssignmentItem) => {
      setRevokingId(item.id);
      setErr(null);

      try {
        await apiPatchJson(
          `/api/v1/assets/${encodeURIComponent(normalizedAssetId)}/software-assignments/${item.id}`,
          {
            assignment_status: "REVOKED",
            unassigned_at: todayIsoDate(),
          }
        );

        await loadAssignments();
        await onChanged();
      } catch (e: any) {
        setErr(e?.message || "Failed to revoke assignment.");
      } finally {
        setRevokingId(null);
      }
    },
    [loadAssignments, normalizedAssetId, onChanged]
  );

  if (!isOpen || !installation) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Manage Software Assignments
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {installation.software_product_code} - {installation.software_product_name}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Installation Status: {installation.installation_status}
              {installation.installed_version
                ? ` • Version: ${installation.installed_version}`
                : ""}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            disabled={saving || revokingId !== null}
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 px-6 py-5 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-gray-200">
              <div className="border-b border-gray-200 px-4 py-3">
                <h4 className="text-sm font-semibold text-gray-900">
                  Create Assignment
                </h4>
                <p className="mt-1 text-xs text-gray-500">
                  Assign this software installation to an identity.
                </p>
              </div>

              <form onSubmit={handleCreate} className="space-y-4 p-4">
                {err ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {err}
                  </div>
                ) : null}

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Identity
                  </label>
                  <select
                    value={form.identity_id}
                    onChange={(e) => setField("identity_id", e.target.value)}
                    disabled={saving || loadingIdentities}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                  >
                    <option value="">
                      {loadingIdentities ? "Loading identities..." : "Select identity"}
                    </option>
                    {activeIdentities.map((item) => (
                      <option key={item.id} value={String(item.id)}>
                        {item.identity_code ? `${item.identity_code} - ` : ""}
                        {item.identity_display_name}
                        {item.identity_email ? ` (${item.identity_email})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Assignment Role
                  </label>
                  <select
                    value={form.assignment_role}
                    onChange={(e) =>
                      setField("assignment_role", e.target.value as AssignmentRole)
                    }
                    disabled={saving}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                  >
                    <option value="PRIMARY_USER">PRIMARY_USER</option>
                    <option value="SECONDARY_USER">SECONDARY_USER</option>
                    <option value="ADMINISTRATOR">ADMINISTRATOR</option>
                    <option value="SERVICE_ACCOUNT">SERVICE_ACCOUNT</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Assignment Status
                  </label>
                  <select
                    value={form.assignment_status}
                    onChange={(e) =>
                      setField("assignment_status", e.target.value as AssignmentStatus)
                    }
                    disabled={saving}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="REVOKED">REVOKED</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Assigned At
                  </label>
                  <input
                    type="date"
                    value={form.assigned_at}
                    onChange={(e) => setField("assigned_at", e.target.value)}
                    disabled={saving}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Unassigned At
                  </label>
                  <input
                    type="date"
                    value={form.unassigned_at}
                    onChange={(e) => setField("unassigned_at", e.target.value)}
                    disabled={saving || form.assignment_status !== "REVOKED"}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 disabled:bg-gray-50"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Notes
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setField("notes", e.target.value)}
                    disabled={saving}
                    rows={4}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                  />
                </div>

                <div className="flex justify-end border-t border-gray-200 pt-4">
                  <button
                    type="submit"
                    disabled={
                      saving ||
                      !form.identity_id ||
                      (installation.installation_status === "UNINSTALLED" &&
                        form.assignment_status === "ACTIVE")
                    }
                    className="itam-primary-action"
                  >
                    {saving ? "Saving..." : "Create Assignment"}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="rounded-2xl border border-gray-200">
              <div className="border-b border-gray-200 px-4 py-3">
                <h4 className="text-sm font-semibold text-gray-900">
                  Existing Assignments
                </h4>
                <p className="mt-1 text-xs text-gray-500">
                  Assignment history for this software installation.
                </p>
              </div>

              {loading ? (
                <div className="px-4 py-10 text-center text-sm text-gray-500">
                  Loading assignments...
                </div>
              ) : installationAssignments.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-gray-500">
                  No assignments found for this installation.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-left text-gray-600">
                      <tr>
                        <th className="px-4 py-3 font-medium">Identity</th>
                        <th className="px-4 py-3 font-medium">Role</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Assigned</th>
                        <th className="px-4 py-3 font-medium">Unassigned</th>
                        <th className="px-4 py-3 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {installationAssignments.map((item) => (
                        <tr key={item.id} className="align-top">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">
                              {item.identity_display_name}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              {item.identity_code || "-"}
                              {item.identity_email ? ` • ${item.identity_email}` : ""}
                            </div>
                          </td>

                          <td className="px-4 py-3 text-gray-700">
                            {item.assignment_role}
                          </td>

                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">
                              {item.assignment_status}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-gray-700">
                            {formatDate(item.assigned_at)}
                          </td>

                          <td className="px-4 py-3 text-gray-700">
                            {formatDate(item.unassigned_at)}
                          </td>

                          <td className="px-4 py-3">
                            {item.assignment_status !== "REVOKED" ? (
                              <button
                                type="button"
                                onClick={() => void handleRevoke(item)}
                                disabled={revokingId === item.id}
                                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {revokingId === item.id ? "Processing..." : "Revoke"}
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">No action</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
