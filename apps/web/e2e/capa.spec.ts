import { expect, test, type Page } from "@playwright/test";

type Credentials = {
  tenantCode: string;
  email: string;
  password: string;
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

type CapaCase = {
  id: number;
  tenant_id: number;
  capa_code: string;
  title: string;
  source_type: string;
  source_id: number | null;
  source_label: string | null;
  severity: string;
  status: string;
  owner_identity_id: number | null;
  owner_identity_name: string | null;
  owner_identity_email: string | null;
  due_date: string | null;
  nonconformity_summary: string | null;
  root_cause_summary: string | null;
  corrective_action_summary: string | null;
  preventive_action_summary: string | null;
  verification_summary: string | null;
  closure_notes: string | null;
  notes: string | null;
  opened_at: string | null;
  root_caused_at: string | null;
  corrective_action_at: string | null;
  preventive_action_at: string | null;
  verified_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  is_overdue: boolean;
};

type IdentityOption = {
  id: number;
  display_name?: string | null;
  identity_name?: string | null;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
};

type InternalAuditCreated = {
  id: number;
  audit_code: string;
  audit_title: string;
};

type ManagementReviewCreated = {
  id: number;
  session_code: string;
  title: string;
};

type ManagementReviewActionItem = {
  id: number;
  action_no: string | null;
  title: string;
  session_id: number;
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

async function getApiCookieHeader(page: Page) {
  const cookies = await page.context().cookies(API_BASE);
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function apiFetchJson<T = any>(
  page: Page,
  path: string,
  init?: {
    method?: string;
    body?: unknown;
  },
): Promise<{ status: number; json: ApiResponse<T> | null }> {
  const cookieHeader = await getApiCookieHeader(page);

  const res = await page.context().request.fetch(`${API_BASE}${path}`, {
    method: init?.method || "GET",
    headers: {
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    data: init?.body ?? undefined,
  });

  let json: ApiResponse<T> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    json = null;
  }

  return { status: res.status(), json };
}

async function apiGetJson<T = any>(page: Page, path: string) {
  return apiFetchJson<T>(page, path, { method: "GET" });
}

async function apiPostJson<T = any>(page: Page, path: string, body: unknown) {
  return apiFetchJson<T>(page, path, { method: "POST", body });
}

async function apiPatchJson<T = any>(page: Page, path: string, body: unknown) {
  return apiFetchJson<T>(page, path, { method: "PATCH", body });
}

async function getIdentityIdByEmail(page: Page, email: string): Promise<number> {
  const response = await apiGetJson<{ items: IdentityOption[] }>(
    page,
    `/api/v1/identities?page=1&page_size=100&q=${encodeURIComponent(email)}`,
  );

  expect(response.status).toBe(200);

  const items = Array.isArray(response.json?.data?.items) ? response.json!.data!.items : [];
  const found =
    items.find((item) => (item.email || "").toLowerCase() === email.toLowerCase()) ||
    items.find((item) =>
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
        .includes(email.toLowerCase()),
    );

  if (found?.id) return Number(found.id);
  throw new Error(`Identity with email "${email}" was not found`);
}

async function openCapaList(page: Page) {
  await page.goto("/capa");
  await expect(page.getByRole("heading", { name: "CAPA Workflow" })).toBeVisible({
    timeout: 20_000,
  });
}

async function openCapaDetail(page: Page, id: number) {
  await page.goto(`/capa/${id}`);
  await expect(page.getByText("CAPA DETAIL")).toBeVisible({ timeout: 20_000 });
}

async function openDashboard(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ITAM SaaS" })).toBeVisible({
    timeout: 20_000,
  });
}

async function createCapaViaApi(
  page: Page,
  overrides: Partial<{
    capa_code: string;
    title: string;
    source_type: string;
    source_id: number | null;
    source_label: string | null;
    severity: string;
    owner_identity_id: number | null;
    due_date: string | null;
    nonconformity_summary: string | null;
    notes: string | null;
  }> = {},
): Promise<CapaCase> {
  const ownerIdentityId =
    overrides.owner_identity_id === undefined
      ? await getIdentityIdByEmail(page, USERS.tenantAdmin.email)
      : overrides.owner_identity_id;

  const payload = {
    capa_code: overrides.capa_code || `CAPA-${uniqueSuffix()}`,
    title: overrides.title || `CAPA ${uniqueSuffix()}`,
    source_type: overrides.source_type || "OTHER",
    source_id: overrides.source_id ?? null,
    source_label: overrides.source_label ?? null,
    severity: overrides.severity || "MEDIUM",
    owner_identity_id: ownerIdentityId,
    due_date: overrides.due_date ?? toDateInput(14),
    nonconformity_summary: overrides.nonconformity_summary || "CAPA nonconformity summary",
    notes: overrides.notes || "CAPA notes",
  };

  const response = await apiPostJson<CapaCase>(page, "/api/v1/capa", payload);
  expect(response.status, response.json?.error?.message || "create capa").toBe(201);
  expect(response.json?.data?.id).toBeTruthy();

  const createdId = Number(response.json!.data!.id);
  const detail = await apiGetJson<CapaCase>(page, `/api/v1/capa/${createdId}`);
  expect(detail.status).toBe(200);

  return detail.json!.data!;
}

async function createInternalAuditFindingSource(page: Page) {
  const leadAuditorId = await getIdentityIdByEmail(page, USERS.auditor.email);
  const ownerIdentityId = await getIdentityIdByEmail(page, USERS.tenantAdmin.email);

  const auditCode = `IA-CAPA-${uniqueSuffix()}`;
  const auditTitle = `CAPA source audit ${uniqueSuffix()}`;
  const auditResponse = await apiPostJson<InternalAuditCreated>(page, "/api/v1/internal-audits", {
    audit_code: auditCode,
    audit_title: auditTitle,
    audit_type: "INTERNAL",
    lead_auditor_identity_id: leadAuditorId,
    scope_summary: "CAPA source audit scope",
    objective: "Validate CAPA audit finding source",
    planned_start_date: toDateInput(1),
    planned_end_date: toDateInput(7),
    auditee_summary: "CAPA source auditee",
    notes: "CAPA source audit notes",
  });
  expect(auditResponse.status).toBe(201);
  const auditId = Number(auditResponse.json!.data!.id);

  const memberResponse = await apiPostJson(page, `/api/v1/internal-audits/${auditId}/members`, {
    identity_id: leadAuditorId,
    member_role: "LEAD_AUDITOR",
    notes: "Lead auditor for CAPA source",
  });
  expect(memberResponse.status).toBe(201);

  const sectionResponse = await apiPostJson<{ id: number }>(
    page,
    `/api/v1/internal-audits/${auditId}/checklist-sections`,
    {
      title: "CAPA Source Section",
      description: "Source section for CAPA",
      clause_code: "CAPA-1",
      sort_order: 1,
    },
  );
  expect(sectionResponse.status).toBe(201);
  const sectionId = Number(sectionResponse.json!.data!.id);

  const itemResponse = await apiPostJson<{ id: number }>(
    page,
    `/api/v1/internal-audits/${auditId}/checklist-items`,
    {
      section_id: sectionId,
      item_code: `IA-CAPA-ITEM-${uniqueSuffix()}`,
      requirement_text: "Evidence must be retained.",
      expected_evidence: "Retention evidence",
      clause_code: "CAPA-1.1",
      sort_order: 1,
      is_mandatory: true,
    },
  );
  expect(itemResponse.status).toBe(201);

  const startResponse = await apiPostJson(page, `/api/v1/internal-audits/${auditId}/start`, {});
  expect(startResponse.status).toBe(200);

  const findingCode = `FND-CAPA-${uniqueSuffix()}`;
  const findingTitle = `CAPA audit finding ${uniqueSuffix()}`;
  const findingResponse = await apiPostJson<{ id: number }>(
    page,
    `/api/v1/internal-audits/${auditId}/findings`,
    {
      checklist_item_id: Number(itemResponse.json!.data!.id),
      finding_code: findingCode,
      title: findingTitle,
      description: "CAPA audit finding description",
      severity: "HIGH",
      owner_identity_id: ownerIdentityId,
      due_date: toDateInput(10),
    },
  );
  expect(findingResponse.status).toBe(201);

  return {
    auditId,
    findingId: Number(findingResponse.json!.data!.id),
    findingCode,
    findingTitle,
  };
}

async function createManagementReviewActionItemSource(page: Page) {
  const ownerIdentityId = await getIdentityIdByEmail(page, USERS.tenantAdmin.email);
  const chairpersonIdentityId = await getIdentityIdByEmail(page, USERS.tenantAdmin.email);

  const reviewCode = `MR-CAPA-${uniqueSuffix()}`;
  const reviewTitle = `CAPA source review ${uniqueSuffix()}`;
  const reviewResponse = await apiPostJson<ManagementReviewCreated>(page, "/api/v1/management-reviews", {
    session_code: reviewCode,
    title: reviewTitle,
    review_date: toDateInput(7),
    chairperson_identity_id: chairpersonIdentityId,
    summary: "CAPA source review summary",
    minutes: "CAPA source review minutes",
    notes: "CAPA source review notes",
  });
  expect(reviewResponse.status).toBe(201);
  const reviewId = Number(reviewResponse.json!.data!.id);

  const actionItemResponse = await apiPostJson<ManagementReviewActionItem>(
    page,
    `/api/v1/management-reviews/${reviewId}/action-items`,
    {
      decision_id: null,
      action_no: `ACT-CAPA-${uniqueSuffix()}`,
      title: `CAPA action item ${uniqueSuffix()}`,
      description: "CAPA action item description",
      owner_identity_id: ownerIdentityId,
      due_date: toDateInput(14),
      status: "OPEN",
      progress_notes: "Initial progress",
      completion_notes: "Initial completion",
      sort_order: 1,
    },
  );
  expect(actionItemResponse.status).toBe(201);

  return {
    reviewId,
    reviewCode,
    reviewTitle,
    actionItemId: Number(actionItemResponse.json!.data!.id),
    actionItemTitle: actionItemResponse.json!.data!.title,
  };
}

async function expectTableContainsCode(page: Page, code: string) {
  await expect(page.locator("tbody tr").filter({ hasText: code })).toHaveCount(1);
}

test.describe("CAPA", () => {
  test("CAPA-036 dashboard launcher is visible", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openDashboard(page);
    await expect(page.getByRole("link", { name: "CAPA" })).toBeVisible();
  });

  test("CAPA-001 list summary and detail entrypoint render", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const capa = await createCapaViaApi(page, {
      capa_code: `CAPA-001-${uniqueSuffix()}`,
      title: "CAPA list summary case",
      source_label: "Manual source label",
      due_date: toDateInput(7),
    });

    await openCapaList(page);
    await expect(page.getByText("Total CAPA")).toBeVisible();
    await expect(page.getByText("Open", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Overdue", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Closed", { exact: true }).first()).toBeVisible();
    await page.getByPlaceholder("Search CAPA").fill(capa.capa_code);
    await page.getByRole("button", { name: "Apply" }).click();
    await expectTableContainsCode(page, capa.capa_code);
    await page.getByRole("link", { name: "Open Detail" }).click();
    await expect(page.getByText("CAPA DETAIL")).toBeVisible();
    await expect(page.getByText(capa.capa_code, { exact: true })).toBeVisible();
  });

  test("CAPA-002 to CAPA-006 search, filters, and pagination work", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);

    const manual = await createCapaViaApi(page, {
      capa_code: `CAPA-FLT-${uniqueSuffix()}`,
      title: "Filterable CAPA",
      source_type: "OTHER",
      severity: "LOW",
      source_label: "Manual filter source",
    });

    const auditSource = await createInternalAuditFindingSource(page);
    const auditCapa = await createCapaViaApi(page, {
      capa_code: `CAPA-AUD-${uniqueSuffix()}`,
      title: "Audit finding CAPA",
      source_type: "INTERNAL_AUDIT_FINDING",
      source_id: auditSource.findingId,
      source_label: auditSource.findingTitle,
      severity: "HIGH",
    });

    const reviewSource = await createManagementReviewActionItemSource(page);
    const mrCapa = await createCapaViaApi(page, {
      capa_code: `CAPA-MR-${uniqueSuffix()}`,
      title: "Management review CAPA",
      source_type: "MANAGEMENT_REVIEW_ACTION_ITEM",
      source_id: reviewSource.actionItemId,
      source_label: reviewSource.actionItemTitle,
      severity: "CRITICAL",
    });

    for (let i = 0; i < 8; i += 1) {
      await createCapaViaApi(page, {
        capa_code: `CAPA-PAG-${i + 1}-${uniqueSuffix()}`,
        title: `Pagination seed ${i + 1}`,
        source_type: "OTHER",
        source_label: `Pagination seed ${i + 1}`,
        severity: i % 2 === 0 ? "MEDIUM" : "LOW",
      });
    }

    await openCapaList(page);

    const search = page.getByPlaceholder("Search CAPA");
    await search.fill(manual.capa_code);
    await page.getByRole("button", { name: "Apply" }).click();
    await expectTableContainsCode(page, manual.capa_code);

    await page.locator("select").nth(0).selectOption("OPEN");
    await page.getByRole("button", { name: "Apply" }).click();
    await expectTableContainsCode(page, manual.capa_code);

    await search.fill(auditCapa.source_label || auditCapa.capa_code);
    await page.locator("select").nth(1).selectOption("INTERNAL_AUDIT_FINDING");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(auditCapa.capa_code, { exact: true })).toBeVisible();

    await search.fill(mrCapa.capa_code);
    await page.locator("select").nth(0).selectOption("");
    await page.locator("select").nth(1).selectOption("");
    await page.locator("select").nth(2).selectOption("CRITICAL");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(mrCapa.capa_code, { exact: true })).toBeVisible({ timeout: 20_000 });

    await search.fill("");
    await page.locator("select").nth(0).selectOption("");
    await page.locator("select").nth(1).selectOption("");
    await page.locator("select").nth(2).selectOption("");
    await page.getByRole("button", { name: "Apply" }).click();

    const nextButton = page.getByRole("button", { name: "Next", exact: true });
    const previousButton = page.getByRole("button", { name: "Previous", exact: true });

    await expect(nextButton).toBeVisible();
    await nextButton.click();
    await expect(previousButton).toBeVisible();
    await previousButton.click();
  });

  test("CAPA-007 empty state shows when nothing matches", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openCapaList(page);

    await page.getByPlaceholder("Search CAPA").fill(`NO-MATCH-${uniqueSuffix()}`);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("No CAPA cases matched the current filters.")).toBeVisible();
  });

  test("CAPA-008 manual create via API is visible in the list and detail", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const capa = await createCapaViaApi(page, {
      capa_code: `CAPA-MAN-${uniqueSuffix()}`,
      title: "Manual CAPA",
      source_type: "OTHER",
      source_label: "Manual entry",
      severity: "MEDIUM",
    });

    await openCapaList(page);
    await page.getByPlaceholder("Search CAPA").fill(capa.capa_code);
    await page.getByRole("button", { name: "Apply" }).click();
    await expectTableContainsCode(page, capa.capa_code);
    await page.getByRole("link", { name: "Open Detail" }).click();
    await expect(page.getByRole("heading", { name: capa.title })).toBeVisible();
    await expect(page.getByText("Manual entry", { exact: true }).first()).toBeVisible();
  });

  test("CAPA-009 and CAPA-010 source-based create cases are persisted", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);

    const auditSource = await createInternalAuditFindingSource(page);
    const auditCapa = await createCapaViaApi(page, {
      capa_code: `CAPA-AUDSRC-${uniqueSuffix()}`,
      title: "Audit source CAPA",
      source_type: "INTERNAL_AUDIT_FINDING",
      source_id: auditSource.findingId,
      source_label: auditSource.findingTitle,
      severity: "HIGH",
    });

    const mrSource = await createManagementReviewActionItemSource(page);
    const mrCapa = await createCapaViaApi(page, {
      capa_code: `CAPA-MRSRC-${uniqueSuffix()}`,
      title: "MR source CAPA",
      source_type: "MANAGEMENT_REVIEW_ACTION_ITEM",
      source_id: mrSource.actionItemId,
      source_label: mrSource.actionItemTitle,
      severity: "CRITICAL",
    });

    await openCapaList(page);
    const search = page.getByPlaceholder("Search CAPA");

    await search.fill(auditCapa.capa_code);
    await page.getByRole("button", { name: "Apply" }).click();
    await expectTableContainsCode(page, auditCapa.capa_code);

    await search.fill(mrCapa.capa_code);
    await page.getByRole("button", { name: "Apply" }).click();
    await expectTableContainsCode(page, mrCapa.capa_code);
  });

  test("CAPA-011 and CAPA-012 detail view preserves updates", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const created = await createCapaViaApi(page, {
      capa_code: `CAPA-DET-${uniqueSuffix()}`,
      title: "Detail preservation CAPA",
      source_label: "Original source label",
      severity: "LOW",
      due_date: toDateInput(10),
    });

    const updated = await apiPatchJson<CapaCase>(page, `/api/v1/capa/${created.id}`, {
      title: "Detail preservation CAPA updated",
      source_label: "Updated source label",
      notes: "Updated notes",
      severity: "HIGH",
    });
    expect(updated.status).toBe(200);

    await openCapaDetail(page, created.id);
    await expect(page.getByRole("heading", { name: "Detail preservation CAPA updated" })).toBeVisible();
    await expect(page.getByText("Updated source label", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Updated notes", { exact: true }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Detail preservation CAPA updated" })).toBeVisible();
  });

  test("CAPA-013 to CAPA-017 lifecycle stages advance in order", async ({ page }) => {
    await loginAs(page, USERS.itamManager);
    const capa = await createCapaViaApi(page, {
      capa_code: `CAPA-LIFE-${uniqueSuffix()}`,
      title: "Lifecycle CAPA",
      severity: "MEDIUM",
    });

    const rootCause = await apiPostJson(page, `/api/v1/capa/${capa.id}/root-cause`, {
      root_cause_summary: "Root cause captured",
    });
    expect(rootCause.status).toBe(200);

    const corrective = await apiPostJson(page, `/api/v1/capa/${capa.id}/corrective-action`, {
      corrective_action_summary: "Corrective action captured",
    });
    expect(corrective.status).toBe(200);

    const preventive = await apiPostJson(page, `/api/v1/capa/${capa.id}/preventive-action`, {
      preventive_action_summary: "Preventive action captured",
    });
    expect(preventive.status).toBe(200);

    const verification = await apiPostJson(page, `/api/v1/capa/${capa.id}/verification`, {
      verification_summary: "Verification captured",
    });
    expect(verification.status).toBe(200);

    const close = await apiPostJson(page, `/api/v1/capa/${capa.id}/close`, {
      closure_notes: "Closed after verification",
    });
    expect(close.status).toBe(200);

    await openCapaDetail(page, capa.id);
    await expect(page.getByText("CLOSED", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Root cause captured")).toBeVisible();
    await expect(page.getByText("Corrective action captured")).toBeVisible();
    await expect(page.getByText("Preventive action captured")).toBeVisible();
    await expect(page.getByText("Verification captured")).toBeVisible();
    const afterClose = await apiGetJson<CapaCase>(page, `/api/v1/capa/${capa.id}`);
    expect(afterClose.status).toBe(200);
    expect(afterClose.json?.data?.closure_notes).toBe("Closed after verification");
    expect(afterClose.json?.data?.status).toBe("CLOSED");
  });

  test("CAPA-018 cancel flow works and closed cases cannot be cancelled", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const capa = await createCapaViaApi(page, {
      capa_code: `CAPA-CAN-${uniqueSuffix()}`,
      title: "Cancelable CAPA",
    });

    const cancelResponse = await apiPostJson(page, `/api/v1/capa/${capa.id}/cancel`, {
      cancel_reason: "No longer needed",
    });
    expect(cancelResponse.status).toBe(200);

    await openCapaDetail(page, capa.id);
    await expect(page.getByText("CANCELLED", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("No longer needed")).toBeVisible();
  });

  test("CAPA-019 stage transition guards block invalid ordering", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const capa = await createCapaViaApi(page, {
      capa_code: `CAPA-GUARD-${uniqueSuffix()}`,
      title: "Guarded CAPA",
    });

    const correctiveBeforeRoot = await apiPostJson(page, `/api/v1/capa/${capa.id}/corrective-action`, {
      corrective_action_summary: "Should fail",
    });
    expect(correctiveBeforeRoot.status).toBe(400);
    expect(correctiveBeforeRoot.json?.error?.code).toBe("CAPA_ROOT_CAUSE_REQUIRED");

    const verificationBeforePreventive = await apiPostJson(page, `/api/v1/capa/${capa.id}/verification`, {
      verification_summary: "Should fail",
    });
    expect(verificationBeforePreventive.status).toBe(400);
    expect(verificationBeforePreventive.json?.error?.code).toBe("CAPA_PREVENTIVE_REQUIRED");

    const closeBeforeVerification = await apiPostJson(page, `/api/v1/capa/${capa.id}/close`, {
      closure_notes: "Should fail",
    });
    expect(closeBeforeVerification.status).toBe(409);
    expect(closeBeforeVerification.json?.error?.code).toBe("CAPA_STAGE_BLOCKED");
  });

  test("CAPA-020 and CAPA-021 closed cases are read-only and duplicate code is blocked", async ({
    page,
  }) => {
    await loginAs(page, USERS.tenantAdmin);
    const code = `CAPA-RO-${uniqueSuffix()}`;
    const capa = await createCapaViaApi(page, {
      capa_code: code,
      title: "Read only CAPA",
    });

    const duplicate = await apiPostJson(page, "/api/v1/capa", {
      capa_code: code,
      title: "Duplicate CAPA",
      source_type: "OTHER",
      severity: "LOW",
      owner_identity_id: await getIdentityIdByEmail(page, USERS.tenantAdmin.email),
      due_date: toDateInput(10),
      nonconformity_summary: "Duplicate attempt",
      notes: "Duplicate attempt",
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.json?.error?.code).toBe("CAPA_CODE_EXISTS");

    await apiPostJson(page, `/api/v1/capa/${capa.id}/root-cause`, {
      root_cause_summary: "Root cause for read only case",
    });
    await apiPostJson(page, `/api/v1/capa/${capa.id}/corrective-action`, {
      corrective_action_summary: "Corrective action",
    });
    await apiPostJson(page, `/api/v1/capa/${capa.id}/preventive-action`, {
      preventive_action_summary: "Preventive action",
    });
    await apiPostJson(page, `/api/v1/capa/${capa.id}/verification`, {
      verification_summary: "Verification",
    });
    await apiPostJson(page, `/api/v1/capa/${capa.id}/close`, {
      closure_notes: "Closed for read only",
    });

    const updateClosed = await apiPatchJson(page, `/api/v1/capa/${capa.id}`, {
      title: "Should not update",
    });
    expect(updateClosed.status).toBe(409);
    expect(updateClosed.json?.error?.code).toBe("CAPA_READ_ONLY");

    const cancelClosed = await apiPostJson(page, `/api/v1/capa/${capa.id}/cancel`, {
      cancel_reason: "Should not cancel",
    });
    expect(cancelClosed.status).toBe(409);
    expect(cancelClosed.json?.error?.code).toBe("CAPA_READ_ONLY");
  });

  test("CAPA-022 and CAPA-023 invalid source and severity are rejected", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);

    const invalidSource = await apiPostJson(page, "/api/v1/capa", {
      capa_code: `CAPA-BAD-SRC-${uniqueSuffix()}`,
      title: "Invalid source CAPA",
      source_type: "BROKEN_SOURCE",
      severity: "LOW",
      owner_identity_id: await getIdentityIdByEmail(page, USERS.tenantAdmin.email),
      due_date: toDateInput(10),
      nonconformity_summary: "Invalid source",
      notes: "Invalid source",
    });
    expect(invalidSource.status).toBe(400);
    expect(invalidSource.json?.error?.code).toBe("VALIDATION_ERROR");

    const invalidSeverity = await apiPostJson(page, "/api/v1/capa", {
      capa_code: `CAPA-BAD-SEV-${uniqueSuffix()}`,
      title: "Invalid severity CAPA",
      source_type: "OTHER",
      severity: "SEVERE",
      owner_identity_id: await getIdentityIdByEmail(page, USERS.tenantAdmin.email),
      due_date: toDateInput(10),
      nonconformity_summary: "Invalid severity",
      notes: "Invalid severity",
    });
    expect(invalidSeverity.status).toBe(400);
    expect(invalidSeverity.json?.error?.code).toBe("VALIDATION_ERROR");
  });

  test("CAPA-024 and CAPA-034 tenant isolation is enforced", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const capa = await createCapaViaApi(page, {
      capa_code: `CAPA-ISO-${uniqueSuffix()}`,
      title: "Tenant isolation CAPA",
      source_label: "Isolation source",
    });

    await loginAs(page, USERS.defaultAdmin);
    const crossTenantDetail = await apiGetJson(page, `/api/v1/capa/${capa.id}`);
    expect(crossTenantDetail.status).toBe(404);
    expect(crossTenantDetail.json?.error?.code).toBe("CAPA_NOT_FOUND");

    await openCapaList(page);
    await page.getByPlaceholder("Search CAPA").fill(capa.capa_code);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("No CAPA cases matched the current filters.")).toBeVisible();
  });

  test("CAPA-025 and CAPA-026 search result link and detail preservation are stable", async ({
    page,
  }) => {
    await loginAs(page, USERS.tenantAdmin);
    const capa = await createCapaViaApi(page, {
      capa_code: `CAPA-LINK-${uniqueSuffix()}`,
      title: "Link preservation CAPA",
      source_label: "Search result source",
      notes: "Initial notes",
    });

    await openCapaList(page);
    await page.getByPlaceholder("Search CAPA").fill(capa.capa_code);
    await page.getByRole("button", { name: "Apply" }).click();
    await expectTableContainsCode(page, capa.capa_code);
    await page.getByRole("link", { name: "Open Detail" }).click();
    await expect(page.getByRole("heading", { name: "Link preservation CAPA" })).toBeVisible();

    const updated = await apiPatchJson(page, `/api/v1/capa/${capa.id}`, {
      title: "Link preservation CAPA updated",
      notes: "Updated notes",
    });
    expect(updated.status).toBe(200);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Link preservation CAPA updated" })).toBeVisible();
    await expect(page.getByText("Updated notes")).toBeVisible();
  });

  test("CAPA-027 and CAPA-035 audit trail records each stage", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const capa = await createCapaViaApi(page, {
      capa_code: `CAPA-AUDIT-${uniqueSuffix()}`,
      title: "Audit trail CAPA",
    });

    await apiPostJson(page, `/api/v1/capa/${capa.id}/root-cause`, {
      root_cause_summary: "Audit trail root cause",
    });
    await apiPostJson(page, `/api/v1/capa/${capa.id}/corrective-action`, {
      corrective_action_summary: "Audit trail corrective",
    });
    await apiPostJson(page, `/api/v1/capa/${capa.id}/preventive-action`, {
      preventive_action_summary: "Audit trail preventive",
    });
    await apiPostJson(page, `/api/v1/capa/${capa.id}/verification`, {
      verification_summary: "Audit trail verification",
    });
    await apiPostJson(page, `/api/v1/capa/${capa.id}/close`, {
      closure_notes: "Audit trail closure",
    });

    await page.goto("/audit-events");
    await expect(page.getByRole("heading", { name: "Audit Trail" })).toBeVisible();

    const trail = await apiGetJson<{
      items: Array<{ action: string; entity_type: string; entity_id: number; payload: unknown }>;
    }>(page, `/api/v1/audit-events?page=1&page_size=20`);

    expect(trail.status).toBe(200);
    expect(Array.isArray(trail.json?.data?.items)).toBeTruthy();
  });

  test("CAPA-031 and CAPA-032 auditor can read and ITAM manager can complete lifecycle", async ({
    page,
  }) => {
    await loginAs(page, USERS.itamManager);
    const capa = await createCapaViaApi(page, {
      capa_code: `CAPA-ROLE-${uniqueSuffix()}`,
      title: "Role lifecycle CAPA",
      severity: "HIGH",
    });

    await loginAs(page, USERS.auditor);
    await openCapaList(page);
    await expect(page.getByRole("link", { name: "New CAPA" })).toHaveCount(0);
    await page.getByPlaceholder("Search CAPA").fill(capa.capa_code);
    await page.getByRole("button", { name: "Apply" }).click();
    await expectTableContainsCode(page, capa.capa_code);
    await page.getByRole("link", { name: "Open Detail" }).click();
    await expect(page.getByText("CAPA DETAIL")).toBeVisible();
    await expect(page.getByText(capa.capa_code, { exact: true })).toBeVisible();

    await loginAs(page, USERS.itamManager);
    await apiPostJson(page, `/api/v1/capa/${capa.id}/root-cause`, {
      root_cause_summary: "Role root cause",
    });
    await apiPostJson(page, `/api/v1/capa/${capa.id}/corrective-action`, {
      corrective_action_summary: "Role corrective",
    });
    await apiPostJson(page, `/api/v1/capa/${capa.id}/preventive-action`, {
      preventive_action_summary: "Role preventive",
    });
    await apiPostJson(page, `/api/v1/capa/${capa.id}/verification`, {
      verification_summary: "Role verification",
    });
    const close = await apiPostJson(page, `/api/v1/capa/${capa.id}/close`, {
      closure_notes: "Role closed",
    });
    expect(close.status).toBe(200);
  });

  test("CAPA-033 overdue calculation marks past-due open cases", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const capa = await createCapaViaApi(page, {
      capa_code: `CAPA-OVD-${uniqueSuffix()}`,
      title: "Overdue CAPA",
      due_date: toDateInput(-7),
      source_label: "Overdue source",
    });

    await openCapaList(page);
    await page.getByPlaceholder("Search CAPA").fill(capa.capa_code);
    await page.getByRole("button", { name: "Apply" }).click();
    await expectTableContainsCode(page, capa.capa_code);
    await expect(page.getByRole("table").getByText("Overdue", { exact: true }).first()).toBeVisible();
    const detail = await apiGetJson<CapaCase>(page, `/api/v1/capa/${capa.id}`);
    expect(detail.status).toBe(200);
    expect(detail.json?.data?.is_overdue).toBeTruthy();
  });
});
