import { expect, test, type Browser, type Page } from "@playwright/test";

type Credentials = {
  tenantCode: string;
  email: string;
  password: string;
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
  procurementManager: {
    tenantCode: "bni",
    email: "procurement@bni.com",
    password: "123456",
  },
} satisfies Record<string, Credentials>;

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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

async function apiPostJson(page: Page, path: string, body: unknown) {
  return page.evaluate(
    async ({ url, payload }) => {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { status: res.status, json: await res.json() };
    },
    { url: `${API_BASE}${path}`, payload: body }
  );
}

async function fetchJson(page: Page, path: string) {
  return page.evaluate(async (url) => {
    const res = await fetch(url, { credentials: "include" });
    return await res.json();
  }, `${API_BASE}${path}`);
}

async function openVendorsPage(page: Page) {
  await page.goto("/vendors");
  await expect(page.getByText("Vendor Registry")).toBeVisible();
}

async function createVendorViaUi(
  page: Page,
  opts?: Partial<{
    vendorCode: string;
    vendorName: string;
    vendorType: string;
    status: "ACTIVE" | "INACTIVE";
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    notes: string;
  }>
) {
  const suffix = uniqueSuffix();
  const vendorCode = opts?.vendorCode || `PW-VEND-${suffix}`;
  const vendorName = opts?.vendorName || `Playwright Vendor ${suffix}`;
  const vendorType = opts?.vendorType || "SOFTWARE_PUBLISHER";
  const status = opts?.status || "ACTIVE";
  const contactName = opts?.contactName || "Playwright Contact";
  const contactEmail = opts?.contactEmail || `contact.${suffix}@example.com`;
  const contactPhone = opts?.contactPhone || "081234567890";
  const notes = opts?.notes || "Playwright vendor test";

  await openVendorsPage(page);
  await expect(page.getByRole("button", { name: "New Vendor" })).toBeVisible();
  await page.getByRole("button", { name: "New Vendor" }).click();

  const form = page.locator("form").first();
  await expect(form.getByRole("button", { name: "Create Vendor" })).toBeVisible();

  const inputs = form.locator("input");
  const selects = form.locator("select");
  const textareas = form.locator("textarea");

  await inputs.nth(0).fill(vendorCode);
  await inputs.nth(1).fill(vendorName);
  await selects.nth(0).selectOption(vendorType);
  await selects.nth(1).selectOption(status);
  await inputs.nth(2).fill(contactName);
  await inputs.nth(3).fill(contactEmail);
  await inputs.nth(4).fill(contactPhone);
  await textareas.nth(0).fill(notes);

  await Promise.all([
    page.waitForURL(/\/vendors\/\d+/, { timeout: 30_000 }),
    form.getByRole("button", { name: "Create Vendor" }).click(),
  ]);

  const match = page.url().match(/\/vendors\/(\d+)/);
  if (!match) {
    throw new Error("Vendor id was not present after create");
  }

  return {
    vendorId: match[1],
    vendorCode,
    vendorName,
    vendorType,
    status,
    contactName,
    contactEmail,
    contactPhone,
    notes,
    updatedName: `${vendorName} Updated`,
  };
}

async function createVendorViaApi(
  page: Page,
  opts?: Partial<{
    vendorCode: string;
    vendorName: string;
    vendorType: string;
    status: "ACTIVE" | "INACTIVE";
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    notes: string;
  }>
) {
  const suffix = uniqueSuffix();
  const payload = {
    vendor_code: opts?.vendorCode || `PW-API-${suffix}`,
    vendor_name: opts?.vendorName || `Playwright API Vendor ${suffix}`,
    vendor_type: opts?.vendorType || "SOFTWARE_PUBLISHER",
    status: opts?.status || "ACTIVE",
    primary_contact_name: opts?.contactName || "Playwright Contact",
    primary_contact_email: opts?.contactEmail || `contact.${suffix}@example.com`,
    primary_contact_phone: opts?.contactPhone || "081234567890",
    notes: opts?.notes || "Playwright vendor test",
  };

  const res = await apiPostJson(page, "/api/v1/vendors", payload);
  expect(res.status).toBe(201);
  const vendorId = Number(res.json?.data?.id ?? 0);
  expect(vendorId).toBeGreaterThan(0);

  return {
    vendorId,
    vendorCode: payload.vendor_code,
    vendorName: payload.vendor_name,
    vendorType: payload.vendor_type,
    status: payload.status,
    contactName: payload.primary_contact_name,
    contactEmail: payload.primary_contact_email,
    contactPhone: payload.primary_contact_phone,
    notes: payload.notes,
  };
}

async function ensureVendorCountAtLeast(page: Page, minCount: number) {
  const res = await fetchJson(page, "/api/v1/vendors?page=1&pageSize=20");
  const total = Number(res?.data?.total ?? 0);
  if (total >= minCount) return total;

  const toCreate = minCount - total;
  for (let i = 0; i < toCreate; i += 1) {
    const suffix = `${uniqueSuffix()}-${i}`;
    const created = await apiPostJson(page, "/api/v1/vendors", {
      vendor_code: `PW-PAGE-${suffix}`,
      vendor_name: `Playwright Pagination Vendor ${suffix}`,
      vendor_type: "SOFTWARE_PUBLISHER",
      status: "ACTIVE",
      primary_contact_name: `Contact ${suffix}`,
      primary_contact_email: `contact.${suffix}@example.com`,
      primary_contact_phone: "081234567890",
      notes: "Pagination seed",
    });
    expect(created.status).toBe(201);
  }

  const after = await fetchJson(page, "/api/v1/vendors?page=1&pageSize=20");
  return Number(after?.data?.total ?? 0);
}

test.describe.serial("Vendors", () => {
  test("auditor can read vendors list but cannot create vendors", async ({ page }) => {
    await loginAs(page, USERS.auditor);
    await openVendorsPage(page);

    await expect(page.getByText("Read-only access")).toBeVisible();
    await expect(page.getByRole("button", { name: "New Vendor" })).toHaveCount(0);

    const suffix = uniqueSuffix();
    const response = await apiPostJson(page, "/api/v1/vendors", {
      vendor_code: `PW-AUD-${suffix}`,
      vendor_name: `Auditor Vendor ${suffix}`,
      vendor_type: "SOFTWARE_PUBLISHER",
      status: "ACTIVE",
      primary_contact_name: "Auditor Contact",
      primary_contact_email: `auditor.${suffix}@example.com`,
      primary_contact_phone: "081234567890",
      notes: "Auditor create should be forbidden",
    });

    expect(response.status).toBe(403);
    expect(response.json?.error?.code).toBe("FORBIDDEN");
  });

  test("auditor can open vendor detail in read-only mode", async ({ browser }) => {
    const adminContext = await browser.newContext({ baseURL: "http://localhost:3000" });
    const adminPage = await adminContext.newPage();
    await loginAs(adminPage, USERS.tenantAdmin);
    const seeded = await createVendorViaUi(adminPage, {
      vendorName: `Read Only Vendor ${uniqueSuffix()}`,
    });
    await adminContext.close();

    const auditorContext = await browser.newContext({ baseURL: "http://localhost:3000" });
    const auditorPage = await auditorContext.newPage();
    await loginAs(auditorPage, USERS.auditor);
    await auditorPage.goto(`/vendors/${seeded.vendorId}`);

    await expect(auditorPage.getByText("Vendor Detail").first()).toBeVisible();
    await expect(auditorPage.getByText(seeded.vendorCode)).toBeVisible();
    await expect(auditorPage.getByText("Read-only access")).toBeVisible();
    await expect(auditorPage.getByText("Update code, name, type, contact, dan notes vendor.")).toHaveCount(1);
    await expect(auditorPage.getByRole("button", { name: "Save Changes" })).toHaveCount(0);

    await auditorContext.close();
  });

  test("tenant admin can create a vendor from the UI", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);

    const created = await createVendorViaUi(page, {
      vendorType: "SERVICE_PROVIDER",
      status: "ACTIVE",
      contactName: "Vendor Creator",
    });

    await expect(page.getByText(created.vendorCode)).toBeVisible();
    await expect(page.getByText(created.vendorName)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Changes" })).toBeVisible();
  });

  test("tenant admin can edit vendor details and persist them", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const created = await createVendorViaUi(page, {
      vendorType: "CLOUD_PROVIDER",
      contactName: "Edit Contact",
      contactEmail: `edit.${uniqueSuffix()}@example.com`,
    });

    const form = page.locator("form").first();
    const inputs = form.locator("input");
    const selects = form.locator("select");
    const textareas = form.locator("textarea");

    await inputs.nth(1).fill(created.updatedName);
    await selects.nth(0).selectOption("MSP");
    await selects.nth(1).selectOption("INACTIVE");
    await inputs.nth(2).fill("Updated Contact");
    await inputs.nth(3).fill(`updated.${uniqueSuffix()}@example.com`);
    await inputs.nth(4).fill("089876543210");
    await textareas.nth(0).fill("Updated notes from Playwright");

    const saveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().endsWith(`/api/v1/vendors/${created.vendorId}`),
      { timeout: 20_000 }
    );

    await page.getByRole("button", { name: "Save Changes" }).click();
    await saveResponse;
    await page.reload();

    await expect(page.getByText(created.updatedName)).toBeVisible();
    const refreshedForm = page.locator("form").first();
    await expect(refreshedForm.locator("select").nth(0)).toHaveValue("MSP");
    await expect(refreshedForm.locator("select").nth(1)).toHaveValue("INACTIVE");

    const updated = await fetchJson(page, `/api/v1/vendors/${created.vendorId}`);
    expect(updated?.data?.vendor_name ?? updated?.vendor_name).toBe(created.updatedName);
  });

  test("vendor list search works by code and name", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const created = await createVendorViaUi(page, {
      vendorName: `Searchable Vendor ${uniqueSuffix()}`,
      contactName: "Search Contact",
    });

    await page.goto("/vendors");
    await page.getByPlaceholder("Search code/name/type/contact...").fill(created.vendorCode);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("cell", { name: created.vendorCode, exact: true })).toBeVisible();

    await page.getByPlaceholder("Search code/name/type/contact...").fill(created.vendorName);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("cell", { name: created.vendorName, exact: true })).toBeVisible();
  });

  test("vendor list search works by contact fields", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const unique = uniqueSuffix();
    const phoneDigits = `08123${String(unique).replace(/\D+/g, "").slice(-6)}`;
    const created = await createVendorViaApi(page, {
      vendorName: `Contact Search Vendor ${unique}`,
      contactName: `Contact ${unique}`,
      contactEmail: `contact.${unique}@example.com`,
      contactPhone: phoneDigits,
      notes: "Contact search seed",
    });

    await page.goto("/vendors");
    await page.getByPlaceholder("Search code/name/type/contact...").fill(created.contactEmail);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText(created.contactEmail)).toBeVisible();

    await page.getByPlaceholder("Search code/name/type/contact...").fill(created.contactPhone);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText(created.vendorCode)).toBeVisible();
  });

  test("vendor status filter separates ACTIVE and INACTIVE records", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const active = await createVendorViaApi(page, {
      vendorName: `Active Vendor ${uniqueSuffix()}`,
      status: "ACTIVE",
    });
    const inactive = await createVendorViaApi(page, {
      vendorName: `Inactive Vendor ${uniqueSuffix()}`,
      status: "INACTIVE",
    });

    await openVendorsPage(page);

    await page.locator("select").first().selectOption("ACTIVE");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText(active.vendorCode)).toBeVisible();
    await expect(page.getByText(inactive.vendorCode)).toHaveCount(0);

    await page.locator("select").first().selectOption("INACTIVE");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText(inactive.vendorCode)).toBeVisible();
    await expect(page.getByText(active.vendorCode)).toHaveCount(0);
  });

  test("duplicate vendor code is rejected", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const code = `PW-DUP-${uniqueSuffix()}`;
    const first = await apiPostJson(page, "/api/v1/vendors", {
      vendor_code: code,
      vendor_name: `Duplicate Seed ${uniqueSuffix()}`,
      vendor_type: "SOFTWARE_PUBLISHER",
      status: "ACTIVE",
      primary_contact_name: "Dup Contact",
      primary_contact_email: `dup.${uniqueSuffix()}@example.com`,
      primary_contact_phone: "081234567890",
      notes: "Duplicate seed",
    });
    expect(first.status).toBe(201);

    const second = await apiPostJson(page, "/api/v1/vendors", {
      vendor_code: code,
      vendor_name: `Duplicate Attempt ${uniqueSuffix()}`,
      vendor_type: "SOFTWARE_PUBLISHER",
      status: "ACTIVE",
      primary_contact_name: "Dup Contact",
      primary_contact_email: `dup2.${uniqueSuffix()}@example.com`,
      primary_contact_phone: "081234567890",
      notes: "Duplicate attempt",
    });

    expect(second.status).toBe(409);
    expect(second.json?.error?.code).toBe("VENDOR_CODE_TAKEN");
  });

  test("invalid primary contact email is rejected", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);

    const response = await apiPostJson(page, "/api/v1/vendors", {
      vendor_code: `PW-EMAIL-${uniqueSuffix()}`,
      vendor_name: `Invalid Email Vendor ${uniqueSuffix()}`,
      vendor_type: "SERVICE_PROVIDER",
      status: "ACTIVE",
      primary_contact_name: "Invalid Email Contact",
      primary_contact_email: "not-an-email",
      primary_contact_phone: "081234567890",
      notes: "Invalid email test",
    });

    expect(response.status).toBe(400);
    expect(String(response.json?.message || response.json?.error?.message || "")).toMatch(
      /primary_contact_email/i
    );
  });

  test("vendor list paginates when enough records exist", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const total = await ensureVendorCountAtLeast(page, 21);
    expect(total).toBeGreaterThanOrEqual(21);

    await openVendorsPage(page);
    await expect(page.getByText(/Page 1 \/ \d+/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText(/Page 2 \/ \d+/)).toBeVisible();

    await page.getByRole("button", { name: "Prev", exact: true }).click();
    await expect(page.getByText(/Page 1 \/ \d+/)).toBeVisible();
  });
});
