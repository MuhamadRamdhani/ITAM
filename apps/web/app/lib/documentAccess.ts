const DOCUMENT_WRITE_ROLES = ["TENANT_ADMIN", "ITAM_MANAGER"];
const DOCUMENT_FINALIZE_ROLES = ["TENANT_ADMIN"];

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

export function canManageDocuments(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, DOCUMENT_WRITE_ROLES);
}

export function canFinalizeDocuments(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, DOCUMENT_FINALIZE_ROLES);
}
