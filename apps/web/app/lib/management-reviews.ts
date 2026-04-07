import { apiDelete, apiGet, apiPatchJson, apiPostJson } from './api';

export type ManagementReviewSessionStatus = 'DRAFT' | 'COMPLETED' | 'CANCELLED';
export type ManagementReviewActionItemStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

type ApiEnvelope<T> = {
  ok: boolean;
  data: T;
  meta?: unknown;
};

async function unwrapApiData<T>(promise: Promise<unknown>): Promise<T> {
  const response = (await promise) as ApiEnvelope<T>;
  return response.data;
}

export type ManagementReviewSession = {
  id: number;
  tenant_id: number;
  session_code: string;
  title: string;
  review_date: string;
  status: ManagementReviewSessionStatus;
  chairperson_identity_id: number | null;
  summary: string | null;
  minutes: string | null;
  notes: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  decision_count: number;
  action_item_count: number;
  open_action_item_count: number;
  done_action_item_count: number;
  cancelled_action_item_count: number;
  overdue_action_item_count: number;
};

export type ManagementReviewDecision = {
  id: number;
  tenant_id: number;
  session_id: number;
  decision_no: string | null;
  title: string;
  decision_text: string;
  owner_identity_id: number | null;
  target_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
};

export type ManagementReviewActionItem = {
  id: number;
  tenant_id: number;
  session_id: number;
  decision_id: number | null;
  action_no: string | null;
  title: string;
  description: string | null;
  owner_identity_id: number;
  due_date: string;
  status: ManagementReviewActionItemStatus;
  progress_notes: string | null;
  completion_notes: string | null;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  is_overdue: boolean;
  session_code?: string;
  session_title?: string;
  session_review_date?: string | null;
  session_status?: ManagementReviewSessionStatus;
};

export type ManagementReviewDetailResponse = {
  session: ManagementReviewSession;
  decisions: ManagementReviewDecision[];
  action_items: ManagementReviewActionItem[];
  summary: {
    decision_count: number;
    action_item_count: number;
    open_action_item_count: number;
    done_action_item_count: number;
    cancelled_action_item_count: number;
    overdue_action_item_count: number;
  };
};

export type PaginatedManagementReviewsResponse = {
  items: ManagementReviewSession[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export type PaginatedManagementReviewActionTrackerResponse = {
  items: ManagementReviewActionItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export type ListManagementReviewsParams = {
  q?: string;
  status?: ManagementReviewSessionStatus | '';
  page?: number;
  page_size?: number;
};

export type CreateManagementReviewPayload = {
  session_code: string;
  title: string;
  review_date: string;
  chairperson_identity_id?: number | null;
  summary?: string | null;
  minutes?: string | null;
  notes?: string | null;
};

export type UpdateManagementReviewPayload = Partial<CreateManagementReviewPayload>;

export type CreateManagementReviewDecisionPayload = {
  decision_no?: string | null;
  title: string;
  decision_text: string;
  owner_identity_id?: number | null;
  target_date?: string | null;
  sort_order?: number;
};

export type UpdateManagementReviewDecisionPayload = Partial<CreateManagementReviewDecisionPayload>;

export type CreateManagementReviewActionItemPayload = {
  decision_id?: number | null;
  action_no?: string | null;
  title: string;
  description?: string | null;
  owner_identity_id: number;
  due_date: string;
  status?: ManagementReviewActionItemStatus;
  progress_notes?: string | null;
  completion_notes?: string | null;
  sort_order?: number;
};

export type UpdateManagementReviewActionItemPayload =
  Partial<CreateManagementReviewActionItemPayload>;

export type ListManagementReviewActionTrackerParams = {
  q?: string;
  status?: ManagementReviewActionItemStatus | '';
  owner_identity_id?: number;
  overdue_only?: boolean;
  session_id?: number;
  page?: number;
  page_size?: number;
};

function buildQueryString(params: Record<string, unknown>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return;
    searchParams.set(key, String(value));
  });

  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export async function listManagementReviews(
  params: ListManagementReviewsParams = {},
): Promise<PaginatedManagementReviewsResponse> {
  const qs = buildQueryString(params);
  return unwrapApiData<PaginatedManagementReviewsResponse>(
    apiGet(`/api/v1/management-reviews${qs}`),
  );
}

export async function createManagementReview(
  payload: CreateManagementReviewPayload,
): Promise<ManagementReviewSession> {
  return unwrapApiData<ManagementReviewSession>(
    apiPostJson('/api/v1/management-reviews', payload),
  );
}

export async function getManagementReviewDetail(
  id: number,
): Promise<ManagementReviewDetailResponse> {
  return unwrapApiData<ManagementReviewDetailResponse>(
    apiGet(`/api/v1/management-reviews/${id}`),
  );
}

export async function updateManagementReview(
  id: number,
  payload: UpdateManagementReviewPayload,
): Promise<ManagementReviewSession> {
  return unwrapApiData<ManagementReviewSession>(
    apiPatchJson(`/api/v1/management-reviews/${id}`, payload),
  );
}

export async function completeManagementReview(
  id: number,
): Promise<ManagementReviewSession> {
  return unwrapApiData<ManagementReviewSession>(
    apiPostJson(`/api/v1/management-reviews/${id}/complete`, {}),
  );
}

export async function cancelManagementReview(
  id: number,
  payload: { cancel_reason?: string | null } = {},
): Promise<ManagementReviewSession> {
  return unwrapApiData<ManagementReviewSession>(
    apiPostJson(`/api/v1/management-reviews/${id}/cancel`, payload),
  );
}

export async function listManagementReviewDecisions(
  id: number,
): Promise<{ items: ManagementReviewDecision[] }> {
  return unwrapApiData<{ items: ManagementReviewDecision[] }>(
    apiGet(`/api/v1/management-reviews/${id}/decisions`),
  );
}

export async function createManagementReviewDecision(
  id: number,
  payload: CreateManagementReviewDecisionPayload,
): Promise<ManagementReviewDecision> {
  return unwrapApiData<ManagementReviewDecision>(
    apiPostJson(`/api/v1/management-reviews/${id}/decisions`, payload),
  );
}

export async function updateManagementReviewDecision(
  id: number,
  decisionId: number,
  payload: UpdateManagementReviewDecisionPayload,
): Promise<ManagementReviewDecision> {
  return unwrapApiData<ManagementReviewDecision>(
    apiPatchJson(`/api/v1/management-reviews/${id}/decisions/${decisionId}`, payload),
  );
}

export async function deleteManagementReviewDecision(
  id: number,
  decisionId: number,
): Promise<{ deleted: boolean }> {
  await apiDelete(`/api/v1/management-reviews/${id}/decisions/${decisionId}`);
  return { deleted: true };
}

export async function listManagementReviewActionItems(
  id: number,
): Promise<{ items: ManagementReviewActionItem[] }> {
  return unwrapApiData<{ items: ManagementReviewActionItem[] }>(
    apiGet(`/api/v1/management-reviews/${id}/action-items`),
  );
}

export async function createManagementReviewActionItem(
  id: number,
  payload: CreateManagementReviewActionItemPayload,
): Promise<ManagementReviewActionItem> {
  return unwrapApiData<ManagementReviewActionItem>(
    apiPostJson(`/api/v1/management-reviews/${id}/action-items`, payload),
  );
}

export async function updateManagementReviewActionItem(
  id: number,
  actionItemId: number,
  payload: UpdateManagementReviewActionItemPayload,
): Promise<ManagementReviewActionItem> {
  return unwrapApiData<ManagementReviewActionItem>(
    apiPatchJson(
      `/api/v1/management-reviews/${id}/action-items/${actionItemId}`,
      payload,
    ),
  );
}

export async function deleteManagementReviewActionItem(
  id: number,
  actionItemId: number,
): Promise<{ deleted: boolean }> {
  await apiDelete(`/api/v1/management-reviews/${id}/action-items/${actionItemId}`);
  return { deleted: true };
}

export async function listManagementReviewActionTracker(
  params: ListManagementReviewActionTrackerParams = {},
): Promise<PaginatedManagementReviewActionTrackerResponse> {
  const qs = buildQueryString(params);
  return unwrapApiData<PaginatedManagementReviewActionTrackerResponse>(
    apiGet(`/api/v1/management-reviews/action-items/tracker${qs}`),
  );
}