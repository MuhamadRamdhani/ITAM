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
    ? "rounded-full bg-green-50 px-2 py-1 text-xs text-green-800"
    : "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
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
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm text-sm text-gray-600">
        Loading asset types...
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-4 shadow-sm">
        <div className="text-lg font-semibold text-gray-900">Forbidden</div>
        <div className="mt-1 text-sm text-gray-600">
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
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          ) : null}
          {ok ? (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {ok}
            </div>
          ) : null}
        </div>
      )}

      {editId ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div>
            <div className="text-base font-semibold text-gray-900">Edit Asset Type Label</div>
            <div className="mt-1 text-sm text-gray-600">
              Hanya <b>display_name</b> yang boleh diubah. <b>code</b> tetap stabil.
            </div>
          </div>

          <form onSubmit={onSaveEdit} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Display Name</label>
              <input
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="md:col-span-2 flex gap-2">
              <button
                disabled={editLoading}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {editLoading ? "Saving..." : "Save Changes"}
              </button>

              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-sm text-gray-500">Total: {items.length}</div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Display Name</th>
                <th className="py-2 pr-4">Active</th>
                <th className="py-2 pr-4 text-right">Action</th>
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
                <tr className="border-t">
                  <td colSpan={4} className="py-6 text-gray-600">
                    Tidak ada asset types.
                  </td>
                </tr>
              ) : (
                items.map((a) => (
                  <tr key={String(a.id)} className="border-t">
                    <td className="py-3 pr-4 font-mono text-xs">{a.code}</td>
                    <td className="py-3 pr-4">{a.display_name}</td>
                    <td className="py-3 pr-4">
                      <span className={activePill(Boolean(a.active))}>
                        {a.active ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => startEdit(a)}
                        className="text-blue-700 hover:underline"
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

        <div className="mt-3 text-xs text-gray-500">
          Tip: <b>code</b> dipakai oleh logic sistem, jadi yang editable hanya <b>display_name</b>.
        </div>
      </div>
    </div>
  );
}