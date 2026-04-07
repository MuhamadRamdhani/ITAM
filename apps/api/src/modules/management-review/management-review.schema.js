import {
  MANAGEMENT_REVIEW_ACTION_ITEM_STATUSES,
  MANAGEMENT_REVIEW_SESSION_STATUSES,
} from './management-review.constants.js';

const sessionStatusValues = Object.values(MANAGEMENT_REVIEW_SESSION_STATUSES);
const actionStatusValues = Object.values(MANAGEMENT_REVIEW_ACTION_ITEM_STATUSES);

export const managementReviewIdParamSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'integer', minimum: 1 },
  },
};

export const managementReviewDecisionParamSchema = {
  type: 'object',
  required: ['id', 'decisionId'],
  properties: {
    id: { type: 'integer', minimum: 1 },
    decisionId: { type: 'integer', minimum: 1 },
  },
};

export const managementReviewActionItemParamSchema = {
  type: 'object',
  required: ['id', 'actionItemId'],
  properties: {
    id: { type: 'integer', minimum: 1 },
    actionItemId: { type: 'integer', minimum: 1 },
  },
};

export const managementReviewListQuerySchema = {
  type: 'object',
  properties: {
    q: { type: 'string' },
    status: { type: 'string', enum: sessionStatusValues },
    page: { type: 'integer', minimum: 1 },
    page_size: { type: 'integer', minimum: 1, maximum: 100 },
  },
};

export const managementReviewActionTrackerQuerySchema = {
  type: 'object',
  properties: {
    q: { type: 'string' },
    status: { type: 'string', enum: actionStatusValues },
    owner_identity_id: { type: 'integer', minimum: 1 },
    overdue_only: { type: 'boolean' },
    session_id: { type: 'integer', minimum: 1 },
    page: { type: 'integer', minimum: 1 },
    page_size: { type: 'integer', minimum: 1, maximum: 100 },
  },
};

export const createManagementReviewBodySchema = {
  type: 'object',
  required: ['session_code', 'title', 'review_date'],
  properties: {
    session_code: { type: 'string', minLength: 1, maxLength: 100 },
    title: { type: 'string', minLength: 1, maxLength: 255 },
    review_date: { type: 'string', minLength: 10, maxLength: 10 },
    chairperson_identity_id: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    summary: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    minutes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
};

export const updateManagementReviewBodySchema = {
  type: 'object',
  properties: {
    session_code: { type: 'string', minLength: 1, maxLength: 100 },
    title: { type: 'string', minLength: 1, maxLength: 255 },
    review_date: { type: 'string', minLength: 10, maxLength: 10 },
    chairperson_identity_id: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    summary: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    minutes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
};

export const cancelManagementReviewBodySchema = {
  type: 'object',
  properties: {
    cancel_reason: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
};

export const createManagementReviewDecisionBodySchema = {
  type: 'object',
  required: ['title', 'decision_text'],
  properties: {
    decision_no: { anyOf: [{ type: 'string', maxLength: 50 }, { type: 'null' }] },
    title: { type: 'string', minLength: 1, maxLength: 255 },
    decision_text: { type: 'string', minLength: 1 },
    owner_identity_id: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    target_date: { anyOf: [{ type: 'string', minLength: 10, maxLength: 10 }, { type: 'null' }] },
    sort_order: { type: 'integer' },
  },
};

export const updateManagementReviewDecisionBodySchema = {
  type: 'object',
  properties: {
    decision_no: { anyOf: [{ type: 'string', maxLength: 50 }, { type: 'null' }] },
    title: { type: 'string', minLength: 1, maxLength: 255 },
    decision_text: { type: 'string', minLength: 1 },
    owner_identity_id: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    target_date: { anyOf: [{ type: 'string', minLength: 10, maxLength: 10 }, { type: 'null' }] },
    sort_order: { type: 'integer' },
  },
};

export const createManagementReviewActionItemBodySchema = {
  type: 'object',
  required: ['title', 'owner_identity_id', 'due_date'],
  properties: {
    decision_id: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    action_no: { anyOf: [{ type: 'string', maxLength: 50 }, { type: 'null' }] },
    title: { type: 'string', minLength: 1, maxLength: 255 },
    description: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    owner_identity_id: { type: 'integer', minimum: 1 },
    due_date: { type: 'string', minLength: 10, maxLength: 10 },
    status: { type: 'string', enum: actionStatusValues },
    progress_notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    completion_notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    sort_order: { type: 'integer' },
  },
};

export const updateManagementReviewActionItemBodySchema = {
  type: 'object',
  properties: {
    decision_id: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    action_no: { anyOf: [{ type: 'string', maxLength: 50 }, { type: 'null' }] },
    title: { type: 'string', minLength: 1, maxLength: 255 },
    description: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    owner_identity_id: { type: 'integer', minimum: 1 },
    due_date: { type: 'string', minLength: 10, maxLength: 10 },
    status: { type: 'string', enum: actionStatusValues },
    progress_notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    completion_notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    sort_order: { type: 'integer' },
  },
};