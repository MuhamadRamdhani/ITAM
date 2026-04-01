export const KPI_SOURCE_TYPES = Object.freeze([
  { code: 'MANUAL', label: 'Manual' },
  { code: 'SYSTEM', label: 'System' },
]);

export const KPI_DIRECTION_TYPES = Object.freeze([
  { code: 'HIGHER_IS_BETTER', label: 'Higher is better' },
  { code: 'LOWER_IS_BETTER', label: 'Lower is better' },
]);

export const KPI_PERIOD_TYPES = Object.freeze([
  { code: 'MONTHLY', label: 'Monthly' },
  { code: 'QUARTERLY', label: 'Quarterly' },
  { code: 'YEARLY', label: 'Yearly' },
]);

export const KPI_STATUS_CODES = Object.freeze([
  { code: 'ON_TRACK', label: 'On Track' },
  { code: 'WARNING', label: 'Warning' },
  { code: 'CRITICAL', label: 'Critical' },
  { code: 'NO_TARGET', label: 'No Target' },
  { code: 'MISSING', label: 'Missing' },
]);

export const KPI_CATEGORY_OPTIONS = Object.freeze([
  { code: 'ASSET_DATA_QUALITY', label: 'Asset Data Quality', display_order: 10 },
  { code: 'APPROVALS', label: 'Approvals', display_order: 20 },
  { code: 'CONTRACTS', label: 'Contracts', display_order: 30 },
  { code: 'LICENSE', label: 'License', display_order: 40 },
  { code: 'AUDIT', label: 'Audit', display_order: 50 },
  { code: 'GOVERNANCE', label: 'Governance', display_order: 60 },
  { code: 'SECURITY', label: 'Security', display_order: 70 },
  { code: 'IMPROVEMENT', label: 'Improvement', display_order: 80 },
  { code: 'OTHER', label: 'Other', display_order: 999 },
]);

export const KPI_UNIT_OPTIONS = Object.freeze([
  { code: 'PERCENT', label: 'Percent' },
  { code: 'COUNT', label: 'Count' },
  { code: 'DAYS', label: 'Days' },
  { code: 'HOURS', label: 'Hours' },
  { code: 'SCORE', label: 'Score' },
  { code: 'RATIO', label: 'Ratio' },
  { code: 'CURRENCY', label: 'Currency' },
]);

export const KPI_SYSTEM_METRICS = Object.freeze([
  {
    key: 'ASSET_OWNER_COMPLETENESS_PCT',
    name: 'Asset Ownership Completeness %',
    description: 'Percentage of assets that already have owner_department_id populated.',
    category_code: 'ASSET_DATA_QUALITY',
    default_unit_code: 'PERCENT',
    default_direction: 'HIGHER_IS_BETTER',
    supported_period_types: ['MONTHLY', 'QUARTERLY', 'YEARLY'],
  },
  {
    key: 'ASSET_CUSTODIAN_COMPLETENESS_PCT',
    name: 'Asset Custodian Completeness %',
    description: 'Percentage of assets that already have current_custodian_identity populated.',
    category_code: 'ASSET_DATA_QUALITY',
    default_unit_code: 'PERCENT',
    default_direction: 'HIGHER_IS_BETTER',
    supported_period_types: ['MONTHLY', 'QUARTERLY', 'YEARLY'],
  },
  {
    key: 'ASSET_LOCATION_COMPLETENESS_PCT',
    name: 'Asset Location Completeness %',
    description: 'Percentage of assets that already have location_id populated.',
    category_code: 'ASSET_DATA_QUALITY',
    default_unit_code: 'PERCENT',
    default_direction: 'HIGHER_IS_BETTER',
    supported_period_types: ['MONTHLY', 'QUARTERLY', 'YEARLY'],
  },
  {
    key: 'PENDING_APPROVAL_COUNT',
    name: 'Pending Approval Count',
    description: 'Count of approvals still in PENDING status.',
    category_code: 'APPROVALS',
    default_unit_code: 'COUNT',
    default_direction: 'LOWER_IS_BETTER',
    supported_period_types: ['MONTHLY', 'QUARTERLY', 'YEARLY'],
  },
  {
    key: 'CONTRACT_EXPIRING_30D_COUNT',
    name: 'Contracts Expiring in 30 Days Count',
    description: 'Count of active contracts whose end_date falls within the next 30 days.',
    category_code: 'CONTRACTS',
    default_unit_code: 'COUNT',
    default_direction: 'LOWER_IS_BETTER',
    supported_period_types: ['MONTHLY', 'QUARTERLY', 'YEARLY'],
  },
]);

export function getKpiMetadataCatalog() {
  return {
    source_types: KPI_SOURCE_TYPES,
    direction_types: KPI_DIRECTION_TYPES,
    period_types: KPI_PERIOD_TYPES,
    status_codes: KPI_STATUS_CODES,
    category_options: KPI_CATEGORY_OPTIONS,
    unit_options: KPI_UNIT_OPTIONS,
    system_metrics: KPI_SYSTEM_METRICS,
  };
}