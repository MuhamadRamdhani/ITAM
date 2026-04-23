import ExcelJS from "exceljs";
import { getUiConfig } from "../config/config.repo.js";
import {
  listAssetMapping,
  listAllAssetMappingExportByAsset,
  countAssetMapping,
  getAssetMappingSummary,
} from "./asset-mapping.repo.js";

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
  const status = normalizeString(req.query?.status);
  const lifecycleState = normalizeString(req.query?.lifecycle_state);
  const departmentId = mustPositiveInt(req.query?.department_id, "department_id");
  const locationId = mustPositiveInt(req.query?.location_id, "location_id");
  const ownerIdentityId = mustPositiveInt(
    req.query?.owner_identity_id,
    "owner_identity_id"
  );
  const vendorId = mustPositiveInt(req.query?.vendor_id, "vendor_id");
  const contractId = mustPositiveInt(req.query?.contract_id, "contract_id");
  const contractHealth = normalizeEnum(req.query?.contract_health);
  const coverageKind = normalizeEnum(req.query?.coverage_kind);
  const health = normalizeEnum(req.query?.health);
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
    status,
    lifecycleState,
    departmentId,
    locationId,
    ownerIdentityId,
    vendorId,
    contractId,
    contractHealth,
    coverageKind,
    health,
    linkStatus,
    expiringInDays,
  };
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
  if (filters.status) lines.push(`Status: ${filters.status}`);
  if (filters.lifecycleState)
    lines.push(`Lifecycle State: ${filters.lifecycleState}`);
  if (filters.departmentId != null) lines.push(`Department ID: ${filters.departmentId}`);
  if (filters.locationId != null) lines.push(`Location ID: ${filters.locationId}`);
  if (filters.ownerIdentityId != null)
    lines.push(`Owner Identity ID: ${filters.ownerIdentityId}`);
  if (filters.vendorId != null) lines.push(`Vendor ID: ${filters.vendorId}`);
  if (filters.contractId != null)
    lines.push(`Contract ID: ${filters.contractId}`);
  if (filters.contractHealth)
    lines.push(`Contract Health: ${filters.contractHealth}`);
  if (filters.coverageKind)
    lines.push(`Coverage Kind: ${filters.coverageKind}`);
  if (filters.health) lines.push(`Coverage Health: ${filters.health}`);
  if (filters.linkStatus) lines.push(`Link Status: ${filters.linkStatus}`);
  if (filters.expiringInDays != null)
    lines.push(`Expiring In Days: ${filters.expiringInDays}`);
  return lines.length ? lines.join(" | ") : "No filters";
}

function styleHeaderRow(row) {
  row.height = 26;
  row.eachCell((cell) => {
    cell.font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F766E" },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD1D5DB" } },
      left: { style: "thin", color: { argb: "FFD1D5DB" } },
      bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      right: { style: "thin", color: { argb: "FFD1D5DB" } },
    };
  });
}

function styleDataSheet(sheet) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };

  styleHeaderRow(sheet.getRow(1));

  const wrapColumns = new Set([
    "name",
    "asset_type_label",
    "state_label",
    "department_name",
    "location_name",
    "owner_identity_name",
    "owner_identity_email",
    "contract_codes_preview",
    "vendor_names_preview",
  ]);

  sheet.columns.forEach((col) => {
    const key = String(col.key || "");
    const isWrap = wrapColumns.has(key);
    col.alignment = {
      vertical: "middle",
      wrapText: isWrap,
    };
  });

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    row.height = 22;

    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });

    if (rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      });
    }
  });
}

function styleMetaSheet(sheet) {
  sheet.getRow(1).height = 24;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE2E8F0" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD1D5DB" } },
      left: { style: "thin", color: { argb: "FFD1D5DB" } },
      bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      right: { style: "thin", color: { argb: "FFD1D5DB" } },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
  });

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
      };
    });
  });
}

export async function listAssetMappingService(app, req) {
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
    listAssetMapping(app, {
      ...filters,
      limit: pageSize,
      offset,
    }),
    countAssetMapping(app, filters),
  ]);

  return {
    items,
    page,
    page_size: pageSize,
    total,
  };
}

export async function getAssetMappingSummaryService(app, req) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, [
    "TENANT_ADMIN",
    "ITAM_MANAGER",
    "PROCUREMENT_CONTRACT_MANAGER",
    "AUDITOR",
  ]);

  const filters = buildFilters(req, tenantId);
  return await getAssetMappingSummary(app, filters);
}

export async function exportAssetMappingXlsxService(app, req, reply) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, [
    "TENANT_ADMIN",
    "ITAM_MANAGER",
    "PROCUREMENT_CONTRACT_MANAGER",
    "AUDITOR",
  ]);

  const filters = buildFilters(req, tenantId);
  const rows = await listAllAssetMappingExportByAsset(app, filters);

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

  const sheet = workbook.addWorksheet("Asset Mapping");

  sheet.columns = [
    { header: "Asset ID", key: "asset_id", width: 12 },
    { header: "Asset Tag", key: "asset_tag", width: 20 },
    { header: "Name", key: "name", width: 30 },
    { header: "Status", key: "status", width: 16 },
    { header: "Asset Type Code", key: "asset_type_code", width: 18 },
    { header: "Asset Type Label", key: "asset_type_label", width: 24 },
    { header: "State Code", key: "state_code", width: 16 },
    { header: "State Label", key: "state_label", width: 20 },

    { header: "Department Code", key: "department_code", width: 18 },
    { header: "Department Name", key: "department_name", width: 24 },
    { header: "Location Code", key: "location_code", width: 18 },
    { header: "Location Name", key: "location_name", width: 24 },
    { header: "Owner Identity Name", key: "owner_identity_name", width: 24 },
    { header: "Owner Identity Email", key: "owner_identity_email", width: 28 },

    { header: "Warranty Start Date", key: "warranty_start_date", width: 16 },
    { header: "Warranty End Date", key: "warranty_end_date", width: 16 },
    { header: "Warranty Health", key: "warranty_health", width: 18 },
    { header: "Warranty Days To Expiry", key: "warranty_days_to_expiry", width: 22 },

    { header: "Support Start Date", key: "support_start_date", width: 16 },
    { header: "Support End Date", key: "support_end_date", width: 16 },
    { header: "Support Health", key: "support_health", width: 18 },
    { header: "Support Days To Expiry", key: "support_days_to_expiry", width: 22 },

    { header: "Subscription Start Date", key: "subscription_start_date", width: 18 },
    { header: "Subscription End Date", key: "subscription_end_date", width: 18 },
    { header: "Subscription Health", key: "subscription_health", width: 20 },
    { header: "Subscription Days To Expiry", key: "subscription_days_to_expiry", width: 24 },

    { header: "Has Linked Contract", key: "has_linked_contract", width: 18 },
    { header: "Linked Contracts Count", key: "linked_contracts_count", width: 20 },
    { header: "Linked Vendors Count", key: "linked_vendors_count", width: 18 },
    { header: "Contract Health Rollup", key: "contract_health_rollup", width: 22 },
    { header: "Contract Codes Preview", key: "contract_codes_preview", width: 36 },
    { header: "Vendor Names Preview", key: "vendor_names_preview", width: 36 },
  ];

  for (const row of rows) {
    sheet.addRow({
      asset_id: row.asset_id,
      asset_tag: row.asset_tag,
      name: row.name,
      status: safeCell(row.status),
      asset_type_code: safeCell(row.asset_type?.code),
      asset_type_label: safeCell(row.asset_type?.label),
      state_code: safeCell(row.state?.code),
      state_label: safeCell(row.state?.label),

      department_code: safeCell(row.department?.code),
      department_name: safeCell(row.department?.label),
      location_code: safeCell(row.location?.code),
      location_name: safeCell(row.location?.label),
      owner_identity_name: safeCell(row.owner_identity?.name),
      owner_identity_email: safeCell(row.owner_identity?.email),

      warranty_start_date: safeCell(row.warranty_start_date),
      warranty_end_date: safeCell(row.warranty_end_date),
      warranty_health: safeCell(row.warranty_health),
      warranty_days_to_expiry:
        row.warranty_days_to_expiry == null ? "" : row.warranty_days_to_expiry,

      support_start_date: safeCell(row.support_start_date),
      support_end_date: safeCell(row.support_end_date),
      support_health: safeCell(row.support_health),
      support_days_to_expiry:
        row.support_days_to_expiry == null ? "" : row.support_days_to_expiry,

      subscription_start_date: safeCell(row.subscription_start_date),
      subscription_end_date: safeCell(row.subscription_end_date),
      subscription_health: safeCell(row.subscription_health),
      subscription_days_to_expiry:
        row.subscription_days_to_expiry == null
          ? ""
          : row.subscription_days_to_expiry,

      has_linked_contract: yesNo(row.has_linked_contract),
      linked_contracts_count: row.linked_contracts_count ?? 0,
      linked_vendors_count: row.linked_vendors_count ?? 0,
      contract_health_rollup: safeCell(row.contract_health_rollup),
      contract_codes_preview: joinPreview(row.contract_codes_preview),
      vendor_names_preview: joinPreview(row.vendor_names_preview),
    });
  }

  styleDataSheet(sheet);

  const meta = workbook.addWorksheet("Meta");
  meta.columns = [
    { header: "Key", key: "key", width: 24 },
    { header: "Value", key: "value", width: 80 },
  ];

  meta.addRow({ key: "Report", value: "Asset Mapping Report" });
  meta.addRow({ key: "Generated At", value: new Date().toISOString() });
  meta.addRow({ key: "Tenant ID", value: String(tenantId) });
  meta.addRow({ key: "Applied Filters", value: buildFilterSummary(filters) });
  meta.addRow({ key: "Total Rows", value: String(rows.length) });
  meta.addRow({ key: "Ordering", value: "asset_id ASC" });
  meta.addRow({ key: "Export Shape", value: "1 asset_id = 1 row" });

  styleMetaSheet(meta);

  const buffer = await workbook.xlsx.writeBuffer();
  const fileDate = new Date().toISOString().slice(0, 10);
  const fileName = `asset-mapping-report-${fileDate}.xlsx`;

  reply.header(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  reply.header("Content-Disposition", `attachment; filename="${fileName}"`);

  return reply.send(Buffer.from(buffer));
}