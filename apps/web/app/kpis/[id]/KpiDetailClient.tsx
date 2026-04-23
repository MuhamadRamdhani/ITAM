'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

function ValueCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-500">
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
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
          className="text-slate-900"
        />
      </svg>
      <div className="mt-2 text-xs text-slate-500">
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
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
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
          <Link href="/kpi-scorecard" className="itam-secondary-action">
            Open KPI Scorecard
          </Link>

          {!isCurrentYear ? (
            <button
              type="button"
              onClick={onBackToCurrentYear}
              className="itam-primary-action"
            >
              Back to {currentYear}
            </button>
          ) : null}
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
  const searchParams = useSearchParams();

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
    new Date().getFullYear(),
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [measurementForm, setMeasurementForm] = useState<MeasurementFormState>({
    ...getDefaultPeriodParts('MONTHLY'),
    actual_value: '',
    measurement_note: '',
  });

  const canManage = useMemo(() => canManageKpis(roles), [roles]);
  const yearOptions = useMemo(() => getYearOptions(), []);

  const backHref = useMemo(() => {
    const raw = searchParams.get('returnTo');
    if (raw && raw.startsWith('/')) return raw;
    return '/kpis';
  }, [searchParams]);

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
      getCurrentPeriodKey(detail.period_type),
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

    setMeasurements(measurementResult.items ?? []);
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

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [id, router]);

  useEffect(() => {
   if (!kpi) return;
const currentKpi: KpiDefinition = kpi;

let cancelled = false;

async function refreshTrendByYear() {
  try {
    setTrendLoading(true);
    setErrorMessage('');
    await loadTrendAndHistory(currentKpi, selectedTrendYear);
  } catch (error) {
    if (!cancelled) {
      setErrorMessage(getErrorMessage(error));
      setMeasurements([]);
    }
  } finally {
    if (!cancelled) {
      setTrendLoading(false);
    }
  }
}

    void refreshTrendByYear();

    return () => {
      cancelled = true;
    };
  }, [kpi, selectedTrendYear]);

  function openMeasurementModal() {
    if (!kpi) return;

    setFormError('');

    const currentParts = parsePeriodKeyToParts(
      kpi.period_type,
      getCurrentPeriodKey(kpi.period_type),
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

  async function handleCreateMeasurement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kpi) return;

    setSubmitting(true);
    setFormError('');
    setErrorMessage('');

    try {
      const period_key = (() => {
        const parts = {
          year: measurementForm.year,
          month: measurementForm.month,
          quarter: measurementForm.quarter,
        };
        return getCurrentPeriodKey(kpi.period_type)
          ? buildPeriodKeyFromParts(kpi.period_type, parts)
          : buildPeriodKeyFromParts(kpi.period_type, parts);
      })();

      await createKpiMeasurement(id, {
        period_key,
        actual_value: Number(measurementForm.actual_value),
        measurement_note: measurementForm.measurement_note.trim() || null,
      });

      setIsModalOpen(false);
      await loadTrendAndHistory(kpi, selectedTrendYear);
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  const currentYear = new Date().getFullYear();
  const trendValues = useMemo(
    () =>
      (trend?.items ?? [])
        .map((item: any) => Number(item.actual_value))
        .filter((value: number) => Number.isFinite(value)),
    [trend],
  );

  const latestMeasurement = measurements[0] ?? null;
  const hasTrendData = (trend?.items?.length ?? 0) > 0;
  const hasHistory = measurements.length > 0;

  if (loading) {
    return (
      <main className="itam-page-shell">
        <div className="itam-page-shell-inner">
          <div className="rounded-3xl border border-white bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="text-sm text-slate-600">Loading KPI detail...</div>
          </div>
        </div>
      </main>
    );
  }

  if (!kpi) {
    return (
      <main className="itam-page-shell">
        <div className="itam-page-shell-inner">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
            {errorMessage || 'KPI detail not found.'}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="itam-page-shell">
      <div className="itam-page-shell-inner">
        <section className="rounded-[2rem] border border-white/80 bg-white/75 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                KPI Detail
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
                Review KPI definition, capture measurement, dan lihat histori trend KPI.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Link href={backHref} className="itam-secondary-action">
                Back
              </Link>
              <Link href="/kpi-scorecard" className="itam-secondary-action">
                Open Scorecard
              </Link>
              {canManage ? (
                <button
                  type="button"
                  onClick={openMeasurementModal}
                  className="itam-primary-action"
                >
                  Capture Measurement
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {errorMessage ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_320px]">
          <div className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <PanelCard title={kpi.name} description={kpi.description || '-'}>
              <div className="mb-4 font-mono text-xs text-slate-500">{kpi.code}</div>

              <div className="mb-6 flex flex-wrap gap-2">
                <span className={getSourceBadgeClass(kpi.source_type)}>
                  {kpi.source_type}
                </span>
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                  {kpi.period_type}
                </span>
                <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  {kpi.is_active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <ValueCard
                  label="Target"
                  value={formatKpiValue(kpi.target_value, kpi.unit_code)}
                />
                <ValueCard
                  label="Warning"
                  value={formatKpiValue(kpi.warning_value, kpi.unit_code)}
                />
                <ValueCard
                  label="Critical"
                  value={formatKpiValue(kpi.critical_value, kpi.unit_code)}
                />
                <ValueCard
                  label="Baseline"
                  value={formatKpiValue(kpi.baseline_value, kpi.unit_code)}
                />
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Category
                  </div>
                  <div className="mt-2 text-sm font-medium text-slate-900">
                    {kpi.category_code}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Unit
                  </div>
                  <div className="mt-2 text-sm font-medium text-slate-900">
                    {kpi.unit_code}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Direction
                  </div>
                  <div className="mt-2 text-sm font-medium text-slate-900">
                    {kpi.direction}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Metric Key
                  </div>
                  <div className="mt-2 text-sm font-medium text-slate-900">
                    {kpi.metric_key || '-'}
                  </div>
                </div>
              </div>
            </PanelCard>
          </div>

          <div className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <PanelCard title="Latest Snapshot">
              {latestMeasurement ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Period
                    </div>
                    <div className="mt-2 text-sm font-medium text-slate-900">
                      {latestMeasurement.period_key}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Actual
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">
                      {formatKpiValue(latestMeasurement.actual_value, kpi.unit_code)}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Captured At
                    </div>
                    <div className="mt-2 text-sm font-medium text-slate-900">
                      {formatDateTime(latestMeasurement.created_at)}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Note
                    </div>
                    <div className="mt-2 text-sm text-slate-700">
                      (latestMeasurement as any).measurement_note || '-'
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                  No measurement yet.
                </div>
              )}
            </PanelCard>
          </div>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_320px]">
          <div className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <PanelCard
              title="Trend"
              description="Baseline trend dari measurement snapshot yang sudah tersimpan."
              action={
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Trend Year
                  </label>
                  <select
                    value={String(selectedTrendYear)}
                    onChange={(e) => setSelectedTrendYear(Number(e.target.value))}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={String(year)}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              }
            >
              {trendLoading ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                  Loading trend...
                </div>
              ) : hasTrendData ? (
                <Sparkline values={trendValues} />
              ) : (
                <EmptyHistoryState
                  selectedYear={selectedTrendYear}
                  onBackToCurrentYear={() => setSelectedTrendYear(currentYear)}
                />
              )}
            </PanelCard>
          </div>

          <div className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <PanelCard
              title="Measurement History"
              description={`Snapshot untuk tahun ${selectedTrendYear}.`}
            >
              {hasHistory ? (
                <div className="space-y-3">
                  {measurements.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {item.period_key}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {formatDateTime(item.created_at)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 text-lg font-semibold text-slate-900">
                        {formatKpiValue(item.actual_value, kpi.unit_code)}
                      </div>

                      <div className="mt-2 text-sm text-slate-600">
                        {(item as any).measurement_note || '-'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                  No measurement history for {selectedTrendYear}.
                </div>
              )}
            </PanelCard>
          </div>
        </section>

        {isModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
            <div className="w-full max-w-2xl rounded-[2rem] border border-white/80 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Capture Measurement
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Tambahkan measurement snapshot untuk KPI ini.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeMeasurementModal}
                  className="itam-secondary-action-sm"
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleCreateMeasurement} className="px-6 py-5">
                {formError ? (
                  <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {formError}
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Year
                    </label>
                    <input
                      value={measurementForm.year}
                      onChange={(e) =>
                        setMeasurementForm((current) => ({
                          ...current,
                          year: e.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    />
                  </div>

                  {kpi.period_type === 'MONTHLY' ? (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Month
                      </label>
                      <input
                        value={measurementForm.month}
                        onChange={(e) =>
                          setMeasurementForm((current) => ({
                            ...current,
                            month: e.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                      />
                    </div>
                  ) : kpi.period_type === 'QUARTERLY' ? (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Quarter
                      </label>
                      <select
                        value={measurementForm.quarter}
                        onChange={(e) =>
                          setMeasurementForm((current) => ({
                            ...current,
                            quarter: e.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                      >
                        <option value="Q1">Q1</option>
                        <option value="Q2">Q2</option>
                        <option value="Q3">Q3</option>
                        <option value="Q4">Q4</option>
                      </select>
                    </div>
                  ) : (
                    <div />
                  )}

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Actual Value
                    </label>
                    <input
                      value={measurementForm.actual_value}
                      onChange={(e) =>
                        setMeasurementForm((current) => ({
                          ...current,
                          actual_value: e.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Measurement Note
                    </label>
                    <textarea
                      rows={4}
                      value={measurementForm.measurement_note}
                      onChange={(e) =>
                        setMeasurementForm((current) => ({
                          ...current,
                          measurement_note: e.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    />
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeMeasurementModal}
                    className="itam-secondary-action"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="itam-primary-action disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? 'Saving...' : 'Save Measurement'}
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