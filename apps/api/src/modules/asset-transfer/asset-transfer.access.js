export const ASSET_TRANSFER_VIEW_ALLOWED_ROLES = [
  "SUPERADMIN",
  "TENANT_ADMIN",
  "ITAM_MANAGER",
];

export const ASSET_TRANSFER_CREATE_ALLOWED_ROLES = [
  "TENANT_ADMIN",
  "ITAM_MANAGER",
];

export const ASSET_TRANSFER_SUBMIT_ALLOWED_ROLES = [
  "TENANT_ADMIN",
  "ITAM_MANAGER",
];

export const ASSET_TRANSFER_DECIDE_ALLOWED_ROLES = [
  "TENANT_ADMIN",
  "ITAM_MANAGER",
];

export function normalizeRoles(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((role) => String(role ?? "").trim().toUpperCase())
    .filter(Boolean);
}

export function hasAnyRole(userRoles, allowedRoles) {
  const roles = normalizeRoles(userRoles);
  return roles.some((role) => allowedRoles.includes(role));
}