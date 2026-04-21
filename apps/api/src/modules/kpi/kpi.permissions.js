const KPI_VIEW_ROLE_SET = new Set([
  'SUPERADMIN',
  'TENANT_ADMIN',
  'ITAM_MANAGER',
  'AUDITOR',
]);

const KPI_MANAGE_ROLE_SET = new Set([
  'SUPERADMIN',
  'TENANT_ADMIN',
  'ITAM_MANAGER',
]);

function normalizeRoles(roles) {
  if (!Array.isArray(roles)) return [];
  return roles
    .map((role) => String(role || '').trim().toUpperCase())
    .filter(Boolean);
}

function hasAnyAllowedRole(roles, allowedRoleSet) {
  const normalizedRoles = normalizeRoles(roles);
  return normalizedRoles.some((role) => allowedRoleSet.has(role));
}

function buildForbiddenError(message) {
  const error = new Error(message);
  error.statusCode = 403;
  error.code = 'AUTH_FORBIDDEN';
  return error;
}

export function canViewKpiModule(roles) {
  return hasAnyAllowedRole(roles, KPI_VIEW_ROLE_SET);
}

export function canManageKpis(roles) {
  return hasAnyAllowedRole(roles, KPI_MANAGE_ROLE_SET);
}

export function assertCanViewKpiModule(roles) {
  if (!canViewKpiModule(roles)) {
    throw buildForbiddenError('You are not allowed to access KPI module.');
  }
}

export function assertCanManageKpis(roles) {
  if (!canManageKpis(roles)) {
    throw buildForbiddenError('You are not allowed to manage KPIs.');
  }
}
