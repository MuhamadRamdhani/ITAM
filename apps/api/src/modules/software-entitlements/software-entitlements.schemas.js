export const ENTITLEMENT_STATUS_ENUM = [
  "ACTIVE",
  "INACTIVE",
  "EXPIRED",
];

export const ENTITLEMENT_LICENSING_METRIC_ENUM = [
  "SUBSCRIPTION",
  "PER_USER",
  "PER_DEVICE",
  "PER_NAMED_USER",
  "PER_CONCURRENT_USER",
  "PER_CORE",
  "PER_PROCESSOR",
  "SITE",
  "ENTERPRISE",
  "OTHER",
];

export const contractSoftwareEntitlementsParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", pattern: "^[0-9]+$" },
  },
};

export const contractSoftwareEntitlementMutationParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "entitlementId"],
  properties: {
    id: { type: "string", pattern: "^[0-9]+$" },
    entitlementId: { type: "string", pattern: "^[0-9]+$" },
  },
};

export const createContractSoftwareEntitlementBodySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "software_product_id",
    "entitlement_code",
    "licensing_metric",
    "quantity_purchased",
  ],
  properties: {
    software_product_id: {
      anyOf: [
        { type: "integer" },
        { type: "string", pattern: "^[0-9]+$" },
      ],
    },
    entitlement_code: {
      type: "string",
      minLength: 1,
      maxLength: 120,
    },
    entitlement_name: {
      anyOf: [{ type: "string", maxLength: 255 }, { type: "null" }],
    },
    licensing_metric: {
      type: "string",
      enum: ENTITLEMENT_LICENSING_METRIC_ENUM,
    },
    quantity_purchased: {
      anyOf: [
        { type: "integer", minimum: 0 },
        { type: "string", pattern: "^[0-9]+$" },
      ],
    },
    start_date: {
      anyOf: [{ type: "string", format: "date" }, { type: "null" }],
    },
    end_date: {
      anyOf: [{ type: "string", format: "date" }, { type: "null" }],
    },
    status: {
      type: "string",
      enum: ENTITLEMENT_STATUS_ENUM,
    },
    notes: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
  },
};

export const updateContractSoftwareEntitlementBodySchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    software_product_id: {
      anyOf: [
        { type: "integer" },
        { type: "string", pattern: "^[0-9]+$" },
      ],
    },
    entitlement_code: {
      type: "string",
      minLength: 1,
      maxLength: 120,
    },
    entitlement_name: {
      anyOf: [{ type: "string", maxLength: 255 }, { type: "null" }],
    },
    licensing_metric: {
      type: "string",
      enum: ENTITLEMENT_LICENSING_METRIC_ENUM,
    },
    quantity_purchased: {
      anyOf: [
        { type: "integer", minimum: 0 },
        { type: "string", pattern: "^[0-9]+$" },
      ],
    },
    start_date: {
      anyOf: [{ type: "string", format: "date" }, { type: "null" }],
    },
    end_date: {
      anyOf: [{ type: "string", format: "date" }, { type: "null" }],
    },
    status: {
      type: "string",
      enum: ENTITLEMENT_STATUS_ENUM,
    },
    notes: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
  },
};