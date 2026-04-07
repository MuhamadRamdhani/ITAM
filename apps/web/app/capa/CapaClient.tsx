'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CreateCapaPayload,
  CapaCase,
  CapaSeverity,
  CapaSourceType,
  CapaStatus,
  createCapa,
  listCapas,
} from '../lib/capa';
import {
  IdentityOption,
  getIdentityLabel,
  listIdentityOptions,
} from '../lib/internal-audits';

type IdentitySelectOption = {
  id: number;
  label: string;
};

type CreateFormState = {
  capa_code: string;
  title: string;
  source_type: CapaSourceType;
  source_id: string;
  source_label: string;
  severity: CapaSeverity;
  owner_identity_id: string;
  due_date: string;
  nonconformity_summary: string;
  notes: string;
};

const PAGE_SIZE = 10;

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

function statusClass(status: CapaStatus) {
  switch (status) {
    case 'OPEN':
      return 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200';
    case 'ROOT_CAUSE':
      return 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200';
    case 'CORRECTIVE_ACTION':
      return 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200';
    case 'PREVENTIVE_ACTION':
      return 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200';
    case 'VERIFICATION':
      return 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200';
    case 'CLOSED':
      return 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200';
    case 'CANCELLED':
      return 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200';
    default:
      return 'bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200';
  }
}

function severityClass(severity: CapaSeverity) {
  switch (severity) {
    case 'CRITICAL':
      return 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200';
    case 'HIGH':
      return 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200';
    case 'MEDIUM':
      return 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200';
    case 'LOW':
      return 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200';
    default:
      return 'bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200';
  }
}

export default function CapaClient() {
  const router = useRouter();
  const [items, setItems] = useState<CapaCase[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({
    total_items: 0,
    open_count: 0,
    root_cause_count: 0,
    corrective_action_count: 0,
    preventive_action_count: 0,
    verification_count: 0,
    closed_count: 0,
    cancelled_count: 0,
    overdue_count: 0,
  });

  const [identityOptions, setIdentityOptions] = useState<IdentitySelectOption[]>([]);
  const [loadingIdentityOptions, setLoadingIdentityOptions] = useState(true);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CapaStatus | ''>('');
  const [sourceType, setSourceType] = useState<CapaSourceType | ''>('');
  const [severity, setSeverity] = useState<CapaSeverity | ''>('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<CreateFormState>({
    capa_code: '',
    title: '',
    source_type: 'OTHER',
    source_id: '',
    source_label: '',
    severity: 'MEDIUM',
    owner_identity_id: '',
    due_date: '',
    nonconformity_summary: '',
    notes: '',
  });

  const queryParams = useMemo(
    () => ({
      q: search || undefined,
      status: status || undefined,
      source_type: sourceType || undefined,
      severity: severity || undefined,
      page,
      page_size: PAGE_SIZE,
    }),
    [page, search, severity, sourceType, status],
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrapIdentityOptions() {
      try {
        setLoadingIdentityOptions(true);
        const res = await listIdentityOptions({ page: 1, page_size: 100 });
        if (cancelled) return;
        setIdentityOptions(normalizeIdentityOptions(res.items));
      } catch {
        if (!cancelled) {
          setIdentityOptions([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingIdentityOptions(false);
        }
      }
    }

    bootstrapIdentityOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadData = useMemo(
    () => async () => {
      setErrorMessage(null);
      const isRefresh = Boolean(page > 1 || search || status || sourceType || severity);
      setRefreshing(isRefresh);
      if (!isRefresh) {
        setLoading(true);
      }

      try {
        const res = await listCapas(queryParams);
        setItems(res.items);
        setSummary(res.summary);
        setTotalPages(res.pagination.total_pages || 1);
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, queryParams, search, severity, sourceType, status],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function setField<K extends keyof CreateFormState>(key: K, value: CreateFormState[K]) {
    setCreateForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const payload: CreateCapaPayload = {
        capa_code: createForm.capa_code,
        title: createForm.title,
        source_type: createForm.source_type,
        source_id: createForm.source_id ? Number(createForm.source_id) : null,
        source_label: createForm.source_label || null,
        severity: createForm.severity,
        owner_identity_id: createForm.owner_identity_id ? Number(createForm.owner_identity_id) : null,
        due_date: createForm.due_date || null,
        nonconformity_summary: createForm.nonconformity_summary || null,
        notes: createForm.notes || null,
      };

      const created = await createCapa(payload);
      setSuccessMessage(`CAPA ${createForm.capa_code} created.`);
      setCreateForm({
        capa_code: '',
        title: '',
        source_type: 'OTHER',
        source_id: '',
        source_label: '',
        severity: 'MEDIUM',
        owner_identity_id: '',
        due_date: '',
        nonconformity_summary: '',
        notes: '',
      });
      await loadData();
      router.push(`/capa/${created.id}`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  const isBusy = loading || refreshing;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.10),_transparent_28%),radial-gradient(circle_at_80%_20%,_rgba(14,165,233,0.08),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.06),_transparent_22%)]" />
      <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-cyan-300/12 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-sky-300/8 blur-3xl" />

      <div className="relative mx-auto max-w-7xl space-y-6 px-4 py-4 sm:px-6 lg:px-10 lg:py-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">
                MVP 3.3
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                CAPA Workflow
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Register CAPA untuk nonconformity, root cause, corrective action, preventive action,
                verification, dan closure dalam satu alur yang audit-ready.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 md:self-end">
              <Link href="/" className="itam-secondary-action">
                Back
              </Link>
              <Link href="/management-reviews" className="itam-secondary-action">
                Management Reviews
              </Link>
            </div>
          </div>

          {errorMessage && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Total CAPA
              </div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">{summary.total_items}</div>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">
                Open
              </div>
              <div className="mt-2 text-3xl font-semibold text-sky-800">{summary.open_count}</div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">
                Overdue
              </div>
              <div className="mt-2 text-3xl font-semibold text-amber-800">{summary.overdue_count}</div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">
                Closed
              </div>
              <div className="mt-2 text-3xl font-semibold text-emerald-800">{summary.closed_count}</div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,1fr)]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">CAPA cases</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Filter dan buka detail untuk lanjutkan root cause sampai closure.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setSearch(searchInput.trim());
                      setPage(1);
                    }
                  }}
                  placeholder="Search CAPA"
                  className="min-w-[220px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none transition focus:border-cyan-300"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearch(searchInput.trim());
                    setPage(1);
                  }}
                  className="rounded-xl border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-900"
                >
                  Apply
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <select
                value={status}
                onChange={(e) => {
                  setStatus((e.target.value as CapaStatus) || '');
                  setPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none"
              >
                <option value="">All statuses</option>
                <option value="OPEN">OPEN</option>
                <option value="ROOT_CAUSE">ROOT_CAUSE</option>
                <option value="CORRECTIVE_ACTION">CORRECTIVE_ACTION</option>
                <option value="PREVENTIVE_ACTION">PREVENTIVE_ACTION</option>
                <option value="VERIFICATION">VERIFICATION</option>
                <option value="CLOSED">CLOSED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>

              <select
                value={sourceType}
                onChange={(e) => {
                  setSourceType((e.target.value as CapaSourceType) || '');
                  setPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none"
              >
                <option value="">All sources</option>
                <option value="INTERNAL_AUDIT_FINDING">INTERNAL_AUDIT_FINDING</option>
                <option value="MANAGEMENT_REVIEW_ACTION_ITEM">
                  MANAGEMENT_REVIEW_ACTION_ITEM
                </option>
                <option value="OTHER">OTHER</option>
              </select>

              <select
                value={severity}
                onChange={(e) => {
                  setSeverity((e.target.value as CapaSeverity) || '');
                  setPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none"
              >
                <option value="">All severities</option>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                  setStatus('');
                  setSourceType('');
                  setSeverity('');
                  setPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-slate-900"
              >
                Reset Filters
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
            {isBusy ? (
              <div className="px-6 py-12 text-center text-sm text-slate-500">Loading CAPA...</div>
            ) : items.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-slate-500">
                No CAPA cases matched the current filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        CAPA
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Owner
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Stage
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Due
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Status
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-4">
                          <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                          <div className="mt-1 font-mono text-xs text-slate-500">{item.capa_code}</div>
                          <div className="mt-2 text-xs text-slate-500">
                            {item.source_label || item.source_type}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">
                          {item.owner_identity_name || item.owner_identity_email || '-'}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${severityClass(
                              item.severity,
                            )}`}
                          >
                            {item.severity}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">
                          {formatDate(item.due_date)}
                          {item.is_overdue ? (
                            <div className="mt-1 text-xs font-semibold text-amber-700">Overdue</div>
                          ) : null}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                              item.status,
                            )}`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link
                            href={`/capa/${item.id}`}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-slate-900"
                          >
                            Open Detail
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)] md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-slate-600">
              Page <span className="font-semibold text-slate-900">{page}</span> of{' '}
              <span className="font-semibold text-slate-900">{totalPages}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => prev + 1)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]"
          >
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Create CAPA</h2>
              <p className="mt-1 text-sm text-slate-600">
                Buat kasus baru dari audit finding, management review, atau input manual.
              </p>
            </div>

            <div className="mt-5 space-y-4">
              <input
                value={createForm.capa_code}
                onChange={(e) => setField('capa_code', e.target.value)}
                placeholder="CAPA code"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-300"
                required
              />
              <input
                value={createForm.title}
                onChange={(e) => setField('title', e.target.value)}
                placeholder="Title"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-300"
                required
              />
              <select
                value={createForm.source_type}
                onChange={(e) => setField('source_type', e.target.value as CapaSourceType)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-300"
              >
                <option value="OTHER">OTHER</option>
                <option value="INTERNAL_AUDIT_FINDING">INTERNAL_AUDIT_FINDING</option>
                <option value="MANAGEMENT_REVIEW_ACTION_ITEM">
                  MANAGEMENT_REVIEW_ACTION_ITEM
                </option>
              </select>
              <input
                value={createForm.source_id}
                onChange={(e) => setField('source_id', e.target.value)}
                placeholder="Source ID (optional)"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-300"
              />
              <input
                value={createForm.source_label}
                onChange={(e) => setField('source_label', e.target.value)}
                placeholder="Source label (optional)"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-300"
              />
              <select
                value={createForm.severity}
                onChange={(e) => setField('severity', e.target.value as CapaSeverity)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-300"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>

              <select
                value={createForm.owner_identity_id}
                onChange={(e) => setField('owner_identity_id', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-300"
                disabled={loadingIdentityOptions}
              >
                <option value="">
                  {loadingIdentityOptions ? 'Loading owners...' : 'Owner identity (optional)'}
                </option>
                {identityOptions.map((identity) => (
                  <option key={identity.id} value={identity.id}>
                    {identity.label}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={createForm.due_date}
                onChange={(e) => setField('due_date', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-300"
              />
              <textarea
                value={createForm.nonconformity_summary}
                onChange={(e) => setField('nonconformity_summary', e.target.value)}
                placeholder="Nonconformity summary"
                rows={4}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-300"
              />
              <textarea
                value={createForm.notes}
                onChange={(e) => setField('notes', e.target.value)}
                placeholder="Notes"
                rows={3}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-300"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-xl border border-slate-950 bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Creating...' : 'Create CAPA'}
            </button>
          </form>
        </aside>
        </section>
      </div>
    </main>
  );
}
