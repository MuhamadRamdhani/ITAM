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

const MANAGEMENT_REVIEW_VIEW_ROLES = [
  "SUPERADMIN",
  "TENANT_ADMIN",
  "ITAM_MANAGER",
  "SECURITY_OFFICER",
  "AUDITOR",
] as const;

const MANAGEMENT_REVIEW_MANAGE_ROLES = ["SUPERADMIN", "TENANT_ADMIN", "ITAM_MANAGER"] as const;

const MANAGEMENT_REVIEW_FOLLOW_UP_ROLES = [
  "SUPERADMIN",
  "TENANT_ADMIN",
  "ITAM_MANAGER",
  "SECURITY_OFFICER",
] as const;

export function canViewManagementReviews(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, MANAGEMENT_REVIEW_VIEW_ROLES);
}

export function canManageManagementReviews(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, MANAGEMENT_REVIEW_MANAGE_ROLES);
}

export function canFollowUpManagementReviewActionItems(userRoles: unknown): boolean {
  return hasAnyRole(userRoles, MANAGEMENT_REVIEW_FOLLOW_UP_ROLES);
}
