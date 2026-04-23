import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

type Credentials = {
  tenantCode: string;
  email: string;
  password: string;
};

type ApiJson<T = any> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

type UserItem = {
  id: number;
  email: string;
  status_code: string;
  roles?: string[];
};

type DepartmentItem = {
  id: number;
  code: string | null;
  name: string;
};

type LocationItem = {
  id: number;
  code: string | null;
  name: string;
};

type IdentityItem = {
  id: number;
  name: string;
  email: string | null;
  department_id: number | null;
};

type AssetTypeItem = {
  id: number;
  code: string;
  display_name: string;
};

type LifecycleStateItem = {
  id: number;
  code: string;
  display_name: string;
};

type AssetSeed = {
  id: number;
  assetTag: string;
  assetName: string;
};

const WEB_BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");

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
  defaultAdmin: {
    tenantCode: "default",
    email: "admin@default.local",
    password: "admin123",
  },
} satisfies Record<string, Credentials>;

let seededAsset: AssetSeed | null = null;
let createdUserEmail = "";

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function selectOptionTexts(locator: Locator) {
  return locator.locator("option").evaluateAll((options: HTMLOptionElement[]) =>
    options.map((opt) => (opt.textContent || "").trim()).filter(Boolean)
  );
}

async function solveRecaptcha(page: Page) {
  const recaptchaFrame = page.frameLocator('iframe[title="reCAPTCHA"]');
  const checkbox = recaptchaFrame.locator("#recaptcha-anchor");

  await expect(checkbox).toBeVisible({ timeout: 20_000 });
  await checkbox.click({ force: true });
  await expect(checkbox).toHaveAttribute("aria-checked", "true", {
    timeout: 20_000,
  });
}

async function fillLoginForm(page: Page, creds: Credentials) {
  await page.goto("/login");
  await page.getByLabel("Tenant Code").fill(creds.tenantCode);
  await page.getByLabel("Email Address").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
}

async function loginAs(page: Page, creds: Credentials) {
  await fillLoginForm(page, creds);
  await solveRecaptcha(page);

  const recaptchaToken = await page.evaluate(() => {
    const grecaptcha = (window as any).grecaptcha;
    if (!grecaptcha?.getResponse) return null;
    const token = grecaptcha.getResponse();
    return token || null;
  });

  if (!recaptchaToken) {
    throw new Error("Failed to read recaptcha token");
  }

  const loginResponse = await page.context().request.post(`${API_BASE}/api/v1/auth/login`, {
    data: {
      tenant_code: creds.tenantCode,
      email: creds.email,
      password: creds.password,
      recaptcha_token: recaptchaToken,
    },
  });

  expect(loginResponse.ok()).toBeTruthy();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ITAM SaaS" })).toBeVisible();
}

async function apiFetchJson<T = any>(
  page: Page,
  path: string,
  init?: {
    method?: string;
    body?: unknown;
  }
): Promise<{ status: number; json: ApiJson<T> | null }> {
  const res = await page.context().request.fetch(`${API_BASE}${path}`, {
    method: init?.method || "GET",
    headers: {
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    data: init?.body ?? undefined,
  });

  let json: ApiJson<T> | null = null;
  try {
    json = (await res.json()) as ApiJson<T>;
  } catch {
    json = null;
  }

  return { status: res.status(), json };
}

async function apiGetJson<T = any>(page: Page, path: string) {
  return apiFetchJson<T>(page, path, { method: "GET" });
}

async function apiPostJson<T = any>(page: Page, path: string, body: unknown) {
  return apiFetchJson<T>(page, path, { method: "POST", body });
}

async function apiPatchJson<T = any>(page: Page, path: string, body: unknown) {
  return apiFetchJson<T>(page, path, { method: "PATCH", body });
}

async function apiDeleteJson<T = any>(page: Page, path: string) {
  return apiFetchJson<T>(page, path, { method: "DELETE" });
}

async function seedAsset(browser: Browser) {
  if (seededAsset) return seededAsset;

  const context = await browser.newContext({ baseURL: WEB_BASE });
  const page = await context.newPage();
  await loginAs(page, USERS.tenantAdmin);

  const suffix = uniqueSuffix();
  const assetTag = `ADM-ASSET-${suffix}`;
  const assetName = `Admin Master Data Asset ${suffix}`;

  const res = await apiPostJson<{ id?: number; asset?: { id: number } }>(page, "/api/v1/assets", {
    asset_tag: assetTag,
    name: assetName,
    asset_type_code: "HARDWARE",
    initial_state_code: "REQUESTED",
    status: "AKTIF",
    purchase_date: "2026-04-20",
    warranty_start_date: "2026-04-20",
    warranty_end_date: "2027-04-20",
    support_start_date: "2026-04-20",
    support_end_date: "2027-04-20",
    notes: "Admin master data seed asset",
  });

  expect([200, 201]).toContain(res.status);
  const assetId = Number(res.json?.data?.id ?? res.json?.data?.asset?.id ?? 0);
  expect(assetId).toBeGreaterThan(0);

  seededAsset = { id: assetId, assetTag, assetName };
  await context.close();
  return seededAsset;
}

async function openPage(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 30_000 });
}

async function getRowByText(page: Page, text: string) {
  return page.locator("tbody tr").filter({ hasText: text }).first();
}

async function getDepartmentIdByCode(page: Page, code: string): Promise<number> {
  const res = await apiGetJson<{ items: DepartmentItem[] }>(
    page,
    `/api/v1/admin/departments?page=1&page_size=100&q=${encodeURIComponent(code)}`
  );
  expect(res.status).toBe(200);
  const items = Array.isArray(res.json?.data?.items) ? res.json!.data!.items : [];
  const found = items.find((item) => (item.code || "").toUpperCase() === code.toUpperCase());
  const id = Number(found?.id ?? 0);
  expect(id).toBeGreaterThan(0);
  return id;
}

async function getLocationIdByCode(page: Page, code: string): Promise<number> {
  const res = await apiGetJson<{ items: LocationItem[] }>(
    page,
    `/api/v1/admin/locations?page=1&page_size=100&q=${encodeURIComponent(code)}`
  );
  expect(res.status).toBe(200);
  const items = Array.isArray(res.json?.data?.items) ? res.json!.data!.items : [];
  const found = items.find((item) => (item.code || "").toUpperCase() === code.toUpperCase());
  const id = Number(found?.id ?? 0);
  expect(id).toBeGreaterThan(0);
  return id;
}

async function getIdentityIdByEmail(page: Page, email: string): Promise<number> {
  const res = await apiGetJson<{ items: IdentityItem[] }>(
    page,
    `/api/v1/admin/identities?page=1&page_size=100&q=${encodeURIComponent(email)}`
  );
  expect(res.status).toBe(200);
  const items = Array.isArray(res.json?.data?.items) ? res.json!.data!.items : [];
  const found = items.find((item) => (item.email || "").toLowerCase() === email.toLowerCase());
  const id = Number(found?.id ?? 0);
  expect(id).toBeGreaterThan(0);
  return id;
}

async function openAssetOwnership(page: Page, assetId: number) {
  await page.goto(`/assets/${assetId}?tab=ownership`);
  await expect(page.getByRole("button", { name: "Change Ownership" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Change Ownership" }).click();
  await expect(page.getByRole("heading", { name: "Change Ownership" })).toBeVisible({
    timeout: 30_000,
  });
}

async function createAssetViaApi(page: Page, label: string) {
  const suffix = uniqueSuffix();
  const assetTag = `ADM-ASSET-${label.toUpperCase()}-${suffix}`;
  const assetName = `Admin ${label} Asset ${suffix}`;

  const res = await apiPostJson<{ id?: number; asset?: { id: number } }>(page, "/api/v1/assets", {
    asset_tag: assetTag,
    name: assetName,
    asset_type_code: "HARDWARE",
    initial_state_code: "REQUESTED",
    status: "AKTIF",
    purchase_date: "2026-04-20",
    warranty_start_date: "2026-04-20",
    warranty_end_date: "2027-04-20",
    support_start_date: "2026-04-20",
    support_end_date: "2027-04-20",
    notes: `Admin master data ${label} asset`,
  });

  expect([200, 201]).toContain(res.status);
  const assetId = Number(res.json?.data?.id ?? res.json?.data?.asset?.id ?? 0);
  expect(assetId).toBeGreaterThan(0);

  return {
    assetId,
    assetTag,
    assetName,
  };
}

async function createDepartmentViaUi(page: Page) {
  await openPage(page, "/admin/departments", "Departments");

  const code = `ADM-DEPT-${uniqueSuffix()}`;
  const name = `Admin Department ${uniqueSuffix()}`;
  const createForm = page.locator("form").first();

  await createForm.locator("input").nth(0).fill(code);
  await createForm.locator("input").nth(1).fill(name);
  await createForm.getByRole("button", { name: "Create Department" }).click();

  await expect(page.getByText("Department berhasil dibuat.")).toBeVisible();

  const id = await getDepartmentIdByCode(page, code);
  await page.getByPlaceholder("Search code/name...").fill(code);
  await page.getByRole("button", { name: "Search" }).click();
  const row = await getRowByText(page, code);
  await expect(row).toBeVisible({ timeout: 20_000 });

  return { id, code, name };
}

async function createLocationViaUi(page: Page) {
  await openPage(page, "/admin/locations", "Locations");

  const code = `ADM-LOC-${uniqueSuffix()}`;
  const name = `Admin Location ${uniqueSuffix()}`;
  const createForm = page.locator("form").first();

  await createForm.locator("input").nth(0).fill(code);
  await createForm.locator("input").nth(1).fill(name);
  await createForm.getByRole("button", { name: "Create Location" }).click();

  await expect(page.getByText("Location berhasil dibuat.")).toBeVisible();

  const id = await getLocationIdByCode(page, code);
  await page.getByPlaceholder("Search code/name...").fill(code);
  await page.getByRole("button", { name: "Search" }).click();
  const row = await getRowByText(page, code);
  await expect(row).toBeVisible({ timeout: 20_000 });

  return { id, code, name };
}

async function setAssetOwnership(
  page: Page,
  assetId: number,
  opts: { ownerDepartmentId?: number | null; locationId?: number | null }
) {
  await openAssetOwnership(page, assetId);
  const modal = page.locator("div.fixed").last();
  const selects = modal.locator("select");

  if (opts.ownerDepartmentId !== undefined) {
    await selects.nth(0).selectOption({
      value: opts.ownerDepartmentId === null ? "" : String(opts.ownerDepartmentId),
    });
  }

  if (opts.locationId !== undefined) {
    await selects.nth(2).selectOption({
      value: opts.locationId === null ? "" : String(opts.locationId),
    });
  }

  const saveResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/api/v1/assets/${assetId}/ownership-changes`),
    { timeout: 30_000 }
  );

  await page.getByRole("button", { name: "Save" }).click();
  await saveResponse;
  await expect(page.getByText("Ownership History", { exact: true })).toBeVisible();
}

test.describe.serial("Admin Master Data", () => {
  test.beforeAll(async ({ browser }) => {
    await seedAsset(browser);
  });

  test("ADM-001 Admin Users - Create", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openPage(page, "/admin/users", "Admin Users");

    const email = `adm-user-${uniqueSuffix()}@bni.local`;
    const password = "Admin123!";
    createdUserEmail = email;

    await page.locator('input[type="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator("select").first().selectOption("ACTIVE");
    await page.getByRole("button", { name: "Create User" }).click();

    await expect(page.getByText("User berhasil dibuat.")).toBeVisible();

    const row = await getRowByText(page, email);
    await expect(row).toBeVisible();
    await expect(row).toContainText("ACTIVE");

    const roleSelect = row.locator("select").first();
    const roleOptions = await roleSelect.locator("option").evaluateAll((options) =>
      options.map((opt) => ({
        value: (opt as HTMLOptionElement).value,
        text: (opt.textContent || "").trim(),
      }))
    );

    expect(roleOptions.length).toBeGreaterThan(0);
    expect(roleOptions.some((opt) => /SUPERADMIN/i.test(opt.text))).toBeFalsy();

    const firstRole = roleOptions.find((opt) => opt.value);
    expect(firstRole?.value).toBeTruthy();
    await roleSelect.selectOption({ value: firstRole!.value });
    await row.getByRole("button", { name: "Add Role" }).click();

    await expect(row).toContainText(firstRole!.text || firstRole!.value);
  });

  test("ADM-002 Admin Users - Enable/Disable", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openPage(page, "/admin/users", "Admin Users");

    expect(createdUserEmail).toBeTruthy();
    const createdRow = await getRowByText(page, createdUserEmail);
    const actionButton = createdRow.getByRole("button", { name: /Disable|Enable/ }).first();

    await actionButton.click();
    await expect(createdRow).toContainText("DISABLED");

    await createdRow.getByRole("button", { name: "Enable" }).click();
    await expect(createdRow).toContainText("ACTIVE");
  });

  test("ADM-003 Reserved Role Guard", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openPage(page, "/admin/users", "Admin Users");

    expect(createdUserEmail).toBeTruthy();
    const row = await getRowByText(page, createdUserEmail);
    const select = row.locator("select").first();
    const optionTexts = await selectOptionTexts(select);

    expect(optionTexts.join(" ")).not.toMatch(/SUPERADMIN/i);
  });

  test("ADM-004 Departments", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openPage(page, "/admin/departments", "Departments");

    const code = `ADM-DEPT-${uniqueSuffix()}`;
    const name = `Admin Department ${uniqueSuffix()}`;
    const createForm = page.locator("form").first();

    await createForm.locator("input").nth(0).fill(code);
    await createForm.locator("input").nth(1).fill(name);
    await createForm.getByRole("button", { name: "Create Department" }).click();

    await expect(page.getByText("Department berhasil dibuat.")).toBeVisible();

    await page.getByPlaceholder("Search code/name...").fill(code);
    await page.getByRole("button", { name: "Search" }).click();

    const createdRow = await getRowByText(page, code);
    await expect(createdRow).toBeVisible();
    await expect(createdRow).toContainText(name);

    const updatedName = `${name} Updated`;
    await createdRow.getByRole("button", { name: "Edit" }).click();
    const editForm = page.locator("form").nth(1);
    await editForm.locator("input").nth(0).fill(code);
    await editForm.locator("input").nth(1).fill(updatedName);
    await editForm.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.getByText("Department berhasil diupdate.")).toBeVisible();
    await expect(page.locator("tbody tr").filter({ hasText: updatedName }).first()).toBeVisible();
  });

  test("ADM-004A Department Delete", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const created = await createDepartmentViaUi(page);
    const row = await getRowByText(page, created.code);

    const deleteResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().endsWith(`/api/v1/admin/departments/${created.id}`),
      { timeout: 30_000 }
    );

    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: "Delete department" })).toBeVisible();
    await page.getByRole("button", { name: "Delete Department" }).click();

    const response = await deleteResponse;
    expect(response.ok()).toBeTruthy();
    await expect(page.getByText("Department berhasil dihapus.")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("tbody tr").filter({ hasText: created.code })).toHaveCount(0);
  });

  test("ADM-004B Department Delete Blocked by Dependency", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const created = await createDepartmentViaUi(page);
    await setAssetOwnership(page, seededAsset!.id, { ownerDepartmentId: created.id });

    await openPage(page, "/admin/departments", "Departments");
    await page.getByPlaceholder("Search code/name...").fill(created.code);
    await page.getByRole("button", { name: "Search" }).click();
    const row = await getRowByText(page, created.code);

    const deleteResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().endsWith(`/api/v1/admin/departments/${created.id}`),
      { timeout: 30_000 }
    );

    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: "Delete department" })).toBeVisible();
    await page.getByRole("button", { name: "Delete Department" }).click();

    const response = await deleteResponse;
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body?.error?.code).toBe("DEPARTMENT_IN_USE");
    await expect(
      page.getByText("Department masih dipakai oleh asset, identity, atau history.")
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("tbody tr").filter({ hasText: created.code })).toBeVisible();
  });

  test("ADM-004C Department Delete Forbidden for Auditor", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const created = await createDepartmentViaUi(page);

    await loginAs(page, USERS.auditor);
    const response = await apiDeleteJson(page, `/api/v1/admin/departments/${created.id}`);

    expect(response.status).toBe(403);
    expect(response.json?.error?.code).toBe("FORBIDDEN");
  });

  test("ADM-005 Locations & Identities", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openPage(page, "/admin/locations", "Locations");

    const locationCode = `ADM-LOC-${uniqueSuffix()}`;
    const locationName = `Admin Location ${uniqueSuffix()}`;
    const locationCreateForm = page.locator("form").first();

    await locationCreateForm.locator("input").nth(0).fill(locationCode);
    await locationCreateForm.locator("input").nth(1).fill(locationName);
    await locationCreateForm.getByRole("button", { name: "Create Location" }).click();

    await expect(page.getByText("Location berhasil dibuat.")).toBeVisible();
    const locationRow = await getRowByText(page, locationCode);
    await expect(locationRow).toBeVisible();
    await expect(locationRow).toContainText(locationName);

    const deptCode = `ADM-DEPT-${uniqueSuffix()}`;
    const deptName = `Admin Dept for Identity ${uniqueSuffix()}`;
    const deptCreateForm = page.locator("form").first();

    await page.goto("/admin/departments");
    await deptCreateForm.locator("input").nth(0).fill(deptCode);
    await deptCreateForm.locator("input").nth(1).fill(deptName);
    await deptCreateForm.getByRole("button", { name: "Create Department" }).click();
    await expect(page.getByText("Department berhasil dibuat.")).toBeVisible();

    const deptId = await getDepartmentIdByCode(page, deptCode);

    await openPage(page, "/admin/identities", "Identities");
    const identityName = `Admin Identity ${uniqueSuffix()}`;
    const identityEmail = `adm-identity-${uniqueSuffix()}@bni.local`;
    const identityCreateForm = page.locator("form").first();
    await identityCreateForm.locator("input").nth(0).fill(identityName);
    await identityCreateForm.locator("input").nth(1).fill(identityEmail);
    await identityCreateForm
      .locator("select")
      .first()
      .selectOption({ value: String(deptId) });
    await identityCreateForm.getByRole("button", { name: "Create Identity" }).click();

    await expect(page.getByText("Identity berhasil dibuat.")).toBeVisible();

    await page.getByPlaceholder("Search name/email/department...").fill(identityEmail);
    await page.getByRole("button", { name: "Search" }).click();

    const identityRow = await getRowByText(page, identityEmail);
    await expect(identityRow).toBeVisible();
    await expect(identityRow).toContainText(identityEmail);
    await expect(identityRow).toContainText(deptName);

    const updatedIdentityName = `${identityName} Updated`;
    await identityRow.getByRole("button", { name: "Edit" }).click();
    const identityEditForm = page.locator("form").nth(1);
    await identityEditForm.locator("input").nth(0).fill(updatedIdentityName);
    await identityEditForm.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.getByText("Identity berhasil diupdate.")).toBeVisible();
    await expect(page.locator("tbody tr").filter({ hasText: updatedIdentityName }).first()).toBeVisible();

    const identityId = await getIdentityIdByEmail(page, identityEmail);
    expect(identityId).toBeGreaterThan(0);
  });

  test("ADM-005A Location Delete", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const created = await createLocationViaUi(page);
    const row = await getRowByText(page, created.code);

    const deleteResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().endsWith(`/api/v1/admin/locations/${created.id}`),
      { timeout: 30_000 }
    );

    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: "Delete location" })).toBeVisible();
    await page.getByRole("button", { name: "Delete Location" }).click();

    const response = await deleteResponse;
    expect(response.ok()).toBeTruthy();
    await expect(page.getByText("Location berhasil dihapus.")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("tbody tr").filter({ hasText: created.code })).toHaveCount(0);
  });

  test("ADM-005B Location Delete Blocked by Dependency", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const created = await createLocationViaUi(page);
    await setAssetOwnership(page, seededAsset!.id, { locationId: created.id });

    await openPage(page, "/admin/locations", "Locations");
    await page.getByPlaceholder("Search code/name...").fill(created.code);
    await page.getByRole("button", { name: "Search" }).click();
    const row = await getRowByText(page, created.code);

    const deleteResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().endsWith(`/api/v1/admin/locations/${created.id}`),
      { timeout: 30_000 }
    );

    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: "Delete location" })).toBeVisible();
    await page.getByRole("button", { name: "Delete Location" }).click();

    const response = await deleteResponse;
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body?.error?.code).toBe("LOCATION_IN_USE");
    await expect(page.getByText("Location masih dipakai oleh asset atau history.")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("tbody tr").filter({ hasText: created.code })).toBeVisible();
  });

  test("ADM-005C Location Delete Forbidden for Auditor", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const created = await createLocationViaUi(page);

    await loginAs(page, USERS.auditor);
    const response = await apiDeleteJson(page, `/api/v1/admin/locations/${created.id}`);

    expect(response.status).toBe(403);
    expect(response.json?.error?.code).toBe("FORBIDDEN");
  });

  test("ADM-006 Asset Types & Lifecycle States", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);

    await openPage(page, "/admin/asset-types", "Asset Types");
    const assetTypeRow = page.locator("tbody tr").first();
    const originalAssetTypeLabel = (await assetTypeRow.locator("td").nth(1).innerText()).trim();
    const assetTypeCode = (await assetTypeRow.locator("td").first().innerText()).trim();
    const assetTypeTempLabel = `${originalAssetTypeLabel} Temp ${uniqueSuffix()}`;

    await assetTypeRow.getByRole("button", { name: "Edit Label" }).click();
    await page.locator("form").first().locator("input").first().fill(assetTypeTempLabel);
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Asset type berhasil diupdate.")).toBeVisible();
    await expect(page.locator("tbody tr").filter({ hasText: assetTypeTempLabel }).first()).toBeVisible();

    await openPage(page, "/assets/new", "New Asset");
    const assetTypeSelect = page.locator("select").first();
    await expect(assetTypeSelect).toContainText(assetTypeTempLabel);

    await openPage(page, "/admin/asset-types", "Asset Types");
    const assetTypeRowAfter = page.locator("tbody tr").first();
    await assetTypeRowAfter.getByRole("button", { name: "Edit Label" }).click();
    await page.locator("form").first().locator("input").first().fill(originalAssetTypeLabel);
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.locator("tbody tr").filter({ hasText: originalAssetTypeLabel }).first()).toBeVisible();

    await openPage(page, "/admin/lifecycle-states", "Lifecycle States");
    const lifecycleRow = page.locator("tbody tr").first();
    const originalLifecycleLabel = (await lifecycleRow.locator("td").nth(2).innerText()).trim();
    const lifecycleTempLabel = `${originalLifecycleLabel} Temp ${uniqueSuffix()}`;

    await lifecycleRow.getByRole("button", { name: "Edit Label" }).click();
    await page.locator("form").first().locator("input").first().fill(lifecycleTempLabel);
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Lifecycle state berhasil diupdate.")).toBeVisible();
    await expect(page.locator("tbody tr").filter({ hasText: lifecycleTempLabel }).first()).toBeVisible();

    await openPage(page, "/assets/new", "New Asset");
    const lifecycleSelect = page.locator("select").nth(1);
    await expect(lifecycleSelect).toContainText(lifecycleTempLabel);

    await openPage(page, "/admin/lifecycle-states", "Lifecycle States");
    const lifecycleRowAfter = page.locator("tbody tr").first();
    await lifecycleRowAfter.getByRole("button", { name: "Edit Label" }).click();
    await page.locator("form").first().locator("input").first().fill(originalLifecycleLabel);
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.locator("tbody tr").filter({ hasText: originalLifecycleLabel }).first()).toBeVisible();

    expect(assetTypeCode).toBeTruthy();
  });

  test("ADM-007 Admin Users - Edit Role", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openPage(page, "/admin/users", "Admin Users");

    expect(createdUserEmail).toBeTruthy();
    const row = await getRowByText(page, createdUserEmail);
    const roleSelect = row.locator("select").first();
    const removeButtons = row.getByRole("button", { name: /Remove/i });
    if (await removeButtons.count()) {
      await removeButtons.first().click();
      await expect.poll(async () => await roleSelect.locator("option").count()).toBeGreaterThan(0);
    }

    let selectedRoleOption = roleSelect.locator("option").first();
    let selectedRoleValue = await selectedRoleOption.getAttribute("value");
    if (!selectedRoleValue && (await roleSelect.locator("option").count()) > 1) {
      selectedRoleOption = roleSelect.locator("option").nth(1);
      selectedRoleValue = await selectedRoleOption.getAttribute("value");
    }

    expect(selectedRoleValue).toBeTruthy();
    const selectedRoleText = (await selectedRoleOption.innerText()).trim();
    await roleSelect.selectOption({ value: selectedRoleValue! });
    await row.getByRole("button", { name: "Add Role" }).click();
    await expect(row).toContainText(selectedRoleText || selectedRoleValue!);

    const roleBadge = row.getByText(selectedRoleText || selectedRoleValue!, { exact: false }).first();
    await expect(roleBadge).toBeVisible();

    const removeAddedRoleButtons = row.getByRole("button", { name: /Remove/i });
    if (await removeAddedRoleButtons.count()) {
      await removeAddedRoleButtons.first().click();
      await expect(row).not.toContainText(selectedRoleText || selectedRoleValue!);
    }
  });

  test("ADM-008 Admin Users - Tenant Scope", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openPage(page, "/admin/users", "Admin Users");

    const externalEmail = `adm-scope-${uniqueSuffix()}@default.local`;

    await page.locator('input[type="email"]').first().fill(externalEmail);
    await page.locator('input[type="password"]').first().fill("TenantScope123!");
    await page.locator("select").first().selectOption("ACTIVE");
    await page.getByRole("button", { name: "Create User" }).click();

    await expect(page.getByText("User berhasil dibuat.")).toBeVisible();
    await expect(page.locator("tbody tr").filter({ hasText: externalEmail }).first()).toBeVisible();

    await page.getByPlaceholder("Search email...").fill("admin@default.local");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.locator("tbody tr").filter({ hasText: "admin@default.local" })).toHaveCount(0);
  });

  test("ADM-009 Identities", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openPage(page, "/admin/identities", "Identities");

    const deptCode = `ADM-IDENT-DEPT-${uniqueSuffix()}`;
    const deptName = `Identity Dept ${uniqueSuffix()}`;
    const deptCreateForm = page.locator("form").first();
    await page.goto("/admin/departments");
    await deptCreateForm.locator("input").nth(0).fill(deptCode);
    await deptCreateForm.locator("input").nth(1).fill(deptName);
    await deptCreateForm.getByRole("button", { name: "Create Department" }).click();
    await expect(page.getByText("Department berhasil dibuat.")).toBeVisible();
    const deptId = await getDepartmentIdByCode(page, deptCode);

    await openPage(page, "/admin/identities", "Identities");
    const identityName = `Identity ${uniqueSuffix()}`;
    const identityEmail = `adm-id-${uniqueSuffix()}@bni.local`;
    const identityCreateForm = page.locator("form").first();

    await identityCreateForm.locator("input").nth(0).fill(identityName);
    await identityCreateForm.locator("input").nth(1).fill(identityEmail);
    await identityCreateForm
      .locator("select")
      .first()
      .selectOption({ value: String(deptId) });
    await identityCreateForm.getByRole("button", { name: "Create Identity" }).click();

    await expect(page.getByText("Identity berhasil dibuat.")).toBeVisible();

    await page.getByPlaceholder("Search name/email/department...").fill(identityEmail);
    await page.getByRole("button", { name: "Search" }).click();

    const row = await getRowByText(page, identityEmail);
    await expect(row).toBeVisible();
    await expect(row).toContainText(identityEmail);
    await expect(row).toContainText(deptName);

    const updatedName = `${identityName} Updated`;
    await row.getByRole("button", { name: "Edit" }).click();
    const identityEditForm = page.locator("form").nth(1);
    await identityEditForm.locator("input").nth(0).fill(updatedName);
    await identityEditForm.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Identity berhasil diupdate.")).toBeVisible();
    await expect(page.locator("tbody tr").filter({ hasText: updatedName }).first()).toBeVisible();
    const identityId = await getIdentityIdByEmail(page, identityEmail);
    expect(identityId).toBeGreaterThan(0);
  });

  test("ADM-010 Lifecycle States", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openPage(page, "/admin/lifecycle-states", "Lifecycle States");

    const row = page.locator("tbody tr").first();
    const originalLabel = (await row.locator("td").nth(2).innerText()).trim();
    const tempLabel = `${originalLabel} Temp ${uniqueSuffix()}`;

    await row.getByRole("button", { name: "Edit Label" }).click();
    await page.locator("form").first().locator("input").first().fill(tempLabel);
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Lifecycle state berhasil diupdate.")).toBeVisible();

    await openPage(page, "/assets/new", "New Asset");
    await expect(page.locator("select").nth(1)).toContainText(tempLabel);

    await openPage(page, "/admin/lifecycle-states", "Lifecycle States");
    const restoredRow = page.locator("tbody tr").first();
    await restoredRow.getByRole("button", { name: "Edit Label" }).click();
    await page.locator("form").first().locator("input").first().fill(originalLabel);
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.locator("tbody tr").filter({ hasText: originalLabel }).first()).toBeVisible();
  });

  test("ADM-011 Asset Types", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openPage(page, "/admin/asset-types", "Asset Types");

    const row = page.locator("tbody tr").first();
    const originalLabel = (await row.locator("td").nth(1).innerText()).trim();
    const tempLabel = `${originalLabel} Temp ${uniqueSuffix()}`;

    await row.getByRole("button", { name: "Edit Label" }).click();
    await page.locator("form").first().locator("input").first().fill(tempLabel);
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Asset type berhasil diupdate.")).toBeVisible();

    await openPage(page, "/assets/new", "New Asset");
    await expect(page.locator("select").first()).toContainText(tempLabel);

    await openPage(page, "/admin/asset-types", "Asset Types");
    const restoredRow = page.locator("tbody tr").first();
    await restoredRow.getByRole("button", { name: "Edit Label" }).click();
    await page.locator("form").first().locator("input").first().fill(originalLabel);
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.locator("tbody tr").filter({ hasText: originalLabel }).first()).toBeVisible();
  });

  test("ADM-012 Department & Location Reuse", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);

    const deptCode = `ADM-REUSE-DEPT-${uniqueSuffix()}`;
    const deptName = `Reuse Department ${uniqueSuffix()}`;
    const locCode = `ADM-REUSE-LOC-${uniqueSuffix()}`;
    const locName = `Reuse Location ${uniqueSuffix()}`;
    const deptCreateForm = page.locator("form").first();

    await openPage(page, "/admin/departments", "Departments");
    await deptCreateForm.locator("input").nth(0).fill(deptCode);
    await deptCreateForm.locator("input").nth(1).fill(deptName);
    await deptCreateForm.getByRole("button", { name: "Create Department" }).click();
    await expect(page.getByText("Department berhasil dibuat.")).toBeVisible();
    const deptId = await getDepartmentIdByCode(page, deptCode);

    await openPage(page, "/admin/locations", "Locations");
    const locCreateForm = page.locator("form").first();
    await locCreateForm.locator("input").nth(0).fill(locCode);
    await locCreateForm.locator("input").nth(1).fill(locName);
    await locCreateForm.getByRole("button", { name: "Create Location" }).click();
    await expect(page.getByText("Location berhasil dibuat.")).toBeVisible();
    const locId = await getLocationIdByCode(page, locCode);

    await openAssetOwnership(page, seededAsset!.id);
    const ownerSelect = page.locator("select").first();
    const locationSelect = page.locator("select").nth(2);

    await ownerSelect.selectOption({ value: String(deptId) });
    await locationSelect.selectOption({ value: String(locId) });
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("row").filter({ hasText: deptName }).first()).toContainText(
      locName
    );
  });
});
