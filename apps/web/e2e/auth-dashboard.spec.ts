import { expect, test, type Page } from "@playwright/test";

type Credentials = {
  tenantCode: string;
  email: string;
  password: string;
};

type LoginErrorCase = {
  code: string;
  message: string;
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
  superadmin: {
    tenantCode: "default",
    email: "admin@default.local",
    password: "admin123",
  },
  expiredTenant: {
    tenantCode: "kai",
    email: "dhani@kai.com",
    password: "123456",
  },
} satisfies Record<string, Credentials>;

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

async function submitLogin(page: Page) {
  await page.getByRole("button", { name: "Masuk ke Viriya" }).click();
}

function loginErrorResponse(error: LoginErrorCase) {
  return {
    ok: false,
    error,
    meta: { request_id: "pw-test" },
  };
}

function baseHost() {
  return new URL(process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").hostname;
}

async function setInvalidRefreshCookie(page: Page) {
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: "itam_rt",
      value: "invalid.refresh.token",
      domain: baseHost(),
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

async function loginAs(page: Page, creds: Credentials) {
  await fillLoginForm(page, creds);
  await solveRecaptcha(page);

  await submitLogin(page);
  await page.waitForURL("/", { timeout: 20_000 });

  await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ITAM SaaS" })).toBeVisible();
}

async function expectDashboardLoaded(page: Page) {
  await expect(page.getByText("Dashboard summary + module launcher")).toBeVisible();
  await expect(page.getByText("Ringkasan Operasional")).toBeVisible();
  await expect(page.getByText("Kondisi sistem saat ini")).toBeVisible();
  await expect(page.getByRole("heading", { name: "KPI Workspace" })).toBeVisible();
  await expect(page.getByText("Modul Utama", { exact: true })).toBeVisible();
  await expect(page.getByText("Assets by State")).toBeVisible();
  await expect(page.getByText("Assets by Type")).toBeVisible();
}

test.describe("Auth & Dashboard", () => {
  test("login success for tenant admin and dashboard quick links are visible", async ({
    page,
  }) => {
    await loginAs(page, USERS.tenantAdmin);

    await expect(page.getByText("dhani@bni.com")).toBeVisible();
    await expect(page.getByText("TENANT ADMIN")).toBeVisible();
    await expect(page.getByRole("link", { name: "+ New Asset" })).toBeVisible();
    await expect(page.getByRole("link", { name: "+ New Document" })).toBeVisible();
    await expectDashboardLoaded(page);
  });

  test("login success for auditor hides write quick links", async ({ page }) => {
    await loginAs(page, USERS.auditor);

    await expect(page.getByText("boy@bni.com")).toBeVisible();
    await expect(page.getByText("AUDITOR")).toBeVisible();
    await expect(page.getByRole("link", { name: "+ New Asset" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "+ New Document" })).toHaveCount(0);
    await expectDashboardLoaded(page);
  });

  test("login success for ITAM manager shows write quick links", async ({ page }) => {
    await loginAs(page, USERS.itamManager);

    await expect(page.getByText("testing@bni.com")).toBeVisible();
    await expect(page.getByText("ITAM_MANAGER")).toBeVisible();
    await expect(page.getByRole("link", { name: "+ New Asset" })).toBeVisible();
    await expect(page.getByRole("link", { name: "+ New Document" })).toBeVisible();
    await expectDashboardLoaded(page);
  });

  test("login success for superadmin shows admin launchers and hides tenant banner", async ({
    page,
  }) => {
    await loginAs(page, USERS.superadmin);

    await expect(page.getByText("admin@default.local")).toBeVisible();
    await expect(page.getByText("MASTER")).toBeVisible();
    await expect(page.getByRole("link", { name: "Superadmin Tenants" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin Users" })).toBeVisible();
    await expect(page.getByText("Tenant Subscription Alert")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "+ New Asset" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "+ New Document" })).toHaveCount(0);
    await expectDashboardLoaded(page);
  });

  test("captcha is required before login submit", async ({ page }) => {
    await fillLoginForm(page, USERS.tenantAdmin);

    await submitLogin(page);

    await expect(page.getByText("Captcha verification is required")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: "Logout" })).toHaveCount(0);
  });

  test("invalid captcha token shows captcha error", async ({ page }) => {
    await page.route("**/api/v1/auth/login", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify(
          loginErrorResponse({
            code: "AUTH_CAPTCHA_INVALID",
            message: "Captcha verification failed",
          })
        ),
      });
    });

    await fillLoginForm(page, USERS.tenantAdmin);
    await solveRecaptcha(page);
    await submitLogin(page);

    await expect(page.getByText("Captcha verification failed")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "Logout" })).toHaveCount(0);
  });

  test("invalid password shows login error", async ({ page }) => {
    await fillLoginForm(page, { ...USERS.tenantAdmin, password: "wrong-password" });
    await solveRecaptcha(page);

    await submitLogin(page);

    await expect(page.getByText("Invalid credentials")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "Logout" })).toHaveCount(0);
  });

  test("tenant contract expired shows modal", async ({ page }) => {
    await fillLoginForm(page, USERS.expiredTenant);
    await solveRecaptcha(page);

    await submitLogin(page);

    await expect(page.getByText("Kontrak Tenant Berakhir")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText(
        "Kontrak organisasi Anda telah berakhir. Silakan hubungi administrator platform / Viriya untuk melakukan perpanjangan tenant."
      )
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Logout" })).toHaveCount(0);
  });

  test("tenant contract not set shows modal", async ({ page }) => {
    await page.route("**/api/v1/auth/login", async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (String(body.tenant_code || "").toLowerCase() !== "bni") {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify(
          loginErrorResponse({
            code: "TENANT_CONTRACT_NOT_SET",
            message: "Tenant belum memiliki kontrak aktif. Hubungi administrator platform.",
          })
        ),
      });
    });

    await fillLoginForm(page, USERS.tenantAdmin);
    await solveRecaptcha(page);
    await submitLogin(page);

    await expect(page.getByText("Kontrak Tenant Belum Aktif")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText(
        "Tenant ini belum memiliki kontrak aktif. Silakan hubungi administrator platform / Viriya."
      )
    ).toBeVisible();
  });

  test("tenant suspended shows modal", async ({ page }) => {
    await page.route("**/api/v1/auth/login", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify(
          loginErrorResponse({
            code: "TENANT_SUSPENDED",
            message: "Tenant is suspended. Hubungi administrator platform.",
          })
        ),
      });
    });

    await fillLoginForm(page, USERS.tenantAdmin);
    await solveRecaptcha(page);
    await submitLogin(page);

    await expect(page.getByText("Tenant Suspended")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText(
        "Tenant organisasi Anda sedang dalam status suspended. Silakan hubungi administrator platform / Viriya."
      )
    ).toBeVisible();
  });

  test("double submit login only sends one request", async ({ page }) => {
    let loginRequests = 0;
    await page.route("**/api/v1/auth/login", async (route) => {
      if (route.request().method() === "POST") {
        loginRequests += 1;
      }
      if (route.request().method() === "POST" && loginRequests === 1) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      await route.continue();
    });

    await fillLoginForm(page, USERS.tenantAdmin);
    await solveRecaptcha(page);

    await page.evaluate(() => {
      const submit = document.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!submit) throw new Error("submit button not found");

      submit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    await page.waitForURL("/", { timeout: 20_000 });
    await expect(loginRequests).toBe(1);
  });

  test("logout returns to login page", async ({ page }) => {
    await loginAs(page, USERS.auditor);

    await page.getByRole("button", { name: "Logout" }).click();
    await page.waitForURL("/login", { timeout: 20_000 });

    await expect(page.getByRole("heading", { name: "Selamat Datang Kembali" })).toBeVisible();
    await expect(page.getByLabel("Tenant Code")).toBeVisible();
  });

  test("dashboard survives page reload after login", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);

    await page.reload();

    await expect(page.getByRole("heading", { name: "ITAM SaaS" })).toBeVisible();
    await expect(page.getByText("dhani@bni.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
  });

  test("invalid refresh token redirects to login", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);

    await setInvalidRefreshCookie(page);
    await page.goto("/");

    await page.waitForURL("/login", { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Selamat Datang Kembali" })).toBeVisible();
  });

  test("unauthorized dashboard access lands on login page", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/");

    await page.waitForURL("/login", { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Selamat Datang Kembali" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Logout" })).toHaveCount(0);
  });
});
