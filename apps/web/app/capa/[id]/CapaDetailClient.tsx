'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CapaCase,
  CapaSeverity,
  CapaSourceType,
  CapaStatus,
  cancelCapa,
  closeCapa,
  getCapa,
  setCapaCorrectiveAction,
  setCapaPreventiveAction,
  setCapaRootCause,
  setCapaVerification,
  updateCapa,
} from '../../lib/capa';
import {
  IdentityOption,
  getIdentityLabel,
  listIdentityOptions,
} from '../../lib/internal-audits';

type Props = {
  capaId: number;
};

type IdentitySelectOption = {
  id: number;
  label: string;
};

type EditFormState = {
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

type StageFormState = {
  root_cause_summary: string;
  corrective_action_summary: string;
  preventive_action_summary: string;
  verification_summary: string;
  closure_notes: string;
  cancel_reason: string;
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

export default function CapaDetailClient({ capaId }: Props) {
  const [item, setItem] = useState<CapaCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [identityOptions, setIdentityOptions] = useState<IdentitySelectOption[]>([]);
  const [loadingIdentityOptions, setLoadingIdentityOptions] = useState(true);

  const [editForm, setEditForm] = useState<EditFormState>({
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

  const [stageForm, setStageForm] = useState<StageFormState>({
    root_cause_summary: '',
    corrective_action_summary: '',
    preventive_action_summary: '',
    verification_summary: '',
    closure_notes: '',
    cancel_reason: '',
  });

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
      setLoading(true);
      setErrorMessage(null);
      try {
        const res = await getCapa(capaId);
        setItem(res);
        setEditForm({
          capa_code: res.capa_code,
          title: res.title,
          source_type: res.source_type,
          source_id: res.source_id ? String(res.source_id) : '',
          source_label: res.source_label || '',
          severity: res.severity,
          owner_identity_id: res.owner_identity_id ? String(res.owner_identity_id) : '',
          due_date: res.due_date || '',
          nonconformity_summary: res.nonconformity_summary || '',
          notes: res.notes || '',
        });
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    },
    [capaId],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function setEditField<K extends keyof EditFormState>(key: K, value: EditFormState[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }

  function setStageField<K extends keyof StageFormState>(key: K, value: StageFormState[K]) {
    setStageForm((prev) => ({ ...prev, [key]: value }));
  }

  async function withSubmit<T>(action: () => Promise<T>, message: string): Promise<T | null> {
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await action();
      setSuccessMessage(message);
      await loadData();
      return result;
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveBasic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withSubmit(
      () =>
        updateCapa(capaId, {
          capa_code: editForm.capa_code,
          title: editForm.title,
          source_type: editForm.source_type,
          source_id: editForm.source_id ? Number(editForm.source_id) : null,
          source_label: editForm.source_label || null,
          severity: editForm.severity,
          owner_identity_id: editForm.owner_identity_id ? Number(editForm.owner_identity_id) : null,
          due_date: editForm.due_date || null,
          nonconformity_summary: editForm.nonconformity_summary || null,
          notes: editForm.notes || null,
        }),
      'CAPA basic data updated.',
    );
  }

  const canEdit = Boolean(item && item.status !== 'CLOSED' && item.status !== 'CANCELLED');

  if (loading) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.10),_transparent_28%),radial-gradient(circle_at_80%_20%,_rgba(14,165,233,0.08),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.06),_transparent_22%)]" />
        <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-cyan-300/12 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-sky-300/8 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-10 lg:py-8">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
            Loading CAPA detail...
          </div>
        </div>
      </main>
    );
  }

  if (!item) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.10),_transparent_28%),radial-gradient(circle_at_80%_20%,_rgba(14,165,233,0.08),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.06),_transparent_22%)]" />
        <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-cyan-300/12 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-sky-300/8 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-10 lg:py-8">
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
            {errorMessage || 'CAPA not found.'}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.10),_transparent_28%),radial-gradient(circle_at_80%_20%,_rgba(14,165,233,0.08),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.06),_transparent_22%)]" />
      <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-cyan-300/12 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-sky-300/8 blur-3xl" />
      <div className="relative mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-10 lg:py-8">
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">
              CAPA DETAIL
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                  item.status,
                )}`}
              >
                {item.status}
              </span>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${severityClass(
                  item.severity,
                )}`}
              >
                {item.severity}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
              {item.title}
            </h1>
            <p className="mt-2 font-mono text-sm text-slate-500">{item.capa_code}</p>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
              {item.source_label || item.source_type}
              {item.is_overdue ? ' • Overdue' : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 md:self-end">
            <Link href="/capa" className="itam-secondary-action">
              Back to CAPA
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
              Owner
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900">
              {item.owner_identity_name || item.owner_identity_email || '-'}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Due Date
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900">
              {formatDate(item.due_date)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Opened
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900">
              {formatDateTime(item.opened_at)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Updated
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900">
              {formatDateTime(item.updated_at)}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,1fr)]">
        <div className="space-y-6">
          <form
            onSubmit={handleSaveBasic}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Basic details</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Edit metadata sebelum CAPA ditutup.
                </p>
              </div>
              <button
                type="submit"
                disabled={!canEdit || submitting}
                className="rounded-xl border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Saving...' : 'Save'}
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <input
                value={editForm.capa_code}
                onChange={(e) => setEditField('capa_code', e.target.value)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-300"
                disabled={!canEdit}
              />
              <input
                value={editForm.title}
                onChange={(e) => setEditField('title', e.target.value)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-300"
                disabled={!canEdit}
              />
              <select
                value={editForm.source_type}
                onChange={(e) => setEditField('source_type', e.target.value as CapaSourceType)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-300"
                disabled={!canEdit}
              >
                <option value="OTHER">OTHER</option>
                <option value="INTERNAL_AUDIT_FINDING">INTERNAL_AUDIT_FINDING</option>
                <option value="MANAGEMENT_REVIEW_ACTION_ITEM">
                  MANAGEMENT_REVIEW_ACTION_ITEM
                </option>
              </select>
              <input
                value={editForm.source_id}
                onChange={(e) => setEditField('source_id', e.target.value)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-300"
                disabled={!canEdit}
                placeholder="Source ID"
              />
              <input
                value={editForm.source_label}
                onChange={(e) => setEditField('source_label', e.target.value)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-300 md:col-span-2"
                disabled={!canEdit}
                placeholder="Source label"
              />
              <select
                value={editForm.severity}
                onChange={(e) => setEditField('severity', e.target.value as CapaSeverity)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-300"
                disabled={!canEdit}
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
              <select
                value={editForm.owner_identity_id}
                onChange={(e) => setEditField('owner_identity_id', e.target.value)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-300"
                disabled={!canEdit || loadingIdentityOptions}
              >
                <option value="">
                  {loadingIdentityOptions ? 'Loading owners...' : 'Owner identity'}
                </option>
                {identityOptions.map((identity) => (
                  <option key={identity.id} value={identity.id}>
                    {identity.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={editForm.due_date}
                onChange={(e) => setEditField('due_date', e.target.value)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-300"
                disabled={!canEdit}
              />
              <textarea
                value={editForm.nonconformity_summary}
                onChange={(e) => setEditField('nonconformity_summary', e.target.value)}
                className="min-h-[110px] rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-300 md:col-span-2"
                disabled={!canEdit}
                placeholder="Nonconformity summary"
              />
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditField('notes', e.target.value)}
                className="min-h-[100px] rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-300 md:col-span-2"
                disabled={!canEdit}
                placeholder="Notes"
              />
            </div>
          </form>

          <div className="grid gap-4 md:grid-cols-2">
            <StageCard
              title="Root Cause"
              description="Record the root cause analysis before corrective action."
              value={item.root_cause_summary}
              timestamp={item.root_caused_at}
              editable={canEdit}
              buttonLabel="Save Root Cause"
              buttonDisabled={submitting}
              textareaValue={stageForm.root_cause_summary}
              onTextareaChange={(value) => setStageField('root_cause_summary', value)}
              onSubmit={async () => {
                if (!stageForm.root_cause_summary.trim()) {
                  throw new Error('root_cause_summary is required');
                }
                if (!window.confirm('Save root cause for this CAPA case?')) return;
                const result = await withSubmit(
                  () =>
                    setCapaRootCause(capaId, {
                      root_cause_summary: stageForm.root_cause_summary,
                    }),
                  'Root cause recorded.',
                );
                if (result) setStageField('root_cause_summary', '');
              }}
            />

            <StageCard
              title="Corrective Action"
              description="Capture the corrective action that fixes the current problem."
              value={item.corrective_action_summary}
              timestamp={item.corrective_action_at}
              editable={canEdit}
              buttonLabel="Save Corrective"
              buttonDisabled={submitting}
              textareaValue={stageForm.corrective_action_summary}
              onTextareaChange={(value) => setStageField('corrective_action_summary', value)}
              onSubmit={async () => {
                if (!stageForm.corrective_action_summary.trim()) {
                  throw new Error('corrective_action_summary is required');
                }
                if (!window.confirm('Save corrective action for this CAPA case?')) return;
                const result = await withSubmit(
                  () =>
                    setCapaCorrectiveAction(capaId, {
                      corrective_action_summary: stageForm.corrective_action_summary,
                    }),
                  'Corrective action recorded.',
                );
                if (result) setStageField('corrective_action_summary', '');
              }}
            />

            <StageCard
              title="Preventive Action"
              description="Define preventive action to stop the issue from recurring."
              value={item.preventive_action_summary}
              timestamp={item.preventive_action_at}
              editable={canEdit}
              buttonLabel="Save Preventive"
              buttonDisabled={submitting}
              textareaValue={stageForm.preventive_action_summary}
              onTextareaChange={(value) => setStageField('preventive_action_summary', value)}
              onSubmit={async () => {
                if (!stageForm.preventive_action_summary.trim()) {
                  throw new Error('preventive_action_summary is required');
                }
                if (!window.confirm('Save preventive action for this CAPA case?')) return;
                const result = await withSubmit(
                  () =>
                    setCapaPreventiveAction(capaId, {
                      preventive_action_summary: stageForm.preventive_action_summary,
                    }),
                  'Preventive action recorded.',
                );
                if (result) setStageField('preventive_action_summary', '');
              }}
            />

            <StageCard
              title="Verification"
              description="Record verification evidence before closure."
              value={item.verification_summary}
              timestamp={item.verified_at}
              editable={canEdit}
              buttonLabel="Save Verification"
              buttonDisabled={submitting}
              textareaValue={stageForm.verification_summary}
              onTextareaChange={(value) => setStageField('verification_summary', value)}
              onSubmit={async () => {
                if (!stageForm.verification_summary.trim()) {
                  throw new Error('verification_summary is required');
                }
                if (!window.confirm('Save verification for this CAPA case?')) return;
                const result = await withSubmit(
                  () =>
                    setCapaVerification(capaId, {
                      verification_summary: stageForm.verification_summary,
                    }),
                  'Verification recorded.',
                );
                if (result) setStageField('verification_summary', '');
              }}
            />
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
            <h2 className="text-xl font-semibold text-slate-900">Closure</h2>
            <p className="mt-1 text-sm text-slate-600">
              CAPA hanya bisa ditutup setelah verification summary tersedia.
            </p>

            <textarea
              value={stageForm.closure_notes}
              onChange={(e) => setStageField('closure_notes', e.target.value)}
              className="mt-4 min-h-[120px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-300"
              disabled={!canEdit}
              placeholder="Closure notes"
            />

            <button
              type="button"
              disabled={submitting || !canEdit}
              onClick={async () => {
                if (!window.confirm('Close this CAPA case?')) return;
                const result = await withSubmit(
                  () =>
                    closeCapa(capaId, {
                      closure_notes: stageForm.closure_notes || null,
                    }),
                  'CAPA case closed.',
                );
                if (result) setStageField('closure_notes', '');
              }}
              className="mt-4 w-full rounded-xl border border-emerald-600 bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Close CAPA
            </button>

            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <div className="text-sm font-semibold text-rose-700">Cancel CAPA</div>
              <textarea
                value={stageForm.cancel_reason}
                onChange={(e) => setStageField('cancel_reason', e.target.value)}
                className="mt-3 min-h-[100px] w-full rounded-2xl border border-rose-200 px-4 py-3 text-sm outline-none focus:border-rose-300"
                disabled={!canEdit}
                placeholder="Cancel reason"
              />
              <button
                type="button"
                disabled={submitting || !canEdit}
                onClick={async () => {
                  if (!window.confirm('Cancel this CAPA case?')) return;
                  const result = await withSubmit(
                    () =>
                      cancelCapa(capaId, {
                        cancel_reason: stageForm.cancel_reason || null,
                      }),
                    'CAPA case cancelled.',
                  );
                  if (result) setStageField('cancel_reason', '');
                }}
                className="mt-3 w-full rounded-xl border border-rose-600 bg-white px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel CAPA
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
            <h2 className="text-xl font-semibold text-slate-900">Workflow notes</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div>
                <span className="font-semibold text-slate-900">Source:</span>{' '}
                {item.source_label || item.source_type} {item.source_id ? `#${item.source_id}` : ''}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Created:</span>{' '}
                {formatDateTime(item.created_at)}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Root cause:</span>{' '}
                {formatDateTime(item.root_caused_at)}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Corrective:</span>{' '}
                {formatDateTime(item.corrective_action_at)}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Preventive:</span>{' '}
                {formatDateTime(item.preventive_action_at)}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Verification:</span>{' '}
                {formatDateTime(item.verified_at)}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Closed:</span>{' '}
                {formatDateTime(item.closed_at)}
              </div>
            </div>
          </div>
        </aside>
          </section>
        </div>
      </div>
    </main>
  );
}

function StageCard(props: {
  title: string;
  description: string;
  value: string | null;
  timestamp: string | null;
  editable: boolean;
  buttonLabel: string;
  buttonDisabled: boolean;
  textareaValue: string;
  onTextareaChange: (value: string) => void;
  onSubmit: () => Promise<void>;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{props.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{props.description}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        {props.value || 'No data recorded yet.'}
      </div>

      <div className="mt-3 text-xs text-slate-500">
        Last update: <span className="font-medium text-slate-700">{formatDateTime(props.timestamp)}</span>
      </div>

      <textarea
        value={props.textareaValue}
        onChange={(e) => props.onTextareaChange(e.target.value)}
        className="mt-4 min-h-[110px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-300"
        disabled={!props.editable}
        placeholder={`${props.title} notes`}
      />

      <button
        type="button"
        disabled={!props.editable || props.buttonDisabled}
        onClick={() => {
          void props.onSubmit();
        }}
        className="mt-4 w-full rounded-xl border border-slate-950 bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {props.buttonLabel}
      </button>
    </div>
  );
}
