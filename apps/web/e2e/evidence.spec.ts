import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type Credentials = {
  tenantCode: string;
  email: string;
  password: string;
};

type EvidenceFile = {
  id: number;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string | null;
};

type ContractRecord = {
  id: number;
  contract_code: string;
  contract_name: string;
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

let sharedEvidenceFile: EvidenceFile | null = null;

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
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator("#tenant").fill(creds.tenantCode);
  await page.locator("#email").fill(creds.email);
  await page.locator("#password").fill(creds.password);
  await expect(page.locator("#tenant")).toHaveValue(creds.tenantCode);
  await expect(page.locator("#email")).toHaveValue(creds.email);
  await expect(page.locator("#password")).toHaveValue(creds.password);
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
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await browserLogin(page, creds);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "ITAM SaaS" })).toBeVisible({
    timeout: 20_000,
  });
  const me = await browserJson(page, "/api/v1/auth/me");
  expect(
    String(me?.data?.user?.email || me?.data?.email || "").toLowerCase()
  ).toContain(creds.email.toLowerCase());
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

async function browserLogin(page: Page, creds: Credentials) {
  return await page.evaluate(
    async ({ apiBase, creds }) => {
      const res = await fetch(`${apiBase}/api/v1/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenant_code: creds.tenantCode,
          email: creds.email,
          password: creds.password,
          recaptcha_token: "test",
        }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok) {
        const err = new Error(json?.error?.message || json?.message || `Login failed (${res.status})`);
        (err as any).status = res.status;
        (err as any).code = json?.error?.code || json?.code;
        (err as any).details = json?.error?.details || json?.details;
        throw err;
      }

      return json;
    },
    { apiBase: API_BASE, creds }
  );
}

async function browserUploadEvidenceText(
  page: Page,
  fileName: string,
  content: string,
  mimeType = "text/plain"
) {
  return await page.evaluate(
    async ({ apiBase, fileName, content, mimeType }) => {
      const fd = new FormData();
      fd.append("file", new Blob([content], { type: mimeType }), fileName);

      const res = await fetch(`${apiBase}/api/v1/evidence/files`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok) {
        const err = new Error(json?.error?.message || json?.message || `Upload failed (${res.status})`);
        (err as any).status = res.status;
        (err as any).code = json?.error?.code || json?.code;
        (err as any).details = json?.error?.details || json?.details;
        throw err;
      }

      return json;
    },
    { apiBase: API_BASE, fileName, content, mimeType }
  );
}

async function browserUploadEvidenceBytes(
  page: Page,
  fileName: string,
  sizeBytes: number,
  mimeType = "text/plain"
) {
  return await page.evaluate(
    async ({ apiBase, fileName, sizeBytes, mimeType }) => {
      const bytes = new Uint8Array(sizeBytes);
      bytes.fill(65);
      const fd = new FormData();
      fd.append("file", new Blob([bytes], { type: mimeType }), fileName);

      const res = await fetch(`${apiBase}/api/v1/evidence/files`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok) {
        const err = new Error(json?.error?.message || json?.message || `Upload failed (${res.status})`);
        (err as any).status = res.status;
        (err as any).code = json?.error?.code || json?.code;
        (err as any).details = json?.error?.details || json?.details;
        throw err;
      }

      return json;
    },
    { apiBase: API_BASE, fileName, sizeBytes, mimeType }
  );
}

async function browserCreateContract(page: Page, label: string): Promise<ContractRecord> {
  return await page.evaluate(
    async ({ apiBase, label }) => {
      const vendorsRes = await fetch(`${apiBase}/api/v1/vendors?page=1&page_size=100`, {
        credentials: "include",
      });
      const vendorsText = await vendorsRes.text();
      const vendorsJson: any = vendorsText ? JSON.parse(vendorsText) : null;
      const vendors = vendorsJson?.data?.data?.items ?? vendorsJson?.data?.items ?? vendorsJson?.items ?? [];
      const activeVendor =
        vendors.find((v: any) => String(v?.status ?? "").toUpperCase() === "ACTIVE") ?? vendors[0];

      if (!activeVendor) {
        throw new Error("No vendor found to create contract");
      }

      const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const payload = {
        vendor_id: Number(activeVendor.id),
        contract_code: `PW-EVID-${label.toUpperCase()}-${suffix}`,
        contract_name: `Playwright Evidence Contract ${label} ${suffix}`,
        contract_type: "SOFTWARE",
        status: "DRAFT",
        start_date: null,
        end_date: null,
        renewal_notice_days: 30,
        owner_identity_id: null,
        notes: `Playwright contract ${label}`,
      };

      const res = await fetch(`${apiBase}/api/v1/contracts`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      const json: any = text ? JSON.parse(text) : null;
      if (!res.ok) {
        const err = new Error(json?.error?.message || json?.message || `Contract create failed (${res.status})`);
        (err as any).status = res.status;
        (err as any).code = json?.error?.code || json?.code;
        throw err;
      }

      return json.data;
    },
    { apiBase: API_BASE, label }
  );
}

async function openEvidence(page: Page) {
  await page.goto("/evidence");
  await expect(page.getByRole("heading", { name: "Evidence Library" })).toBeVisible({
    timeout: 20_000,
  });
}

async function openEvidenceUpload(page: Page) {
  await page.goto("/evidence/upload");
  await expect(page.getByRole("heading", { name: "Upload Evidence" })).toBeVisible({
    timeout: 20_000,
  });
}

async function createAssetViaUi(page: Page, creds: Credentials, label: string) {
  await loginAs(page, creds);
  await page.goto("/assets/new");
  await expect(page.getByRole("heading", { name: "New Asset" })).toBeVisible({
    timeout: 20_000,
  });

  const suffix = uniqueSuffix();
  const assetTag = `PW-EVID-${label.toUpperCase()}-${suffix}`;
  const assetName = `Playwright Evidence ${label} ${suffix}`;

  await page.locator('input[placeholder="e.g. LAPTOP-001"]').fill(assetTag);
  await page.locator('input[placeholder="e.g. Laptop Dell"]').fill(assetName);
  await page.locator("select").first().selectOption("HARDWARE");

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

  const match = page.url().match(/\/assets\/(\d+)/);
  if (!match) {
    throw new Error("Asset id not found after create");
  }

  return { assetId: Number(match[1]), assetTag, assetName };
}

test.describe.serial("Evidence", () => {
  test.setTimeout(240_000);

  test("auditor can read evidence library but cannot upload", async ({ page }) => {
    await loginAs(page, USERS.auditor);
    await openEvidence(page);

    await expect(page.getByRole("link", { name: "Upload" })).toHaveCount(0);
    await expect(page.getByPlaceholder("Search filename/mime/sha...")).toBeVisible();

    await page.goto("/evidence/upload");
    await expect(
      page.getByText(
        "Kamu hanya bisa melihat evidence library. Upload evidence dibatasi untuk TENANT_ADMIN, ITAM_MANAGER, dan ASSET_CUSTODIAN."
      )
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Upload" })).toHaveCount(0);
  });

  test("itam manager can upload evidence and search/download it in the library", async ({ page }) => {
    await loginAs(page, USERS.itamManager);

    const fileName = `pw-evidence-library-${uniqueSuffix()}.txt`;
    const content = `Playwright evidence library file ${uniqueSuffix()}`;
    const uploadRes = await browserUploadEvidenceText(page, fileName, content, "text/plain");
    sharedEvidenceFile = uploadRes?.data?.file ?? uploadRes?.file ?? null;

    if (!sharedEvidenceFile?.id) {
      throw new Error("Uploaded evidence file id not found");
    }

    await openEvidence(page);
    await page.getByPlaceholder("Search filename/mime/sha...").fill(fileName);
    await page.getByRole("button", { name: "Search" }).click();

    const libraryRow = page.getByRole("row").filter({ hasText: fileName });
    await expect(libraryRow).toBeVisible({ timeout: 30_000 });
    await expect(libraryRow.getByRole("cell", { name: fileName })).toBeVisible();
    await expect(libraryRow.getByRole("cell", { name: "text/plain" })).toBeVisible();
    await expect(libraryRow.getByRole("cell", { name: /KB|B/ })).toBeVisible();

    const downloadLink = page.getByRole("link", { name: "Download" }).first();
    await expect(downloadLink).toHaveAttribute(
      "href",
      new RegExp(`/api/v1/evidence/files/${sharedEvidenceFile.id}/download$`)
    );

    const downloadStatus = await page.evaluate(
      async ({ apiBase, fileId }) => {
        const res = await fetch(`${apiBase}/api/v1/evidence/files/${fileId}/download`, {
          credentials: "include",
        });
        return { ok: res.ok, status: res.status };
      },
      { apiBase: API_BASE, fileId: sharedEvidenceFile.id }
    );

    expect(downloadStatus.ok).toBeTruthy();
    expect(downloadStatus.status).toBe(200);

    await expect(page.getByRole("columnheader", { name: "Created" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Mime" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Size" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "SHA256" })).toBeVisible();
  });

  test("upload validation rejects unsupported file types", async ({ page }, testInfo) => {
    await loginAs(page, USERS.itamManager);
    await openEvidenceUpload(page);

    const filePath = testInfo.outputPath(`invalid-evidence-${uniqueSuffix()}.exe`);
    fs.writeFileSync(filePath, Buffer.from("MZ-invalid", "utf8"));

    await page.locator('input[type="file"]').setInputFiles(filePath);
    await page.getByRole("button", { name: "Upload" }).click();

    await expect(
      page.getByText(/not allowed|Executable files are not allowed|File type/i)
    ).toBeVisible({ timeout: 20_000 });
  });

  test("tenant admin can attach evidence to an asset", async ({ page }, testInfo) => {
    const asset = await createAssetViaUi(page, USERS.tenantAdmin, "record");

    const attachFilePath = testInfo.outputPath(`asset-record-${uniqueSuffix()}.txt`);
    fs.writeFileSync(attachFilePath, `asset record evidence ${uniqueSuffix()}\n`, "utf8");

    await page.goto(`/assets/${asset.assetId}?tab=evidence`);
    await expect(page.getByText("Total evidence: 0")).toBeVisible({ timeout: 20_000 });

    await loginAs(page, USERS.tenantAdmin);
    await page.goto(`/assets/${asset.assetId}?tab=evidence`);

    await page.locator('input[type="file"]').setInputFiles(attachFilePath);
    await page.getByPlaceholder("Note (optional, applied to all)").fill("asset evidence note");
    await page.getByRole("button", { name: "Upload & Attach" }).click();

    await expect(page.getByText("Attached 1 file.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("asset evidence note")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Total evidence: 1")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible();
  });

  test("contract evidence can be attached and detached", async ({ page }) => {
    if (!sharedEvidenceFile?.id) {
      throw new Error("Shared evidence file is not available for contract tests");
    }

    await loginAs(page, USERS.tenantAdmin);
    const contract = await browserCreateContract(page, "attach");

    await page.goto(`/contracts/${contract.id}`);
    await expect(page.getByRole("heading", { name: "Contract Detail" })).toBeVisible({
      timeout: 20_000,
    });

    await page.locator('form').filter({ hasText: "Evidence File" }).getByRole("combobox").selectOption(String(sharedEvidenceFile.id));
    await page.locator('form').filter({ hasText: "Evidence File" }).getByPlaceholder("Attachment note...").fill("contract evidence note");
    await page.locator('form').filter({ hasText: "Evidence File" }).getByRole("button", { name: "Attach Evidence" }).click();

    const evidenceRow = page.getByRole("row").filter({ hasText: sharedEvidenceFile.original_name });
    await expect(evidenceRow).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Related Evidence")).toBeVisible();
    await expect(page.getByRole("button", { name: "Unlink" })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Unlink" }).click();
    await expect(page.getByText("Evidence relation berhasil dilepas.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Tidak ada evidence yang terhubung.")).toBeVisible({ timeout: 30_000 });
  });

  test("oversized evidence upload is rejected", async ({ page }, testInfo) => {
    await loginAs(page, USERS.itamManager);
    await openEvidenceUpload(page);

    const filePath = testInfo.outputPath(`oversized-${uniqueSuffix()}.txt`);
    fs.writeFileSync(filePath, Buffer.alloc(11 * 1024 * 1024, 65));

    await page.locator('input[type="file"]').setInputFiles(filePath);
    await expect(page.getByText(/melebihi 10MB/i)).toBeVisible({ timeout: 20_000 });
  });

  test("duplicate evidence attach is blocked", async ({ page }) => {
    console.log("[EVID-008] login ITAM manager");
    await page.context().clearCookies();
    await page.goto("http://localhost:3000/", { waitUntil: "commit" });
    await browserLogin(page, USERS.itamManager);
    await page.goto("http://localhost:3000/", { waitUntil: "commit" });
    const uploadIdentity = await browserJson(page, "/api/v1/auth/me");
    expect(
      String(uploadIdentity?.data?.user?.email || uploadIdentity?.data?.email || "").toLowerCase()
    ).toContain("testing@bni.com");

    const fileName = `pw-duplicate-${uniqueSuffix()}.txt`;
    const content = `duplicate guard evidence ${uniqueSuffix()}`;
    console.log("[EVID-008] upload evidence file");
    const uploadRes = await browserUploadEvidenceText(page, fileName, content, "text/plain");
    const localEvidenceFile: EvidenceFile | null = uploadRes?.data?.file ?? uploadRes?.file ?? null;

    if (!localEvidenceFile?.id) {
      throw new Error("Duplicate guard evidence file is not available");
    }

    console.log("[EVID-008] login tenant admin");
    await page.context().clearCookies();
    await page.goto("http://localhost:3000/", { waitUntil: "commit" });
    await browserLogin(page, USERS.tenantAdmin);
    await page.goto("http://localhost:3000/", { waitUntil: "commit" });
    const contractIdentity = await browserJson(page, "/api/v1/auth/me");
    expect(
      String(contractIdentity?.data?.user?.email || contractIdentity?.data?.email || "").toLowerCase()
    ).toContain("dhani@bni.com");

    console.log("[EVID-008] create contract");
    const contract = await browserCreateContract(page, "duplicate");

    console.log("[EVID-008] first attach");
    const firstAttach = await browserJson(page, `/api/v1/contracts/${contract.id}/evidence`, {
      method: "POST",
      body: {
        evidence_file_id: localEvidenceFile.id,
        note: "duplicate guard first attach",
      },
    });

    expect(firstAttach?.data?.link?.id).toBeTruthy();

    console.log("[EVID-008] second attach should 409");
    const duplicateResult = await page.evaluate(
      async ({ apiBase, contractId, evidenceFileId }) => {
        const res = await fetch(`${apiBase}/api/v1/contracts/${contractId}/evidence`, {
          method: "POST",
          credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          evidence_file_id: evidenceFileId,
          note: "duplicate guard second attach",
        }),
      });

        const text = await res.text();
        let json: any = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }

        return {
          ok: res.ok,
          status: res.status,
          code: json?.error?.code || json?.code || null,
          message: json?.error?.message || json?.message || null,
        };
      },
      {
        apiBase: API_BASE,
        contractId: contract.id,
        evidenceFileId: localEvidenceFile.id,
      }
    );

    expect(duplicateResult.ok).toBe(false);
    expect(duplicateResult.status).toBe(409);
    expect(duplicateResult.code).toBe("DUPLICATE_RELATION");

    console.log("[EVID-008] done");
  });
});
