import { expect, test, type Page } from "@playwright/test";

type Credentials = {
  tenantCode: string;
  email: string;
  password: string;
};

type IdentityOption = {
  id: number;
  display_name?: string | null;
  identity_name?: string | null;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
};

type ApiResponse<T = any> = {
  ok?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
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

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function toDateInput(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
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

async function browserJson<T = any>(
  page: Page,
  path: string,
  init?: {
    method?: string;
    body?: unknown;
  }
): Promise<ApiResponse<T>> {
  return page.evaluate(
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
        const err = new Error(
          json?.error?.message || json?.message || `Request failed (${res.status})`
        );
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

async function selectOptionContainingText(select: any, text: string) {
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

async function selectIdentityOptionByEmail(page: Page, select: any, email: string) {
  const identityId = await getIdentityIdByEmail(page, email);
  await select.selectOption({ value: String(identityId) });
}

function modalControl(modal: any, labelText: string) {
  return modal.locator('label', { hasText: labelText }).locator('xpath=following-sibling::*[1]');
}

async function getIdentityIdByEmail(page: Page, email: string): Promise<number> {
  const primary = await browserJson<{ items: IdentityOption[] }>(
    page,
    `/api/v1/identities?page=1&page_size=50&q=${encodeURIComponent(email)}`
  );
  const found =
    primary.data?.items?.find((item) => (item.email || "").toLowerCase() === email.toLowerCase()) ||
    primary.data?.items?.find((item) =>
      [
        item.display_name,
        item.identity_name,
        item.full_name,
        item.name,
        item.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(email.toLowerCase())
    );

  if (found?.id) return Number(found.id);

  const fallback = await browserJson<{ items: IdentityOption[] }>(
    page,
    `/api/v1/identities?page=1&page_size=100`
  );
  const fallbackFound =
    fallback.data?.items?.find((item) => (item.email || "").toLowerCase() === email.toLowerCase()) ||
    fallback.data?.items?.[0];

  if (!fallbackFound?.id) {
    throw new Error(`Identity with email "${email}" was not found`);
  }

  return Number(fallbackFound.id);
}

async function createAuditViaApi(
  page: Page,
  overrides: Partial<{
    audit_code: string;
    audit_title: string;
    audit_type: string;
    lead_auditor_identity_id: number;
    scope_summary: string;
    objective: string;
    planned_start_date: string;
    planned_end_date: string;
    auditee_summary: string;
    notes: string;
  }> = {}
): Promise<{ id: number; audit_code: string; audit_title: string }> {
  const leadAuditorIdentityId =
    overrides.lead_auditor_identity_id ?? (await getIdentityIdByEmail(page, USERS.auditor.email));
  const suffix = uniqueSuffix();
  const auditCode = overrides.audit_code || `IA-${suffix}`;
  const auditTitle = overrides.audit_title || `Internal Audit ${suffix}`;

  const res = await browserJson<{ id: number }>(page, "/api/v1/internal-audits", {
    method: "POST",
    body: {
      audit_code: auditCode,
      audit_title: auditTitle,
      audit_type: overrides.audit_type || "INTERNAL",
      lead_auditor_identity_id: leadAuditorIdentityId,
      scope_summary: overrides.scope_summary || "Audit scope for internal testing",
      objective: overrides.objective || "Validate internal audit workflow",
      planned_start_date: overrides.planned_start_date || toDateInput(1),
      planned_end_date: overrides.planned_end_date || toDateInput(7),
      auditee_summary: overrides.auditee_summary || "Test auditee summary",
      notes: overrides.notes || "Playwright-generated internal audit",
    },
  });

  const id = Number(res.data?.id);
  if (!id) {
    throw new Error("Failed to create internal audit");
  }

  return { id, audit_code: auditCode, audit_title: auditTitle };
}

async function addAuditMember(
  page: Page,
  auditId: number,
  payload: { identity_id: number; member_role: string; notes?: string }
) {
  await browserJson(page, `/api/v1/internal-audits/${auditId}/members`, {
    method: "POST",
    body: payload,
  });
}

async function addChecklistSection(
  page: Page,
  auditId: number,
  payload: { title: string; description?: string; clause_code?: string; sort_order?: number }
) {
  const res = await browserJson<{ id: number }>(page, `/api/v1/internal-audits/${auditId}/checklist-sections`, {
    method: "POST",
    body: payload,
  });
  return Number(res.data?.id);
}

async function addChecklistItem(
  page: Page,
  auditId: number,
  payload: {
    section_id?: number;
    item_code: string;
    requirement_text: string;
    expected_evidence?: string;
    clause_code?: string;
    sort_order?: number;
    is_mandatory?: boolean;
  }
) {
  const res = await browserJson<{ id: number }>(page, `/api/v1/internal-audits/${auditId}/checklist-items`, {
    method: "POST",
    body: payload,
  });
  return Number(res.data?.id);
}

async function recordChecklistResult(
  page: Page,
  auditId: number,
  itemId: number,
  payload: { result_status: string; observation_notes?: string; assessed_by_identity_id?: number }
) {
  await browserJson(page, `/api/v1/internal-audits/${auditId}/checklist-items/${itemId}/results`, {
    method: "POST",
    body: payload,
  });
}

async function createFinding(
  page: Page,
  auditId: number,
  payload: {
    checklist_item_id?: number;
    finding_code: string;
    title: string;
    description: string;
    severity: string;
    owner_identity_id?: number;
    due_date?: string;
  }
) {
  const res = await browserJson<{ id: number }>(page, `/api/v1/internal-audits/${auditId}/findings`, {
    method: "POST",
    body: payload,
  });
  return Number(res.data?.id);
}

async function updateFinding(
  page: Page,
  auditId: number,
  findingId: number,
  payload: Record<string, unknown>
) {
  await browserJson(page, `/api/v1/internal-audits/${auditId}/findings/${findingId}`, {
    method: "PATCH",
    body: payload,
  });
}

async function closeFinding(
  page: Page,
  auditId: number,
  findingId: number,
  payload: { closure_notes?: string } = {}
) {
  await browserJson(page, `/api/v1/internal-audits/${auditId}/findings/${findingId}/close`, {
    method: "POST",
    body: payload,
  });
}

async function openList(page: Page) {
  await page.goto("/internal-audits");
  await expect(page.getByRole("heading", { name: "Internal Audits" })).toBeVisible();
}

async function openDetail(page: Page, auditId: number, allowNotFound = false) {
  await page.goto(`/internal-audits/${auditId}`);
  if (allowNotFound) {
    await expect(page.getByText("Internal audit plan not found.")).toBeVisible().catch(
      async () => {
        await expect(page.getByText("Forbidden")).toBeVisible();
      }
    );
    return;
  }
  await expect(page.getByText("Internal Audit Detail")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
}

test.describe("Internal Audits", () => {
  test("IA-001 Create Audit", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const audit = await createAuditViaApi(page, {
      audit_title: `Create Audit ${uniqueSuffix()}`,
      audit_code: `IA-CREATE-${uniqueSuffix()}`,
    });

    await openList(page);
    await expect(page.getByText(audit.audit_code)).toBeVisible();
    await openDetail(page, audit.id);
    await expect(page.getByRole("heading", { name: audit.audit_title })).toBeVisible();
    await expect(page.getByText(audit.audit_code, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit Overview" })).toBeVisible();
  });

  test("IA-002 Members", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const audit = await createAuditViaApi(page, {
      audit_title: `Members Audit ${uniqueSuffix()}`,
      notes: "Members scenario",
    });

    await openDetail(page, audit.id);
    await page.getByRole("button", { name: "Add Member" }).click();
    const memberModal = page.locator('div.fixed.inset-0').last();
    await expect(memberModal.getByRole("heading", { name: "Add Audit Member" })).toBeVisible();

    await selectIdentityOptionByEmail(
      page,
      modalControl(memberModal, "Identity"),
      USERS.auditor.email
    );
    await modalControl(memberModal, "Member Role").selectOption("LEAD_AUDITOR");
    await modalControl(memberModal, "Notes").fill("Lead auditor");
    await page.getByRole("button", { name: "Save Member" }).click();

    await page.getByRole("button", { name: "Add Member" }).click();
    await selectIdentityOptionByEmail(
      page,
      modalControl(memberModal, "Identity"),
      USERS.tenantAdmin.email
    );
    await modalControl(memberModal, "Member Role").selectOption("AUDITOR");
    await modalControl(memberModal, "Notes").fill("Audit member");
    await page.getByRole("button", { name: "Save Member" }).click();

    await expect(page.getByText(USERS.auditor.email)).toBeVisible();
    await expect(page.locator("span").filter({ hasText: /^LEAD_AUDITOR$/ }).first()).toBeVisible();
    await expect(page.getByText(USERS.tenantAdmin.email)).toBeVisible();
    await expect(page.locator("span").filter({ hasText: /^AUDITOR$/ }).first()).toBeVisible();
  });

  test("IA-003 Checklist", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const audit = await createAuditViaApi(page, {
      audit_title: `Checklist Audit ${uniqueSuffix()}`,
    });
    const sectionId = await addChecklistSection(page, audit.id, {
      title: "Access Control",
      clause_code: "AC-1",
      sort_order: 1,
      description: "Access review section",
    });
    await addChecklistItem(page, audit.id, {
      section_id: sectionId,
      item_code: `IA-CHK-${uniqueSuffix()}`,
      requirement_text: "Users shall review access periodically.",
      expected_evidence: "Access review evidence",
      clause_code: "AC-1.1",
      sort_order: 1,
      is_mandatory: true,
    });

    await openDetail(page, audit.id);
    await expect(page.getByRole("heading", { name: "Access Control" })).toBeVisible();
    await expect(page.getByText(/IA-CHK-/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Checklist Items" })).toBeVisible();
  });

  test("IA-004 Findings", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const audit = await createAuditViaApi(page, {
      audit_title: `Finding Audit ${uniqueSuffix()}`,
    });
    const leadAuditorId = await getIdentityIdByEmail(page, USERS.auditor.email);
    await addAuditMember(page, audit.id, {
      identity_id: leadAuditorId,
      member_role: "LEAD_AUDITOR",
      notes: "Lead",
    });
    const sectionId = await addChecklistSection(page, audit.id, {
      title: "Governance",
      clause_code: "G-1",
      sort_order: 1,
    });
    const itemId = await addChecklistItem(page, audit.id, {
      section_id: sectionId,
      item_code: `IA-FND-${uniqueSuffix()}`,
      requirement_text: "Evidence must be retained.",
      expected_evidence: "Retention evidence",
      clause_code: "G-1.1",
      sort_order: 1,
      is_mandatory: true,
    });

    await browserJson(page, `/api/v1/internal-audits/${audit.id}/start`, {
      method: "POST",
      body: {},
    });

    const findingModal = page.locator('div.fixed.inset-0').last();
    await openDetail(page, audit.id);
    await page.getByRole("button", { name: "Add Finding" }).click();
    await expect(findingModal.getByRole("heading", { name: "Add Finding" })).toBeVisible();
    await modalControl(findingModal, "Checklist Item").selectOption({ value: String(itemId) });
    await modalControl(findingModal, "Finding Code").fill(`FND-${uniqueSuffix()}`);
    await modalControl(findingModal, "Title").fill("Missing evidence");
    await modalControl(findingModal, "Description").fill("Required evidence is missing.");
    await modalControl(findingModal, "Severity").selectOption("HIGH");
    await selectIdentityOptionByEmail(
      page,
      modalControl(findingModal, "Owner Identity"),
      USERS.tenantAdmin.email
    );
    await findingModal.getByRole("button", { name: "Add Finding" }).click();

    await expect(page.getByText("Finding created successfully.")).toBeVisible();
    await expect(page.getByText("Missing evidence")).toBeVisible();
    await expect(page.locator("span").filter({ hasText: /^OPEN$/ }).first()).toBeVisible();
    await expect(page.locator("span").filter({ hasText: /^HIGH$/ }).first()).toBeVisible();

    // keep linter quiet about unused seeded item id in this test flow
    expect(itemId).toBeGreaterThan(0);
  });

  test("IA-005 Start/Complete/Cancel", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const leadAuditorId = await getIdentityIdByEmail(page, USERS.auditor.email);

    const startable = await createAuditViaApi(page, {
      audit_title: `Startable Audit ${uniqueSuffix()}`,
    });
    const startSectionId = await addChecklistSection(page, startable.id, {
      title: "Start Guard Section",
    });
    await addChecklistItem(page, startable.id, {
      section_id: startSectionId,
      item_code: `IA-START-${uniqueSuffix()}`,
      requirement_text: "Audit can be started.",
      is_mandatory: true,
    });
    await addAuditMember(page, startable.id, {
      identity_id: leadAuditorId,
      member_role: "LEAD_AUDITOR",
    });

    await browserJson(page, `/api/v1/internal-audits/${startable.id}/start`, {
      method: "POST",
      body: {},
    });
    await openDetail(page, startable.id);
    await expect(page.getByRole("button", { name: "Complete Audit" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("span").filter({ hasText: "IN_PROGRESS" }).first()).toBeVisible({
      timeout: 15_000,
    });

    const completable = await createAuditViaApi(page, {
      audit_title: `Completable Audit ${uniqueSuffix()}`,
    });
    const completeSectionId = await addChecklistSection(page, completable.id, {
      title: "Complete Guard Section",
    });
    const completeItemId = await addChecklistItem(page, completable.id, {
      section_id: completeSectionId,
      item_code: `IA-COMPLETE-${uniqueSuffix()}`,
      requirement_text: "Mandatory checklist item",
      is_mandatory: true,
    });
    await addAuditMember(page, completable.id, {
      identity_id: leadAuditorId,
      member_role: "LEAD_AUDITOR",
    });
    await browserJson(page, `/api/v1/internal-audits/${completable.id}/start`, {
      method: "POST",
      body: {},
    });
    await recordChecklistResult(page, completable.id, completeItemId, {
      result_status: "COMPLIANT",
      observation_notes: "Checked",
      assessed_by_identity_id: leadAuditorId,
    });
    await browserJson(page, `/api/v1/internal-audits/${completable.id}/complete`, {
      method: "POST",
      body: {},
    });
    await openDetail(page, completable.id);
    await expect(page.locator("span").filter({ hasText: "COMPLETED" }).first()).toBeVisible({
      timeout: 15_000,
    });

    const cancellable = await createAuditViaApi(page, {
      audit_title: `Cancellable Audit ${uniqueSuffix()}`,
    });
    await openDetail(page, cancellable.id);
    await page.getByRole("button", { name: "Cancel Audit" }).click();
    await expect(page.getByRole("heading", { name: "Cancel Audit" })).toBeVisible();
    const cancelModal = page.locator('div.fixed.inset-0').last();
    await modalControl(cancelModal, "Cancellation Notes").fill("Cancelled for test");
    await cancelModal.getByRole("button", { name: "Confirm Cancel" }).click();
    await expect(page.locator("span").filter({ hasText: /^CANCELLED$/ }).first()).toBeVisible();
    await expect(
      page.getByText("This audit is cancelled. The page is now read-only.")
    ).toBeVisible();
  });

  test("IA-006 Audit Detail", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const audit = await createAuditViaApi(page, {
      audit_title: `Detail Audit ${uniqueSuffix()}`,
      objective: "Detail scenario objective",
      scope_summary: "Detail scenario scope summary",
      auditee_summary: "Detail scenario auditee summary",
      notes: "Detail scenario notes",
    });
    const leadAuditorId = await getIdentityIdByEmail(page, USERS.auditor.email);
    await addAuditMember(page, audit.id, {
      identity_id: leadAuditorId,
      member_role: "LEAD_AUDITOR",
    });
    const sectionId = await addChecklistSection(page, audit.id, {
      title: "Detail Section",
      description: "Detail section description",
      clause_code: "DET-1",
      sort_order: 1,
    });
    const itemId = await addChecklistItem(page, audit.id, {
      section_id: sectionId,
      item_code: `IA-DET-${uniqueSuffix()}`,
      requirement_text: "Detail item",
      expected_evidence: "Detail evidence",
      clause_code: "DET-1.1",
      sort_order: 1,
      is_mandatory: true,
    });
    await browserJson(page, `/api/v1/internal-audits/${audit.id}/start`, {
      method: "POST",
      body: {},
    });
    await createFinding(page, audit.id, {
      checklist_item_id: itemId,
      finding_code: `FND-DET-${uniqueSuffix()}`,
      title: "Detail finding",
      description: "Detail finding description",
      severity: "MEDIUM",
      owner_identity_id: leadAuditorId,
    });

    await openDetail(page, audit.id);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Checklist Sections" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Checklist Items" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Findings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Execution Guidance" })).toBeVisible();
    await expect(page.getByText("Detail scenario objective")).toBeVisible();
    await expect(page.getByText("Detail scenario scope summary")).toBeVisible();
    await expect(page.getByText("Detail scenario auditee summary")).toBeVisible();
    await expect(page.getByText("Detail scenario notes")).toBeVisible();
  });

  test("IA-007 Checklist Result Validation", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const audit = await createAuditViaApi(page, {
      audit_title: `Result Audit ${uniqueSuffix()}`,
    });
    const leadAuditorId = await getIdentityIdByEmail(page, USERS.auditor.email);
    await addAuditMember(page, audit.id, {
      identity_id: leadAuditorId,
      member_role: "LEAD_AUDITOR",
    });
    const sectionId = await addChecklistSection(page, audit.id, {
      title: "Control Validation",
    });
    const itemId = await addChecklistItem(page, audit.id, {
      section_id: sectionId,
      item_code: `IA-RES-${uniqueSuffix()}`,
      requirement_text: "Record checklist result",
      is_mandatory: true,
    });
    await browserJson(page, `/api/v1/internal-audits/${audit.id}/start`, {
      method: "POST",
      body: {},
    });

    await openDetail(page, audit.id);
    await recordChecklistResult(page, audit.id, itemId, {
      result_status: "COMPLIANT",
      observation_notes: "Initial compliant result",
      assessed_by_identity_id: leadAuditorId,
    });
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText("COMPLIANT", { exact: true })).toBeVisible();
    await expect(page.getByText("Initial compliant result")).toBeVisible();

    await recordChecklistResult(page, audit.id, itemId, {
      result_status: "OBSERVATION",
      observation_notes: "Updated result",
      assessed_by_identity_id: leadAuditorId,
    });
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText("OBSERVATION", { exact: true })).toBeVisible();
    await expect(page.getByText("Updated result")).toBeVisible();
    expect(itemId).toBeGreaterThan(0);
  });

  test("IA-008 Finding Lifecycle", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const audit = await createAuditViaApi(page, {
      audit_title: `Finding Lifecycle Audit ${uniqueSuffix()}`,
    });
    const leadAuditorId = await getIdentityIdByEmail(page, USERS.auditor.email);
    await addAuditMember(page, audit.id, {
      identity_id: leadAuditorId,
      member_role: "LEAD_AUDITOR",
    });
    const sectionId = await addChecklistSection(page, audit.id, {
      title: "Finding Lifecycle Section",
    });
    const itemId = await addChecklistItem(page, audit.id, {
      section_id: sectionId,
      item_code: `IA-LIFE-${uniqueSuffix()}`,
      requirement_text: "Lifecycle item",
      is_mandatory: true,
    });
    await browserJson(page, `/api/v1/internal-audits/${audit.id}/start`, {
      method: "POST",
      body: {},
    });
    const findingId = await createFinding(page, audit.id, {
      checklist_item_id: itemId,
      finding_code: `FND-LIFE-${uniqueSuffix()}`,
      title: "Lifecycle finding",
      description: "Lifecycle finding description",
      severity: "LOW",
      owner_identity_id: leadAuditorId,
    });

    await openDetail(page, audit.id);
    await page.getByRole("button", { name: "Edit" }).click();
    const findingEditModal = page.locator('div.fixed.inset-0').last();
    await modalControl(findingEditModal, "Severity").selectOption("HIGH");
    await modalControl(findingEditModal, "Title").fill("Lifecycle finding updated");
    await findingEditModal.getByRole("button", { name: "Save Finding" }).click();
    await expect(page.getByText("Lifecycle finding updated")).toBeVisible();
    await expect(page.locator("span").filter({ hasText: /^HIGH$/ }).first()).toBeVisible();

    await page.getByRole("button", { name: "Close Finding" }).click();
    await expect(page.getByRole("heading", { name: "Close Finding" })).toBeVisible();
    const closeFindingModal = page.locator('div.fixed.inset-0').last();
    await modalControl(closeFindingModal, "Closure Notes").fill("Closed after remediation");
    await closeFindingModal.getByRole("button", { name: "Close Finding" }).click();
    await expect(page.locator("span").filter({ hasText: /^CLOSED$/ }).first()).toBeVisible();
    await expect(page.getByText("Closed after remediation")).toBeVisible();

    expect(findingId).toBeGreaterThan(0);
  });

  test("IA-009 Start Guard", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const audit = await createAuditViaApi(page, {
      audit_title: `Start Guard Audit ${uniqueSuffix()}`,
    });

    await openDetail(page, audit.id);
    await expect(
      browserJson(page, `/api/v1/internal-audits/${audit.id}/start`, {
        method: "POST",
        body: {},
      })
    ).rejects.toThrow("At least one checklist item is required before starting the audit.");
    await expect(page.locator("span").filter({ hasText: /^DRAFT$/ }).first()).toBeVisible();
  });

  test("IA-010 Complete Guard", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const audit = await createAuditViaApi(page, {
      audit_title: `Complete Guard Audit ${uniqueSuffix()}`,
    });
    const leadAuditorId = await getIdentityIdByEmail(page, USERS.auditor.email);
    await addAuditMember(page, audit.id, {
      identity_id: leadAuditorId,
      member_role: "LEAD_AUDITOR",
    });
    const sectionId = await addChecklistSection(page, audit.id, {
      title: "Complete Guard Section",
    });
    await addChecklistItem(page, audit.id, {
      section_id: sectionId,
      item_code: `IA-CG-${uniqueSuffix()}`,
      requirement_text: "Mandatory complete item",
      is_mandatory: true,
    });
    await browserJson(page, `/api/v1/internal-audits/${audit.id}/start`, {
      method: "POST",
      body: {},
    });

    await openDetail(page, audit.id);
    await expect(
      browserJson(page, `/api/v1/internal-audits/${audit.id}/complete`, {
        method: "POST",
        body: {},
      })
    ).rejects.toThrow(
      "All mandatory checklist items must have at least one result before completing the audit."
    );
    await expect(page.locator("span").filter({ hasText: /^IN_PROGRESS$/ }).first()).toBeVisible();
  });

  test("IA-011 Read Access", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const audit = await createAuditViaApi(page, {
      audit_title: `Read Access Audit ${uniqueSuffix()}`,
    });
    const leadAuditorId = await getIdentityIdByEmail(page, USERS.auditor.email);
    await addAuditMember(page, audit.id, {
      identity_id: leadAuditorId,
      member_role: "LEAD_AUDITOR",
    });
    await addChecklistSection(page, audit.id, {
      title: "Read Access Section",
    });

    await loginAs(page, USERS.auditor);
    await openList(page);
    await expect(page.getByText(audit.audit_title, { exact: true })).toBeVisible();
    await openDetail(page, audit.id);
    await expect(page.getByText(audit.audit_title, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  });

  test("IA-012 Tenant Isolation", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const audit = await createAuditViaApi(page, {
      audit_title: `Isolation Audit ${uniqueSuffix()}`,
    });

    await loginAs(page, USERS.defaultAdmin);
    await openDetail(page, audit.id, true);
  });
});
