import { Type } from "@sinclair/typebox";

export const SoftwareCategoryEnum = Type.Union([
  Type.Literal("OPERATING_SYSTEM"),
  Type.Literal("DATABASE"),
  Type.Literal("OFFICE_PRODUCTIVITY"),
  Type.Literal("SECURITY"),
  Type.Literal("DEVELOPER_TOOL"),
  Type.Literal("MIDDLEWARE"),
  Type.Literal("BUSINESS_APPLICATION"),
  Type.Literal("DESIGN_MULTIMEDIA"),
  Type.Literal("COLLABORATION"),
  Type.Literal("INFRASTRUCTURE_TOOL"),
  Type.Literal("OTHER"),
]);

export const DeploymentModelEnum = Type.Union([
  Type.Literal("ON_PREMISE"),
  Type.Literal("SAAS"),
  Type.Literal("HYBRID"),
  Type.Literal("CLOUD_MARKETPLACE"),
  Type.Literal("OTHER"),
]);

export const LicensingMetricEnum = Type.Union([
  Type.Literal("USER"),
  Type.Literal("NAMED_USER"),
  Type.Literal("DEVICE"),
  Type.Literal("CONCURRENT_USER"),
  Type.Literal("CORE"),
  Type.Literal("PROCESSOR"),
  Type.Literal("SERVER"),
  Type.Literal("INSTANCE"),
  Type.Literal("VM"),
  Type.Literal("SUBSCRIPTION"),
  Type.Literal("SITE"),
  Type.Literal("ENTERPRISE"),
  Type.Literal("OTHER"),
]);

export const SoftwareStatusEnum = Type.Union([
  Type.Literal("ACTIVE"),
  Type.Literal("INACTIVE"),
]);

export const VersionPolicyEnum = Type.Union([
  Type.Literal("VERSIONED"),
  Type.Literal("VERSIONLESS"),
]);

export const SoftwareProductsListQuerySchema = Type.Object({
  q: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()),
  category: Type.Optional(Type.String()),
  deployment_model: Type.Optional(Type.String()),
  publisher_vendor_id: Type.Optional(Type.Union([Type.String(), Type.Number()])),
  page: Type.Optional(Type.Union([Type.String(), Type.Number()])),
  pageSize: Type.Optional(Type.Union([Type.String(), Type.Number()])),
});

export const SoftwareProductParamsSchema = Type.Object({
  id: Type.String(),
});

export const SoftwareProductCreateBodySchema = Type.Object({
  product_code: Type.String(),
  product_name: Type.String(),
  publisher_vendor_id: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  category: SoftwareCategoryEnum,
  deployment_model: DeploymentModelEnum,
  licensing_metric: LicensingMetricEnum,
  status: Type.Optional(SoftwareStatusEnum),
  version_policy: Type.Optional(VersionPolicyEnum),
  notes: Type.Optional(Type.String()),
});

export const SoftwareProductPatchBodySchema = Type.Object({
  product_code: Type.Optional(Type.String()),
  product_name: Type.Optional(Type.String()),
  publisher_vendor_id: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  category: Type.Optional(SoftwareCategoryEnum),
  deployment_model: Type.Optional(DeploymentModelEnum),
  licensing_metric: Type.Optional(LicensingMetricEnum),
  status: Type.Optional(SoftwareStatusEnum),
  version_policy: Type.Optional(VersionPolicyEnum),
  notes: Type.Optional(Type.String()),
});