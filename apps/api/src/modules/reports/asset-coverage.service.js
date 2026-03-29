import ExcelJS from "exceljs";
import { getUiConfig } from "../config/config.repo.js";
import {
  listAssetCoverage,
  listAllAssetCoverage,
  countAssetCoverage,
  getAssetCoverageSummary,
} from "./asset-coverage.repo.js";

const COVERAGE_KINDS = new Set(["WARRANTY", "SUPPORT", "SUBSCRIPTION", "NONE"]);
const COVERAGE_HEALTHS = new Set([
  "ACTIVE",
  "EXPIRING",
  "EXPIRED",
  "NO_COVERAGE",
  "NO_END_DATE",
]);
const CONTRACT_HEALTHS = new Set([
  "ACTIVE",
  "EXPIRING",
  "EXPIRED",
  "NO_END_DATE",
]);
const LINK_STATUSES = new Set(["LINKED", "NO_LINK"]);

const EXPORT_MAX_ROWS = 10000;

function httpError(
  statusCode,
  message,
  code = "BAD_REQUEST",
  details = undefined
) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.details = details;
  return err;
}

function mustTenantId(req) {
  const tenantId = req?.tenantId ?? req?.requestContext?.tenantId ?? null;
  if (!tenantId) {
    throw httpError(401, "Unauthorized tenant context", "AUTH_UNAUTHORIZED");
  }
  return Number(tenantId);
}

function mustHaveAnyRole(req, allowed) {
  const raw = Array.isArray(req.requestContext?.roles)
    ? req.requestContext.roles
    : [];
  const roles = raw
    .map((x) => {
      if (typeof x === "string") return x;
      if (x && typeof x === "object") {
        return x.code ?? x.role_code ?? x.roleCode ?? "";
      }
      return "";
    })
    .map((x) => String(x || "").trim().toUpperCase())
    .filter(Boolean);

  const ok = allowed.some((r) => roles.includes(r));
  if (!ok) {
    throw httpError(403, "Forbidden", "FORBIDDEN", {
      required_any: allowed,
      got: roles,
    });
  }
}

function normalizeString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function normalizeEnum(value) {
  const s = normalizeString(value);
  return s ? s.toUpperCase() : null;
}

function mustPositiveInt(value, fieldName) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw httpError(
      400,
      `${fieldName} must be a positive integer`,
      "BAD_REQUEST"
    );
  }
  return n;
}

async function resolvePageSizeStrict(app, tenantId, requested) {
  const cfg = await getUiConfig(app, tenantId);
  const options = Array.isArray(cfg.page_size_options)
    ? cfg.page_size_options
    : [];
  const def = Number(cfg.documents_page_size_default);

  if (requested == null) return def;

  const n = Number(requested);
  if (!Number.isFinite(n) || n <= 0) {
    throw httpError(400, "Invalid page_size", "INVALID_PAGE_SIZE", {
      got: requested,
    });
  }
  if (!options.includes(n)) {
    throw httpError(
      400,
      `page_size must be one of: ${options.join(", ")}`,
      "INVALID_PAGE_SIZE",
      { allowed: options, got: n }
    );
  }
  return n;
}

function buildFilters(req, tenantId) {
  const q = normalizeString(req.query?.q);
  const typeCode = normalizeString(req.query?.type_code);
  const coverageKind = normalizeEnum(req.query?.coverage_kind);
  const health = normalizeEnum(req.query?.health);
  const vendorId = mustPositiveInt(req.query?.vendor_id, "vendor_id");
  const contractId = mustPositiveInt(req.query?.contract_id, "contract_id");
  const contractHealth = normalizeEnum(req.query?.contract_health);
  const linkStatus = normalizeEnum(req.query?.link_status);
  const expiringInDays = mustPositiveInt(
    req.query?.expiring_in_days,
    "expiring_in_days"
  );

  if (coverageKind && !COVERAGE_KINDS.has(coverageKind)) {
    throw httpError(400, "Invalid coverage_kind", "BAD_REQUEST");
  }

  if (health && !COVERAGE_HEALTHS.has(health)) {
    throw httpError(400, "Invalid health", "BAD_REQUEST");
  }

  if (contractHealth && !CONTRACT_HEALTHS.has(contractHealth)) {
    throw httpError(400, "Invalid contract_health", "BAD_REQUEST");
  }

  if (linkStatus && !LINK_STATUSES.has(linkStatus)) {
    throw httpError(400, "Invalid link_status", "BAD_REQUEST");
  }

  return {
    tenantId,
    q,
    typeCode,
    coverageKind,
    health,
    vendorId,
    contractId,
    contractHealth,
    linkStatus,
    expiringInDays,
  };
}

function coverageKindLabel(value) {
  if (value === "WARRANTY") return "Warranty";
  if (value === "SUPPORT") return "Support";
  if (value === "SUBSCRIPTION") return "Subscription";
  if (value === "NONE") return "No Coverage";
  return value || "";
}

function safeCell(value) {
  return value == null ? "" : value;
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

function joinPreview(values) {
  if (!Array.isArray(values) || values.length === 0) return "";
  return values.join(", ");
}

function buildFilterSummary(filters) {
  const lines = [];
  if (filters.q) lines.push(`Search: ${filters.q}`);
  if (filters.typeCode) lines.push(`Asset Type: ${filters.typeCode}`);
  if (filters.coverageKind)
    lines.push(`Coverage Kind: ${filters.coverageKind}`);
  if (filters.health) lines.push(`Coverage Health: ${filters.health}`);
  if (filters.vendorId != null) lines.push(`Vendor ID: ${filters.vendorId}`);
  if (filters.contractId != null)
    lines.push(`Contract ID: ${filters.contractId}`);
  if (filters.contractHealth)
    lines.push(`Contract Health: ${filters.contractHealth}`);
  if (filters.linkStatus) lines.push(`Link Status: ${filters.linkStatus}`);
  if (filters.expiringInDays != null)
    lines.push(`Expiring In Days: ${filters.expiringInDays}`);
  return lines.length ? lines.join(" | ") : "No filters";
}

export async function listAssetCoverageService(app, req) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, [
    "TENANT_ADMIN",
    "ITAM_MANAGER",
    "PROCUREMENT_CONTRACT_MANAGER",
    "AUDITOR",
  ]);

  const page = Math.max(Number(req.query?.page ?? 1), 1);
  const pageSize = await resolvePageSizeStrict(app, tenantId, req.query?.page_size);
  const offset = (page - 1) * pageSize;

  const filters = buildFilters(req, tenantId);

  const [items, total] = await Promise.all([
    listAssetCoverage(app, {
      ...filters,
      limit: pageSize,
      offset,
    }),
    countAssetCoverage(app, filters),
  ]);

  return {
    items,
    page,
    page_size: pageSize,
    total,
  };
}

export async function getAssetCoverageSummaryService(app, req) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, [
    "TENANT_ADMIN",
    "ITAM_MANAGER",
    "PROCUREMENT_CONTRACT_MANAGER",
    "AUDITOR",
  ]);

  const filters = buildFilters(req, tenantId);
  return await getAssetCoverageSummary(app, filters);
}

export async function exportAssetCoverageXlsxService(app, req, reply) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, [
    "TENANT_ADMIN",
    "ITAM_MANAGER",
    "PROCUREMENT_CONTRACT_MANAGER",
    "AUDITOR",
  ]);

  const filters = buildFilters(req, tenantId);
  const rows = await listAllAssetCoverage(app, filters);

  if (rows.length > EXPORT_MAX_ROWS) {
    throw httpError(
      400,
      `Export row limit exceeded. Maximum ${EXPORT_MAX_ROWS} rows per export.`,
      "EXPORT_LIMIT_EXCEEDED",
      { max_rows: EXPORT_MAX_ROWS, got: rows.length }
    );
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ITAM SaaS";
  workbook.lastModifiedBy = "ITAM SaaS";
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet("Asset Coverage");

  sheet.columns = [
    { header: "Asset ID", key: "asset_id", width: 12 },
    { header: "Asset Tag", key: "asset_tag", width: 20 },
    { header: "Name", key: "name", width: 28 },
    { header: "Asset Type Code", key: "asset_type_code", width: 18 },
    { header: "Asset Type Label", key: "asset_type_label", width: 24 },
    { header: "State Code", key: "state_code", width: 16 },
    { header: "State Label", key: "state_label", width: 20 },
    { header: "Status", key: "status", width: 16 },
    { header: "Coverage Kind", key: "coverage_kind", width: 18 },
    { header: "Start Date", key: "start_date", width: 14 },
    { header: "End Date", key: "end_date", width: 14 },
    { header: "Coverage Health", key: "coverage_health", width: 18 },
    { header: "Days To Expiry", key: "days_to_expiry", width: 16 },

    { header: "Has Linked Contract", key: "has_linked_contract", width: 18 },
    { header: "Linked Contracts Count", key: "linked_contracts_count", width: 20 },
    { header: "Linked Vendors Count", key: "linked_vendors_count", width: 18 },
    { header: "Contract Health Rollup", key: "contract_health_rollup", width: 22 },
    { header: "Has Active Contract", key: "has_active_contract", width: 18 },
    { header: "Has Expiring Contract", key: "has_expiring_contract", width: 20 },
    { header: "Has Expired Contract", key: "has_expired_contract", width: 18 },
    { header: "Has No End Date Contract", key: "has_no_end_date_contract", width: 24 },
    { header: "Contract Codes Preview", key: "contract_codes_preview", width: 36 },
    { header: "Vendor Names Preview", key: "vendor_names_preview", width: 36 },
  ];

  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      asset_id: row.asset_id,
      asset_tag: row.asset_tag,
      name: row.name,
      asset_type_code: safeCell(row.asset_type?.code),
      asset_type_label: safeCell(row.asset_type?.label),
      state_code: safeCell(row.state?.code),
      state_label: safeCell(row.state?.label),
      status: safeCell(row.status),
      coverage_kind: coverageKindLabel(row.coverage_kind),
      start_date: safeCell(row.start_date),
      end_date: safeCell(row.end_date),
      coverage_health: safeCell(row.coverage_health),
      days_to_expiry: row.days_to_expiry == null ? "" : row.days_to_expiry,

      has_linked_contract: yesNo(row.has_linked_contract),
      linked_contracts_count: row.linked_contracts_count ?? 0,
      linked_vendors_count: row.linked_vendors_count ?? 0,
      contract_health_rollup: safeCell(row.contract_health_rollup),
      has_active_contract: yesNo(row.has_active_contract),
      has_expiring_contract: yesNo(row.has_expiring_contract),
      has_expired_contract: yesNo(row.has_expired_contract),
      has_no_end_date_contract: yesNo(row.has_no_end_date_contract),
      contract_codes_preview: joinPreview(row.contract_codes_preview),
      vendor_names_preview: joinPreview(row.vendor_names_preview),
    });
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };

  const meta = workbook.addWorksheet("Meta");
  meta.columns = [
    { header: "Key", key: "key", width: 24 },
    { header: "Value", key: "value", width: 80 },
  ];
  meta.getRow(1).font = { bold: true };

  meta.addRow({ key: "Report", value: "Asset Coverage Report" });
  meta.addRow({ key: "Generated At", value: new Date().toISOString() });
  meta.addRow({ key: "Tenant ID", value: String(tenantId) });
  meta.addRow({ key: "Applied Filters", value: buildFilterSummary(filters) });
  meta.addRow({ key: "Total Rows", value: String(rows.length) });

  const buffer = await workbook.xlsx.writeBuffer();
  const fileDate = new Date().toISOString().slice(0, 10);
  const fileName = `asset-coverage-report-${fileDate}.xlsx`;

  reply.header(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  reply.header("Content-Disposition", `attachment; filename="${fileName}"`);

  return reply.send(Buffer.from(buffer));
}