import { expect, test, type Page } from "@playwright/test";

type Credentials = {
  tenantCode: string;
  email: string;
  password: string;
};

type ApiResponse<T = any> = {
  ok?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

type IdentityItem = {
  id: number;
  display_name?: string;
  name?: string;
  email?: string;
};

const USERS = {
  tenantAdmin: {
    tenantCode: "bni",
    email: "dhani@bni.com",
    password: "123456",
  },
  auditor: {
    tenantCode: "bni",
    email: "boy@bni.com",
    password: "123456",
  },
  itamManager: {
    tenantCode: "bni",
    email: "testing@bni.com",
    password: "12345678",
  },
  superadmin: {
    tenantCode: "default",
    email: "admin@default.local",
    password: "admin123",
  },
} satisfies Record<string, Credentials>;

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");

const DEFAULT_SCOPE_JSON = {
  asset_type_codes: ["HARDWARE", "SOFTWARE", "SAAS"],
  department_ids: [],
  location_ids: [],
  environments: ["ON_PREM"],
  notes: "Initial scope draft",
  stakeholder_summary: "Initial stakeholder summary",
};

let createdScopeVersionId: number | null = null;
let activatedScopeVersionId: number | null = null;
let createdContextId: number | null = null;
let createdStakeholderId: number | null = null;
let createdContextTitle = "";
let createdStakeholderName = "";
let monitoringContextTitle = "";
let monitoringStakeholderName = "";
let supersedeScopeVersionId: number | null = null;

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function toIsoDate(d: Date) {
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function futureDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

function displayDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days - 1);
  return toIsoDate(d);
}

async function browserJson(page: Page, path: string, init?: { method?: string; body?: unknown }) {
  return await page.evaluate(
    async ({ apiBase, path, init }) => {
      const headers: Record<string, string> = {};
      let body: string | undefined;

      if (init?.body !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(init.body);
      }

      const res = await fetch(`${apiBase}${path}`, {
        method: init?.method || "GET",
        credentials: "include",
        headers,
        body,
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok) {
        const err = new Error(json?.error?.message || json?.message || `Request failed (${res.status})`);
        (err as any).status = res.status;
        (err as any).code = json?.error?.code || json?.code;
        (err as any).details = json?.error?.details || json?.details;
        throw err;
      }

      return json;
    },
    { apiBase: API_BASE, path, init }
  );
}

async function browserRequest(page: Page, path: string, init?: { method?: string; body?: unknown }) {
  return await page.evaluate(
    async ({ apiBase, path, init }) => {
      const headers: Record<string, string> = {};
      let body: string | undefined;

      if (init?.body !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(init.body);
      }

      const res = await fetch(`${apiBase}${path}`, {
        method: init?.method || "GET",
        credentials: "include",
        headers,
        body,
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      return {
        ok: res.ok,
        status: res.status,
        code: json?.error?.code || json?.code || null,
        message: json?.error?.message || json?.message || null,
        json,
      };
    },
    { apiBase: API_BASE, path, init }
  );
}

async function browserLogin(page: Page, creds: Credentials) {
  return await page.evaluate(
    async ({ apiBase, creds }) => {
      const res = await fetch(`${apiBase}/api/v1/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenant_code: creds.tenantCode,
          email: creds.email,
          password: creds.password,
          recaptcha_token: "test",
        }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok) {
        const err = new Error(json?.error?.message || json?.message || `Login failed (${res.status})`);
        (err as any).status = res.status;
        (err as any).code = json?.error?.code || json?.code;
        (err as any).details = json?.error?.details || json?.details;
        throw err;
      }

      return json;
    },
    { apiBase: API_BASE, creds }
  );
}

async function loginAs(page: Page, creds: Credentials) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await browserLogin(page, creds);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "ITAM SaaS" })).toBeVisible({ timeout: 20_000 });
  const me = await browserJson(page, "/api/v1/auth/me");
  expect(String(me?.data?.email || me?.data?.data?.email || "").toLowerCase()).toContain(
    creds.email.toLowerCase()
  );
}

async function openPath(page: Page, path: string, heading: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 20_000 });
}

async function fetchCurrentTenantId(page: Page) {
  const me = await browserJson(page, "/api/v1/auth/me");
  const tenantId = Number(me?.data?.tenant_id ?? me?.data?.data?.tenant_id ?? NaN);
  expect(Number.isFinite(tenantId)).toBeTruthy();
  return tenantId;
}

async function createScopeDraftViaUi(page: Page, note: string) {
  await openPath(page, "/governance/scope", "Governance Scope");
  await expect(page.getByRole("button", { name: "Create Scope Version" })).toBeVisible();

  await page.locator('input[placeholder="Initial scope draft"]').fill(note);
  await page.getByRole("button", { name: "Create Scope Version" }).click();

  await expect(page).toHaveURL(/\/governance\/scope\/\d+/, { timeout: 20_000 });
  const match = page.url().match(/\/governance\/scope\/(\d+)/);
  expect(match?.[1]).toBeTruthy();
  const id = Number(match?.[1]);
  expect(Number.isFinite(id)).toBeTruthy();
  return id;
}

async function createScopeDraftViaApi(page: Page, note: string) {
  const res = (await browserJson(page, "/api/v1/governance/scope/versions", {
    method: "POST",
    body: {
      note,
      scope_json: DEFAULT_SCOPE_JSON,
    },
  })) as ApiResponse;
  const id = Number(res?.data?.id ?? res?.data?.data?.id ?? NaN);
  expect(Number.isFinite(id)).toBeTruthy();
  return id;
}

async function createContextViaApi(page: Page, body: Record<string, unknown>) {
  const res = (await browserJson(page, "/api/v1/governance/context", {
    method: "POST",
    body,
  })) as ApiResponse;
  const id = Number(res?.data?.id ?? res?.data?.data?.id ?? NaN);
  expect(Number.isFinite(id)).toBeTruthy();
  return id;
}

async function patchContextViaApi(page: Page, id: number, body: Record<string, unknown>) {
  await browserJson(page, `/api/v1/governance/context/${id}`, {
    method: "PATCH",
    body,
  });
}

async function createStakeholderViaApi(page: Page, body: Record<string, unknown>) {
  const res = (await browserJson(page, "/api/v1/governance/stakeholders", {
    method: "POST",
    body,
  })) as ApiResponse;
  const id = Number(res?.data?.id ?? res?.data?.data?.id ?? NaN);
  expect(Number.isFinite(id)).toBeTruthy();
  return id;
}

async function patchStakeholderViaApi(page: Page, id: number, body: Record<string, unknown>) {
  await browserJson(page, `/api/v1/governance/stakeholders/${id}`, {
    method: "PATCH",
    body,
  });
}

async function getIdentityDisplayName(page: Page, id: number) {
  const res = (await browserJson(page, "/api/v1/admin/identities")) as any;
  const items = Array.isArray(res?.data?.items)
    ? res.data.items
    : Array.isArray(res?.data?.data?.items)
      ? res.data.data.items
      : [];
  const match = items.find((row: IdentityItem) => Number(row.id) === Number(id));
  return match?.display_name || match?.name || match?.email || `Identity #${id}`;
}

test.describe.serial("Governance", () => {
  test.setTimeout(240_000);

  test("GOV-001 create a draft scope version", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const note = `Governance draft ${uniqueSuffix()}`;
    const id = await createScopeDraftViaUi(page, note);
    createdScopeVersionId = id;
    await page.goto(`/governance/scope/${id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(new RegExp(`Scope Version #${id}`))).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Status", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Activate" })).toBeDisabled();
    await expect(page.locator("div.mt-2.text-sm.text-gray-700").first()).toHaveText(note);
  });

  test("GOV-002 submit, approve, and activate scope version", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    expect(createdScopeVersionId).toBeTruthy();

    await page.goto(`/governance/scope/${createdScopeVersionId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(new RegExp(`Scope Version #${createdScopeVersionId}`))).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("Status sekarang: SUBMITTED")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Approve" })).toBeEnabled();

    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Status sekarang: APPROVED")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Activate" })).toBeEnabled();

    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.getByText("Status sekarang: ACTIVE")).toBeVisible({ timeout: 20_000 });
    activatedScopeVersionId = createdScopeVersionId;
  });

  test("GOV-002A itam manager cannot approve or activate scope version", async ({ page }) => {
    await loginAs(page, USERS.itamManager);
    const draftId = await createScopeDraftViaApi(page, `ITAM manager guard ${uniqueSuffix()}`);

    await browserJson(page, `/api/v1/governance/scope/versions/${draftId}/submit`, {
      method: "POST",
      body: { note: "submit before guard test" },
    });

    await expect(
      browserJson(page, `/api/v1/governance/scope/versions/${draftId}/approve`, {
        method: "POST",
        body: { note: "should be forbidden" },
      })
    ).rejects.toThrow(/Forbidden/);

    await expect(
      browserJson(page, `/api/v1/governance/scope/versions/${draftId}/activate`, {
        method: "POST",
        body: { note: "should be forbidden" },
      })
    ).rejects.toThrow(/Forbidden/);
  });

  test("GOV-002B governance context validation rejects invalid payloads", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);

    const blankTitle = await browserRequest(page, "/api/v1/governance/context", {
      method: "POST",
      body: {
        title: "   ",
        category_code: "INTERNAL",
        priority_code: "MEDIUM",
        status_code: "OPEN",
        description: "Invalid title payload",
        owner_identity_id: null,
        review_date: futureDate(30),
      },
    });

    expect(blankTitle.ok).toBe(false);
    expect(blankTitle.status).toBe(400);
    expect(blankTitle.code).toBe("VALIDATION_ERROR");
    expect(String(blankTitle.message || "")).toContain("title is required");

    const badReviewDate = await browserRequest(page, "/api/v1/governance/context", {
      method: "POST",
      body: {
        title: `Invalid Review Date ${uniqueSuffix()}`,
        category_code: "EXTERNAL",
        priority_code: "HIGH",
        status_code: "MONITORING",
        description: "Invalid review date payload",
        owner_identity_id: null,
        review_date: "31-12-2026",
      },
    });

    expect(badReviewDate.ok).toBe(false);
    expect(badReviewDate.status).toBe(400);
    expect(badReviewDate.code).toBe("VALIDATION_ERROR");
    expect(String(badReviewDate.message || "")).toContain(
      "review_date must be in YYYY-MM-DD format"
    );
  });

  test("GOV-003 create and edit context entries", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const title = `Context ${uniqueSuffix()}`;
    const id = await createContextViaApi(page, {
      title,
      category_code: "INTERNAL",
      priority_code: "MEDIUM",
      status_code: "OPEN",
      description: "Initial context description",
      owner_identity_id: null,
      review_date: futureDate(30),
    });
    createdContextId = id;
    createdContextTitle = title;

  await patchContextViaApi(page, id, {
      title: `${title} Updated`,
      category_code: "EXTERNAL",
      priority_code: "HIGH",
      status_code: "MONITORING",
      description: "Updated context description",
      owner_identity_id: 14,
      review_date: futureDate(45),
    });
    createdContextTitle = `${title} Updated`;

    await openPath(page, "/governance/context", "Governance Context");
    await page.getByPlaceholder("Search title/description...").fill(title);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.locator("tbody")).toContainText(createdContextTitle);
    await expect(page.locator("tbody")).toContainText("EXTERNAL");
    await expect(page.locator("tbody")).toContainText("MONITORING");
  });

  test("GOV-004A auditor cannot create governance context entries", async ({ page }) => {
    await loginAs(page, USERS.auditor);

    const response = await browserRequest(page, "/api/v1/governance/context", {
      method: "POST",
      body: {
        title: `Forbidden Context ${uniqueSuffix()}`,
        category_code: "INTERNAL",
        priority_code: "MEDIUM",
        status_code: "OPEN",
        description: "Auditor should not create governance context",
        owner_identity_id: null,
        review_date: futureDate(21),
      },
    });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(403);
    expect(response.code).toBe("FORBIDDEN");
    expect(String(response.message || "")).toContain("Forbidden");
  });

  test("GOV-004B superadmin can manage governance registers", async ({ page }) => {
    await loginAs(page, USERS.superadmin);

    await openPath(page, "/governance/scope", "Governance Scope");
    await expect(page.getByRole("button", { name: "Create Scope Version" })).toBeVisible();
    await expect(
      page.getByText("Read only. Create scope version, submit, approve, and activate are restricted")
    ).toHaveCount(0);

    await openPath(page, "/governance/context", "Governance Context");
    await expect(page.getByRole("button", { name: "Create Context Entry" })).toBeVisible();

    await openPath(page, "/governance/stakeholders", "Governance Stakeholders");
    await expect(page.getByRole("button", { name: "Create Stakeholder Entry" })).toBeVisible();
  });

  test("GOV-004C itam manager can create and edit governance context entries", async ({ page }) => {
    await loginAs(page, USERS.itamManager);
    const title = `ITAM Context ${uniqueSuffix()}`;
    const updatedTitle = `${title} Updated`;
    const id = await createContextViaApi(page, {
      title,
      category_code: "EXTERNAL",
      priority_code: "HIGH",
      status_code: "MONITORING",
      description: "ITAM manager context entry",
      owner_identity_id: null,
      review_date: futureDate(18),
    });
    expect(Number.isFinite(id)).toBeTruthy();

    await patchContextViaApi(page, id, {
      title: updatedTitle,
      category_code: "INTERNAL",
      priority_code: "CRITICAL",
      status_code: "MONITORING",
      description: "ITAM manager updated context entry",
      owner_identity_id: 14,
      review_date: futureDate(33),
    });

    await openPath(page, "/governance/context", "Governance Context");
    await expect(page.getByRole("button", { name: "Create Context Entry" })).toBeVisible();

    const listRes = (await browserJson(page, "/api/v1/governance/context?page=1&page_size=50")) as any;
    const items = Array.isArray(listRes?.data?.items)
      ? listRes.data.items
      : Array.isArray(listRes?.data?.data?.items)
        ? listRes.data.data.items
        : [];
    const match = items.find((row: any) => Number(row?.id) === Number(id) || String(row?.title ?? "") === updatedTitle);
    expect(match).toBeTruthy();
    expect(String(match?.title ?? "")).toBe(updatedTitle);
    expect(String(match?.category_code ?? "")).toBe("INTERNAL");
    expect(String(match?.priority_code ?? "")).toBe("CRITICAL");
  });

  test("GOV-004 create and edit stakeholder entries", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const name = `Stakeholder ${uniqueSuffix()}`;
    const id = await createStakeholderViaApi(page, {
      name,
      category_code: "INTERNAL",
      priority_code: "MEDIUM",
      status_code: "OPEN",
      expectations: "Initial stakeholder expectations",
      owner_identity_id: null,
      review_date: futureDate(20),
    });
    createdStakeholderId = id;
    createdStakeholderName = name;

    await patchStakeholderViaApi(page, id, {
      name: `${name} Updated`,
      category_code: "VENDOR",
      priority_code: "HIGH",
      status_code: "MONITORING",
      expectations: "Updated stakeholder expectations",
      owner_identity_id: 15,
      review_date: futureDate(40),
    });
    createdStakeholderName = `${name} Updated`;

    await openPath(page, "/governance/stakeholders", "Governance Stakeholders");
    await page.getByPlaceholder("Search name/expectations...").fill(name);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.locator("tbody")).toContainText(createdStakeholderName);
    await expect(page.locator("tbody")).toContainText("VENDOR");
    await expect(page.locator("tbody")).toContainText("MONITORING");
  });

  test("GOV-004D itam manager can create and edit governance stakeholder entries", async ({ page }) => {
    await loginAs(page, USERS.itamManager);
    const name = `ITAM Stakeholder ${uniqueSuffix()}`;
    const updatedName = `${name} Updated`;
    const id = await createStakeholderViaApi(page, {
      name,
      category_code: "EXTERNAL",
      priority_code: "HIGH",
      status_code: "MONITORING",
      expectations: "ITAM manager stakeholder entry",
      owner_identity_id: null,
      review_date: futureDate(24),
    });
    expect(Number.isFinite(id)).toBeTruthy();

    await patchStakeholderViaApi(page, id, {
      name: updatedName,
      category_code: "PARTNER",
      priority_code: "CRITICAL",
      status_code: "MONITORING",
      expectations: "ITAM manager updated stakeholder entry",
      owner_identity_id: 15,
      review_date: futureDate(36),
    });

    await openPath(page, "/governance/stakeholders", "Governance Stakeholders");
    await expect(page.getByRole("button", { name: "Create Stakeholder Entry" })).toBeVisible();

    const listRes = (await browserJson(page, "/api/v1/governance/stakeholders?page=1&page_size=50")) as any;
    const items = Array.isArray(listRes?.data?.items)
      ? listRes.data.items
      : Array.isArray(listRes?.data?.data?.items)
        ? listRes.data.data.items
        : [];
    const match = items.find((row: any) => Number(row?.id) === Number(id) || String(row?.name ?? "") === updatedName);
    expect(match).toBeTruthy();
    expect(String(match?.name ?? "")).toBe(updatedName);
    expect(String(match?.category_code ?? "")).toBe("PARTNER");
    expect(String(match?.priority_code ?? "")).toBe("CRITICAL");
  });

  test("GOV-005 auditor has read-only access on governance pages", async ({ page }) => {
    await loginAs(page, USERS.auditor);

    await openPath(page, "/governance/scope", "Governance Scope");
    await expect(page.getByText("Read only. Create scope version, submit, approve, and activate are restricted")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Scope Version" })).toHaveCount(0);

    await openPath(page, "/governance/context", "Governance Context");
    await expect(page.getByRole("button", { name: "Create Context Entry" })).toHaveCount(0);
    await expect(page.locator("table")).toBeVisible();
    await expect(page.locator("tbody")).toBeVisible();

    await openPath(page, "/governance/stakeholders", "Governance Stakeholders");
    await expect(page.getByRole("button", { name: "Create Stakeholder Entry" })).toHaveCount(0);
    await expect(page.locator("table")).toBeVisible();
    await expect(page.locator("tbody")).toBeVisible();
  });

  test("GOV-006 review dates are displayed for monitoring", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);

    await openPath(page, "/governance/context", "Governance Context");
    await page.getByPlaceholder("Search title/description...").fill(createdContextTitle);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.locator("tbody")).toContainText(displayDate(45));

    await openPath(page, "/governance/stakeholders", "Governance Stakeholders");
    await page.getByPlaceholder("Search name/expectations...").fill(createdStakeholderName);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.locator("tbody")).toContainText(displayDate(40));
  });

  test("GOV-007 a newly activated scope supersedes the previous active scope", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    expect(activatedScopeVersionId).toBeTruthy();

    const nextId = await createScopeDraftViaApi(page, `Supersede scope ${uniqueSuffix()}`);
    supersedeScopeVersionId = nextId;
    await browserJson(page, `/api/v1/governance/scope/versions/${nextId}/submit`, {
      method: "POST",
      body: { note: "submit for supersede test" },
    });
    await browserJson(page, `/api/v1/governance/scope/versions/${nextId}/approve`, {
      method: "POST",
      body: { note: "approve for supersede test" },
    });
    await browserJson(page, `/api/v1/governance/scope/versions/${nextId}/activate`, {
      method: "POST",
      body: { note: "activate supersede test" },
    });

    await openPath(page, `/governance/scope/${activatedScopeVersionId}`, "Scope Version");
    await expect(page.locator("span").filter({ hasText: /^SUPERSEDED$/ }).first()).toBeVisible({
      timeout: 20_000,
    });

    await openPath(page, `/governance/scope/${nextId}`, "Scope Version");
    await expect(page.locator("span").filter({ hasText: /^ACTIVE$/ }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("GOV-008 scope workflow guard blocks activate before submit and approve", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const draftId = await createScopeDraftViaApi(page, `Guard scope ${uniqueSuffix()}`);

    await expect(
      browserJson(page, `/api/v1/governance/scope/versions/${draftId}/activate`, {
        method: "POST",
        body: { note: "should fail" },
      })
    ).rejects.toThrow(/Only APPROVED scope version can be activated/);

    await openPath(page, `/governance/scope/${draftId}`, "Scope Version");
    await expect(page.getByRole("button", { name: "Activate" })).toBeDisabled();
  });

  test("GOV-009 context register supports category priority owner and status monitoring", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const ownerName = await getIdentityDisplayName(page, 14);
    const title = `Monitoring Context ${uniqueSuffix()}`;
    const id = await createContextViaApi(page, {
      title,
      category_code: "EXTERNAL",
      priority_code: "HIGH",
      status_code: "MONITORING",
      description: "Monitoring-focused context entry",
      owner_identity_id: 14,
      review_date: futureDate(21),
    });
    expect(Number.isFinite(id)).toBeTruthy();

    await openPath(page, "/governance/context", "Governance Context");
    await page.getByPlaceholder("Search title/description...").fill(title);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.locator("tbody")).toContainText(title);
    await expect(page.locator("tbody")).toContainText("EXTERNAL");
    await expect(page.locator("tbody")).toContainText("HIGH");
    await expect(page.locator("tbody")).toContainText("MONITORING");
    await expect(page.locator("tbody")).toContainText(ownerName);
  });

  test("GOV-010 stakeholder register supports classification owner and review date", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const ownerName = await getIdentityDisplayName(page, 15);
    const name = `Monitoring Stakeholder ${uniqueSuffix()}`;
    const id = await createStakeholderViaApi(page, {
      name,
      category_code: "VENDOR",
      priority_code: "CRITICAL",
      status_code: "MONITORING",
      expectations: "Must be reviewed periodically",
      owner_identity_id: 15,
      review_date: futureDate(28),
    });
    expect(Number.isFinite(id)).toBeTruthy();

    await openPath(page, "/governance/stakeholders", "Governance Stakeholders");
    await page.getByPlaceholder("Search name/expectations...").fill(name);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.locator("tbody")).toContainText(name);
    await expect(page.locator("tbody")).toContainText("VENDOR");
    await expect(page.locator("tbody")).toContainText("CRITICAL");
    await expect(page.locator("tbody")).toContainText(ownerName);
  });

  test("GOV-011 search and filter keep governance registers separated", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);

    await openPath(page, "/governance/context", "Governance Context");
    await page.getByPlaceholder("Search title/description...").fill(createdContextTitle);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.locator("tbody")).toContainText(createdContextTitle);
    await expect(page.locator("tbody")).not.toContainText(createdStakeholderName);

    await openPath(page, "/governance/stakeholders", "Governance Stakeholders");
    await page.getByPlaceholder("Search name/expectations...").fill(createdStakeholderName);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.locator("tbody")).toContainText(createdStakeholderName);
    await expect(page.locator("tbody")).not.toContainText(createdContextTitle);
  });

  test("GOV-012 tenant isolation keeps governance rows in the current tenant", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const tenantId = await fetchCurrentTenantId(page);

    const [scopeRes, contextRes, stakeholderRes] = await Promise.all([
      browserJson(page, "/api/v1/governance/scope/versions?page=1&page_size=50"),
      browserJson(page, "/api/v1/governance/context?page=1&page_size=50"),
      browserJson(page, "/api/v1/governance/stakeholders?page=1&page_size=50"),
    ]);

    for (const row of (scopeRes as ApiResponse<any>)?.data?.items ?? []) {
      expect(Number(row.tenant_id)).toBe(tenantId);
    }
    for (const row of (contextRes as ApiResponse<any>)?.data?.items ?? []) {
      expect(Number(row.tenant_id)).toBe(tenantId);
    }
    for (const row of (stakeholderRes as ApiResponse<any>)?.data?.items ?? []) {
      expect(Number(row.tenant_id)).toBe(tenantId);
    }
  });

  test("GOV-013 dashboard governance overview reflects open context and stakeholder counts", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);

    const beforeRes = (await browserJson(page, "/api/v1/dashboard/summary")) as ApiResponse<{
      totals?: {
        open_context_entries?: unknown;
        open_stakeholder_entries?: unknown;
      };
    }>;
    const beforeTotals = (beforeRes as any)?.data?.totals ?? (beforeRes as any)?.data?.data?.totals ?? {};
    const beforeContext = Number(beforeTotals?.open_context_entries ?? 0);
    const beforeStakeholders = Number(beforeTotals?.open_stakeholder_entries ?? 0);

    const contextTitle = `Dashboard Open Context ${uniqueSuffix()}`;
    const stakeholderName = `Dashboard Open Stakeholder ${uniqueSuffix()}`;

    await createContextViaApi(page, {
      title: contextTitle,
      category_code: "INTERNAL",
      priority_code: "MEDIUM",
      status_code: "OPEN",
      description: "Context entry created to verify dashboard governance counts.",
      owner_identity_id: null,
      review_date: futureDate(21),
    });

    await createStakeholderViaApi(page, {
      name: stakeholderName,
      category_code: "INTERNAL",
      priority_code: "MEDIUM",
      status_code: "OPEN",
      expectations: "Stakeholder entry created to verify dashboard governance counts.",
      owner_identity_id: null,
      review_date: futureDate(21),
    });

    const afterRes = (await browserJson(page, "/api/v1/dashboard/summary")) as ApiResponse<{
      totals?: {
        open_context_entries?: unknown;
        open_stakeholder_entries?: unknown;
      };
    }>;
    const afterTotals = (afterRes as any)?.data?.totals ?? (afterRes as any)?.data?.data?.totals ?? {};
    const afterContext = Number(afterTotals?.open_context_entries ?? 0);
    const afterStakeholders = Number(afterTotals?.open_stakeholder_entries ?? 0);

    expect(afterContext).toBeGreaterThan(beforeContext);
    expect(afterStakeholders).toBeGreaterThan(beforeStakeholders);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText(new RegExp(`${afterContext}\\s+open context entries`, "i"))
    ).toBeVisible();
    await expect(
      page.getByText(new RegExp(`${afterStakeholders}\\s+open stakeholder records`, "i"))
    ).toBeVisible();
  });
});
