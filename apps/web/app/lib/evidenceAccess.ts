const EVIDENCE_WRITE_ROLES = ["TENANT_ADMIN", "ITAM_MANAGER", "ASSET_CUSTODIAN"];
const EVIDENCE_DELETE_ROLES = ["SUPERADMIN", "TENANT_ADMIN", "ITAM_MANAGER"];

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

export function canManageEvidence(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, EVIDENCE_WRITE_ROLES);
}

export function canDeleteEvidenceFiles(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, EVIDENCE_DELETE_ROLES);
}
