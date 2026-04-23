'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../lib/api';
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
  canFollowUpManagementReviewActionItems,
  canManageManagementReviews,
} from '../../lib/managementReviewAccess';
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
      return 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200';
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
      return 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200';
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

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  tone?: 'default' | 'amber' | 'green' | 'rose' | 'cyan';
}) {
  const toneClass =
    tone === 'amber'
      ? 'border-amber-200 text-amber-800'
      : tone === 'green'
        ? 'border-emerald-200 text-emerald-800'
        : tone === 'rose'
          ? 'border-rose-200 text-rose-800'
          : tone === 'cyan'
            ? 'border-cyan-200 text-cyan-800'
            : 'border-slate-200 text-slate-900';

  return (
    <div
      className={`rounded-[1.75rem] border bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] ${toneClass}`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold">{value}</div>
    </div>
  );
}

function PanelCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {children}
    </div>
  );
}

function ReadonlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        {value}
      </div>
    </div>
  );
}

export default function ManagementReviewDetailClient({ reviewId }: Props) {
  const [detail, setDetail] = useState<ManagementReviewDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
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
  const [roles, setRoles] = useState<string[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);

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

  const loadAuth = useCallback(async () => {
    setLoadingRoles(true);
    try {
      const response = await apiGet<{ roles?: string[] }>('/api/v1/auth/me');
      setRoles(Array.isArray(response.data?.roles) ? response.data.roles : []);
    } catch {
      setRoles([]);
    } finally {
      setLoadingRoles(false);
    }
  }, []);

  const loadDetail = useCallback(async () => {
    if (!Number.isFinite(reviewId) || reviewId <= 0) {
      setErrorMessage('Invalid management review id.');
      setLoading(false);
      return;
    }

    setLoading(true);
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
    }
  }, [reviewId]);

  useEffect(() => {
    loadDetail();
    loadIdentityOptions();
    loadAuth();
  }, [loadDetail, loadIdentityOptions, loadAuth]);

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
  const canManage = useMemo(() => canManageManagementReviews(roles), [roles]);
  const canFollowUp = useMemo(
    () => canFollowUpManagementReviewActionItems(roles),
    [roles],
  );
  const canEditStructure = isDraft && canManage;
  const canManageDraftItems = isDraft && canManage;
  const canFollowUpCompletedItems = isCompleted && canFollowUp;

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
    if (session && !canManage) {
      return 'Read-only access: this management review session can be viewed, but structure changes are restricted for your role.';
    }
    return null;
  }, [canManage, isCancelled, isCompleted, session]);

  async function handleSaveOverview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !canEditStructure) return;

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
      await loadDetail();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSavingOverview(false);
    }
  }

  async function handleComplete() {
    if (!session || !canEditStructure) return;
    if (!window.confirm('Complete this management review session?')) return;

    setProcessingSessionAction(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await completeManagementReview(session.id);
      setSuccessMessage('Management review session completed successfully.');
      await loadDetail();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setProcessingSessionAction(false);
    }
  }

  async function handleCancel() {
    if (!session || !canEditStructure) return;
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
      await loadDetail();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setProcessingSessionAction(false);
    }
  }

  async function handleCreateDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !canManageDraftItems) return;

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
      await loadDetail();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSubmittingDecision(false);
    }
  }

  async function handleUpdateDecision(decisionId: number) {
    if (!session || !canManageDraftItems) return;
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
      await loadDetail();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setUpdatingDecisionId(null);
    }
  }

  async function handleDeleteDecision(decisionId: number) {
    if (!session || !canManageDraftItems) return;
    if (!window.confirm('Delete this decision?')) return;

    setDeletingDecisionId(decisionId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await deleteManagementReviewDecision(session.id, decisionId);
      setSuccessMessage('Decision deleted successfully.');
      await loadDetail();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setDeletingDecisionId(null);
    }
  }

  async function handleCreateActionItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !canManageDraftItems) return;

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
      await loadDetail();
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
      if (canEditStructure) {
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
      } else if (canFollowUpCompletedItems) {
        await updateManagementReviewActionItem(session.id, item.id, {
          status: draft.status,
          progress_notes: draft.progress_notes.trim() || null,
          completion_notes: draft.completion_notes.trim() || null,
        });

        setSuccessMessage(`Action item ${item.action_no || item.id} updated successfully.`);
      } else {
        throw new Error('Forbidden');
      }

      await loadDetail();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setUpdatingActionItemId(null);
    }
  }

  async function handleDeleteActionItem(actionItemId: number) {
    if (!session || !canManageDraftItems) return;
    if (!window.confirm('Delete this action item?')) return;

    setDeletingActionItemId(actionItemId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await deleteManagementReviewActionItem(session.id, actionItemId);
      setSuccessMessage('Action item deleted successfully.');
      await loadDetail();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setDeletingActionItemId(null);
    }
  }

  if (loading) {
    return (
      <main className="itam-page-shell">
        <div className="itam-page-shell-inner">
          <div className="rounded-3xl border border-white bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="text-sm text-slate-600">Loading management review detail...</div>
          </div>
        </div>
      </main>
    );
  }

  if (!detail || !session) {
    return (
      <main className="itam-page-shell">
        <div className="itam-page-shell-inner">
          <div className="mb-6">
            <Link href="/management-reviews" className="itam-secondary-action">
              Back to Management Reviews
            </Link>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
            {errorMessage || 'Management review detail could not be loaded.'}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="itam-page-shell">
      <div className="itam-page-shell-inner">
        <div className="space-y-8">
          <section className="rounded-[2rem] border border-white/80 bg-white/75 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700">
                  Operational Workspace
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                    {session.session_code}
                  </h1>
                  <span
                    className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${statusBadgeClass(
                      session.status,
                    )}`}
                  >
                    {session.status}
                  </span>
                </div>

                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
                  {session.title}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Link href="/management-reviews" className="itam-secondary-action">
                  Back
                </Link>

                {canEditStructure ? (
                  <>
                    <button
                      type="button"
                      onClick={handleComplete}
                      disabled={processingSessionAction}
                      className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {processingSessionAction ? 'Processing...' : 'Complete Session'}
                    </button>

                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={processingSessionAction}
                      className="rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Cancel Session
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </section>

          {successMessage ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          {readOnlyNotice ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              {readOnlyNotice}
            </div>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Decisions" value={summary?.decision_count ?? 0} />
            <StatCard label="Action Items" value={summary?.action_item_count ?? 0} />
            <StatCard label="Open" value={summary?.open_action_item_count ?? 0} tone="amber" />
            <StatCard label="Done" value={summary?.done_action_item_count ?? 0} tone="green" />
          </section>

          <section className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <PanelCard
              title="Overview Session"
              description="Review the management review overview and session metadata."
              action={
                canEditStructure ? (
                  <button
                    type="submit"
                    form="management-review-overview-form"
                    disabled={savingOverview}
                    className="itam-primary-action disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingOverview ? 'Saving...' : 'Save Overview'}
                  </button>
                ) : undefined
              }
            >
              <form
                id="management-review-overview-form"
                onSubmit={handleSaveOverview}
                className="grid gap-4 md:grid-cols-2"
              >
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Session Code
                  </label>
                  <input
                    value={overviewForm.session_code}
                    disabled={!canEditStructure || savingOverview}
                    onChange={(event) =>
                      setOverviewForm((current) => ({
                        ...current,
                        session_code: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Review Date
                  </label>
                  <input
                    type="date"
                    value={overviewForm.review_date}
                    disabled={!canEditStructure || savingOverview}
                    onChange={(event) =>
                      setOverviewForm((current) => ({
                        ...current,
                        review_date: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Chairperson
                  </label>
                  <select
                    value={overviewForm.chairperson_identity_id}
                    disabled={!canEditStructure || savingOverview || loadingIdentityOptions}
                    onChange={(event) =>
                      setOverviewForm((current) => ({
                        ...current,
                        chairperson_identity_id: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
                  >
                    <option value="">Select chairperson</option>
                    {identityOptions.map((option) => (
                      <option key={option.id} value={String(option.id)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <ReadonlyField
                  label="Current Chairperson"
                  value={getIdentityName(session.chairperson_identity_id)}
                />

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Title
                  </label>
                  <input
                    value={overviewForm.title}
                    disabled={!canEditStructure || savingOverview}
                    onChange={(event) =>
                      setOverviewForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
                  />
                </div>

                <ReadonlyField
                  label="Completed At"
                  value={formatDateTime(session.completed_at)}
                />
                <ReadonlyField
                  label="Cancelled At"
                  value={formatDateTime(session.cancelled_at)}
                />

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Summary
                  </label>
                  <textarea
                    rows={4}
                    value={overviewForm.summary}
                    disabled={!canEditStructure || savingOverview}
                    onChange={(event) =>
                      setOverviewForm((current) => ({
                        ...current,
                        summary: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Notes
                  </label>
                  <textarea
                    rows={4}
                    value={overviewForm.notes}
                    disabled={!canEditStructure || savingOverview}
                    onChange={(event) =>
                      setOverviewForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
                  />
                </div>
              </form>
            </PanelCard>
          </section>

          <section className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <PanelCard
              title="Minutes"
              description="Meeting notes and management review minutes."
            >
              <textarea
                rows={10}
                value={overviewForm.minutes}
                disabled={!canEditStructure || savingOverview}
                onChange={(event) =>
                  setOverviewForm((current) => ({
                    ...current,
                    minutes: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
              />
            </PanelCard>
          </section>

          <section className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <PanelCard
              title="Decisions"
              description="Record management review decisions and target direction."
            >
              {decisions.length === 0 ? (
                <div className="mb-5 rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
                  <div className="text-base font-medium text-slate-900">
                    No decisions have been recorded yet
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    Add management review decisions to document direction, approvals,
                    and follow-up intent.
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
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        {canEditStructure ? (
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <label className="mb-2 block text-sm font-medium text-slate-700">
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
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                              />
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-medium text-slate-700">
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
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
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
                              <label className="mb-2 block text-sm font-medium text-slate-700">
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
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                              />
                            </div>

                            <div className="md:col-span-2">
                              <label className="mb-2 block text-sm font-medium text-slate-700">
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
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                              />
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-medium text-slate-700">
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
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                              />
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-medium text-slate-700">
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
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                              />
                            </div>

                            <div className="md:col-span-2 flex justify-between gap-3">
                              <button
                                type="button"
                                disabled={deletingDecisionId === decision.id}
                                onClick={() => handleDeleteDecision(decision.id)}
                                className="rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {deletingDecisionId === decision.id
                                  ? 'Deleting...'
                                  : 'Delete Decision'}
                              </button>

                              <button
                                type="button"
                                disabled={updatingDecisionId === decision.id}
                                onClick={() => handleUpdateDecision(decision.id)}
                                className="itam-primary-action disabled:cursor-not-allowed disabled:opacity-50"
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
                                <div className="text-sm font-semibold text-slate-900">
                                  {decision.decision_no || `Decision #${decision.id}`}
                                </div>
                                <div className="mt-1 text-base text-slate-800">
                                  {decision.title}
                                </div>
                              </div>

                              <div className="text-xs text-slate-500">
                                Target Date: {formatDate(decision.target_date)}
                              </div>
                            </div>

                            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                              {decision.decision_text}
                            </p>

                            <div className="mt-3 text-xs text-slate-500">
                              Owner: {getIdentityName(decision.owner_identity_id)}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {canEditStructure ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <form onSubmit={handleCreateDecision} className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
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
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
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
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
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
                      <label className="mb-2 block text-sm font-medium text-slate-700">
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
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-slate-700">
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
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
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
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
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
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                      />
                    </div>

                    <div className="md:col-span-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={submittingDecision}
                        className="itam-primary-action disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {submittingDecision ? 'Creating...' : 'Add Decision'}
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}
            </PanelCard>
          </section>

          <section className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <PanelCard
              title="Action Items"
              description="Track management review action items, due dates, and follow-up progress."
            >
              {actionItems.length === 0 ? (
                <div className="mb-5 rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
                  <div className="text-base font-medium text-slate-900">
                    No action items have been recorded yet
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    Add action items to track ownership, due dates, and completion
                    progress from this review session.
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
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold text-slate-900">
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

                            <div className="mt-2 text-base text-slate-800">{item.title}</div>

                            {item.description ? (
                              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                                {item.description}
                              </p>
                            ) : null}

                            <div className="mt-2 text-xs text-slate-500">
                              Linked Decision: {getDecisionName(item.decision_id)}
                            </div>
                          </div>

                          <div className="text-sm text-slate-600 md:text-right">
                            <div>Owner: {getIdentityName(item.owner_identity_id)}</div>
                            <div className="mt-1">Due Date: {formatDate(item.due_date)}</div>
                            <div className="mt-1">
                              Completed At: {formatDateTime(item.completed_at)}
                            </div>
                          </div>
                        </div>

                        {canEditStructure ? (
                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div>
                              <label className="mb-2 block text-sm font-medium text-slate-700">
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
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
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
                              <label className="mb-2 block text-sm font-medium text-slate-700">
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
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                              />
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-medium text-slate-700">
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
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
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
                              <label className="mb-2 block text-sm font-medium text-slate-700">
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
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                              />
                            </div>

                            <div className="md:col-span-2">
                              <label className="mb-2 block text-sm font-medium text-slate-700">
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
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                              />
                            </div>

                            <div className="md:col-span-2">
                              <label className="mb-2 block text-sm font-medium text-slate-700">
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
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                              />
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-medium text-slate-700">
                                Status
                              </label>
                              <select
                                value={draft.status}
                                onChange={(event) =>
                                  setActionDrafts((current) => ({
                                    ...current,
                                    [item.id]: {
                                      ...draft,
                                      status:
                                        event.target.value as ManagementReviewActionItemStatus,
                                    },
                                  }))
                                }
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                              >
                                <option value="OPEN">OPEN</option>
                                <option value="IN_PROGRESS">IN_PROGRESS</option>
                                <option value="DONE">DONE</option>
                                <option value="CANCELLED">CANCELLED</option>
                              </select>
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-medium text-slate-700">
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
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                              />
                            </div>

                            <div className="md:col-span-2">
                              <label className="mb-2 block text-sm font-medium text-slate-700">
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
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                              />
                            </div>

                            <div className="md:col-span-2">
                              <label className="mb-2 block text-sm font-medium text-slate-700">
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
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                              />
                            </div>

                            <div className="md:col-span-2 flex justify-between gap-3">
                              <button
                                type="button"
                                disabled={deletingActionItemId === item.id}
                                onClick={() => handleDeleteActionItem(item.id)}
                                className="rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {deletingActionItemId === item.id
                                  ? 'Deleting...'
                                  : 'Delete Action Item'}
                              </button>

                              <button
                                type="button"
                                disabled={updatingActionItemId === item.id}
                                onClick={() => handleUpdateActionItem(item)}
                                className="itam-primary-action disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {updatingActionItemId === item.id
                                  ? 'Updating...'
                                  : 'Save Action Item'}
                              </button>
                            </div>
                          </div>
                        ) : canFollowUpCompletedItems ? (
                          <div className="mt-4 grid gap-4 md:grid-cols-3">
                            <div>
                              <label className="mb-2 block text-sm font-medium text-slate-700">
                                Status
                              </label>
                              <select
                                value={draft.status}
                                onChange={(event) =>
                                  setActionDrafts((current) => ({
                                    ...current,
                                    [item.id]: {
                                      ...draft,
                                      status:
                                        event.target.value as ManagementReviewActionItemStatus,
                                    },
                                  }))
                                }
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                              >
                                <option value="OPEN">OPEN</option>
                                <option value="IN_PROGRESS">IN_PROGRESS</option>
                                <option value="DONE">DONE</option>
                                <option value="CANCELLED">CANCELLED</option>
                              </select>
                            </div>

                            <div className="md:col-span-2">
                              <label className="mb-2 block text-sm font-medium text-slate-700">
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
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                              />
                            </div>

                            <div className="md:col-span-3">
                              <label className="mb-2 block text-sm font-medium text-slate-700">
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
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                              />
                            </div>

                            <div className="md:col-span-3 flex justify-end">
                              <button
                                type="button"
                                disabled={updatingActionItemId === item.id}
                                onClick={() => handleUpdateActionItem(item)}
                                className="itam-primary-action disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {updatingActionItemId === item.id
                                  ? 'Updating...'
                                  : 'Update Follow Up'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
                              <div className="font-medium text-slate-900">Progress Notes</div>
                              <div className="mt-1 whitespace-pre-wrap">
                                {item.progress_notes || '-'}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
                              <div className="font-medium text-slate-900">
                                Completion Notes
                              </div>
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

              {canEditStructure ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <form onSubmit={handleCreateActionItem} className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
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
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
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
                      <label className="mb-2 block text-sm font-medium text-slate-700">
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
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
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
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
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
                      <label className="mb-2 block text-sm font-medium text-slate-700">
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
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Initial Status
                      </label>
                      <select
                        value={actionItemForm.status}
                        onChange={(event) =>
                          setActionItemForm((current) => ({
                            ...current,
                            status:
                              event.target.value as ManagementReviewActionItemStatus,
                          }))
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="IN_PROGRESS">IN_PROGRESS</option>
                        <option value="DONE">DONE</option>
                        <option value="CANCELLED">CANCELLED</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-slate-700">
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
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-slate-700">
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
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
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
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                      />
                    </div>

                    <div className="md:col-span-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={submittingActionItem}
                        className="itam-primary-action disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {submittingActionItem ? 'Creating...' : 'Add Action Item'}
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}
            </PanelCard>
          </section>
        </div>
      </div>
    </main>
  );
}