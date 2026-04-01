"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPatchJson, apiPostJson } from "../../lib/api";
import { SkeletonTableRow } from "../../lib/loadingComponents";

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

type RoleItem = {
  code: string;
  display_name: string;
  is_system?: boolean;
};

type UserItem = {
  id: number;
  email: string;
  status_code: string;
  identity_id?: number | null;
  last_login_at?: string | null;
  disabled_at?: string | null;
  created_at?: string | null;
  roles?: string[];
};

type UsersListData = {
  total: number;
  items: UserItem[];
  page: number;
  page_size: number;
};

type ChangeRoleResp = {
  user_id: number;
  roles: string[];
};

type TenantItem = {
  id: number;
  code: string;
  name: string;
  status_code: string;
  plan_code?: string | null;
  contract_end_date?: string | null;
  contract_health?: string | null;
};

type TenantsListData = {
  total: number;
  items: TenantItem[];
  page: number;
  page_size: number;
};

const ADMIN_ROLES = ["SUPERADMIN", "TENANT_ADMIN"] as const;
const RESERVED_PLATFORM_ROLES = ["SUPERADMIN"] as const;

function hasAdminRole(roles: string[]) {
  return roles.some((r) => ADMIN_ROLES.includes(r as any));
}

function hasRole(roles: string[], roleCode: string) {
  return roles
    .map((r) => String(r || "").toUpperCase())
    .includes(String(roleCode || "").toUpperCase());
}

function isReservedPlatformRole(roleCode: string) {
  return RESERVED_PLATFORM_ROLES.includes(
    String(roleCode || "").toUpperCase() as (typeof RESERVED_PLATFORM_ROLES)[number]
  );
}

function userHasReservedPlatformRole(user: UserItem) {
  const roles = Array.isArray(user.roles) ? user.roles : [];
  return roles.some((r) => isReservedPlatformRole(r));
}

function fmtDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function statusPill(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE") return "inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200";
  if (s === "DISABLED") return "inline-flex rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200";
  return "inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200";
}

function tenantStatusPill(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE") return "inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200";
  if (s === "SUSPENDED") return "inline-flex rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200";
  return "inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200";
}

function buildUsersListUrl(
  basePath: string,
  searchQ: string,
  currentPage: number,
  currentPageSize: number | null
) {
  const qs = new URLSearchParams();
  if (searchQ.trim()) qs.set("q", searchQ.trim());
  qs.set("page", String(currentPage));
  if (Number.isFinite(currentPageSize) && Number(currentPageSize) > 0) {
    qs.set("page_size", String(currentPageSize));
  }
  return `${basePath}?${qs.toString()}`;
}

export default function AdminUsersClient() {
  const router = useRouter();

  const [me, setMe] = useState<MeData | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);

  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);

  const [pageSizeOptions, setPageSizeOptions] = useState<number[]>([]);
  const [pageSize, setPageSize] = useState<number | null>(10);

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [listLoading, setListLoading] = useState(true);
  const [usersData, setUsersData] = useState<UsersListData>({
    total: 0,
    items: [],
    page: 1,
    page_size: 10,
  });

  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createStatus, setCreateStatus] = useState("ACTIVE");
  const [createLoading, setCreateLoading] = useState(false);

  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [selectedRoleByUser, setSelectedRoleByUser] = useState<Record<number, string>>({});

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const canAccess = useMemo(() => {
    return hasAdminRole(Array.isArray(me?.roles) ? me!.roles : []);
  }, [me]);

  const isSuperadmin = useMemo(() => {
    return hasRole(Array.isArray(me?.roles) ? me!.roles : [], "SUPERADMIN");
  }, [me]);

  const selectedTenant = useMemo(() => {
    return tenants.find((t) => Number(t.id) === Number(selectedTenantId)) || null;
  }, [tenants, selectedTenantId]);

  const usersBasePath = useMemo(() => {
    if (!canAccess) return null;
    if (isSuperadmin) {
      if (!selectedTenantId) return null;
      return `/api/v1/superadmin/tenants/${selectedTenantId}/users`;
    }
    return "/api/v1/users";
  }, [canAccess, isSuperadmin, selectedTenantId]);

  const rolesPath = useMemo(() => {
    if (!canAccess) return null;
    if (isSuperadmin) {
      if (!selectedTenantId) return null;
      return `/api/v1/superadmin/tenants/${selectedTenantId}/roles`;
    }
    return "/api/v1/roles";
  }, [canAccess, isSuperadmin, selectedTenantId]);

  const total = Number(usersData.total ?? 0);
  const effectivePageSize = Number(pageSize ?? usersData.page_size ?? 10) || 10;
  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / effectivePageSize)) : 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setErr(null);
      setOk(null);
      setMeLoading(true);
      setTenantsLoading(false);

      try {
        const meRes = await apiGet<MeData>("/api/v1/auth/me", {
          loadingKey: "users_init",
        });
        if (cancelled) return;

        const meData = meRes.data;
        setMe(meData);

        if (!hasAdminRole(Array.isArray(meData.roles) ? meData.roles : [])) {
          setRoles([]);
          setTenants([]);
          setSelectedTenantId(null);
          setPageSizeOptions([]);
          return;
        }

        if (hasRole(meData.roles || [], "SUPERADMIN")) {
          setTenantsLoading(true);

          const tenantsRes = await apiGet<TenantsListData>("/api/v1/superadmin/tenants?page=1", {
            loadingKey: "users_tenants",
          });
          if (cancelled) return;

          const tenantItems = Array.isArray(tenantsRes.data?.items) ? tenantsRes.data.items : [];
          setTenants(tenantItems);

          const preferredTenantId = tenantItems.some(
            (t) => Number(t.id) === Number(meData.tenant_id)
          )
            ? Number(meData.tenant_id)
            : tenantItems.length > 0
            ? Number(tenantItems[0].id)
            : null;

          setSelectedTenantId(preferredTenantId);
          setPageSizeOptions([]);
          setPageSize(null);
        }
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
        setErr(eAny?.message || "Failed to initialize admin users page");
      } finally {
        if (!cancelled) {
          setMeLoading(false);
          setTenantsLoading(false);
        }
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!isSuperadmin) return;

    setErr(null);
    setOk(null);
    setQ("");
    setQInput("");
    setPage(1);
    setRoles([]);
    setSelectedRoleByUser({});
    setUsersData({
      total: 0,
      items: [],
      page: 1,
      page_size: 10,
    });
    setPageSize(null);
  }, [isSuperadmin, selectedTenantId]);

  useEffect(() => {
    let cancelled = false;

    async function loadContextData() {
      if (meLoading) return;
      if (!canAccess) return;

      setRolesLoading(true);

      try {
        if (isSuperadmin) {
          if (!rolesPath) {
            setRoles([]);
            return;
          }

          const rolesRes = await apiGet<{ items: RoleItem[] }>(rolesPath, {
            loadingKey: "users_roles_superadmin",
          });
          if (cancelled) return;

          setRoles(Array.isArray(rolesRes.data?.items) ? rolesRes.data.items : []);
          setPageSizeOptions([]);
          return;
        }

        const [cfgRes, rolesRes] = await Promise.all([
          apiGet<UiConfig>("/api/v1/config/ui", {
            loadingKey: "users_config",
          }),
          apiGet<{ items: RoleItem[] }>("/api/v1/roles", {
            loadingKey: "users_roles",
          }),
        ]);

        if (cancelled) return;

        const cfg = cfgRes.data;
        const optionsRaw = Array.isArray(cfg?.page_size_options) ? cfg.page_size_options : [];
        const options = optionsRaw
          .map((x) => Number(x))
          .filter((n) => Number.isFinite(n) && n > 0);

        const pageSizeDefault = Number(cfg?.documents_page_size_default);
        const nextPageSize =
          options.includes(pageSizeDefault) ? pageSizeDefault : options[0] || 10;

        setPageSizeOptions(options);
        setPageSize((prev) => {
          if (Number.isFinite(prev) && prev && options.includes(Number(prev))) {
            return Number(prev);
          }
          return nextPageSize;
        });

        setRoles(Array.isArray(rolesRes.data?.items) ? rolesRes.data.items : []);
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
        setErr(eAny?.message || "Failed to load admin users context");
      } finally {
        if (!cancelled) setRolesLoading(false);
      }
    }

    loadContextData();
    return () => {
      cancelled = true;
    };
  }, [meLoading, canAccess, isSuperadmin, rolesPath, router]);

  async function reloadUsersWith(
    nextPage: number,
    nextQ: string,
    nextPageSize: number | null
  ) {
    if (!usersBasePath) return;

    const res = await apiGet<UsersListData>(
      buildUsersListUrl(usersBasePath, nextQ, nextPage, nextPageSize)
    );

    const data = res.data ?? {
      total: 0,
      items: [],
      page: nextPage,
      page_size: nextPageSize ?? 10,
    };

    setUsersData({
      total: Number(data.total ?? 0),
      items: Array.isArray(data.items) ? data.items : [],
      page: Number(data.page ?? nextPage),
      page_size: Number(data.page_size ?? nextPageSize ?? 10),
    });

    const serverPageSize = Number(data.page_size ?? 0);
    if (Number.isFinite(serverPageSize) && serverPageSize > 0) {
      setPageSize(serverPageSize);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      if (meLoading) return;
      if (!canAccess) return;
      if (!usersBasePath) {
        setListLoading(false);
        setUsersData({
          total: 0,
          items: [],
          page: 1,
          page_size: Number(pageSize ?? 10),
        });
        return;
      }

      if (!isSuperadmin && (!pageSize || pageSize <= 0)) return;

      setListLoading(true);
      setErr(null);

      try {
        const res = await apiGet<UsersListData>(
          buildUsersListUrl(usersBasePath, q, page, pageSize),
          {
            loadingKey: "users_list",
            loadingDelay: 300,
          }
        );

        if (cancelled) return;

        const data = res.data ?? {
          total: 0,
          items: [],
          page,
          page_size: Number(pageSize ?? 10),
        };

        setUsersData({
          total: Number(data.total ?? 0),
          items: Array.isArray(data.items) ? data.items : [],
          page: Number(data.page ?? page),
          page_size: Number(data.page_size ?? pageSize ?? 10),
        });

        const serverPageSize = Number(data.page_size ?? 0);
        if (Number.isFinite(serverPageSize) && serverPageSize > 0) {
          setPageSize(serverPageSize);
        }
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

        if (eAny?.code === "FORBIDDEN" || eAny?.http_status === 403) {
          setErr("Forbidden. Halaman ini hanya untuk SUPERADMIN atau TENANT_ADMIN.");
          return;
        }

        if (eAny?.code === "INVALID_PAGE_SIZE") {
          setErr("Page size tidak valid menurut config server.");
          return;
        }

        setErr(eAny?.message || "Failed to load users");
      } finally {
        if (!cancelled) setListLoading(false);
      }
    }

    loadUsers();
    return () => {
      cancelled = true;
    };
  }, [meLoading, canAccess, isSuperadmin, usersBasePath, page, pageSize, q, router]);

  async function onCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (createLoading) return;
    if (!usersBasePath) return;

    setErr(null);
    setOk(null);
    setCreateLoading(true);

    try {
      await apiPostJson<{ user: UserItem }>(usersBasePath, {
        email: createEmail.trim(),
        password: createPassword,
        status_code: createStatus,
      });

      setCreateEmail("");
      setCreatePassword("");
      setCreateStatus("ACTIVE");
      setOk("User berhasil dibuat.");

      setPage(1);
      setQ("");
      setQInput("");

      await reloadUsersWith(1, "", pageSize);
    } catch (eAny: any) {
      if (eAny?.code === "USER_EMAIL_TAKEN") {
        setErr("Email sudah digunakan pada tenant ini.");
      } else {
        setErr(eAny?.message || "Failed to create user");
      }
    } finally {
      setCreateLoading(false);
    }
  }

  async function onToggleStatus(user: UserItem) {
    if (busyUserId === user.id) return;
    if (!usersBasePath) return;

    if (!isSuperadmin && userHasReservedPlatformRole(user)) {
      setErr("User platform-managed hanya bisa diubah oleh SUPERADMIN.");
      return;
    }

    setErr(null);
    setOk(null);
    setBusyUserId(user.id);

    const nextStatus =
      String(user.status_code || "").toUpperCase() === "ACTIVE" ? "DISABLED" : "ACTIVE";

    try {
      await apiPatchJson<{ user: UserItem }>(`${usersBasePath}/${user.id}`, {
        status_code: nextStatus,
      });

      setUsersData((prev) => ({
        ...prev,
        items: prev.items.map((x) =>
          x.id === user.id ? { ...x, status_code: nextStatus } : x
        ),
      }));

      setOk(`Status user ${user.email} berubah ke ${nextStatus}.`);
    } catch (eAny: any) {
      if (
        eAny?.code === "FORBIDDEN_TARGET_USER_SCOPE" ||
        eAny?.code === "FORBIDDEN_ROLE_SCOPE"
      ) {
        setErr("User platform-managed hanya bisa diubah oleh SUPERADMIN.");
      } else {
        setErr(eAny?.message || "Failed to update user status");
      }
    } finally {
      setBusyUserId(null);
    }
  }

  async function onChangeRole(user: UserItem, op: "ADD" | "REMOVE", roleCode: string) {
    if (busyUserId === user.id) return;
    if (!usersBasePath) return;

    if (!isSuperadmin && userHasReservedPlatformRole(user)) {
      setErr("Role user platform-managed hanya bisa diubah oleh SUPERADMIN.");
      return;
    }

    setErr(null);
    setOk(null);
    setBusyUserId(user.id);

    try {
      const res = await apiPostJson<ChangeRoleResp>(`${usersBasePath}/${user.id}/roles`, {
        op,
        role_code: roleCode,
      });

      const nextRoles = Array.isArray(res.data?.roles) ? res.data.roles : [];

      setUsersData((prev) => ({
        ...prev,
        items: prev.items.map((x) =>
          x.id === user.id ? { ...x, roles: nextRoles } : x
        ),
      }));

      setSelectedRoleByUser((prev) => {
        const next = { ...prev };
        delete next[user.id];
        return next;
      });

      setOk(
        op === "ADD"
          ? `Role ${roleCode} ditambahkan ke ${user.email}.`
          : `Role ${roleCode} dihapus dari ${user.email}.`
      );
    } catch (eAny: any) {
      if (eAny?.code === "MIN_ROLE_REQUIRED") {
        setErr(`User ${user.email} harus punya minimal 1 role. Role terakhir tidak boleh dihapus.`);
      } else if (eAny?.code === "ROLE_NOT_FOUND") {
        setErr(`Role ${roleCode} tidak ditemukan.`);
      } else if (
        eAny?.code === "FORBIDDEN_TARGET_USER_SCOPE" ||
        eAny?.code === "FORBIDDEN_ROLE_SCOPE"
      ) {
        setErr("Role user platform-managed hanya bisa diubah oleh SUPERADMIN.");
      } else {
        setErr(eAny?.message || "Failed to change user role");
      }
    } finally {
      setBusyUserId(null);
    }
  }

  if (meLoading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        Loading admin users...
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <div className="text-lg font-semibold text-slate-900">Forbidden</div>
        <div className="mt-1 text-sm text-slate-600">
          Halaman ini hanya bisa diakses oleh role SUPERADMIN atau TENANT_ADMIN.
        </div>
      </div>
    );
  }

  if (isSuperadmin && tenantsLoading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        Loading tenants...
      </div>
    );
  }

  if (isSuperadmin && tenants.length === 0) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <div className="text-lg font-semibold text-slate-900">No tenant available</div>
        <div className="mt-1 text-sm text-slate-600">
          Belum ada tenant yang tersedia untuk dikelola oleh SUPERADMIN.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(err || ok) && (
        <div className="space-y-2">
          {err ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {err}
            </div>
          ) : null}

          {ok ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {ok}
            </div>
          ) : null}
        </div>
      )}

      {isSuperadmin ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex-1">
              <div className="text-base font-semibold text-slate-900">SUPERADMIN Target Tenant</div>
              <div className="mt-1 text-sm leading-6 text-slate-600">
                Pilih tenant target. Semua list user, create user, enable/disable, dan assign role
                akan mengikuti tenant yang dipilih.
              </div>
            </div>

            <div className="w-full lg:w-[380px]">
              <label className="block text-sm font-medium text-slate-700">Target Tenant</label>
              <select
                value={selectedTenantId != null ? String(selectedTenantId) : ""}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSelectedTenantId(Number.isFinite(v) && v > 0 ? v : null);
                }}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.code} — {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedTenant ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-700">
              <span className="rounded-full bg-slate-50 px-3 py-1 font-medium ring-1 ring-inset ring-slate-200">
                Tenant ID: {selectedTenant.id}
              </span>
              <span className="rounded-full bg-slate-50 px-3 py-1 font-medium ring-1 ring-inset ring-slate-200">
                Code: {selectedTenant.code}
              </span>
              <span className={tenantStatusPill(selectedTenant.status_code)}>
                {selectedTenant.status_code}
              </span>
              {selectedTenant.contract_health ? (
                <span className="rounded-full bg-slate-50 px-3 py-1 font-medium ring-1 ring-inset ring-slate-200">
                  Subscription: {selectedTenant.contract_health}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <div>
          <div className="text-base font-semibold text-slate-900">Create User</div>
          <div className="mt-1 text-sm leading-6 text-slate-600">
            {isSuperadmin && selectedTenant
              ? `Buat user baru untuk tenant ${selectedTenant.code} (${selectedTenant.name}), lalu assign role dari tabel di bawah.`
              : "Buat user tenant baru, lalu assign role dari tabel di bawah."}
          </div>
        </div>

        <form onSubmit={onCreateUser} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              type="email"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              placeholder={
                isSuperadmin && selectedTenant
                  ? `user@${selectedTenant.code}.local`
                  : "user@default.local"
              }
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Password</label>
            <input
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              type="password"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              placeholder="Min 6 chars"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Status</label>
            <select
              value={createStatus}
              onChange={(e) => setCreateStatus(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="DISABLED">DISABLED</option>
            </select>
          </div>

          <div className="md:col-span-4">
            <button
              disabled={createLoading || (isSuperadmin && !selectedTenantId)}
              className="itam-primary-action"
            >
              {createLoading ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setQ(qInput.trim());
            }}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            {!isSuperadmin ? (
              <select
                value={String(effectivePageSize)}
                onChange={(e) => {
                  setPage(1);
                  setPageSize(Number(e.target.value));
                }}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              >
                {pageSizeOptions.map((n) => (
                  <option key={n} value={String(n)}>
                    {n} / page
                  </option>
                ))}
              </select>
            ) : null}

            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search email..."
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 sm:w-80"
            />

            <button className="itam-primary-action-sm">
              Search
            </button>
          </form>

          <div className="text-xs text-slate-500">
            Roles loaded: {rolesLoading ? "loading..." : roles.length}
            {isSuperadmin && selectedTenant ? ` • Target: ${selectedTenant.code}` : ""}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-slate-500">
          <div>Total: {total}</div>
          {isSuperadmin ? (
            <div>
              Server page_size: <b>{effectivePageSize}</b>
            </div>
          ) : null}
        </div>

        <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-[13px] leading-6">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="px-4 py-4 pr-6 font-medium">Email</th>
                <th className="px-4 py-4 pr-6 font-medium">Status</th>
                <th className="px-4 py-4 pr-6 font-medium">Roles</th>
                <th className="px-4 py-4 pr-6 font-medium">Last Login</th>
                <th className="px-4 py-4 pr-6 text-right font-medium">Action</th>
              </tr>
            </thead>

              <tbody>
              {listLoading ? (
                <>
                  <SkeletonTableRow cols={5} />
                  <SkeletonTableRow cols={5} />
                  <SkeletonTableRow cols={5} />
                  <SkeletonTableRow cols={5} />
                  <SkeletonTableRow cols={5} />
                </>
              ) : usersData.items.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <td colSpan={5} className="px-4 py-10 text-slate-600">
                    Tidak ada users.
                  </td>
                </tr>
              ) : (
                usersData.items.map((u) => {
                  const currentRoles = Array.isArray(u.roles) ? u.roles : [];
                  const addableRoles = roles.filter((r) => !currentRoles.includes(r.code));
                  const selectedRole =
                    selectedRoleByUser[u.id] ?? (addableRoles[0]?.code || "");
                  const isBusy = busyUserId === u.id;
                  const isPlatformManaged = !isSuperadmin && userHasReservedPlatformRole(u);

                  return (
                    <tr
                      key={String(u.id)}
                      className={`border-t border-slate-100 align-top ${
                        isPlatformManaged ? "bg-amber-50/40" : ""
                      }`}
                    >
                      <td className="px-4 py-5 pr-6">
                        <div className="font-medium text-slate-900">{u.email}</div>
                        <div className="mt-1 text-xs text-slate-500">ID: {u.id}</div>
                        {isPlatformManaged ? (
                          <div className="mt-2">
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                              Platform-managed
                            </span>
                          </div>
                        ) : null}
                      </td>

                      <td className="px-4 py-5 pr-6">
                        <span className={statusPill(u.status_code)}>{u.status_code}</span>
                      </td>

                      <td className="px-4 py-5 pr-6">
                        <div className="flex flex-wrap gap-2">
                          {currentRoles.length > 0 ? (
                            currentRoles.map((roleCode) => {
                              const roleMeta = roles.find((r) => r.code === roleCode);
                              const label = roleMeta?.display_name || roleCode;
                              const canRemoveRole = !isPlatformManaged && !isBusy;

                              return (
                                <span
                                  key={roleCode}
                                  className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200"
                                >
                                  <span>{label}</span>
                                  {canRemoveRole ? (
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => onChangeRole(u, "REMOVE", roleCode)}
                                      className="font-semibold text-slate-500 hover:text-rose-600 disabled:opacity-50"
                                      title={`Remove ${label}`}
                                    >
                                      ×
                                    </button>
                                  ) : null}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-xs font-medium text-amber-700">No role</span>
                          )}
                        </div>

                        {isPlatformManaged ? (
                          <div className="mt-3 text-xs leading-5 text-amber-800">
                            Role user ini hanya bisa dikelola oleh SUPERADMIN.
                          </div>
                        ) : (
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <select
                              value={selectedRole}
                              onChange={(e) =>
                                setSelectedRoleByUser((prev) => ({
                                  ...prev,
                                  [u.id]: e.target.value,
                                }))
                              }
                              disabled={addableRoles.length === 0 || isBusy}
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 sm:w-60"
                            >
                              {addableRoles.length === 0 ? (
                                <option value="">All roles assigned</option>
                              ) : (
                                addableRoles.map((r) => (
                                  <option key={r.code} value={r.code}>
                                    {r.display_name}
                                  </option>
                                ))
                              )}
                            </select>

                            <button
                              type="button"
                              disabled={!selectedRole || addableRoles.length === 0 || isBusy}
                              onClick={() => onChangeRole(u, "ADD", selectedRole)}
                              className="itam-secondary-action-sm"
                            >
                              Add Role
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-5 pr-6 whitespace-nowrap">{fmtDateTime(u.last_login_at)}</td>

                      <td className="px-4 py-5 pr-6 text-right whitespace-nowrap">
                        {isPlatformManaged ? (
                          <span className="itam-secondary-action-sm opacity-60">
                            Restricted
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onToggleStatus(u)}
                            className="itam-secondary-action-sm"
                          >
                            {String(u.status_code).toUpperCase() === "ACTIVE"
                              ? "Disable"
                              : "Enable"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-500">
            Page {page} / {totalPages} (page_size: {effectivePageSize})
          </div>

          <div className="flex gap-2">
            {canPrev ? (
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="itam-secondary-action-sm"
              >
                Prev
              </button>
            ) : (
              <span className="itam-secondary-action-sm cursor-not-allowed opacity-50">
                Prev
              </span>
            )}

            {canNext ? (
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="itam-secondary-action-sm"
              >
                Next
              </button>
            ) : (
              <span className="itam-secondary-action-sm cursor-not-allowed opacity-50">
                Next
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          Tip: display role memakai <b>roles.display_name</b>, bukan hardcoded label.
        </div>
      </div>
    </div>
  );
}
