export const ASSET_TRANSFER_VIEW_ALLOWED_ROLES = [
  "SUPERADMIN",
  "TENANT_ADMIN",
  "ITAM_MANAGER",
] as const;

export const ASSET_TRANSFER_CREATE_ALLOWED_ROLES = [
  "TENANT_ADMIN",
  "ITAM_MANAGER",
] as const;

export const ASSET_TRANSFER_SUBMIT_ALLOWED_ROLES = [
  "TENANT_ADMIN",
  "ITAM_MANAGER",
] as const;

export const ASSET_TRANSFER_DECIDE_ALLOWED_ROLES = [
  "TENANT_ADMIN",
  "ITAM_MANAGER",
] as const;

export const ASSET_TRANSFER_DELETE_ALLOWED_ROLES = [
  "SUPERADMIN",
  "TENANT_ADMIN",
  "ITAM_MANAGER",
] as const;

export function normalizeRoles(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((role) => String(role ?? "").trim().toUpperCase())
    .filter(Boolean);
}

export function hasAnyRole(userRoles: unknown, allowedRoles: readonly string[]): boolean {
  const roles = normalizeRoles(userRoles);
  return roles.some((role) => allowedRoles.includes(role));
}

export function canViewAssetTransfer(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, ASSET_TRANSFER_VIEW_ALLOWED_ROLES);
}

export function canCreateAssetTransfer(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, ASSET_TRANSFER_CREATE_ALLOWED_ROLES);
}

export function canSubmitAssetTransfer(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, ASSET_TRANSFER_SUBMIT_ALLOWED_ROLES);
}

export function canDecideAssetTransfer(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, ASSET_TRANSFER_DECIDE_ALLOWED_ROLES);
}

export function canDeleteAssetTransfer(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, ASSET_TRANSFER_DELETE_ALLOWED_ROLES);
}
