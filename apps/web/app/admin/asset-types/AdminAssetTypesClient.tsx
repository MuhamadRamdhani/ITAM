"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPatchJson } from "../../lib/api";
import { SkeletonTableRow, ErrorState } from "../../lib/loadingComponents";

type MeData = {
  tenant_id: number;
  user_id: number;
  roles: string[];
  identity_id: number | null;
};

type AssetTypeItem = {
  id: number;
  tenant_id: number;
  code: string;
  display_name: string;
  active: boolean;
};

type AssetTypesResp = {
  items: AssetTypeItem[];
};

const ADMIN_ROLES = ["SUPERADMIN", "TENANT_ADMIN"] as const;

function hasAdminRole(roles: string[]) {
  return roles.some((r) => ADMIN_ROLES.includes(r as any));
}

function activePill(active: boolean) {
  return active
    ? "inline-flex rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-800 ring-1 ring-inset ring-green-200"
    : "inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200";
}

export default function AdminAssetTypesClient() {
  const router = useRouter();

  const [me, setMe] = useState<MeData | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  const [listLoading, setListLoading] = useState(true);
  const [items, setItems] = useState<AssetTypeItem[]>([]);

  const [editId, setEditId] = useState<number | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const canAccess = useMemo(() => {
    return hasAdminRole(Array.isArray(me?.roles) ? me!.roles : []);
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
          loadingKey: "asset_types_init",
        });
        if (cancelled) return;

        const meData = meRes.data;
        setMe(meData);

        if (!hasAdminRole(Array.isArray(meData.roles) ? meData.roles : [])) {
          return;
        }

        const res = await apiGet<AssetTypesResp>("/api/v1/admin/asset-types", {
          loadingKey: "asset_types_list",
          loadingDelay: 300,
        });
        if (cancelled) return;

        const nextItems = Array.isArray(res.data?.items) ? res.data.items : [];
        setItems(nextItems);
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
        setErr(eAny?.message || "Failed to initialize asset types page");
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

  function startEdit(item: AssetTypeItem) {
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
      const res = await apiPatchJson<{ item: AssetTypeItem }>(
        `/api/v1/admin/asset-types/${editId}`,
        {
          display_name: editDisplayName.trim(),
        }
      );

      const updated = res.data?.item;

      setItems((prev) =>
        prev.map((x) => (x.id === editId ? { ...x, display_name: updated.display_name } : x))
      );

      setOk("Asset type berhasil diupdate.");
      cancelEdit();
    } catch (eAny: any) {
      setErr(eAny?.message || "Failed to update asset type");
    } finally {
      setEditLoading(false);
    }
  }

  if (meLoading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        Loading asset types...
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="rounded-3xl border border-red-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <div className="text-lg font-semibold text-slate-900">Forbidden</div>
        <div className="mt-1 text-sm text-slate-600">
          Halaman ini hanya bisa diakses oleh role SUPERADMIN atau TENANT_ADMIN.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(err || ok) && (
        <div className="space-y-2">
          {err ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {err}
            </div>
          ) : null}
          {ok ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              {ok}
            </div>
          ) : null}
        </div>
      )}

      {editId ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <div>
            <div className="text-base font-semibold text-slate-900">Edit Asset Type Label</div>
            <div className="mt-1 text-sm text-slate-600">
              Hanya <b>display_name</b> yang boleh diubah. <b>code</b> tetap stabil.
            </div>
          </div>

          <form onSubmit={onSaveEdit} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Display Name</label>
              <input
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                required
              />
            </div>

            <div className="md:col-span-2 flex gap-2">
              <button
                disabled={editLoading}
                className="itam-primary-action"
              >
                {editLoading ? "Saving..." : "Save Changes"}
              </button>

              <button
                type="button"
                onClick={cancelEdit}
                className="itam-secondary-action"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <div className="text-sm text-slate-500">Total: {items.length}</div>

        <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-[13px] leading-6">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="px-4 py-4 pr-6">Code</th>
                <th className="px-4 py-4 pr-6">Display Name</th>
                <th className="px-4 py-4 pr-6">Active</th>
                <th className="px-4 py-4 pr-6 text-right">Action</th>
              </tr>
            </thead>

            <tbody>
              {listLoading ? (
                // Skeleton loading - 5 placeholder rows
                <>
                  <SkeletonTableRow cols={4} />
                  <SkeletonTableRow cols={4} />
                  <SkeletonTableRow cols={4} />
                  <SkeletonTableRow cols={4} />
                  <SkeletonTableRow cols={4} />
                </>
              ) : items.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <td colSpan={4} className="px-4 py-8 text-slate-600">
                    Tidak ada asset types.
                  </td>
                </tr>
              ) : (
                items.map((a) => (
                  <tr key={String(a.id)} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-4 pr-6 font-mono text-xs text-slate-700">{a.code}</td>
                    <td className="px-4 py-4 pr-6 text-slate-900">{a.display_name}</td>
                    <td className="px-4 py-4 pr-6">
                      <span className={activePill(Boolean(a.active))}>
                        {a.active ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </td>
                    <td className="px-4 py-4 pr-6 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => startEdit(a)}
                        className="itam-secondary-action-sm"
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

        <div className="mt-4 text-xs text-slate-500">
          Tip: <b>code</b> dipakai oleh logic sistem, jadi yang editable hanya <b>display_name</b>.
        </div>
          </div>
      </div>
    </div>
  );
}
