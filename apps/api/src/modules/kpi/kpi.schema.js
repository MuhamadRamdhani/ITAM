const kpiDefinitionProperties = {
  id: { type: 'integer' },
  tenant_id: { type: 'integer' },
  code: { type: 'string' },
  name: { type: 'string' },
  description: { type: ['string', 'null'] },
  category_code: { type: 'string' },
  unit_code: { type: 'string' },
  source_type: { type: 'string' },
  metric_key: { type: ['string', 'null'] },
  direction: { type: 'string' },
  period_type: { type: 'string' },
  target_value: { type: ['number', 'null'] },
  warning_value: { type: ['number', 'null'] },
  critical_value: { type: ['number', 'null'] },
  baseline_value: { type: ['number', 'null'] },
  owner_identity_id: { type: ['integer', 'null'] },
  is_active: { type: 'boolean' },
  display_order: { type: 'integer' },
  created_by_user_id: { type: ['integer', 'null'] },
  updated_by_user_id: { type: ['integer', 'null'] },
  created_at: { type: 'string' },
  updated_at: { type: 'string' },
};

const kpiDefinitionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: kpiDefinitionProperties,
  required: [
    'id',
    'tenant_id',
    'code',
    'name',
    'description',
    'category_code',
    'unit_code',
    'source_type',
    'metric_key',
    'direction',
    'period_type',
    'target_value',
    'warning_value',
    'critical_value',
    'baseline_value',
    'owner_identity_id',
    'is_active',
    'display_order',
    'created_by_user_id',
    'updated_by_user_id',
    'created_at',
    'updated_at',
  ],
};

const kpiMeasurementProperties = {
  id: { type: 'integer' },
  tenant_id: { type: 'integer' },
  kpi_definition_id: { type: 'integer' },
  period_type: { type: 'string' },
  period_key: { type: 'string' },
  period_start_date: { type: 'string' },
  period_end_date: { type: 'string' },
  target_value_snapshot: { type: ['number', 'null'] },
  warning_value_snapshot: { type: ['number', 'null'] },
  critical_value_snapshot: { type: ['number', 'null'] },
  baseline_value_snapshot: { type: ['number', 'null'] },
  actual_value: { type: 'number' },
  achievement_pct: { type: ['number', 'null'] },
  status_code: { type: 'string' },
  measurement_source_type: { type: 'string' },
  measurement_note: { type: ['string', 'null'] },
  source_snapshot_json: {
    type: ['object', 'null'],
    additionalProperties: true,
  },
  measured_at: { type: 'string' },
  measured_by_user_id: { type: ['integer', 'null'] },
  created_at: { type: 'string' },
  updated_at: { type: 'string' },
};

const kpiMeasurementSchema = {
  type: 'object',
  additionalProperties: false,
  properties: kpiMeasurementProperties,
  required: [
    'id',
    'tenant_id',
    'kpi_definition_id',
    'period_type',
    'period_key',
    'period_start_date',
    'period_end_date',
    'target_value_snapshot',
    'warning_value_snapshot',
    'critical_value_snapshot',
    'baseline_value_snapshot',
    'actual_value',
    'achievement_pct',
    'status_code',
    'measurement_source_type',
    'measurement_note',
    'source_snapshot_json',
    'measured_at',
    'measured_by_user_id',
    'created_at',
    'updated_at',
  ],
};

const scorecardItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kpi_id: { type: 'integer' },
    code: { type: 'string' },
    name: { type: 'string' },
    description: { type: ['string', 'null'] },
    category_code: { type: 'string' },
    unit_code: { type: 'string' },
    source_type: { type: 'string' },
    metric_key: { type: ['string', 'null'] },
    direction: { type: 'string' },
    period_type: { type: 'string' },
    period_key: { type: 'string' },
    target_value: { type: ['number', 'null'] },
    warning_value: { type: ['number', 'null'] },
    critical_value: { type: ['number', 'null'] },
    baseline_value: { type: ['number', 'null'] },
    actual_value: { type: ['number', 'null'] },
    achievement_pct: { type: ['number', 'null'] },
    status_code: { type: 'string' },
    measurement_id: { type: ['integer', 'null'] },
    measured_at: { type: ['string', 'null'] },
    measurement_source_type: { type: ['string', 'null'] },
    measurement_note: { type: ['string', 'null'] },
  },
  required: [
    'kpi_id',
    'code',
    'name',
    'description',
    'category_code',
    'unit_code',
    'source_type',
    'metric_key',
    'direction',
    'period_type',
    'period_key',
    'target_value',
    'warning_value',
    'critical_value',
    'baseline_value',
    'actual_value',
    'achievement_pct',
    'status_code',
    'measurement_id',
    'measured_at',
    'measurement_source_type',
    'measurement_note',
  ],
};

export const getKpiMetadataSchema = {
  tags: ['KPI'],
  summary: 'Get KPI metadata catalog',
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean' },
        data: {
          type: 'object',
          additionalProperties: true,
        },
      },
      required: ['ok', 'data'],
    },
  },
};

export const getKpiSystemMetricsSchema = {
  tags: ['KPI'],
  summary: 'Get supported KPI system metrics',
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean' },
        data: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
              },
            },
          },
          required: ['items'],
        },
      },
      required: ['ok', 'data'],
    },
  },
};

export const listKpisSchema = {
  tags: ['KPI'],
  summary: 'List KPI definitions',
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      q: { type: 'string' },
      category_code: { type: 'string' },
      source_type: { type: 'string' },
      period_type: { type: 'string' },
      is_active: { anyOf: [{ type: 'boolean' }, { type: 'string' }] },
      page: { anyOf: [{ type: 'integer' }, { type: 'string' }] },
      page_size: { anyOf: [{ type: 'integer' }, { type: 'string' }] },
    },
  },
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean' },
        data: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: kpiDefinitionSchema,
            },
            page: { type: 'integer' },
            page_size: { type: 'integer' },
            total: { type: 'integer' },
            total_pages: { type: 'integer' },
          },
          required: ['items', 'page', 'page_size', 'total', 'total_pages'],
        },
      },
      required: ['ok', 'data'],
    },
  },
};

export const createKpiSchema = {
  tags: ['KPI'],
  summary: 'Create KPI definition',
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      code: { type: 'string' },
      name: { type: 'string' },
      description: { type: ['string', 'null'] },
      category_code: { type: 'string' },
      unit_code: { type: 'string' },
      source_type: { type: 'string' },
      metric_key: { type: ['string', 'null'] },
      direction: { type: 'string' },
      period_type: { type: 'string' },
      target_value: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }] },
      warning_value: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }] },
      critical_value: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }] },
      baseline_value: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }] },
      owner_identity_id: { anyOf: [{ type: 'integer' }, { type: 'string' }, { type: 'null' }] },
      is_active: { anyOf: [{ type: 'boolean' }, { type: 'string' }] },
      display_order: { anyOf: [{ type: 'integer' }, { type: 'string' }] },
    },
    required: ['code', 'name', 'source_type', 'period_type'],
  },
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean' },
        data: kpiDefinitionSchema,
      },
      required: ['ok', 'data'],
    },
  },
};

export const getKpiDetailSchema = {
  tags: ['KPI'],
  summary: 'Get KPI definition detail',
  params: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { anyOf: [{ type: 'integer' }, { type: 'string' }] },
    },
    required: ['id'],
  },
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean' },
        data: kpiDefinitionSchema,
      },
      required: ['ok', 'data'],
    },
  },
};

export const updateKpiSchema = {
  tags: ['KPI'],
  summary: 'Update KPI definition',
  params: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { anyOf: [{ type: 'integer' }, { type: 'string' }] },
    },
    required: ['id'],
  },
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      code: { type: 'string' },
      name: { type: 'string' },
      description: { type: ['string', 'null'] },
      category_code: { type: 'string' },
      unit_code: { type: 'string' },
      source_type: { type: 'string' },
      metric_key: { type: ['string', 'null'] },
      direction: { type: 'string' },
      period_type: { type: 'string' },
      target_value: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }] },
      warning_value: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }] },
      critical_value: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }] },
      baseline_value: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }] },
      owner_identity_id: { anyOf: [{ type: 'integer' }, { type: 'string' }, { type: 'null' }] },
      is_active: { anyOf: [{ type: 'boolean' }, { type: 'string' }] },
      display_order: { anyOf: [{ type: 'integer' }, { type: 'string' }] },
    },
  },
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean' },
        data: kpiDefinitionSchema,
      },
      required: ['ok', 'data'],
    },
  },
};

export const listKpiMeasurementsSchema = {
  tags: ['KPI'],
  summary: 'List KPI measurements',
  params: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { anyOf: [{ type: 'integer' }, { type: 'string' }] },
    },
    required: ['id'],
  },
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      period_key_from: { type: 'string' },
      period_key_to: { type: 'string' },
      page: { anyOf: [{ type: 'integer' }, { type: 'string' }] },
      page_size: { anyOf: [{ type: 'integer' }, { type: 'string' }] },
    },
  },
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean' },
        data: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: kpiMeasurementSchema,
            },
            page: { type: 'integer' },
            page_size: { type: 'integer' },
            total: { type: 'integer' },
            total_pages: { type: 'integer' },
          },
          required: ['items', 'page', 'page_size', 'total', 'total_pages'],
        },
      },
      required: ['ok', 'data'],
    },
  },
};

export const createKpiMeasurementSchema = {
  tags: ['KPI'],
  summary: 'Create KPI measurement snapshot',
  params: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { anyOf: [{ type: 'integer' }, { type: 'string' }] },
    },
    required: ['id'],
  },
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      period_type: { type: 'string' },
      period_key: { type: 'string' },
      actual_value: { anyOf: [{ type: 'number' }, { type: 'string' }] },
      measurement_note: { type: ['string', 'null'] },
      source_snapshot_json: {
        anyOf: [
          {
            type: 'object',
            additionalProperties: true,
          },
          { type: 'null' },
        ],
      },
    },
    required: ['period_key'],
  },
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean' },
        data: kpiMeasurementSchema,
      },
      required: ['ok', 'data'],
    },
  },
};

export const updateKpiMeasurementSchema = {
  tags: ['KPI'],
  summary: 'Update KPI measurement snapshot',
  params: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { anyOf: [{ type: 'integer' }, { type: 'string' }] },
      measurementId: { anyOf: [{ type: 'integer' }, { type: 'string' }] },
    },
    required: ['id', 'measurementId'],
  },
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      actual_value: { anyOf: [{ type: 'number' }, { type: 'string' }] },
      measurement_note: { type: ['string', 'null'] },
      source_snapshot_json: {
        anyOf: [
          {
            type: 'object',
            additionalProperties: true,
          },
          { type: 'null' },
        ],
      },
    },
  },
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean' },
        data: kpiMeasurementSchema,
      },
      required: ['ok', 'data'],
    },
  },
};

export const getKpiScorecardSummarySchema = {
  tags: ['KPI'],
  summary: 'Get KPI scorecard summary by period',
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      period_type: { type: 'string' },
      period_key: { type: 'string' },
    },
    required: ['period_type', 'period_key'],
  },
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean' },
        data: {
          type: 'object',
          additionalProperties: false,
          properties: {
            period_type: { type: 'string' },
            period_key: { type: 'string' },
            period_start_date: { type: 'string' },
            period_end_date: { type: 'string' },
            summary: {
              type: 'object',
              additionalProperties: false,
              properties: {
                total_kpis: { type: 'integer' },
                on_track_count: { type: 'integer' },
                warning_count: { type: 'integer' },
                critical_count: { type: 'integer' },
                no_target_count: { type: 'integer' },
                missing_count: { type: 'integer' },
              },
              required: [
                'total_kpis',
                'on_track_count',
                'warning_count',
                'critical_count',
                'no_target_count',
                'missing_count',
              ],
            },
            items: {
              type: 'array',
              items: scorecardItemSchema,
            },
          },
          required: [
            'period_type',
            'period_key',
            'period_start_date',
            'period_end_date',
            'summary',
            'items',
          ],
        },
      },
      required: ['ok', 'data'],
    },
  },
};

export const getKpiTrendSchema = {
  tags: ['KPI'],
  summary: 'Get KPI trend series',
  params: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { anyOf: [{ type: 'integer' }, { type: 'string' }] },
    },
    required: ['id'],
  },
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      period_key_from: { type: 'string' },
      period_key_to: { type: 'string' },
    },
  },
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean' },
        data: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kpi: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'integer' },
                code: { type: 'string' },
                name: { type: 'string' },
                category_code: { type: 'string' },
                unit_code: { type: 'string' },
                source_type: { type: 'string' },
                metric_key: { type: ['string', 'null'] },
                direction: { type: 'string' },
                period_type: { type: 'string' },
                target_value: { type: ['number', 'null'] },
                warning_value: { type: ['number', 'null'] },
                critical_value: { type: ['number', 'null'] },
                baseline_value: { type: ['number', 'null'] },
              },
              required: [
                'id',
                'code',
                'name',
                'category_code',
                'unit_code',
                'source_type',
                'metric_key',
                'direction',
                'period_type',
                'target_value',
                'warning_value',
                'critical_value',
                'baseline_value',
              ],
            },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  period_key: { type: 'string' },
                  period_start_date: { type: 'string' },
                  period_end_date: { type: 'string' },
                  actual_value: { type: 'number' },
                  target_value: { type: ['number', 'null'] },
                  warning_value: { type: ['number', 'null'] },
                  critical_value: { type: ['number', 'null'] },
                  baseline_value: { type: ['number', 'null'] },
                  achievement_pct: { type: ['number', 'null'] },
                  status_code: { type: 'string' },
                  measured_at: { type: 'string' },
                },
                required: [
                  'period_key',
                  'period_start_date',
                  'period_end_date',
                  'actual_value',
                  'target_value',
                  'warning_value',
                  'critical_value',
                  'baseline_value',
                  'achievement_pct',
                  'status_code',
                  'measured_at',
                ],
              },
            },
          },
          required: ['kpi', 'items'],
        },
      },
      required: ['ok', 'data'],
    },
  },
};
