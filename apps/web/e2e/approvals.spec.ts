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
  defaultAdmin: {
    tenantCode: "default",
    email: "admin@default.local",
    password: "admin123",
  },
} satisfies Record<string, Credentials>;

const API_BROWSER_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");
const USED_APPROVAL_IDS = new Set<number>();

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

async function browserPostJson(page: Page, path: string, body: unknown) {
  const result = await page.evaluate(
    async ({ url, payload, apiBase }) => {
      const res = await fetch(`${apiBase}${url}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }

      return { status: res.status, body: parsed };
    },
    { url: path, payload: body, apiBase: API_BROWSER_BASE }
  );
  return result;
}

async function pickTransitionSelectValue(
  page: Page,
  select: ReturnType<Page["locator"]>,
  selected: { to_state_code?: string; to_state_label?: string; to_state_id?: number | string }
) {
  const options = await select.locator("option").evaluateAll((nodes) =>
    nodes.map((node) => {
      const option = node as HTMLOptionElement;
      return {
        value: option.value,
        text: (option.textContent || "").trim(),
      };
    })
  );

  const code = String(selected.to_state_code ?? "").trim();
  const label = String(selected.to_state_label ?? "").trim();
  const id = String(selected.to_state_id ?? "").trim();

  const found =
    options.find((opt) => (code && opt.text.includes(code)) || (label && opt.text.includes(label))) ??
    options.find((opt) => id && opt.value === id) ??
    options[0];

  if (!found) {
    throw new Error("No transition select options available");
  }

  return found.value || found.text;
}

function buildTransitionPayload(selected: {
  to_state_code?: string;
  to_state_label?: string;
  to_state_id?: number | string;
}, reason: string) {
  const toStateId = String(selected.to_state_id ?? "").trim();
  const toStateCode = String(selected.to_state_code ?? "").trim();

  return {
    ...(toStateId ? { to_state_id: toStateId } : {}),
    ...(toStateCode ? { to_state_code: toStateCode } : {}),
    reason,
  };
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

async function fetchJson(page: Page, path: string) {
  return page.evaluate(async (url) => {
    const res = await fetch(url, { credentials: "include" });
    return await res.json();
  }, path);
}

async function createAssetViaUi(page: Page, creds: Credentials, label: string) {
  await loginAs(page, creds);
  await page.goto("/assets/new");
  await expect(page.getByRole("heading", { name: "New Asset" })).toBeVisible();

  const suffix = uniqueSuffix();
  const assetTag = `PW-APPR-${label.toUpperCase()}-${suffix}`;
  const assetName = `Playwright Approval ${label} ${suffix}`;

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

  const stateSelect = page.locator("select").nth(1);
  const stateOptions = await stateSelect.locator("option").evaluateAll((options) =>
    options.map((opt) => ({
      value: (opt as HTMLOptionElement).value,
      text: (opt.textContent || "").trim(),
    }))
  );
  const desiredState =
    stateOptions.find((opt) => /ORDERED|DIPESAN/i.test(opt.text)) ??
    stateOptions[0];
  if (!desiredState) {
    throw new Error("No lifecycle state options available for asset creation");
  }
  await stateSelect.selectOption(desiredState.value);

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
    assetId: Number(match[1]),
    assetTag,
    assetName,
  };
}

async function openAssetLifecycle(page: Page, assetId: number) {
  await page.goto(`/assets/${assetId}?tab=lifecycle`);
  await expect(page.getByRole("button", { name: "Transition" })).toBeVisible({
    timeout: 20_000,
  });
}

async function fetchAssetState(page: Page, assetId: number) {
  const res = await fetchJson(page, `${API_BROWSER_BASE}/api/v1/assets/${assetId}`);
  const asset = res?.data?.asset ?? res?.data?.data?.asset ?? res?.asset ?? null;
  const state = asset?.state ?? {};
  const label = typeof state?.label === "string" ? state.label : "";
  const code = typeof state?.code === "string" ? state.code : "";
  return `${label}${label && code ? " " : ""}${code ? `(${code})` : ""}`.trim();
}

async function createPendingApprovalFromExistingAsset(page: Page, creds: Credentials, label: string) {
  try {
    const createdAsset = await createAssetViaUi(page, creds, label);
    await openAssetLifecycle(page, createdAsset.assetId);

    const stateBefore = await fetchAssetState(page, createdAsset.assetId);

    await page.getByRole("button", { name: "Transition" }).click();

    const optionsRes = await fetchJson(page, `${API_BROWSER_BASE}/api/v1/assets/${createdAsset.assetId}/transition-options`);
    const raw = optionsRes?.data?.options ?? optionsRes?.data ?? optionsRes?.options ?? [];
    const options = Array.isArray(raw) ? raw : [];
    const selected =
      options.find((o: any) => Boolean(o?.require_approval) && !Boolean(o?.blocked)) ??
      options.find((o: any) => Boolean(o?.require_approval)) ??
      null;

    if (selected) {
      const selectValue = String(selected.to_state_code ?? selected.to_state_id ?? "").trim();
      if (selectValue) {
        const select = page.locator("div.fixed select").first();
        const optionValue = await pickTransitionSelectValue(page, select, selected);
        await select.selectOption(optionValue);
        await expect(page.getByText("Requires approval")).toBeVisible({ timeout: 10_000 });

        const reason = `Playwright approval ${label} ${uniqueSuffix()}`;
        await page.getByPlaceholder("Contoh: Approved after ownership set").fill(reason);
        const submitButton = page.getByRole("button", { name: "Submit transition" });
        await submitButton.scrollIntoViewIfNeeded();
        const directBody = await browserPostJson(
          page,
          `/api/v1/assets/${createdAsset.assetId}/transition`,
          buildTransitionPayload(selected, reason),
        );
        console.log(
          `[approvals] lifecycle request response ${label}`,
          directBody.status,
          directBody.body?.data?.mode,
          directBody.body?.data?.approval_id
        );

        const approvalId = Number(directBody.body?.data?.approval_id ?? directBody.body?.data?.id ?? 0);
        if (directBody.body?.data?.mode === "APPROVAL_REQUIRED" && approvalId > 0) {
          if (!USED_APPROVAL_IDS.has(approvalId)) {
            USED_APPROVAL_IDS.add(approvalId);
            await page.getByRole("button", { name: "Cancel" }).click();
            return {
              approvalId,
              assetId: createdAsset.assetId,
              assetTag: createdAsset.assetTag,
              assetStateBefore: stateBefore,
              targetCode: String(selected.to_state_code ?? selected.to_state_id ?? ""),
              targetLabel: String(selected.to_state_label ?? ""),
            };
          }
        }

        await page.getByRole("button", { name: "Cancel" }).click();
      }
    }
  } catch {
    // fall through to existing asset scan
  }

  await loginAs(page, creds);
  console.log(`[approvals] fallback asset scan ${label}`);
  await page.goto("/assets");
  await expect(page.getByRole("heading", { name: "Assets" })).toBeVisible({
    timeout: 20_000,
  });

  const rows = page.locator("tbody tr");
  const rowCount = await rows.count();

  for (let i = 0; i < rowCount; i += 1) {
    try {
      const row = rows.nth(i);
      const tagLink = row.locator("td").first().locator("a").first();
      const assetTag = (await tagLink.textContent())?.trim() || `asset-${i}`;

      await tagLink.click();
      await page.waitForURL(/\/assets\/\d+/, { timeout: 20_000 });
      const match = page.url().match(/\/assets\/(\d+)/);
      if (!match) continue;

      const assetId = Number(match[1]);
      await page.getByRole("link", { name: "Lifecycle" }).click();
      await expect(page.getByRole("button", { name: "Transition" })).toBeVisible({
        timeout: 20_000,
      });

      const stateBefore = await fetchAssetState(page, assetId);
      await page.getByRole("button", { name: "Transition" }).click();

      const optionsRes = await fetchJson(page, `${API_BROWSER_BASE}/api/v1/assets/${assetId}/transition-options`);
      const raw = optionsRes?.data?.options ?? optionsRes?.data ?? optionsRes?.options ?? [];
      const options = Array.isArray(raw) ? raw : [];
      const selected =
        options.find((o: any) => Boolean(o?.require_approval) && !Boolean(o?.blocked)) ??
        options.find((o: any) => Boolean(o?.require_approval)) ??
        null;

      if (!selected) {
        continue;
      }

      const selectValue = String(selected.to_state_code ?? selected.to_state_id ?? "").trim();
      if (!selectValue) {
        continue;
      }

      const select = page.locator("div.fixed select").first();
      const optionValue = await pickTransitionSelectValue(page, select, selected);
      await select.selectOption(optionValue);
      await expect(page.getByText("Requires approval")).toBeVisible({ timeout: 10_000 });

      const reason = `Playwright approval ${label} ${uniqueSuffix()}`;
      await page.getByPlaceholder("Contoh: Approved after ownership set").fill(reason);
      const submitButton = page.getByRole("button", { name: "Submit transition" });
      await submitButton.scrollIntoViewIfNeeded();
      const directBody = await browserPostJson(
        page,
        `/api/v1/assets/${assetId}/transition`,
        buildTransitionPayload(selected, reason),
      );
      console.log(
        `[approvals] lifecycle request response ${label}`,
        directBody.status,
        directBody.body?.data?.mode,
        directBody.body?.data?.approval_id
      );

      const approvalId = Number(directBody.body?.data?.approval_id ?? directBody.body?.data?.id ?? 0);
      if (directBody.body?.data?.mode !== "APPROVAL_REQUIRED" || approvalId <= 0) {
        await page.getByRole("button", { name: "Cancel" }).click();
        await page.goto("/assets");
        continue;
      }

      if (USED_APPROVAL_IDS.has(approvalId)) {
        await page.getByRole("button", { name: "Cancel" }).click();
        await page.goto("/assets");
        continue;
      }

      USED_APPROVAL_IDS.add(approvalId);
      await page.getByRole("button", { name: "Cancel" }).click();
      return {
        approvalId,
        assetId,
        assetTag,
        assetStateBefore: stateBefore,
        targetCode: String(selected.to_state_code ?? selected.to_state_id ?? ""),
        targetLabel: String(selected.to_state_label ?? ""),
      };
    } catch {
      await page.goto("/assets");
      continue;
    }
  }

  throw new Error("No existing asset with approval-required transition found");
}

async function openApprovalDetail(page: Page, approvalId: number) {
  await page.goto(`/approvals/${approvalId}`);
  await expect(page.getByRole("heading", { name: new RegExp(`Approval #${approvalId}`) })).toBeVisible({
    timeout: 20_000,
  });
}

async function openApprovalsQueue(page: Page, status = "PENDING") {
  await page.goto(`/approvals?status=${encodeURIComponent(status)}`);
  await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible({
    timeout: 20_000,
  });
}

async function decideApproval(page: Page, decision: "APPROVE" | "REJECT", note?: string) {
  if (note !== undefined) {
    await page.getByPlaceholder("Decision note (optional)").fill(note);
  }

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: decision === "APPROVE" ? "Approve" : "Reject" }).click();
}

async function directDecideApproval(page: Page, approvalId: number, decision: "APPROVE" | "REJECT") {
  return page.evaluate(
    async ({ approvalId: id, decision: dec, apiBase }) => {
      const res = await fetch(`${apiBase}/api/v1/approvals/${id}/decide`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: dec }),
      });

      let body: any = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      return { status: res.status, body };
    },
    { approvalId, decision, apiBase: API_BROWSER_BASE }
  );
}

async function expectQueueRow(page: Page, approvalId: number) {
  const row = page.locator("tbody tr").filter({ has: page.locator(`a[href*="/approvals/${approvalId}"]`) }).first();
  await expect(row).toBeVisible({
    timeout: 20_000,
  });
}

test.describe.serial("Approvals", () => {
  test.setTimeout(180_000);

  test("queue filters show pending, approved, and rejected approvals", async ({ page }) => {
    const pending = await createPendingApprovalFromExistingAsset(page, USERS.tenantAdmin, "queue-pending");

    await openApprovalsQueue(page, "PENDING");
    await expectQueueRow(page, pending.approvalId);

    await openApprovalDetail(page, pending.approvalId);
    await decideApproval(page, "APPROVE");
    await expect(page.getByText("Approval sudah diputuskan. Status: APPROVED")).toBeVisible({
      timeout: 30_000,
    });

    await openApprovalsQueue(page, "PENDING");
    await expect(page.locator("tbody tr").filter({ has: page.locator(`a[href*="/approvals/${pending.approvalId}"]`) })).toHaveCount(0);

    await openApprovalsQueue(page, "APPROVED");
    await expectQueueRow(page, pending.approvalId);

    const rejected = await createPendingApprovalFromExistingAsset(page, USERS.tenantAdmin, "queue-rejected");
    await openApprovalDetail(page, rejected.approvalId);
    await decideApproval(page, "REJECT", "Rejected for queue coverage");
    await expect(page.getByText("Approval sudah diputuskan. Status: REJECTED")).toBeVisible({
      timeout: 30_000,
    });

    await openApprovalsQueue(page, "REJECTED");
    await expectQueueRow(page, rejected.approvalId);
  });

  test("tenant admin can approve a pending lifecycle approval", async ({ page }) => {
    const approval = await createPendingApprovalFromExistingAsset(page, USERS.tenantAdmin, "approve-flow");

    await openApprovalDetail(page, approval.approvalId);
    await expect(page.getByText("Source workflow: LIFECYCLE_TRANSITION - ASSET")).toBeVisible();

    await decideApproval(page, "APPROVE");
    await expect(page.getByText("Approval sudah diputuskan. Status: APPROVED")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Decision note:/)).toHaveCount(0);
    await expect(page.locator("span.rounded-full", { hasText: "APPROVED" }).first()).toBeVisible();
  });

  test("tenant admin can reject a pending approval with a note", async ({ page }) => {
    const approval = await createPendingApprovalFromExistingAsset(page, USERS.tenantAdmin, "reject-note");

    await openApprovalDetail(page, approval.approvalId);
    const note = `Rejection note ${uniqueSuffix()}`;
    await decideApproval(page, "REJECT", note);

    await expect(page.getByText("Approval sudah diputuskan. Status: REJECTED")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(`Decision note: ${note}`)).toBeVisible();
  });

  test("auditor cannot decide approval", async ({ page }) => {
    const approval = await createPendingApprovalFromExistingAsset(page, USERS.tenantAdmin, "auditor-guard");

    await loginAs(page, USERS.auditor);
    await openApprovalDetail(page, approval.approvalId);

    await decideApproval(page, "APPROVE");
    await expect(page.getByText("Forbidden")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Approval sudah diputuskan")).toHaveCount(0);
  });

  test("approval detail shows workflow metadata and events", async ({ page }) => {
    const approval = await createPendingApprovalFromExistingAsset(page, USERS.tenantAdmin, "detail");

    await openApprovalDetail(page, approval.approvalId);
    await expect(page.getByText("Source workflow:")).toBeVisible();
    await expect(page.getByText(/Requested:/)).toBeVisible();
    await expect(page.getByText(/Requester:/)).toBeVisible();
    await expect(page.getByText("Transition", { exact: true })).toBeVisible();
    await expect(page.getByText("Approval events")).toBeVisible();
    await expect(page.getByText("CREATED", { exact: true })).toBeVisible();
  });

  test("search queue finds approvals by action code", async ({ page }) => {
    const approval = await createPendingApprovalFromExistingAsset(page, USERS.tenantAdmin, "search");

    await openApprovalsQueue(page, "PENDING");
    await page.getByPlaceholder("Search action/subject...").fill("LIFECYCLE_TRANSITION");
    await page.getByRole("button", { name: "Search" }).click();

    const row = page.locator("tbody tr").filter({ has: page.locator(`a[href*="/approvals/${approval.approvalId}"]`) }).first();
    await expect(row).toContainText("LIFECYCLE_TRANSITION");
    await expectQueueRow(page, approval.approvalId);
  });

  test("reject note is optional and can be stored when provided", async ({ page }) => {
    const approval = await createPendingApprovalFromExistingAsset(page, USERS.tenantAdmin, "reject-optional");

    await openApprovalDetail(page, approval.approvalId);
    await decideApproval(page, "REJECT");

    await expect(page.getByText("Approval sudah diputuskan. Status: REJECTED")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Decision note:/)).toHaveCount(0);
  });

  test("approved lifecycle approval applies the asset state", async ({ page }) => {
    const approval = await createPendingApprovalFromExistingAsset(page, USERS.tenantAdmin, "apply-sync");

    await openApprovalDetail(page, approval.approvalId);
    await decideApproval(page, "APPROVE");

    await expect(page.locator("span.rounded-full", { hasText: "APPROVED" }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("APPLY_RESULT")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("APPLIED")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("link", { name: "Open Asset" }).click();
    await expect(page.getByRole("link", { name: "Lifecycle" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("link", { name: "Lifecycle" }).click();
    await expect(page.getByText("Current state")).toBeVisible();
    await expect(page.locator("span.rounded-full", { hasText: "Diterima (RECEIVED)" }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("rejected lifecycle approval keeps the asset state unchanged", async ({ page }) => {
    const approval = await createPendingApprovalFromExistingAsset(page, USERS.tenantAdmin, "reject-sync");
    const beforeState = approval.assetStateBefore;

    await openApprovalDetail(page, approval.approvalId);
    await decideApproval(page, "REJECT", "Reject sync coverage");

    await expect(page.locator("span.rounded-full", { hasText: "REJECTED" }).first()).toBeVisible({ timeout: 30_000 });

    const afterState = await fetchAssetState(page, approval.assetId);
    expect(afterState).toBe(beforeState);
  });

  test("duplicate decisions are rejected after the approval becomes final", async ({ page }) => {
    const approval = await createPendingApprovalFromExistingAsset(page, USERS.tenantAdmin, "duplicate");

    await openApprovalDetail(page, approval.approvalId);
    await decideApproval(page, "APPROVE");
    await expect(page.getByText("Approval sudah diputuskan. Status: APPROVED")).toBeVisible({
      timeout: 30_000,
    });

    const duplicate = await directDecideApproval(page, approval.approvalId, "APPROVE");
    expect(duplicate.status).toBe(400);
    expect(String(duplicate.body?.error?.message ?? "")).toContain("already decided");
  });

  test("approval history remains readable after final decision", async ({ page }) => {
    const approval = await createPendingApprovalFromExistingAsset(page, USERS.tenantAdmin, "history");

    await openApprovalDetail(page, approval.approvalId);
    await decideApproval(page, "REJECT", "History note");

    await expect(page.getByText("Approval events")).toBeVisible();
    await expect(page.getByText("CREATED", { exact: true })).toBeVisible();
    await expect(page.getByText("DECIDED", { exact: true })).toBeVisible();
  });

  test("approval detail is tenant isolated", async ({ page }) => {
    const approval = await createPendingApprovalFromExistingAsset(page, USERS.tenantAdmin, "isolation");

    await loginAs(page, USERS.defaultAdmin);
    await page.goto(`/approvals/${approval.approvalId}`);

    await expect(
      page.getByText(/Approval not found|Approval detail tidak ditemukan|not ditemukan/i)
    ).toBeVisible({
      timeout: 20_000,
    });
  });
});
