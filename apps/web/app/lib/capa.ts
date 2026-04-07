import { apiGet, apiPatchJson, apiPostJson } from './api';

export type CapaStatus =
  | 'OPEN'
  | 'ROOT_CAUSE'
  | 'CORRECTIVE_ACTION'
  | 'PREVENTIVE_ACTION'
  | 'VERIFICATION'
  | 'CLOSED'
  | 'CANCELLED';

export type CapaSourceType = 'INTERNAL_AUDIT_FINDING' | 'MANAGEMENT_REVIEW_ACTION_ITEM' | 'OTHER';
export type CapaSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

type ApiEnvelope<T> = {
  ok: boolean;
  data: T;
  meta?: unknown;
};

async function unwrapApiData<T>(promise: Promise<unknown>): Promise<T> {
  const response = (await promise) as ApiEnvelope<T>;
  return response.data;
}

function buildQueryString(params: Record<string, unknown>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return;
    searchParams.set(key, String(value));
  });

  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export type CapaCase = {
  id: number;
  tenant_id: number;
  capa_code: string;
  title: string;
  source_type: CapaSourceType;
  source_id: number | null;
  source_label: string | null;
  severity: CapaSeverity;
  status: CapaStatus;
  owner_identity_id: number | null;
  owner_identity_name: string | null;
  owner_identity_email: string | null;
  due_date: string | null;
  nonconformity_summary: string | null;
  root_cause_summary: string | null;
  corrective_action_summary: string | null;
  preventive_action_summary: string | null;
  verification_summary: string | null;
  closure_notes: string | null;
  notes: string | null;
  opened_at: string | null;
  root_caused_at: string | null;
  corrective_action_at: string | null;
  preventive_action_at: string | null;
  verified_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
  is_overdue: boolean;
};

export type CapaListSummary = {
  total_items: number;
  open_count: number;
  root_cause_count: number;
  corrective_action_count: number;
  preventive_action_count: number;
  verification_count: number;
  closed_count: number;
  cancelled_count: number;
  overdue_count: number;
};

export type CapaListResponse = {
  items: CapaCase[];
  summary: CapaListSummary;
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
};

export type CapaDetailResponse = CapaCase;

export type ListCapaParams = {
  q?: string;
  status?: CapaStatus | '';
  source_type?: CapaSourceType | '';
  severity?: CapaSeverity | '';
  owner_identity_id?: number;
  overdue_only?: boolean;
  page?: number;
  page_size?: number;
};

export type CreateCapaPayload = {
  capa_code: string;
  title: string;
  source_type?: CapaSourceType;
  source_id?: number | null;
  source_label?: string | null;
  severity?: CapaSeverity;
  owner_identity_id?: number | null;
  due_date?: string | null;
  nonconformity_summary?: string | null;
  notes?: string | null;
};

export type UpdateCapaPayload = Partial<CreateCapaPayload>;

export type RootCausePayload = {
  root_cause_summary: string;
  notes?: string | null;
};

export type CorrectiveActionPayload = {
  corrective_action_summary: string;
  notes?: string | null;
};

export type PreventiveActionPayload = {
  preventive_action_summary: string;
  notes?: string | null;
};

export type VerificationPayload = {
  verification_summary: string;
  notes?: string | null;
};

export type CloseCapaPayload = {
  closure_notes?: string | null;
};

export type CancelCapaPayload = {
  cancel_reason?: string | null;
};

export async function listCapas(params: ListCapaParams = {}): Promise<CapaListResponse> {
  const qs = buildQueryString(params);
  return unwrapApiData<CapaListResponse>(apiGet(`/api/v1/capa${qs}`));
}

export async function createCapa(payload: CreateCapaPayload): Promise<{ id: number }> {
  return unwrapApiData<{ id: number }>(apiPostJson('/api/v1/capa', payload));
}

export async function getCapa(id: number): Promise<CapaDetailResponse> {
  return unwrapApiData<CapaDetailResponse>(apiGet(`/api/v1/capa/${id}`));
}

export async function updateCapa(id: number, payload: UpdateCapaPayload): Promise<{ id: number }> {
  return unwrapApiData<{ id: number }>(apiPatchJson(`/api/v1/capa/${id}`, payload));
}

export async function setCapaRootCause(id: number, payload: RootCausePayload): Promise<{ id: number; status: CapaStatus }> {
  return unwrapApiData<{ id: number; status: CapaStatus }>(
    apiPostJson(`/api/v1/capa/${id}/root-cause`, payload),
  );
}

export async function setCapaCorrectiveAction(id: number, payload: CorrectiveActionPayload): Promise<{ id: number; status: CapaStatus }> {
  return unwrapApiData<{ id: number; status: CapaStatus }>(
    apiPostJson(`/api/v1/capa/${id}/corrective-action`, payload),
  );
}

export async function setCapaPreventiveAction(id: number, payload: PreventiveActionPayload): Promise<{ id: number; status: CapaStatus }> {
  return unwrapApiData<{ id: number; status: CapaStatus }>(
    apiPostJson(`/api/v1/capa/${id}/preventive-action`, payload),
  );
}

export async function setCapaVerification(id: number, payload: VerificationPayload): Promise<{ id: number; status: CapaStatus }> {
  return unwrapApiData<{ id: number; status: CapaStatus }>(
    apiPostJson(`/api/v1/capa/${id}/verification`, payload),
  );
}

export async function closeCapa(id: number, payload: CloseCapaPayload = {}): Promise<{ id: number; status: CapaStatus }> {
  return unwrapApiData<{ id: number; status: CapaStatus }>(
    apiPostJson(`/api/v1/capa/${id}/close`, payload),
  );
}

export async function cancelCapa(id: number, payload: CancelCapaPayload = {}): Promise<{ id: number; status: CapaStatus }> {
  return unwrapApiData<{ id: number; status: CapaStatus }>(
    apiPostJson(`/api/v1/capa/${id}/cancel`, payload),
  );
}
