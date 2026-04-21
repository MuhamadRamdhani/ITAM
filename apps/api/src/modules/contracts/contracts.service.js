import {
  countContracts,
  findContractByCode,
  getContractById,
  getIdentityByIdForTenant,
  getVendorByIdForTenant,
  insertContract,
  listContracts,
  updateContract,
} from "./contracts.repo.js";

import { listSoftwareEntitlementsByContract } from "../software-entitlements/software-entitlements.repo.js";
import { getActiveAllocatedQuantitiesByEntitlementIds } from "../software-entitlement-allocations/software-entitlement-allocations.repo.js";
import { countActiveInstallationsBySoftwareProductIds } from "../software-installations/software-installations.repo.js";
import { countActiveAssignmentsBySoftwareProductIds } from "../software-assignments/software-assignments.repo.js";

const CONTRACT_TYPES = new Set([
  "SOFTWARE",
  "HARDWARE",
  "SERVICE",
  "CLOUD",
  "MAINTENANCE",
  "OTHER",
]);

const CONTRACT_STATUSES = new Set([
  "DRAFT",
  "ACTIVE",
  "EXPIRED",
  "TERMINATED",
]);

const CONTRACT_HEALTHS = new Set([
  "NO_END_DATE",
  "ACTIVE",
  "EXPIRING",
  "EXPIRED",
]);

const CONTRACT_WRITE_ROLES = [
  "SUPERADMIN",
  "TENANT_ADMIN",
  "ITAM_MANAGER",
  "PROCUREMENT_CONTRACT_MANAGER",
];

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function mustTenantId(req) {
  const tenantId = req?.tenantId ?? req?.requestContext?.tenantId ?? null;
  if (!tenantId) throw httpError(401, "Unauthorized tenant context");
  return Number(tenantId);
}

function mustPositiveInt(value, fieldName) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw httpError(400, `${fieldName} must be a positive integer`);
  }
  return n;
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

function normalizeRoles(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((role) => String(role ?? "").trim().toUpperCase())
    .filter(Boolean);
}

function mustHaveAnyRole(req, allowedRoles) {
  const raw = Array.isArray(req?.requestContext?.roles) ? req.requestContext.roles : [];
  const roles = normalizeRoles(raw);
  const ok = allowedRoles.some((role) => roles.includes(role));
  if (!ok) {
    const err = httpError(403, "Forbidden");
    err.code = "FORBIDDEN";
    err.details = { required_any: allowedRoles, got: roles };
    throw err;
  }
}

function normalizeDate(value) {
  const s = normalizeString(value);
  return s || null;
}

function validateDates(startDate, endDate) {
  if (startDate && Number.isNaN(Date.parse(startDate))) {
    throw httpError(400, "Invalid start_date");
  }
  if (endDate && Number.isNaN(Date.parse(endDate))) {
    throw httpError(400, "Invalid end_date");
  }
  if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
    throw httpError(400, "end_date cannot be earlier than start_date");
  }
}

function normalizeRenewalNoticeDays(value, defaultValue = 30) {
  if (value == null || value === "") return defaultValue;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw httpError(400, "renewal_notice_days must be a non-negative integer");
  }
  return n;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function isEntitlementExpired(entitlement, today = todayIsoDate()) {
  const status = normalizeEnum(entitlement?.status);
  if (status === "EXPIRED") return true;

  const endDate = normalizeDate(entitlement?.end_date);
  return Boolean(endDate && endDate < today);
}

function deriveComplianceRiskStatus({
  entitlementStatus,
  quantityPurchased,
  allocatedActive,
  isExpired,
}) {
  const normalizedStatus = normalizeEnum(entitlementStatus);

  if (normalizedStatus === "INACTIVE") {
    return "INACTIVE_ENTITLEMENT";
  }

  if (normalizedStatus === "EXPIRED" || isExpired) {
    return "EXPIRED_ENTITLEMENT";
  }

  if (allocatedActive > quantityPurchased) {
    return "OVER_ALLOCATED";
  }

  if (allocatedActive === quantityPurchased) {
    return "FULLY_ALLOCATED";
  }

  return "OK";
}

function deriveConsumptionBasis(licensingMetric) {
  const metric = normalizeEnum(licensingMetric);

  if (
    metric === "PER_USER" ||
    metric === "PER_NAMED_USER" ||
    metric === "PER_CONCURRENT_USER"
  ) {
    return "ASSIGNMENT";
  }

  return "INSTALLATION";
}

function deriveConsumptionStatus({
  entitlementStatus,
  isExpired,
  quantityPurchased,
  consumedQuantityUsage,
}) {
  const normalizedStatus = normalizeEnum(entitlementStatus);

  if (normalizedStatus === "INACTIVE") {
    return "INACTIVE_ENTITLEMENT";
  }

  if (normalizedStatus === "EXPIRED" || isExpired) {
    return "EXPIRED_ENTITLEMENT";
  }

  if (consumedQuantityUsage === 0) {
    return "NO_ACTIVITY";
  }

  if (consumedQuantityUsage < quantityPurchased) {
    return "UNDER_CONSUMED";
  }

  if (consumedQuantityUsage === quantityPurchased) {
    return "BALANCED";
  }

  return "POTENTIAL_OVERUSE";
}

function deriveOptimizationStatus({
  entitlementStatus,
  isExpired,
  allocatedActive,
  consumedQuantityUsage,
}) {
  const normalizedStatus = normalizeEnum(entitlementStatus);

  if (normalizedStatus === "INACTIVE") {
    return "INACTIVE_ENTITLEMENT";
  }

  if (normalizedStatus === "EXPIRED" || isExpired) {
    return "EXPIRED_ENTITLEMENT";
  }

  if (consumedQuantityUsage > allocatedActive) {
    return "USAGE_GT_ALLOCATION";
  }

  if (allocatedActive > consumedQuantityUsage) {
    return "RECLAIM_OPPORTUNITY";
  }

  return "OPTIMIZED";
}

function toDateOnly(value) {
  const s = normalizeDate(value);
  return s ? s.slice(0, 10) : null;
}

function calculateDaysToExpiry(endDate, today = todayIsoDate()) {
  const end = toDateOnly(endDate);
  if (!end) return null;

  const todayMs = Date.parse(`${today}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);

  if (Number.isNaN(todayMs) || Number.isNaN(endMs)) {
    return null;
  }

  return Math.floor((endMs - todayMs) / 86400000);
}

function deriveRenewalStatus({
  entitlementStatus,
  isExpired,
  endDate,
  daysToExpiry,
  renewalNoticeDays,
}) {
  const normalizedStatus = normalizeEnum(entitlementStatus);

  if (normalizedStatus === "INACTIVE") {
    return "INACTIVE_ENTITLEMENT";
  }

  if (normalizedStatus === "EXPIRED" || isExpired) {
    return "EXPIRED_ENTITLEMENT";
  }

  if (!toDateOnly(endDate)) {
    return "NO_END_DATE";
  }

  if (
    Number.isInteger(daysToExpiry) &&
    daysToExpiry >= 0 &&
    daysToExpiry <= Number(renewalNoticeDays ?? 30)
  ) {
    return "EXPIRING_SOON";
  }

  return "ACTIVE";
}

function createEmptyComplianceStatusCounts() {
  return {
    OK: 0,
    FULLY_ALLOCATED: 0,
    OVER_ALLOCATED: 0,
    INACTIVE_ENTITLEMENT: 0,
    EXPIRED_ENTITLEMENT: 0,
  };
}

function createEmptyConsumptionStatusCounts() {
  return {
    NO_ACTIVITY: 0,
    UNDER_CONSUMED: 0,
    BALANCED: 0,
    POTENTIAL_OVERUSE: 0,
    INACTIVE_ENTITLEMENT: 0,
    EXPIRED_ENTITLEMENT: 0,
  };
}

function createEmptyOptimizationStatusCounts() {
  return {
    OPTIMIZED: 0,
    RECLAIM_OPPORTUNITY: 0,
    USAGE_GT_ALLOCATION: 0,
    INACTIVE_ENTITLEMENT: 0,
    EXPIRED_ENTITLEMENT: 0,
  };
}

function createEmptyRenewalStatusCounts() {
  return {
    ACTIVE: 0,
    EXPIRING_SOON: 0,
    NO_END_DATE: 0,
    INACTIVE_ENTITLEMENT: 0,
    EXPIRED_ENTITLEMENT: 0,
  };
}

async function writeContractAudit(app, req, action, entity) {
  const payload = {
    tenant_id: req?.tenantId ?? req?.requestContext?.tenantId ?? null,
    user_id: req?.requestContext?.userId ?? null,
    entity_type: "CONTRACT",
    entity_id: entity?.id ?? null,
    action,
    payload: {
      contract_id: entity?.id ?? null,
      contract_code: entity?.contract_code ?? null,
      contract_name: entity?.contract_name ?? null,
      vendor_id: entity?.vendor_id ?? null,
      status: entity?.status ?? null,
      contract_type: entity?.contract_type ?? null,
    },
  };

  try {
    if (app?.audit?.logEvent) {
      await app.audit.logEvent(payload);
      return;
    }
    if (typeof app?.logAuditEvent === "function") {
      await app.logAuditEvent(payload);
      return;
    }
    if (typeof app?.createAuditEvent === "function") {
      await app.createAuditEvent(payload);
      return;
    }
  } catch (err) {
    app.log?.warn?.({ err }, "contracts audit logging skipped");
  }
}

export async function listContractsService(app, req) {
  const tenantId = mustTenantId(req);

  const page = Math.max(1, Number(req.query?.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query?.page_size || 20)));
  const offset = (page - 1) * pageSize;

  const search = normalizeString(req.query?.search);
  const status = normalizeEnum(req.query?.status);
  const contractType = normalizeEnum(req.query?.contract_type);
  const health = normalizeEnum(req.query?.health);
  const vendorId =
    req.query?.vendor_id != null && req.query?.vendor_id !== ""
      ? mustPositiveInt(req.query.vendor_id, "vendor_id")
      : null;

  if (status && !CONTRACT_STATUSES.has(status)) {
    throw httpError(400, "Invalid status");
  }
  if (contractType && !CONTRACT_TYPES.has(contractType)) {
    throw httpError(400, "Invalid contract_type");
  }
  if (health && !CONTRACT_HEALTHS.has(health)) {
    throw httpError(400, "Invalid health");
  }

  const filters = {
    tenantId,
    search,
    status,
    contractType,
    health,
    vendorId,
    limit: pageSize,
    offset,
  };

  const [rows, total] = await Promise.all([
    listContracts(app, filters),
    countContracts(app, filters),
  ]);

  return {
    rows,
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export async function getContractDetailService(app, req) {
  const tenantId = mustTenantId(req);
  const contractId = mustPositiveInt(req.params?.id, "contract id");

  const row = await getContractById(app, tenantId, contractId);
  if (!row) throw httpError(404, "Contract not found");

  return row;
}

export async function getContractSoftwareComplianceSummaryService(app, req) {
  const tenantId = mustTenantId(req);
  const contractId = mustPositiveInt(req.params?.id, "contract id");

  const contract = await getContractById(app, tenantId, contractId);
  if (!contract) {
    throw httpError(404, "Contract not found");
  }

  const entitlements = await listSoftwareEntitlementsByContract(app, tenantId, contractId);

  if (entitlements.length === 0) {
    return {
      contract: {
        id: Number(contract.id),
        contract_code: contract.contract_code,
        contract_name: contract.contract_name,
        contract_type: contract.contract_type,
        status: contract.status,
        vendor_id: contract.vendor_id == null ? null : Number(contract.vendor_id),
        vendor_code: contract.vendor_code ?? null,
        vendor_name: contract.vendor_name ?? null,
      },
      totals: {
        entitlements_count: 0,
        quantity_purchased: 0,
        allocated_active: 0,
        remaining_quantity: 0,
        status_counts: createEmptyComplianceStatusCounts(),
      },
      items: [],
      total: 0,
    };
  }

  const entitlementIds = [
    ...new Set(
      entitlements
        .map((item) => Number(item.id))
        .filter((value) => Number.isInteger(value) && value > 0)
    ),
  ];

  const softwareProductIds = [
    ...new Set(
      entitlements
        .map((item) => Number(item.software_product_id))
        .filter((value) => Number.isInteger(value) && value > 0)
    ),
  ];

  const [
    allocatedByEntitlementId,
    installationsBySoftwareProductId,
    assignmentsBySoftwareProductId,
  ] = await Promise.all([
    getActiveAllocatedQuantitiesByEntitlementIds(app, tenantId, entitlementIds),
    countActiveInstallationsBySoftwareProductIds(app, tenantId, softwareProductIds),
    countActiveAssignmentsBySoftwareProductIds(app, tenantId, softwareProductIds),
  ]);

  const statusCounts = createEmptyComplianceStatusCounts();

  const items = entitlements.map((entitlement) => {
    const entitlementId = Number(entitlement.id);
    const softwareProductId = Number(entitlement.software_product_id);
    const quantityPurchased = Number(entitlement.quantity_purchased ?? 0);
    const allocatedActive = Number(allocatedByEntitlementId.get(entitlementId) ?? 0);
    const remainingQuantity = quantityPurchased - allocatedActive;
    const activeInstallationCount = Number(
      installationsBySoftwareProductId.get(softwareProductId) ?? 0
    );
    const activeAssignmentCount = Number(
      assignmentsBySoftwareProductId.get(softwareProductId) ?? 0
    );
    const expired = isEntitlementExpired(entitlement);

    const riskStatus = deriveComplianceRiskStatus({
      entitlementStatus: entitlement.status,
      quantityPurchased,
      allocatedActive,
      isExpired: expired,
    });

    statusCounts[riskStatus] = Number(statusCounts[riskStatus] ?? 0) + 1;

    return {
      entitlement_id: entitlementId,
      contract_id: Number(entitlement.contract_id),
      entitlement_code: entitlement.entitlement_code,
      entitlement_name: entitlement.entitlement_name,
      entitlement_status: entitlement.status,
      software_product_id: softwareProductId,
      software_product_code: entitlement.software_product_code,
      software_product_name: entitlement.software_product_name,
      licensing_metric: entitlement.licensing_metric,
      quantity_purchased: quantityPurchased,
      allocated_active: allocatedActive,
      remaining_quantity: remainingQuantity,
      active_installation_count: activeInstallationCount,
      active_assignment_count: activeAssignmentCount,
      risk_status: riskStatus,
      is_entitlement_active: normalizeEnum(entitlement.status) === "ACTIVE",
      is_entitlement_expired: expired,
      start_date: entitlement.start_date,
      end_date: entitlement.end_date,
    };
  });

  const totals = items.reduce(
    (acc, item) => {
      acc.entitlements_count += 1;
      acc.quantity_purchased += Number(item.quantity_purchased ?? 0);
      acc.allocated_active += Number(item.allocated_active ?? 0);
      acc.remaining_quantity += Number(item.remaining_quantity ?? 0);
      return acc;
    },
    {
      entitlements_count: 0,
      quantity_purchased: 0,
      allocated_active: 0,
      remaining_quantity: 0,
    }
  );

  return {
    contract: {
      id: Number(contract.id),
      contract_code: contract.contract_code,
      contract_name: contract.contract_name,
      contract_type: contract.contract_type,
      status: contract.status,
      vendor_id: contract.vendor_id == null ? null : Number(contract.vendor_id),
      vendor_code: contract.vendor_code ?? null,
      vendor_name: contract.vendor_name ?? null,
    },
    totals: {
      ...totals,
      status_counts: statusCounts,
    },
    items,
    total: items.length,
  };
}

export async function getContractSoftwareConsumptionSummaryService(app, req) {
  const tenantId = mustTenantId(req);
  const contractId = mustPositiveInt(req.params?.id, "contract id");

  const contract = await getContractById(app, tenantId, contractId);
  if (!contract) {
    throw httpError(404, "Contract not found");
  }

  const entitlements = await listSoftwareEntitlementsByContract(app, tenantId, contractId);

  if (entitlements.length === 0) {
    return {
      contract: {
        id: Number(contract.id),
        contract_code: contract.contract_code,
        contract_name: contract.contract_name,
        contract_type: contract.contract_type,
        status: contract.status,
        vendor_id: contract.vendor_id == null ? null : Number(contract.vendor_id),
        vendor_code: contract.vendor_code ?? null,
        vendor_name: contract.vendor_name ?? null,
      },
      totals: {
        entitlements_count: 0,
        quantity_purchased: 0,
        allocated_active: 0,
        consumed_quantity_usage: 0,
        elp_by_allocation: 0,
        elp_by_usage: 0,
        status_counts: createEmptyConsumptionStatusCounts(),
      },
      items: [],
      total: 0,
    };
  }

  const entitlementIds = [
    ...new Set(
      entitlements
        .map((item) => Number(item.id))
        .filter((value) => Number.isInteger(value) && value > 0)
    ),
  ];

  const softwareProductIds = [
    ...new Set(
      entitlements
        .map((item) => Number(item.software_product_id))
        .filter((value) => Number.isInteger(value) && value > 0)
    ),
  ];

  const [
    allocatedByEntitlementId,
    installationsBySoftwareProductId,
    assignmentsBySoftwareProductId,
  ] = await Promise.all([
    getActiveAllocatedQuantitiesByEntitlementIds(app, tenantId, entitlementIds),
    countActiveInstallationsBySoftwareProductIds(app, tenantId, softwareProductIds),
    countActiveAssignmentsBySoftwareProductIds(app, tenantId, softwareProductIds),
  ]);

  const statusCounts = createEmptyConsumptionStatusCounts();

  const items = entitlements.map((entitlement) => {
    const entitlementId = Number(entitlement.id);
    const softwareProductId = Number(entitlement.software_product_id);
    const quantityPurchased = Number(entitlement.quantity_purchased ?? 0);
    const allocatedActive = Number(allocatedByEntitlementId.get(entitlementId) ?? 0);
    const activeInstallationCount = Number(
      installationsBySoftwareProductId.get(softwareProductId) ?? 0
    );
    const activeAssignmentCount = Number(
      assignmentsBySoftwareProductId.get(softwareProductId) ?? 0
    );

    const consumptionBasis = deriveConsumptionBasis(entitlement.licensing_metric);
    const consumedQuantityUsage =
      consumptionBasis === "ASSIGNMENT"
        ? activeAssignmentCount
        : activeInstallationCount;

    const elpByAllocation = quantityPurchased - allocatedActive;
    const elpByUsage = quantityPurchased - consumedQuantityUsage;
    const allocationUsageVariance = consumedQuantityUsage - allocatedActive;
    const expired = isEntitlementExpired(entitlement);

    const consumptionStatus = deriveConsumptionStatus({
      entitlementStatus: entitlement.status,
      isExpired: expired,
      quantityPurchased,
      consumedQuantityUsage,
    });

    statusCounts[consumptionStatus] =
      Number(statusCounts[consumptionStatus] ?? 0) + 1;

    return {
      entitlement_id: entitlementId,
      contract_id: Number(entitlement.contract_id),
      entitlement_code: entitlement.entitlement_code,
      entitlement_name: entitlement.entitlement_name,
      entitlement_status: entitlement.status,
      software_product_id: softwareProductId,
      software_product_code: entitlement.software_product_code,
      software_product_name: entitlement.software_product_name,
      licensing_metric: entitlement.licensing_metric,
      quantity_purchased: quantityPurchased,
      allocated_active: allocatedActive,
      active_installation_count: activeInstallationCount,
      active_assignment_count: activeAssignmentCount,
      consumption_basis: consumptionBasis,
      consumed_quantity_usage: consumedQuantityUsage,
      elp_by_allocation: elpByAllocation,
      elp_by_usage: elpByUsage,
      allocation_usage_variance: allocationUsageVariance,
      consumption_status: consumptionStatus,
      is_entitlement_active: normalizeEnum(entitlement.status) === "ACTIVE",
      is_entitlement_expired: expired,
      start_date: entitlement.start_date,
      end_date: entitlement.end_date,
    };
  });

  const totals = items.reduce(
    (acc, item) => {
      acc.entitlements_count += 1;
      acc.quantity_purchased += Number(item.quantity_purchased ?? 0);
      acc.allocated_active += Number(item.allocated_active ?? 0);
      acc.consumed_quantity_usage += Number(item.consumed_quantity_usage ?? 0);
      acc.elp_by_allocation += Number(item.elp_by_allocation ?? 0);
      acc.elp_by_usage += Number(item.elp_by_usage ?? 0);
      return acc;
    },
    {
      entitlements_count: 0,
      quantity_purchased: 0,
      allocated_active: 0,
      consumed_quantity_usage: 0,
      elp_by_allocation: 0,
      elp_by_usage: 0,
    }
  );

  return {
    contract: {
      id: Number(contract.id),
      contract_code: contract.contract_code,
      contract_name: contract.contract_name,
      contract_type: contract.contract_type,
      status: contract.status,
      vendor_id: contract.vendor_id == null ? null : Number(contract.vendor_id),
      vendor_code: contract.vendor_code ?? null,
      vendor_name: contract.vendor_name ?? null,
    },
    totals: {
      ...totals,
      status_counts: statusCounts,
    },
    items,
    total: items.length,
  };
}

export async function getContractSoftwareOptimizationSummaryService(app, req) {
  const tenantId = mustTenantId(req);
  const contractId = mustPositiveInt(req.params?.id, "contract id");

  const contract = await getContractById(app, tenantId, contractId);
  if (!contract) {
    throw httpError(404, "Contract not found");
  }

  const entitlements = await listSoftwareEntitlementsByContract(app, tenantId, contractId);

  if (entitlements.length === 0) {
    return {
      contract: {
        id: Number(contract.id),
        contract_code: contract.contract_code,
        contract_name: contract.contract_name,
        contract_type: contract.contract_type,
        status: contract.status,
        vendor_id: contract.vendor_id == null ? null : Number(contract.vendor_id),
        vendor_code: contract.vendor_code ?? null,
        vendor_name: contract.vendor_name ?? null,
      },
      totals: {
        entitlements_count: 0,
        quantity_purchased: 0,
        allocated_active: 0,
        consumed_quantity_usage: 0,
        unused_allocated_quantity: 0,
        reclaim_candidate_count: 0,
        status_counts: createEmptyOptimizationStatusCounts(),
      },
      items: [],
      total: 0,
    };
  }

  const entitlementIds = [
    ...new Set(
      entitlements
        .map((item) => Number(item.id))
        .filter((value) => Number.isInteger(value) && value > 0)
    ),
  ];

  const softwareProductIds = [
    ...new Set(
      entitlements
        .map((item) => Number(item.software_product_id))
        .filter((value) => Number.isInteger(value) && value > 0)
    ),
  ];

  const [
    allocatedByEntitlementId,
    installationsBySoftwareProductId,
    assignmentsBySoftwareProductId,
  ] = await Promise.all([
    getActiveAllocatedQuantitiesByEntitlementIds(app, tenantId, entitlementIds),
    countActiveInstallationsBySoftwareProductIds(app, tenantId, softwareProductIds),
    countActiveAssignmentsBySoftwareProductIds(app, tenantId, softwareProductIds),
  ]);

  const statusCounts = createEmptyOptimizationStatusCounts();

  const items = entitlements.map((entitlement) => {
    const entitlementId = Number(entitlement.id);
    const softwareProductId = Number(entitlement.software_product_id);
    const quantityPurchased = Number(entitlement.quantity_purchased ?? 0);
    const allocatedActive = Number(allocatedByEntitlementId.get(entitlementId) ?? 0);
    const activeInstallationCount = Number(
      installationsBySoftwareProductId.get(softwareProductId) ?? 0
    );
    const activeAssignmentCount = Number(
      assignmentsBySoftwareProductId.get(softwareProductId) ?? 0
    );

    const consumptionBasis = deriveConsumptionBasis(entitlement.licensing_metric);
    const consumedQuantityUsage =
      consumptionBasis === "ASSIGNMENT"
        ? activeAssignmentCount
        : activeInstallationCount;

    const unusedAllocatedQuantityRaw = allocatedActive - consumedQuantityUsage;
    const unusedAllocatedQuantity = Math.max(unusedAllocatedQuantityRaw, 0);
    const reclaimCandidateCount = Math.max(unusedAllocatedQuantityRaw, 0);
    const allocationUsageVariance = consumedQuantityUsage - allocatedActive;
    const expired = isEntitlementExpired(entitlement);

    const optimizationStatus = deriveOptimizationStatus({
      entitlementStatus: entitlement.status,
      isExpired: expired,
      allocatedActive,
      consumedQuantityUsage,
    });

    statusCounts[optimizationStatus] =
      Number(statusCounts[optimizationStatus] ?? 0) + 1;

    return {
      entitlement_id: entitlementId,
      contract_id: Number(entitlement.contract_id),
      entitlement_code: entitlement.entitlement_code,
      entitlement_name: entitlement.entitlement_name,
      entitlement_status: entitlement.status,
      software_product_id: softwareProductId,
      software_product_code: entitlement.software_product_code,
      software_product_name: entitlement.software_product_name,
      licensing_metric: entitlement.licensing_metric,
      quantity_purchased: quantityPurchased,
      allocated_active: allocatedActive,
      active_installation_count: activeInstallationCount,
      active_assignment_count: activeAssignmentCount,
      consumption_basis: consumptionBasis,
      consumed_quantity_usage: consumedQuantityUsage,
      unused_allocated_quantity: unusedAllocatedQuantity,
      reclaim_candidate_count: reclaimCandidateCount,
      allocation_usage_variance: allocationUsageVariance,
      optimization_status: optimizationStatus,
      is_entitlement_active: normalizeEnum(entitlement.status) === "ACTIVE",
      is_entitlement_expired: expired,
      start_date: entitlement.start_date,
      end_date: entitlement.end_date,
    };
  });

  const totals = items.reduce(
    (acc, item) => {
      acc.entitlements_count += 1;
      acc.quantity_purchased += Number(item.quantity_purchased ?? 0);
      acc.allocated_active += Number(item.allocated_active ?? 0);
      acc.consumed_quantity_usage += Number(item.consumed_quantity_usage ?? 0);
      acc.unused_allocated_quantity += Number(item.unused_allocated_quantity ?? 0);
      acc.reclaim_candidate_count += Number(item.reclaim_candidate_count ?? 0);
      return acc;
    },
    {
      entitlements_count: 0,
      quantity_purchased: 0,
      allocated_active: 0,
      consumed_quantity_usage: 0,
      unused_allocated_quantity: 0,
      reclaim_candidate_count: 0,
    }
  );

  return {
    contract: {
      id: Number(contract.id),
      contract_code: contract.contract_code,
      contract_name: contract.contract_name,
      contract_type: contract.contract_type,
      status: contract.status,
      vendor_id: contract.vendor_id == null ? null : Number(contract.vendor_id),
      vendor_code: contract.vendor_code ?? null,
      vendor_name: contract.vendor_name ?? null,
    },
    totals: {
      ...totals,
      status_counts: statusCounts,
    },
    items,
    total: items.length,
  };
}

export async function getContractSoftwareRenewalSummaryService(app, req) {
  const tenantId = mustTenantId(req);
  const contractId = mustPositiveInt(req.params?.id, "contract id");

  const contract = await getContractById(app, tenantId, contractId);
  if (!contract) {
    throw httpError(404, "Contract not found");
  }

  const renewalNoticeDays = Number(contract.renewal_notice_days ?? 30);
  const entitlements = await listSoftwareEntitlementsByContract(app, tenantId, contractId);

  if (entitlements.length === 0) {
    return {
      contract: {
        id: Number(contract.id),
        contract_code: contract.contract_code,
        contract_name: contract.contract_name,
        contract_type: contract.contract_type,
        status: contract.status,
        vendor_id: contract.vendor_id == null ? null : Number(contract.vendor_id),
        vendor_code: contract.vendor_code ?? null,
        vendor_name: contract.vendor_name ?? null,
        renewal_notice_days: renewalNoticeDays,
      },
      totals: {
        entitlements_count: 0,
        quantity_purchased: 0,
        allocated_active: 0,
        consumed_quantity_usage: 0,
        unused_allocated_quantity: 0,
        expiring_soon_count: 0,
        expired_count: 0,
        no_end_date_count: 0,
        status_counts: createEmptyRenewalStatusCounts(),
      },
      items: [],
      total: 0,
    };
  }

  const entitlementIds = [
    ...new Set(
      entitlements
        .map((item) => Number(item.id))
        .filter((value) => Number.isInteger(value) && value > 0)
    ),
  ];

  const softwareProductIds = [
    ...new Set(
      entitlements
        .map((item) => Number(item.software_product_id))
        .filter((value) => Number.isInteger(value) && value > 0)
    ),
  ];

  const [
    allocatedByEntitlementId,
    installationsBySoftwareProductId,
    assignmentsBySoftwareProductId,
  ] = await Promise.all([
    getActiveAllocatedQuantitiesByEntitlementIds(app, tenantId, entitlementIds),
    countActiveInstallationsBySoftwareProductIds(app, tenantId, softwareProductIds),
    countActiveAssignmentsBySoftwareProductIds(app, tenantId, softwareProductIds),
  ]);

  const statusCounts = createEmptyRenewalStatusCounts();

  const items = entitlements.map((entitlement) => {
    const entitlementId = Number(entitlement.id);
    const softwareProductId = Number(entitlement.software_product_id);
    const quantityPurchased = Number(entitlement.quantity_purchased ?? 0);
    const allocatedActive = Number(allocatedByEntitlementId.get(entitlementId) ?? 0);
    const activeInstallationCount = Number(
      installationsBySoftwareProductId.get(softwareProductId) ?? 0
    );
    const activeAssignmentCount = Number(
      assignmentsBySoftwareProductId.get(softwareProductId) ?? 0
    );

    const consumptionBasis = deriveConsumptionBasis(entitlement.licensing_metric);
    const consumedQuantityUsage =
      consumptionBasis === "ASSIGNMENT"
        ? activeAssignmentCount
        : activeInstallationCount;

    const unusedAllocatedQuantity = Math.max(
      allocatedActive - consumedQuantityUsage,
      0
    );

    const expired = isEntitlementExpired(entitlement);
    const daysToExpiry = calculateDaysToExpiry(entitlement.end_date);

    const renewalStatus = deriveRenewalStatus({
      entitlementStatus: entitlement.status,
      isExpired: expired,
      endDate: entitlement.end_date,
      daysToExpiry,
      renewalNoticeDays,
    });

    statusCounts[renewalStatus] = Number(statusCounts[renewalStatus] ?? 0) + 1;

    return {
      entitlement_id: entitlementId,
      contract_id: Number(entitlement.contract_id),
      entitlement_code: entitlement.entitlement_code,
      entitlement_name: entitlement.entitlement_name,
      entitlement_status: entitlement.status,
      software_product_id: softwareProductId,
      software_product_code: entitlement.software_product_code,
      software_product_name: entitlement.software_product_name,
      licensing_metric: entitlement.licensing_metric,
      quantity_purchased: quantityPurchased,
      allocated_active: allocatedActive,
      active_installation_count: activeInstallationCount,
      active_assignment_count: activeAssignmentCount,
      consumption_basis: consumptionBasis,
      consumed_quantity_usage: consumedQuantityUsage,
      unused_allocated_quantity: unusedAllocatedQuantity,
      renewal_notice_days: renewalNoticeDays,
      days_to_expiry: daysToExpiry,
      renewal_status: renewalStatus,
      is_entitlement_active: normalizeEnum(entitlement.status) === "ACTIVE",
      is_entitlement_expired: expired,
      start_date: entitlement.start_date,
      end_date: entitlement.end_date,
    };
  });

  const totals = items.reduce(
    (acc, item) => {
      acc.entitlements_count += 1;
      acc.quantity_purchased += Number(item.quantity_purchased ?? 0);
      acc.allocated_active += Number(item.allocated_active ?? 0);
      acc.consumed_quantity_usage += Number(item.consumed_quantity_usage ?? 0);
      acc.unused_allocated_quantity += Number(item.unused_allocated_quantity ?? 0);
      return acc;
    },
    {
      entitlements_count: 0,
      quantity_purchased: 0,
      allocated_active: 0,
      consumed_quantity_usage: 0,
      unused_allocated_quantity: 0,
    }
  );

  return {
    contract: {
      id: Number(contract.id),
      contract_code: contract.contract_code,
      contract_name: contract.contract_name,
      contract_type: contract.contract_type,
      status: contract.status,
      vendor_id: contract.vendor_id == null ? null : Number(contract.vendor_id),
      vendor_code: contract.vendor_code ?? null,
      vendor_name: contract.vendor_name ?? null,
      renewal_notice_days: renewalNoticeDays,
    },
    totals: {
      ...totals,
      expiring_soon_count: Number(statusCounts.EXPIRING_SOON ?? 0),
      expired_count: Number(statusCounts.EXPIRED_ENTITLEMENT ?? 0),
      no_end_date_count: Number(statusCounts.NO_END_DATE ?? 0),
      status_counts: statusCounts,
    },
    items,
    total: items.length,
  };
}

export async function createContractService(app, req) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, CONTRACT_WRITE_ROLES);
  const body = req.body || {};

  const vendorId = mustPositiveInt(body.vendor_id, "vendor_id");
  const contractCode = normalizeString(body.contract_code);
  const contractName = normalizeString(body.contract_name);
  const contractType = normalizeEnum(body.contract_type);
  const status = normalizeEnum(body.status);
  const startDate = normalizeDate(body.start_date);
  const endDate = normalizeDate(body.end_date);
  const renewalNoticeDays = normalizeRenewalNoticeDays(body.renewal_notice_days, 30);
  const ownerIdentityId =
    body.owner_identity_id == null || body.owner_identity_id === ""
      ? null
      : mustPositiveInt(body.owner_identity_id, "owner_identity_id");
  const notes = body.notes == null ? null : String(body.notes);

  if (!contractCode) throw httpError(400, "contract_code is required");
  if (!contractName) throw httpError(400, "contract_name is required");
  if (!contractType) throw httpError(400, "contract_type is required");
  if (!status) throw httpError(400, "status is required");

  if (!CONTRACT_TYPES.has(contractType)) {
    throw httpError(400, "Invalid contract_type");
  }
  if (!CONTRACT_STATUSES.has(status)) {
    throw httpError(400, "Invalid status");
  }

  validateDates(startDate, endDate);

  const vendor = await getVendorByIdForTenant(app, tenantId, vendorId);
  if (!vendor) throw httpError(400, "Invalid vendor_id for this tenant");

  if (ownerIdentityId != null) {
    const identity = await getIdentityByIdForTenant(app, tenantId, ownerIdentityId);
    if (!identity) throw httpError(400, "Invalid owner_identity_id for this tenant");
  }

  const existing = await findContractByCode(app, tenantId, contractCode);
  if (existing) throw httpError(409, "contract_code already exists in this tenant");

  const inserted = await insertContract(app, {
    tenant_id: tenantId,
    vendor_id: vendorId,
    contract_code: contractCode,
    contract_name: contractName,
    contract_type: contractType,
    status,
    start_date: startDate,
    end_date: endDate,
    renewal_notice_days: renewalNoticeDays,
    owner_identity_id: ownerIdentityId,
    notes,
  });

  const row = await getContractById(app, tenantId, inserted.id);
  await writeContractAudit(app, req, "CONTRACT_CREATED", row);

  return row;
}

export async function updateContractService(app, req) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, CONTRACT_WRITE_ROLES);
  const contractId = mustPositiveInt(req.params?.id, "contract id");
  const body = req.body || {};

  const existing = await getContractById(app, tenantId, contractId);
  if (!existing) throw httpError(404, "Contract not found");

  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, "vendor_id")) {
    const vendorId = mustPositiveInt(body.vendor_id, "vendor_id");
    const vendor = await getVendorByIdForTenant(app, tenantId, vendorId);
    if (!vendor) throw httpError(400, "Invalid vendor_id for this tenant");
    patch.vendor_id = vendorId;
  }

  if (Object.prototype.hasOwnProperty.call(body, "contract_code")) {
    const contractCode = normalizeString(body.contract_code);
    if (!contractCode) throw httpError(400, "contract_code cannot be empty");

    const duplicate = await findContractByCode(app, tenantId, contractCode, contractId);
    if (duplicate) throw httpError(409, "contract_code already exists in this tenant");

    patch.contract_code = contractCode;
  }

  if (Object.prototype.hasOwnProperty.call(body, "contract_name")) {
    const contractName = normalizeString(body.contract_name);
    if (!contractName) throw httpError(400, "contract_name cannot be empty");
    patch.contract_name = contractName;
  }

  if (Object.prototype.hasOwnProperty.call(body, "contract_type")) {
    const contractType = normalizeEnum(body.contract_type);
    if (!contractType || !CONTRACT_TYPES.has(contractType)) {
      throw httpError(400, "Invalid contract_type");
    }
    patch.contract_type = contractType;
  }

  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    const status = normalizeEnum(body.status);
    if (!status || !CONTRACT_STATUSES.has(status)) {
      throw httpError(400, "Invalid status");
    }
    patch.status = status;
  }

  const nextStartDate = Object.prototype.hasOwnProperty.call(body, "start_date")
    ? normalizeDate(body.start_date)
    : existing.start_date;

  const nextEndDate = Object.prototype.hasOwnProperty.call(body, "end_date")
    ? normalizeDate(body.end_date)
    : existing.end_date;

  if (Object.prototype.hasOwnProperty.call(body, "start_date")) {
    patch.start_date = nextStartDate;
  }

  if (Object.prototype.hasOwnProperty.call(body, "end_date")) {
    patch.end_date = nextEndDate;
  }

  validateDates(nextStartDate, nextEndDate);

  if (Object.prototype.hasOwnProperty.call(body, "renewal_notice_days")) {
    patch.renewal_notice_days = normalizeRenewalNoticeDays(body.renewal_notice_days);
  }

  if (Object.prototype.hasOwnProperty.call(body, "owner_identity_id")) {
    if (body.owner_identity_id == null || body.owner_identity_id === "") {
      patch.owner_identity_id = null;
    } else {
      const ownerIdentityId = mustPositiveInt(body.owner_identity_id, "owner_identity_id");
      const identity = await getIdentityByIdForTenant(app, tenantId, ownerIdentityId);
      if (!identity) throw httpError(400, "Invalid owner_identity_id for this tenant");
      patch.owner_identity_id = ownerIdentityId;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "notes")) {
    patch.notes = body.notes == null ? null : String(body.notes);
  }

  if (Object.keys(patch).length === 0) {
    throw httpError(400, "No valid fields to update");
  }

  await updateContract(app, tenantId, contractId, patch);

  const row = await getContractById(app, tenantId, contractId);
  await writeContractAudit(app, req, "CONTRACT_UPDATED", row);

  return row;
}
