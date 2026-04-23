'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  KpiCreatePayload,
  KpiDefinition,
  canManageKpis,
  canViewKpiModule,
  createKpi,
  extractRoleCodes,
  formatKpiValue,
  getAuthMe,
  getErrorMessage,
  getKpiMetadata,
  getKpis,
  getSourceBadgeClass,
  updateKpi,
} from '@/app/lib/kpi';

type FormMode = 'create' | 'edit';

type KpiCategoryOption = {
  code: string;
  label: string;
};

type KpiUnitOption = {
  code: string;
  label: string;
};

type KpiSystemMetricOption = {
  key: string;
  label: string;
  category_code: string;
  default_unit_code: string;
  default_direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
  supported_period_types: Array<'MONTHLY' | 'QUARTERLY' | 'YEARLY'>;
};

type KpiMetadataView = {
  categories: KpiCategoryOption[];
  units: KpiUnitOption[];
  system_metrics: KpiSystemMetricOption[];
};

type KpiFormState = {
  code: string;
  name: string;
  description: string;
  category_code: string;
  unit_code: string;
  source_type: 'MANUAL' | 'SYSTEM';
  metric_key: string;
  direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
  period_type: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  target_value: string;
  warning_value: string;
  critical_value: string;
  baseline_value: string;
  is_active: boolean;
  display_order: string;
};

const DEFAULT_FORM: KpiFormState = {
  code: '',
  name: '',
  description: '',
  category_code: 'ASSET_DATA_QUALITY',
  unit_code: 'PERCENT',
  source_type: 'MANUAL',
  metric_key: '',
  direction: 'HIGHER_IS_BETTER',
  period_type: 'MONTHLY',
  target_value: '',
  warning_value: '',
  critical_value: '',
  baseline_value: '',
  is_active: true,
  display_order: '100',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeMetadata(input: unknown): KpiMetadataView {
  const raw = isRecord(input) ? input : {};

  const rawCategories = Array.isArray(raw.categories) ? raw.categories : [];
  const rawUnits = Array.isArray(raw.units) ? raw.units : [];
  const rawSystemMetrics = Array.isArray(raw.system_metrics) ? raw.system_metrics : [];

  const categories: KpiCategoryOption[] = rawCategories
    .map((item) => {
      if (!isRecord(item)) return null;
      const code = asString(item.code);
      if (!code) return null;
      return {
        code,
        label: asString(item.label, code),
      };
    })
    .filter((item): item is KpiCategoryOption => item !== null);

  const units: KpiUnitOption[] = rawUnits
    .map((item) => {
      if (!isRecord(item)) return null;
      const code = asString(item.code);
      if (!code) return null;
      return {
        code,
        label: asString(item.label, code),
      };
    })
    .filter((item): item is KpiUnitOption => item !== null);

  const system_metrics: KpiSystemMetricOption[] = rawSystemMetrics
    .map((item) => {
      if (!isRecord(item)) return null;

      const key = asString(item.key);
      if (!key) return null;

      const supportedRaw = Array.isArray(item.supported_period_types)
        ? item.supported_period_types
        : [];

      const supported_period_types = supportedRaw.filter(
        (value): value is 'MONTHLY' | 'QUARTERLY' | 'YEARLY' =>
          value === 'MONTHLY' || value === 'QUARTERLY' || value === 'YEARLY',
      );

      return {
        key,
        label: asString(item.label, key),
        category_code: asString(item.category_code),
        default_unit_code: asString(item.default_unit_code),
        default_direction:
          item.default_direction === 'LOWER_IS_BETTER'
            ? 'LOWER_IS_BETTER'
            : 'HIGHER_IS_BETTER',
        supported_period_types:
          supported_period_types.length > 0 ? supported_period_types : ['MONTHLY'],
      };
    })
    .filter((item): item is KpiSystemMetricOption => item !== null);

  return {
    categories,
    units,
    system_metrics,
  };
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
      <div className="mb-5 flex items-start justify-between gap-4">
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

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
        active
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          : 'bg-slate-100 text-slate-700 ring-slate-200'
      }`}
    >
      {active ? 'ACTIVE' : 'INACTIVE'}
    </span>
  );
}

export default function KpisClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [roles, setRoles] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<KpiMetadataView | null>(null);

  const [items, setItems] = useState<KpiDefinition[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [q, setQ] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [periodType, setPeriodType] = useState('');
  const [isActive, setIsActive] = useState('');

  const [errorMessage, setErrorMessage] = useState('');
  const [formError, setFormError] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [editingItem, setEditingItem] = useState<KpiDefinition | null>(null);
  const [form, setForm] = useState<KpiFormState>(DEFAULT_FORM);

  const canManage = useMemo(() => canManageKpis(roles), [roles]);

  const categoryOptions = useMemo<KpiCategoryOption[]>(
    () => metadata?.categories ?? [],
    [metadata],
  );

  const unitOptions = useMemo<KpiUnitOption[]>(
    () => metadata?.units ?? [],
    [metadata],
  );

  const systemMetrics = useMemo<KpiSystemMetricOption[]>(
    () => metadata?.system_metrics ?? [],
    [metadata],
  );

  async function loadPage(
    nextPage = page,
    filters?: {
      q?: string;
      category_code?: string;
      source_type?: string;
      period_type?: string;
      is_active?: string;
    },
  ) {
    setErrorMessage('');

    const result = await getKpis({
  q: (filters?.q ?? q) || undefined,
  category_code: (filters?.category_code ?? categoryCode) || undefined,
  source_type: (filters?.source_type ?? sourceType) || undefined,
  period_type: (filters?.period_type ?? periodType) || undefined,
  is_active: (filters?.is_active ?? isActive) || undefined,
  page: nextPage,
  page_size: pageSize,
});

    setItems(result.items ?? []);
    setPage(result.page ?? 1);
    setTotalPages(result.total_pages ?? 1);
    setTotal(result.total ?? 0);
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        setLoading(true);

        const [me, metadataResult] = await Promise.all([
          getAuthMe(),
          getKpiMetadata(),
        ]);

        if (cancelled) return;

        const roleCodes = extractRoleCodes(me);
        setRoles(roleCodes);

        if (!canViewKpiModule(roleCodes)) {
          router.replace('/assets');
          return;
        }

        setMetadata(normalizeMetadata(metadataResult));

        const result = await getKpis({
          page: 1,
          page_size: pageSize,
        });

        if (cancelled) return;

        setItems(result.items ?? []);
        setPage(result.page ?? 1);
        setTotalPages(result.total_pages ?? 1);
        setTotal(result.total ?? 0);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(getErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [router, pageSize]);

  function openCreateModal() {
    setFormMode('create');
    setEditingItem(null);
    setForm(DEFAULT_FORM);
    setFormError('');
    setIsModalOpen(true);
  }

  function openEditModal(item: KpiDefinition) {
    setFormMode('edit');
    setEditingItem(item);
    setFormError('');
    setForm({
      code: item.code,
      name: item.name,
      description: item.description ?? '',
      category_code: item.category_code,
      unit_code: item.unit_code,
      source_type: item.source_type,
      metric_key: item.metric_key ?? '',
      direction: item.direction,
      period_type: item.period_type,
      target_value: item.target_value == null ? '' : String(item.target_value),
      warning_value: item.warning_value == null ? '' : String(item.warning_value),
      critical_value: item.critical_value == null ? '' : String(item.critical_value),
      baseline_value: item.baseline_value == null ? '' : String(item.baseline_value),
      is_active: item.is_active,
      display_order: String(item.display_order),
    });
    setIsModalOpen(true);
  }

  function closeModal() {
    if (submitting) return;
    setIsModalOpen(false);
    setEditingItem(null);
    setForm(DEFAULT_FORM);
    setFormError('');
  }

  function updateForm<K extends keyof KpiFormState>(key: K, value: KpiFormState[K]) {
    setForm((current) => {
      const next: KpiFormState = {
        ...current,
        [key]: value,
      };

      if (key === 'source_type') {
        if (value === 'MANUAL') {
          next.metric_key = '';
        } else if (systemMetrics.length > 0) {
          const metric: KpiSystemMetricOption = systemMetrics[0];
          next.metric_key = metric.key;
          next.category_code = metric.category_code;
          next.unit_code = metric.default_unit_code;
          next.direction = metric.default_direction;
        }
      }

      if (
        (key === 'metric_key' || key === 'source_type') &&
        next.source_type === 'SYSTEM' &&
        systemMetrics.length > 0
      ) {
        const metric: KpiSystemMetricOption =
          systemMetrics.find((item) => item.key === next.metric_key) ??
          systemMetrics[0];

        next.metric_key = metric.key;
        next.category_code = metric.category_code;
        next.unit_code = metric.default_unit_code;
        next.direction = metric.default_direction;

        if (!metric.supported_period_types.includes(next.period_type)) {
          next.period_type = metric.supported_period_types[0];
        }
      }

      return next;
    });
  }

  async function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setLoading(true);
      await loadPage(1);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleResetFilters() {
    try {
      setLoading(true);
      setQ('');
      setCategoryCode('');
      setSourceType('');
      setPeriodType('');
      setIsActive('');
      await loadPage(1, {
        q: '',
        category_code: '',
        source_type: '',
        period_type: '',
        is_active: '',
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError('');
    setErrorMessage('');

    try {
      const payload: KpiCreatePayload = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        category_code: form.category_code,
        unit_code: form.unit_code,
        source_type: form.source_type,
        metric_key:
          form.source_type === 'SYSTEM' ? form.metric_key.trim() || null : null,
        direction: form.direction,
        period_type: form.period_type,
        target_value: form.target_value === '' ? null : Number(form.target_value),
        warning_value: form.warning_value === '' ? null : Number(form.warning_value),
        critical_value: form.critical_value === '' ? null : Number(form.critical_value),
        baseline_value: form.baseline_value === '' ? null : Number(form.baseline_value),
        is_active: form.is_active,
        display_order: Number(form.display_order || 0),
      };

      if (!payload.code) throw new Error('Code is required.');
      if (!payload.name) throw new Error('Name is required.');

      if (formMode === 'create') {
        await createKpi(payload);
      } else if (editingItem) {
        await updateKpi(editingItem.id, payload);
      }

      closeModal();
      await loadPage(page);
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function goToPage(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages) return;

    try {
      setLoading(true);
      await loadPage(nextPage);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="itam-page-shell">
      <div className="itam-page-shell-inner">
        <section className="rounded-[2rem] border border-white/80 bg-white/75 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700">
                MVP 3.0
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                KPI Library
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
                Kelola KPI master, target, source manual/system, dan definisi scorecard
                untuk tenant ini.
              </p>
            </div>

            <div className="shrink-0">
              <Link href="/" className="itam-secondary-action">
                Back
              </Link>
            </div>
          </div>
        </section>

        {errorMessage ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="mt-8 rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <PanelCard
            title="KPI Library"
            description={`Total KPI: ${total}`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/kpi-scorecard" className="itam-secondary-action">
                  Open Scorecard
                </Link>
                {canManage ? (
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="itam-primary-action"
                  >
                    Create KPI
                  </button>
                ) : null}
              </div>
            }
          >
            <form
              onSubmit={handleFilterSubmit}
              className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_160px_160px_160px_120px_auto]"
            >
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Search
                </label>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search code or name"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Category
                </label>
                <select
                  value={categoryCode}
                  onChange={(e) => setCategoryCode(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="">All</option>
                  {categoryOptions.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label || item.code}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Source
                </label>
                <select
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="">All</option>
                  <option value="MANUAL">MANUAL</option>
                  <option value="SYSTEM">SYSTEM</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Period
                </label>
                <select
                  value={periodType}
                  onChange={(e) => setPeriodType(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="">All</option>
                  <option value="MONTHLY">MONTHLY</option>
                  <option value="QUARTERLY">QUARTERLY</option>
                  <option value="YEARLY">YEARLY</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Active
                </label>
                <select
                  value={isActive}
                  onChange={(e) => setIsActive(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="">All</option>
                  <option value="true">ACTIVE</option>
                  <option value="false">INACTIVE</option>
                </select>
              </div>

              <div className="flex items-end gap-2">
                <button type="submit" className="itam-primary-action">
                  Apply
                </button>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="itam-secondary-action"
                >
                  Reset
                </button>
              </div>
            </form>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Period</th>
                    <th className="px-4 py-3 font-medium">Target</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                        Loading KPI library...
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                        No KPI found.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id} className="align-top">
                        <td className="px-4 py-4">
                          <div className="font-mono text-xs text-slate-700">{item.code}</div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-900">{item.name}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {item.description || '-'}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <span className={getSourceBadgeClass(item.source_type)}>
                            {item.source_type}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-slate-700">{item.category_code}</td>
                        <td className="px-4 py-4 text-slate-700">{item.period_type}</td>
                        <td className="px-4 py-4 text-slate-700">
                          {formatKpiValue(item.target_value, item.unit_code)}
                        </td>

                        <td className="px-4 py-4">
                          <ActiveBadge active={item.is_active} />
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap text-right">
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/kpis/${item.id}`}
                              className="inline-flex min-w-[92px] items-center justify-center whitespace-nowrap rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium leading-none text-slate-700 transition hover:bg-slate-50"
                            >
                              Detail
                            </Link>

                            {canManage ? (
                              <button
                                type="button"
                                onClick={() => openEditModal(item)}
                                className="inline-flex min-w-[76px] items-center justify-center whitespace-nowrap rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium leading-none text-slate-700 transition hover:bg-slate-50"
                              >
                                Edit
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-slate-500">
                Page {page} of {Math.max(1, totalPages)}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => goToPage(page - 1)}
                  className="itam-secondary-action-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => goToPage(page + 1)}
                  className="itam-secondary-action-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </PanelCard>
        </section>

        {isModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
            <div className="w-full max-w-4xl rounded-[2rem] border border-white/80 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {formMode === 'create' ? 'Create KPI' : 'Edit KPI'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {formMode === 'create'
                      ? 'Define a new KPI master.'
                      : 'Update KPI definition and thresholds.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  className="itam-secondary-action-sm"
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleSave} className="px-6 py-5">
                {formError ? (
                  <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {formError}
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Code
                    </label>
                    <input
                      value={form.code}
                      onChange={(e) => updateForm('code', e.target.value)}
                      disabled={formMode === 'edit'}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Name
                    </label>
                    <input
                      value={form.name}
                      onChange={(e) => updateForm('name', e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Description
                    </label>
                    <textarea
                      rows={3}
                      value={form.description}
                      onChange={(e) => updateForm('description', e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Source Type
                    </label>
                    <select
                      value={form.source_type}
                      onChange={(e) =>
                        updateForm(
                          'source_type',
                          e.target.value as KpiFormState['source_type'],
                        )
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    >
                      <option value="MANUAL">MANUAL</option>
                      <option value="SYSTEM">SYSTEM</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Metric Key
                    </label>
                    <select
                      value={form.metric_key}
                      onChange={(e) => updateForm('metric_key', e.target.value)}
                      disabled={form.source_type !== 'SYSTEM'}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
                    >
                      <option value="">
                        {form.source_type === 'SYSTEM'
                          ? 'Select metric'
                          : 'Manual KPI'}
                      </option>
                      {systemMetrics.map((metric) => (
                        <option key={metric.key} value={metric.key}>
                          {metric.label || metric.key}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Category
                    </label>
                    <select
                      value={form.category_code}
                      onChange={(e) => updateForm('category_code', e.target.value)}
                      disabled={form.source_type === 'SYSTEM'}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
                    >
                      {categoryOptions.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.label || item.code}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Unit
                    </label>
                    <select
                      value={form.unit_code}
                      onChange={(e) => updateForm('unit_code', e.target.value)}
                      disabled={form.source_type === 'SYSTEM'}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
                    >
                      {unitOptions.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.label || item.code}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Direction
                    </label>
                    <select
                      value={form.direction}
                      onChange={(e) =>
                        updateForm(
                          'direction',
                          e.target.value as KpiFormState['direction'],
                        )
                      }
                      disabled={form.source_type === 'SYSTEM'}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
                    >
                      <option value="HIGHER_IS_BETTER">HIGHER_IS_BETTER</option>
                      <option value="LOWER_IS_BETTER">LOWER_IS_BETTER</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Period Type
                    </label>
                    <select
                      value={form.period_type}
                      onChange={(e) =>
                        updateForm(
                          'period_type',
                          e.target.value as KpiFormState['period_type'],
                        )
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    >
                      <option value="MONTHLY">MONTHLY</option>
                      <option value="QUARTERLY">QUARTERLY</option>
                      <option value="YEARLY">YEARLY</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Target
                    </label>
                    <input
                      value={form.target_value}
                      onChange={(e) => updateForm('target_value', e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Warning
                    </label>
                    <input
                      value={form.warning_value}
                      onChange={(e) => updateForm('warning_value', e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Critical
                    </label>
                    <input
                      value={form.critical_value}
                      onChange={(e) => updateForm('critical_value', e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Baseline
                    </label>
                    <input
                      value={form.baseline_value}
                      onChange={(e) => updateForm('baseline_value', e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Display Order
                    </label>
                    <input
                      value={form.display_order}
                      onChange={(e) => updateForm('display_order', e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-8">
                    <input
                      id="kpi-is-active"
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => updateForm('is_active', e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <label htmlFor="kpi-is-active" className="text-sm text-slate-700">
                      Active KPI
                    </label>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="itam-secondary-action"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="itam-primary-action disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting
                      ? 'Saving...'
                      : formMode === 'create'
                        ? 'Create KPI'
                        : 'Save Changes'}
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