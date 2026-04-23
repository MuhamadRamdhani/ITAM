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
  defaultAdmin: {
    tenantCode: "default",
    email: "admin@default.local",
    password: "admin123",
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
  await Promise.all([
    page.waitForURL("/", { timeout: 20_000, waitUntil: "commit" }),
    page.getByRole("button", { name: "Masuk ke Viriya" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "ITAM SaaS" })).toBeVisible({
    timeout: 20_000,
  });
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

      let json: any = null;
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

async function apiDelete(page: Page, pathUrl: string) {
  return page.evaluate(async (url) => {
    const res = await fetch(url, {
      method: "DELETE",
      credentials: "include",
    });

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    return { status: res.status, json };
  }, `${API_BASE}${pathUrl}`);
}

async function openDocuments(page: Page) {
  await page.goto("/documents");
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({
    timeout: 20_000,
  });
}

async function createDocumentViaUi(page: Page, creds: Credentials, label: string) {
  await loginAs(page, creds);
  await page.goto("/documents/new");
  await expect(page.getByRole("heading", { name: "New Document" })).toBeVisible({
    timeout: 20_000,
  });

  const suffix = uniqueSuffix();
  const title = `Playwright Document ${label} ${suffix}`;
  const bodyText = `Document body ${label} ${suffix}`;
  const docType = label.toLowerCase().includes("sop") ? "SOP" : "POLICY";

  await page.locator('input[placeholder="e.g. ITAM Policy v1"]').fill(title);
  await page.locator("select").first().selectOption(docType);
  await page.locator('textarea[placeholder="Tulis isi dokumen di sini..."]').fill(bodyText);

  await Promise.all([
    page.waitForURL(/\/documents\/\d+/, { timeout: 30_000 }),
    page.getByRole("button", { name: "Create Document" }).click(),
  ]);

  const match = page.url().match(/\/documents\/(\d+)/);
  if (!match) {
    throw new Error("Document id not present after create");
  }

  const documentId = Number(match[1]);
  await expect(page.getByText(title)).toBeVisible();

  return { documentId, title, bodyText };
}

async function submitDocumentForReview(page: Page) {
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.locator("span.rounded-full", { hasText: "IN_REVIEW" }).first()).toBeVisible({
    timeout: 30_000,
  });
}

async function approvePublishArchiveDocument(page: Page) {
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.locator("span.rounded-full", { hasText: "APPROVED" }).first()).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator("span.rounded-full", { hasText: "PUBLISHED" }).first()).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.locator("span.rounded-full", { hasText: "ARCHIVED" }).first()).toBeVisible({
    timeout: 30_000,
  });
}

async function openDocument(page: Page, documentId: number) {
  await page.goto(`/documents/${documentId}`);
  await expect(page.getByRole("heading", { name: /Playwright Document/ })).toBeVisible({
    timeout: 20_000,
  });
}

async function createVendorViaApi(page: Page, suffix: string) {
  const res = await apiPostJson(page, "/api/v1/vendors", {
    vendor_code: `PW-DOC-VEND-${suffix}`.toUpperCase(),
    vendor_name: `Playwright Document Vendor ${suffix}`,
    vendor_type: "SOFTWARE_PUBLISHER",
    status: "ACTIVE",
    primary_contact_name: "Playwright Document Contact",
    primary_contact_email: `document.vendor.${suffix}@example.com`,
  });

  expect([200, 201]).toContain(res.status);

  const vendorId = Number(res.json?.data?.id ?? res.json?.data?.vendor?.id ?? 0);
  expect(vendorId).toBeGreaterThan(0);
  return vendorId;
}

async function createDraftContractWithDocumentRelation(page: Page, documentId: number) {
  const suffix = uniqueSuffix();
  const vendorId = await createVendorViaApi(page, suffix);

  const contractRes = await apiPostJson(page, "/api/v1/contracts", {
    vendor_id: vendorId,
    contract_code: `PW-DOC-CT-${suffix}`,
    contract_name: `Playwright Document Contract ${suffix}`,
    contract_type: "SOFTWARE",
    status: "DRAFT",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    renewal_notice_days: 30,
    owner_identity_id: null,
    notes: "Playwright document contract blocker",
  });

  expect([200, 201]).toContain(contractRes.status);
  const contractId = Number(contractRes.json?.data?.id ?? contractRes.json?.data?.contract?.id ?? 0);
  expect(contractId).toBeGreaterThan(0);

  const attachRes = await apiPostJson(page, `/api/v1/contracts/${contractId}/documents`, {
    document_id: documentId,
    note: "Document blocker relation",
  });
  expect([200, 201]).toContain(attachRes.status);

  return contractId;
}

test.describe.serial("Documents", () => {
  test.setTimeout(240_000);

  test("DOC-010 auditor sees documents list but no write actions", async ({ page }) => {
    await loginAs(page, USERS.auditor);
    await openDocuments(page);

    await expect(page.getByRole("link", { name: "New Document" })).toHaveCount(0);
    await expect(page.getByText("MVP1.4")).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
  });

  test("DOC-002 and DOC-006 ITAM manager can create document and version history updates", async ({ page }) => {
    const created = await createDocumentViaUi(page, USERS.itamManager, "manager-flow");
    const versionText = `Version 2 ${uniqueSuffix()}`;

    await expect(page.locator("span.rounded-full", { hasText: "DRAFT" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Version" })).toBeVisible();

    await page.locator('input[placeholder="Note (optional)"]').fill("Added by Playwright");
    await page.locator('textarea[placeholder="Ketik bebas di sini..."]').fill(versionText);
    await Promise.all([
      page.waitForResponse((response) => {
        return (
          response.url().includes(`/api/v1/documents/${created.documentId}/versions`) &&
          response.request().method() === "POST" &&
          response.ok()
        );
      }),
      page.getByRole("button", { name: "Add Version" }).click(),
    ]);
    await expect(page.getByRole("cell", { name: "v2" })).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator("div").filter({ hasText: "Current version:" }).first()
    ).toContainText("v2", { timeout: 30_000 });
    await expect(page.getByRole("cell", { name: "v1" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "v2" })).toBeVisible();
    await expect(page.getByText(created.title)).toBeVisible();
  });

  test("DOC-003 ITAM manager can submit draft for review", async ({ page }) => {
    const created = await createDocumentViaUi(page, USERS.itamManager, "submit-guard");

    await expect(page.getByRole("button", { name: "Submit for review" })).toBeVisible();
    await submitDocumentForReview(page);
    await expect(page.getByRole("button", { name: "Add Version" })).toBeVisible();
    await expect(page.getByText(created.title)).toBeVisible();
  });

  test("DOC-008 tenant admin cannot publish directly from DRAFT", async ({ page }) => {
    const created = await createDocumentViaUi(page, USERS.itamManager, "draft-guard");

    await loginAs(page, USERS.tenantAdmin);
    await openDocument(page, created.documentId);

    await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();
  });

  test("DOC-001 and DOC-007 documents list can be filtered by status, type, and search", async ({ page }) => {
    const draftDoc = await createDocumentViaUi(page, USERS.itamManager, "list-draft");
    const sopDoc = await createDocumentViaUi(page, USERS.itamManager, "list-sop");

    await submitDocumentForReview(page);

    await loginAs(page, USERS.tenantAdmin);
    await openDocuments(page);

    await page.getByRole("link", { name: "DRAFT" }).click();
    await expect(page).toHaveURL(/status=DRAFT/);
    await expect(page.getByRole("link", { name: draftDoc.title })).toBeVisible();

    await page.getByRole("link", { name: "IN_REVIEW" }).click();
    await expect(page).toHaveURL(/status=IN_REVIEW/);
    await expect(page.getByRole("link", { name: sopDoc.title })).toBeVisible();

    await page.getByPlaceholder("Type (e.g. POLICY/SOP/CONTRACT)").fill("SOP");
    await page.getByPlaceholder("Search title/type...").fill(sopDoc.title.split(" ").slice(0, 3).join(" "));
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/type=SOP/);
    await expect(page).toHaveURL(/q=/);
    await expect(page.getByRole("link", { name: sopDoc.title })).toBeVisible();
  });

  test("DOC-004 and DOC-011 tenant admin can approve, publish, archive, and keep final docs read only", async ({ page }) => {
    const created = await createDocumentViaUi(page, USERS.itamManager, "admin-finalize");

    await submitDocumentForReview(page);

    await loginAs(page, USERS.tenantAdmin);
    await openDocument(page, created.documentId);

    await approvePublishArchiveDocument(page);
    await expect(page.locator("span.rounded-full", { hasText: "ARCHIVED" }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Add Version" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Submit for review" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Archive" })).toBeDisabled();
  });

  test("DOC-015 tenant admin can delete draft document", async ({ page }) => {
    const created = await createDocumentViaUi(page, USERS.itamManager, "delete-draft");

    await loginAs(page, USERS.tenantAdmin);
    await openDocument(page, created.documentId);

    await expect(page.getByRole("button", { name: "Delete Draft" })).toBeVisible();
    await page.getByRole("button", { name: "Delete Draft" }).click();
    const confirmModal = page.locator("div.fixed.inset-0.z-50");
    await expect(confirmModal.getByText(/dihapus permanen/i)).toBeVisible();
    const deleteResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().includes(`/api/v1/documents/${created.documentId}`),
      { timeout: 30_000 }
    );
    await page.getByRole("button", { name: "Delete Draft" }).last().click();
    const deleteResponseResult = await deleteResponse;
    expect(deleteResponseResult.status()).toBe(200);

    await page.goto(`/documents/${created.documentId}`);
    await expect(page.getByText(/Document not found|not ditemukan/i)).toBeVisible({
      timeout: 20_000,
    });
  });

  test("DOC-016 document delete is blocked when contract_documents relation exists", async ({ page }) => {
    const created = await createDocumentViaUi(page, USERS.itamManager, "delete-blocked");
    await loginAs(page, USERS.tenantAdmin);
    await createDraftContractWithDocumentRelation(page, created.documentId);

    await openDocument(page, created.documentId);
    await expect(page.getByRole("button", { name: "Delete Draft" })).toBeVisible();
    await page.getByRole("button", { name: "Delete Draft" }).click();
    const confirmModal = page.locator("div.fixed.inset-0.z-50");
    await page.getByRole("button", { name: "Delete Draft" }).last().click();

    await expect(page.getByText("Document is still in use").first()).toBeVisible({
      timeout: 20_000,
    });

    const blocked = await apiDelete(page, `/api/v1/documents/${created.documentId}`);
    expect(blocked.status).toBe(409);
    expect(blocked.json?.error?.code).toBe("DOCUMENT_IN_USE");
  });

  test("DOC-009 document evidence can be attached and downloaded", async ({ page, }, testInfo) => {
    const doc = await createDocumentViaUi(page, USERS.itamManager, "attach");

    await submitDocumentForReview(page);

    const evidenceFile = testInfo.outputPath(`document-evidence-${doc.documentId}.txt`);
    fs.writeFileSync(evidenceFile, `document evidence ${doc.title}\n`, "utf8");

    const evidenceSection = page.getByText("Related Evidence").locator("xpath=ancestor::div[1]");
    await expect(evidenceSection.getByText("Upload dan attach evidence untuk document ini.")).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(evidenceFile);
    await page.getByPlaceholder("Note (optional, applied to all)").fill("playwright document evidence");
    await page.getByRole("button", { name: "Upload & Attach" }).click();
    await expect(page.getByText("Attached 1 file.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("playwright document evidence")).toBeVisible({ timeout: 30_000 });
    await openDocument(page, doc.documentId);
    await expect(page.getByText("playwright document evidence")).toBeVisible({ timeout: 30_000 });
  });

  test("DOC-013 create document rejects blank title and blank doc type", async ({ page }) => {
    await loginAs(page, USERS.itamManager);

    const blankTitle = await apiPostJson(page, "/api/v1/documents", {
      doc_type_code: "POLICY",
      title: "   ",
      content_json: { body: "invalid title" },
    });
    expect(blankTitle.status).toBe(400);
    expect(blankTitle.json?.error?.code).toBe("BAD_REQUEST");
    expect(blankTitle.json?.error?.message).toContain("title is required");

    const blankType = await apiPostJson(page, "/api/v1/documents", {
      doc_type_code: "   ",
      title: `Playwright Document invalid type ${uniqueSuffix()}`,
      content_json: { body: "invalid type" },
    });
    expect(blankType.status).toBe(400);
    expect(blankType.json?.error?.code).toBe("BAD_REQUEST");
    expect(blankType.json?.error?.message).toContain("doc_type_code is required");
  });

  test("DOC-014 archived document rejects new version creation", async ({ page }) => {
    const created = await createDocumentViaUi(page, USERS.itamManager, "archive-version-guard");

    await submitDocumentForReview(page);

    await loginAs(page, USERS.tenantAdmin);
    await openDocument(page, created.documentId);
    await approvePublishArchiveDocument(page);

    const versionBefore = await apiPostJson(page, `/api/v1/documents/${created.documentId}/versions`, {
      note: "should not be added",
      content_json: { body: `blocked version ${uniqueSuffix()}` },
    });

    expect(versionBefore.status).toBe(400);
    expect(versionBefore.json?.error?.code).toBe("INVALID_STATE");
    expect(String(versionBefore.json?.error?.message || "")).toContain("Allowed: DRAFT, IN_REVIEW");

    await openDocument(page, created.documentId);
    await expect(page.getByText("Current version: v1")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("cell", { name: "v1" })).toBeVisible();
  });

  test("DOC-017 auditor cannot see delete draft action", async ({ page }) => {
    const created = await createDocumentViaUi(page, USERS.itamManager, "auditor-delete-guard");

    await loginAs(page, USERS.auditor);
    await openDocument(page, created.documentId);

    await expect(page.getByRole("button", { name: "Delete Draft" })).toHaveCount(0);
  });

  test("DOC-012 tenant isolation blocks another tenant role from opening the document", async ({ page }) => {
    const created = await createDocumentViaUi(page, USERS.itamManager, "isolation");

    await loginAs(page, USERS.defaultAdmin);
    await page.goto(`/documents/${created.documentId}`);

    await expect(page.getByText(/Document not found|not ditemukan/i)).toBeVisible({
      timeout: 20_000,
    });
  });
});
