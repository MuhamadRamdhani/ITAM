'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  KpiDefinition,
  KpiMeasurement,
  KpiTrendSeries,
  buildPeriodKeyFromParts,
  canManageKpis,
  canViewKpiModule,
  createKpiMeasurement,
  extractRoleCodes,
  formatDateTime,
  formatKpiValue,
  getAuthMe,
  getCurrentPeriodKey,
  getDefaultPeriodParts,
  getErrorMessage,
  getKpiDetail,
  getKpiMeasurements,
  getKpiTrend,
  getPeriodKeyRangeForYear,
  getSourceBadgeClass,
  getStatusBadgeClass,
  parsePeriodKeyToParts,
} from '@/app/lib/kpi';

type Props = {
  id: string;
};

type MeasurementFormState = {
  year: string;
  month: string;
  quarter: string;
  actual_value: string;
  measurement_note: string;
};

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) {
    return (
      <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-500">
        No trend data yet
      </div>
    );
  }

  const width = 720;
  const height = 160;
  const padding = 16;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((value, index) => {
      const x =
        padding +
        (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
      const y =
        height -
        padding -
        ((value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-40 w-full"
        preserveAspectRatio="none"
      >
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          points={points}
          className="text-gray-900"
        />
      </svg>
      <div className="mt-2 text-xs text-gray-500">
        Min: {min.toFixed(2)} · Max: {max.toFixed(2)}
      </div>
    </div>
  );
}

function EmptyHistoryState({
  selectedYear,
  onBackToCurrentYear,
}: {
  selectedYear: number;
  onBackToCurrentYear: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const isCurrentYear = selectedYear === currentYear;

  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
      <div className="mx-auto max-w-2xl">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
          No measurement data
        </div>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
          Belum ada snapshot untuk tahun {selectedYear}
        </h3>
        <p className="mt-3 text-sm leading-7 text-slate-700">
          Trend dan measurement history di halaman ini hanya menampilkan snapshot
          sesuai rentang tahun yang dipilih. Kalau belum pernah dilakukan capture
          measurement di tahun tersebut, maka hasilnya akan kosong.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/kpi-scorecard"
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Open KPI Scorecard
          </Link>

          {!isCurrentYear && (
            <button
              type="button"
              onClick={onBackToCurrentYear}
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-black"
            >
              Back to {currentYear}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function getYearOptions() {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 11 }, (_, index) => currentYear - 5 + index);
}

export default function KpiDetailClient({ id }: Props) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [trendLoading, setTrendLoading] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [kpi, setKpi] = useState<KpiDefinition | null>(null);
  const [measurements, setMeasurements] = useState<KpiMeasurement[]>([]);
  const [trend, setTrend] = useState<KpiTrendSeries | null>(null);
  const [selectedTrendYear, setSelectedTrendYear] = useState<number>(
    new Date().getFullYear()
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [measurementForm, setMeasurementForm] = useState<MeasurementFormState>({
    ...getDefaultPeriodParts('MONTHLY'),
    actual_value: '',
    measurement_note: '',
  });

  const canManage = useMemo(() => canManageKpis(roles), [roles]);
  const yearOptions = useMemo(() => getYearOptions(), []);

  async function loadBaseData() {
    const me = await getAuthMe();
    const roleCodes = extractRoleCodes(me);
    setRoles(roleCodes);

    if (!canViewKpiModule(roleCodes)) {
      router.replace('/assets');
      return null;
    }

    const detail = await getKpiDetail(id);

    setKpi(detail);

    const currentParts = parsePeriodKeyToParts(
      detail.period_type,
      getCurrentPeriodKey(detail.period_type)
    );

    setMeasurementForm({
      ...currentParts,
      actual_value: '',
      measurement_note: '',
    });

    return detail;
  }

  async function loadTrendAndHistory(detail: KpiDefinition, year: number) {
    const range = getPeriodKeyRangeForYear(year, detail.period_type);

    const [measurementResult, trendResult] = await Promise.all([
      getKpiMeasurements(id, {
        period_key_from: range.period_key_from,
        period_key_to: range.period_key_to,
        page: 1,
        page_size: 25,
      }),
      getKpiTrend(id, range),
    ]);

    setMeasurements(measurementResult.items);
    setTrend(trendResult);
  }

  async function loadAll(initialYear = selectedTrendYear) {
    const detail = await loadBaseData();
    if (!detail) return;

    await loadTrendAndHistory(detail, initialYear);
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        setLoading(true);
        await loadAll(selectedTrendYear);
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

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [id, router]);

  useEffect(() => {
    const currentKpi = kpi as KpiDefinition | null;
    if (!currentKpi) return;
    const detail = currentKpi as KpiDefinition;

    let cancelled = false;

    async function refreshTrendByYear() {
      try {
        setTrendLoading(true);
        setErrorMessage('');

        await loadTrendAndHistory(detail, selectedTrendYear);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(getErrorMessage(error));
          setMeasurements([]);
          setTrend({
            kpi: {
              id: detail.id,
              code: detail.code,
              name: detail.name,
              category_code: detail.category_code,
              unit_code: detail.unit_code,
              source_type: detail.source_type,
              metric_key: detail.metric_key,
              direction: detail.direction,
              period_type: detail.period_type,
              target_value: detail.target_value,
              warning_value: detail.warning_value,
              critical_value: detail.critical_value,
              baseline_value: detail.baseline_value,
            },
            items: [],
          });
        }
      } finally {
        if (!cancelled) {
          setTrendLoading(false);
        }
      }
    }

    refreshTrendByYear();

    return () => {
      cancelled = true;
    };
  }, [kpi, selectedTrendYear]);

  function openMeasurementModal() {
    if (!kpi) return;

    setFormError('');

    const currentParts = parsePeriodKeyToParts(
      kpi.period_type,
      getCurrentPeriodKey(kpi.period_type)
    );

    setMeasurementForm({
      ...currentParts,
      actual_value: '',
      measurement_note: '',
    });

    setIsModalOpen(true);
  }

  function closeMeasurementModal() {
    if (submitting) return;
    setIsModalOpen(false);
    setFormError('');
  }

  async function handleCreateMeasurement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!kpi) return;

    try {
      setSubmitting(true);
      setFormError('');

      const periodKey = buildPeriodKeyFromParts(kpi.period_type, {
        year: measurementForm.year,
        month: measurementForm.month,
        quarter: measurementForm.quarter,
      });

      await createKpiMeasurement(kpi.id, {
        period_key: periodKey,
        actual_value:
          kpi.source_type === 'MANUAL'
            ? Number(measurementForm.actual_value)
            : undefined,
        measurement_note: measurementForm.measurement_note || null,
      });

      closeMeasurementModal();
      setLoading(true);
      await loadAll(selectedTrendYear);
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
      setLoading(false);
    }
  }

  const latestMeasurement = measurements[0] ?? null;
  const sparklineValues = trend?.items.map((item) => item.actual_value) ?? [];
  const hasTrendData = (trend?.items.length ?? 0) > 0;
  const hasHistoryData = measurements.length > 0;

  function renderPeriodPicker() {
    if (!kpi) return null;

    if (kpi.period_type === 'MONTHLY') {
      return (
        <input
          type="month"
          value={`${measurementForm.year}-${measurementForm.month}`}
          onChange={(event) => {
            const [year, month] = event.target.value.split('-');
            if (!year || !month) return;

            setMeasurementForm((current) => ({
              ...current,
              year,
              month,
              quarter: String(Math.floor((Number(month) - 1) / 3) + 1),
            }));
          }}
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
        />
      );
    }

    if (kpi.period_type === 'QUARTERLY') {
      return (
        <div className="grid grid-cols-2 gap-3">
          <select
            value={measurementForm.year}
            onChange={(event) =>
              setMeasurementForm((current) => ({
                ...current,
                year: event.target.value,
              }))
            }
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
          >
            {yearOptions.map((year) => (
              <option key={year} value={String(year)}>
                {year}
              </option>
            ))}
          </select>

          <select
            value={measurementForm.quarter}
            onChange={(event) =>
              setMeasurementForm((current) => ({
                ...current,
                quarter: event.target.value,
              }))
            }
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
          >
            <option value="1">Quarter 1 (Jan–Mar)</option>
            <option value="2">Quarter 2 (Apr–Jun)</option>
            <option value="3">Quarter 3 (Jul–Sep)</option>
            <option value="4">Quarter 4 (Oct–Dec)</option>
          </select>
        </div>
      );
    }

    return (
      <select
        value={measurementForm.year}
        onChange={(event) =>
          setMeasurementForm((current) => ({
            ...current,
            year: event.target.value,
          }))
        }
        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
      >
        {yearOptions.map((year) => (
          <option key={year} value={String(year)}>
            {year}
          </option>
        ))}
      </select>
    );
  }

  const computedPeriodKey = kpi
    ? buildPeriodKeyFromParts(kpi.period_type, {
        year: measurementForm.year,
        month: measurementForm.month,
        quarter: measurementForm.quarter,
      })
    : '-';

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl space-y-8 px-6 py-10">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
                KPI Detail
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-gray-600">
                Review KPI definition, capture measurement, dan lihat histori trend KPI.
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <Link
                href="/kpis"
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                Back to KPI Library
              </Link>

              <Link
                href="/kpi-scorecard"
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                Open Scorecard
              </Link>

              {canManage && (
                <button
                  type="button"
                  onClick={openMeasurementModal}
                  className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-black"
                >
                  Capture Measurement
                </button>
              )}
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {loading || !kpi ? (
          <div className="rounded-3xl border border-gray-200 bg-white px-6 py-14 text-center text-sm text-gray-500 shadow-sm">
            Loading KPI detail...
          </div>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="font-mono text-xs text-gray-500">{kpi.code}</div>
                    <h2 className="mt-1 text-2xl font-semibold text-gray-900">
                      {kpi.name}
                    </h2>
                    <p className="mt-2 text-sm text-gray-600">
                      {kpi.description || 'No description.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getSourceBadgeClass(
                        kpi.source_type
                      )}`}
                    >
                      {kpi.source_type}
                    </span>
                    <span className="inline-flex rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      {kpi.period_type}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        kpi.is_active
                          ? 'border border-green-200 bg-green-50 text-green-700'
                          : 'border border-gray-200 bg-gray-100 text-gray-600'
                      }`}
                    >
                      {kpi.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500">Target</div>
                    <div className="mt-2 text-xl font-semibold text-gray-900">
                      {formatKpiValue(kpi.target_value, kpi.unit_code)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500">Warning</div>
                    <div className="mt-2 text-xl font-semibold text-gray-900">
                      {formatKpiValue(kpi.warning_value, kpi.unit_code)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500">Critical</div>
                    <div className="mt-2 text-xl font-semibold text-gray-900">
                      {formatKpiValue(kpi.critical_value, kpi.unit_code)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500">Baseline</div>
                    <div className="mt-2 text-xl font-semibold text-gray-900">
                      {formatKpiValue(kpi.baseline_value, kpi.unit_code)}
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Category</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">
                      {kpi.category_code}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Unit</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{kpi.unit_code}</div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Direction</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">
                      {kpi.direction}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Metric Key</div>
                    <div className="mt-1 break-all text-sm font-medium text-gray-900">
                      {kpi.metric_key || '-'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="text-sm font-semibold text-gray-900">Latest Snapshot</div>

                {!latestMeasurement ? (
                  <div className="mt-4 rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                    No measurement yet.
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500">
                        Period
                      </div>
                      <div className="mt-1 text-sm font-medium text-gray-900">
                        {latestMeasurement.period_key}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500">
                        Actual
                      </div>
                      <div className="mt-1 text-2xl font-semibold text-gray-900">
                        {formatKpiValue(latestMeasurement.actual_value, kpi.unit_code)}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500">
                        Achievement
                      </div>
                      <div className="mt-1 text-sm font-medium text-gray-900">
                        {formatKpiValue(latestMeasurement.achievement_pct, 'PERCENT')}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500">
                        Status
                      </div>
                      <div className="mt-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(
                            latestMeasurement.status_code
                          )}`}
                        >
                          {latestMeasurement.status_code}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500">
                        Measured At
                      </div>
                      <div className="mt-1 text-sm font-medium text-gray-900">
                        {formatDateTime(latestMeasurement.measured_at)}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500">
                        Note
                      </div>
                      <div className="mt-1 text-sm text-gray-700">
                        {latestMeasurement.measurement_note || '-'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Trend</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Baseline trend dari measurement snapshot yang sudah tersimpan.
                      </p>
                    </div>

                    <div className="flex items-end gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                          Trend Year
                        </label>
                        <select
                          value={selectedTrendYear}
                          onChange={(event) => setSelectedTrendYear(Number(event.target.value))}
                          className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-gray-900"
                        >
                          {yearOptions.map((year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          if (!kpi) return;

                          try {
                            setTrendLoading(true);
                            setErrorMessage('');
                            await loadTrendAndHistory(kpi, selectedTrendYear);
                          } catch (error) {
                            setErrorMessage(getErrorMessage(error));
                          } finally {
                            setTrendLoading(false);
                          }
                        }}
                        className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>

                  {trendLoading ? (
                    <div className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500">
                      Loading trend...
                    </div>
                  ) : !hasTrendData ? (
                    <EmptyHistoryState
                      selectedYear={selectedTrendYear}
                      onBackToCurrentYear={() => setSelectedTrendYear(new Date().getFullYear())}
                    />
                  ) : (
                    <>
                      <Sparkline values={sparklineValues} />

                      <div className="mt-4 overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead>
                            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                              <th className="px-4 py-3">Period</th>
                              <th className="px-4 py-3">Actual</th>
                              <th className="px-4 py-3">Target</th>
                              <th className="px-4 py-3">Achievement</th>
                              <th className="px-4 py-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {trend?.items.map((item) => (
                              <tr key={item.period_key}>
                                <td className="px-4 py-3 text-gray-700">{item.period_key}</td>
                                <td className="px-4 py-3 text-gray-700">
                                  {formatKpiValue(item.actual_value, kpi.unit_code)}
                                </td>
                                <td className="px-4 py-3 text-gray-700">
                                  {formatKpiValue(item.target_value, kpi.unit_code)}
                                </td>
                                <td className="px-4 py-3 text-gray-700">
                                  {formatKpiValue(item.achievement_pct, 'PERCENT')}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(
                                      item.status_code
                                    )}`}
                                  >
                                    {item.status_code}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div>
                <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Measurement History
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Snapshot untuk tahun {selectedTrendYear}.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {!hasHistoryData ? (
                      <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                        No measurement history for {selectedTrendYear}.
                      </div>
                    ) : (
                      measurements.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">
                                {item.period_key}
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                {formatDateTime(item.measured_at)}
                              </div>
                            </div>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(
                                item.status_code
                              )}`}
                            >
                              {item.status_code}
                            </span>
                          </div>

                          <div className="mt-3 text-sm text-gray-700">
                            Actual:{' '}
                            <span className="font-medium">
                              {formatKpiValue(item.actual_value, kpi.unit_code)}
                            </span>
                          </div>

                          <div className="mt-1 text-xs text-gray-500">
                            {item.measurement_note || '-'}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {isModalOpen && kpi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Capture Measurement
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Tambahkan snapshot measurement baru untuk KPI ini.
              </p>
            </div>

            <form onSubmit={handleCreateMeasurement} className="space-y-5 px-6 py-6">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Period Picker
                </label>
                {renderPeriodPicker()}
                <div className="mt-2 text-xs text-gray-500">
                  Computed period key:{' '}
                  <span className="font-medium text-gray-900">{computedPeriodKey}</span>
                </div>
              </div>

              {kpi.source_type === 'MANUAL' && (
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Actual Value
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={measurementForm.actual_value}
                    onChange={(event) =>
                      setMeasurementForm((current) => ({
                        ...current,
                        actual_value: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
                    required
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Note
                </label>
                <textarea
                  value={measurementForm.measurement_note}
                  onChange={(event) =>
                    setMeasurementForm((current) => ({
                      ...current,
                      measurement_note: event.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
                  placeholder="Optional note"
                />
              </div>

              {kpi.source_type === 'SYSTEM' && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  Actual value will be calculated automatically from backend system metric.
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={closeMeasurementModal}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Capture Measurement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

