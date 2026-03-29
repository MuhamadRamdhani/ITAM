import { Type } from "@sinclair/typebox";

const AssetTypeObj = Type.Object({
  code: Type.String(),
  label: Type.String(),
});

const NullableStateObj = Type.Union([
  Type.Object({
    code: Type.String(),
    label: Type.String(),
  }),
  Type.Null(),
]);

const NullableString = Type.Union([Type.String(), Type.Null()]);
const NullableInt = Type.Union([Type.Integer(), Type.Null()]);

const ContractPreviewItem = Type.Object({
  id: Type.Integer(),
  code: Type.String(),
});

const VendorPreviewItem = Type.Object({
  id: Type.Integer(),
  name: Type.String(),
});

export const CoverageKindEnum = Type.Union([
  Type.Literal("WARRANTY"),
  Type.Literal("SUPPORT"),
  Type.Literal("SUBSCRIPTION"),
  Type.Literal("NONE"),
]);

export const CoverageHealthEnum = Type.Union([
  Type.Literal("ACTIVE"),
  Type.Literal("EXPIRING"),
  Type.Literal("EXPIRED"),
  Type.Literal("NO_COVERAGE"),
  Type.Literal("NO_END_DATE"),
]);

export const ContractHealthFilterEnum = Type.Union([
  Type.Literal("ACTIVE"),
  Type.Literal("EXPIRING"),
  Type.Literal("EXPIRED"),
  Type.Literal("NO_END_DATE"),
]);

export const LinkStatusFilterEnum = Type.Union([
  Type.Literal("LINKED"),
  Type.Literal("NO_LINK"),
]);

export const ContractHealthRollupEnum = Type.Union([
  Type.Literal("NO_LINK"),
  Type.Literal("ACTIVE_ONLY"),
  Type.Literal("HAS_NO_END_DATE"),
  Type.Literal("HAS_EXPIRING"),
  Type.Literal("HAS_EXPIRED"),
]);

export const AssetCoverageListQuery = Type.Object({
  q: Type.Optional(Type.String()),
  type_code: Type.Optional(Type.String()),
  coverage_kind: Type.Optional(CoverageKindEnum),
  health: Type.Optional(CoverageHealthEnum),
  vendor_id: Type.Optional(Type.Integer({ minimum: 1 })),
  contract_id: Type.Optional(Type.Integer({ minimum: 1 })),
  contract_health: Type.Optional(ContractHealthFilterEnum),
  link_status: Type.Optional(LinkStatusFilterEnum),
  expiring_in_days: Type.Optional(Type.Integer({ minimum: 1 })),
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  page_size: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
});

export const AssetCoverageSummaryQuery = Type.Object({
  q: Type.Optional(Type.String()),
  type_code: Type.Optional(Type.String()),
  coverage_kind: Type.Optional(CoverageKindEnum),
  health: Type.Optional(CoverageHealthEnum),
  vendor_id: Type.Optional(Type.Integer({ minimum: 1 })),
  contract_id: Type.Optional(Type.Integer({ minimum: 1 })),
  contract_health: Type.Optional(ContractHealthFilterEnum),
  link_status: Type.Optional(LinkStatusFilterEnum),
  expiring_in_days: Type.Optional(Type.Integer({ minimum: 1 })),
});

export const AssetCoverageItem = Type.Object({
  asset_id: Type.Integer(),
  asset_tag: Type.String(),
  name: Type.String(),
  status: NullableString,
  asset_type: AssetTypeObj,
  state: NullableStateObj,
  coverage_kind: CoverageKindEnum,
  start_date: NullableString,
  end_date: NullableString,
  coverage_health: CoverageHealthEnum,
  days_to_expiry: NullableInt,

  has_linked_contract: Type.Boolean(),
  linked_contracts_count: Type.Integer(),
  linked_vendors_count: Type.Integer(),

  has_active_contract: Type.Boolean(),
  has_expiring_contract: Type.Boolean(),
  has_expired_contract: Type.Boolean(),
  has_no_end_date_contract: Type.Boolean(),

  contract_health_rollup: ContractHealthRollupEnum,
  contract_codes_preview: Type.Array(Type.String()),
  vendor_names_preview: Type.Array(Type.String()),

  contract_preview_items: Type.Array(ContractPreviewItem),
  vendor_preview_items: Type.Array(VendorPreviewItem),
});

export const AssetCoverageListResponse = Type.Object({
  ok: Type.Boolean(),
  data: Type.Object({
    items: Type.Array(AssetCoverageItem),
    page: Type.Integer(),
    page_size: Type.Integer(),
    total: Type.Integer(),
  }),
  meta: Type.Object({
    request_id: Type.String(),
  }),
});

export const AssetCoverageSummaryResponse = Type.Object({
  ok: Type.Boolean(),
  data: Type.Object({
    active_count: Type.Integer(),
    expiring_count: Type.Integer(),
    expired_count: Type.Integer(),
    no_coverage_count: Type.Integer(),
    no_end_date_count: Type.Integer(),

    rows_with_linked_contract: Type.Integer(),
    rows_without_linked_contract: Type.Integer(),
    rows_with_active_contract: Type.Integer(),
    rows_with_expiring_contract: Type.Integer(),
    rows_with_expired_contract: Type.Integer(),
    rows_with_no_end_date_contract: Type.Integer(),
  }),
  meta: Type.Object({
    request_id: Type.String(),
  }),
});