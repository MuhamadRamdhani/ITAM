'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPostJson, apiPatchJson } from '../lib/api';

type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
type CapaStatus = 'OPEN' | 'IN_PROGRESS' | 'OVERDUE' | 'CLOSED' | 'CANCELLED' | string;
type SourceType =
  | 'AUDIT_FINDING'
  | 'MANAGEMENT_REVIEW'
  | 'MANAGEMENT_REVIEW_ACTION_ITEM'
  | 'OTHER'
  | string;

type CapaItem = {
  id: number;
  code: string;
  title: string;
  source_type: SourceType;
  source_id: string | null;
  source_label: string | null;
  owner_name: string | null;
  stage: string | null;
  due_date: string | null;
  severity: Severity;
  status: CapaStatus;
};

type CapaSummary = {
  total: number;
  open: number;
  overdue: number;
  closed: number;
};

type IdentityOption = {
  id: number;
  label: string;
};

type FilterState = {
  q: string;
  status: string;
  source_type: string;
  severity: string;
};

type CreateFormState = {
  code: string;
  title: string;
  source_type: string;
  source_id: string;
  source_label: string;
  severity: string;
  owner_identity_id: string;
  due_date: string;
  nonconformity_summary: string;
  notes: string;
};

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'cyan' | 'amber' | 'green' | 'rose';
}) {
  const toneClass =
    tone === 'cyan'
      ? 'border-cyan-200 text-cyan-800'
      : tone === 'amber'
        ? 'border-amber-200 text-amber-800'
        : tone === 'green'
          ? 'border-emerald-200 text-emerald-800'
          : tone === 'rose'
            ? 'border-rose-200 text-rose-800'
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

function InnerCard({
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

function severityPill(value: string) {
  const v = String(value || '').toUpperCase();

  if (v === 'CRITICAL') {
    return 'inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200';
  }
  if (v === 'HIGH') {
    return 'inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200';
  }
  if (v === 'MEDIUM') {
    return 'inline-flex rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 ring-1 ring-inset ring-orange-200';
  }
  if (v === 'LOW') {
    return 'inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200';
  }

  return 'inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200';
}

function statusPill(value: string) {
  const v = String(value || '').toUpperCase();

  if (v === 'OPEN') {
    return 'inline-flex rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 ring-1 ring-inset ring-cyan-200';
  }
  if (v === 'IN_PROGRESS') {
    return 'inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200';
  }
  if (v === 'OVERDUE') {
    return 'inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200';
  }
  if (v === 'CLOSED') {
    return 'inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200';
  }
  if (v === 'CANCELLED') {
    return 'inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200';
  }

  return 'inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200';
}

function fmtDate(value: string | null | undefined) {
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

export default function CapaClient() {
  const [summary, setSummary] = useState<CapaSummary>({
    total: 0,
    open: 0,
    overdue: 0,
    closed: 0,
  });

  const [items, setItems] = useState<CapaItem[]>([]);
  const [identities, setIdentities] = useState<IdentityOption[]>([]);
  const [loadingIdentities, setLoadingIdentities] = useState(true);

  const [filterInput, setFilterInput] = useState<FilterState>({
    q: '',
    status: '',
    source_type: '',
    severity: '',
  });

  const [filter, setFilter] = useState<FilterState>({
    q: '',
    status: '',
    source_type: '',
    severity: '',
  });

  const [createOpen, setCreateOpen] = useState(false);

  const [createForm, setCreateForm] = useState<CreateFormState>({
    code: '',
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

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  const [submittingCreate, setSubmittingCreate] = useState(false);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadSummary() {
    setLoadingSummary(true);
    try {
      const response = await apiGet<any>('/api/v1/capa/summary');
      const data = response?.data?.data ?? response?.data ?? {};
      setSummary({
        total: Number(data.total ?? 0),
        open: Number(data.open ?? 0),
        overdue: Number(data.overdue ?? 0),
        closed: Number(data.closed ?? 0),
      });
    } catch {
      setSummary({
        total: 0,
        open: 0,
        overdue: 0,
        closed: 0,
      });
    } finally {
      setLoadingSummary(false);
    }
  }

  async function loadIdentities() {
    setLoadingIdentities(true);
    try {
      const response = await apiGet<any>('/api/v1/identities?page=1&page_size=200');
      const raw = response?.data?.data?.items ?? response?.data?.items ?? [];
      const next = Array.isArray(raw)
        ? raw
            .map((item: any) => ({
              id: Number(item?.id ?? 0),
              label: String(
                item?.display_name ??
                  item?.full_name ??
                  item?.name ??
                  item?.email ??
                  `Identity #${item?.id ?? ''}`,
              ),
            }))
            .filter((item: IdentityOption) => item.id > 0)
        : [];
      setIdentities(next);
    } catch {
      setIdentities([]);
    } finally {
      setLoadingIdentities(false);
    }
  }

  async function loadList() {
    setLoadingList(true);
    setErrorMessage(null);

    try {
      const p = new URLSearchParams();
      if (filter.q) p.set('q', filter.q);
      if (filter.status) p.set('status', filter.status);
      if (filter.source_type) p.set('source_type', filter.source_type);
      if (filter.severity) p.set('severity', filter.severity);
      p.set('page', String(page));
      p.set('page_size', '10');

      const response = await apiGet<any>(`/api/v1/capa?${p.toString()}`);
      const data = response?.data?.data ?? response?.data ?? {};

      const nextItems = Array.isArray(data.items)
        ? data.items.map((item: any) => ({
            id: Number(item?.id ?? 0),
            code: String(item?.code ?? '-'),
            title: String(item?.title ?? '-'),
            source_type: String(item?.source_type ?? 'OTHER'),
            source_id: item?.source_id == null ? null : String(item.source_id),
            source_label: item?.source_label == null ? null : String(item.source_label),
            owner_name: item?.owner_name == null ? null : String(item.owner_name),
            stage: item?.stage == null ? null : String(item.stage),
            due_date: item?.due_date == null ? null : String(item.due_date),
            severity: String(item?.severity ?? '-'),
            status: String(item?.status ?? '-'),
          }))
        : [];

      setItems(nextItems);
      setTotal(Number(data.total ?? 0));
      setTotalPages(Math.max(1, Number(data.total_pages ?? 1)));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setItems([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    loadSummary();
    loadIdentities();
  }, []);

  useEffect(() => {
    loadList();
  }, [filter, page]);

  useEffect(() => {
    if (!successMessage && !errorMessage) return;
    const timer = window.setTimeout(() => {
      setSuccessMessage(null);
      setErrorMessage(null);
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [successMessage, errorMessage]);

  const currentPageCount = useMemo(() => items.length, [items]);

  function onSubmitFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setFilter({
      q: filterInput.q.trim(),
      status: filterInput.status,
      source_type: filterInput.source_type,
      severity: filterInput.severity,
    });
  }

  function onResetFilter() {
    const next = {
      q: '',
      status: '',
      source_type: '',
      severity: '',
    };
    setFilterInput(next);
    setFilter(next);
    setPage(1);
  }

  function resetCreateForm() {
    setCreateForm({
      code: '',
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
  }

  async function onSubmitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingCreate(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      await apiPostJson('/api/v1/capa', {
        code: createForm.code.trim(),
        title: createForm.title.trim(),
        source_type: createForm.source_type,
        source_id: createForm.source_id.trim() || null,
        source_label: createForm.source_label.trim() || null,
        severity: createForm.severity,
        owner_identity_id: createForm.owner_identity_id
          ? Number(createForm.owner_identity_id)
          : null,
        due_date: createForm.due_date || null,
        nonconformity_summary: createForm.nonconformity_summary.trim() || null,
        notes: createForm.notes.trim() || null,
      });

      resetCreateForm();
      setCreateOpen(false);
      setSuccessMessage('CAPA created successfully.');
      setPage(1);
      await Promise.all([loadSummary(), loadList()]);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSubmittingCreate(false);
    }
  }

  return (
    <main className="itam-page-shell">
      <div className="itam-page-shell-inner">
        <section className="rounded-[2rem] border border-white/80 bg-white/75 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700">
                MVP 3.3
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                CAPA Workflow
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
                Register CAPA untuk nonconformity, root cause, corrective action,
                preventive action, verification, dan closure dalam satu alur yang audit-ready.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Link href="/" className="itam-secondary-action">
                Back
              </Link>
              <Link href="/management-reviews" className="itam-secondary-action">
                Management Reviews
              </Link>
              <button
                type="button"
                onClick={() => setCreateOpen((prev) => !prev)}
                className="itam-primary-action"
              >
                {createOpen ? 'Hide Create CAPA' : 'Create CAPA'}
              </button>
            </div>
          </div>
        </section>

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

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total CAPA" value={loadingSummary ? '...' : summary.total} />
          <StatCard label="Open" value={loadingSummary ? '...' : summary.open} tone="cyan" />
          <StatCard
            label="Overdue"
            value={loadingSummary ? '...' : summary.overdue}
            tone="amber"
          />
          <StatCard
            label="Closed"
            value={loadingSummary ? '...' : summary.closed}
            tone="green"
          />
        </section>

        <section className="mt-8 rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
            <form
              className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px_180px_auto]"
              onSubmit={onSubmitFilter}
            >
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Search
                </label>
                <input
                  value={filterInput.q}
                  onChange={(e) =>
                    setFilterInput((current) => ({ ...current, q: e.target.value }))
                  }
                  placeholder="Search CAPA"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Status
                </label>
                <select
                  value={filterInput.status}
                  onChange={(e) =>
                    setFilterInput((current) => ({
                      ...current,
                      status: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="">All statuses</option>
                  <option value="OPEN">OPEN</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="OVERDUE">OVERDUE</option>
                  <option value="CLOSED">CLOSED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Source
                </label>
                <select
                  value={filterInput.source_type}
                  onChange={(e) =>
                    setFilterInput((current) => ({
                      ...current,
                      source_type: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="">All sources</option>
                  <option value="AUDIT_FINDING">AUDIT_FINDING</option>
                  <option value="MANAGEMENT_REVIEW">MANAGEMENT_REVIEW</option>
                  <option value="MANAGEMENT_REVIEW_ACTION_ITEM">
                    MANAGEMENT_REVIEW_ACTION_ITEM
                  </option>
                  <option value="OTHER">OTHER</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Severity
                </label>
                <select
                  value={filterInput.severity}
                  onChange={(e) =>
                    setFilterInput((current) => ({
                      ...current,
                      severity: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="">All severities</option>
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>

              <div className="flex items-end gap-2">
                <button type="submit" className="itam-primary-action">
                  Apply
                </button>
                <button
                  type="button"
                  onClick={onResetFilter}
                  className="itam-secondary-action"
                >
                  Reset
                </button>
              </div>
            </form>
          </div>
        </section>

        {createOpen ? (
          <section className="mt-8 rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <InnerCard
              title="Create CAPA"
              description="Buat kasus baru dari audit finding, management review, atau input manual."
            >
              <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmitCreate}>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    CAPA code
                  </label>
                  <input
                    value={createForm.code}
                    onChange={(e) =>
                      setCreateForm((current) => ({ ...current, code: e.target.value }))
                    }
                    placeholder="CAPA code"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Title
                  </label>
                  <input
                    value={createForm.title}
                    onChange={(e) =>
                      setCreateForm((current) => ({ ...current, title: e.target.value }))
                    }
                    placeholder="Title"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Source Type
                  </label>
                  <select
                    value={createForm.source_type}
                    onChange={(e) =>
                      setCreateForm((current) => ({
                        ...current,
                        source_type: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  >
                    <option value="OTHER">OTHER</option>
                    <option value="AUDIT_FINDING">AUDIT_FINDING</option>
                    <option value="MANAGEMENT_REVIEW">MANAGEMENT_REVIEW</option>
                    <option value="MANAGEMENT_REVIEW_ACTION_ITEM">
                      MANAGEMENT_REVIEW_ACTION_ITEM
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Source ID (optional)
                  </label>
                  <input
                    value={createForm.source_id}
                    onChange={(e) =>
                      setCreateForm((current) => ({
                        ...current,
                        source_id: e.target.value,
                      }))
                    }
                    placeholder="Source ID"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Source Label (optional)
                  </label>
                  <input
                    value={createForm.source_label}
                    onChange={(e) =>
                      setCreateForm((current) => ({
                        ...current,
                        source_label: e.target.value,
                      }))
                    }
                    placeholder="Source label"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Severity
                  </label>
                  <select
                    value={createForm.severity}
                    onChange={(e) =>
                      setCreateForm((current) => ({
                        ...current,
                        severity: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Owner identity
                  </label>
                  <select
                    value={createForm.owner_identity_id}
                    disabled={loadingIdentities}
                    onChange={(e) =>
                      setCreateForm((current) => ({
                        ...current,
                        owner_identity_id: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
                  >
                    <option value="">Select owner</option>
                    {identities.map((item) => (
                      <option key={item.id} value={String(item.id)}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Due date
                  </label>
                  <input
                    type="date"
                    value={createForm.due_date}
                    onChange={(e) =>
                      setCreateForm((current) => ({
                        ...current,
                        due_date: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Nonconformity summary
                  </label>
                  <textarea
                    rows={4}
                    value={createForm.nonconformity_summary}
                    onChange={(e) =>
                      setCreateForm((current) => ({
                        ...current,
                        nonconformity_summary: e.target.value,
                      }))
                    }
                    placeholder="Nonconformity summary"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Notes
                  </label>
                  <textarea
                    rows={4}
                    value={createForm.notes}
                    onChange={(e) =>
                      setCreateForm((current) => ({ ...current, notes: e.target.value }))
                    }
                    placeholder="CAPA notes"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div className="md:col-span-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setCreateOpen(false);
                      resetCreateForm();
                    }}
                    className="itam-secondary-action"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={submittingCreate}
                    className="itam-primary-action disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submittingCreate ? 'Creating...' : 'Create CAPA'}
                  </button>
                </div>
              </form>
            </InnerCard>
          </section>
        ) : null}

        <section className="mt-8 rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="text-base font-semibold text-slate-900">CAPA Cases</h2>
              <p className="mt-1 text-sm text-slate-500">
                Current page total: {currentPageCount} · Total matched CAPA: {total}
              </p>
            </div>

            {loadingList ? (
              <div className="px-6 py-10 text-sm text-slate-500">Loading CAPA cases...</div>
            ) : items.length === 0 ? (
              <div className="px-6 py-12">
                <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                  <div className="text-base font-medium text-slate-900">
                    No CAPA cases found
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    Try changing the filter or create a new CAPA.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-6 py-3 font-medium">CAPA</th>
                      <th className="px-6 py-3 font-medium">Source</th>
                      <th className="px-6 py-3 font-medium">Owner</th>
                      <th className="px-6 py-3 font-medium">Stage</th>
                      <th className="px-6 py-3 font-medium">Due</th>
                      <th className="px-6 py-3 font-medium">Severity</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium">Action</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {items.map((item) => (
                      <tr key={item.id} className="align-top">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900">{item.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.code}</div>
                        </td>

                        <td className="px-6 py-4 text-slate-700">
                          <div>{item.source_type || '-'}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {item.source_label || item.source_id || '-'}
                          </div>
                        </td>

                        <td className="px-6 py-4 text-slate-700">
                          {item.owner_name || '-'}
                        </td>

                        <td className="px-6 py-4 text-slate-700">
                          {item.stage || '-'}
                        </td>

                        <td className="px-6 py-4 text-slate-700">
                          {fmtDate(item.due_date)}
                        </td>

                        <td className="px-6 py-4">
                          <span className={severityPill(item.severity)}>{item.severity}</span>
                        </td>

                        <td className="px-6 py-4">
                          <span className={statusPill(item.status)}>{item.status}</span>
                        </td>

                       <td className="px-6 py-4 whitespace-nowrap">
  <Link
    href={`/capa/${item.id}`}
    className="inline-flex min-w-[120px] items-center justify-center whitespace-nowrap rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-medium leading-none text-slate-700 transition hover:bg-slate-50"
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
                  disabled={page <= 1 || loadingList}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="itam-secondary-action-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>

                <button
                  type="button"
                  disabled={page >= totalPages || loadingList}
                  onClick={() => setPage((current) => current + 1)}
                  className="itam-secondary-action-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}