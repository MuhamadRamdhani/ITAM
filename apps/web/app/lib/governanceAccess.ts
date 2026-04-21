const GOVERNANCE_MANAGE_ROLES = ["SUPERADMIN", "TENANT_ADMIN", "ITAM_MANAGER"];
const GOVERNANCE_APPROVE_ACTIVATE_ROLES = ["TENANT_ADMIN"];

export function normalizeRoles(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((role) => String(role ?? "").trim().toUpperCase())
    .filter(Boolean);
}

function hasAnyRole(userRoles: unknown, allowedRoles: readonly string[]): boolean {
  const roles = normalizeRoles(userRoles);
  return roles.some((role) => allowedRoles.includes(role));
}

export function canManageGovernance(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, GOVERNANCE_MANAGE_ROLES);
}

export function canApproveActivateGovernance(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, GOVERNANCE_APPROVE_ACTIVATE_ROLES);
}
