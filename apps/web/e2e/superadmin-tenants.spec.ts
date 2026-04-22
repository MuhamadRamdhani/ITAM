import { expect, test, type Page } from "@playwright/test";

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

const USERS = {
  superadmin: {
    tenantCode: "default",
    email: "admin@default.local",
    password: "admin123",
  },
  tenantAdmin: {
    tenantCode: "bni",
    email: "dhani@bni.com",
    password: "123456",
  },
} satisfies Record<string, Credentials>;

const WEB_BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function addDays(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fillLoginForm(page: Page, creds: Credentials) {
  await page.goto("/login");
  await page.getByLabel("Tenant Code").fill(creds.tenantCode);
  await page.getByLabel("Email Address").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
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

async function apiGetJson<T = any>(page: Page, path: string): Promise<{ status: number; json: ApiJson<T> | null }> {
  const res = await page.context().request.get(`${API_BASE}${path}`);
  let json: ApiJson<T> | null = null;
  try {
    json = (await res.json()) as ApiJson<T>;
  } catch {
    json = null;
  }
  return { status: res.status(), json };
}

async function expectSuperadminRole(page: Page) {
  const me = await apiGetJson<{ roles?: string[] }>(page, "/api/v1/auth/me");
  expect(me.status).toBe(200);
  expect(me.json?.data?.roles || []).toContain("SUPERADMIN");
}

async function openTenantsPage(page: Page) {
  await page.goto("/superadmin/tenants");
  await expect(page.getByRole("heading", { name: "Superadmin Tenants" })).toBeVisible({
    timeout: 30_000,
  });
}

async function createTenantViaUi(page: Page) {
  const suffix = uniqueSuffix();
  const code = `pw-sa-${suffix}`;
  const name = `Playwright Superadmin Tenant ${suffix}`;
  const startDate = addDays(-7);
  const endDate = addDays(60);

  const createForm = page.locator("form").first();

  await createForm.locator("input").nth(0).fill(code);
  await createForm.locator("input").nth(1).fill(name);
  await createForm.locator("select").nth(0).selectOption("ACTIVE");
  await createForm.locator("select").nth(1).selectOption("STANDARD");
  await createForm.locator("input").nth(2).fill(startDate);
  await createForm.locator("input").nth(3).fill(endDate);
  await createForm.locator("textarea").fill("Playwright superadmin tenant seed");

  await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/v1/superadmin/tenants") && res.request().method() === "POST" && res.status() === 200, {
      timeout: 30_000,
    }),
    page.getByRole("button", { name: "Create Tenant" }).click(),
  ]);

  await expect(page.getByText("Tenant berhasil dibuat.")).toBeVisible({ timeout: 20_000 });

  return { code, name, startDate, endDate };
}

test.describe("Superadmin Tenants", () => {
  test("superadmin can open list page and see summary cards", async ({ page }) => {
    await loginAs(page, USERS.superadmin);
    await expectSuperadminRole(page);

    await openTenantsPage(page);

    await expect(page.getByRole("button", { name: "Create Tenant" })).toBeVisible();
    await expect(page.getByText("Total", { exact: true })).toBeVisible();
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
    await expect(page.getByText("Expiring", { exact: true })).toBeVisible();
    await expect(page.getByText("Expired", { exact: true })).toBeVisible();
    await expect(page.locator("div.text-xs.text-gray-600").filter({ hasText: "No Contract" }).first()).toBeVisible();
    await expect(page.getByPlaceholder("Search code/name...")).toBeVisible();
  });

  test("superadmin can create a tenant and update its detail", async ({ page }) => {
    await loginAs(page, USERS.superadmin);
    await expectSuperadminRole(page);

    await openTenantsPage(page);

    const created = await createTenantViaUi(page);

    await page.getByPlaceholder("Search code/name...").fill(created.code);
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/v1/superadmin/tenants?") && res.request().method() === "GET" && res.status() === 200, {
        timeout: 30_000,
      }),
      page.getByRole("button", { name: "Search" }).click(),
    ]);

    const row = page.locator("tbody tr").filter({ hasText: created.code }).first();
    await expect(row).toBeVisible();
    await row.getByRole("link", { name: "View" }).click();

    await expect(page.getByRole("heading", { name: "Tenant Detail" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(created.code)).toBeVisible();
    await expect(page.getByText(created.name)).toBeVisible();
    await expect(page.getByText("Subscription / Contract")).toBeVisible();

    const updateForm = page.locator("form").first();
    const updatedName = `${created.name} Updated`;
    await updateForm.locator("input").nth(0).fill(updatedName);

    await Promise.all([
      page.waitForResponse((res) => res.url().includes(`/api/v1/superadmin/tenants/`) && res.request().method() === "PATCH" && res.status() === 200, {
        timeout: 30_000,
      }),
      page.getByRole("button", { name: "Save Changes" }).click(),
    ]);

    await expect(page.getByText("Tenant berhasil diupdate.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(updatedName)).toBeVisible();
  });

  test("tenant admin is forbidden from opening superadmin tenants", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await page.goto("/superadmin/tenants");

    await expect(page.getByText("Forbidden")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Halaman ini hanya bisa diakses oleh role SUPERADMIN.")).toBeVisible();
  });

  test("tenant admin is forbidden from listing superadmin tenants via API", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);

    const response = await apiGetJson(page, "/api/v1/superadmin/tenants?page=1&page_size=5");

    expect(response.status).toBe(403);
    expect(response.json?.error?.code || response.json?.code).toBe("FORBIDDEN");
    expect(String(response.json?.error?.message || response.json?.message || "")).toBe(
      "Forbidden"
    );
  });
});
