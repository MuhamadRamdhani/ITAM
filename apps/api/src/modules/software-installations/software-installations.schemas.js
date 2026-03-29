export const INSTALLATION_STATUS_ENUM = [
  "INSTALLED",
  "UNINSTALLED",
  "DETECTED",
];

export const assetSoftwareInstallationsParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", pattern: "^[0-9]+$" },
  },
};

export const assetSoftwareInstallationMutationParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "installationId"],
  properties: {
    id: { type: "string", pattern: "^[0-9]+$" },
    installationId: { type: "string", pattern: "^[0-9]+$" },
  },
};

export const createAssetSoftwareInstallationBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["software_product_id"],
  properties: {
    software_product_id: {
      anyOf: [
        { type: "integer" },
        { type: "string", pattern: "^[0-9]+$" },
      ],
    },
    installation_status: {
      type: "string",
      enum: INSTALLATION_STATUS_ENUM,
    },
    installed_version: {
      anyOf: [{ type: "string", maxLength: 255 }, { type: "null" }],
    },
    installation_date: {
      anyOf: [{ type: "string", format: "date" }, { type: "null" }],
    },
    uninstalled_date: {
      anyOf: [{ type: "string", format: "date" }, { type: "null" }],
    },
    discovered_by: {
      anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }],
    },
    discovery_source: {
      anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }],
    },
    notes: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
  },
};

export const updateAssetSoftwareInstallationBodySchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    installation_status: {
      type: "string",
      enum: INSTALLATION_STATUS_ENUM,
    },
    installed_version: {
      anyOf: [{ type: "string", maxLength: 255 }, { type: "null" }],
    },
    installation_date: {
      anyOf: [{ type: "string", format: "date" }, { type: "null" }],
    },
    uninstalled_date: {
      anyOf: [{ type: "string", format: "date" }, { type: "null" }],
    },
    discovered_by: {
      anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }],
    },
    discovery_source: {
      anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }],
    },
    notes: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
  },
};