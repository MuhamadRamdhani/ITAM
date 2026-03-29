"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatchJson, apiPostJson } from "@/app/lib/api";
import SoftwareAssignmentsModal from "./SoftwareAssignmentsModal";

type InstallationStatus = "INSTALLED" | "UNINSTALLED" | "DETECTED";

type SoftwareProductOption = {
  id: number;
  product_code: string;
  product_name: string;
  publisher_vendor_name: string | null;
  status?: string | null;
};

type SoftwareInstallationItem = {
  id: number;
  tenant_id: number;
  asset_id: number;
  software_product_id: number;
  software_product_code: string;
  software_product_name: string;
  publisher_vendor_id: number | null;
  publisher_vendor_code: string | null;
  publisher_vendor_name: string | null;
  software_product_category?: string | null;
  software_product_deployment_model?: string | null;
  software_product_licensing_metric?: string | null;
  software_product_status?: string | null;
  software_product_version_policy?: string | null;
  installation_status: InstallationStatus;
  installed_version: string | null;
  installation_date: string | null;
  uninstalled_date: string | null;
  discovered_by: string | null;
  discovery_source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type AssignmentItem = {
  id: number;
  tenant_id: number;
  asset_id: number;
  software_installation_id: number;
  identity_id: number;
  assignment_role: string;
  assignment_status: string;
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

type Props = {
  assetId: number | string;
  canEdit?: boolean;
};

type FormState = {
  software_product_id: string;
  installation_status: InstallationStatus;
  installed_version: string;
  installation_date: string;
  uninstalled_date: string;
  discovered_by: string;
  discovery_source: string;
  notes: string;
};

const DEFAULT_FORM: FormState = {
  software_product_id: "",
  installation_status: "INSTALLED",
  installed_version: "",
  installation_date: "",
  uninstalled_date: "",
  discovered_by: "",
  discovery_source: "",
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

function toNullableText(value: string): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return String(value).slice(0, 10) || "-";
}

function normalizeProduct(item: any): SoftwareProductOption {
  return {
    id: Number(item?.id ?? 0),
    product_code: String(item?.product_code ?? ""),
    product_name: String(item?.product_name ?? ""),
    publisher_vendor_name: item?.publisher_vendor_name
      ? String(item.publisher_vendor_name)
      : null,
    status: item?.status ? String(item.status) : null,
  };
}

function normalizeInstallation(item: any): SoftwareInstallationItem {
  return {
    id: Number(item?.id ?? 0),
    tenant_id: Number(item?.tenant_id ?? 0),
    asset_id: Number(item?.asset_id ?? 0),
    software_product_id: Number(item?.software_product_id ?? 0),
    software_product_code: String(item?.software_product_code ?? ""),
    software_product_name: String(item?.software_product_name ?? ""),
    publisher_vendor_id:
      item?.publisher_vendor_id == null ? null : Number(item.publisher_vendor_id),
    publisher_vendor_code: item?.publisher_vendor_code
      ? String(item.publisher_vendor_code)
      : null,
    publisher_vendor_name: item?.publisher_vendor_name
      ? String(item.publisher_vendor_name)
      : null,
    software_product_category: item?.software_product_category
      ? String(item.software_product_category)
      : null,
    software_product_deployment_model: item?.software_product_deployment_model
      ? String(item.software_product_deployment_model)
      : null,
    software_product_licensing_metric: item?.software_product_licensing_metric
      ? String(item.software_product_licensing_metric)
      : null,
    software_product_status: item?.software_product_status
      ? String(item.software_product_status)
      : null,
    software_product_version_policy: item?.software_product_version_policy
      ? String(item.software_product_version_policy)
      : null,
    installation_status: String(
      item?.installation_status ?? "INSTALLED"
    ).toUpperCase() as InstallationStatus,
    installed_version: item?.installed_version
      ? String(item.installed_version)
      : null,
    installation_date: item?.installation_date
      ? String(item.installation_date)
      : null,
    uninstalled_date: item?.uninstalled_date
      ? String(item.uninstalled_date)
      : null,
    discovered_by: item?.discovered_by ? String(item.discovered_by) : null,
    discovery_source: item?.discovery_source
      ? String(item.discovery_source)
      : null,
    notes: item?.notes ? String(item.notes) : null,
    created_at: String(item?.created_at ?? ""),
    updated_at: String(item?.updated_at ?? ""),
  };
}

function normalizeAssignment(item: any): AssignmentItem {
  return {
    id: Number(item?.id ?? 0),
    tenant_id: Number(item?.tenant_id ?? 0),
    asset_id: Number(item?.asset_id ?? 0),
    software_installation_id: Number(item?.software_installation_id ?? 0),
    identity_id: Number(item?.identity_id ?? 0),
    assignment_role: String(item?.assignment_role ?? ""),
    assignment_status: String(item?.assignment_status ?? ""),
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

function buildAssignmentMap(items: AssignmentItem[]) {
  const map = new Map<number, AssignmentItem[]>();

  for (const item of items) {
    const key = Number(item.software_installation_id);
    const current = map.get(key) || [];
    current.push(item);
    map.set(key, current);
  }

  return map;
}

export default function SoftwareInstallationsPanel({
  assetId,
  canEdit = true,
}: Props) {
  const [items, setItems] = useState<SoftwareInstallationItem[]>([]);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [products, setProducts] = useState<SoftwareProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quickActionId, setQuickActionId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [modalErr, setModalErr] = useState<string | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingItem, setEditingItem] = useState<SoftwareInstallationItem | null>(
    null
  );
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [selectedInstallation, setSelectedInstallation] =
    useState<SoftwareInstallationItem | null>(null);

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const normalizedAssetId = useMemo(() => String(assetId), [assetId]);

  const activeProducts = useMemo(() => {
    return products.filter((item) => {
      if (!item.status) return true;
      return String(item.status).toUpperCase() === "ACTIVE";
    });
  }, [products]);

  const assignmentMap = useMemo(() => buildAssignmentMap(assignments), [assignments]);

  const loadAssignments = useCallback(async () => {
    try {
      const payload = await apiGet(
        `/api/v1/assets/${encodeURIComponent(normalizedAssetId)}/software-assignments`
      );
      const rows = extractItems(payload).map(normalizeAssignment);
      setAssignments(rows);
    } catch (e: any) {
      setErr((prev) => prev || e?.message || "Failed to load software assignments.");
    }
  }, [normalizedAssetId]);

  const loadInstallations = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const payload = await apiGet(
        `/api/v1/assets/${encodeURIComponent(
          normalizedAssetId
        )}/software-installations`
      );
      const rows = extractItems(payload).map(normalizeInstallation);
      setItems(rows);
    } catch (e: any) {
      setErr(e?.message || "Failed to load software installations.");
    } finally {
      setLoading(false);
    }
  }, [normalizedAssetId]);

  const reloadAll = useCallback(async () => {
    await Promise.all([loadInstallations(), loadAssignments()]);
  }, [loadAssignments, loadInstallations]);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    setModalErr(null);

    try {
      const payload = await apiGet(`/api/v1/software-products?page=1&page_size=100`);
      const rows = extractItems(payload).map(normalizeProduct);
      setProducts(rows);
    } catch (e: any) {
      setModalErr(e?.message || "Failed to load software products.");
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  const openCreateModal = useCallback(async () => {
    setMode("create");
    setEditingItem(null);
    setForm({
      ...DEFAULT_FORM,
      installation_status: "INSTALLED",
      installation_date: todayIsoDate(),
    });
    setModalErr(null);
    setIsOpen(true);

    if (products.length === 0) {
      await loadProducts();
    }
  }, [loadProducts, products.length]);

  const openEditModal = useCallback(
    async (item: SoftwareInstallationItem) => {
      setMode("edit");
      setEditingItem(item);
      setForm({
        software_product_id: String(item.software_product_id),
        installation_status: item.installation_status,
        installed_version: item.installed_version ?? "",
        installation_date: item.installation_date
          ? String(item.installation_date).slice(0, 10)
          : "",
        uninstalled_date: item.uninstalled_date
          ? String(item.uninstalled_date).slice(0, 10)
          : "",
        discovered_by: item.discovered_by ?? "",
        discovery_source: item.discovery_source ?? "",
        notes: item.notes ?? "",
      });
      setModalErr(null);
      setIsOpen(true);

      if (products.length === 0) {
        await loadProducts();
      }
    },
    [loadProducts, products.length]
  );

  const openAssignmentsModal = useCallback((item: SoftwareInstallationItem) => {
    setSelectedInstallation(item);
    setAssignmentModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    if (saving) return;
    setIsOpen(false);
    setEditingItem(null);
    setModalErr(null);
    setForm(DEFAULT_FORM);
  }, [saving]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setModalErr(null);

      try {
        if (mode === "create") {
          if (!form.software_product_id) {
            throw new Error("Software product is required.");
          }

          const body = {
            software_product_id: Number(form.software_product_id),
            installation_status: form.installation_status,
            installed_version: toNullableText(form.installed_version),
            installation_date: toNullableText(form.installation_date),
            uninstalled_date:
              form.installation_status === "UNINSTALLED"
                ? toNullableText(form.uninstalled_date)
                : null,
            discovered_by: toNullableText(form.discovered_by),
            discovery_source: toNullableText(form.discovery_source),
            notes: toNullableText(form.notes),
          };

          await apiPostJson(
            `/api/v1/assets/${encodeURIComponent(
              normalizedAssetId
            )}/software-installations`,
            body
          );
        } else {
          if (!editingItem) {
            throw new Error("Installation data is missing.");
          }

          const body = {
            installation_status: form.installation_status,
            installed_version: toNullableText(form.installed_version),
            installation_date: toNullableText(form.installation_date),
            uninstalled_date:
              form.installation_status === "UNINSTALLED"
                ? toNullableText(form.uninstalled_date)
                : null,
            discovered_by: toNullableText(form.discovered_by),
            discovery_source: toNullableText(form.discovery_source),
            notes: toNullableText(form.notes),
          };

          await apiPatchJson(
            `/api/v1/assets/${encodeURIComponent(
              normalizedAssetId
            )}/software-installations/${editingItem.id}`,
            body
          );
        }

        setIsOpen(false);
        setEditingItem(null);
        setForm(DEFAULT_FORM);
        await reloadAll();
      } catch (e: any) {
        setModalErr(e?.message || "Failed to save software installation.");
      } finally {
        setSaving(false);
      }
    },
    [editingItem, form, mode, normalizedAssetId, reloadAll]
  );

  const handleMarkUninstalled = useCallback(
    async (item: SoftwareInstallationItem) => {
      setQuickActionId(item.id);
      setErr(null);

      try {
        await apiPatchJson(
          `/api/v1/assets/${encodeURIComponent(
            normalizedAssetId
          )}/software-installations/${item.id}`,
          {
            installation_status: "UNINSTALLED",
            uninstalled_date: todayIsoDate(),
          }
        );

        await reloadAll();
      } catch (e: any) {
        setErr(e?.message || "Failed to mark installation as uninstalled.");
      } finally {
        setQuickActionId(null);
      }
    },
    [normalizedAssetId, reloadAll]
  );

  return (
    <>
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Software Installations
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Mapping software products installed on this asset.
            </p>
          </div>

          {canEdit ? (
            <button
              type="button"
              onClick={() => void openCreateModal()}
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
            >
              Add Installation
            </button>
          ) : null}
        </div>

        {err ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
            Loading software installations...
          </div>
        ) : items.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center">
            <p className="text-sm font-medium text-gray-700">
              No software installations found for this asset.
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Add the first installed software product to start tracking.
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Publisher</th>
                  <th className="px-4 py-3 font-medium">Version</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Install Date</th>
                  <th className="px-4 py-3 font-medium">Discovery</th>
                  <th className="px-4 py-3 font-medium">Assignments</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {items.map((item) => {
                  const rowAssignments = assignmentMap.get(Number(item.id)) || [];
                  const activeAssignments = rowAssignments.filter(
                    (a) => String(a.assignment_status).toUpperCase() === "ACTIVE"
                  );

                  return (
                    <tr key={item.id} className="align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          <Link
                            href={`/software-products/${item.software_product_id}`}
                            className="hover:underline"
                          >
                            {item.software_product_name || "-"}
                          </Link>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {item.software_product_code || "-"}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-gray-700">
                        {item.publisher_vendor_name || "-"}
                      </td>

                      <td className="px-4 py-3 text-gray-700">
                        {item.installed_version || "-"}
                      </td>

                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">
                          {item.installation_status}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-gray-700">
                        <div>{formatDate(item.installation_date)}</div>
                        {item.uninstalled_date ? (
                          <div className="mt-1 text-xs text-gray-500">
                            Uninstalled: {formatDate(item.uninstalled_date)}
                          </div>
                        ) : null}
                      </td>

                      <td className="px-4 py-3 text-gray-700">
                        <div>{item.discovery_source || "-"}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {item.discovered_by || "-"}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-gray-700">
                        {rowAssignments.length === 0 ? (
                          <span className="text-sm text-gray-400">No assignments</span>
                        ) : (
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-gray-900">
                              {activeAssignments.length} active / {rowAssignments.length} total
                            </div>
                            <div className="text-xs text-gray-500">
                              {rowAssignments
                                .slice(0, 2)
                                .map((a) => a.identity_display_name)
                                .join(", ")}
                              {rowAssignments.length > 2 ? " ..." : ""}
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-gray-700">
                        {item.updated_at
                          ? new Date(item.updated_at).toLocaleString()
                          : "-"}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => openAssignmentsModal(item)}
                            className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Manage Assignments
                          </button>

                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => void openEditModal(item)}
                              className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Edit
                            </button>
                          ) : null}

                          {canEdit && item.installation_status !== "UNINSTALLED" ? (
                            <button
                              type="button"
                              onClick={() => void handleMarkUninstalled(item)}
                              className="inline-flex items-center justify-center rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={quickActionId === item.id}
                            >
                              {quickActionId === item.id
                                ? "Processing..."
                                : "Mark Uninstalled"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {isOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {mode === "create"
                      ? "Add Software Installation"
                      : "Edit Software Installation"}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {mode === "create"
                      ? "Attach a software product to this asset."
                      : "Update the installation details for this asset."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                  disabled={saving}
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleSubmit} className="px-6 py-5">
                {modalErr ? (
                  <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {modalErr}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Software Product
                    </label>
                    <select
                      value={form.software_product_id}
                      onChange={(e) => setField("software_product_id", e.target.value)}
                      disabled={mode === "edit" || loadingProducts || saving}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                    >
                      <option value="">
                        {loadingProducts
                          ? "Loading software products..."
                          : "Select software product"}
                      </option>
                      {activeProducts.map((product) => (
                        <option key={product.id} value={String(product.id)}>
                          {product.product_code} - {product.product_name}
                          {product.publisher_vendor_name
                            ? ` (${product.publisher_vendor_name})`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Installation Status
                    </label>
                    <select
                      value={form.installation_status}
                      onChange={(e) => {
  const nextStatus = e.target.value as InstallationStatus;

  setForm((prev) => ({
    ...prev,
    installation_status: nextStatus,
    uninstalled_date:
      nextStatus === "UNINSTALLED"
        ? prev.uninstalled_date || todayIsoDate()
        : "",
  }));
}}
                      disabled={saving}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                    >
                      <option value="INSTALLED">INSTALLED</option>
                      <option value="DETECTED">DETECTED</option>
                      <option value="UNINSTALLED">UNINSTALLED</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Installed Version
                    </label>
                    <input
                      type="text"
                      value={form.installed_version}
                      onChange={(e) => setField("installed_version", e.target.value)}
                      disabled={saving}
                      placeholder="e.g. 16.0"
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Installation Date
                    </label>
                    <input
                      type="date"
                      value={form.installation_date}
                      onChange={(e) => setField("installation_date", e.target.value)}
                      disabled={saving}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Uninstalled Date
                    </label>
                    <input
                      type="date"
                      value={form.uninstalled_date}
                      onChange={(e) => setField("uninstalled_date", e.target.value)}
                      disabled={saving || form.installation_status !== "UNINSTALLED"}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 disabled:bg-gray-50"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Discovered By
                    </label>
                    <input
                      type="text"
                      value={form.discovered_by}
                      onChange={(e) => setField("discovered_by", e.target.value)}
                      disabled={saving}
                      placeholder="e.g. ADMIN"
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Discovery Source
                    </label>
                    <input
                      type="text"
                      value={form.discovery_source}
                      onChange={(e) => setField("discovery_source", e.target.value)}
                      disabled={saving}
                      placeholder="e.g. MANUAL"
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                    />
                  </div>

                  <div className="md:col-span-2">
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
                </div>

                <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    disabled={saving}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={
                      saving ||
                      (mode === "create" && !form.software_product_id) ||
                      (mode === "create" &&
                        !loadingProducts &&
                        activeProducts.length === 0)
                    }
                  >
                    {saving
                      ? "Saving..."
                      : mode === "create"
                      ? "Create Installation"
                      : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </section>

      <SoftwareAssignmentsModal
        assetId={normalizedAssetId}
        installation={selectedInstallation}
        isOpen={assignmentModalOpen}
        onClose={() => {
          setAssignmentModalOpen(false);
          setSelectedInstallation(null);
        }}
        onChanged={reloadAll}
      />
    </>
  );
}