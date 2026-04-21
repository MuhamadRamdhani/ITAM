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

const SOFTWARE_PRODUCT_WRITE_ROLES = [
  "SUPERADMIN",
  "TENANT_ADMIN",
  "ITAM_MANAGER",
  "PROCUREMENT_CONTRACT_MANAGER",
] as const;

export function canManageSoftwareProducts(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, SOFTWARE_PRODUCT_WRITE_ROLES);
}
