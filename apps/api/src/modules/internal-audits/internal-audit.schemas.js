export const INTERNAL_AUDIT_TYPES = [
  'INTERNAL',
  'THEMATIC',
  'PROCESS',
  'LOCATION',
  'FOLLOW_UP',
];

export const INTERNAL_AUDIT_STATUSES = [
  'DRAFT',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

export const INTERNAL_AUDIT_MEMBER_ROLES = [
  'LEAD_AUDITOR',
  'AUDITOR',
  'AUDITEE',
  'OBSERVER',
];

export const INTERNAL_AUDIT_RESULT_STATUSES = [
  'COMPLIANT',
  'NONCOMPLIANT',
  'OBSERVATION',
  'NOT_APPLICABLE',
];

export const INTERNAL_AUDIT_FINDING_SEVERITIES = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
];

export const INTERNAL_AUDIT_FINDING_STATUSES = [
  'OPEN',
  'UNDER_REVIEW',
  'CLOSED',
];

export const LIST_INTERNAL_AUDITS_QUERYSTRING = {
  type: 'object',
  additionalProperties: false,
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    page_size: { type: 'integer', enum: [10, 25, 50, 100], default: 25 },
    q: { type: 'string', minLength: 1, maxLength: 200 },
    status: { type: 'string', enum: [...INTERNAL_AUDIT_STATUSES, 'ALL'], default: 'ALL' },
    audit_type: { type: 'string', enum: [...INTERNAL_AUDIT_TYPES, 'ALL'], default: 'ALL' },
  },
};

export const INTERNAL_AUDIT_ID_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'integer', minimum: 1 },
  },
};

export const INTERNAL_AUDIT_MEMBER_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'memberId'],
  properties: {
    id: { type: 'integer', minimum: 1 },
    memberId: { type: 'integer', minimum: 1 },
  },
};

export const INTERNAL_AUDIT_SECTION_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'sectionId'],
  properties: {
    id: { type: 'integer', minimum: 1 },
    sectionId: { type: 'integer', minimum: 1 },
  },
};

export const INTERNAL_AUDIT_ITEM_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'itemId'],
  properties: {
    id: { type: 'integer', minimum: 1 },
    itemId: { type: 'integer', minimum: 1 },
  },
};

export const INTERNAL_AUDIT_FINDING_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'findingId'],
  properties: {
    id: { type: 'integer', minimum: 1 },
    findingId: { type: 'integer', minimum: 1 },
  },
};

export const CREATE_INTERNAL_AUDIT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['audit_code', 'audit_title', 'audit_type'],
  properties: {
    audit_code: { type: 'string', minLength: 1, maxLength: 100 },
    audit_title: { type: 'string', minLength: 1, maxLength: 255 },
    audit_type: { type: 'string', enum: INTERNAL_AUDIT_TYPES },
    scope_summary: { type: 'string', maxLength: 20000 },
    objective: { type: 'string', maxLength: 20000 },
    planned_start_date: { type: 'string', format: 'date' },
    planned_end_date: { type: 'string', format: 'date' },
    lead_auditor_identity_id: { type: 'integer', minimum: 1 },
    auditee_summary: { type: 'string', maxLength: 20000 },
    notes: { type: 'string', maxLength: 20000 },
  },
};

export const UPDATE_INTERNAL_AUDIT_BODY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    audit_code: { type: 'string', minLength: 1, maxLength: 100 },
    audit_title: { type: 'string', minLength: 1, maxLength: 255 },
    audit_type: { type: 'string', enum: INTERNAL_AUDIT_TYPES },
    scope_summary: { type: 'string', maxLength: 20000 },
    objective: { type: 'string', maxLength: 20000 },
    planned_start_date: { type: 'string', format: 'date' },
    planned_end_date: { type: 'string', format: 'date' },
    lead_auditor_identity_id: { type: 'integer', minimum: 1 },
    auditee_summary: { type: 'string', maxLength: 20000 },
    notes: { type: 'string', maxLength: 20000 },
  },
};

export const CREATE_INTERNAL_AUDIT_MEMBER_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['identity_id', 'member_role'],
  properties: {
    identity_id: { type: 'integer', minimum: 1 },
    member_role: { type: 'string', enum: INTERNAL_AUDIT_MEMBER_ROLES },
    notes: { type: 'string', maxLength: 20000 },
  },
};

export const CREATE_CHECKLIST_SECTION_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['title'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 255 },
    description: { type: 'string', maxLength: 20000 },
    clause_code: { type: 'string', maxLength: 30 },
    sort_order: { type: 'integer', minimum: 0, default: 0 },
  },
};

export const UPDATE_CHECKLIST_SECTION_BODY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 255 },
    description: { type: 'string', maxLength: 20000 },
    clause_code: { type: 'string', maxLength: 30 },
    sort_order: { type: 'integer', minimum: 0 },
  },
};

export const CREATE_CHECKLIST_ITEM_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['item_code', 'requirement_text'],
  properties: {
    section_id: { type: 'integer', minimum: 1 },
    item_code: { type: 'string', minLength: 1, maxLength: 100 },
    requirement_text: { type: 'string', minLength: 1, maxLength: 20000 },
    expected_evidence: { type: 'string', maxLength: 20000 },
    clause_code: { type: 'string', maxLength: 30 },
    sort_order: { type: 'integer', minimum: 0, default: 0 },
    is_mandatory: { type: 'boolean', default: true },
  },
};

export const UPDATE_CHECKLIST_ITEM_BODY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    section_id: { type: 'integer', minimum: 1 },
    item_code: { type: 'string', minLength: 1, maxLength: 100 },
    requirement_text: { type: 'string', minLength: 1, maxLength: 20000 },
    expected_evidence: { type: 'string', maxLength: 20000 },
    clause_code: { type: 'string', maxLength: 30 },
    sort_order: { type: 'integer', minimum: 0 },
    is_mandatory: { type: 'boolean' },
  },
};

export const START_INTERNAL_AUDIT_BODY = {
  type: 'object',
  additionalProperties: false,
  properties: {},
};

export const COMPLETE_INTERNAL_AUDIT_BODY = {
  type: 'object',
  additionalProperties: false,
  properties: {},
};

export const CANCEL_INTERNAL_AUDIT_BODY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    notes: { type: 'string', maxLength: 20000 },
  },
};

export const RECORD_CHECKLIST_RESULT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['result_status'],
  properties: {
    result_status: { type: 'string', enum: INTERNAL_AUDIT_RESULT_STATUSES },
    observation_notes: { type: 'string', maxLength: 20000 },
    assessed_by_identity_id: { type: 'integer', minimum: 1 },
  },
};

export const CREATE_FINDING_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['finding_code', 'title', 'description', 'severity'],
  properties: {
    checklist_item_id: { type: 'integer', minimum: 1 },
    finding_code: { type: 'string', minLength: 1, maxLength: 100 },
    title: { type: 'string', minLength: 1, maxLength: 255 },
    description: { type: 'string', minLength: 1, maxLength: 20000 },
    severity: { type: 'string', enum: INTERNAL_AUDIT_FINDING_SEVERITIES },
    owner_identity_id: { type: 'integer', minimum: 1 },
    due_date: { type: 'string', format: 'date' },
  },
};

export const UPDATE_FINDING_BODY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    checklist_item_id: { type: 'integer', minimum: 1 },
    finding_code: { type: 'string', minLength: 1, maxLength: 100 },
    title: { type: 'string', minLength: 1, maxLength: 255 },
    description: { type: 'string', minLength: 1, maxLength: 20000 },
    severity: { type: 'string', enum: INTERNAL_AUDIT_FINDING_SEVERITIES },
    status: { type: 'string', enum: INTERNAL_AUDIT_FINDING_STATUSES },
    owner_identity_id: { type: 'integer', minimum: 1 },
    due_date: { type: 'string', format: 'date' },
  },
};

export const CLOSE_FINDING_BODY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    closure_notes: { type: 'string', maxLength: 20000 },
  },
};