"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiDelete, apiGet, apiPatchJson, apiPostJson } from "../../lib/api";
import { SkeletonTableRow } from "../../lib/loadingComponents";
import ConfirmDangerDialog from "@/app/components/ConfirmDangerDialog";
import ActionToast from "@/app/components/ActionToast";

type MeData = {
  tenant_id: number;
  user_id: number;
  roles: string[];
  identity_id: number | null;
};

type UiConfig = {
  page_size_options: number[];
  documents_page_size_default: number;
};

type DepartmentItem = {
  id: number;
  tenant_id: number;
  code: string | null;
  name: string;
};

type DepartmentsListData = {
  total: number;
  items: DepartmentItem[];
  page: number;
  page_size: number;
};

const ADMIN_ROLES = ["SUPERADMIN", "TENANT_ADMIN"] as const;

function hasAdminRole(roles: string[]) {
  return roles.some((r) => ADMIN_ROLES.includes(r as any));
}

export default function AdminDepartmentsClient() {
  const router = useRouter();

  const [me, setMe] = useState<MeData | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  const [pageSizeOptions, setPageSizeOptions] = useState<number[]>([]);
  const [pageSize, setPageSize] = useState<number>(10);

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [listLoading, setListLoading] = useState(true);
  const [data, setData] = useState<DepartmentsListData>({
    total: 0,
    items: [],
    page: 1,
    page_size: 10,
  });

  const [createCode, setCreateCode] = useState("");
  const [createName, setCreateName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  const [editId, setEditId] = useState<number | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const canAccess = useMemo(() => {
    return hasAdminRole(Array.isArray(me?.roles) ? me!.roles : []);
  }, [me]);

  const total = Number(data.total ?? 0);
  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setErr(null);
      setOk(null);
      setMeLoading(true);

      try {
        const meRes = await apiGet<MeData>("/api/v1/auth/me", {
          loadingKey: "departments_init",
        });
        if (cancelled) return;

        const meData = meRes.data;
        setMe(meData);

        if (!hasAdminRole(Array.isArray(meData.roles) ? meData.roles : [])) {
          setPageSizeOptions([]);
          return;
        }

        const cfgRes = await apiGet<UiConfig>("/api/v1/config/ui", {
          loadingKey: "departments_config",
        });
        if (cancelled) return;

        const cfg = cfgRes.data;
        const optionsRaw = Array.isArray(cfg?.page_size_options)
          ? cfg.page_size_options
          : [];
        const options = optionsRaw
          .map((x) => Number(x))
          .filter((n) => Number.isFinite(n) && n > 0);

        const pageSizeDefault = Number(cfg?.documents_page_size_default);
        const nextPageSize =
          options.includes(pageSizeDefault) ? pageSizeDefault : options[0] || 10;

        setPageSizeOptions(options);
        setPageSize(nextPageSize);
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
        setErr(eAny?.message || "Failed to initialize departments page");
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function loadDepartments() {
      if (meLoading) return;
      if (!canAccess) return;
      if (!pageSize) return;

      setListLoading(true);
      setErr(null);

      try {
        const qs = new URLSearchParams();
        if (q.trim()) qs.set("q", q.trim());
        qs.set("page", String(page));
        qs.set("page_size", String(pageSize));

        const res = await apiGet<DepartmentsListData>(
          `/api/v1/admin/departments?${qs.toString()}`,
          {
            loadingKey: "departments_list",
            loadingDelay: 300,
          }
        );
        if (cancelled) return;

        const out = res.data ?? {
          total: 0,
          items: [],
          page: 1,
          page_size: pageSize,
        };

        setData({
          total: Number(out.total ?? 0),
          items: Array.isArray(out.items) ? out.items : [],
          page: Number(out.page ?? page),
          page_size: Number(out.page_size ?? pageSize),
        });
      } catch (eAny: any) {
        if (eAny?.code === "FORBIDDEN" || eAny?.http_status === 403) {
          setErr("Forbidden. Halaman ini hanya untuk SUPERADMIN atau TENANT_ADMIN.");
          return;
        }

        if (eAny?.code === "INVALID_PAGE_SIZE") {
          setErr("Page size tidak valid menurut config server.");
          return;
        }

        setErr(eAny?.message || "Failed to load departments");
      } finally {
        if (!cancelled) setListLoading(false);
      }
    }

    loadDepartments();
    return () => {
      cancelled = true;
    };
  }, [meLoading, canAccess, page, pageSize, q]);

  async function reloadDepartments(customPage = page) {
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    qs.set("page", String(customPage));
    qs.set("page_size", String(pageSize));

    const res = await apiGet<DepartmentsListData>(
      `/api/v1/admin/departments?${qs.toString()}`
    );

    const out = res.data ?? {
      total: 0,
      items: [],
      page: customPage,
      page_size: pageSize,
    };

    setData({
      total: Number(out.total ?? 0),
      items: Array.isArray(out.items) ? out.items : [],
      page: Number(out.page ?? customPage),
      page_size: Number(out.page_size ?? pageSize),
    });
  }

  async function onCreateDepartment(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    setCreateLoading(true);

    try {
      await apiPostJson<{ department: DepartmentItem }>("/api/v1/admin/departments", {
        code: createCode.trim() || null,
        name: createName.trim(),
      });

      setCreateCode("");
      setCreateName("");
      setOk("Department berhasil dibuat.");

      setPage(1);
      setQ("");
      setQInput("");

      await reloadDepartments(1);
    } catch (eAny: any) {
      if (eAny?.code === "DEPARTMENT_CODE_TAKEN") {
        setErr("Code department sudah digunakan di tenant ini.");
      } else {
        setErr(eAny?.message || "Failed to create department");
      }
    } finally {
      setCreateLoading(false);
    }
  }

  function startEdit(item: DepartmentItem) {
    setEditId(item.id);
    setEditCode(item.code || "");
    setEditName(item.name || "");
    setErr(null);
    setOk(null);
  }

  function cancelEdit() {
    setEditId(null);
    setEditCode("");
    setEditName("");
  }

  async function onDeleteDepartment() {
    if (!deleteId || deleteLoading) return;

    setErr(null);
    setOk(null);
    setDeleteLoading(true);

    try {
      await apiDelete(`/api/v1/admin/departments/${deleteId}`);
      setToast({
        type: "success",
        message: "Department berhasil dihapus.",
      });
      setDeleteId(null);
      await reloadDepartments();
    } catch (eAny: any) {
      if (eAny?.code === "DEPARTMENT_IN_USE") {
        setToast({
          type: "error",
          message: "Department masih dipakai oleh asset, identity, atau history.",
        });
      } else {
        setToast({
          type: "error",
          message: eAny?.message || "Failed to delete department",
        });
      }
    } finally {
      setDeleteLoading(false);
    }
  }

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;

    setErr(null);
    setOk(null);
    setEditLoading(true);

    try {
      await apiPatchJson<{ department: DepartmentItem }>(
        `/api/v1/admin/departments/${editId}`,
        {
          code: editCode.trim() || null,
          name: editName.trim(),
        }
      );

      setOk("Department berhasil diupdate.");
      await reloadDepartments();
      cancelEdit();
    } catch (eAny: any) {
      if (eAny?.code === "DEPARTMENT_CODE_TAKEN") {
        setErr("Code department sudah digunakan di tenant ini.");
      } else {
        setErr(eAny?.message || "Failed to update department");
      }
    } finally {
      setEditLoading(false);
    }
  }

  if (meLoading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
        Loading departments...
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
      <ActionToast
        open={Boolean(toast)}
        type={toast?.type || "success"}
        message={toast?.message || ""}
        onClose={() => setToast(null)}
      />
      <ConfirmDangerDialog
        open={deleteId != null}
        title="Delete department"
        description="Department akan dihapus permanen jika tidak sedang dipakai oleh asset, identity, atau asset ownership history."
        confirmLabel="Delete Department"
        loading={deleteLoading}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void onDeleteDepartment()}
      />

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

      <div className="rounded-3xl border border-white bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">
            Create Department
          </div>
          <div className="mt-2 text-sm text-slate-600">
            Tambahkan department master untuk tenant ini.
          </div>
        </div>

        <form onSubmit={onCreateDepartment} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">Code</label>
            <input
              value={createCode}
              onChange={(e) => setCreateCode(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
              placeholder="IT / PROC / FIN"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700">Name</label>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
              placeholder="Finance"
              required
            />
          </div>

          <div className="md:col-span-3">
            <button
              disabled={createLoading}
              className="itam-primary-action"
            >
              {createLoading ? "Creating..." : "Create Department"}
            </button>
          </div>
        </form>
      </div>

      {editId ? (
        <div className="rounded-3xl border border-white bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">
              Edit Department
            </div>
            <div className="mt-2 text-sm text-slate-600">
              Update code dan name department.
            </div>
          </div>

          <form onSubmit={onSaveEdit} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Code</label>
              <input
                value={editCode}
                onChange={(e) => setEditCode(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700">Name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                required
              />
            </div>

            <div className="md:col-span-3 flex gap-2">
              <button
                disabled={editLoading}
                className="itam-primary-action"
              >
                {editLoading ? "Saving..." : "Save Changes"}
              </button>

              <button
                type="button"
                onClick={cancelEdit}
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="rounded-3xl border border-white bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setQ(qInput.trim());
            }}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <select
              value={String(pageSize)}
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value));
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={String(n)}>
                  {n} / page
                </option>
              ))}
            </select>

            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search code/name..."
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 sm:w-72"
            />

            <button className="itam-primary-action">
              Search
            </button>
          </form>
        </div>

        <div className="mt-5 flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Departments Table
            </div>
            <div className="mt-1 text-sm text-slate-600">Total: {total} items</div>
          </div>
          <div className="text-xs text-slate-500">Tip: owner aset pada model ITAM Anda mengacu ke department.</div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-3 pr-4">Code</th>
                <th className="py-3 pr-4">Name</th>
                <th className="py-3 pr-4 text-right">Action</th>
              </tr>
            </thead>

            <tbody>
              {listLoading ? (
                <>
                  <SkeletonTableRow cols={3} />
                  <SkeletonTableRow cols={3} />
                  <SkeletonTableRow cols={3} />
                  <SkeletonTableRow cols={3} />
                  <SkeletonTableRow cols={3} />
                </>
              ) : data.items.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <td colSpan={3} className="py-8 text-slate-600">
                    Tidak ada departments.
                  </td>
                </tr>
              ) : (
                data.items.map((d) => (
                  <tr key={String(d.id)} className="border-t border-slate-100">
                    <td className="py-4 pr-4 font-mono text-xs text-slate-500">{d.code || "-"}</td>
                    <td className="py-4 pr-4 text-slate-800">{d.name}</td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(d)}
                          className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:border-cyan-300 hover:bg-cyan-100 hover:text-cyan-800"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeleteId(d.id)}
                          className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-500">
            Page {page} / {totalPages} (page_size: {pageSize})
          </div>

          <div className="flex gap-2">
            {canPrev ? (
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-full border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Prev
              </button>
            ) : (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-400">
                Prev
              </span>
            )}

            {canNext ? (
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-full border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Next
              </button>
            ) : (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-400">
                Next
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
