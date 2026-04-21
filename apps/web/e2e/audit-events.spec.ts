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

  await Promise.all([
    page.waitForURL("/", { timeout: 20_000, waitUntil: "commit" }),
    page.getByRole("button", { name: "Masuk ke Viriya" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "ITAM SaaS" })).toBeVisible({
    timeout: 20_000,
  });
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

async function openAuditTrail(page: Page) {
  await page.goto("/audit-events");
  await expect(page.getByRole("heading", { name: "Audit Trail" })).toBeVisible({
    timeout: 20_000,
  });
}

async function firstRawActor(page: Page) {
  const text = await page.locator("tbody tr").first().locator("td").nth(1).locator("div.text-xs").textContent();
  return String(text || "").trim();
}

async function visibleRawActors(page: Page) {
  const rows = page.locator("tbody tr");
  const count = await rows.count();
  const actors: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const value = String(
      (await rows.nth(i).locator("td").nth(1).locator("div.text-xs").textContent()) || ""
    ).trim();
    if (value) actors.push(value);
  }
  return actors;
}

test.describe.serial("Audit Events", () => {
  test.setTimeout(180_000);

  test("AUD-001 auditor can list and filter login events", async ({ page }) => {
    await loginAs(page, USERS.auditor);
    await openAuditTrail(page);

    await expect(page.getByRole("link", { name: "Download JSON" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply Filters" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Reset" })).toBeVisible();

    await page.getByRole("button", { name: "Login success (7 days)" }).click();
    await expect(page).toHaveURL(/action=AUTH_LOGIN_SUCCESS/);
    await expect(page).toHaveURL(/entity_type=USER/);
    const loginRow = page.locator("tbody tr").first();
    await expect(loginRow).toContainText("AUTH_LOGIN_SUCCESS");
    await expect(loginRow).toContainText("User");
  });

  test("AUD-002 audit trail page stays read-only", async ({ page }) => {
    await loginAs(page, USERS.auditor);
    await openAuditTrail(page);

    await expect(page.getByText("Quick guide")).toBeVisible();
    await expect(page.getByText("this page is restricted to SUPERADMIN / TENANT_ADMIN / ITAM_MANAGER / AUDITOR")).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply Filters" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download JSON" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Action" })).toHaveCount(0);

    const headers = await page.locator("table thead th").allTextContents();
    expect(headers).toEqual(["Time", "Actor", "Event", "Object", "Details"]);
    await expect(page.locator("table")).toContainText("View details");
  });

  test("AUD-003 tenant admin can search and export filtered audit json", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openAuditTrail(page);

    await page.getByPlaceholder("Search actor/event/object/details...").fill("asset");
    await page.getByRole("button", { name: "Apply Filters" }).click();
    await expect(page).toHaveURL(/q=asset/);

    await page.getByRole("button", { name: "Asset created (7 days)" }).click();
    await expect(page).toHaveURL(/action=ASSET_CREATED/);
    await expect(page).toHaveURL(/entity_type=ASSET/);
    const assetRow = page.locator("tbody tr").first();
    await expect(assetRow).toContainText("ASSET_CREATED");

    const exportHref = await page.getByRole("link", { name: "Download JSON" }).getAttribute("href");
    expect(exportHref).toContain("/api/v1/audit-events/export?");
    expect(exportHref).toContain("format=json");
    expect(exportHref).toContain("action=ASSET_CREATED");
    expect(exportHref).toContain("entity_type=ASSET");

    await page.getByRole("link", { name: "Reset" }).click();
    await expect(page).toHaveURL("/audit-events");
    await expect(page.getByRole("heading", { name: "Audit Trail" })).toBeVisible();
  });

  test("AUD-004 module quick filters switch event types", async ({ page }) => {
    await loginAs(page, USERS.itamManager);
    await openAuditTrail(page);

    await page.getByRole("button", { name: "Asset created (7 days)" }).click();
    await expect(page).toHaveURL(/action=ASSET_CREATED/);
    await expect(page).toHaveURL(/entity_type=ASSET/);
    await expect(page.locator("tbody tr").first()).toContainText("ASSET_CREATED");

    await page.getByRole("button", { name: "Approval decided (7 days)" }).click();
    await expect(page).toHaveURL(/action=APPROVAL_DECIDED/);
    await expect(page).toHaveURL(/entity_type=APPROVAL/);
    await expect(page.locator("tbody tr").first()).toContainText("APPROVAL_DECIDED");

    await page.getByRole("button", { name: "Document published (30 days)" }).click();
    await expect(page).toHaveURL(/action=DOCUMENT_PUBLISHED/);
    await expect(page).toHaveURL(/entity_type=DOCUMENT/);
    await expect(page.locator("tbody tr").first()).toContainText("DOCUMENT_PUBLISHED");
  });

  test("AUD-005 actor and date filters narrow audit rows", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openAuditTrail(page);

    await page.getByRole("button", { name: "Login success (7 days)" }).click();
    await expect(page).toHaveURL(/action=AUTH_LOGIN_SUCCESS/);

    const actorValue = await firstRawActor(page);
    expect(actorValue).toMatch(/^(USER|IDENTITY):\d+$/);

    const today = new Date();
    const from = new Date();
    from.setDate(today.getDate() - 30);
    const toIso = (d: Date) => {
      const yyyy = String(d.getFullYear());
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    await page.getByPlaceholder("Actor (e.g., USER:1 / IDENTITY:10)").fill(actorValue);
    await page.locator('input[type="date"]').nth(0).fill(toIso(from));
    await page.locator('input[type="date"]').nth(1).fill(toIso(today));
    await page.getByRole("button", { name: "Apply Filters" }).click();

    await expect(page).toHaveURL(new RegExp(`actor=${encodeURIComponent(actorValue).replace(/%20/g, "\\+")}`));
    await expect(page).toHaveURL(/date_from=/);
    await expect(page).toHaveURL(/date_to=/);

    const rawActors = await visibleRawActors(page);
    expect(rawActors.length).toBeGreaterThan(0);
    for (const value of rawActors) {
      expect(value).toBe(actorValue);
    }
  });

  test("AUD-006 payload details expand as readable summaries", async ({ page }) => {
    await loginAs(page, USERS.itamManager);
    await openAuditTrail(page);

    await page.getByRole("button", { name: "Approval decided (7 days)" }).click();
    await expect(page).toHaveURL(/action=APPROVAL_DECIDED/);

    const details = page.locator("details").first();
    await details.locator("summary").click();
    await expect(details).toHaveAttribute("open", "");
    await expect(details).toContainText("History note");
    await expect(details).toContainText("Decision");
    await expect(details).toContainText("REJECT");
  });

  test("AUD-007 audit trail details remain read-only", async ({ page }) => {
    await loginAs(page, USERS.auditor);
    await openAuditTrail(page);

    const firstRow = page.locator("tbody tr").first();
    await firstRow.locator("details summary").click();
    await expect(firstRow.locator("details")).toHaveAttribute("open", "");
    await expect(firstRow.locator("details")).not.toContainText("Save");
    await expect(firstRow.locator("details")).not.toContainText("Edit");
    await expect(firstRow.locator("details")).not.toContainText("Delete");
  });

  test("AUD-008 tenant isolation keeps rows scoped to current tenant", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openAuditTrail(page);

    const me = await browserJson(page, "/api/v1/auth/me");
    const tenantId = Number(me?.data?.tenant_id ?? me?.data?.data?.tenant_id ?? NaN);
    expect(Number.isFinite(tenantId)).toBeTruthy();

    const auditEvents = await browserJson(page, "/api/v1/audit-events?page=1&page_size=10");
    const items = Array.isArray(auditEvents?.data?.items) ? auditEvents.data.items : [];
    expect(items.length).toBeGreaterThan(0);
    for (const row of items) {
      expect(Number(row.tenant_id)).toBe(tenantId);
    }
  });
});
