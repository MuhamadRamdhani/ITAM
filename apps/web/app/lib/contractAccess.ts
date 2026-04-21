function normalizeRoles(userRoles: unknown): string[] {
  if (!Array.isArray(userRoles)) return [];
  return userRoles
    .map((role) => String(role || "").trim().toUpperCase())
    .filter(Boolean);
}

function hasAnyRole(userRoles: unknown, allowedRoles: readonly string[]): boolean {
  const roles = normalizeRoles(userRoles);
  return roles.some((role) => allowedRoles.includes(role));
}

const CONTRACT_WRITE_ROLES = [
  "SUPERADMIN",
  "TENANT_ADMIN",
  "ITAM_MANAGER",
  "PROCUREMENT_CONTRACT_MANAGER",
] as const;

export function canManageContracts(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, CONTRACT_WRITE_ROLES);
}
