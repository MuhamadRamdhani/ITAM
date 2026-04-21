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

type ManagementReviewSession = {
  id: number;
  session_code: string;
  title: string;
  review_date: string;
  status: string;
  chairperson_identity_id: number | null;
  summary: string | null;
  minutes: string | null;
  notes: string | null;
};

type ManagementReviewDecision = {
  id: number;
  decision_no: string | null;
  title: string;
  decision_text: string;
  owner_identity_id: number | null;
  target_date: string | null;
  sort_order: number;
};

type ManagementReviewActionItem = {
  id: number;
  action_no: string | null;
  title: string;
  description: string | null;
  owner_identity_id: number;
  due_date: string;
  status: string;
  progress_notes: string | null;
  completion_notes: string | null;
  session_id: number;
  session_status?: string | null;
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

async function apiDeleteJson<T = any>(page: Page, path: string) {
  return apiFetchJson<T>(page, path, { method: "DELETE" });
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

async function openManagementReviews(page: Page) {
  await page.goto("/management-reviews");
  await expect(page.getByRole("heading", { name: "Management Reviews" })).toBeVisible();
}

async function openManagementReviewDetail(page: Page, reviewId: number) {
  await page.goto(`/management-reviews/${reviewId}`);
  await expect(page.getByRole("heading", { name: /MR-/ })).toBeVisible();
}

async function openActionTracker(page: Page) {
  await page.goto("/management-reviews/action-items");
  await expect(page.getByRole("heading", { name: "Management Review Action Tracker" })).toBeVisible();
}

function formBySubmitButton(page: Page, buttonName: string) {
  return page.locator("form").filter({
    has: page.getByRole("button", { name: buttonName }),
  }).first();
}

function controlByLabel(container: any, labelText: string) {
  return container.locator("label", { hasText: labelText }).locator("xpath=following-sibling::*[1]");
}

async function createManagementReviewViaApi(
  page: Page,
  overrides: Partial<{
    session_code: string;
    title: string;
    review_date: string;
    chairperson_identity_id: number | null;
    summary: string | null;
    minutes: string | null;
    notes: string | null;
  }> = {},
): Promise<ManagementReviewSession> {
  const chairpersonIdentityId = await getIdentityIdByEmail(page, USERS.tenantAdmin.email);
  const payload = {
    session_code: overrides.session_code || `MR-${uniqueSuffix()}`,
    title: overrides.title || `Management Review ${uniqueSuffix()}`,
    review_date: overrides.review_date || toDateInput(7),
    chairperson_identity_id:
      overrides.chairperson_identity_id === undefined
        ? chairpersonIdentityId
        : overrides.chairperson_identity_id,
    summary: overrides.summary ?? "Initial management review summary",
    minutes: overrides.minutes ?? "Initial management review minutes",
    notes: overrides.notes ?? "Initial management review notes",
  };

  const response = await apiPostJson<ManagementReviewSession>(
    page,
    "/api/v1/management-reviews",
    payload,
  );

  expect(response.status, response.json?.error?.message || "create review").toBe(201);
  expect(response.json?.data?.id).toBeTruthy();

  return response.json!.data!;
}

async function createDecisionViaApi(
  page: Page,
  reviewId: number,
  overrides: Partial<{
    decision_no: string | null;
    title: string;
    decision_text: string;
    owner_identity_id: number | null;
    target_date: string | null;
    sort_order: number;
  }> = {},
): Promise<ManagementReviewDecision> {
  const ownerIdentityId = await getIdentityIdByEmail(page, USERS.tenantAdmin.email);
  const payload = {
    decision_no: overrides.decision_no ?? `DEC-${uniqueSuffix()}`,
    title: overrides.title ?? "Decision title",
    decision_text: overrides.decision_text ?? "Decision text",
    owner_identity_id:
      overrides.owner_identity_id === undefined ? ownerIdentityId : overrides.owner_identity_id,
    target_date: overrides.target_date ?? toDateInput(14),
    sort_order: overrides.sort_order ?? 1,
  };

  const response = await apiPostJson<ManagementReviewDecision>(
    page,
    `/api/v1/management-reviews/${reviewId}/decisions`,
    payload,
  );

  expect(response.status, response.json?.error?.message || "create decision").toBe(201);
  return response.json!.data!;
}

async function createActionItemViaApi(
  page: Page,
  reviewId: number,
  overrides: Partial<{
    decision_id: number | null;
    action_no: string | null;
    title: string;
    description: string | null;
    owner_identity_id: number;
    due_date: string;
    status: string;
    progress_notes: string | null;
    completion_notes: string | null;
    sort_order: number;
  }> = {},
): Promise<ManagementReviewActionItem> {
  const ownerIdentityId = await getIdentityIdByEmail(page, USERS.tenantAdmin.email);
  const payload = {
    decision_id: overrides.decision_id ?? null,
    action_no: overrides.action_no ?? `ACT-${uniqueSuffix()}`,
    title: overrides.title ?? "Action item title",
    description: overrides.description ?? "Action item description",
    owner_identity_id: overrides.owner_identity_id ?? ownerIdentityId,
    due_date: overrides.due_date ?? toDateInput(14),
    status: overrides.status ?? "OPEN",
    progress_notes: overrides.progress_notes ?? "Initial progress notes",
    completion_notes: overrides.completion_notes ?? "Initial completion notes",
    sort_order: overrides.sort_order ?? 1,
  };

  const response = await apiPostJson<ManagementReviewActionItem>(
    page,
    `/api/v1/management-reviews/${reviewId}/action-items`,
    payload,
  );

  expect(response.status, response.json?.error?.message || "create action item").toBe(201);
  return response.json!.data!;
}

async function getReviewByCode(page: Page, code: string): Promise<ManagementReviewSession | null> {
  const response = await apiGetJson<{ items: ManagementReviewSession[] }>(
    page,
    `/api/v1/management-reviews?q=${encodeURIComponent(code)}&page=1&page_size=50`,
  );

  expect(response.status).toBe(200);

  const items = Array.isArray(response.json?.data?.items) ? response.json!.data!.items : [];
  return items.find((item) => item.session_code === code) || null;
}

async function expectSessionStatus(page: Page, status: string) {
  await expect(page.getByText(status, { exact: true }).first()).toBeVisible();
}

test.describe("Management Reviews", () => {
  test("MR-001 create review session", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    await openManagementReviews(page);

    await page.getByRole("button", { name: "New Management Review" }).click();
    await expect(page.getByRole("heading", { name: "New Management Review" })).toBeVisible();

    const form = formBySubmitButton(page, "Create Session");
    const code = `MR-${uniqueSuffix()}`;
    const title = `Management Review ${uniqueSuffix()}`;

    await controlByLabel(form, "Session Code").fill(code);
    await controlByLabel(form, "Review Date").fill(toDateInput(7));
    await controlByLabel(form, "Title").fill(title);
    await controlByLabel(form, "Summary").fill("Initial summary for MR-001");
    await controlByLabel(form, "Minutes").fill("Initial minutes for MR-001");
    await controlByLabel(form, "Notes").fill("Initial notes for MR-001");
    await form.evaluate((element) => (element as HTMLFormElement).requestSubmit());

    await expect(page.getByText("Management review session created successfully.")).toBeVisible();
    await expect(page.getByText(code)).toBeVisible();
    await expect(page.getByText(title)).toBeVisible();
  });

  test("MR-002 overview update", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const review = await createManagementReviewViaApi(page, {
      title: "MR-002 Overview Update",
      summary: "Original summary",
    });

    await openManagementReviewDetail(page, review.id);

    const updatedTitle = `${review.title} Updated`;
    const overviewForm = formBySubmitButton(page, "Save Overview");
    await controlByLabel(overviewForm, "Session Code").fill(review.session_code);
    await controlByLabel(overviewForm, "Title").fill(updatedTitle);
    await controlByLabel(overviewForm, "Summary").fill("Updated summary");
    await controlByLabel(overviewForm, "Notes").fill("Updated notes");
    await overviewForm.evaluate((element) => (element as HTMLFormElement).requestSubmit());

    await expect(page.getByText("Overview updated successfully.")).toBeVisible();
    await expect(page.getByText(updatedTitle)).toBeVisible();
    await expect(page.getByText("Updated summary")).toBeVisible();
  });

  test("MR-003 decisions", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const review = await createManagementReviewViaApi(page, {
      title: "MR-003 Decisions",
    });

    const decision = await createDecisionViaApi(page, review.id, {
      title: "Approve vendor renewal",
      decision_text: "Approved for renewal",
      decision_no: "DEC-001",
      sort_order: 1,
    });

    await openManagementReviewDetail(page, review.id);
    await expect(page.getByRole("heading", { name: "Decisions" })).toBeVisible();

    const updatedTitle = "Approve vendor renewal with conditions";
    const updateResponse = await apiPatchJson<ManagementReviewDecision>(
      page,
      `/api/v1/management-reviews/${review.id}/decisions/${decision.id}`,
      {
        title: updatedTitle,
        decision_text: "Approved with minor conditions",
        decision_no: "DEC-001",
        owner_identity_id: await getIdentityIdByEmail(page, USERS.tenantAdmin.email),
        target_date: toDateInput(14),
        sort_order: 1,
      },
    );
    expect(updateResponse.status).toBe(200);

    const detailAfterUpdate = await apiGetJson<{ decisions: ManagementReviewDecision[] }>(
      page,
      `/api/v1/management-reviews/${review.id}`,
    );
    expect(detailAfterUpdate.status).toBe(200);
    expect(
      detailAfterUpdate.json?.data?.decisions?.some((item) => item.title === updatedTitle),
    ).toBeTruthy();

    const deleteResponse = await apiDeleteJson(
      page,
      `/api/v1/management-reviews/${review.id}/decisions/${decision.id}`,
    );
    expect(deleteResponse.status).toBe(200);

    const detailAfterDelete = await apiGetJson<{ decisions: ManagementReviewDecision[] }>(
      page,
      `/api/v1/management-reviews/${review.id}`,
    );
    expect(detailAfterDelete.status).toBe(200);
    expect(
      detailAfterDelete.json?.data?.decisions?.some((item) => item.title === updatedTitle),
    ).toBeFalsy();
  });

  test("MR-004 action items & tracker", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const review = await createManagementReviewViaApi(page, {
      title: "MR-004 Action Items",
    });

    const actionItem = await createActionItemViaApi(page, review.id, {
      title: "Prepare management review follow-up",
      action_no: "ACT-001",
      status: "OPEN",
      due_date: toDateInput(10),
    });

    await openManagementReviewDetail(page, review.id);
    await expect(page.getByText("Prepare management review follow-up")).toBeVisible();
    await expect(page.getByText("ACT-001")).toBeVisible();

    await openActionTracker(page);
    const trackerFilterForm = formBySubmitButton(page, "Apply");
    await controlByLabel(trackerFilterForm, "Session ID").fill(String(review.id));
    await trackerFilterForm.evaluate((element) => (element as HTMLFormElement).requestSubmit());
    await expect(page.getByText("Prepare management review follow-up")).toBeVisible();
    await expect(page.getByText(review.session_code)).toBeVisible();
    await expect(page.getByText(actionItem.action_no || "ACT-001")).toBeVisible();
  });

  test("MR-005 complete and cancel", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);

    const completeReview = await createManagementReviewViaApi(page, {
      title: "MR-005 Complete",
    });
    await openManagementReviewDetail(page, completeReview.id);
    page.once("dialog", async (dialog) => {
      await dialog.accept();
    });
    await page.getByRole("button", { name: "Complete Session" }).click();
    await expect(page.getByText("Management review session completed successfully.")).toBeVisible();
    await expectSessionStatus(page, "COMPLETED");

    const cancelReview = await createManagementReviewViaApi(page, {
      title: "MR-005 Cancel",
    });
    await openManagementReviewDetail(page, cancelReview.id);
    const cancelResponse = await apiPostJson(page, `/api/v1/management-reviews/${cancelReview.id}/cancel`, {
      cancel_reason: "Cancelled for test",
    });
    expect(cancelResponse.status).toBe(200);
    await page.reload();
    await expectSessionStatus(page, "CANCELLED");
  });

  test("MR-006 review detail", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const review = await createManagementReviewViaApi(page, {
      title: "MR-006 Review Detail",
      summary: "Review detail summary",
      minutes: "Review detail minutes",
      notes: "Review detail notes",
    });

    await openManagementReviewDetail(page, review.id);
    await expect(page.getByText(review.session_code)).toBeVisible();
    await expect(page.getByText("Review detail summary")).toBeVisible();
    await expect(page.getByText("Review detail minutes")).toBeVisible();
    await expect(page.getByText("Review detail notes")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Decisions" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Action Items" })).toBeVisible();
  });

  test("MR-007 action item detail", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const review = await createManagementReviewViaApi(page, {
      title: "MR-007 Action Item Detail",
    });
    const decision = await createDecisionViaApi(page, review.id, {
      title: "Follow-up decision",
      decision_no: "DEC-007",
    });
    const actionItem = await createActionItemViaApi(page, review.id, {
      decision_id: decision.id,
      title: "Track follow-up detail",
      action_no: "ACT-007",
      status: "OPEN",
      due_date: toDateInput(10),
    });

    await apiPostJson(page, `/api/v1/management-reviews/${review.id}/complete`, {});
    await openManagementReviewDetail(page, review.id);
    await expect(page.getByText("Track follow-up detail")).toBeVisible();
    await expect(page.getByText("Update Follow Up")).toBeVisible();

    const updateResponse = await apiPatchJson<ManagementReviewActionItem>(
      page,
      `/api/v1/management-reviews/${review.id}/action-items/${actionItem.id}`,
      {
        status: "DONE",
        progress_notes: "Finished by follow-up",
        completion_notes: "Completed and verified",
      },
    );
    expect(updateResponse.status).toBe(200);

    await page.reload();
    await expect(page.getByText("Finished by follow-up")).toBeVisible();
    await expect(page.getByText("Completed and verified")).toBeVisible();
  });

  test("MR-008 decision validation", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const review = await createManagementReviewViaApi(page, {
      title: "MR-008 Decision Validation",
    });

    const invalidResponse = await apiPostJson(
      page,
      `/api/v1/management-reviews/${review.id}/decisions`,
      {
        decision_no: "DEC-INVALID",
        title: "",
        decision_text: "Missing title should fail",
      },
    );

    expect(invalidResponse.status).toBeGreaterThanOrEqual(400);
    expect(invalidResponse.json?.error?.code).toBe("VALIDATION_ERROR");
  });

  test("MR-009 tracker update", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const review = await createManagementReviewViaApi(page, {
      title: "MR-009 Tracker Update",
    });
    const actionItem = await createActionItemViaApi(page, review.id, {
      title: "Tracker update item",
      action_no: "ACT-009",
      status: "OPEN",
      due_date: toDateInput(5),
    });

    await apiPostJson(page, `/api/v1/management-reviews/${review.id}/complete`, {});
    await openActionTracker(page);
    const trackerFilterForm = formBySubmitButton(page, "Apply");
    await controlByLabel(trackerFilterForm, "Session ID").fill(String(review.id));
    await trackerFilterForm.evaluate((element) => (element as HTMLFormElement).requestSubmit());
    await expect(page.getByText(actionItem.action_no || "ACT-009")).toBeVisible();

    await apiPatchJson(page, `/api/v1/management-reviews/${review.id}/action-items/${actionItem.id}`, {
      status: "IN_PROGRESS",
      progress_notes: "Tracker follow-up progress",
      completion_notes: "Tracker follow-up completion",
    });

    await openActionTracker(page);
    const trackerFilterFormRefilter = formBySubmitButton(page, "Apply");
    await controlByLabel(trackerFilterFormRefilter, "Session ID").fill(String(review.id));
    await trackerFilterFormRefilter.evaluate((element) => (element as HTMLFormElement).requestSubmit());
    await expect(page.getByText("Tracker follow-up progress")).toBeVisible();
    await expect(page.getByText("Tracker follow-up completion")).toBeVisible();
  });

  test("MR-010 complete guard", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const review = await createManagementReviewViaApi(page, {
      title: "MR-010 Complete Guard",
    });

    await openManagementReviewDetail(page, review.id);
    page.once("dialog", async (dialog) => {
      await dialog.accept();
    });
    await page.getByRole("button", { name: "Complete Session" }).click();
    await expect(page.getByText("Management review session completed successfully.")).toBeVisible();

    const secondComplete = await apiPostJson(page, `/api/v1/management-reviews/${review.id}/complete`, {});
    expect(secondComplete.status).toBeGreaterThanOrEqual(400);
    expect(secondComplete.json?.error?.code).toBe("MANAGEMENT_REVIEW_INVALID_STATUS");
  });

  test("MR-011 read access", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const review = await createManagementReviewViaApi(page, {
      title: "MR-011 Read Access",
    });

    await loginAs(page, USERS.auditor);
    await openManagementReviews(page);
    await expect(page.getByRole("button", { name: "New Management Review" })).toHaveCount(0);
    await expect(
      page.getByText("Read-only access: you can view management review sessions, but creation and edits are restricted."),
    ).toBeVisible();

    await openManagementReviewDetail(page, review.id);
    await expect(page.getByText("Read-only access: this management review session can be viewed, but structure changes are restricted for your role.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Complete Session" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel Session" })).toHaveCount(0);
  });

  test("MR-012 tenant isolation", async ({ page }) => {
    await loginAs(page, USERS.tenantAdmin);
    const review = await createManagementReviewViaApi(page, {
      title: "MR-012 Tenant Isolation",
    });

    await loginAs(page, USERS.defaultAdmin);
    await page.goto(`/management-reviews/${review.id}`);
    await expect(
      page.getByText(/Management review session not found|Forbidden|not found/i),
    ).toBeVisible();
  });
});
