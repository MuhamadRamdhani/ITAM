import { CAPA_SEVERITIES, CAPA_SOURCE_TYPES, CAPA_STATUSES } from './capa.constants.js';

export const capaIdParamSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'integer', minimum: 1 },
  },
};

export const capaListQuerySchema = {
  type: 'object',
  properties: {
    q: { type: 'string' },
    status: { type: 'string', enum: [...Object.values(CAPA_STATUSES), 'ALL'] },
    source_type: { type: 'string', enum: [...CAPA_SOURCE_TYPES, 'ALL'] },
    severity: { type: 'string', enum: [...CAPA_SEVERITIES, 'ALL'] },
    owner_identity_id: { type: 'integer', minimum: 1 },
    overdue_only: { type: 'boolean' },
    page: { type: 'integer', minimum: 1 },
    page_size: { type: 'integer', minimum: 1, maximum: 100 },
  },
};

export const createCapaBodySchema = {
  type: 'object',
  required: ['capa_code', 'title'],
  properties: {
    capa_code: { type: 'string', minLength: 1, maxLength: 100 },
    title: { type: 'string', minLength: 1, maxLength: 255 },
    source_type: { type: 'string', enum: CAPA_SOURCE_TYPES },
    source_id: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    source_label: { anyOf: [{ type: 'string', maxLength: 255 }, { type: 'null' }] },
    severity: { type: 'string', enum: CAPA_SEVERITIES },
    owner_identity_id: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    due_date: { anyOf: [{ type: 'string', minLength: 10, maxLength: 10 }, { type: 'null' }] },
    nonconformity_summary: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
};

export const updateCapaBodySchema = {
  type: 'object',
  properties: {
    capa_code: { type: 'string', minLength: 1, maxLength: 100 },
    title: { type: 'string', minLength: 1, maxLength: 255 },
    source_type: { type: 'string', enum: CAPA_SOURCE_TYPES },
    source_id: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    source_label: { anyOf: [{ type: 'string', maxLength: 255 }, { type: 'null' }] },
    severity: { type: 'string', enum: CAPA_SEVERITIES },
    owner_identity_id: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    due_date: { anyOf: [{ type: 'string', minLength: 10, maxLength: 10 }, { type: 'null' }] },
    nonconformity_summary: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
};

export const rootCauseCapaBodySchema = {
  type: 'object',
  required: ['root_cause_summary'],
  properties: {
    root_cause_summary: { type: 'string', minLength: 1 },
    notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
};

export const correctiveActionCapaBodySchema = {
  type: 'object',
  required: ['corrective_action_summary'],
  properties: {
    corrective_action_summary: { type: 'string', minLength: 1 },
    notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
};

export const preventiveActionCapaBodySchema = {
  type: 'object',
  required: ['preventive_action_summary'],
  properties: {
    preventive_action_summary: { type: 'string', minLength: 1 },
    notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
};

export const verificationCapaBodySchema = {
  type: 'object',
  required: ['verification_summary'],
  properties: {
    verification_summary: { type: 'string', minLength: 1 },
    notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
};

export const closeCapaBodySchema = {
  type: 'object',
  properties: {
    closure_notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
};

export const cancelCapaBodySchema = {
  type: 'object',
  properties: {
    cancel_reason: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
};
