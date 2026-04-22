import { expect, test, type Browser, type Page } from "@playwright/test";

type Credentials = {
  tenantCode: string;
  email: string;
  password: string;
};

type KpiSeed = {
  id: number;
  code: string;
  name: string;
};

type KpiMeasurementSeed = {
  id: number;
  periodKey: string;
  actualValue: number;
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
  procurementManager: {
    tenantCode: "bni",
    email: "procurement@bni.com",
    password: "123456",
  },
  defaultAdmin: {
    tenantCode: "default",
    email: "admin@default.local",
    password: "admin123",
  },
} satisfies Record<string, Credentials>;

const WEB_BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");

let manualSeed: KpiSeed | null = null;
let systemSeed: KpiSeed | null = null;
let defaultTenantSeed: KpiSeed | null = null;

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function currentPeriodKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function previousMonthlyPeriodKeys(count: number) {
  const now = new Date();
  const keys: string[] = [];

  for (let offset = count; offset >= 1; offset -= 1) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    d.setUTCMonth(d.getUTCMonth() - offset);
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  return keys;
}

async function apiGetJson(page: Page, pathUrl: string) {
  const cookieHeader = await getApiCookieHeader(page);
  const res = await page.context().request.fetch(`${API_BASE}${pathUrl}`, {
    method: "GET",
    headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  return { status: res.status(), json };
}

async function apiPostJson(page: Page, pathUrl: string, body: unknown) {
  const cookieHeader = await getApiCookieHeader(page);
  const res = await page.context().request.fetch(`${API_BASE}${pathUrl}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    data: body ?? {},
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  return { status: res.status(), json };
}

async function apiPatchJson(page: Page, pathUrl: string, body: unknown) {
  const cookieHeader = await getApiCookieHeader(page);
  const res = await page.context().request.fetch(`${API_BASE}${pathUrl}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    data: body ?? {},
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  return { status: res.status(), json };
}

async function getApiCookieHeader(page: Page) {
  const cookies = await page.context().cookies(API_BASE);
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
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

async function uiLoginAs(page: Page, creds: Credentials) {
  await fillLoginForm(page, creds);
  await solveRecaptcha(page);
  await page.getByRole("button", { name: "Masuk ke Viriya" }).click();
  await expect(page.getByRole("heading", { name: "ITAM SaaS" })).toBeVisible({
    timeout: 30_000,
  });
}

async function openKpiLibrary(page: Page) {
  await page.goto("/kpis");
  await expect(page.getByRole("heading", { name: "KPI Library" })).toBeVisible();
}

async function openKpiScorecard(page: Page) {
  await page.goto("/kpi-scorecard");
  await expect(page.getByRole("heading", { name: "KPI Scorecard" })).toBeVisible();
}

async function openKpiDetail(page: Page, kpiId: number) {
  await page.goto(`/kpis/${kpiId}`);
  await expect(page.getByRole("heading", { name: "KPI Detail" })).toBeVisible();
}

async function getKpiByCode(page: Page, code: string) {
  const res = await apiGetJson(
    page,
    `/api/v1/kpis?q=${encodeURIComponent(code)}&page=1&page_size=50`
  );

  expect(res.status).toBe(200);

  const items = Array.isArray((res.json as any)?.data?.items)
    ? (res.json as any).data.items
    : [];

  return items.find((item: any) => String(item?.code ?? "") === code) ?? null;
}

async function createKpiViaApi(
  page: Page,
  body: Record<string, unknown>
) {
  const res = await apiPostJson(page, "/api/v1/kpis", body);
  if (res.status !== 200) {
    throw new Error(
      `Create KPI failed with HTTP ${res.status}: ${JSON.stringify(res.json)}`
    );
  }
  const data = (res.json as any)?.data ?? null;
  expect(Number(data?.id ?? 0)).toBeGreaterThan(0);
  return data;
}

async function createMeasurementViaApi(
  page: Page,
  kpiId: number,
  body: Record<string, unknown>
) {
  const res = await apiPostJson(page, `/api/v1/kpis/${kpiId}/measurements`, body);
  return res;
}

async function patchMeasurementViaApi(
  page: Page,
  kpiId: number,
  measurementId: number,
  body: Record<string, unknown>
) {
  return apiPatchJson(page, `/api/v1/kpis/${kpiId}/measurements/${measurementId}`, body);
}

async function ensureSeedData(page: Page) {
  if (!manualSeed) {
    const manualCode = `PW-KPI-MAN-${uniqueSuffix()}`;
    const manual = await createKpiViaApi(page, {
      code: manualCode,
      name: `Playwright Manual KPI ${manualCode}`,
      description: "Playwright KPI seed for manual measurement and trend coverage.",
      source_type: "MANUAL",
      category_code: "GOVERNANCE",
      unit_code: "PERCENT",
      direction: "HIGHER_IS_BETTER",
      period_type: "MONTHLY",
      target_value: 80,
      warning_value: 60,
      critical_value: 40,
      baseline_value: 50,
      is_active: true,
      display_order: 10,
    });
    manualSeed = {
      id: Number(manual.id),
      code: String(manual.code),
      name: String(manual.name),
    };

    const priorPeriods = previousMonthlyPeriodKeys(3);
    const seedValues = [95, 85, 55];
    for (let index = 0; index < priorPeriods.length; index += 1) {
      const result = await createMeasurementViaApi(page, manualSeed.id, {
        period_key: priorPeriods[index],
        actual_value: seedValues[index],
        measurement_note: `Seeded history ${priorPeriods[index]}`,
      });
      expect(result.status).toBe(200);
    }
  }

  if (!systemSeed) {
    const systemCode = `PW-KPI-SYS-${uniqueSuffix()}`;
    const system = await createKpiViaApi(page, {
      code: systemCode,
      name: `Playwright System KPI ${systemCode}`,
      description: "Playwright KPI seed for system source coverage.",
      source_type: "SYSTEM",
      metric_key: "PENDING_APPROVAL_COUNT",
      period_type: "MONTHLY",
      target_value: 0,
      warning_value: 3,
      critical_value: 5,
      baseline_value: 0,
      is_active: true,
      display_order: 20,
    });
    systemSeed = {
      id: Number(system.id),
      code: String(system.code),
      name: String(system.name),
    };
  }

  if (!defaultTenantSeed) {
    const loginContext = await page.context().browser()?.newContext({ baseURL: WEB_BASE });
    if (!loginContext) {
      throw new Error("Failed to create isolated context for default tenant seeding.");
    }
    const loginPage = await loginContext.newPage();
    await loginAs(loginPage, USERS.defaultAdmin);

    const defaultCode = `PW-KPI-DEF-${uniqueSuffix()}`;
    const def = await createKpiViaApi(loginPage, {
      code: defaultCode,
      name: `Playwright Default KPI ${defaultCode}`,
      description: "Playwright KPI seed for tenant isolation.",
      source_type: "MANUAL",
      category_code: "AUDIT",
      unit_code: "COUNT",
      direction: "LOWER_IS_BETTER",
      period_type: "MONTHLY",
      target_value: 1,
      warning_value: 2,
      critical_value: 3,
      baseline_value: 1,
      is_active: true,
      display_order: 30,
    });

    defaultTenantSeed = {
      id: Number(def.id),
      code: String(def.code),
      name: String(def.name),
    };

    await loginContext.close();
  }
}

async function captureManualMeasurementViaUi(page: Page) {
  await openKpiScorecard(page);

  const row = page.locator("tr").filter({ hasText: manualSeed?.code || "" }).first();
  await expect(row).toBeVisible();

  const captureButton = row.getByRole("button", { name: "Capture" });
  await expect(captureButton).toBeVisible();
  await captureButton.click();

  const modal = page.locator("div.fixed").last();
  await expect(modal.getByRole("button", { name: "Capture Measurement" })).toBeVisible();

  await modal.locator('input[type="number"]').fill("50");
  await modal.getByRole("button", { name: "Capture Measurement" }).click();
  await expect(modal).toBeHidden({ timeout: 30_000 });
}

async function ensureCurrentManualMeasurement(page: Page) {
  if (!manualSeed) {
    throw new Error("manualSeed is not available.");
  }

  const currentKey = currentPeriodKey();
  const existing = await apiGetJson(
    page,
    `/api/v1/kpis/${manualSeed.id}/measurements?period_key_from=${currentKey}&period_key_to=${currentKey}&page=1&page_size=25`
  );

  const items = Array.isArray((existing.json as any)?.data?.items)
    ? (existing.json as any).data.items
    : [];

  if (items.length > 0) {
    return items[0] as KpiMeasurementSeed;
  }

  const created = await createMeasurementViaApi(page, manualSeed.id, {
    period_key: currentKey,
    actual_value: 50,
    measurement_note: "Current month capture",
  });
  expect(created.status).toBe(200);

  return {
    id: Number((created.json as any)?.data?.id ?? 0),
    periodKey: currentKey,
    actualValue: 50,
  };
}

async function ensureCurrentManualMeasurementSeeded(browser: Browser) {
  if (!manualSeed) {
    throw new Error("manualSeed is not available.");
  }

  const context = await browser.newContext({ baseURL: WEB_BASE });
  const page = await context.newPage();

  try {
    await loginAs(page, USERS.tenantAdmin);
    const measurement = await ensureCurrentManualMeasurement(page);
    return measurement;
  } finally {
    await context.close();
  }
}

test.setTimeout(180_000);

test.describe.serial("KPI Library & Scorecard", () => {
  test("KPI-001 create KPI in library", async ({ page }) => {
    await uiLoginAs(page, USERS.tenantAdmin);
    await ensureSeedData(page);
    await openKpiLibrary(page);

    const suffix = uniqueSuffix();
    const code = `PW-KPI-UI-${suffix}`;
    const name = `Playwright KPI UI ${suffix}`;

    await page.getByRole("button", { name: "Create KPI" }).click();

    const form = page.locator("form").last();
    await expect(form.getByRole("button", { name: "Create KPI" })).toBeVisible();

    await form.getByPlaceholder("ASSET_DATA_COMPLETENESS").fill(code);
    await form.getByPlaceholder("Asset Data Completeness").fill(name);
    await form.locator("textarea").fill("UI created KPI for workbook coverage.");

    const numberInputs = form.locator('input[type="number"]');
    await numberInputs.nth(0).fill("80");
    await numberInputs.nth(1).fill("60");
    await numberInputs.nth(2).fill("40");
    await numberInputs.nth(3).fill("50");
    await numberInputs.nth(4).fill("10");

    await form.getByRole("button", { name: "Create KPI" }).click();
    await expect(form.getByRole("button", { name: "Create KPI" })).toBeHidden({ timeout: 30_000 });

    const created = await getKpiByCode(page, code);
    expect(created).not.toBeNull();
    expect(created.code).toBe(code);
    expect(created.name).toBe(name);
  });

  test("KPI-002 capture measurement", async ({ page }) => {
    await uiLoginAs(page, USERS.tenantAdmin);
    await captureManualMeasurementViaUi(page);

    const measurement = await apiGetJson(
      page,
      `/api/v1/kpis/${manualSeed!.id}/measurements?period_key_from=${currentPeriodKey()}&period_key_to=${currentPeriodKey()}&page=1&page_size=25`
    );
    const items = Array.isArray((measurement.json as any)?.data?.items)
      ? (measurement.json as any).data.items
      : [];
    expect(items.length).toBeGreaterThan(0);
    expect(Number(items[0].actual_value)).toBe(50);
  });

  test("KPI-003 scorecard status", async ({ page, browser }) => {
    await uiLoginAs(page, USERS.tenantAdmin);
    await ensureCurrentManualMeasurementSeeded(browser);
    await openKpiScorecard(page);

    const row = page.locator("tr").filter({ hasText: manualSeed?.code || "" }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("CRITICAL");
    await expect(row.getByText("CRITICAL", { exact: true })).toBeVisible();

    const scorecard = await apiGetJson(
      page,
      `/api/v1/kpis/scorecard-summary?period_type=MONTHLY&period_key=${currentPeriodKey()}`
    );
    expect(scorecard.status).toBe(200);
    expect(Number((scorecard.json as any)?.data?.summary?.critical_count ?? 0)).toBeGreaterThanOrEqual(1);
  });

  test("KPI-004 trend", async ({ page, browser }) => {
    await uiLoginAs(page, USERS.tenantAdmin);
    await ensureCurrentManualMeasurementSeeded(browser);
    const trend = await apiGetJson(
      page,
      `/api/v1/kpis/${manualSeed!.id}/trend?period_key_from=${previousMonthlyPeriodKeys(3)[0]}&period_key_to=${currentPeriodKey()}`
    );

    expect(trend.status).toBe(200);
    const items = Array.isArray((trend.json as any)?.data?.items)
      ? (trend.json as any).data.items
      : [];

    expect(items.length).toBeGreaterThanOrEqual(4);
    expect(items[0].period_key).toBe(previousMonthlyPeriodKeys(3)[0]);
    expect(items[items.length - 1].period_key).toBe(currentPeriodKey());
  });

  test("KPI-005 role guard", async ({ page }) => {
    await uiLoginAs(page, USERS.auditor);

    await openKpiLibrary(page);
    await expect(page.getByRole("button", { name: "Create KPI" })).toHaveCount(0);

    await openKpiScorecard(page);
    await expect(page.getByRole("button", { name: "Capture" })).toHaveCount(0);
  });

  test("KPI-006 threshold and baseline", async ({ page, browser }) => {
    await uiLoginAs(page, USERS.tenantAdmin);
    await openKpiDetail(page, manualSeed!.id);

    await expect(page.locator("div").filter({ hasText: /^Target$/ }).first()).toBeVisible();
    await expect(page.locator("div").filter({ hasText: /^Warning$/ }).first()).toBeVisible();
    await expect(page.locator("div").filter({ hasText: /^Critical$/ }).first()).toBeVisible();
    await expect(page.locator("div").filter({ hasText: /^Baseline$/ }).first()).toBeVisible();
    await expect(page.locator("div").filter({ hasText: /^80\.00%$/ }).first()).toBeVisible();
    await expect(page.locator("div").filter({ hasText: /^60\.00%$/ }).first()).toBeVisible();
    await expect(page.locator("div").filter({ hasText: /^40\.00%$/ }).first()).toBeVisible();
    await expect(page.locator("div").filter({ hasText: /^50\.00%$/ }).first()).toBeVisible();
  });

  test("KPI-007 source type", async ({ page }) => {
    await uiLoginAs(page, USERS.tenantAdmin);

    if (!systemSeed) {
      throw new Error("systemSeed is not available.");
    }

    await openKpiDetail(page, systemSeed.id);
    await expect(page.getByRole("heading", { name: "KPI Detail" })).toBeVisible();
    await expect(page.getByText("SYSTEM", { exact: true })).toBeVisible();
    await expect(page.getByText("PENDING_APPROVAL_COUNT", { exact: true })).toBeVisible();

    await page.goto("/kpi-scorecard");
    await expect(page.getByRole("heading", { name: "KPI Scorecard" })).toBeVisible();
    await expect(page.getByText(systemSeed.code, { exact: true })).toBeVisible();
  });

  test("KPI-008 period uniqueness", async ({ page, browser }) => {
    await uiLoginAs(page, USERS.tenantAdmin);
    await ensureCurrentManualMeasurementSeeded(browser);

    const duplicate = await createMeasurementViaApi(page, manualSeed!.id, {
      period_key: currentPeriodKey(),
      actual_value: 51,
      measurement_note: "Duplicate measurement",
    });

    expect(duplicate.status).toBe(409);
    expect(String((duplicate.json as any)?.error?.code ?? "")).toBe("KPI_MEASUREMENT_ALREADY_EXISTS");
  });

  test("KPI-009 measurement edit", async ({ page, browser }) => {
    await uiLoginAs(page, USERS.tenantAdmin);
    const currentMeasurement = await ensureCurrentManualMeasurementSeeded(browser);

    const update = await patchMeasurementViaApi(page, manualSeed!.id, currentMeasurement.id, {
      actual_value: 72,
      measurement_note: "Edited measurement",
    });

    expect(update.status).toBe(200);
    expect(Number((update.json as any)?.data?.actual_value ?? 0)).toBe(72);
    expect(String((update.json as any)?.data?.measurement_note ?? "")).toBe("Edited measurement");

    await openKpiDetail(page, manualSeed!.id);
    const latestSnapshotCard = page
      .locator("div.rounded-3xl.border.border-gray-200.bg-white.p-6.shadow-sm")
      .filter({ has: page.getByText("Latest Snapshot", { exact: true }) });

    await expect(latestSnapshotCard).toBeVisible();
    await expect(latestSnapshotCard.getByText("72.00%", { exact: true })).toBeVisible();
    await expect(latestSnapshotCard.getByText("Edited measurement", { exact: true })).toBeVisible();
  });

  test("KPI-010 read scorecard", async ({ page, browser }) => {
    await uiLoginAs(page, USERS.auditor);
    await ensureCurrentManualMeasurementSeeded(browser);
    await openKpiScorecard(page);

    const row = page.locator("tr").filter({ hasText: manualSeed?.code || "" }).first();
    await expect(row).toBeVisible();
    await expect(row.getByRole("link", { name: "View Detail" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Capture" })).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Snapshot" })).toHaveCount(0);
  });

  test("KPI-011 trend comparison", async ({ page, browser }) => {
    await uiLoginAs(page, USERS.tenantAdmin);
    await ensureCurrentManualMeasurementSeeded(browser);
    const trend = await apiGetJson(
      page,
      `/api/v1/kpis/${manualSeed!.id}/trend?period_key_from=${previousMonthlyPeriodKeys(3)[0]}&period_key_to=${currentPeriodKey()}`
    );

    expect(trend.status).toBe(200);
    const items = Array.isArray((trend.json as any)?.data?.items)
      ? (trend.json as any).data.items
      : [];

    const periodKeys = items.map((item: any) => String(item.period_key));
    const sortedKeys = [...periodKeys].sort();
    expect(periodKeys).toEqual(sortedKeys);
    expect(items.some((item: any) => Number(item.actual_value) === 72)).toBeTruthy();
  });

  test("KPI-012 tenant isolation", async ({ page }) => {
    await uiLoginAs(page, USERS.defaultAdmin);

    if (!defaultTenantSeed) {
      throw new Error("defaultTenantSeed is not available.");
    }

    await page.goto("/kpis");
    await expect(page.getByRole("heading", { name: "KPI Library" })).toBeVisible();
    await expect(page.getByRole("cell", { name: defaultTenantSeed.code, exact: true })).toBeVisible();

    await uiLoginAs(page, USERS.tenantAdmin);
    const detail = await apiGetJson(page, `/api/v1/kpis/${defaultTenantSeed.id}`);
    expect(detail.status).toBe(404);
    expect(String((detail.json as any)?.error?.message ?? "")).toBe("KPI was not found.");
  });

  test("KPI-013 auditor cannot create KPI via API", async ({ page }) => {
    await uiLoginAs(page, USERS.auditor);

    const response = await apiPostJson(page, "/api/v1/kpis", {
      code: `PW-KPI-FORBIDDEN-${uniqueSuffix()}`,
      name: "Forbidden KPI",
      description: "Forbidden KPI attempt",
      category_code: "AUDIT",
      unit_code: "COUNT",
      source_type: "MANUAL",
      direction: "HIGHER_IS_BETTER",
      period_type: "MONTHLY",
      target_value: 1,
      warning_value: 1,
      critical_value: 1,
      baseline_value: 1,
      is_active: true,
      display_order: 100,
    });

    expect(response.status).toBe(403);
    expect(String((response.json as any)?.error?.code ?? "")).toBe("AUTH_FORBIDDEN");
    expect(String((response.json as any)?.error?.message ?? "")).toBe(
      "You are not allowed to manage KPIs."
    );
  });
});
