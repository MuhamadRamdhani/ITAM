export const CAPA_SOURCE_TYPES = Object.freeze([
  'INTERNAL_AUDIT_FINDING',
  'MANAGEMENT_REVIEW_ACTION_ITEM',
  'OTHER',
]);

export const CAPA_SEVERITIES = Object.freeze([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);

export const CAPA_STATUSES = Object.freeze({
  OPEN: 'OPEN',
  ROOT_CAUSE: 'ROOT_CAUSE',
  CORRECTIVE_ACTION: 'CORRECTIVE_ACTION',
  PREVENTIVE_ACTION: 'PREVENTIVE_ACTION',
  VERIFICATION: 'VERIFICATION',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
});

export const CAPA_VIEW_ROLES = Object.freeze([
  'SUPERADMIN',
  'TENANT_ADMIN',
  'ITAM_MANAGER',
  'SECURITY_OFFICER',
  'AUDITOR',
]);

export const CAPA_MANAGE_ROLES = Object.freeze([
  'SUPERADMIN',
  'TENANT_ADMIN',
  'ITAM_MANAGER',
  'SECURITY_OFFICER',
]);

export const CAPA_FOLLOW_UP_ROLES = Object.freeze([
  'SUPERADMIN',
  'TENANT_ADMIN',
  'ITAM_MANAGER',
  'SECURITY_OFFICER',
]);

export function canEditCapaStructure(status) {
  return status === CAPA_STATUSES.OPEN || status === CAPA_STATUSES.ROOT_CAUSE;
}

export function canAdvanceCapa(status) {
  return status !== CAPA_STATUSES.CLOSED && status !== CAPA_STATUSES.CANCELLED;
}
