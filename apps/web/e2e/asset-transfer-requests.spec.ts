import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

type Credentials = {
  tenantCode: string;
  email: string;
  password: string;
};

type ApiResponse<T = unknown> = {
  status: number;
  json: T;
};

type TenantOption = {
  id: number;
  tenant_name: string;
  status: string | null;
};

type AssetSeed = {
  assetId: number;
  assetTag: string;
  assetName: string;
};

type TransferRequestSeed = {
  requestId: number;
  requestCode: string;
  assetId: number;
  assetTag?: string;
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
  defaultAdmin: {
    tenantCode: "default",
    email: "admin@default.local",
    password: "admin123",
  },
} satisfies Record<string, Credentials>;

const WEB_BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");

let sourceTenantId = 0;
let targetTenant: TenantOption | null = null;

let draftAsset: AssetSeed | null = null;
let submittedAsset: AssetSeed | null = null;
let rejectedAsset: AssetSeed | null = null;
let executedAsset: AssetSeed | null = null;

let draftRequest: TransferRequestSeed | null = null;
let submittedRequest: TransferRequestSeed | null = null;
let rejectedRequest: TransferRequestSeed | null = null;
let executedRequest: TransferRequestSeed | null = null;

let uiSubmittedRequest: TransferRequestSeed | null = null;
let uiRejectedRequest: TransferRequestSeed | null = null;

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function apiGetJson(page: Page, pathUrl: string): Promise<ApiResponse> {
  return page.evaluate(async (url) => {
    const res = await fetch(url, { credentials: "include" });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  }, `${API_BASE}${pathUrl}`);
}

async function apiPostJson(page: Page, pathUrl: string, body: unknown): Promise<ApiResponse> {
  return page.evaluate(
    async ({ url, payload }) => {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return { status: res.status, json };
    },
    { url: `${API_BASE}${pathUrl}`, payload: body }
  );
}

async function apiDeleteJson(page: Page, pathUrl: string): Promise<ApiResponse> {
  return page.evaluate(
    async (url) => {
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return { status: res.status, json };
    },
    `${API_BASE}${pathUrl}`
  );
}

function extractRequestId(payload: any): number {
  return Number(payload?.data?.id ?? payload?.data?.request?.id ?? payload?.id ?? 0);
}

function extractRequestCode(payload: any): string {
  return String(
    payload?.data?.request_code ??
      payload?.data?.request?.request_code ??
      payload?.request_code ??
      ""
  );
}

function extractAssetId(payload: any): number {
  return Number(payload?.data?.asset?.id ?? payload?.data?.id ?? payload?.id ?? 0);
}

function extractAssetTenantId(payload: any): number {
  return Number(payload?.data?.asset?.tenant_id ?? payload?.data?.tenant_id ?? payload?.tenant_id ?? 0);
}

function getRequestRecord(payload: any): any {
  return payload?.data?.request ?? payload?.data?.item ?? payload?.data?.transfer_request ?? payload?.data ?? null;
}

function getAssetRecord(payload: any): any {
  return payload?.data?.asset ?? payload?.data?.item ?? payload?.data ?? null;
}

function normalizeTenantOptions(payload: any): TenantOption[] {
  const data = payload?.data ?? payload ?? {};
  const rawItems = data?.items ?? data?.tenants ?? payload?.items ?? [];

  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .map((raw) => ({
      id: Number(raw?.id),
      tenant_name: String(raw?.tenant_name ?? raw?.name ?? "").trim(),
      status: raw?.status ?? raw?.status_code ?? null,
    }))
    .filter((item) => Number.isFinite(item.id) && item.id > 0 && item.tenant_name);
}

async function selectOptionContainingText(select: Locator, text: string) {
  const matches = await select.locator("option").evaluateAll(
    (options: HTMLOptionElement[], needle: string) =>
      options
        .map((opt) => ({
          value: (opt as HTMLOptionElement).value,
          text: (opt.textContent || "").trim(),
        }))
        .filter((opt) => opt.text.includes(String(needle))),
    text
  );

  expect(matches.length, `No option containing "${text}" was found`).toBeGreaterThan(0);
  await select.selectOption({ value: matches[0].value });
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

async function openTransferRequestsList(page: Page, allowAccess = true) {
  await page.goto("/asset-transfer-requests");
  if (!allowAccess) {
    await expect(page).toHaveURL(/\/assets(?:\/\d+)?/);
    await expect(page.getByRole("heading", { name: "Assets" })).toBeVisible();
    return;
  }

  await expect(page.getByRole("heading", { name: "Asset Transfer Requests" })).toBeVisible();
}

async function openAssetDetail(page: Page, assetId: number) {
  await page.goto(`/assets/${assetId}`);
  await expect(page.getByRole("link", { name: "Transfer Asset" })).toBeVisible();
}

async function openAssetTransferCreateFromAsset(page: Page, assetId: number) {
  await openAssetDetail(page, assetId);
  await page.getByRole("link", { name: "Transfer Asset" }).click();
  await expect(page.getByRole("heading", { name: "Create Asset Transfer Request" })).toBeVisible();
}

async function openTransferRequestDetail(page: Page, requestId: number, allowAccess = true) {
  await page.goto(`/asset-transfer-requests/${requestId}`);
  if (!allowAccess) {
    await expect(page).toHaveURL(/\/assets(?:\/\d+)?/);
    await expect(page.getByRole("heading", { name: "Assets" })).toBeVisible();
    return;
  }

  await expect(page.getByText("Asset Transfer Request")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to List" })).toBeVisible();
}

async function createAssetViaUi(page: Page, label: string) {
  const suffix = uniqueSuffix();
  await page.goto("/assets/new");
  await expect(page.getByRole("heading", { name: "New Asset" })).toBeVisible();
  await expect(page.getByText("Active governance scope limits asset types")).toBeVisible();

  const assetTypeSelect = page.locator("select").first();
  const assetTypeOptions = await assetTypeSelect.locator("option").evaluateAll((options) =>
    options.map((opt) => (opt.textContent || "").trim())
  );
  expect(assetTypeOptions.join(" ")).toContain("HARDWARE");

  const assetTag = `ATR-${label.toUpperCase()}-${suffix}`;
  const assetName = `Asset Transfer ${label} ${suffix}`;

  await page.locator('input[placeholder="e.g. LAPTOP-001"]').fill(assetTag);
  await page.locator('input[placeholder="e.g. Laptop Dell"]').fill(assetName);
  await assetTypeSelect.selectOption("HARDWARE");

  const dateInputs = page.locator('input[type="date"]');
  await expect(dateInputs).toHaveCount(5, { timeout: 20_000 });
  await dateInputs.nth(0).fill(isoDate(0));
  await dateInputs.nth(1).fill(isoDate(0));
  await dateInputs.nth(2).fill(isoDate(365));
  await dateInputs.nth(3).fill(isoDate(0));
  await dateInputs.nth(4).fill(isoDate(365));

  await Promise.all([
    page.waitForURL(/\/assets\/\d+/, { timeout: 30_000 }),
    page.getByRole("button", { name: "Create Asset" }).click(),
  ]);
  await expect(page.getByText(assetTag)).toBeVisible();

  const match = page.url().match(/\/assets\/(\d+)/);
  if (!match) {
    throw new Error("Asset id was not present after create");
  }

  return {
    assetId: Number(match[1]),
    assetTag,
    assetName,
  };
}

async function createTransferRequestViaApi(
  page: Page,
  assetId: number,
  targetTenantId: number,
  reason = "Asset transfer request test"
) {
  const res = await apiPostJson(page, "/api/v1/asset-transfer-requests", {
    asset_id: assetId,
    target_tenant_id: targetTenantId,
    reason,
  });

  expect(res.status).toBe(201);

  const requestId = extractRequestId(res.json as any);
  const requestCode = extractRequestCode(res.json as any);

  expect(requestId).toBeGreaterThan(0);
  expect(requestCode).toContain("ATR-");

  return {
    requestId,
    requestCode,
    assetId,
  };
}

async function submitTransferRequestViaApi(page: Page, requestId: number) {
  const res = await apiPostJson(page, `/api/v1/asset-transfer-requests/${requestId}/submit`, {});
  expect(res.status).toBe(200);
  return res;
}

async function decideTransferRequestViaApi(
  page: Page,
  requestId: number,
  action: "APPROVE" | "REJECT",
  decisionNote = ""
) {
  const res = await apiPostJson(page, `/api/v1/asset-transfer-requests/${requestId}/decide`, {
    action,
    decision_note: decisionNote,
  });
  expect(res.status).toBe(200);
  return res;
}

async function getTargetTenantOptions(page: Page) {
  const res = await apiGetJson(page, "/api/v1/asset-transfer-requests/target-tenant-options?limit=50");
  expect(res.status).toBe(200);
  return normalizeTenantOptions(res.json as any);
}

async function getTransferRequest(page: Page, requestId: number) {
  const res = await apiGetJson(page, `/api/v1/asset-transfer-requests/${requestId}`);
  expect(res.status).toBe(200);
  return getRequestRecord(res.json as any);
}

async function getAssetDetail(page: Page, assetId: number, expectedStatus = 200) {
  const res = await apiGetJson(page, `/api/v1/assets/${assetId}`);
  expect(res.status).toBe(expectedStatus);
  return getAssetRecord(res.json as any);
}

async function previewTransfer(page: Page, assetId: number, targetTenantId: number) {
  const res = await apiGetJson(
    page,
    `/api/v1/asset-transfer-requests/preview?asset_id=${assetId}&target_tenant_id=${targetTenantId}`
  );
  return res;
}

async function acceptNextDialog(page: Page) {
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
}

async function ensureSeed(browser: Browser) {
  if (
    draftRequest &&
    submittedRequest &&
    rejectedRequest &&
    executedRequest &&
    draftAsset &&
    submittedAsset &&
    rejectedAsset &&
    executedAsset &&
    targetTenant &&
    sourceTenantId > 0
  ) {
    return;
  }

  const context = await browser.newContext({ baseURL: WEB_BASE });
  const page = await context.newPage();

  await loginAs(page, USERS.tenantAdmin);

  const meRes = await apiGetJson(page, "/api/v1/auth/me");
  const me = (meRes.json as any)?.data?.data ?? (meRes.json as any)?.data ?? null;
  sourceTenantId = Number(me?.tenant_id ?? 0);
  expect(sourceTenantId).toBeGreaterThan(0);

  const targetOptions = await getTargetTenantOptions(page);
  targetTenant =
    targetOptions.find((option) => String(option.status ?? "").toUpperCase() === "ACTIVE") ??
    targetOptions[0] ??
    null;
  expect(targetTenant, "No active target tenant options available").toBeTruthy();

  draftAsset = await createAssetViaUi(page, "draft");
  submittedAsset = await createAssetViaUi(page, "submitted");
  rejectedAsset = await createAssetViaUi(page, "rejected");
  executedAsset = await createAssetViaUi(page, "executed");

  const draftRequestCreated = await createTransferRequestViaApi(page, draftAsset.assetId, targetTenant.id, "Draft request");
  draftRequest = draftRequestCreated;

  const submittedRequestCreated = await createTransferRequestViaApi(
    page,
    submittedAsset.assetId,
    targetTenant.id,
    "Submitted request"
  );
  submittedRequest = submittedRequestCreated;
  await submitTransferRequestViaApi(page, submittedRequestCreated.requestId);

  const rejectedRequestCreated = await createTransferRequestViaApi(
    page,
    rejectedAsset.assetId,
    targetTenant.id,
    "Rejected request"
  );
  rejectedRequest = rejectedRequestCreated;
  await submitTransferRequestViaApi(page, rejectedRequestCreated.requestId);
  await decideTransferRequestViaApi(page, rejectedRequestCreated.requestId, "REJECT", "Reject seed request");

  const executedRequestCreated = await createTransferRequestViaApi(
    page,
    executedAsset.assetId,
    targetTenant.id,
    "Executed request"
  );
  executedRequest = executedRequestCreated;
  await submitTransferRequestViaApi(page, executedRequestCreated.requestId);
  await decideTransferRequestViaApi(page, executedRequestCreated.requestId, "APPROVE", "Approve seed request");

  await context.close();
}

test.describe.serial("Asset Transfer Requests", () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(300_000);
    await ensureSeed(browser);
  });

  test("ATR-001 list & filter", async ({ page }) => {
    if (!draftRequest || !submittedRequest || !rejectedRequest || !executedRequest) {
      throw new Error("Seed transfer requests are missing");
    }

    await loginAs(page, USERS.tenantAdmin);
    await openTransferRequestsList(page);

    const searchForm = page.locator("form").first();
    const searchInput = searchForm.getByPlaceholder("Search request code, asset tag, asset name...");
    const statusSelect = searchForm.locator("select");

    await searchInput.fill(draftRequest.requestCode);
    await expect(searchInput).toHaveValue(draftRequest.requestCode);
    await page.getByRole("button", { name: "Search" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(draftRequest.requestCode, { exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await searchInput.fill("");
    await expect(searchInput).toHaveValue("");
    await statusSelect.selectOption("SUBMITTED");
    await expect(statusSelect).toHaveValue("SUBMITTED");
    await page.getByRole("button", { name: "Search" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(submittedRequest.requestCode, { exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await statusSelect.selectOption("REJECTED");
    await expect(statusSelect).toHaveValue("REJECTED");
    await page.getByRole("button", { name: "Search" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(rejectedRequest.requestCode, { exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await statusSelect.selectOption("EXECUTED");
    await expect(statusSelect).toHaveValue("EXECUTED");
    await page.getByRole("button", { name: "Search" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(executedRequest.requestCode, { exact: true })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("ATR-002 create draft & submit", async ({ page }) => {
    if (!targetTenant) throw new Error("Target tenant option missing");

    await loginAs(page, USERS.tenantAdmin);
    const asset = await createAssetViaUi(page, "ui-create");
    await openAssetTransferCreateFromAsset(page, asset.assetId);

    const targetSelect = page.locator("select").nth(1);
    await page.waitForFunction(() => {
      const selects = Array.from(document.querySelectorAll("select"));
      return selects.length > 1 && (selects[1] as HTMLSelectElement).options.length > 1;
    }, { timeout: 20_000 });

    await selectOptionContainingText(targetSelect, targetTenant.tenant_name);
    await page.getByRole("button", { name: "Preview Transfer" }).click();
    await expect(page.getByText("Preview OK")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Create Draft Request" })).toBeEnabled();

    await acceptNextDialog(page);
    await page.getByRole("button", { name: "Create Draft Request" }).click();
    await expect(page).toHaveURL(/\/asset-transfer-requests\/\d+/);

    const requestId = Number(page.url().split("/").pop());
    expect(requestId).toBeGreaterThan(0);

    const createdRequest = await getTransferRequest(page, requestId);
    uiSubmittedRequest = {
      requestId,
      requestCode: String(createdRequest?.request_code ?? `ATR-${requestId}`),
      assetId: asset.assetId,
      assetTag: asset.assetTag,
    };

    await expect(page.getByRole("button", { name: "Submit Request" })).toBeVisible({ timeout: 20_000 });

    await acceptNextDialog(page);
    await page.getByRole("button", { name: "Submit Request" }).click();
    await expect(page.getByRole("button", { name: "Approve Request" })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("ATR-003 approve / reject", async ({ page }) => {
    if (!uiSubmittedRequest || !targetTenant) {
      throw new Error("UI submitted request seed is missing");
    }

    await loginAs(page, USERS.tenantAdmin);
    await openTransferRequestDetail(page, uiSubmittedRequest.requestId);

    await expect(page.getByRole("button", { name: "Approve Request" })).toBeVisible();
    await acceptNextDialog(page);
    await page.getByRole("button", { name: "Approve Request" }).click();
    await expect(page.getByText("No action available for status EXECUTED")).toBeVisible({
      timeout: 30_000,
    });

    const rejectAsset = await createAssetViaUi(page, "ui-reject");

    await openAssetTransferCreateFromAsset(page, rejectAsset.assetId);
    const targetSelect = page.locator("select").nth(1);
    await page.waitForFunction(() => {
      const selects = Array.from(document.querySelectorAll("select"));
      return selects.length > 1 && (selects[1] as HTMLSelectElement).options.length > 1;
    }, { timeout: 20_000 });
    await selectOptionContainingText(targetSelect, targetTenant.tenant_name);
    await page.getByRole("button", { name: "Preview Transfer" }).click();
    await expect(page.getByText("Preview OK")).toBeVisible({ timeout: 20_000 });
    await acceptNextDialog(page);
    await page.getByRole("button", { name: "Create Draft Request" }).click();
    await expect(page).toHaveURL(/\/asset-transfer-requests\/\d+/);

    const rejectRequestId = Number(page.url().split("/").pop());
    expect(rejectRequestId).toBeGreaterThan(0);

    const rejectedCreatedRequest = await getTransferRequest(page, rejectRequestId);
    uiRejectedRequest = {
      requestId: rejectRequestId,
      requestCode: String(rejectedCreatedRequest?.request_code ?? `ATR-${rejectRequestId}`),
      assetId: rejectAsset.assetId,
      assetTag: rejectAsset.assetTag,
    };

    await acceptNextDialog(page);
    await page.getByRole("button", { name: "Submit Request" }).click();
    await expect(page.getByRole("button", { name: "Approve Request" })).toBeVisible({
      timeout: 20_000,
    });
    await acceptNextDialog(page);
    await page.getByRole("button", { name: "Reject Request" }).click();
    await expect(page.getByText("No action available for status REJECTED")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("ATR-004 execute / cancel", async ({ page }) => {
    if (!uiSubmittedRequest || !uiRejectedRequest) {
      throw new Error("UI transfer requests are missing");
    }

    await loginAs(page, USERS.tenantAdmin);

    const executedDetail = await getTransferRequest(page, uiSubmittedRequest.requestId);
    expect(executedDetail?.status).toBe("EXECUTED");
    expect(Number(executedDetail?.target_tenant_id ?? 0)).toBe(targetTenant?.id ?? 0);

    await getAssetDetail(page, uiSubmittedRequest.assetId, 404);

    const rejectedDetail = await getTransferRequest(page, uiRejectedRequest.requestId);
    expect(rejectedDetail?.status).toBe("REJECTED");
    expect(Number(rejectedDetail?.target_tenant_id ?? 0)).toBe(targetTenant?.id ?? 0);
  });

  test("ATR-005 preview validation", async ({ page }) => {
    if (!draftAsset || !targetTenant) {
      throw new Error("Seed asset or target tenant missing");
    }

    await loginAs(page, USERS.tenantAdmin);

    const sameTenantPreview = await previewTransfer(page, draftAsset.assetId, sourceTenantId);
    expect(sameTenantPreview.status).toBe(200);
    const sameTenantData = getRequestRecord(sameTenantPreview.json as any);
    expect(sameTenantData?.can_transfer).toBeFalsy();
    expect(JSON.stringify(sameTenantData?.blocked_reasons ?? [])).toMatch(
      /TARGET_TENANT_SAME_AS_SOURCE/i
    );

    const invalidPreview = await previewTransfer(page, 99999999, targetTenant.id);
    expect(invalidPreview.status).toBe(404);
  });

  test("ATR-006 target tenant options", async ({ page }) => {
    if (!targetTenant) throw new Error("Target tenant option missing");

    await loginAs(page, USERS.tenantAdmin);
    const options = await getTargetTenantOptions(page);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((option) => option.id !== sourceTenantId)).toBeTruthy();
    expect(options.every((option) => String(option.status ?? "").toUpperCase() === "ACTIVE")).toBeTruthy();

    const asset = await createAssetViaUi(page, "target-options");

    await openAssetTransferCreateFromAsset(page, asset.assetId);
    const targetSelect = page.locator("select").nth(1);
    await page.waitForFunction(() => {
      const selects = Array.from(document.querySelectorAll("select"));
      return selects.length > 1 && (selects[1] as HTMLSelectElement).options.length > 1;
    }, { timeout: 20_000 });

    const optionTexts = await targetSelect.locator("option").evaluateAll((items) =>
      items.map((item) => (item.textContent || "").trim()).filter(Boolean)
    );
    expect(optionTexts.join(" ")).toContain(targetTenant.tenant_name);
  });

  test("ATR-007 source asset guard", async ({ page }) => {
    if (!targetTenant) {
      throw new Error("Target tenant missing");
    }

    await loginAs(page, USERS.tenantAdmin);

    const preview = await previewTransfer(page, 99999999, targetTenant.id);
    expect(preview.status).toBe(404);
    const message = JSON.stringify(preview.json);
    expect(message).toMatch(/Asset not found|ASSET_NOT_FOUND/i);
  });

  test("ATR-008 role guard", async ({ page }) => {
    if (!draftRequest) throw new Error("Seed draft request missing");

    await loginAs(page, USERS.auditor);
    await openTransferRequestsList(page, false);
    await expect(page.getByRole("link", { name: "New Transfer Request" })).toHaveCount(0);

    await page.goto("/asset-transfer-requests/new");
    await expect(page).toHaveURL(/\/assets(?:\/\d+)?/);
    await expect(page.getByRole("heading", { name: "Assets" })).toBeVisible();

    await openTransferRequestDetail(page, draftRequest.requestId, false);
  });

  test("ATR-009 execution result", async ({ page }) => {
    if (!uiSubmittedRequest || !targetTenant) {
      throw new Error("Executed request seed is missing");
    }

    await loginAs(page, USERS.tenantAdmin);
    const detail = await getTransferRequest(page, uiSubmittedRequest.requestId);
    expect(detail?.status).toBe("EXECUTED");
    expect(Number(detail?.target_tenant_id ?? 0)).toBe(targetTenant.id);
    expect(Number(detail?.tenant_id ?? 0)).toBe(sourceTenantId);
    expect(detail?.execution_result_json).toBeTruthy();

    const result = detail?.execution_result_json ?? {};
    expect(Number(result?.asset_id ?? 0)).toBe(uiSubmittedRequest.assetId);
    expect(Number(result?.source_tenant_id ?? 0)).toBe(sourceTenantId);
    expect(Number(result?.target_tenant_id ?? 0)).toBe(targetTenant.id);
    expect(Array.isArray(result?.reset_fields)).toBeTruthy();

    await getAssetDetail(page, uiSubmittedRequest.assetId, 404);
  });

  test("ATR-010 cancel guard", async ({ page }) => {
    if (!executedRequest) throw new Error("Executed request seed missing");

    await loginAs(page, USERS.tenantAdmin);
    await openTransferRequestDetail(page, executedRequest.requestId);
    await expect(page.getByText("No action available for status EXECUTED")).toBeVisible({
      timeout: 20_000,
    });

    const decideAttempt = await apiPostJson(page, `/api/v1/asset-transfer-requests/${executedRequest.requestId}/decide`, {
      action: "REJECT",
      decision_note: "Should not be possible",
    });

    expect(decideAttempt.status).toBe(400);
    expect(JSON.stringify(decideAttempt.json)).toMatch(/Only SUBMITTED transfer requests can be decided/);
  });

  test("ATR-011 delete is forbidden for auditor", async ({ page }) => {
    if (!targetTenant) throw new Error("Target tenant option missing");

    await loginAs(page, USERS.tenantAdmin);
    const asset = await createAssetViaUi(page, "auditor-delete");
    const created = await createTransferRequestViaApi(page, asset.assetId, targetTenant.id, "Auditor delete guard");

    await loginAs(page, USERS.auditor);
    const response = await apiDeleteJson(page, `/api/v1/asset-transfer-requests/${created.requestId}`);

    expect(response.status).toBe(403);
    expect(response.json?.error?.code).toBe("FORBIDDEN");
  });

  test("ATR-012 delete is blocked for non-DRAFT requests", async ({ page }) => {
    if (!submittedRequest) throw new Error("Submitted request seed missing");

    await loginAs(page, USERS.tenantAdmin);
    await openTransferRequestDetail(page, submittedRequest.requestId);
    await expect(page.getByRole("button", { name: "Delete Draft" })).toHaveCount(0);

    const response = await apiDeleteJson(page, `/api/v1/asset-transfer-requests/${submittedRequest.requestId}`);
    expect(response.status).toBe(409);
    expect(response.json?.error?.code).toBe("ASSET_TRANSFER_NOT_DELETABLE");
  });

  test("ATR-013 delete draft request succeeds", async ({ page }) => {
    if (!draftRequest) throw new Error("Draft request seed missing");

    await loginAs(page, USERS.tenantAdmin);
    await openTransferRequestDetail(page, draftRequest.requestId);
    await expect(page.getByRole("button", { name: "Delete Draft" })).toBeVisible();

    const deleteResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().endsWith(`/api/v1/asset-transfer-requests/${draftRequest.requestId}`),
      { timeout: 30_000 }
    );

    await page.getByRole("button", { name: "Delete Draft" }).first().click();
    await expect(page.getByRole("heading", { name: "Delete draft transfer request" })).toBeVisible();
    const confirmModal = page.locator("div.fixed").last();
    await confirmModal.getByRole("button", { name: "Delete Draft" }).click();

    const response = await deleteResponse;
    expect(response.status()).toBe(200);
    await expect(page.getByText(`Draft transfer request ${draftRequest.requestCode} deleted.`)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page).toHaveURL(/\/asset-transfer-requests$/);
  });
});
