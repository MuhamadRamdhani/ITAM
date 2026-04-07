'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CreateManagementReviewActionItemPayload,
  CreateManagementReviewDecisionPayload,
  ManagementReviewActionItem,
  ManagementReviewActionItemStatus,
  ManagementReviewDetailResponse,
  ManagementReviewSessionStatus,
  cancelManagementReview,
  completeManagementReview,
  createManagementReviewActionItem,
  createManagementReviewDecision,
  deleteManagementReviewActionItem,
  deleteManagementReviewDecision,
  getManagementReviewDetail,
  updateManagementReview,
  updateManagementReviewActionItem,
  updateManagementReviewDecision,
} from '../../lib/management-reviews';
import {
  IdentityOption,
  getIdentityLabel,
  listIdentityOptions,
} from '../../lib/internal-audits';

type Props = {
  reviewId: number;
};

type IdentitySelectOption = {
  id: number;
  label: string;
};

function normalizeIdentityOptions(input: unknown): IdentitySelectOption[] {
  const rawItems = Array.isArray(input)
    ? input
    : Array.isArray((input as { items?: unknown[] } | null)?.items)
      ? ((input as { items?: unknown[] }).items ?? [])
      : [];

  return rawItems
    .map((item) => {
      const raw = item as IdentityOption & { id?: string | number };
      const id = Number(raw.id);

      if (!Number.isFinite(id) || id <= 0) {
        return null;
      }

      return {
        id,
        label: getIdentityLabel(raw),
      };
    })
    .filter((item): item is IdentitySelectOption => item !== null);
}

type OverviewFormState = {
  session_code: string;
  title: string;
  review_date: string;
  chairperson_identity_id: string;
  summary: string;
  minutes: string;
  notes: string;
};

type DecisionFormState = {
  decision_no: string;
  title: string;
  decision_text: string;
  owner_identity_id: string;
  target_date: string;
  sort_order: string;
};

type ActionItemFormState = {
  decision_id: string;
  action_no: string;
  title: string;
  description: string;
  owner_identity_id: string;
  due_date: string;
  status: ManagementReviewActionItemStatus;
  progress_notes: string;
  completion_notes: string;
  sort_order: string;
};

type DecisionEditDraft = {
  decision_no: string;
  title: string;
  decision_text: string;
  owner_identity_id: string;
  target_date: string;
  sort_order: string;
};

type ActionItemEditDraft = {
  decision_id: string;
  action_no: string;
  title: string;
  description: string;
  owner_identity_id: string;
  due_date: string;
  status: ManagementReviewActionItemStatus;
  progress_notes: string;
  completion_notes: string;
  sort_order: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong.';
}

function statusBadgeClass(status: ManagementReviewSessionStatus) {
  switch (status) {
    case 'DRAFT':
      return 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200';
    case 'COMPLETED':
      return 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200';
    case 'CANCELLED':
      return 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200';
    default:
      return 'bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200';
  }
}

function actionStatusBadgeClass(status: ManagementReviewActionItemStatus) {
  switch (status) {
    case 'OPEN':
      return 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200';
    case 'IN_PROGRESS':
      return 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200';
    case 'DONE':
      return 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200';
    case 'CANCELLED':
      return 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200';
    default:
      return 'bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200';
  }
}

function emptyOverviewForm(): OverviewFormState {
  return {
    session_code: '',
    title: '',
    review_date: '',
    chairperson_identity_id: '',
    summary: '',
    minutes: '',
    notes: '',
  };
}

function emptyDecisionForm(): DecisionFormState {
  return {
    decision_no: '',
    title: '',
    decision_text: '',
    owner_identity_id: '',
    target_date: '',
    sort_order: '0',
  };
}

function emptyActionItemForm(): ActionItemFormState {
  return {
    decision_id: '',
    action_no: '',
    title: '',
    description: '',
    owner_identity_id: '',
    due_date: '',
    status: 'OPEN',
    progress_notes: '',
    completion_notes: '',
    sort_order: '0',
  };
}

function buildDecisionDrafts(
  decisions: ManagementReviewDetailResponse['decisions'],
): Record<number, DecisionEditDraft> {
  const next: Record<number, DecisionEditDraft> = {};
  for (const decision of decisions) {
    next[decision.id] = {
      decision_no: decision.decision_no ?? '',
      title: decision.title ?? '',
      decision_text: decision.decision_text ?? '',
      owner_identity_id: decision.owner_identity_id
        ? String(decision.owner_identity_id)
        : '',
      target_date: decision.target_date ?? '',
      sort_order: String(decision.sort_order ?? 0),
    };
  }
  return next;
}

function buildActionDrafts(items: ManagementReviewActionItem[]) {
  const next: Record<number, ActionItemEditDraft> = {};
  for (const item of items) {
    next[item.id] = {
      decision_id: item.decision_id ? String(item.decision_id) : '',
      action_no: item.action_no ?? '',
      title: item.title ?? '',
      description: item.description ?? '',
      owner_identity_id: item.owner_identity_id
        ? String(item.owner_identity_id)
        : '',
      due_date: item.due_date ?? '',
      status: item.status,
      progress_notes: item.progress_notes ?? '',
      completion_notes: item.completion_notes ?? '',
      sort_order: String(item.sort_order ?? 0),
    };
  }
  return next;
}

export default function ManagementReviewDetailClient({ reviewId }: Props) {
  const [detail, setDetail] = useState<ManagementReviewDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingOverview, setSavingOverview] = useState(false);
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [submittingActionItem, setSubmittingActionItem] = useState(false);
  const [processingSessionAction, setProcessingSessionAction] = useState(false);
  const [updatingDecisionId, setUpdatingDecisionId] = useState<number | null>(null);
  const [deletingDecisionId, setDeletingDecisionId] = useState<number | null>(null);
  const [updatingActionItemId, setUpdatingActionItemId] = useState<number | null>(null);
  const [deletingActionItemId, setDeletingActionItemId] = useState<number | null>(null);

  const [identityOptions, setIdentityOptions] = useState<IdentitySelectOption[]>([]);
  const [loadingIdentityOptions, setLoadingIdentityOptions] = useState(true);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [overviewForm, setOverviewForm] = useState<OverviewFormState>(emptyOverviewForm());
  const [decisionForm, setDecisionForm] = useState<DecisionFormState>(emptyDecisionForm());
  const [actionItemForm, setActionItemForm] = useState<ActionItemFormState>(emptyActionItemForm());
  const [decisionDrafts, setDecisionDrafts] = useState<Record<number, DecisionEditDraft>>({});
  const [actionDrafts, setActionDrafts] = useState<Record<number, ActionItemEditDraft>>({});

  const loadIdentityOptions = useCallback(async () => {
    setLoadingIdentityOptions(true);
    try {
      const result = await listIdentityOptions();
      setIdentityOptions(normalizeIdentityOptions(result));
    } catch {
      setIdentityOptions([]);
    } finally {
      setLoadingIdentityOptions(false);
    }
  }, []);

  const loadDetail = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!Number.isFinite(reviewId) || reviewId <= 0) {
        setErrorMessage('Invalid management review id.');
        setLoading(false);
        return;
      }

      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);

      setErrorMessage(null);

      try {
        const response = await getManagementReviewDetail(reviewId);
        setDetail(response);
        setOverviewForm({
          session_code: response.session.session_code ?? '',
          title: response.session.title ?? '',
          review_date: response.session.review_date ?? '',
          chairperson_identity_id: response.session.chairperson_identity_id
            ? String(response.session.chairperson_identity_id)
            : '',
          summary: response.session.summary ?? '',
          minutes: response.session.minutes ?? '',
          notes: response.session.notes ?? '',
        });
        setDecisionDrafts(buildDecisionDrafts(response.decisions ?? []));
        setActionDrafts(buildActionDrafts(response.action_items ?? []));
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
        setDetail(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [reviewId],
  );

  useEffect(() => {
    loadDetail('initial');
    loadIdentityOptions();
  }, [loadDetail, loadIdentityOptions]);

  useEffect(() => {
    if (!successMessage && !errorMessage) return;

    const timer = window.setTimeout(() => {
      setSuccessMessage(null);
      setErrorMessage(null);
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [successMessage, errorMessage]);

  const session = detail?.session ?? null;
  const summary = detail?.summary ?? null;
  const decisions = detail?.decisions ?? [];
  const actionItems = detail?.action_items ?? [];

  const isDraft = session?.status === 'DRAFT';
  const isCompleted = session?.status === 'COMPLETED';
  const isCancelled = session?.status === 'CANCELLED';

  const identityMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const option of identityOptions) {
      map.set(option.id, option.label);
    }
    return map;
  }, [identityOptions]);

  const decisionLabelMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const decision of decisions) {
      const label = decision.decision_no?.trim()
        ? `${decision.decision_no} — ${decision.title}`
        : decision.title;
      map.set(decision.id, label);
    }
    return map;
  }, [decisions]);

  const getIdentityName = useCallback(
    (identityId: number | null | undefined) => {
      if (!identityId) return '-';
      const label = identityMap.get(identityId);
      if (!label) return `Identity #${identityId}`;
      return `${label} (ID: ${identityId})`;
    },
    [identityMap],
  );

  const getDecisionName = useCallback(
    (decisionId: number | null | undefined) => {
      if (!decisionId) return '-';
      const label = decisionLabelMap.get(decisionId);
      if (!label) return `Decision #${decisionId}`;
      return `${label} (ID: ${decisionId})`;
    },
    [decisionLabelMap],
  );

  const readOnlyNotice = useMemo(() => {
    if (isCompleted) {
      return 'This management review session is COMPLETED. Structure is read-only, but action item follow-up can still be updated.';
    }
    if (isCancelled) {
      return 'This management review session is CANCELLED and fully read-only.';
    }
    return null;
  }, [isCancelled, isCompleted]);

  async function handleSaveOverview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    setSavingOverview(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await updateManagementReview(session.id, {
        session_code: overviewForm.session_code.trim(),
        title: overviewForm.title.trim(),
        review_date: overviewForm.review_date,
        chairperson_identity_id: overviewForm.chairperson_identity_id
          ? Number(overviewForm.chairperson_identity_id)
          : null,
        summary: overviewForm.summary.trim() || null,
        minutes: overviewForm.minutes.trim() || null,
        notes: overviewForm.notes.trim() || null,
      });

      setSuccessMessage('Overview updated successfully.');
      await loadDetail('refresh');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSavingOverview(false);
    }
  }

  async function handleComplete() {
    if (!session) return;
    if (!window.confirm('Complete this management review session?')) return;

    setProcessingSessionAction(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await completeManagementReview(session.id);
      setSuccessMessage('Management review session completed successfully.');
      await loadDetail('refresh');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setProcessingSessionAction(false);
    }
  }

  async function handleCancel() {
    if (!session) return;
    const cancelReason = window.prompt('Cancel reason (optional):') ?? '';

    if (!window.confirm('Cancel this management review session?')) return;

    setProcessingSessionAction(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await cancelManagementReview(session.id, {
        cancel_reason: cancelReason.trim() || null,
      });
      setSuccessMessage('Management review session cancelled successfully.');
      await loadDetail('refresh');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setProcessingSessionAction(false);
    }
  }

  async function handleCreateDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    setSubmittingDecision(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const payload: CreateManagementReviewDecisionPayload = {
      decision_no: decisionForm.decision_no.trim() || null,
      title: decisionForm.title.trim(),
      decision_text: decisionForm.decision_text.trim(),
      owner_identity_id: decisionForm.owner_identity_id
        ? Number(decisionForm.owner_identity_id)
        : null,
      target_date: decisionForm.target_date || null,
      sort_order: Number(decisionForm.sort_order || 0),
    };

    try {
      await createManagementReviewDecision(session.id, payload);
      setDecisionForm(emptyDecisionForm());
      setSuccessMessage('Decision created successfully.');
      await loadDetail('refresh');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSubmittingDecision(false);
    }
  }

  async function handleUpdateDecision(decisionId: number) {
    if (!session) return;
    const draft = decisionDrafts[decisionId];
    if (!draft) return;

    setUpdatingDecisionId(decisionId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await updateManagementReviewDecision(session.id, decisionId, {
        decision_no: draft.decision_no.trim() || null,
        title: draft.title.trim(),
        decision_text: draft.decision_text.trim(),
        owner_identity_id: draft.owner_identity_id
          ? Number(draft.owner_identity_id)
          : null,
        target_date: draft.target_date || null,
        sort_order: Number(draft.sort_order || 0),
      });

      setSuccessMessage('Decision updated successfully.');
      await loadDetail('refresh');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setUpdatingDecisionId(null);
    }
  }

  async function handleDeleteDecision(decisionId: number) {
    if (!session) return;
    if (!window.confirm('Delete this decision?')) return;

    setDeletingDecisionId(decisionId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await deleteManagementReviewDecision(session.id, decisionId);
      setSuccessMessage('Decision deleted successfully.');
      await loadDetail('refresh');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setDeletingDecisionId(null);
    }
  }

  async function handleCreateActionItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    setSubmittingActionItem(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const payload: CreateManagementReviewActionItemPayload = {
      decision_id: actionItemForm.decision_id ? Number(actionItemForm.decision_id) : null,
      action_no: actionItemForm.action_no.trim() || null,
      title: actionItemForm.title.trim(),
      description: actionItemForm.description.trim() || null,
      owner_identity_id: Number(actionItemForm.owner_identity_id),
      due_date: actionItemForm.due_date,
      status: actionItemForm.status,
      progress_notes: actionItemForm.progress_notes.trim() || null,
      completion_notes: actionItemForm.completion_notes.trim() || null,
      sort_order: Number(actionItemForm.sort_order || 0),
    };

    try {
      await createManagementReviewActionItem(session.id, payload);
      setActionItemForm(emptyActionItemForm());
      setSuccessMessage('Action item created successfully.');
      await loadDetail('refresh');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSubmittingActionItem(false);
    }
  }

  async function handleUpdateActionItem(item: ManagementReviewActionItem) {
    if (!session) return;
    const draft = actionDrafts[item.id];
    if (!draft) return;

    setUpdatingActionItemId(item.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (isDraft) {
        await updateManagementReviewActionItem(session.id, item.id, {
          decision_id: draft.decision_id ? Number(draft.decision_id) : null,
          action_no: draft.action_no.trim() || null,
          title: draft.title.trim(),
          description: draft.description.trim() || null,
          owner_identity_id: Number(draft.owner_identity_id),
          due_date: draft.due_date,
          status: draft.status,
          progress_notes: draft.progress_notes.trim() || null,
          completion_notes: draft.completion_notes.trim() || null,
          sort_order: Number(draft.sort_order || 0),
        });

        setSuccessMessage('Action item updated successfully.');
      } else {
        await updateManagementReviewActionItem(session.id, item.id, {
          status: draft.status,
          progress_notes: draft.progress_notes.trim() || null,
          completion_notes: draft.completion_notes.trim() || null,
        });

        setSuccessMessage(`Action item ${item.action_no || item.id} updated successfully.`);
      }

      await loadDetail('refresh');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setUpdatingActionItemId(null);
    }
  }

  async function handleDeleteActionItem(actionItemId: number) {
    if (!session) return;
    if (!window.confirm('Delete this action item?')) return;

    setDeletingActionItemId(actionItemId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await deleteManagementReviewActionItem(session.id, actionItemId);
      setSuccessMessage('Action item deleted successfully.');
      await loadDetail('refresh');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setDeletingActionItemId(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
            Loading management review detail...
          </div>
        </div>
      </main>
    );
  }

  if (!detail || !session) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="mb-6">
            <Link
              href="/management-reviews"
              className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              Back to Management Reviews
            </Link>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
            {errorMessage || 'Management review detail could not be loaded.'}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-3">
              <Link
                href="/management-reviews"
                className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                Back to Management Reviews
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
                {session.session_code}
              </h1>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(
                  session.status,
                )}`}
              >
                {session.status}
              </span>
            </div>

            <p className="mt-2 text-sm text-gray-600">{session.title}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => loadDetail('refresh')}
              disabled={loading || refreshing}
              className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>

            {isDraft ? (
              <>
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={processingSessionAction}
                  className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processingSessionAction ? 'Processing...' : 'Complete Session'}
                </button>

                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={processingSessionAction}
                  className="inline-flex items-center rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel Session
                </button>
              </>
            ) : null}
          </div>
        </div>

        {successMessage ? (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        {readOnlyNotice ? (
          <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {readOnlyNotice}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">Decisions</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">
              {summary?.decision_count ?? 0}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">Action Items</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">
              {summary?.action_item_count ?? 0}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">Open</div>
            <div className="mt-2 text-2xl font-semibold text-amber-700">
              {summary?.open_action_item_count ?? 0}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">Done</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-700">
              {summary?.done_action_item_count ?? 0}
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSaveOverview}
          className="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm"
        >
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">Overview Session</h2>
            <p className="mt-1 text-sm text-gray-500">
              Review the management review overview and session metadata.
            </p>
          </div>

          <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Session Code
              </label>
              <input
                value={overviewForm.session_code}
                disabled={!isDraft || savingOverview}
                onChange={(event) =>
                  setOverviewForm((current) => ({
                    ...current,
                    session_code: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Review Date
              </label>
              <input
                type="date"
                value={overviewForm.review_date}
                disabled={!isDraft || savingOverview}
                onChange={(event) =>
                  setOverviewForm((current) => ({
                    ...current,
                    review_date: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Chairperson
              </label>
              <select
                value={overviewForm.chairperson_identity_id}
                disabled={!isDraft || savingOverview || loadingIdentityOptions}
                onChange={(event) =>
                  setOverviewForm((current) => ({
                    ...current,
                    chairperson_identity_id: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50"
              >
                <option value="">Select chairperson</option>
                {identityOptions.map((option) => (
                  <option key={option.id} value={String(option.id)}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Current Chairperson
              </label>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
                {getIdentityName(session.chairperson_identity_id)}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Title
              </label>
              <input
                value={overviewForm.title}
                disabled={!isDraft || savingOverview}
                onChange={(event) =>
                  setOverviewForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Completed At
              </label>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
                {formatDateTime(session.completed_at)}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Cancelled At
              </label>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
                {formatDateTime(session.cancelled_at)}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Summary
              </label>
              <textarea
                rows={3}
                value={overviewForm.summary}
                disabled={!isDraft || savingOverview}
                onChange={(event) =>
                  setOverviewForm((current) => ({
                    ...current,
                    summary: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Notes
              </label>
              <textarea
                rows={3}
                value={overviewForm.notes}
                disabled={!isDraft || savingOverview}
                onChange={(event) =>
                  setOverviewForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50"
              />
            </div>
          </div>

          <div className="border-t border-gray-200 px-5 py-4">
            <div className="flex items-center justify-end">
              {isDraft ? (
                <button
                  type="submit"
                  disabled={savingOverview}
                  className="inline-flex items-center rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingOverview ? 'Saving...' : 'Save Overview'}
                </button>
              ) : null}
            </div>
          </div>
        </form>

        <div className="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">Minutes</h2>
            <p className="mt-1 text-sm text-gray-500">
              Meeting notes and management review minutes.
            </p>
          </div>

          <div className="px-5 py-5">
            <textarea
              rows={8}
              value={overviewForm.minutes}
              disabled={!isDraft || savingOverview}
              onChange={(event) =>
                setOverviewForm((current) => ({
                  ...current,
                  minutes: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50"
            />
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">Decisions</h2>
            <p className="mt-1 text-sm text-gray-500">
              Record management review decisions and target direction.
            </p>
          </div>

          <div className="px-5 py-5">
            {decisions.length === 0 ? (
              <div className="mb-5 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-8 text-center">
                <div className="text-base font-medium text-gray-900">
                  No decisions have been recorded yet
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Add management review decisions to document direction, approvals, and follow-up intent.
                </p>
              </div>
            ) : (
              <div className="mb-6 space-y-4">
                {decisions.map((decision) => {
                  const draft = decisionDrafts[decision.id] ?? {
                    decision_no: decision.decision_no ?? '',
                    title: decision.title ?? '',
                    decision_text: decision.decision_text ?? '',
                    owner_identity_id: decision.owner_identity_id
                      ? String(decision.owner_identity_id)
                      : '',
                    target_date: decision.target_date ?? '',
                    sort_order: String(decision.sort_order ?? 0),
                  };

                  return (
                    <div
                      key={decision.id}
                      className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                    >
                      {isDraft ? (
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              Decision No
                            </label>
                            <input
                              value={draft.decision_no}
                              onChange={(event) =>
                                setDecisionDrafts((current) => ({
                                  ...current,
                                  [decision.id]: {
                                    ...draft,
                                    decision_no: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              Owner
                            </label>
                            <select
                              value={draft.owner_identity_id}
                              disabled={loadingIdentityOptions}
                              onChange={(event) =>
                                setDecisionDrafts((current) => ({
                                  ...current,
                                  [decision.id]: {
                                    ...draft,
                                    owner_identity_id: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50"
                            >
                              <option value="">Select owner</option>
                              {identityOptions.map((option) => (
                                <option key={option.id} value={String(option.id)}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="md:col-span-2">
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              Title
                            </label>
                            <input
                              value={draft.title}
                              onChange={(event) =>
                                setDecisionDrafts((current) => ({
                                  ...current,
                                  [decision.id]: {
                                    ...draft,
                                    title: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              Decision Text
                            </label>
                            <textarea
                              rows={4}
                              value={draft.decision_text}
                              onChange={(event) =>
                                setDecisionDrafts((current) => ({
                                  ...current,
                                  [decision.id]: {
                                    ...draft,
                                    decision_text: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              Target Date
                            </label>
                            <input
                              type="date"
                              value={draft.target_date}
                              onChange={(event) =>
                                setDecisionDrafts((current) => ({
                                  ...current,
                                  [decision.id]: {
                                    ...draft,
                                    target_date: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              Sort Order
                            </label>
                            <input
                              type="number"
                              value={draft.sort_order}
                              onChange={(event) =>
                                setDecisionDrafts((current) => ({
                                  ...current,
                                  [decision.id]: {
                                    ...draft,
                                    sort_order: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                            />
                          </div>

                          <div className="md:col-span-2 flex justify-between gap-3">
                            <button
                              type="button"
                              disabled={deletingDecisionId === decision.id}
                              onClick={() => handleDeleteDecision(decision.id)}
                              className="inline-flex items-center rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {deletingDecisionId === decision.id
                                ? 'Deleting...'
                                : 'Delete Decision'}
                            </button>

                            <button
                              type="button"
                              disabled={updatingDecisionId === decision.id}
                              onClick={() => handleUpdateDecision(decision.id)}
                              className="inline-flex items-center rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {updatingDecisionId === decision.id
                                ? 'Updating...'
                                : 'Save Decision'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">
                                {decision.decision_no || `Decision #${decision.id}`}
                              </div>
                              <div className="mt-1 text-base text-gray-800">{decision.title}</div>
                            </div>

                            <div className="text-xs text-gray-500">
                              Target Date: {formatDate(decision.target_date)}
                            </div>
                          </div>

                          <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">
                            {decision.decision_text}
                          </p>

                          <div className="mt-3 text-xs text-gray-500">
                            Owner: {getIdentityName(decision.owner_identity_id)}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {isDraft ? (
              <form onSubmit={handleCreateDecision} className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Decision No
                  </label>
                  <input
                    value={decisionForm.decision_no}
                    onChange={(event) =>
                      setDecisionForm((current) => ({
                        ...current,
                        decision_no: event.target.value,
                      }))
                    }
                    placeholder="DEC-001"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Owner
                  </label>
                  <select
                    value={decisionForm.owner_identity_id}
                    disabled={loadingIdentityOptions}
                    onChange={(event) =>
                      setDecisionForm((current) => ({
                        ...current,
                        owner_identity_id: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50"
                  >
                    <option value="">Select owner</option>
                    {identityOptions.map((option) => (
                      <option key={option.id} value={String(option.id)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Title
                  </label>
                  <input
                    required
                    value={decisionForm.title}
                    onChange={(event) =>
                      setDecisionForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Decision title"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Decision Text
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={decisionForm.decision_text}
                    onChange={(event) =>
                      setDecisionForm((current) => ({
                        ...current,
                        decision_text: event.target.value,
                      }))
                    }
                    placeholder="Describe the management decision"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Target Date
                  </label>
                  <input
                    type="date"
                    value={decisionForm.target_date}
                    onChange={(event) =>
                      setDecisionForm((current) => ({
                        ...current,
                        target_date: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    value={decisionForm.sort_order}
                    onChange={(event) =>
                      setDecisionForm((current) => ({
                        ...current,
                        sort_order: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingDecision}
                    className="inline-flex items-center rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submittingDecision ? 'Creating...' : 'Add Decision'}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">Action Items</h2>
            <p className="mt-1 text-sm text-gray-500">
              Track management review action items, due dates, and follow-up progress.
            </p>
          </div>

          <div className="px-5 py-5">
            {actionItems.length === 0 ? (
              <div className="mb-5 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-8 text-center">
                <div className="text-base font-medium text-gray-900">
                  No action items have been recorded yet
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Add action items to track ownership, due dates, and completion progress from this review session.
                </p>
              </div>
            ) : (
              <div className="mb-6 space-y-4">
                {actionItems.map((item) => {
                  const draft = actionDrafts[item.id] ?? {
                    decision_id: item.decision_id ? String(item.decision_id) : '',
                    action_no: item.action_no ?? '',
                    title: item.title ?? '',
                    description: item.description ?? '',
                    owner_identity_id: item.owner_identity_id
                      ? String(item.owner_identity_id)
                      : '',
                    due_date: item.due_date ?? '',
                    status: item.status,
                    progress_notes: item.progress_notes ?? '',
                    completion_notes: item.completion_notes ?? '',
                    sort_order: String(item.sort_order ?? 0),
                  };

                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-gray-900">
                              {item.action_no || `Action #${item.id}`}
                            </div>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${actionStatusBadgeClass(
                                item.status,
                              )}`}
                            >
                              {item.status}
                            </span>
                            {item.is_overdue ? (
                              <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                                OVERDUE
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-2 text-base text-gray-800">{item.title}</div>

                          {item.description ? (
                            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                              {item.description}
                            </p>
                          ) : null}

                          <div className="mt-2 text-xs text-gray-500">
                            Linked Decision: {getDecisionName(item.decision_id)}
                          </div>
                        </div>

                        <div className="text-sm text-gray-600 md:text-right">
                          <div>Owner: {getIdentityName(item.owner_identity_id)}</div>
                          <div className="mt-1">Due Date: {formatDate(item.due_date)}</div>
                          <div className="mt-1">Completed At: {formatDateTime(item.completed_at)}</div>
                        </div>
                      </div>

                      {isDraft ? (
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              Linked Decision
                            </label>
                            <select
                              value={draft.decision_id}
                              onChange={(event) =>
                                setActionDrafts((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...draft,
                                    decision_id: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                            >
                              <option value="">No linked decision</option>
                              {decisions.map((decision) => {
                                const label = decision.decision_no?.trim()
                                  ? `${decision.decision_no} — ${decision.title}`
                                  : decision.title;

                                return (
                                  <option key={decision.id} value={String(decision.id)}>
                                    {label}
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              Action No
                            </label>
                            <input
                              value={draft.action_no}
                              onChange={(event) =>
                                setActionDrafts((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...draft,
                                    action_no: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              Owner
                            </label>
                            <select
                              value={draft.owner_identity_id}
                              disabled={loadingIdentityOptions}
                              onChange={(event) =>
                                setActionDrafts((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...draft,
                                    owner_identity_id: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50"
                            >
                              <option value="">Select owner</option>
                              {identityOptions.map((option) => (
                                <option key={option.id} value={String(option.id)}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              Due Date
                            </label>
                            <input
                              type="date"
                              value={draft.due_date}
                              onChange={(event) =>
                                setActionDrafts((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...draft,
                                    due_date: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              Title
                            </label>
                            <input
                              value={draft.title}
                              onChange={(event) =>
                                setActionDrafts((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...draft,
                                    title: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              Description
                            </label>
                            <textarea
                              rows={4}
                              value={draft.description}
                              onChange={(event) =>
                                setActionDrafts((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...draft,
                                    description: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              Status
                            </label>
                            <select
                              value={draft.status}
                              onChange={(event) =>
                                setActionDrafts((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...draft,
                                    status: event.target.value as ManagementReviewActionItemStatus,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                            >
                              <option value="OPEN">OPEN</option>
                              <option value="IN_PROGRESS">IN_PROGRESS</option>
                              <option value="DONE">DONE</option>
                              <option value="CANCELLED">CANCELLED</option>
                            </select>
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              Sort Order
                            </label>
                            <input
                              type="number"
                              value={draft.sort_order}
                              onChange={(event) =>
                                setActionDrafts((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...draft,
                                    sort_order: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              Progress Notes
                            </label>
                            <textarea
                              rows={3}
                              value={draft.progress_notes}
                              onChange={(event) =>
                                setActionDrafts((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...draft,
                                    progress_notes: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              Completion Notes
                            </label>
                            <textarea
                              rows={3}
                              value={draft.completion_notes}
                              onChange={(event) =>
                                setActionDrafts((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...draft,
                                    completion_notes: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                            />
                          </div>

                          <div className="md:col-span-2 flex justify-between gap-3">
                            <button
                              type="button"
                              disabled={deletingActionItemId === item.id}
                              onClick={() => handleDeleteActionItem(item.id)}
                              className="inline-flex items-center rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {deletingActionItemId === item.id
                                ? 'Deleting...'
                                : 'Delete Action Item'}
                            </button>

                            <button
                              type="button"
                              disabled={updatingActionItemId === item.id}
                              onClick={() => handleUpdateActionItem(item)}
                              className="inline-flex items-center rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {updatingActionItemId === item.id
                                ? 'Updating...'
                                : 'Save Action Item'}
                            </button>
                          </div>
                        </div>
                      ) : isCompleted ? (
                        <div className="mt-4 grid gap-4 md:grid-cols-3">
                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              Status
                            </label>
                            <select
                              value={draft.status}
                              onChange={(event) =>
                                setActionDrafts((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...draft,
                                    status: event.target.value as ManagementReviewActionItemStatus,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                            >
                              <option value="OPEN">OPEN</option>
                              <option value="IN_PROGRESS">IN_PROGRESS</option>
                              <option value="DONE">DONE</option>
                              <option value="CANCELLED">CANCELLED</option>
                            </select>
                          </div>

                          <div className="md:col-span-2">
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              Progress Notes
                            </label>
                            <textarea
                              rows={3}
                              value={draft.progress_notes}
                              onChange={(event) =>
                                setActionDrafts((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...draft,
                                    progress_notes: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                            />
                          </div>

                          <div className="md:col-span-3">
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              Completion Notes
                            </label>
                            <textarea
                              rows={3}
                              value={draft.completion_notes}
                              onChange={(event) =>
                                setActionDrafts((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...draft,
                                    completion_notes: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                            />
                          </div>

                          <div className="md:col-span-3 flex justify-end">
                            <button
                              type="button"
                              disabled={updatingActionItemId === item.id}
                              onClick={() => handleUpdateActionItem(item)}
                              className="inline-flex items-center rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {updatingActionItemId === item.id
                                ? 'Updating...'
                                : 'Update Follow Up'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700">
                            <div className="font-medium text-gray-900">Progress Notes</div>
                            <div className="mt-1 whitespace-pre-wrap">
                              {item.progress_notes || '-'}
                            </div>
                          </div>

                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700">
                            <div className="font-medium text-gray-900">Completion Notes</div>
                            <div className="mt-1 whitespace-pre-wrap">
                              {item.completion_notes || '-'}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {isDraft ? (
              <form onSubmit={handleCreateActionItem} className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Linked Decision
                  </label>
                  <select
                    value={actionItemForm.decision_id}
                    onChange={(event) =>
                      setActionItemForm((current) => ({
                        ...current,
                        decision_id: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  >
                    <option value="">No linked decision</option>
                    {decisions.map((decision) => {
                      const label = decision.decision_no?.trim()
                        ? `${decision.decision_no} — ${decision.title}`
                        : decision.title;

                      return (
                        <option key={decision.id} value={String(decision.id)}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Action No
                  </label>
                  <input
                    value={actionItemForm.action_no}
                    onChange={(event) =>
                      setActionItemForm((current) => ({
                        ...current,
                        action_no: event.target.value,
                      }))
                    }
                    placeholder="ACT-001"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Owner
                  </label>
                  <select
                    required
                    value={actionItemForm.owner_identity_id}
                    disabled={loadingIdentityOptions}
                    onChange={(event) =>
                      setActionItemForm((current) => ({
                        ...current,
                        owner_identity_id: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50"
                  >
                    <option value="">Select owner</option>
                    {identityOptions.map((option) => (
                      <option key={option.id} value={String(option.id)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Due Date
                  </label>
                  <input
                    required
                    type="date"
                    value={actionItemForm.due_date}
                    onChange={(event) =>
                      setActionItemForm((current) => ({
                        ...current,
                        due_date: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Initial Status
                  </label>
                  <select
                    value={actionItemForm.status}
                    onChange={(event) =>
                      setActionItemForm((current) => ({
                        ...current,
                        status: event.target.value as ManagementReviewActionItemStatus,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  >
                    <option value="OPEN">OPEN</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="DONE">DONE</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Title
                  </label>
                  <input
                    required
                    value={actionItemForm.title}
                    onChange={(event) =>
                      setActionItemForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Action item title"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    rows={4}
                    value={actionItemForm.description}
                    onChange={(event) =>
                      setActionItemForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Describe the required follow-up action"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    value={actionItemForm.sort_order}
                    onChange={(event) =>
                      setActionItemForm((current) => ({
                        ...current,
                        sort_order: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingActionItem}
                    className="inline-flex items-center rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submittingActionItem ? 'Creating...' : 'Add Action Item'}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}