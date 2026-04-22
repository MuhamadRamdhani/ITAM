import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

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

type AssetSeed = {
  assetId: number;
  assetTag: string;
  name: string;
};

type IdentitySeed = {
  identityId: number;
  name: string;
  email: string;
};

type ContractSeed = {
  contractId: number;
  contractCode: string;
  contractName: string;
};

type SoftwareProductSeed = {
  productId: number;
  productCode: string;
  productName: string;
  updatedName: string;
  updatedNotes: string;
};

type ApiResponse<T = unknown> = {
  status: number;
  json: T;
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

let seedVendor: VendorSeed | null = null;
let seedInstallationAsset: AssetSeed | null = null;
let seedAllocationAsset: AssetSeed | null = null;
let seedIdentity: IdentitySeed | null = null;
let seedContract: ContractSeed | null = null;
let seedInactiveProduct: SoftwareProductSeed | null = null;
let seedMainProduct: SoftwareProductSeed | null = null;

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function selectOptionContainingText(select: Locator, text: string) {
  const matches = await select.locator("option").evaluateAll(
    (options, needle) =>
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

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
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

async function apiPatchJson(page: Page, pathUrl: string, body: unknown): Promise<ApiResponse> {
  return page.evaluate(
    async ({ url, payload }) => {
      const res = await fetch(url, {
        method: "PATCH",
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

async function fetchJson(page: Page, pathUrl: string) {
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

async function openSoftwareProductsPage(page: Page) {
  await page.goto("/software-products");
  await expect(page.getByRole("heading", { name: "Software Products" })).toBeVisible();
}

async function openSoftwareProductDetail(page: Page, id: number) {
  await page.goto(`/software-products/${id}`);
  await expect(page.getByText("Software Product Detail")).toBeVisible();
}

async function openAssetDetail(page: Page, id: number) {
  await page.goto(`/assets/${id}`);
  await expect(page.getByRole("link", { name: "Software" })).toBeVisible();
}

async function openContractDetail(page: Page, id: number) {
  await page.goto(`/contracts/${id}`);
  await expect(page.getByRole("heading", { name: "Contract Detail" })).toBeVisible();
}

async function createVendorViaApi(page: Page) {
  const suffix = uniqueSuffix();
  const payload = {
    vendor_code: `PW-SP-VEND-${suffix}`,
    vendor_name: `Playwright Software Vendor ${suffix}`,
    vendor_type: "SOFTWARE_PUBLISHER",
    status: "ACTIVE",
    primary_contact_name: "Playwright Contact",
    primary_contact_email: `software.vendor.${suffix}@example.com`,
    primary_contact_phone: "081234567890",
    notes: "Playwright software products vendor",
  };

  const res = await apiPostJson(page, "/api/v1/vendors", payload);
  expect(res.status).toBe(201);

  const vendorId = Number((res.json as any)?.data?.id ?? 0);
  expect(vendorId).toBeGreaterThan(0);

  return {
    vendorId,
    vendorCode: payload.vendor_code,
    vendorName: payload.vendor_name,
  };
}

async function createIdentityViaUi(page: Page) {
  const suffix = uniqueSuffix();
  const identityName = `Playwright Identity ${suffix}`;
  const identityEmail = `playwright.identity.${suffix}@example.com`;

  await page.goto("/admin/identities");
  await expect(page.getByRole("heading", { name: "Identities" })).toBeVisible();

  await page.locator('input[placeholder="Dhani"]').fill(identityName);
  await page.locator('input[type="email"]').fill(identityEmail);
  const deptSelect = page.locator("form select").first();
  const deptOptions = await deptSelect.locator("option").evaluateAll((options) =>
    options
      .map((opt) => ({
        value: (opt as HTMLOptionElement).value,
        text: (opt.textContent || "").trim(),
      }))
      .filter((opt) => opt.value && !/no department/i.test(opt.text))
  );
  if (deptOptions.length > 0) {
    await deptSelect.selectOption(deptOptions[0].value);
  }

  await page.getByRole("button", { name: "Create Identity" }).click();
  await expect(page.getByText("Identity berhasil dibuat.")).toBeVisible({
    timeout: 20_000,
  });

  const list = await fetchJson(page, `/api/v1/admin/identities?q=${encodeURIComponent(identityEmail)}&page=1&page_size=20`);
  const items = ((list.json as any)?.data?.items ?? (list.json as any)?.items ?? []) as any[];
  const item = items.find((row) => String(row?.email || "").toLowerCase() === identityEmail.toLowerCase()) ?? items[0];

  return {
    identityId: Number(item?.id ?? 0),
    name: identityName,
    email: identityEmail,
  };
}

async function createContractViaApi(page: Page, vendorId: number) {
  const suffix = uniqueSuffix();
  const payload = {
    vendor_id: vendorId,
    contract_code: `PW-SP-CONTRACT-${suffix}`,
    contract_name: `Playwright Software Contract ${suffix}`,
    contract_type: "SOFTWARE",
    status: "ACTIVE",
    start_date: isoDate(-10),
    end_date: isoDate(45),
    renewal_notice_days: 30,
    owner_identity_id: null,
    notes: "Playwright software products contract",
  };

  const res = await apiPostJson(page, "/api/v1/contracts", payload);
  expect(res.status).toBe(201);

  const contractId = Number((res.json as any)?.data?.id ?? 0);
  expect(contractId).toBeGreaterThan(0);

  return {
    contractId,
    contractCode: payload.contract_code,
    contractName: payload.contract_name,
  };
}

async function createAssetViaApi(
  page: Page,
  opts?: Partial<{ assetTag: string; name: string }>
) {
  const suffix = uniqueSuffix();
  const payload = {
    asset_tag: opts?.assetTag || `PW-SP-ASSET-${suffix}`,
    name: opts?.name || `Playwright Software Asset ${suffix}`,
    asset_type_code: "HARDWARE",
    initial_state_code: "REQUESTED",
    status: "AKTIF",
    purchase_date: isoDate(-10),
    warranty_start_date: isoDate(-10),
    warranty_end_date: isoDate(365),
    support_start_date: isoDate(-10),
    support_end_date: isoDate(365),
    notes: "Playwright software products asset",
  };

  const res = await apiPostJson(page, "/api/v1/assets", payload);
  expect([200, 201]).toContain(res.status);

  const assetId = Number((res.json as any)?.data?.asset?.id ?? (res.json as any)?.data?.id ?? 0);
  expect(assetId).toBeGreaterThan(0);

  return {
    assetId,
    assetTag: payload.asset_tag,
    name: payload.name,
  };
}

async function attachAssetToContract(page: Page, contractId: number, assetId: number) {
  const res = await apiPostJson(page, `/api/v1/contracts/${contractId}/assets`, {
    asset_id: assetId,
    note: "Playwright contract asset relation",
  });

  expect([200, 201]).toContain(res.status);
}

async function createInactiveProductViaApi(page: Page, vendorId: number) {
  const suffix = uniqueSuffix();
  const payload = {
    product_code: `PW-SP-INACTIVE-${suffix}`,
    product_name: `Playwright Inactive Software ${suffix}`,
    publisher_vendor_id: vendorId,
    category: "BUSINESS_APPLICATION",
    deployment_model: "SAAS",
    licensing_metric: "SUBSCRIPTION",
    status: "INACTIVE",
    version_policy: "VERSIONLESS",
    notes: "Playwright inactive product",
  };

  const res = await apiPostJson(page, "/api/v1/software-products", payload);
  expect(res.status).toBe(201);

  const productId = Number((res.json as any)?.data?.id ?? 0);
  expect(productId).toBeGreaterThan(0);

  return {
    productId,
    productCode: payload.product_code,
    productName: payload.product_name,
    updatedName: `${payload.product_name} Updated`,
    updatedNotes: `${payload.notes} updated`,
  };
}

async function createSoftwareProductViaUi(
  page: Page,
  vendor: VendorSeed,
  opts?: Partial<{
    productCode: string;
    productName: string;
    status: "ACTIVE" | "INACTIVE";
    versionPolicy: "VERSIONED" | "VERSIONLESS";
    notes: string;
  }>
) {
  const suffix = uniqueSuffix();
  const productCode = opts?.productCode || `PW-SP-${suffix}`.toUpperCase();
  const productName = opts?.productName || `Playwright Software Product ${suffix}`;
  const status = opts?.status || "ACTIVE";
  const versionPolicy = opts?.versionPolicy || "VERSIONED";
  const notes = opts?.notes || "Playwright software product";

  await openSoftwareProductsPage(page);
  await page.getByRole("button", { name: "Create Software Product" }).click();
  await expect(page.getByRole("heading", { name: "Create Software Product" })).toBeVisible();

  const form = page.locator("form").first();
  const inputs = form.locator("input");
  const selects = form.locator("select");
  const textareas = form.locator("textarea");

  await inputs.nth(0).fill(productCode);
  await inputs.nth(1).fill(productName);
  await selects.nth(0).selectOption({ label: `${vendor.vendorCode} - ${vendor.vendorName}` });
  await selects.nth(1).selectOption("BUSINESS_APPLICATION");
  await selects.nth(2).selectOption("SAAS");
  await selects.nth(3).selectOption("SUBSCRIPTION");
  await selects.nth(4).selectOption(status);
  await selects.nth(5).selectOption(versionPolicy);
  await textareas.nth(0).fill(notes);

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/api/v1/software-products"),
      { timeout: 30_000 }
    ),
    form.getByRole("button", { name: "Save" }).click(),
  ]);

  await expect(page.getByText(`Software product ${productCode} berhasil dibuat.`)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("cell", { name: productCode, exact: true })).toBeVisible({
    timeout: 30_000,
  });

  const found = await fetchJson(page, `/api/v1/software-products?q=${encodeURIComponent(productCode)}&page=1&pageSize=20`);
  const items = ((found.json as any)?.data?.items ?? (found.json as any)?.items ?? []) as any[];
  const item = items.find((row) => String(row?.product_code || "").toUpperCase() === productCode.toUpperCase());
  expect(item).toBeTruthy();

  return {
    productId: Number(item.id),
    productCode,
    productName,
    status,
    versionPolicy,
    notes,
    updatedName: `${productName} Updated`,
    updatedNotes: `${notes} updated`,
  };
}

async function findProductByCode(page: Page, productCode: string) {
  const res = await fetchJson(
    page,
    `/api/v1/software-products?q=${encodeURIComponent(productCode)}&page=1&pageSize=20`
  );

  const items = ((res.json as any)?.data?.items ?? (res.json as any)?.items ?? []) as any[];
  return items.find((row) => String(row?.product_code || "").toUpperCase() === productCode.toUpperCase()) || null;
}

async function ensureSeed(browser: Browser) {
  if (seedVendor && seedInstallationAsset && seedAllocationAsset && seedIdentity && seedContract && seedInactiveProduct) {
    return;
  }

  const context = await browser.newContext({ baseURL: WEB_BASE });
  const page = await context.newPage();

  await loginAs(page, USERS.tenantAdmin);

  seedVendor = await createVendorViaApi(page);
  seedIdentity = await createIdentityViaUi(page);
  seedContract = await createContractViaApi(page, seedVendor.vendorId);
  seedInstallationAsset = await createAssetViaApi(page, {
    assetTag: `PW-SP-INSTALL-${uniqueSuffix()}`,
    name: "Playwright Software Installation Asset",
  });
  seedAllocationAsset = await createAssetViaApi(page, {
    assetTag: `PW-SP-ALLOC-${uniqueSuffix()}`,
    name: "Playwright Software Allocation Asset",
  });
  seedInactiveProduct = await createInactiveProductViaApi(page, seedVendor.vendorId);

  await attachAssetToContract(page, seedContract.contractId, seedInstallationAsset.assetId);
  await attachAssetToContract(page, seedContract.contractId, seedAllocationAsset.assetId);

  await context.close();
}

test.describe.serial("Software Products", () => {
  test.beforeAll(async ({ browser }) => {
    await ensureSeed(browser);
  });

  test("SW-001 product registry", async ({ page }) => {
    if (!seedVendor) throw new Error("Seed vendor is missing");

    await loginAs(page, USERS.tenantAdmin);
    seedMainProduct = await createSoftwareProductViaUi(page, seedVendor, {
      productName: `Playwright Software Main ${uniqueSuffix()}`,
      notes: "Software product created via UI",
    });

    await expect(
      page.getByRole("cell", { name: seedMainProduct.productCode, exact: true })
    ).toBeVisible();
  });

  test("SW-002 registry validation", async ({ page }) => {
    if (!seedVendor || !seedMainProduct) throw new Error("Seed software product is missing");

    await loginAs(page, USERS.tenantAdmin);

    const duplicate = await apiPostJson(page, "/api/v1/software-products", {
      product_code: seedMainProduct.productCode,
      product_name: `Duplicate ${seedMainProduct.productName}`,
      publisher_vendor_id: seedVendor.vendorId,
      category: "BUSINESS_APPLICATION",
      deployment_model: "SAAS",
      licensing_metric: "SUBSCRIPTION",
      status: "ACTIVE",
      version_policy: "VERSIONED",
      notes: "Duplicate product test",
    });

    expect(duplicate.status).toBe(409);
    expect((duplicate.json as any)?.error?.code).toBe("SOFTWARE_PRODUCT_CODE_TAKEN");
  });

  test("SW-003 downstream reuse", async ({ page }) => {
    if (!seedMainProduct || !seedInstallationAsset || !seedContract) {
      throw new Error("Seed data missing for downstream reuse test");
    }

    await loginAs(page, USERS.tenantAdmin);

    await openAssetDetail(page, seedInstallationAsset.assetId);
    await page.getByRole("link", { name: "Software" }).click();
    await expect(page.getByRole("button", { name: "Add Installation" })).toBeVisible();
    await page.getByRole("button", { name: "Add Installation" }).click();
    await expect(page.getByText("Add Software Installation")).toBeVisible();

    const productSelect = page.locator("div.fixed select").first();
    await page.waitForFunction(() => {
      const select = document.querySelector("div.fixed select") as HTMLSelectElement | null;
      return !!select && select.options.length > 1;
    }, { timeout: 20_000 });

    const productOptions = await productSelect.locator("option").evaluateAll((options) =>
      options
        .map((opt) => (opt.textContent || "").trim())
        .filter(Boolean)
    );
    expect(productOptions.join(" ")).toContain(seedMainProduct.productCode);

    await openContractDetail(page, seedContract.contractId);
    await page.getByRole("button", { name: "Add Entitlement" }).click();
    await expect(page.getByRole("heading", { name: "Add Software Entitlement" })).toBeVisible();

    const entitlementProductSelect = page.locator("div.fixed select").first();
    await page.waitForFunction(() => {
      const select = document.querySelector("div.fixed select") as HTMLSelectElement | null;
      return !!select && select.options.length > 1;
    }, { timeout: 20_000 });

    const entitlementOptions = await entitlementProductSelect.locator("option").evaluateAll((options) =>
      options
        .map((opt) => (opt.textContent || "").trim())
        .filter(Boolean)
    );
    expect(entitlementOptions.join(" ")).toContain(seedMainProduct.productCode);
  });

  test("SW-004 edit product", async ({ page }) => {
    if (!seedMainProduct) throw new Error("Seed software product is missing");

    await loginAs(page, USERS.tenantAdmin);
    await openSoftwareProductDetail(page, seedMainProduct.productId);

    const form = page.locator("form").first();
    const inputs = form.locator("input");
    const textareas = form.locator("textarea");

    await inputs.nth(1).fill(seedMainProduct.updatedName);
    await textareas.nth(0).fill(seedMainProduct.updatedNotes);

    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Software product berhasil diperbarui.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: seedMainProduct.updatedName })).toBeVisible();

    seedMainProduct = {
      ...seedMainProduct,
      productName: seedMainProduct.updatedName,
    };
  });

  test("SW-005 status active inactive", async ({ page }) => {
    if (!seedInactiveProduct || !seedMainProduct) throw new Error("Seed software products missing");

    await loginAs(page, USERS.tenantAdmin);
    await openSoftwareProductsPage(page);

    const filterForm = page.locator("form").first();
    await filterForm.locator("select").nth(0).selectOption("INACTIVE");
    await expect(
      page.getByRole("cell", { name: seedInactiveProduct.productCode, exact: true })
    ).toBeVisible({ timeout: 20_000 });

    await filterForm.locator("select").nth(0).selectOption("ACTIVE");
    await expect(
      page.getByRole("cell", { name: seedMainProduct.productCode, exact: true })
    ).toBeVisible({ timeout: 20_000 });
  });

  test("SW-006 installations", async ({ page }) => {
    if (!seedMainProduct || !seedInstallationAsset) throw new Error("Seed installation data missing");

    await loginAs(page, USERS.tenantAdmin);
    await openAssetDetail(page, seedInstallationAsset.assetId);
    await page.getByRole("link", { name: "Software" }).click();
    await expect(page.getByRole("button", { name: "Add Installation" })).toBeVisible();
    await page.getByRole("button", { name: "Add Installation" }).click();
    await expect(page.getByText("Add Software Installation")).toBeVisible();

    const modal = page.locator("div.fixed").last();
    const productSelect = modal.locator("select").nth(0);
    await page.waitForFunction(() => {
      const select = document.querySelector("div.fixed select") as HTMLSelectElement | null;
      return !!select && select.options.length > 1;
    }, { timeout: 20_000 });
    await selectOptionContainingText(productSelect, seedMainProduct.productCode);
    await modal.locator('input[placeholder="e.g. 16.0"]').fill("1.0.0");
    await modal.getByRole("button", { name: "Create Installation" }).click();

    await expect(page.getByText("1.0.0")).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("row", { name: new RegExp(seedMainProduct.productCode) })
    ).toBeVisible({ timeout: 30_000 });
  });

  test("SW-007 assignments", async ({ page }) => {
    if (!seedIdentity || !seedInstallationAsset) throw new Error("Seed identity or installation asset missing");

    await loginAs(page, USERS.tenantAdmin);
    await openAssetDetail(page, seedInstallationAsset.assetId);
    await page.getByRole("link", { name: "Software" }).click();
    await expect(page.getByRole("button", { name: "Manage Assignments" })).toBeVisible();
    await page.getByRole("button", { name: "Manage Assignments" }).first().click();
    await expect(page.getByRole("heading", { name: "Create Assignment" })).toBeVisible();

    const modal = page.locator("div.fixed").last();
    const identitySelect = modal.locator("select").first();
    await page.waitForFunction(() => {
      const select = document.querySelector("div.fixed select") as HTMLSelectElement | null;
      return !!select && select.options.length > 1;
    }, { timeout: 20_000 });
    await selectOptionContainingText(identitySelect, seedIdentity.email);
    await modal.getByRole("button", { name: "Create Assignment" }).click();

    await expect(
      page.getByRole("row", { name: new RegExp(seedIdentity.email) })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("No assignments found for this installation.")).toHaveCount(0);
  });

  test("SW-008 entitlements", async ({ page }) => {
    if (!seedMainProduct || !seedContract) throw new Error("Seed data missing for entitlement test");

    await loginAs(page, USERS.tenantAdmin);
    await openContractDetail(page, seedContract.contractId);
    await page.getByRole("button", { name: "Add Entitlement" }).click();
    await expect(page.getByRole("heading", { name: "Add Software Entitlement" })).toBeVisible();

    const modal = page.locator("div.fixed").last();
    const selects = modal.locator("select");
    const inputs = modal.locator("input");
    const textarea = modal.locator("textarea");

    await page.waitForFunction(() => {
      const select = document.querySelector("div.fixed select") as HTMLSelectElement | null;
      return !!select && select.options.length > 1;
    }, { timeout: 20_000 });

    await selectOptionContainingText(selects.nth(0), seedMainProduct.productCode);
    const entitlementCode = `PW-ENT-${uniqueSuffix()}`;
    await inputs.nth(0).fill(entitlementCode);
    await inputs.nth(1).fill(`Playwright Entitlement ${uniqueSuffix()}`);
    await selects.nth(1).selectOption("SUBSCRIPTION");
    await inputs.nth(2).fill("1");
    await textarea.nth(0).fill("Playwright entitlement");
    await modal.getByRole("button", { name: "Create Entitlement" }).click();

    await expect(page.getByText(entitlementCode)).toBeVisible({ timeout: 30_000 });
  });

  test("SW-009 allocations", async ({ page }) => {
    const installationAsset = seedInstallationAsset;
    if (!seedMainProduct || !seedContract || !installationAsset) {
      throw new Error("Seed data missing for allocation test");
    }

    await loginAs(page, USERS.tenantAdmin);
    const entitlementCode = `PW-ENT-ALLOC-${uniqueSuffix()}`;
    const entitlementRes = await apiPostJson(page, `/api/v1/contracts/${seedContract.contractId}/software-entitlements`, {
      software_product_id: seedMainProduct.productId,
      entitlement_code: entitlementCode,
      entitlement_name: `Playwright Allocation Entitlement ${uniqueSuffix()}`,
      licensing_metric: "SUBSCRIPTION",
      quantity_purchased: 1,
      start_date: isoDate(-5),
      end_date: isoDate(30),
      status: "ACTIVE",
      notes: "Playwright allocation entitlement",
    });

    expect(entitlementRes.status).toBe(201);
    const entitlementId = Number((entitlementRes.json as any)?.data?.id ?? 0);
    expect(entitlementId).toBeGreaterThan(0);

    const allocationRes = await apiPostJson(
      page,
      `/api/v1/software-entitlements/${entitlementId}/allocations`,
      {
        asset_id: installationAsset.assetId,
        allocation_basis: "ASSET",
        allocated_quantity: 1,
        status: "ACTIVE",
        allocated_at: isoDate(0),
        notes: "Playwright allocation",
      }
    );

    expect(allocationRes.status).toBe(201);

    const allocations = await fetchJson(page, `/api/v1/software-entitlements/${entitlementId}/allocations`);
    const rows = ((allocations.json as any)?.data?.items ?? (allocations.json as any)?.items ?? []) as any[];
    expect(rows.some((row) => Number(row?.asset_id) === installationAsset.assetId)).toBeTruthy();
  });

  test("SW-010 over allocation guard", async ({ page }) => {
    const allocationAsset = seedAllocationAsset;
    if (!seedMainProduct || !seedContract || !allocationAsset) {
      throw new Error("Seed data missing for over-allocation test");
    }

    await loginAs(page, USERS.tenantAdmin);
    const entitlementCode = `PW-ENT-OVER-${uniqueSuffix()}`;
    const entitlementRes = await apiPostJson(page, `/api/v1/contracts/${seedContract.contractId}/software-entitlements`, {
      software_product_id: seedMainProduct.productId,
      entitlement_code: entitlementCode,
      entitlement_name: `Playwright Over Allocation Entitlement ${uniqueSuffix()}`,
      licensing_metric: "SUBSCRIPTION",
      quantity_purchased: 1,
      start_date: isoDate(-5),
      end_date: isoDate(30),
      status: "ACTIVE",
      notes: "Playwright over allocation entitlement",
    });

    expect(entitlementRes.status).toBe(201);
    const entitlementId = Number((entitlementRes.json as any)?.data?.id ?? 0);
    expect(entitlementId).toBeGreaterThan(0);

    const firstAllocation = await apiPostJson(
      page,
      `/api/v1/software-entitlements/${entitlementId}/allocations`,
      {
        asset_id: seedInstallationAsset!.assetId,
        allocation_basis: "ASSET",
        allocated_quantity: 1,
        status: "ACTIVE",
        allocated_at: isoDate(0),
        notes: "Playwright base allocation",
      }
    );
    expect(firstAllocation.status).toBe(201);

    const overAllocation = await apiPostJson(
      page,
      `/api/v1/software-entitlements/${entitlementId}/allocations`,
      {
        asset_id: allocationAsset.assetId,
        allocation_basis: "ASSET",
        allocated_quantity: 1,
        status: "ACTIVE",
        allocated_at: isoDate(0),
        notes: "Playwright over allocation guard",
      }
    );

    expect(overAllocation.status).toBe(409);
    expect((overAllocation.json as any)?.error?.code).toBe("SOFTWARE_ENTITLEMENT_ALLOCATION_EXCEEDS_AVAILABLE");
  });

  test("SW-011 read access", async ({ page }) => {
    if (!seedMainProduct) throw new Error("Seed software product is missing");

    await loginAs(page, USERS.auditor);
    await openSoftwareProductsPage(page);
    await expect(page.getByRole("button", { name: "Create Software Product" })).toHaveCount(0);
    await expect(page.getByText("Read-only access")).toBeVisible();

    await page.goto(`/software-products/${seedMainProduct.productId}`);
    await expect(page.getByText("Read-only access")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Changes" })).toBeDisabled();
  });

  test("SW-012 tenant isolation", async ({ page }) => {
    const suffix = uniqueSuffix();

    await loginAs(page, USERS.defaultAdmin);
  const defaultVendor = await createVendorViaApi(page);
  const defaultProductRes = await apiPostJson(page, "/api/v1/software-products", {
      product_code: `PW-SP-DEFAULT-${suffix}`,
      product_name: `Playwright Default Tenant Product ${suffix}`,
      publisher_vendor_id: defaultVendor.vendorId,
      category: "BUSINESS_APPLICATION",
      deployment_model: "SAAS",
      licensing_metric: "SUBSCRIPTION",
      status: "ACTIVE",
      version_policy: "VERSIONED",
      notes: "Playwright default tenant software product",
    });

    expect(defaultProductRes.status).toBe(201);
    const defaultProductId = Number((defaultProductRes.json as any)?.data?.id ?? 0);
    expect(defaultProductId).toBeGreaterThan(0);

    await loginAs(page, USERS.tenantAdmin);
    await page.goto(`/software-products/${defaultProductId}`);
    await expect(page.getByText("Software product not found")).toBeVisible({
      timeout: 20_000,
    });
  });
});
