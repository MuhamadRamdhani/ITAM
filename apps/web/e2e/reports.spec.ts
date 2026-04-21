import fs from "node:fs";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";

type Credentials = {
  tenantCode: string;
  email: string;
  password: string;
};

type AssetSeed = {
  assetId: number;
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

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function fillLoginForm(page: Page, creds: Credentials) {
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
  await page.goto("/login");
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

async function apiPostJson(page: Page, pathName: string, body: unknown) {
  const res = await page.context().request.post(`${API_BASE}${pathName}`, {
    data: body,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status(), json } as const;
}

async function createAssetViaApi(page: Page): Promise<AssetSeed> {
  const suffix = uniqueSuffix();
  const assetTag = `PW-RPT-${suffix}`;
  const assetName = `Playwright Report Asset ${suffix}`;

  const res = await apiPostJson(page, "/api/v1/assets", {
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
    notes: "Playwright report seed asset",
  });

  expect([200, 201]).toContain(res.status);
  const assetId = Number(res.json?.data?.asset?.id ?? res.json?.data?.id ?? 0);
  expect(assetId).toBeGreaterThan(0);

  return {
    assetId,
    assetTag,
    assetName,
  };
}

async function seedReports(browser: Browser) {
  if (seededAsset) return seededAsset;

  const context = await browser.newContext({ baseURL: WEB_BASE });
  const page = await context.newPage();
  await loginAs(page, USERS.tenantAdmin);
  seededAsset = await createAssetViaApi(page);
  await context.close();
  return seededAsset;
}

async function openReportsPage(page: Page) {
  await page.goto("/reports/asset-mapping");
  await expect(page.getByRole("heading", { name: "Coverage dan mapping" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Export Excel" })).toBeVisible();
}

async function searchReportsByTag(page: Page, assetTag: string) {
  await page.getByPlaceholder("Search asset tag / name...").fill(assetTag);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.locator("tbody tr").filter({ hasText: assetTag }).first()).toBeVisible({
    timeout: 30_000,
  });
}

test.describe.serial("Reports", () => {
  test.beforeAll(async ({ browser }) => {
    await seedReports(browser);
  });

  test("REP-001 asset coverage list renders with summary and table", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openReportsPage(page);

    await expect(page.getByText("Asset Report")).toBeVisible();
    await expect(page.getByText("Mapped Department")).toBeVisible();
    await expect(page.getByText("Active Coverage")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Asset Tag" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Coverage", exact: true })).toBeVisible();
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
  });

  test("REP-002 asset mapping shows mapping columns and seeded asset search", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openReportsPage(page);

    await expect(page.getByRole("columnheader", { name: "Department" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Location" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Owner" })).toBeVisible();

    await searchReportsByTag(page, seededAsset?.assetTag ?? "");
  });

  test("REP-003 excel export downloads xlsx file", async ({ page }, testInfo: TestInfo) => {
    await loginAs(page, USERS.tenantAdmin);
    await openReportsPage(page);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Excel" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);

    const targetPath = testInfo.outputPath(`reports-export-${Date.now()}.xlsx`);
    await download.saveAs(targetPath);
    const stat = fs.statSync(targetPath);
    expect(stat.size).toBeGreaterThan(0);
    const buf = fs.readFileSync(targetPath);
    expect(buf.subarray(0, 2).toString("utf8")).toBe("PK");
  });

  test("REP-004 read-only user can view report but sees no write controls", async ({ page }) => {
    await loginAs(page, USERS.auditor);
    await openReportsPage(page);

    await expect(page.getByRole("button", { name: "Export Excel" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();
    await expect(page.getByRole("link", { name: /New Asset/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Save/i })).toHaveCount(0);
  });

  test("REP-005 coverage summary cards are displayed", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openReportsPage(page);

    await expect(page.getByText("Active Coverage")).toBeVisible();
    await expect(page.getByText("Expiring Coverage")).toBeVisible();
    await expect(page.getByText("Expired Coverage")).toBeVisible();
    await expect(page.getByText("No Coverage", { exact: true })).toBeVisible();
    await expect(page.getByText("Linked Contract Rows")).toBeVisible();
    await expect(page.getByText("No Link Rows")).toBeVisible();
  });

  test("REP-006 coverage filters narrow the report and keep the seeded asset visible", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openReportsPage(page);

    await searchReportsByTag(page, seededAsset?.assetTag ?? "");

    await page.getByRole("combobox").nth(4).selectOption("WARRANTY");
    await page.getByRole("combobox").nth(5).selectOption("ACTIVE");
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page).toHaveURL(/coverage_kind=WARRANTY/);
    await expect(page).toHaveURL(/health=ACTIVE/);
    await expect(page.getByText(seededAsset?.assetTag ?? "", { exact: false })).toBeVisible();
  });

  test("REP-007 mapping drill through opens the asset detail page", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openReportsPage(page);
    await searchReportsByTag(page, seededAsset?.assetTag ?? "");

    await page.locator("tbody tr").first().getByRole("link").first().click();
    await expect(page).toHaveURL(new RegExp(`/assets/${seededAsset?.assetId ?? 0}`));
    await expect(page.getByText(seededAsset?.assetTag ?? "")).toBeVisible();
  });

  test("REP-008 export integrity produces a valid non-empty xlsx file", async ({ page }, testInfo: TestInfo) => {
    await loginAs(page, USERS.tenantAdmin);
    await openReportsPage(page);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Excel" }).click();
    const download = await downloadPromise;

    const targetPath = testInfo.outputPath(`reports-integrity-${Date.now()}.xlsx`);
    await download.saveAs(targetPath);

    const buf = fs.readFileSync(targetPath);
    expect(buf.length).toBeGreaterThan(2048);
    expect(buf.subarray(0, 2).toString("utf8")).toBe("PK");
  });

  test("REP-009 tenant isolation keeps report data scoped to the active tenant", async ({ browser }) => {
    const tenantAContext = await browser.newContext({ baseURL: WEB_BASE });
    const tenantAPage = await tenantAContext.newPage();
    await loginAs(tenantAPage, USERS.tenantAdmin);
    await openReportsPage(tenantAPage);
    await searchReportsByTag(tenantAPage, seededAsset?.assetTag ?? "");
    await expect(
      tenantAPage.locator("tbody tr").filter({ hasText: seededAsset?.assetTag ?? "" }).first()
    ).toBeVisible();
    await tenantAContext.close();

    const tenantBContext = await browser.newContext({ baseURL: WEB_BASE });
    const tenantBPage = await tenantBContext.newPage();
    await loginAs(tenantBPage, USERS.defaultAdmin);
    await openReportsPage(tenantBPage);
    await tenantBPage.getByPlaceholder("Search asset tag / name...").fill(seededAsset?.assetTag ?? "");
    await tenantBPage.getByRole("button", { name: "Search" }).click();
    await expect(tenantBPage.getByText(seededAsset?.assetTag ?? "", { exact: false })).toHaveCount(0);
    await tenantBContext.close();
  });
});
