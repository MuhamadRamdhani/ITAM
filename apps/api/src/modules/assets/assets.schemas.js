import { Type } from "@sinclair/typebox";

export const AssetTypeObj = Type.Object({
  code: Type.String(),
  label: Type.String(),
});

export const StateObj = Type.Object({
  code: Type.String(),
  label: Type.String(),
});

const NullableDateString = Type.Optional(Type.Union([Type.String(), Type.Null()]));
const NullableInt = Type.Optional(Type.Union([Type.Integer(), Type.Null()]));
const NullableString = Type.Optional(Type.Union([Type.String(), Type.Null()]));

export const AssetListQuery = Type.Object({
  q: Type.Optional(Type.String()),
  type_code: Type.Optional(Type.String()),
  state_code: Type.Optional(Type.String()),
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  page_size: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
});

export const AssetListItem = Type.Object({
  id: Type.Integer(),
  asset_tag: Type.String(),
  name: Type.String(),
  asset_type: AssetTypeObj,
  state: StateObj,
});

export const AssetListResponse = Type.Object({
  ok: Type.Boolean(),
  data: Type.Object({
    items: Type.Array(AssetListItem),
    page: Type.Integer(),
    page_size: Type.Integer(),
    total: Type.Integer(),
  }),
  meta: Type.Object({
    request_id: Type.String(),
  }),
});

export const AssetDetailResponse = Type.Object({
  ok: Type.Boolean(),
  data: Type.Object({
    asset: Type.Object({
      id: Type.Integer(),
      asset_tag: Type.String(),
      name: Type.String(),
      status: NullableString,
      asset_type: AssetTypeObj,
      state: StateObj,
      owner_department_id: NullableInt,
      current_custodian_identity_id: NullableInt,
      location_id: NullableInt,

      purchase_date: NullableDateString,
      warranty_start_date: NullableDateString,
      warranty_end_date: NullableDateString,
      support_start_date: NullableDateString,
      support_end_date: NullableDateString,
      subscription_start_date: NullableDateString,
      subscription_end_date: NullableDateString,
    }),
  }),
  meta: Type.Object({
    request_id: Type.String(),
  }),
});

export const AssetCreateBody = Type.Object({
  asset_tag: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1 }),
  asset_type_code: Type.String({ minLength: 1 }),
  initial_state_code: Type.String({ minLength: 1 }),
  status: Type.Optional(Type.String()),
  owner_department_id: NullableInt,
  current_custodian_identity_id: NullableInt,
  location_id: NullableInt,

  purchase_date: NullableDateString,
  warranty_start_date: NullableDateString,
  warranty_end_date: NullableDateString,
  support_start_date: NullableDateString,
  support_end_date: NullableDateString,
  subscription_start_date: NullableDateString,
  subscription_end_date: NullableDateString,
});

export const AssetUpdateBody = Type.Partial(
  Type.Object({
    name: Type.String({ minLength: 1 }),
    status: Type.String(),
    owner_department_id: Type.Union([Type.Integer(), Type.Null()]),
    current_custodian_identity_id: Type.Union([Type.Integer(), Type.Null()]),
    location_id: Type.Union([Type.Integer(), Type.Null()]),

    purchase_date: Type.Union([Type.String(), Type.Null()]),
    warranty_start_date: Type.Union([Type.String(), Type.Null()]),
    warranty_end_date: Type.Union([Type.String(), Type.Null()]),
    support_start_date: Type.Union([Type.String(), Type.Null()]),
    support_end_date: Type.Union([Type.String(), Type.Null()]),
    subscription_start_date: Type.Union([Type.String(), Type.Null()]),
    subscription_end_date: Type.Union([Type.String(), Type.Null()]),
  })
);

export const SimpleOkResponse = Type.Object({
  ok: Type.Boolean(),
  data: Type.Object({ id: Type.Integer() }),
  meta: Type.Object({ request_id: Type.String() }),
});