import { apiDelete, apiGet, apiPatchJson, apiPostJson } from './api';

export type IdLike = string | number;

export type InternalAuditListItem = {
  id: IdLike;
  audit_code: string;
  audit_title: string;
  audit_type: string;
  status: string;
  scope_summary: string | null;
  objective: string | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  lead_auditor_identity_id: IdLike | null;
  lead_auditor_name: string | null;
  auditee_summary: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  findings_count: number;
  checklist_items_count: number;
};

export type InternalAuditPlan = InternalAuditListItem;

export type InternalAuditSummary = {
  members_count: number;
  sections_count: number;
  checklist_items_count: number;
  mandatory_items_count: number;
  assessed_items_count: number;
  findings_count: number;
  open_findings_count: number;
};

export type InternalAuditDetailResponse = {
  plan: InternalAuditPlan;
  summary: InternalAuditSummary;
};

export type InternalAuditMember = {
  id: IdLike;
  identity_id: IdLike;
  identity_name: string | null;
  identity_email: string | null;
  member_role: string;
  notes: string | null;
  created_at: string;
};

export type InternalAuditChecklistSection = {
  id: IdLike;
  title: string;
  description: string | null;
  clause_code: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type InternalAuditChecklistLatestResult = {
  id: IdLike;
  result_status: string;
  observation_notes: string | null;
  assessed_by_identity_id: IdLike | null;
  assessed_by_name: string | null;
  assessed_at: string;
};

export type InternalAuditChecklistItem = {
  id: IdLike;
  section_id: IdLike | null;
  section_title: string | null;
  item_code: string;
  requirement_text: string;
  expected_evidence: string | null;
  clause_code: string | null;
  sort_order: number;
  is_mandatory: boolean;
  created_at: string;
  updated_at: string;
  latest_result: InternalAuditChecklistLatestResult | null;
};

export type InternalAuditFinding = {
  id: IdLike;
  checklist_item_id: IdLike | null;
  finding_code: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  owner_identity_id: IdLike | null;
  owner_name: string | null;
  due_date: string | null;
  closed_at: string | null;
  closure_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type IdentityOption = {
  id: IdLike;
  display_name?: string | null;
  identity_name?: string | null;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
};

export type Pagination = {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
};

export type ListInternalAuditsResponse = {
  items: InternalAuditListItem[];
  pagination: Pagination;
};

export type CreateInternalAuditPayload = {
  audit_code: string;
  audit_title: string;
  audit_type: string;
  scope_summary?: string;
  objective?: string;
  planned_start_date?: string;
  planned_end_date?: string;
  lead_auditor_identity_id?: number;
  auditee_summary?: string;
  notes?: string;
};

export type UpdateInternalAuditPayload = Partial<CreateInternalAuditPayload>;

export type AddInternalAuditMemberPayload = {
  identity_id: number;
  member_role: string;
  notes?: string;
};

export type CreateChecklistSectionPayload = {
  title: string;
  description?: string;
  clause_code?: string;
  sort_order?: number;
};

export type UpdateChecklistSectionPayload = Partial<CreateChecklistSectionPayload>;

export type CreateChecklistItemPayload = {
  section_id?: number;
  item_code: string;
  requirement_text: string;
  expected_evidence?: string;
  clause_code?: string;
  sort_order?: number;
  is_mandatory?: boolean;
};

export type UpdateChecklistItemPayload = Partial<CreateChecklistItemPayload>;

export type RecordChecklistResultPayload = {
  result_status: string;
  observation_notes?: string;
  assessed_by_identity_id?: number;
};

export type CreateFindingPayload = {
  checklist_item_id?: number;
  finding_code: string;
  title: string;
  description: string;
  severity: string;
  owner_identity_id?: number;
  due_date?: string;
};

export type UpdateFindingPayload = Partial<CreateFindingPayload> & {
  status?: string;
};

function unwrapData<T>(response: unknown): T {
  if (
    response &&
    typeof response === 'object' &&
    'data' in response &&
    (response as { data?: unknown }).data !== undefined
  ) {
    return (response as { data: T }).data;
  }

  return response as T;
}

function qs(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    sp.set(key, String(value));
  }

  const query = sp.toString();
  return query ? `?${query}` : '';
}

export async function listInternalAudits(params: {
  page?: number;
  page_size?: number;
  q?: string;
  status?: string;
  audit_type?: string;
} = {}): Promise<ListInternalAuditsResponse> {
  const res = await apiGet(
    `/api/v1/internal-audits${qs({
      page: params.page ?? 1,
      page_size: params.page_size ?? 25,
      q: params.q,
      status: params.status ?? 'ALL',
      audit_type: params.audit_type ?? 'ALL',
    })}`
  );

  return unwrapData<ListInternalAuditsResponse>(res);
}

export async function createInternalAudit(
  payload: CreateInternalAuditPayload
): Promise<{ id: IdLike }> {
  const res = await apiPostJson('/api/v1/internal-audits', payload);
  return unwrapData<{ id: IdLike }>(res);
}

export async function getInternalAuditDetail(
  auditId: IdLike
): Promise<InternalAuditDetailResponse> {
  const res = await apiGet(`/api/v1/internal-audits/${auditId}`);
  return unwrapData<InternalAuditDetailResponse>(res);
}

export async function updateInternalAudit(
  auditId: IdLike,
  payload: UpdateInternalAuditPayload
): Promise<{ id: IdLike }> {
  const res = await apiPatchJson(`/api/v1/internal-audits/${auditId}`, payload);
  return unwrapData<{ id: IdLike }>(res);
}

export async function startInternalAudit(
  auditId: IdLike
): Promise<{ status: string; actual_start_date?: string | null }> {
  const res = await apiPostJson(`/api/v1/internal-audits/${auditId}/start`, {});
  return unwrapData<{ status: string; actual_start_date?: string | null }>(res);
}

export async function completeInternalAudit(
  auditId: IdLike
): Promise<{ status: string; actual_end_date?: string | null }> {
  const res = await apiPostJson(`/api/v1/internal-audits/${auditId}/complete`, {});
  return unwrapData<{ status: string; actual_end_date?: string | null }>(res);
}

export async function cancelInternalAudit(
  auditId: IdLike,
  payload: { notes?: string } = {}
): Promise<{ status: string }> {
  const res = await apiPostJson(`/api/v1/internal-audits/${auditId}/cancel`, payload);
  return unwrapData<{ status: string }>(res);
}

export async function listInternalAuditMembers(
  auditId: IdLike
): Promise<{ items: InternalAuditMember[] }> {
  const res = await apiGet(`/api/v1/internal-audits/${auditId}/members`);
  return unwrapData<{ items: InternalAuditMember[] }>(res);
}

export async function addInternalAuditMember(
  auditId: IdLike,
  payload: AddInternalAuditMemberPayload
): Promise<{ id: IdLike }> {
  const res = await apiPostJson(`/api/v1/internal-audits/${auditId}/members`, payload);
  return unwrapData<{ id: IdLike }>(res);
}

export async function deleteInternalAuditMember(
  auditId: IdLike,
  memberId: IdLike
): Promise<void> {
  await apiDelete(`/api/v1/internal-audits/${auditId}/members/${memberId}`);
}

export async function listInternalAuditChecklistSections(
  auditId: IdLike
): Promise<{ items: InternalAuditChecklistSection[] }> {
  const res = await apiGet(`/api/v1/internal-audits/${auditId}/checklist-sections`);
  return unwrapData<{ items: InternalAuditChecklistSection[] }>(res);
}

export async function createInternalAuditChecklistSection(
  auditId: IdLike,
  payload: CreateChecklistSectionPayload
): Promise<{ id: IdLike }> {
  const res = await apiPostJson(
    `/api/v1/internal-audits/${auditId}/checklist-sections`,
    payload
  );
  return unwrapData<{ id: IdLike }>(res);
}

export async function updateInternalAuditChecklistSection(
  auditId: IdLike,
  sectionId: IdLike,
  payload: UpdateChecklistSectionPayload
): Promise<{ id: IdLike }> {
  const res = await apiPatchJson(
    `/api/v1/internal-audits/${auditId}/checklist-sections/${sectionId}`,
    payload
  );
  return unwrapData<{ id: IdLike }>(res);
}

export async function listInternalAuditChecklistItems(
  auditId: IdLike
): Promise<{ items: InternalAuditChecklistItem[] }> {
  const res = await apiGet(`/api/v1/internal-audits/${auditId}/checklist-items`);
  return unwrapData<{ items: InternalAuditChecklistItem[] }>(res);
}

export async function createInternalAuditChecklistItem(
  auditId: IdLike,
  payload: CreateChecklistItemPayload
): Promise<{ id: IdLike }> {
  const res = await apiPostJson(
    `/api/v1/internal-audits/${auditId}/checklist-items`,
    payload
  );
  return unwrapData<{ id: IdLike }>(res);
}

export async function updateInternalAuditChecklistItem(
  auditId: IdLike,
  itemId: IdLike,
  payload: UpdateChecklistItemPayload
): Promise<{ id: IdLike }> {
  const res = await apiPatchJson(
    `/api/v1/internal-audits/${auditId}/checklist-items/${itemId}`,
    payload
  );
  return unwrapData<{ id: IdLike }>(res);
}

export async function recordInternalAuditChecklistResult(
  auditId: IdLike,
  itemId: IdLike,
  payload: RecordChecklistResultPayload
): Promise<{ id: IdLike }> {
  const res = await apiPostJson(
    `/api/v1/internal-audits/${auditId}/checklist-items/${itemId}/results`,
    payload
  );
  return unwrapData<{ id: IdLike }>(res);
}

export async function listInternalAuditFindings(
  auditId: IdLike
): Promise<{ items: InternalAuditFinding[] }> {
  const res = await apiGet(`/api/v1/internal-audits/${auditId}/findings`);
  return unwrapData<{ items: InternalAuditFinding[] }>(res);
}

export async function createInternalAuditFinding(
  auditId: IdLike,
  payload: CreateFindingPayload
): Promise<{ id: IdLike }> {
  const res = await apiPostJson(`/api/v1/internal-audits/${auditId}/findings`, payload);
  return unwrapData<{ id: IdLike }>(res);
}

export async function updateInternalAuditFinding(
  auditId: IdLike,
  findingId: IdLike,
  payload: UpdateFindingPayload
): Promise<{ id: IdLike }> {
  const res = await apiPatchJson(
    `/api/v1/internal-audits/${auditId}/findings/${findingId}`,
    payload
  );
  return unwrapData<{ id: IdLike }>(res);
}

export async function closeInternalAuditFinding(
  auditId: IdLike,
  findingId: IdLike,
  payload: { closure_notes?: string } = {}
): Promise<{ id: IdLike; status: string }> {
  const res = await apiPostJson(
    `/api/v1/internal-audits/${auditId}/findings/${findingId}/close`,
    payload
  );
  return unwrapData<{ id: IdLike; status: string }>(res);
}

export async function listIdentityOptions(
  params: {
    page?: number;
    page_size?: number;
    q?: string;
  } = {}
): Promise<{ items: IdentityOption[] }> {
  const res = await apiGet(
    `/api/v1/identities${qs({
      page: params.page ?? 1,
      page_size: params.page_size ?? 25,
      q: params.q,
    })}`
  );

  return unwrapData<{ items: IdentityOption[] }>(res);
}

export function getIdentityLabel(identity: IdentityOption) {
  return (
    identity.display_name ||
    identity.identity_name ||
    identity.full_name ||
    identity.name ||
    identity.email ||
    String(identity.id)
  );
}