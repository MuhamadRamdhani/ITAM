"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPatchJson, apiPostJson } from "../../lib/api";import { SkeletonTableRow, ErrorState } from "../../lib/loadingComponents";
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
  code: string | null;
  name: string;
};

type IdentityItem = {
  id: number;
  tenant_id: number;
  name: string;
  email: string | null;
  department_id: number | null;
  department_name?: string | null;
};

type IdentitiesListData = {
  total: number;
  items: IdentityItem[];
  page: number;
  page_size: number;
};

const ADMIN_ROLES = ["SUPERADMIN", "TENANT_ADMIN"] as const;

function hasAdminRole(roles: string[]) {
  return roles.some((r) => ADMIN_ROLES.includes(r as any));
}

export default function AdminIdentitiesClient() {
  const router = useRouter();

  const [me, setMe] = useState<MeData | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  const [pageSizeOptions, setPageSizeOptions] = useState<number[]>([]);
  const [pageSize, setPageSize] = useState<number>(10);

  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [listLoading, setListLoading] = useState(true);
  const [data, setData] = useState<IdentitiesListData>({
    total: 0,
    items: [],
    page: 1,
    page_size: 10,
  });

  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createDepartmentId, setCreateDepartmentId] = useState("");

  const [createLoading, setCreateLoading] = useState(false);

  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editDepartmentId, setEditDepartmentId] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

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
      setDepartmentsLoading(true);

      try {
        const meRes = await apiGet<MeData>("/api/v1/auth/me", {
          loadingKey: "identities_init",
        });
        if (cancelled) return;

        const meData = meRes.data;
        setMe(meData);

        if (!hasAdminRole(Array.isArray(meData.roles) ? meData.roles : [])) {
          setPageSizeOptions([]);
          setDepartments([]);
          return;
        }

        const cfgRes = await apiGet<UiConfig>("/api/v1/config/ui", {
          loadingKey: "identities_config",
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

        const maxPageSize =
          options.length > 0 ? Math.max(...options) : 100;

        const deptRes = await apiGet<{
          items: DepartmentItem[];
          total: number;
          page: number;
          page_size: number;
        }>(`/api/v1/admin/departments?page=1&page_size=${maxPageSize}`, {
          loadingKey: "identities_departments",
        });

        if (cancelled) return;

        const deptItems = Array.isArray(deptRes.data?.items) ? deptRes.data.items : [];
        setDepartments(deptItems);
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
        setErr(eAny?.message || "Failed to initialize identities page");
      } finally {
        if (!cancelled) {
          setMeLoading(false);
          setDepartmentsLoading(false);
        }
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function loadIdentities() {
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

        const res = await apiGet<IdentitiesListData>(
          `/api/v1/admin/identities?${qs.toString()}`,
          {
            loadingKey: "identities_list",
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

        setErr(eAny?.message || "Failed to load identities");
      } finally {
        if (!cancelled) setListLoading(false);
      }
    }

    loadIdentities();
    return () => {
      cancelled = true;
    };
  }, [meLoading, canAccess, page, pageSize, q]);

  async function reloadIdentities(customPage = page) {
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    qs.set("page", String(customPage));
    qs.set("page_size", String(pageSize));

    const res = await apiGet<IdentitiesListData>(
      `/api/v1/admin/identities?${qs.toString()}`
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

  async function onCreateIdentity(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    setCreateLoading(true);

    try {
      await apiPostJson<{ identity: IdentityItem }>("/api/v1/admin/identities", {
        name: createName.trim(),
        email: createEmail.trim() || null,
        department_id: createDepartmentId ? Number(createDepartmentId) : null,
      });

      setCreateName("");
      setCreateEmail("");
      setCreateDepartmentId("");
      setOk("Identity berhasil dibuat.");

      setPage(1);
      setQ("");
      setQInput("");

      await reloadIdentities(1);
    } catch (eAny: any) {
      if (eAny?.code === "IDENTITY_EMAIL_TAKEN") {
        setErr("Email identity sudah digunakan di tenant ini.");
      } else if (eAny?.code === "DEPARTMENT_NOT_FOUND") {
        setErr("Department yang dipilih tidak ditemukan.");
      } else {
        setErr(eAny?.message || "Failed to create identity");
      }
    } finally {
      setCreateLoading(false);
    }
  }

  function startEdit(item: IdentityItem) {
    setEditId(item.id);
    setEditName(item.name || "");
    setEditEmail(item.email || "");
    setEditDepartmentId(item.department_id ? String(item.department_id) : "");
    setErr(null);
    setOk(null);
  }

  function cancelEdit() {
    setEditId(null);
    setEditName("");
    setEditEmail("");
    setEditDepartmentId("");
  }

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;

    setErr(null);
    setOk(null);
    setEditLoading(true);

    try {
      await apiPatchJson<{ identity: IdentityItem }>(
        `/api/v1/admin/identities/${editId}`,
        {
          name: editName.trim(),
          email: editEmail.trim() || null,
          department_id: editDepartmentId ? Number(editDepartmentId) : null,
        }
      );

      setOk("Identity berhasil diupdate.");
      await reloadIdentities();
      cancelEdit();
    } catch (eAny: any) {
      if (eAny?.code === "IDENTITY_EMAIL_TAKEN") {
        setErr("Email identity sudah digunakan di tenant ini.");
      } else if (eAny?.code === "DEPARTMENT_NOT_FOUND") {
        setErr("Department yang dipilih tidak ditemukan.");
      } else {
        setErr(eAny?.message || "Failed to update identity");
      }
    } finally {
      setEditLoading(false);
    }
  }

  if (meLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm text-sm text-gray-600">
        Loading identities...
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

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <div className="text-base font-semibold text-gray-900">Create Identity</div>
          <div className="mt-1 text-sm text-gray-600">
            Tambahkan identity master untuk custodian / PIC tenant ini.
          </div>
        </div>

        <form onSubmit={onCreateIdentity} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Dhani"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              type="email"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="dhani@company.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Department</label>
            <select
              value={createDepartmentId}
              onChange={(e) => setCreateDepartmentId(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              disabled={departmentsLoading}
            >
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name}{d.code ? ` (${d.code})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <button
              disabled={createLoading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {createLoading ? "Creating..." : "Create Identity"}
            </button>
          </div>
        </form>
      </div>

      {editId ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div>
            <div className="text-base font-semibold text-gray-900">Edit Identity</div>
            <div className="mt-1 text-sm text-gray-600">
              Update name, email, dan department identity.
            </div>
          </div>

          <form onSubmit={onSaveEdit} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                type="email"
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Department</label>
              <select
                value={editDepartmentId}
                onChange={(e) => setEditDepartmentId(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                disabled={departmentsLoading}
              >
                <option value="">No department</option>
                {departments.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name}{d.code ? ` (${d.code})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3 flex gap-2">
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setQ(qInput.trim());
            }}
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <select
              value={String(pageSize)}
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value));
              }}
              className="rounded-md border px-3 py-2 text-sm"
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
              placeholder="Search name/email/department..."
              className="w-full sm:w-72 rounded-md border px-3 py-2 text-sm"
            />

            <button className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">
              Search
            </button>
          </form>
        </div>

        <div className="mt-4 text-sm text-gray-500">Total: {total}</div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Department</th>
                <th className="py-2 pr-4 text-right">Action</th>
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
              ) : data.items.length === 0 ? (
                <tr className="border-t">
                  <td colSpan={4} className="py-6 text-gray-600">
                    Tidak ada identities.
                  </td>
                </tr>
              ) : (
                data.items.map((i) => (
                  <tr key={String(i.id)} className="border-t">
                    <td className="py-3 pr-4">{i.name}</td>
                    <td className="py-3 pr-4">{i.email || "-"}</td>
                    <td className="py-3 pr-4">{i.department_name || "-"}</td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => startEdit(i)}
                        className="text-blue-700 hover:underline"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-500">
            Page {page} / {totalPages} (page_size: {pageSize})
          </div>

          <div className="flex gap-2">
            {canPrev ? (
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Prev
              </button>
            ) : (
              <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                Prev
              </span>
            )}

            {canNext ? (
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Next
              </button>
            ) : (
              <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                Next
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 text-xs text-gray-500">
          Tip: custodian aset pada model ITAM Anda mengacu ke identity.
        </div>
      </div>
    </div>
  );
}