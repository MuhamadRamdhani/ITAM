import fs from "node:fs";

import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";

type Credentials = {
  tenantCode: string;
  email: string;
  password: string;
};

type VendorSeed = {
  vendorId: number;
  vendorCode: string;
  vendorName: string;
};

type ContractSeed = {
  contractId: number;
  contractCode: string;
  contractName: string;
  contractType: string;
  status: string;
  vendorId: number;
  vendorCode: string;
  vendorName: string;
  updatedName: string;
  updatedNotes: string;
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

const WEB_BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");

let seedVendor: VendorSeed | null = null;
let seedContract: ContractSeed | null = null;

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

async function apiPostJson(page: Page, pathUrl: string, body: unknown) {
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
    { url: `${API_BASE}${pathUrl}`, payload: body }
  );
}

async function apiPatchJson(page: Page, pathUrl: string, body: unknown) {
  return page.evaluate(
    async ({ url, payload }) => {
      const res = await fetch(url, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { status: res.status, json: await res.json() };
    },
    { url: `${API_BASE}${pathUrl}`, payload: body }
  );
}

async function apiDelete(page: Page, pathUrl: string) {
  return page.evaluate(async (url) => {
    const res = await fetch(url, {
      method: "DELETE",
      credentials: "include",
    });
    return { status: res.status, json: await res.json() };
  }, `${API_BASE}${pathUrl}`);
}

async function fetchJson(page: Page, pathUrl: string) {
  return page.evaluate(async (url) => {
    const res = await fetch(url, { credentials: "include" });
    return await res.json();
  }, `${API_BASE}${pathUrl}`);
}

async function fetchJsonWithStatus(page: Page, pathUrl: string) {
  return page.evaluate(async (url) => {
    const res = await fetch(url, { credentials: "include" });
    return { status: res.status, json: await res.json() };
  }, `${API_BASE}${pathUrl}`);
}

async function openContractsPage(page: Page) {
  await page.goto("/contracts");
  await expect(page.getByRole("heading", { name: "Contracts" })).toBeVisible();
}

async function createVendorViaApi(page: Page) {
  const suffix = uniqueSuffix();
  const payload = {
    vendor_code: `PW-CT-VEND-${suffix}`,
    vendor_name: `Playwright Contract Vendor ${suffix}`,
    vendor_type: "SOFTWARE_PUBLISHER",
    status: "ACTIVE",
    primary_contact_name: "Playwright Contract Contact",
    primary_contact_email: `contract.vendor.${suffix}@example.com`,
    primary_contact_phone: "081234567890",
    notes: "Playwright contract seed vendor",
  };

  const res = await apiPostJson(page, "/api/v1/vendors", payload);
  expect(res.status).toBe(201);

  const vendorId = Number(res.json?.data?.id ?? 0);
  expect(vendorId).toBeGreaterThan(0);

  return {
    vendorId,
    vendorCode: payload.vendor_code,
    vendorName: payload.vendor_name,
  };
}

async function createContractViaUi(
  page: Page,
  vendor: VendorSeed,
  opts?: Partial<{
    contractCode: string;
    contractName: string;
    contractType: string;
    status: string;
    startDate: string;
    endDate: string;
    renewalNoticeDays: number;
    notes: string;
  }>
) {
  const suffix = uniqueSuffix();
  const contractCode = opts?.contractCode || `PW-CT-${suffix}`;
  const contractName = opts?.contractName || `Playwright Contract ${suffix}`;
  const contractType = opts?.contractType || "SOFTWARE";
  const status = opts?.status || "ACTIVE";
  const startDate = opts?.startDate || addDays(-10);
  const endDate = opts?.endDate || addDays(10);
  const renewalNoticeDays = String(opts?.renewalNoticeDays ?? 30);
  const notes = opts?.notes || "Playwright contract seed";

  await openContractsPage(page);
  await page.getByRole("button", { name: "New Contract" }).click();

  const form = page.locator("form").first();
  await expect(form.getByRole("button", { name: "Save Contract" })).toBeVisible();

  const selects = form.locator("select");
  const inputs = form.locator("input");
  const textareas = form.locator("textarea");

  await selects.nth(0).selectOption({ label: `${vendor.vendorCode} - ${vendor.vendorName}` });
  await inputs.nth(0).fill(contractCode);
  await inputs.nth(1).fill(contractName);
  await selects.nth(1).selectOption(contractType);
  await selects.nth(2).selectOption(status);
  await inputs.nth(2).fill(startDate);
  await inputs.nth(3).fill(endDate);
  await inputs.nth(4).fill(renewalNoticeDays);
  await inputs.nth(5).fill("");
  await textareas.nth(0).fill(notes);

  await Promise.all([
    page.waitForURL(/\/contracts\/\d+/, { timeout: 30_000 }),
    form.getByRole("button", { name: "Save Contract" }).click(),
  ]);

  const match = page.url().match(/\/contracts\/(\d+)/);
  if (!match) {
    throw new Error("Contract id was not present after create");
  }

  const contractId = Number(match[1]);
  expect(contractId).toBeGreaterThan(0);

  return {
    contractId,
    contractCode,
    contractName,
    contractType,
    status,
    vendorId: vendor.vendorId,
    vendorCode: vendor.vendorCode,
    vendorName: vendor.vendorName,
    startDate,
    endDate,
    renewalNoticeDays: Number(renewalNoticeDays),
    notes,
    updatedName: `${contractName} Updated`,
    updatedNotes: `${notes} updated`,
  };
}

async function createDocumentViaApi(page: Page) {
  const suffix = uniqueSuffix();
  const res = await apiPostJson(page, "/api/v1/documents", {
    doc_type_code: "CONTRACT",
    title: `Playwright Contract Document ${suffix}`,
    content_json: { title: `Contract Document ${suffix}` },
  });
  expect([200, 201]).toContain(res.status);
  const documentId = Number(res.json?.data?.document?.id ?? res.json?.data?.id ?? 0);
  expect(documentId).toBeGreaterThan(0);
  return {
    documentId,
    title: `Playwright Contract Document ${suffix}`,
  };
}

async function createAssetViaApi(page: Page, opts?: Partial<{ assetTag: string; name: string }>) {
  const suffix = uniqueSuffix();
  const payload: Record<string, unknown> = {
    asset_tag: opts?.assetTag || `PW-CT-ASSET-${suffix}`,
    name: opts?.name || `Playwright Contract Asset ${suffix}`,
    asset_type_code: "HARDWARE",
    initial_state_code: "REQUESTED",
    status: "AKTIF",
    purchase_date: addDays(-15),
    warranty_start_date: addDays(-15),
    warranty_end_date: addDays(365),
    support_start_date: addDays(-15),
    support_end_date: addDays(365),
    notes: "Playwright contract asset",
  };

  const res = await apiPostJson(page, "/api/v1/assets", payload);
  expect([200, 201]).toContain(res.status);
  const assetId = Number(res.json?.data?.asset?.id ?? res.json?.data?.id ?? 0);
  expect(assetId).toBeGreaterThan(0);
  return {
    assetId,
    assetTag: opts?.assetTag || `PW-CT-ASSET-${suffix}`,
    name: opts?.name || `Playwright Contract Asset ${suffix}`,
  };
}

async function createSoftwareProductViaApi(page: Page) {
  const suffix = uniqueSuffix();
  const res = await apiPostJson(page, "/api/v1/software-products", {
    product_code: `PW-SP-CT-${suffix}`,
    product_name: `Playwright Contract Software ${suffix}`,
    publisher_vendor_id: seedVendor?.vendorId ?? null,
    category: "BUSINESS_APPLICATION",
    deployment_model: "SAAS",
    licensing_metric: "SUBSCRIPTION",
    status: "ACTIVE",
    version_policy: "VERSIONED",
    notes: "Playwright contract software product",
  });
  expect(res.status).toBe(201);
  const productId = Number(res.json?.data?.id ?? 0);
  expect(productId).toBeGreaterThan(0);
  return {
    productId,
    productCode: `PW-SP-CT-${suffix}`,
    productName: `Playwright Contract Software ${suffix}`,
  };
}

async function createEvidenceFileViaUi(page: Page, testInfo: TestInfo) {
  const filePath = testInfo.outputPath(`contract-evidence-${Date.now()}.txt`);
  fs.writeFileSync(filePath, `Playwright contract evidence ${Date.now()}`, "utf8");

  return filePath;
}

async function openContractDetail(page: Page, contractId: number) {
  await page.goto(`/contracts/${contractId}`);
  await expect(page.getByRole("heading", { name: "Contract Detail" })).toBeVisible();
}

async function ensureSeed(browser: Browser) {
  if (seedVendor && seedContract) return;

  const context = await browser.newContext({ baseURL: WEB_BASE });
  const page = await context.newPage();

  await loginAs(page, USERS.tenantAdmin);
  seedVendor = await createVendorViaApi(page);
  seedContract = await createContractViaUi(page, seedVendor, {
    contractType: "SOFTWARE",
    status: "ACTIVE",
    startDate: addDays(-15),
    endDate: addDays(10),
    renewalNoticeDays: 30,
    notes: "Playwright contract seed",
  });

  await context.close();
}

test.describe.serial("Contracts", () => {
  test.beforeAll(async ({ browser }) => {
    await ensureSeed(browser);
  });

  test("CONT-002 create contract", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    if (!seedVendor) throw new Error("Seed vendor is missing");

    const created = await createContractViaUi(page, seedVendor, {
      contractType: "SOFTWARE",
      status: "ACTIVE",
      startDate: addDays(-7),
      endDate: addDays(10),
      renewalNoticeDays: 30,
      contractName: `Playwright Contract ${uniqueSuffix()}`,
      notes: "Contract created by Playwright",
    });

    seedContract = created;

    await expect(page.locator("form").first().locator("input").nth(1)).toHaveValue(
      created.contractName
    );
    await expect(page.locator("form").first().locator("select").nth(1)).toHaveValue(
      created.contractType
    );
    await expect(page.getByText("EXPIRING")).toBeVisible();
  });

  test("CONT-001 list/filter contracts", async ({ page }) => {
    if (!seedContract) throw new Error("Seed contract is missing");
    await loginAs(page, USERS.tenantAdmin);

    await openContractsPage(page);
    await expect(page.getByText(seedContract.contractCode)).toBeVisible();

    await page.getByPlaceholder("Search code, name, vendor...").fill(seedContract.contractCode);
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page.getByText(seedContract.contractCode)).toBeVisible();
    await expect(page.getByText(seedContract.contractName)).toBeVisible();
    await expect(page.getByText(seedContract.vendorName).first()).toBeVisible();

    await page.getByRole("link", { name: "ACTIVE" }).click();
    await expect(page.getByText(seedContract.contractCode)).toBeVisible();

    await page.getByRole("combobox").nth(0).selectOption("SOFTWARE");
    await expect(page.getByText(seedContract.contractCode)).toBeVisible();

    await page.getByRole("combobox").nth(1).selectOption("EXPIRING");
    await expect(page.getByText(seedContract.contractCode)).toBeVisible();
  });

  test("CONT-008 health calculation", async ({ page }) => {
    if (!seedContract) throw new Error("Seed contract is missing");
    await loginAs(page, USERS.tenantAdmin);

    await openContractDetail(page, seedContract.contractId);
    await expect(page.getByText("EXPIRING")).toBeVisible();

    const before = await fetchJson(page, `/api/v1/contracts/${seedContract.contractId}`);
    const beforeRow = before?.data ?? before?.data?.data ?? before?.contract ?? null;
    expect(String(beforeRow?.contract_health ?? "")).toBe("EXPIRING");
    expect(Number(beforeRow?.days_to_expiry ?? 0)).toBeGreaterThanOrEqual(0);

    const form = page.locator("form").first();
    await form.locator("input").nth(4).fill("5");
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.getByText("Perubahan kontrak berhasil disimpan.")).toBeVisible();
    const after = await fetchJson(page, `/api/v1/contracts/${seedContract.contractId}`);
    const afterRow = after?.data ?? after?.data?.data ?? after?.contract ?? null;
    expect(String(afterRow?.contract_health ?? "")).toBe("ACTIVE");
  });

  test("CONT-015 tenant admin can delete draft contract", async ({ page }) => {
    if (!seedVendor) throw new Error("Seed vendor is missing");
    await loginAs(page, USERS.tenantAdmin);

    const draft = await createContractViaUi(page, seedVendor, {
      contractType: "SOFTWARE",
      status: "DRAFT",
      startDate: addDays(-5),
      endDate: addDays(20),
      renewalNoticeDays: 30,
      contractName: `Playwright Draft Contract ${uniqueSuffix()}`,
      notes: "Draft contract delete test",
    });

    await openContractDetail(page, draft.contractId);
    await expect(page.getByRole("button", { name: "Delete Draft" })).toBeVisible();
    await page.getByRole("button", { name: "Delete Draft" }).first().click();

    const confirmModal = page.locator("div.fixed.inset-0.z-50").first();
    await expect(confirmModal.getByText(/dihapus permanen/i)).toBeVisible();
    const deleteResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().includes(`/api/v1/contracts/${draft.contractId}`),
      { timeout: 30_000 }
    );
    await page.getByRole("button", { name: "Delete Draft" }).last().click();
    const deleteResponseResult = await deleteResponse;
    expect(deleteResponseResult.status()).toBe(200);

    await page.goto(`/contracts/${draft.contractId}`);
    await expect(page.getByText(/Contract not found|not ditemukan/i)).toBeVisible({
      timeout: 20_000,
    });
  });

  test("CONT-016 non-draft contract blocks delete draft UI and API", async ({ page }) => {
    if (!seedContract) throw new Error("Seed contract is missing");
    await loginAs(page, USERS.tenantAdmin);

    await openContractDetail(page, seedContract.contractId);
    await expect(page.getByRole("button", { name: "Delete Draft" })).toHaveCount(0);

    const denied = await apiDelete(page, `/api/v1/contracts/${seedContract.contractId}`);
    expect(denied.status).toBe(409);
    expect(denied.json?.error?.code).toBe("CONTRACT_NOT_DELETABLE");
  });

  test("CONT-007 edit contract", async ({ page }) => {
    if (!seedContract) throw new Error("Seed contract is missing");
    await loginAs(page, USERS.tenantAdmin);

    await openContractDetail(page, seedContract.contractId);
    const form = page.locator("form").first();
    const selects = form.locator("select");
    const inputs = form.locator("input");
    const textareas = form.locator("textarea");

    const updatedCode = `${seedContract.contractCode}-UPD`;
    await inputs.nth(0).fill(updatedCode);
    await inputs.nth(1).fill(seedContract.updatedName);
    await selects.nth(2).selectOption("DRAFT");
    await textareas.nth(0).fill(seedContract.updatedNotes);
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.getByText("Perubahan kontrak berhasil disimpan.")).toBeVisible();
    await expect(inputs.nth(0)).toHaveValue(updatedCode);
    await expect(inputs.nth(1)).toHaveValue(seedContract.updatedName);
    await expect(textareas.nth(0)).toHaveValue(seedContract.updatedNotes);

    seedContract = {
      ...seedContract,
      contractCode: updatedCode,
      contractName: seedContract.updatedName,
    };
  });

  test("CONT-003 document relation", async ({ page }) => {
    if (!seedContract) throw new Error("Seed contract is missing");
    await loginAs(page, USERS.tenantAdmin);

    await openContractDetail(page, seedContract.contractId);
    const createdTitle = `Playwright Contract Document Relation ${uniqueSuffix()}`;

    await page.getByRole("button", { name: "Create New Document" }).click();
    const createForm = page.locator("form").filter({ hasText: "Document Type" }).last();
    await createForm.getByPlaceholder("CONTRACT").fill("CONTRACT");
    await createForm.getByPlaceholder("Agreement Supporting Document").fill(createdTitle);
    await createForm.getByPlaceholder("Attachment note...").fill("Playwright contract document relation");

    await Promise.all([
      page.waitForLoadState("networkidle"),
      createForm.getByRole("button", { name: "Create & Attach" }).click(),
    ]);

    await expect(page.getByRole("link", { name: createdTitle })).toBeVisible();
  });

  test("CONT-010 document unlink", async ({ page }) => {
    if (!seedContract) throw new Error("Seed contract is missing");
    await loginAs(page, USERS.tenantAdmin);

    await openContractDetail(page, seedContract.contractId);
    const docs = await fetchJson(page, `/api/v1/contracts/${seedContract.contractId}/documents?page=1&page_size=100`);
    const firstDocId = Number(docs?.data?.items?.[0]?.document_id ?? 0);
    const firstDocTitle = String(docs?.data?.items?.[0]?.document?.title ?? "");
    expect(firstDocId).toBeGreaterThan(0);

    const del = await apiDelete(page, `/api/v1/contracts/${seedContract.contractId}/documents/${firstDocId}`);
    expect(del.status).toBe(200);

    await openContractDetail(page, seedContract.contractId);
    await expect(page.getByRole("link", { name: firstDocTitle })).toHaveCount(0);
  });

  test("CONT-004 asset relation", async ({ page }) => {
    if (!seedContract) throw new Error("Seed contract is missing");
    await loginAs(page, USERS.tenantAdmin);

    const createdAsset = await createAssetViaApi(page);

    await openContractDetail(page, seedContract.contractId);
    const attach = await apiPostJson(page, `/api/v1/contracts/${seedContract.contractId}/assets`, {
      asset_id: createdAsset.assetId,
      note: "Playwright contract asset relation",
    });
    expect(attach.status).toBe(201);

    await openContractDetail(page, seedContract.contractId);
    await expect(page.getByText(createdAsset.assetTag)).toBeVisible();
  });

  test("CONT-005 evidence relation", async ({ page }, testInfo) => {
    if (!seedContract) throw new Error("Seed contract is missing");
    await loginAs(page, USERS.tenantAdmin);

    const evidenceFilePath = await createEvidenceFileViaUi(page, testInfo);
    const evidenceContent = fs.readFileSync(evidenceFilePath, "utf8");

    await openContractDetail(page, seedContract.contractId);
    const uploadJson = await page.evaluate(
      async ({ uploadUrl, content }) => {
        const blob = new Blob([content], { type: "text/plain" });
        const formData = new FormData();
        formData.append("file", blob, "contract-evidence.txt");
        const res = await fetch(uploadUrl, {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        return { status: res.status, json: await res.json() };
      },
      { uploadUrl: `${API_BASE}/api/v1/evidence/files`, content: evidenceContent }
    );
    expect([200, 201]).toContain(uploadJson.status);
    const evidenceFileId = Number(uploadJson.json?.data?.file?.id ?? 0);
    expect(evidenceFileId).toBeGreaterThan(0);

    const attach = await apiPostJson(page, `/api/v1/contracts/${seedContract.contractId}/evidence`, {
      evidence_file_id: evidenceFileId,
      note: "Playwright contract evidence relation",
    });
    expect(attach.status).toBe(201);

    await openContractDetail(page, seedContract.contractId);
    await expect(page.getByRole("cell", { name: "contract-evidence.txt" })).toBeVisible();
  });

  test("CONT-006 entitlement and allocation", async ({ page }) => {
    if (!seedContract) throw new Error("Seed contract is missing");
    await loginAs(page, USERS.tenantAdmin);

    const product = await createSoftwareProductViaApi(page);
    const attachedAsset = await createAssetViaApi(page, {
      assetTag: `PW-CT-ASSET-ALLOC-${uniqueSuffix()}`,
      name: "Playwright Contract Asset Allocation",
    });

    const assetAttach = await apiPostJson(page, `/api/v1/contracts/${seedContract.contractId}/assets`, {
      asset_id: attachedAsset.assetId,
      note: "Playwright contract asset for allocation",
    });
    expect(assetAttach.status).toBe(201);

    const suffix = uniqueSuffix();
    const entitlementCode = `PW-ENT-${suffix}`;
    const entitlementRes = await apiPostJson(page, `/api/v1/contracts/${seedContract.contractId}/software-entitlements`, {
      software_product_id: product.productId,
      entitlement_code: entitlementCode,
      entitlement_name: `Playwright Entitlement ${suffix}`,
      licensing_metric: "PER_USER",
      quantity_purchased: 5,
      start_date: addDays(-1),
      end_date: addDays(10),
      status: "ACTIVE",
      notes: "Playwright entitlement",
    });
    expect(entitlementRes.status).toBe(201);
    const entitlementId = Number(entitlementRes.json?.data?.id ?? 0);
    expect(entitlementId).toBeGreaterThan(0);

    const allocationRes = await apiPostJson(page, `/api/v1/software-entitlements/${entitlementId}/allocations`, {
      asset_id: attachedAsset.assetId,
      allocation_basis: "MANUAL",
      allocated_quantity: 1,
      status: "ACTIVE",
      allocated_at: addDays(-1),
      notes: "Playwright allocation",
    });
    expect(allocationRes.status).toBe(201);

    await openContractDetail(page, seedContract.contractId);
    await expect(page.getByText(entitlementCode)).toBeVisible();

    await page.getByRole("button", { name: "Manage Allocations" }).first().click();
    const allocModal = page.locator("div.fixed.inset-0.z-50").first();
    await expect(allocModal.getByRole("cell", { name: attachedAsset.assetTag })).toBeVisible();
    await allocModal.getByRole("button", { name: "Release" }).first().click();
    await expect(allocModal.getByText("RELEASED")).toBeVisible();
  });

  test("CONT-017 draft contract delete is blocked by asset relation", async ({ page }) => {
    if (!seedVendor) throw new Error("Seed vendor is missing");
    await loginAs(page, USERS.tenantAdmin);

    const draft = await createContractViaUi(page, seedVendor, {
      contractType: "SOFTWARE",
      status: "DRAFT",
      startDate: addDays(-5),
      endDate: addDays(20),
      renewalNoticeDays: 30,
      contractName: `Playwright Asset Blocker ${uniqueSuffix()}`,
      notes: "Contract delete asset blocker",
    });

    const asset = await createAssetViaApi(page, {
      assetTag: `PW-CT-BLOCK-ASSET-${uniqueSuffix()}`,
      name: "Playwright Block Asset",
    });
    const attach = await apiPostJson(page, `/api/v1/contracts/${draft.contractId}/assets`, {
      asset_id: asset.assetId,
      note: "Asset blocker",
    });
    expect(attach.status).toBe(201);

    await openContractDetail(page, draft.contractId);
    await page.getByRole("button", { name: "Delete Draft" }).first().click();
    const confirmModal = page.locator("div.fixed.inset-0.z-50").first();
    await page.getByRole("button", { name: "Delete Draft" }).last().click();

    await expect(page.getByText("Contract is still in use").first()).toBeVisible({
      timeout: 20_000,
    });
    const denied = await apiDelete(page, `/api/v1/contracts/${draft.contractId}`);
    expect(denied.status).toBe(409);
    expect(denied.json?.error?.code).toBe("CONTRACT_IN_USE");
  });

  test("CONT-018 draft contract delete is blocked by document relation", async ({ page }) => {
    if (!seedVendor) throw new Error("Seed vendor is missing");
    await loginAs(page, USERS.tenantAdmin);

    const draft = await createContractViaUi(page, seedVendor, {
      contractType: "SOFTWARE",
      status: "DRAFT",
      startDate: addDays(-5),
      endDate: addDays(20),
      renewalNoticeDays: 30,
      contractName: `Playwright Document Blocker ${uniqueSuffix()}`,
      notes: "Contract delete document blocker",
    });

    const document = await createDocumentViaApi(page);
    const attach = await apiPostJson(page, `/api/v1/contracts/${draft.contractId}/documents`, {
      document_id: document.documentId,
      note: "Document blocker",
    });
    expect(attach.status).toBe(201);

    await openContractDetail(page, draft.contractId);
    await page.getByRole("button", { name: "Delete Draft" }).first().click();
    const confirmModal = page.locator("div.fixed.inset-0.z-50").first();
    await page.getByRole("button", { name: "Delete Draft" }).last().click();

    await expect(page.getByText("Contract is still in use").first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("CONT-019 draft contract delete is blocked by software entitlement relation", async ({ page }) => {
    if (!seedVendor) throw new Error("Seed vendor is missing");
    await loginAs(page, USERS.tenantAdmin);

    const draft = await createContractViaUi(page, seedVendor, {
      contractType: "SOFTWARE",
      status: "DRAFT",
      startDate: addDays(-5),
      endDate: addDays(20),
      renewalNoticeDays: 30,
      contractName: `Playwright Entitlement Blocker ${uniqueSuffix()}`,
      notes: "Contract delete entitlement blocker",
    });

    const product = await createSoftwareProductViaApi(page);
    const entitlementRes = await apiPostJson(page, `/api/v1/contracts/${draft.contractId}/software-entitlements`, {
      software_product_id: product.productId,
      entitlement_code: `PW-ENT-BLOCK-${uniqueSuffix()}`,
      entitlement_name: `Playwright Entitlement Block ${uniqueSuffix()}`,
      licensing_metric: "PER_USER",
      quantity_purchased: 3,
      start_date: addDays(-1),
      end_date: addDays(20),
      status: "ACTIVE",
      notes: "Entitlement blocker",
    });
    expect(entitlementRes.status).toBe(201);

    await openContractDetail(page, draft.contractId);
    await page.getByRole("button", { name: "Delete Draft" }).first().click();
    const confirmModal = page.locator("div.fixed.inset-0.z-50").first();
    await confirmModal.getByRole("button", { name: "Delete Draft" }).click();

    await expect(page.getByText("Contract is still in use").first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("CONT-011 asset unlink", async ({ page }) => {
    if (!seedContract) throw new Error("Seed contract is missing");
    await loginAs(page, USERS.tenantAdmin);

    await openContractDetail(page, seedContract.contractId);
    const assets = await fetchJson(page, `/api/v1/contracts/${seedContract.contractId}/assets?page=1&page_size=100`);
    const firstAssetId = Number(assets?.data?.items?.[0]?.asset_id ?? 0);
    const firstAssetTag = String(assets?.data?.items?.[0]?.asset?.asset_tag ?? "");
    expect(firstAssetId).toBeGreaterThan(0);

    const del = await apiDelete(page, `/api/v1/contracts/${seedContract.contractId}/assets/${firstAssetId}`);
    expect(del.status).toBe(200);

    await openContractDetail(page, seedContract.contractId);
    await expect(page.getByRole("link", { name: firstAssetTag })).toHaveCount(0);
  });

  test("CONT-009 create validation", async ({ page }) => {
    if (!seedContract) throw new Error("Seed contract is missing");
    await loginAs(page, USERS.tenantAdmin);

    const duplicate = await apiPostJson(page, "/api/v1/contracts", {
      vendor_id: seedVendor?.vendorId,
      contract_code: seedContract.contractCode,
      contract_name: "Duplicate Contract",
      contract_type: "SOFTWARE",
      status: "ACTIVE",
      start_date: addDays(-5),
      end_date: addDays(5),
      renewal_notice_days: 30,
      owner_identity_id: null,
      notes: "Duplicate test",
    });

    expect(duplicate.status).toBe(409);
    expect(String(duplicate.json?.message || duplicate.json?.error?.message || "")).toContain(
      "contract_code already exists"
    );
  });

  test("CONT-012 role guard", async ({ page }) => {
    if (!seedVendor) throw new Error("Seed vendor is missing");
    await loginAs(page, USERS.tenantAdmin);
    const draft = await createContractViaUi(page, seedVendor, {
      contractType: "SOFTWARE",
      status: "DRAFT",
      startDate: addDays(-5),
      endDate: addDays(20),
      renewalNoticeDays: 30,
      contractName: `Playwright Auditor Guard ${uniqueSuffix()}`,
      notes: "Auditor delete guard",
    });

    await loginAs(page, USERS.auditor);

    await openContractsPage(page);
    await expect(page.getByRole("button", { name: "New Contract" })).toHaveCount(0);
    await openContractDetail(page, draft.contractId);
    await expect(page.getByRole("button", { name: "Delete Draft" })).toHaveCount(0);

    const denied = await apiPostJson(page, "/api/v1/contracts", {
      vendor_id: seedVendor?.vendorId,
      contract_code: `PW-AUD-${uniqueSuffix()}`,
      contract_name: "Auditor Contract",
      contract_type: "SOFTWARE",
      status: "ACTIVE",
      start_date: addDays(-5),
      end_date: addDays(5),
      renewal_notice_days: 30,
      owner_identity_id: null,
      notes: "Auditor test",
    });

    expect(denied.status).toBe(403);
  });

  test("CONT-013 invalid date transition", async ({ page }) => {
    if (!seedContract) throw new Error("Seed contract is missing");
    await loginAs(page, USERS.tenantAdmin);

    const before = await fetchJson(page, `/api/v1/contracts/${seedContract.contractId}`);
    const beforeRow = before?.data ?? before?.data?.data ?? before?.contract ?? null;
    expect(Number(beforeRow?.id ?? seedContract.contractId)).toBeGreaterThan(0);

    const invalid = await apiPatchJson(page, `/api/v1/contracts/${seedContract.contractId}`, {
      start_date: addDays(10),
      end_date: addDays(5),
    });

    expect(invalid.status).toBeGreaterThanOrEqual(400);
    expect(String(invalid.json?.message || invalid.json?.error?.message || "")).toContain(
      "end_date cannot be earlier than start_date"
    );

    const after = await fetchJson(page, `/api/v1/contracts/${seedContract.contractId}`);
    const afterRow = after?.data ?? after?.data?.data ?? after?.contract ?? null;
    expect(String(afterRow?.start_date ?? "")).toBe(String(beforeRow?.start_date ?? ""));
    expect(String(afterRow?.end_date ?? "")).toBe(String(beforeRow?.end_date ?? ""));
  });

  test("CONT-014 auditor cannot update contract", async ({ page }) => {
    if (!seedContract) throw new Error("Seed contract is missing");
    await loginAs(page, USERS.auditor);

    const before = await fetchJson(page, `/api/v1/contracts/${seedContract.contractId}`);
    const beforeRow = before?.data ?? before?.data?.data ?? before?.contract ?? null;
    const previousName = String(beforeRow?.contract_name ?? seedContract.contractName ?? "");

    const denied = await apiPatchJson(page, `/api/v1/contracts/${seedContract.contractId}`, {
      contract_name: `${previousName} Forbidden`,
    });

    expect(denied.status).toBe(403);
    expect(denied.json?.error?.code).toBe("FORBIDDEN");

    const after = await fetchJson(page, `/api/v1/contracts/${seedContract.contractId}`);
    const afterRow = after?.data ?? after?.data?.data ?? after?.contract ?? null;
    expect(String(afterRow?.contract_name ?? "")).toBe(previousName);
  });
});
