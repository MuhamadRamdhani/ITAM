export const ALLOCATION_BASIS_ENUM = [
  "INSTALLATION",
  "ASSIGNMENT",
  "ASSET",
  "MANUAL",
];

export const ALLOCATION_STATUS_ENUM = [
  "ACTIVE",
  "RELEASED",
];

export const entitlementAllocationsParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", pattern: "^[0-9]+$" },
  },
};

export const entitlementAllocationMutationParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "allocationId"],
  properties: {
    id: { type: "string", pattern: "^[0-9]+$" },
    allocationId: { type: "string", pattern: "^[0-9]+$" },
  },
};

export const createEntitlementAllocationBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["asset_id", "allocation_basis", "allocated_quantity"],
  properties: {
    asset_id: {
      anyOf: [{ type: "integer", minimum: 1 }, { type: "string", pattern: "^[0-9]+$" }],
    },
    software_installation_id: {
      anyOf: [
        { type: "integer", minimum: 1 },
        { type: "string", pattern: "^[0-9]+$" },
        { type: "null" },
      ],
    },
    software_assignment_id: {
      anyOf: [
        { type: "integer", minimum: 1 },
        { type: "string", pattern: "^[0-9]+$" },
        { type: "null" },
      ],
    },
    allocation_basis: {
      type: "string",
      enum: ALLOCATION_BASIS_ENUM,
    },
    allocated_quantity: {
      anyOf: [{ type: "integer", minimum: 1 }, { type: "string", pattern: "^[0-9]+$" }],
    },
    status: {
      type: "string",
      enum: ALLOCATION_STATUS_ENUM,
    },
    allocated_at: {
      anyOf: [{ type: "string", format: "date" }, { type: "null" }],
    },
    released_at: {
      anyOf: [{ type: "string", format: "date" }, { type: "null" }],
    },
    notes: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
  },
};

export const updateEntitlementAllocationBodySchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    status: {
      type: "string",
      enum: ALLOCATION_STATUS_ENUM,
    },
    released_at: {
      anyOf: [{ type: "string", format: "date" }, { type: "null" }],
    },
    notes: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
  },
};