'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ManagementReviewActionItem,
  ManagementReviewActionItemStatus,
  listManagementReviewActionTracker,
  updateManagementReviewActionItem,
} from '../../lib/management-reviews';
import {
  IdentityOption,
  getIdentityLabel,
  listIdentityOptions,
} from '../../lib/internal-audits';

type ActionFollowUpDraft = {
  status: ManagementReviewActionItemStatus;
  progress_notes: string;
  completion_notes: string;
};

type IdentitySelectOption = {
  id: number;
  label: string;
};

const PAGE_SIZE = 20;

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

function sessionStatusBadgeClass(status: string | null | undefined) {
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

function buildActionDrafts(items: ManagementReviewActionItem[]) {
  const next: Record<number, ActionFollowUpDraft> = {};
  for (const item of items) {
    next[item.id] = {
      status: item.status,
      progress_notes: item.progress_notes ?? '',
      completion_notes: item.completion_notes ?? '',
    };
  }
  return next;
}

export default function ManagementReviewActionTrackerClient() {
  const [items, setItems] = useState<ManagementReviewActionItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [identityOptions, setIdentityOptions] = useState<IdentitySelectOption[]>([]);
  const [loadingIdentityOptions, setLoadingIdentityOptions] = useState(true);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ManagementReviewActionItemStatus | ''>('');
  const [ownerIdentityIdInput, setOwnerIdentityIdInput] = useState('');
  const [ownerIdentityId, setOwnerIdentityId] = useState<number | undefined>(undefined);
  const [sessionIdInput, setSessionIdInput] = useState('');
  const [sessionId, setSessionId] = useState<number | undefined>(undefined);
  const [overdueOnly, setOverdueOnly] = useState(false);

  const [loading, setLoading] = useState(true);
  const [updatingActionItemId, setUpdatingActionItemId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [actionDrafts, setActionDrafts] = useState<Record<number, ActionFollowUpDraft>>({});

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

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await listManagementReviewActionTracker({
        q: search || undefined,
        status: status || undefined,
        owner_identity_id: ownerIdentityId,
        overdue_only: overdueOnly || undefined,
        session_id: sessionId,
        page,
        page_size: PAGE_SIZE,
      });

      const nextItems = response.items ?? [];
      setItems(nextItems);
      setPage(response.page ?? 1);
      setTotalPages(response.total_pages ?? 1);
      setTotal(response.total ?? 0);
      setActionDrafts(buildActionDrafts(nextItems));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setItems([]);
      setTotal(0);
      setTotalPages(1);
      setActionDrafts({});
    } finally {
      setLoading(false);
    }
  }, [ownerIdentityId, overdueOnly, page, search, sessionId, status]);

  useEffect(() => {
    loadData();
    loadIdentityOptions();
  }, [loadData, loadIdentityOptions]);

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

  const openCount = useMemo(
    () => items.filter((item) => item.status === 'OPEN').length,
    [items],
  );

  const inProgressCount = useMemo(
    () => items.filter((item) => item.status === 'IN_PROGRESS').length,
    [items],
  );

  const doneCount = useMemo(
    () => items.filter((item) => item.status === 'DONE').length,
    [items],
  );

  const overdueCount = useMemo(
    () => items.filter((item) => item.is_overdue).length,
    [items],
  );

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
    setOwnerIdentityId(
      ownerIdentityIdInput.trim() ? Number(ownerIdentityIdInput.trim()) : undefined,
    );
    setSessionId(sessionIdInput.trim() ? Number(sessionIdInput.trim()) : undefined);
  }

  function resetFilters() {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setOwnerIdentityIdInput('');
    setOwnerIdentityId(undefined);
    setSessionIdInput('');
    setSessionId(undefined);
    setOverdueOnly(false);
    setPage(1);
  }

  async function handleUpdateFollowUp(item: ManagementReviewActionItem) {
    const draft = actionDrafts[item.id];
    if (!draft) return;
    if (item.session_status !== 'COMPLETED') return;

    setUpdatingActionItemId(item.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await updateManagementReviewActionItem(item.session_id, item.id, {
        status: draft.status,
        progress_notes: draft.progress_notes.trim() || null,
        completion_notes: draft.completion_notes.trim() || null,
      });

      setSuccessMessage(`Action item ${item.action_no || item.id} updated successfully.`);
      await loadData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setUpdatingActionItemId(null);
    }
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

            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
              Management Review Action Tracker
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Monitor action items across management review sessions and update follow-up
              progress for completed sessions.
            </p>
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

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">Current page total</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{items.length}</div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">Open on page</div>
            <div className="mt-2 text-2xl font-semibold text-amber-700">{openCount}</div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">In progress on page</div>
            <div className="mt-2 text-2xl font-semibold text-blue-700">{inProgressCount}</div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">Done / Overdue on page</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">
              {doneCount}{' '}
              <span className="text-sm font-normal text-gray-500">/ {overdueCount}</span>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <form
            onSubmit={applyFilters}
            className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_220px_180px_auto]"
          >
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Search
              </label>
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search by title or description"
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as ManagementReviewActionItemStatus | '');
                  setPage(1);
                }}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              >
                <option value="">All statuses</option>
                <option value="OPEN">OPEN</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="DONE">DONE</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Owner
              </label>
              <select
                value={ownerIdentityIdInput}
                disabled={loadingIdentityOptions}
                onChange={(event) => setOwnerIdentityIdInput(event.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50"
              >
                <option value="">All owners</option>
                {identityOptions.map((option) => (
                  <option key={option.id} value={String(option.id)}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Session ID
              </label>
              <input
                type="number"
                value={sessionIdInput}
                onChange={(event) => setSessionIdInput(event.target.value)}
                placeholder="Optional"
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="inline-flex h-[42px] items-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-800"
              >
                Apply
              </button>

              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-[42px] items-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Reset
              </button>
            </div>

            <div className="md:col-span-5">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={overdueOnly}
                  onChange={(event) => {
                    setOverdueOnly(event.target.checked);
                    setPage(1);
                  }}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Show overdue only
              </label>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Tracker Results</h2>
              <p className="mt-1 text-sm text-gray-500">Total matched action items: {total}</p>
            </div>
          </div>

          {loading ? (
            <div className="px-5 py-10 text-sm text-gray-500">Loading action tracker...</div>
          ) : items.length === 0 ? (
            <div className="px-5 py-10 text-sm text-gray-500">
              No action items matched the current filters.
            </div>
          ) : (
            <div className="space-y-4 px-5 py-5">
              {items.map((item) => {
                const draft = actionDrafts[item.id] ?? {
                  status: item.status,
                  progress_notes: item.progress_notes ?? '',
                  completion_notes: item.completion_notes ?? '',
                };

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 flex-1">
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

                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${sessionStatusBadgeClass(
                              item.session_status,
                            )}`}
                          >
                            Session {item.session_status || '-'}
                          </span>

                          {item.is_overdue ? (
                            <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                              OVERDUE
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 text-base font-medium text-gray-900">
                          {item.title}
                        </div>

                        {item.description ? (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                            {item.description}
                          </p>
                        ) : null}

                        <div className="mt-4 grid gap-3 text-sm text-gray-600 md:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <div className="font-medium text-gray-900">Session</div>
                            <div className="mt-1">
                              {item.session_code || '-'} — {item.session_title || '-'}
                            </div>
                          </div>

                          <div>
                            <div className="font-medium text-gray-900">Session Review Date</div>
                            <div className="mt-1">{formatDate(item.session_review_date)}</div>
                          </div>

                          <div>
                            <div className="font-medium text-gray-900">Owner</div>
                            <div className="mt-1">{getIdentityName(item.owner_identity_id)}</div>
                          </div>

                          <div>
                            <div className="font-medium text-gray-900">Due Date</div>
                            <div className="mt-1">{formatDate(item.due_date)}</div>
                          </div>
                        </div>

                        <div className="mt-4">
                          <Link
                            href={`/management-reviews/${item.session_id}`}
                            className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                          >
                            Open Session Detail
                          </Link>
                        </div>
                      </div>
                    </div>

                    {item.session_status === 'COMPLETED' ? (
                      <div className="mt-5 grid gap-4 md:grid-cols-3">
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

                        <div className="md:col-span-3 flex items-center justify-between gap-3">
                          <div className="text-sm text-gray-500">
                            Completed At: {formatDateTime(item.completed_at)}
                          </div>

                          <button
                            type="button"
                            disabled={updatingActionItemId === item.id}
                            onClick={() => handleUpdateFollowUp(item)}
                            className="inline-flex items-center rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {updatingActionItemId === item.id
                              ? 'Updating...'
                              : 'Update Follow Up'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 grid gap-3 md:grid-cols-2">
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

          <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4">
            <div className="text-sm text-gray-500">
              Page {page} of {Math.max(1, totalPages)}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>

              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((current) => current + 1)}
                className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}