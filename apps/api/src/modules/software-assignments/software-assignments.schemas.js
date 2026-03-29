export const ASSIGNMENT_ROLE_ENUM = [
  "PRIMARY_USER",
  "SECONDARY_USER",
  "ADMINISTRATOR",
  "SERVICE_ACCOUNT",
];

export const ASSIGNMENT_STATUS_ENUM = [
  "ACTIVE",
  "REVOKED",
];

export const assetSoftwareAssignmentsParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", pattern: "^[0-9]+$" },
  },
};

export const assetSoftwareAssignmentMutationParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "assignmentId"],
  properties: {
    id: { type: "string", pattern: "^[0-9]+$" },
    assignmentId: { type: "string", pattern: "^[0-9]+$" },
  },
};

export const createAssetSoftwareAssignmentBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["software_installation_id", "identity_id"],
  properties: {
    software_installation_id: {
      anyOf: [
        { type: "integer" },
        { type: "string", pattern: "^[0-9]+$" },
      ],
    },
    identity_id: {
      anyOf: [
        { type: "integer" },
        { type: "string", pattern: "^[0-9]+$" },
      ],
    },
    assignment_role: {
      type: "string",
      enum: ASSIGNMENT_ROLE_ENUM,
    },
    assignment_status: {
      type: "string",
      enum: ASSIGNMENT_STATUS_ENUM,
    },
    assigned_at: {
      anyOf: [{ type: "string", format: "date" }, { type: "null" }],
    },
    unassigned_at: {
      anyOf: [{ type: "string", format: "date" }, { type: "null" }],
    },
    notes: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
  },
};

export const updateAssetSoftwareAssignmentBodySchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    assignment_role: {
      type: "string",
      enum: ASSIGNMENT_ROLE_ENUM,
    },
    assignment_status: {
      type: "string",
      enum: ASSIGNMENT_STATUS_ENUM,
    },
    assigned_at: {
      anyOf: [{ type: "string", format: "date" }, { type: "null" }],
    },
    unassigned_at: {
      anyOf: [{ type: "string", format: "date" }, { type: "null" }],
    },
    notes: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
  },
};