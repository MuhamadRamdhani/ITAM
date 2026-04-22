'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet } from '../lib/api';
import {
  CreateManagementReviewPayload,
  ManagementReviewSession,
  ManagementReviewSessionStatus,
  createManagementReview,
  listManagementReviews,
} from '../lib/management-reviews';
import { canManageManagementReviews } from '../lib/managementReviewAccess';
import {
  IdentityOption,
  getIdentityLabel,
  listIdentityOptions,
} from '../lib/internal-audits';

type CreateFormState = {
  session_code: string;
  title: string;
  review_date: string;
  chairperson_identity_id: string;
  summary: string;
  minutes: string;
  notes: string;
};

type IdentitySelectOption = {
  id: number;
  label: string;
};

const PAGE_SIZE = 10;

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

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

export default function ManagementReviewsClient() {
  const [items, setItems] = useState<ManagementReviewSession[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [identityOptions, setIdentityOptions] = useState<IdentitySelectOption[]>([]);
  const [loadingIdentityOptions, setLoadingIdentityOptions] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ManagementReviewSessionStatus | ''>('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>({
    session_code: '',
    title: '',
    review_date: getTodayDate(),
    chairperson_identity_id: '',
    summary: '',
    minutes: '',
    notes: '',
  });

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

  const loadData = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      setErrorMessage(null);

      try {
        const response = await listManagementReviews({
          q: search || undefined,
          status: status || undefined,
          page,
          page_size: PAGE_SIZE,
        });

        setItems(response.items ?? []);
        setPage(response.page ?? 1);
        setTotalPages(response.total_pages ?? 1);
        setTotal(response.total ?? 0);
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
        setItems([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, search, status],
  );

  useEffect(() => {
    loadData('initial');
    loadIdentityOptions();
    loadAuth();
  }, [loadData, loadIdentityOptions, loadAuth]);

  useEffect(() => {
    if (!successMessage && !errorMessage) return;

    const timer = window.setTimeout(() => {
      setSuccessMessage(null);
      setErrorMessage(null);
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [successMessage, errorMessage]);

  const identityMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const option of identityOptions) {
      map.set(option.id, option.label);
    }
    return map;
  }, [identityOptions]);

  const getIdentityName = useCallback(
    (identityId: number | null | undefined) => {
      if (!identityId) return '-';
      const label = identityMap.get(identityId);
      if (!label) return `Identity #${identityId}`;
      return `${label} (ID: ${identityId})`;
    },
    [identityMap],
  );

  const canManage = useMemo(() => canManageManagementReviews(roles), [roles]);

  const draftCount = useMemo(
    () => items.filter((item) => item.status === 'DRAFT').length,
    [items],
  );

  const completedCount = useMemo(
    () => items.filter((item) => item.status === 'COMPLETED').length,
    [items],
  );

  const cancelledCount = useMemo(
    () => items.filter((item) => item.status === 'CANCELLED').length,
    [items],
  );

  function resetCreateForm() {
    setCreateForm({
      session_code: '',
      title: '',
      review_date: getTodayDate(),
      chairperson_identity_id: '',
      summary: '',
      minutes: '',
      notes: '',
    });
  }

  function openCreateModal() {
    if (!canManage) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setCreateOpen(true);
  }

  function closeCreateModal() {
    if (submitting) return;
    setCreateOpen(false);
    resetCreateForm();
  }

  function onSubmitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function onChangeStatus(value: string) {
    setPage(1);
    setStatus(value as ManagementReviewSessionStatus | '');
  }

  async function onSubmitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const payload: CreateManagementReviewPayload = {
      session_code: createForm.session_code.trim(),
      title: createForm.title.trim(),
      review_date: createForm.review_date,
      chairperson_identity_id: createForm.chairperson_identity_id
        ? Number(createForm.chairperson_identity_id)
        : null,
      summary: createForm.summary.trim() || null,
      minutes: createForm.minutes.trim() || null,
      notes: createForm.notes.trim() || null,
    };

    try {
      await createManagementReview(payload);
      setCreateOpen(false);
      resetCreateForm();
      setSuccessMessage('Management review session created successfully.');
      setPage(1);
      await loadData('refresh');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <main className="itam-page-shell">
        <div className="itam-page-shell-inner">
          <div className="rounded-[2rem] border border-white/80 bg-white/75 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700">
                  Operational Workspace
                </div>

                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  Management Reviews
                </h1>

                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
                  Manage management review sessions, capture meeting minutes, and track
                  follow-up progress across the tenant.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
  <Link href="/" className="itam-secondary-action">
    Back
  </Link>

  <Link
    href="/management-reviews/action-items"
    className="itam-secondary-action"
  >
    Open Action Tracker
  </Link>

  {canManage ? (
    <button
      type="button"
      onClick={openCreateModal}
      className="itam-primary-action"
    >
      New Management Review
    </button>
  ) : null}
</div>
            </div>
          </div>

          {!loadingRoles && !canManage ? (
            <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Read-only access: you can view management review sessions, but creation and
              edits are restricted.
            </div>
          ) : null}

          {successMessage ? (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <div className="rounded-[1.75rem] border border-white/80 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Current page total
              </div>
              <div className="mt-3 text-3xl font-semibold text-slate-900">
                {items.length}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/80 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Draft on page
              </div>
              <div className="mt-3 text-3xl font-semibold text-amber-700">
                {draftCount}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/80 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Completed on page
              </div>
              <div className="mt-3 text-3xl font-semibold text-emerald-700">
                {completedCount}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/80 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Cancelled on page
              </div>
              <div className="mt-3 text-3xl font-semibold text-rose-700">
                {cancelledCount}
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
              <form
                onSubmit={onSubmitSearch}
                className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto]"
              >
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Search
                  </label>
                  <input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search by session code or title"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(event) => onChangeStatus(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  >
                    <option value="">All statuses</option>
                    <option value="DRAFT">DRAFT</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </div>

                <div className="flex items-end gap-2">
                  <button type="submit" className="itam-primary-action">
                    Apply
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      setSearch('');
                      setStatus('');
                      setPage(1);
                    }}
                    className="itam-secondary-action"
                  >
                    Reset
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="mt-8 rounded-[2rem] border border-white/80 bg-white/85 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="text-base font-semibold text-slate-900">Session List</h2>
              <p className="mt-1 text-sm text-slate-500">Total matched sessions: {total}</p>
            </div>

            {loading ? (
              <div className="px-6 py-10 text-sm text-slate-500">
                {refreshing ? 'Refreshing...' : 'Loading management reviews...'}
              </div>
            ) : items.length === 0 ? (
              <div className="px-6 py-12">
                <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                  <div className="text-base font-medium text-slate-900">
                    No management review sessions found
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    Try changing the filter, or create a new management review session.
                  </p>
                  {canManage ? (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={openCreateModal}
                        className="itam-primary-action"
                      >
                        Create Session
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-6 py-3 font-medium">Session</th>
                      <th className="px-6 py-3 font-medium">Review Date</th>
                      <th className="px-6 py-3 font-medium">Chairperson</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium">Action Items</th>
                      <th className="px-6 py-3 font-medium">Summary</th>
                      <th className="px-6 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {items.map((item) => (
                      <tr key={item.id} className="align-top">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900">
                            {item.session_code}
                          </div>
                          <div className="mt-1 text-sm text-slate-700">{item.title}</div>
                        </td>

                        <td className="px-6 py-4 text-slate-700">
                          {formatDate(item.review_date)}
                        </td>

                        <td className="px-6 py-4 text-slate-700">
                          {getIdentityName(item.chairperson_identity_id)}
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(
                              item.status,
                            )}`}
                          >
                            {item.status}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-slate-700">
                          <div>Total: {item.action_item_count}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            Open {item.open_action_item_count} · Done{' '}
                            {item.done_action_item_count}
                          </div>
                        </td>

                        <td className="px-6 py-4 text-slate-700">
                          <div>Decisions: {item.decision_count}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            Overdue: {item.overdue_action_item_count}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <Link
                            href={`/management-reviews/${item.id}`}
                            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            View Detail
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
              <div className="text-sm text-slate-500">
                Page {page} of {Math.max(1, totalPages)}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="itam-secondary-action-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>

                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((current) => current + 1)}
                  className="itam-secondary-action-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {createOpen && canManage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-3xl rounded-[2rem] border border-white/80 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  New Management Review
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Create a new management review session in DRAFT status.
                </p>
              </div>

              <button
                type="button"
                onClick={closeCreateModal}
                className="itam-secondary-action-sm"
              >
                Close
              </button>
            </div>

            <form onSubmit={onSubmitCreate} className="px-6 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Session Code
                  </label>
                  <input
                    required
                    value={createForm.session_code}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        session_code: event.target.value,
                      }))
                    }
                    placeholder="MR-2026-004"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Review Date
                  </label>
                  <input
                    required
                    type="date"
                    value={createForm.review_date}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        review_date: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Title
                  </label>
                  <input
                    required
                    value={createForm.title}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Management Review Q2 2026"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Chairperson
                  </label>
                  <select
                    value={createForm.chairperson_identity_id}
                    disabled={loadingIdentityOptions}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        chairperson_identity_id: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
                  >
                    <option value="">Select chairperson</option>
                    {identityOptions.map((option) => (
                      <option key={option.id} value={String(option.id)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Summary
                  </label>
                  <textarea
                    rows={3}
                    value={createForm.summary}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        summary: event.target.value,
                      }))
                    }
                    placeholder="High-level summary of the review session"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Minutes
                  </label>
                  <textarea
                    rows={5}
                    value={createForm.minutes}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        minutes: event.target.value,
                      }))
                    }
                    placeholder="Meeting notes / minutes"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Notes
                  </label>
                  <textarea
                    rows={3}
                    value={createForm.notes}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    placeholder="Optional notes"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={submitting}
                  className="itam-secondary-action"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="itam-primary-action disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}