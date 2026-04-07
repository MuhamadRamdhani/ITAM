'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CreateInternalAuditPayload,
  IdentityOption,
  InternalAuditListItem,
  createInternalAudit,
  getIdentityLabel,
  listIdentityOptions,
  listInternalAudits,
} from '../lib/internal-audits';

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong.';
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'DRAFT':
      return 'bg-gray-100 text-gray-700';
    case 'IN_PROGRESS':
      return 'bg-blue-100 text-blue-700';
    case 'COMPLETED':
      return 'bg-emerald-100 text-emerald-700';
    case 'CANCELLED':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

type CreateFormState = {
  audit_code: string;
  audit_title: string;
  audit_type: string;
  scope_summary: string;
  objective: string;
  planned_start_date: string;
  planned_end_date: string;
  lead_auditor_identity_id: string;
  auditee_summary: string;
  notes: string;
};

const initialCreateForm: CreateFormState = {
  audit_code: '',
  audit_title: '',
  audit_type: 'INTERNAL',
  scope_summary: '',
  objective: '',
  planned_start_date: '',
  planned_end_date: '',
  lead_auditor_identity_id: '',
  auditee_summary: '',
  notes: '',
};

export default function InternalAuditsClient() {
  const router = useRouter();

  const [items, setItems] = useState<InternalAuditListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const [auditType, setAuditType] = useState('ALL');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(initialCreateForm);
  const [savingCreate, setSavingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [identitySearch, setIdentitySearch] = useState('');
  const [identities, setIdentities] = useState<IdentityOption[]>([]);
  const [loadingIdentities, setLoadingIdentities] = useState(false);

  const loadAudits = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await listInternalAudits({
        page,
        page_size: pageSize,
        q: q || undefined,
        status,
        audit_type: auditType,
      });

      setItems(data.items || []);
      setTotalPages(data.pagination?.total_pages ?? 0);
      setTotalItems(data.pagination?.total_items ?? 0);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, status, auditType]);

  const loadIdentities = useCallback(async () => {
    try {
      setLoadingIdentities(true);
      const data = await listIdentityOptions({
        page: 1,
        page_size: 25,
        q: identitySearch || undefined,
      });
      setIdentities(data.items || []);
    } catch {
      setIdentities([]);
    } finally {
      setLoadingIdentities(false);
    }
  }, [identitySearch]);

  useEffect(() => {
    void loadAudits();
  }, [loadAudits]);

  useEffect(() => {
    if (!createOpen) return;
    void loadIdentities();
  }, [createOpen, loadIdentities]);

  const pageSummary = useMemo(() => {
    if (totalItems === 0) return 'No internal audits yet';
    return `${totalItems} internal audit${totalItems > 1 ? 's' : ''}`;
  }, [totalItems]);

  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();

    try {
      setSavingCreate(true);
      setCreateError(null);

      const payload: CreateInternalAuditPayload = {
        audit_code: createForm.audit_code.trim(),
        audit_title: createForm.audit_title.trim(),
        audit_type: createForm.audit_type,
      };

      if (createForm.scope_summary.trim()) {
        payload.scope_summary = createForm.scope_summary.trim();
      }
      if (createForm.objective.trim()) {
        payload.objective = createForm.objective.trim();
      }
      if (createForm.planned_start_date) {
        payload.planned_start_date = createForm.planned_start_date;
      }
      if (createForm.planned_end_date) {
        payload.planned_end_date = createForm.planned_end_date;
      }
      if (createForm.lead_auditor_identity_id) {
        payload.lead_auditor_identity_id = Number(createForm.lead_auditor_identity_id);
      }
      if (createForm.auditee_summary.trim()) {
        payload.auditee_summary = createForm.auditee_summary.trim();
      }
      if (createForm.notes.trim()) {
        payload.notes = createForm.notes.trim();
      }

      const result = await createInternalAudit(payload);

      setCreateOpen(false);
      setCreateForm(initialCreateForm);
      router.push(`/internal-audits/${result.id}`);
    } catch (err) {
      setCreateError(getErrorMessage(err));
    } finally {
      setSavingCreate(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
              Internal Audit
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-gray-900">
              Internal Audits
            </h1>
            <p className="mt-2 text-sm text-gray-600">{pageSummary}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Back
            </Link>

            <button
              type="button"
              onClick={() => void loadAudits()}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Refresh
            </button>

            <button
              type="button"
              onClick={() => {
                setCreateError(null);
                setCreateForm(initialCreateForm);
                setIdentitySearch('');
                setCreateOpen(true);
              }}
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
            >
              New Internal Audit
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Search
              </label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search audit code or title"
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => {
                  setPage(1);
                  setStatus(e.target.value);
                }}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
              >
                <option value="ALL">All</option>
                <option value="DRAFT">Draft</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Audit Type
              </label>
              <select
                value={auditType}
                onChange={(e) => {
                  setPage(1);
                  setAuditType(e.target.value);
                }}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
              >
                <option value="ALL">All</option>
                <option value="INTERNAL">Internal</option>
                <option value="THEMATIC">Thematic</option>
                <option value="PROCESS">Process</option>
                <option value="LOCATION">Location</option>
                <option value="FOLLOW_UP">Follow Up</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setPage(1);
                void loadAudits();
              }}
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Apply Filter
            </button>

            <button
              type="button"
              onClick={() => {
                setPage(1);
                setQ('');
                setStatus('ALL');
                setAuditType('ALL');
              }}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="px-6 py-10 text-sm text-gray-500">Loading internal audits...</div>
          ) : error ? (
            <div className="px-6 py-10 text-sm text-red-600">{error}</div>
          ) : items.length === 0 ? (
            <div className="px-6 py-10">
              <h2 className="text-base font-semibold text-gray-900">
                No internal audits yet
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Create your first internal audit plan to start building the audit workspace.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-left text-gray-600">
                    <th className="px-6 py-3 font-medium">Audit</th>
                    <th className="px-6 py-3 font-medium">Type</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Planned Period</th>
                    <th className="px-6 py-3 font-medium">Lead Auditor</th>
                    <th className="px-6 py-3 font-medium">Counts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <tr key={String(item.id)} className="hover:bg-gray-50">
                      <td className="px-6 py-4 align-top">
                        <Link
                          href={`/internal-audits/${item.id}`}
                          className="font-semibold text-gray-900 hover:underline"
                        >
                          {item.audit_code}
                        </Link>
                        <p className="mt-1 text-sm text-gray-600">{item.audit_title}</p>
                      </td>
                      <td className="px-6 py-4 align-top text-gray-700">{item.audit_type}</td>
                      <td className="px-6 py-4 align-top">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(
                            item.status
                          )}`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 align-top text-gray-700">
                        {item.planned_start_date || '-'}{' '}
                        <span className="text-gray-400">to</span>{' '}
                        {item.planned_end_date || '-'}
                      </td>
                      <td className="px-6 py-4 align-top text-gray-700">
                        {item.lead_auditor_name || '-'}
                      </td>
                      <td className="px-6 py-4 align-top text-gray-700">
                        <div>Checklist: {item.checklist_items_count ?? 0}</div>
                        <div>Findings: {item.findings_count ?? 0}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 text-sm text-gray-600">
            <span>
              Page {page} {totalPages > 0 ? `of ${totalPages}` : ''}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={totalPages === 0 || page >= totalPages}
                onClick={() => setPage((prev) => prev + 1)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {createOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    New Internal Audit
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Create the audit plan header first. Members and checklist can be added from detail page.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="px-6 py-5">
                {createError ? (
                  <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {createError}
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Audit Code
                    </label>
                    <input
                      value={createForm.audit_code}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, audit_code: e.target.value }))
                      }
                      required
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Audit Type
                    </label>
                    <select
                      value={createForm.audit_type}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, audit_type: e.target.value }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                    >
                      <option value="INTERNAL">INTERNAL</option>
                      <option value="THEMATIC">THEMATIC</option>
                      <option value="PROCESS">PROCESS</option>
                      <option value="LOCATION">LOCATION</option>
                      <option value="FOLLOW_UP">FOLLOW_UP</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Audit Title
                    </label>
                    <input
                      value={createForm.audit_title}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, audit_title: e.target.value }))
                      }
                      required
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Planned Start Date
                    </label>
                    <input
                      type="date"
                      value={createForm.planned_start_date}
                      onChange={(e) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          planned_start_date: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Planned End Date
                    </label>
                    <input
                      type="date"
                      value={createForm.planned_end_date}
                      onChange={(e) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          planned_end_date: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                    />
                  </div>

                  <div className="md:col-span-2 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-end">
                      <div className="flex-1">
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          Search Lead Auditor
                        </label>
                        <input
                          value={identitySearch}
                          onChange={(e) => setIdentitySearch(e.target.value)}
                          placeholder="Search identity by name or email"
                          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void loadIdentities()}
                        className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        {loadingIdentities ? 'Loading...' : 'Search'}
                      </button>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Lead Auditor
                      </label>
                      <select
                        value={createForm.lead_auditor_identity_id}
                        onChange={(e) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            lead_auditor_identity_id: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
                      >
                        <option value="">No lead auditor yet</option>
                        {identities.map((identity) => (
                          <option key={String(identity.id)} value={String(identity.id)}>
                            {getIdentityLabel(identity)}
                            {identity.email ? ` (${identity.email})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Objective
                    </label>
                    <textarea
                      value={createForm.objective}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, objective: e.target.value }))
                      }
                      rows={3}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Scope Summary
                    </label>
                    <textarea
                      value={createForm.scope_summary}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, scope_summary: e.target.value }))
                      }
                      rows={3}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Auditee Summary
                    </label>
                    <textarea
                      value={createForm.auditee_summary}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, auditee_summary: e.target.value }))
                      }
                      rows={2}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Notes
                    </label>
                    <textarea
                      value={createForm.notes}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, notes: e.target.value }))
                      }
                      rows={2}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingCreate}
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                  >
                    {savingCreate ? 'Saving...' : 'Create Internal Audit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
