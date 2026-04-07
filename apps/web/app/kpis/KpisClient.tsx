'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  KpiCreatePayload,
  KpiDefinition,
  KpiMetadata,
  canManageKpis,
  canViewKpiModule,
  createKpi,
  extractRoleCodes,
  formatKpiValue,
  getAuthMe,
  getCurrentPeriodKey,
  getErrorMessage,
  getKpiMetadata,
  getKpis,
  getSourceBadgeClass,
  updateKpi,
} from '@/app/lib/kpi';

type FormMode = 'create' | 'edit';

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

export default function KpisClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<KpiMetadata | null>(null);
  const [items, setItems] = useState<KpiDefinition[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(0);
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

  async function loadPage(nextPage = page) {
    setErrorMessage('');

    const result = await getKpis({
      q,
      category_code: categoryCode || undefined,
      source_type: sourceType || undefined,
      period_type: periodType || undefined,
      is_active: isActive || undefined,
      page: nextPage,
      page_size: pageSize,
    });

    setItems(result.items);
    setPage(result.page);
    setTotalPages(result.total_pages);
    setTotal(result.total);
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

        setMetadata(metadataResult);

        const result = await getKpis({
          page: 1,
          page_size: pageSize,
        });

        if (cancelled) return;

        setItems(result.items);
        setPage(result.page);
        setTotalPages(result.total_pages);
        setTotal(result.total);
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(getErrorMessage(error));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    bootstrap();

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
      const next = {
        ...current,
        [key]: value,
      };

      if (key === 'source_type') {
        if (value === 'MANUAL') {
          next.metric_key = '';
        } else if (metadata?.system_metrics?.length) {
          const metric = metadata.system_metrics[0];
          next.metric_key = metric.key;
          next.category_code = metric.category_code;
          next.unit_code = metric.default_unit_code;
          next.direction = metric.default_direction;
        }
      }

      if (
        (key === 'metric_key' || key === 'source_type') &&
        next.source_type === 'SYSTEM' &&
        metadata?.system_metrics?.length
      ) {
        const metric =
          metadata.system_metrics.find((item) => item.key === next.metric_key) ??
          metadata.system_metrics[0];

        if (metric) {
          next.metric_key = metric.key;
          next.category_code = metric.category_code;
          next.unit_code = metric.default_unit_code;
          next.direction = metric.default_direction;

          if (!metric.supported_period_types.includes(next.period_type)) {
            next.period_type = metric.supported_period_types[0];
          }
        }
      }

      return next;
    });
  }

  async function handleFilterSubmit(event: React.FormEvent<HTMLFormElement>) {
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

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSubmitting(true);
      setFormError('');

      const payload: KpiCreatePayload = {
        code: form.code,
        name: form.name,
        description: form.description || null,
        source_type: form.source_type,
        period_type: form.period_type,
        target_value: form.target_value === '' ? null : Number(form.target_value),
        warning_value: form.warning_value === '' ? null : Number(form.warning_value),
        critical_value: form.critical_value === '' ? null : Number(form.critical_value),
        baseline_value: form.baseline_value === '' ? null : Number(form.baseline_value),
        is_active: form.is_active,
        display_order: Number(form.display_order || '100'),
      };

      if (form.source_type === 'SYSTEM') {
        payload.metric_key = form.metric_key;
      } else {
        payload.category_code = form.category_code;
        payload.unit_code = form.unit_code;
        payload.direction = form.direction;
      }

      if (formMode === 'create') {
        await createKpi(payload);
      } else if (editingItem) {
        await updateKpi(editingItem.id, payload);
      }

      closeModal();
      setLoading(true);
      await loadPage(formMode === 'create' ? 1 : page);
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
      setLoading(false);
    }
  }

  const selectedMetric = useMemo(() => {
    if (!metadata || form.source_type !== 'SYSTEM') return null;
    return metadata.system_metrics.find((item) => item.key === form.metric_key) ?? null;
  }, [form.metric_key, form.source_type, metadata]);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-6 py-10 space-y-8">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600">MVP 3.0</p>
              <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
                KPI Library
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-gray-600">
                Kelola KPI master, target, source manual/system, dan definisi scorecard
                untuk tenant ini.
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <Link
                href="/"
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                Back
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap justify-end gap-3">
              <Link
                href="/kpi-scorecard"
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                Open Scorecard
              </Link>
              {canManage && (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-black"
                >
                  Create KPI
                </button>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <form
                onSubmit={handleFilterSubmit}
                className="grid gap-4 md:grid-cols-2 xl:grid-cols-6"
              >
                <div className="xl:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Search
                  </label>
                  <input
                    value={q}
                    onChange={(event) => setQ(event.target.value)}
                    placeholder="Search code or name"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-gray-900"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Category
                  </label>
                  <select
                    value={categoryCode}
                    onChange={(event) => setCategoryCode(event.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-gray-900"
                  >
                    <option value="">All</option>
                    {metadata?.category_options.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Source
                  </label>
                  <select
                    value={sourceType}
                    onChange={(event) => setSourceType(event.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-gray-900"
                  >
                    <option value="">All</option>
                    {metadata?.source_types.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Period
                  </label>
                  <select
                    value={periodType}
                    onChange={(event) => setPeriodType(event.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-gray-900"
                  >
                    <option value="">All</option>
                    {metadata?.period_types.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Active
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={isActive}
                      onChange={(event) => setIsActive(event.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-gray-900"
                    >
                      <option value="">All</option>
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                    <button
                      type="submit"
                      className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </form>

              {errorMessage && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              )}

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Period</th>
                      <th className="px-4 py-3">Target</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                          Loading KPI library...
                        </td>
                      </tr>
                    ) : items.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                          No KPI found.
                        </td>
                      </tr>
                    ) : (
                      items.map((item) => (
                        <tr key={item.id} className="align-top">
                          <td className="px-4 py-4 font-mono text-xs text-gray-700">
                            {item.code}
                          </td>
                          <td className="px-4 py-4">
                            <div className="font-medium text-gray-900">{item.name}</div>
                            <div className="mt-1 text-xs text-gray-500">
                              {item.description || '-'}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getSourceBadgeClass(
                                item.source_type
                              )}`}
                            >
                              {item.source_type}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-gray-700">{item.category_code}</td>
                          <td className="px-4 py-4 text-gray-700">{item.period_type}</td>
                          <td className="px-4 py-4 text-gray-700">
                            {formatKpiValue(item.target_value, item.unit_code)}
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                item.is_active
                                  ? 'border border-green-200 bg-green-50 text-green-700'
                                  : 'border border-gray-200 bg-gray-100 text-gray-600'
                              }`}
                            >
                              {item.is_active ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-2">
                              <Link
                                href={`/kpis/${item.id}`}
                                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                              >
                                Detail
                              </Link>
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => openEditModal(item)}
                                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex items-center justify-between text-sm text-gray-600">
                <div>
                  Total: <span className="font-medium text-gray-900">{total}</span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={loading || page <= 1}
                    onClick={async () => {
                      try {
                        setLoading(true);
                        await loadPage(page - 1);
                      } catch (error) {
                        setErrorMessage(getErrorMessage(error));
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="rounded-xl border border-gray-200 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <span>
                    Page {page} / {Math.max(totalPages, 1)}
                  </span>
                  <button
                    type="button"
                    disabled={loading || page >= totalPages}
                    onClick={async () => {
                      try {
                        setLoading(true);
                        await loadPage(page + 1);
                      } catch (error) {
                        setErrorMessage(getErrorMessage(error));
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="rounded-xl border border-gray-200 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && metadata && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {formMode === 'create' ? 'Create KPI' : 'Edit KPI'}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {formMode === 'create'
                  ? 'Tambahkan KPI baru untuk scorecard tenant.'
                  : 'Ubah KPI master tanpa mengubah histori measurement yang sudah tersimpan.'}
              </p>
            </div>

            <form onSubmit={handleSave} className="space-y-6 px-6 py-6">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Code
                  </label>
                  <input
                    value={form.code}
                    onChange={(event) => updateForm('code', event.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
                    placeholder="ASSET_DATA_COMPLETENESS"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Name
                  </label>
                  <input
                    value={form.name}
                    onChange={(event) => updateForm('name', event.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
                    placeholder="Asset Data Completeness"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(event) => updateForm('description', event.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
                    placeholder="Optional description"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Source Type
                  </label>
                  <select
                    value={form.source_type}
                    onChange={(event) =>
                      updateForm('source_type', event.target.value as 'MANUAL' | 'SYSTEM')
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
                  >
                    {metadata.source_types.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Period Type
                  </label>
                  <select
                    value={form.period_type}
                    onChange={(event) =>
                      updateForm(
                        'period_type',
                        event.target.value as 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
                      )
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
                  >
                    {(form.source_type === 'SYSTEM' && selectedMetric
                      ? metadata.period_types.filter((item) =>
                          selectedMetric.supported_period_types.includes(
                            item.code as 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
                          )
                        )
                      : metadata.period_types
                    ).map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                {form.source_type === 'SYSTEM' ? (
                  <>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                        System Metric
                      </label>
                      <select
                        value={form.metric_key}
                        onChange={(event) => updateForm('metric_key', event.target.value)}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
                      >
                        {metadata.system_metrics.map((metric) => (
                          <option key={metric.key} value={metric.key}>
                            {metric.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                      <div className="text-sm font-medium text-blue-900">
                        {selectedMetric?.name || '-'}
                      </div>
                      <p className="mt-1 text-sm text-blue-800">
                        {selectedMetric?.description || '-'}
                      </p>
                      <div className="mt-3 grid gap-3 text-xs text-blue-900 md:grid-cols-3">
                        <div>
                          <span className="font-semibold">Category:</span>{' '}
                          {selectedMetric?.category_code || '-'}
                        </div>
                        <div>
                          <span className="font-semibold">Unit:</span>{' '}
                          {selectedMetric?.default_unit_code || '-'}
                        </div>
                        <div>
                          <span className="font-semibold">Direction:</span>{' '}
                          {selectedMetric?.default_direction || '-'}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                        Category
                      </label>
                      <select
                        value={form.category_code}
                        onChange={(event) => updateForm('category_code', event.target.value)}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
                      >
                        {metadata.category_options.map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                        Unit
                      </label>
                      <select
                        value={form.unit_code}
                        onChange={(event) => updateForm('unit_code', event.target.value)}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
                      >
                        {metadata.unit_options.map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                        Direction
                      </label>
                      <select
                        value={form.direction}
                        onChange={(event) =>
                          updateForm(
                            'direction',
                            event.target.value as 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER'
                          )
                        }
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
                      >
                        {metadata.direction_types.map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Target
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={form.target_value}
                    onChange={(event) => updateForm('target_value', event.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Warning
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={form.warning_value}
                    onChange={(event) => updateForm('warning_value', event.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Critical
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={form.critical_value}
                    onChange={(event) => updateForm('critical_value', event.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Baseline
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={form.baseline_value}
                    onChange={(event) => updateForm('baseline_value', event.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={form.display_order}
                    onChange={(event) => updateForm('display_order', event.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
                  />
                </div>

                <div className="flex items-center gap-3 pt-6">
                  <input
                    id="kpi-is-active"
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(event) => updateForm('is_active', event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <label htmlFor="kpi-is-active" className="text-sm text-gray-700">
                    Active KPI
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
      )}
    </main>
  );
}
