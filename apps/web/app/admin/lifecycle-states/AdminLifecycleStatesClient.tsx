"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPatchJson } from "../../lib/api";
import { SkeletonTableRow } from "../../lib/loadingComponents";

type MeData = {
  tenant_id: number;
  user_id: number;
  roles: string[];
  identity_id: number | null;
};

type LifecycleStateItem = {
  id: number;
  tenant_id: number;
  code: string;
  display_name: string;
  sort_order: number;
};

type LifecycleStatesResp = {
  items: LifecycleStateItem[];
};

type ApiErrorShape = {
  code?: string;
  http_status?: number;
  message?: string;
};

function hasAdminRole(roles: string[]) {
  return roles.some((role) => role === "SUPERADMIN" || role === "TENANT_ADMIN");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toLifecycleStateItem(value: unknown): LifecycleStateItem {
  const item = asRecord(value);

  return {
    id: Number(item.id ?? 0),
    tenant_id: Number(item.tenant_id ?? 0),
    code: String(item.code ?? ""),
    display_name: String(item.display_name ?? ""),
    sort_order: Number(item.sort_order ?? 0),
  };
}

function getApiErrorMessage(error: unknown, fallback: string) {
  const err = asRecord(error) as ApiErrorShape;
  return String(err.message || fallback);
}

export default function AdminLifecycleStatesClient() {
  const router = useRouter();

  const [me, setMe] = useState<MeData | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  const [listLoading, setListLoading] = useState(true);
  const [items, setItems] = useState<LifecycleStateItem[]>([]);

  const [editId, setEditId] = useState<number | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const canAccess = useMemo(() => {
    return hasAdminRole(Array.isArray(me?.roles) ? me.roles : []);
  }, [me]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setErr(null);
      setOk(null);
      setMeLoading(true);
      setListLoading(true);

      try {
        const meRes = await apiGet<MeData>("/api/v1/auth/me", {
          loadingKey: "lifecycle_states_init",
        });
        if (cancelled) return;

        const meData = meRes.data;
        setMe(meData);

        if (!hasAdminRole(Array.isArray(meData.roles) ? meData.roles : [])) {
          return;
        }

        const res = await apiGet<LifecycleStatesResp>("/api/v1/admin/lifecycle-states", {
          loadingKey: "lifecycle_states_list",
          loadingDelay: 300,
        });
        if (cancelled) return;

        const nextItems = Array.isArray(res.data?.items) ? res.data.items.map(toLifecycleStateItem) : [];
        setItems(nextItems);
      } catch (error: unknown) {
        const apiError = asRecord(error) as ApiErrorShape;
        if (
          apiError.code === "AUTH_REQUIRED" ||
          apiError.code === "AUTH_UNAUTHORIZED" ||
          apiError.http_status === 401
        ) {
          router.replace("/login");
          router.refresh();
          return;
        }
        setErr(getApiErrorMessage(error, "Failed to initialize lifecycle states page"));
      } finally {
        if (!cancelled) {
          setMeLoading(false);
          setListLoading(false);
        }
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function startEdit(item: LifecycleStateItem) {
    setEditId(item.id);
    setEditDisplayName(item.display_name || "");
    setErr(null);
    setOk(null);
  }

  function cancelEdit() {
    setEditId(null);
    setEditDisplayName("");
  }

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;

    setErr(null);
    setOk(null);
    setEditLoading(true);

    try {
      const res = await apiPatchJson<{ item: LifecycleStateItem }>(
        `/api/v1/admin/lifecycle-states/${editId}`,
        {
          display_name: editDisplayName.trim(),
        }
      );

      const updated = res.data?.item;
      if (!updated) {
        throw new Error("Update succeeded but no item was returned.");
      }

      setItems((prev) =>
        prev.map((x) => (x.id === editId ? { ...x, display_name: updated.display_name } : x))
      );

      setOk("Lifecycle state berhasil diupdate.");
      cancelEdit();
    } catch (error: unknown) {
      setErr(getApiErrorMessage(error, "Failed to update lifecycle state"));
    } finally {
      setEditLoading(false);
    }
  }

  if (meLoading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
        <div className="text-sm text-slate-600">Loading lifecycle states...</div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
        <div className="text-lg font-semibold text-slate-900">Forbidden</div>
        <div className="mt-1 text-sm text-slate-600">
          Halaman ini hanya bisa diakses oleh role SUPERADMIN atau TENANT_ADMIN.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
            States
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
            {items.length}
          </div>
          <div className="mt-2 text-sm text-slate-600">
            Daftar lifecycle state yang aktif di tenant ini.
          </div>
        </div>

        <div className="rounded-3xl border border-white bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
            Editable Field
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
            display_name
          </div>
          <div className="mt-2 text-sm text-slate-600">
            code dan sort_order dijaga stabil untuk workflow.
          </div>
        </div>

        <div className="rounded-3xl border border-white bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Access
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
            Admin
          </div>
          <div className="mt-2 text-sm text-slate-600">
            SUPERADMIN dan TENANT_ADMIN dapat mengubah label.
          </div>
        </div>
      </div>

      {(err || ok) && (
        <div className="space-y-2">
          {err ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
              {err}
            </div>
          ) : null}
          {ok ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
              {ok}
            </div>
          ) : null}
        </div>
      )}

      {editId ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
          <div>
            <div className="text-base font-semibold text-slate-900">
              Edit Lifecycle State Label
            </div>
            <div className="mt-1 text-sm leading-6 text-slate-600">
              Hanya <b>display_name</b> yang boleh diubah. <b>code</b> dan <b>sort_order</b>{" "}
              tetap stabil.
            </div>
          </div>

          <form onSubmit={onSaveEdit} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Display Name</label>
              <input
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                required
              />
            </div>

            <div className="md:col-span-2 flex flex-wrap gap-2">
              <button
                disabled={editLoading}
                className="rounded-full bg-gradient-to-r from-cyan-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(14,165,233,0.25)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {editLoading ? "Saving..." : "Save Changes"}
              </button>

              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Lifecycle Table
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Total: {items.length} state{items.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="text-xs text-slate-500">
            Tip: code dan sort_order dipakai oleh workflow sistem.
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-3 pr-4">Sort</th>
                <th className="py-3 pr-4">Code</th>
                <th className="py-3 pr-4">Display Name</th>
                <th className="py-3 pr-4 text-right">Action</th>
              </tr>
            </thead>

            <tbody>
              {listLoading ? (
                <>
                  <SkeletonTableRow cols={4} />
                  <SkeletonTableRow cols={4} />
                  <SkeletonTableRow cols={4} />
                  <SkeletonTableRow cols={4} />
                  <SkeletonTableRow cols={4} />
                </>
              ) : items.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <td colSpan={4} className="py-8 text-slate-600">
                    Tidak ada lifecycle states.
                  </td>
                </tr>
              ) : (
                items.map((s) => (
                  <tr key={String(s.id)} className="border-t border-slate-100">
                    <td className="py-4 pr-4 font-medium text-slate-900">{s.sort_order}</td>
                    <td className="py-4 pr-4 font-mono text-xs text-slate-500">{s.code}</td>
                    <td className="py-4 pr-4 text-slate-800">{s.display_name}</td>
                    <td className="py-4 pr-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => startEdit(s)}
                        className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:border-cyan-300 hover:bg-cyan-100 hover:text-cyan-800"
                      >
                        Edit Label
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
          <b>Note:</b> halaman ini sengaja dibuat light premium supaya lebih nyaman untuk
          pekerjaan administratif yang banyak membaca tabel dan melakukan edit kecil.
        </div>
      </div>
    </div>
  );
}
