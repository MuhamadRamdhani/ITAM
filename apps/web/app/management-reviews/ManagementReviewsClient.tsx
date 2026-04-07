'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CreateManagementReviewPayload,
  ManagementReviewSession,
  ManagementReviewSessionStatus,
  createManagementReview,
  listManagementReviews,
} from '../lib/management-reviews';

type CreateFormState = {
  session_code: string;
  title: string;
  review_date: string;
  summary: string;
  minutes: string;
  notes: string;
};

const PAGE_SIZE = 10;

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
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
      return 'bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200';
  }
}

export default function ManagementReviewsClient() {
  const [items, setItems] = useState<ManagementReviewSession[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ManagementReviewSessionStatus | ''>('');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>({
    session_code: '',
    title: '',
    review_date: getTodayDate(),
    summary: '',
    minutes: '',
    notes: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
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
    }
  }, [page, search, status]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      summary: '',
      minutes: '',
      notes: '',
    });
  }

  function openCreateModal() {
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
      await loadData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
              Management Reviews
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Manage management review sessions, capture meeting minutes, and track
              follow-up progress across the tenant.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/management-reviews/action-items"
              className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              Open Action Tracker
            </Link>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800"
            >
              New Management Review
            </button>
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
            <div className="text-sm text-gray-500">Draft on page</div>
            <div className="mt-2 text-2xl font-semibold text-amber-700">{draftCount}</div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">Completed on page</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-700">
              {completedCount}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">Cancelled on page</div>
            <div className="mt-2 text-2xl font-semibold text-rose-700">{cancelledCount}</div>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <form
            onSubmit={onSubmitSearch}
            className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto]"
          >
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Search
              </label>
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search by session code or title"
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                value={status}
                onChange={(event) => onChangeStatus(event.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              >
                <option value="">All statuses</option>
                <option value="DRAFT">DRAFT</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
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
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                  setStatus('');
                  setPage(1);
                }}
                className="inline-flex h-[42px] items-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Reset
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Session List</h2>
              <p className="mt-1 text-sm text-gray-500">
                Total matched sessions: {total}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="px-5 py-10 text-sm text-gray-500">Loading management reviews...</div>
          ) : items.length === 0 ? (
            <div className="px-5 py-10 text-sm text-gray-500">
              No management review sessions found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-left text-gray-600">
                    <th className="px-5 py-3 font-medium">Session</th>
                    <th className="px-5 py-3 font-medium">Review Date</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Action Items</th>
                    <th className="px-5 py-3 font-medium">Summary</th>
                    <th className="px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-900">{item.session_code}</div>
                        <div className="mt-1 text-sm text-gray-700">{item.title}</div>
                      </td>

                      <td className="px-5 py-4 text-gray-700">
                        {formatDate(item.review_date)}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(
                            item.status,
                          )}`}
                        >
                          {item.status}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-gray-700">
                        <div>Total: {item.action_item_count}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          Open {item.open_action_item_count} · Done {item.done_action_item_count}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-gray-700">
                        <div>Decisions: {item.decision_count}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          Overdue: {item.overdue_action_item_count}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <Link
                          href={`/management-reviews/${item.id}`}
                          className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
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

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4">
          <div className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  New Management Review
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Create a new management review session in DRAFT status.
                </p>
              </div>

              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <form onSubmit={onSubmitCreate} className="px-6 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
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
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
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
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
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
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
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
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
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
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
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
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={submitting}
                  className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}