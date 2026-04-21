import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";

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
} satisfies Record<string, Credentials>;

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
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

async function fetchJson(page: Page, path: string) {
  return page.evaluate(async (url) => {
    const res = await fetch(url, { credentials: "include" });
    return await res.json();
  }, path);
}

async function postJson(page: Page, path: string, body: unknown) {
  return page.evaluate(
    async ({ url, payload }) => {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      return {
        status: res.status,
        json: await res.json(),
      };
    },
    { url: `${API_BASE}${path}`, payload: body }
  );
}

async function createAssetViaUi(page: Page, creds: Credentials, label: string) {
  await loginAs(page, creds);
  await page.goto("/assets/new");
  await expect(page.getByRole("heading", { name: "New Asset" })).toBeVisible();
  await expect(page.getByText("Active governance scope limits asset types")).toBeVisible();

  const assetTypeSelect = page.locator("select").first();
  const assetTypeOptions = await assetTypeSelect.locator("option").evaluateAll((options) =>
    options.map((opt) => (opt.textContent || "").trim())
  );
  expect(assetTypeOptions).toHaveLength(3);
  expect(assetTypeOptions.join(" ")).toContain("HARDWARE");
  expect(assetTypeOptions.join(" ")).toContain("SOFTWARE");
  expect(assetTypeOptions.join(" ")).toContain("SAAS");
  expect(assetTypeOptions.join(" ")).not.toContain("NETWORK");
  expect(assetTypeOptions.join(" ")).not.toContain("CLOUD");
  expect(assetTypeOptions.join(" ")).not.toContain("VM_CONTAINER");

  const suffix = uniqueSuffix();
  const assetTag = `PW-${label.toUpperCase()}-${suffix}`;
  const assetName = `Playwright ${label} ${suffix}`;

  await page.locator('input[placeholder="e.g. LAPTOP-001"]').fill(assetTag);
  await page.locator('input[placeholder="e.g. Laptop Dell"]').fill(assetName);
  await assetTypeSelect.selectOption("HARDWARE");
  const dateInputs = page.locator('input[type="date"]');
  await expect(dateInputs).toHaveCount(5, { timeout: 10_000 });
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
    assetId: match[1],
    assetTag,
    assetName,
    updatedName: `${assetName} Updated`,
  };
}

async function openAssetsPage(page: Page) {
  await page.goto("/assets");
  await expect(page.getByRole("heading", { name: "Assets" })).toBeVisible();
}

async function openAssetByTag(page: Page, tag: string) {
  await page.goto(`/assets?q=${encodeURIComponent(tag)}`);
  await expect(page.getByRole("heading", { name: "Assets" })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(`^${tag}$`, "i") }).first().click();
  await page.waitForURL(/\/assets\/\d+/, { timeout: 20_000 });
}

test.describe("Assets", () => {
  test("auditor can read assets list but cannot see write actions", async ({ page }) => {
    await loginAs(page, USERS.auditor);
    await openAssetsPage(page);

    await expect(page.getByRole("link", { name: "New Asset" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Transfer", exact: true })).toHaveCount(0);

    await page.getByPlaceholder("Search tag/name...").fill("Tibero");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("link", { name: "Tibero" })).toBeVisible();
    await expect(page.getByRole("link", { name: "laptop", exact: true })).toHaveCount(0);
  });

  test("tenant admin can create an asset and edit it", async ({ page }) => {
    const created = await createAssetViaUi(page, USERS.tenantAdmin, "asset-edit");

    await expect(page.getByRole("link", { name: "Transfer Asset" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit" })).toBeVisible();

    await page.getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(new RegExp(`/assets/${created.assetId}/edit`), {
      timeout: 20_000,
    });

    await expect(page.getByRole("heading", { name: "Edit Asset" })).toBeVisible();
    await page.locator("form input").nth(1).fill(created.updatedName);
    await expect(page.locator("form input").nth(1)).toHaveValue(created.updatedName);
    const editDateInputs = page.locator('input[type="date"]');
    await expect(editDateInputs).toHaveCount(7, { timeout: 10_000 });
    await editDateInputs.nth(0).fill(isoDate(0));
    await editDateInputs.nth(1).fill(isoDate(0));
    await editDateInputs.nth(2).fill(isoDate(365));
    await editDateInputs.nth(3).fill(isoDate(0));
    await editDateInputs.nth(4).fill(isoDate(365));
    const saveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().endsWith(`/api/v1/assets/${created.assetId}`),
      { timeout: 20_000 }
    );
    await page.getByRole("button", { name: "Save Changes" }).click();
    await saveResponse;
    await page.reload();

    const asset = await fetchJson(page, `${API_BASE}/api/v1/assets/${created.assetId}`);
    const currentName =
      asset?.data?.asset?.name ??
      asset?.data?.data?.asset?.name ??
      asset?.asset?.name;
    expect(currentName).toBe(created.updatedName);
  });

  test("tenant admin cannot create an asset outside active governance scope", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const suffix = uniqueSuffix();
    const response = await postJson(page, "/api/v1/assets", {
      asset_tag: `PW-OUTSIDE-${suffix}`,
      name: `Playwright Outside Scope ${suffix}`,
      asset_type_code: "NETWORK",
      initial_state_code: "REQUESTED",
      status: "AKTIF",
      purchase_date: isoDate(0),
      warranty_start_date: isoDate(0),
      warranty_end_date: isoDate(365),
      support_start_date: isoDate(0),
      support_end_date: isoDate(365),
      subscription_start_date: null,
      subscription_end_date: null,
    });

    expect(response.status).toBe(409);
    expect(response.json?.error?.code).toBe("SCOPE_VIOLATION");
  });

  test("tenant admin can change ownership and attach evidence", async ({ page, }, testInfo) => {
    const created = await createAssetViaUi(page, USERS.tenantAdmin, "asset-ownership");

    await page.getByRole("link", { name: "Ownership" }).click();
    await expect(page.getByRole("button", { name: "Change Ownership" })).toBeVisible();

    const assetBefore = await fetchJson(page, `${API_BASE}/api/v1/assets/${created.assetId}`);
    const currentOwner =
      assetBefore?.data?.asset?.owner_department_id ??
      assetBefore?.data?.data?.asset?.owner_department_id ??
      assetBefore?.asset?.owner_department_id ??
      null;

    await page.getByRole("button", { name: "Change Ownership" }).click();
    const ownerSelect = page.locator("div.fixed select").first();
    await page.waitForFunction(() => {
      const selects = Array.from(document.querySelectorAll("div.fixed select"));
      const select = selects[0] as HTMLSelectElement | undefined;
      return !!select && select.options.length > 1;
    }, { timeout: 20_000 });

    const ownerOptions = await ownerSelect.locator("option").evaluateAll((options) =>
      options
        .map((opt) => ({
          value: (opt as HTMLOptionElement).value,
          text: (opt.textContent || "").trim(),
        }))
        .filter((opt) => opt.value && opt.text !== "(empty)")
    );
    if (ownerOptions.length === 0) {
      throw new Error("No ownership department options available");
    }

    const currentOwnerValue = currentOwner == null ? "" : String(currentOwner);
    const selectedOwnerOption =
      ownerOptions.find((opt) => opt.value !== currentOwnerValue) ?? ownerOptions[0];
    await ownerSelect.selectOption(selectedOwnerOption.value);
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Ownership History", { exact: true })).toBeVisible();
    await expect(page.getByText("No ownership history yet.")).toHaveCount(0);

    const assetAfter = await fetchJson(page, `${API_BASE}/api/v1/assets/${created.assetId}`);
    const nextOwnerValue =
      assetAfter?.data?.asset?.owner_department_id ??
      assetAfter?.data?.data?.asset?.owner_department_id ??
      assetAfter?.asset?.owner_department_id;
    expect(String(nextOwnerValue)).toBe(String(selectedOwnerOption.value));

    await page.getByRole("link", { name: "Evidence" }).click();
    await expect(page.getByText("Total evidence:")).toBeVisible();

    const filePath = testInfo.outputPath(`asset-evidence-${created.assetId}.txt`);
    fs.writeFileSync(filePath, `evidence for ${created.assetTag}\n`, "utf8");

    await page.locator('input[type="file"]').setInputFiles(filePath);
    await page.getByPlaceholder("Note (optional, applied to all)").fill("playwright evidence");
    await page.getByRole("button", { name: "Upload & Attach" }).click();

    await expect(page.getByText("Attached 1 file.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("playwright evidence")).toBeVisible({ timeout: 30_000 });

    const evidence = await fetchJson(
      page,
      `${API_BASE}/api/v1/evidence/links?target_type=ASSET&target_id=${created.assetId}&page=1&page_size=10`
    );
    const evidenceTotal =
      evidence?.data?.total ??
      evidence?.data?.data?.total ??
      evidence?.total ??
      0;
    expect(Number(evidenceTotal)).toBeGreaterThanOrEqual(1);
  });

  test("tenant admin can transition an existing asset lifecycle", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openAssetByTag(page, "laptop");

    await expect(page.getByRole("link", { name: "Lifecycle" })).toBeVisible();
    await page.getByRole("link", { name: "Lifecycle" }).click();
    await expect(page.getByRole("button", { name: "Transition" })).toBeVisible();

    await page.getByRole("button", { name: "Transition" }).click();
    await expect(page.getByText("Transition lifecycle")).toBeVisible();

    await page.getByPlaceholder("Contoh: Approved after ownership set").fill("Playwright lifecycle test");
    await page.getByRole("button", { name: "Submit transition" }).click();

    await expect(page.getByText(/Transition applied|Approval created|Approval already pending/)).toBeVisible({
      timeout: 30_000,
    });
  });

  test("ITAM manager can create a software installation and assignment", async ({ page }) => {
    const seededIdentityName = `Playwright Identity ${uniqueSuffix()}`;
    const seededIdentityEmail = `${seededIdentityName.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@example.com`;
    const seededProductCode = `PW-SP-${uniqueSuffix()}`.toUpperCase();
    const seededProductName = `Playwright Software ${seededProductCode}`;

    await loginAs(page, USERS.tenantAdmin);
    await page.goto("/admin/identities");
    await expect(page.getByRole("heading", { name: "Identities" })).toBeVisible();
    await page.locator('input[placeholder="Dhani"]').fill(seededIdentityName);
    await page.locator('input[type="email"]').fill(seededIdentityEmail);
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
    await expect(page.getByText("Identity berhasil dibuat.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(seededIdentityName)).toBeVisible({ timeout: 20_000 });

    await page.goto("/software-products");
    await expect(page.getByRole("heading", { name: "Software Products" })).toBeVisible();
    await page.getByRole("button", { name: "Create Software Product" }).click();
    await expect(page.getByRole("heading", { name: "Create Software Product" })).toBeVisible();
    await page.locator('input[placeholder="e.g. M365-E3"]').fill(seededProductCode);
    await page.locator('input[placeholder="e.g. Microsoft 365 E3"]').fill(seededProductName);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("cell", { name: seededProductCode, exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await createAssetViaUi(page, USERS.tenantAdmin, "asset-software");

    await page.getByRole("link", { name: "Software" }).click();
    await expect(page.getByRole("heading", { name: "Software Installations" })).toBeVisible();

    await page.getByRole("button", { name: "Add Installation" }).click();
    await expect(page.getByText("Add Software Installation")).toBeVisible();

    const productSelect = page.locator("div.fixed select").first();
    await expect(productSelect).toBeVisible();
    await page.waitForFunction(() => {
      const selects = Array.from(document.querySelectorAll("div.fixed select"));
      const select = selects[0] as HTMLSelectElement | undefined;
      return !!select && select.options.length > 1;
    }, { timeout: 20_000 });

    const productOptions = await productSelect.locator("option").evaluateAll((options) =>
      options
        .map((opt) => ({
          value: (opt as HTMLOptionElement).value,
          text: (opt.textContent || "").trim(),
        }))
        .filter((opt) => opt.value)
    );
    if (productOptions.length === 0) {
      throw new Error("No software products available");
    }

    const seededProductOption =
      productOptions.find((opt) =>
        opt.text.toLowerCase().includes(seededProductCode.toLowerCase()) ||
        opt.text.toLowerCase().includes(seededProductName.toLowerCase())
      ) ?? productOptions[0];
    await productSelect.selectOption(seededProductOption.value);
    await page.getByPlaceholder("e.g. 16.0").fill("1.0.0");
    await page.getByRole("button", { name: "Create Installation" }).click();

    await expect(page.getByText("1.0.0")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Manage Assignments")).toBeVisible();

    await page.getByRole("button", { name: "Manage Assignments" }).first().click();
    await expect(page.getByRole("heading", { name: "Create Assignment" })).toBeVisible();

    const identitySelect = page.locator("div.fixed select").first();
    await page.waitForFunction(() => {
      const selects = Array.from(document.querySelectorAll("div.fixed select"));
      const select = selects[0] as HTMLSelectElement | undefined;
      return !!select && select.options.length > 1;
    }, { timeout: 20_000 });
    const identityOptions = await identitySelect.locator("option").evaluateAll((options) =>
      options
        .map((opt) => ({
          value: (opt as HTMLOptionElement).value,
          text: (opt.textContent || "").trim(),
        }))
        .filter((opt) => opt.value)
    );
    if (identityOptions.length === 0) {
      throw new Error("No identities available for software assignment");
    }

    const selectedIdentity =
      identityOptions.find((opt) =>
        opt.text.toLowerCase().includes(seededIdentityName.toLowerCase())
      ) ?? identityOptions[0];
    await identitySelect.selectOption(selectedIdentity.value);
    await page.getByRole("button", { name: "Create Assignment" }).click();

    await expect(
      page.locator("table tbody tr").filter({ hasText: seededIdentityName }).first()
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("No assignments found for this installation.")).toHaveCount(0);
  });
});
