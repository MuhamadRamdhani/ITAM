const ASSET_WRITE_ROLES = ["TENANT_ADMIN", "ITAM_MANAGER"];
const ASSET_OWNERSHIP_ROLES = ["TENANT_ADMIN", "ITAM_MANAGER", "ASSET_CUSTODIAN"];
const ASSET_LIFECYCLE_ROLES = ["TENANT_ADMIN", "ITAM_MANAGER", "ASSET_CUSTODIAN"];
const ASSET_SOFTWARE_WRITE_ROLES = ["SUPERADMIN", "TENANT_ADMIN", "ITAM_MANAGER"];

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

export function canCreateOrEditAsset(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, ASSET_WRITE_ROLES);
}

export function canManageAssetOwnership(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, ASSET_OWNERSHIP_ROLES);
}

export function canTransitionAssetLifecycle(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, ASSET_LIFECYCLE_ROLES);
}

export function canManageAssetSoftware(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, ASSET_SOFTWARE_WRITE_ROLES);
}
