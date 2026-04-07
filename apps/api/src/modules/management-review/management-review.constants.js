export const MANAGEMENT_REVIEW_SESSION_STATUSES = Object.freeze({
  DRAFT: 'DRAFT',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
});

export const MANAGEMENT_REVIEW_ACTION_ITEM_STATUSES = Object.freeze({
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
});

export const MANAGEMENT_REVIEW_VIEW_ROLES = Object.freeze([
  'SUPERADMIN',
  'TENANT_ADMIN',
  'ITAM_MANAGER',
  'SECURITY_OFFICER',
  'AUDITOR',
]);

export const MANAGEMENT_REVIEW_MANAGE_ROLES = Object.freeze([
  'SUPERADMIN',
  'TENANT_ADMIN',
  'ITAM_MANAGER',
]);

export const MANAGEMENT_REVIEW_FOLLOW_UP_ROLES = Object.freeze([
  'SUPERADMIN',
  'TENANT_ADMIN',
  'ITAM_MANAGER',
  'SECURITY_OFFICER',
]);

export function canEditManagementReviewStructure(status) {
  return status === MANAGEMENT_REVIEW_SESSION_STATUSES.DRAFT;
}

export function canFollowUpManagementReviewActionItems(status) {
  return status === MANAGEMENT_REVIEW_SESSION_STATUSES.COMPLETED;
}