'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  KpiPeriodParts,
  KpiPeriodType,
  buildPeriodKeyFromParts,
  canManageKpis,
  canViewKpiModule,
  createKpiMeasurement,
  extractRoleCodes,
  formatDateTime,
  formatKpiValue,
  getAuthMe,
  getCurrentPeriodKey,
  getErrorMessage,
  getKpiScorecardSummary,
  getSourceBadgeClass,
  getStatusBadgeClass,
  parsePeriodKeyToParts,
} from '@/app/lib/kpi';

type ScorecardRow = {
  kpi_id: number;
  code: string;
  name: string;
  description: string | null;
  source_type: string;
  category_code: string;
  period_type: string;
  target_value: number | null;
  actual_value: number | null;
  achievement_pct: number | null;
  status: string;
  measured_at: string | null;
  measurement_note: string | null;
  unit_code: string;
};

type ScorecardView = {
  summary: {
    total_kpis: number;
    on_track_count: number;
    warning_count: number;
    critical_count: number;
    no_target_count: number;
    missing_count: number;
  };
  items: ScorecardRow[];
};

type CaptureFormState = {
  actual_value: string;
  measurement_note: string;
};

const DEFAULT_CAPTURE_FORM: CaptureFormState = {
  actual_value: '',
  measurement_note: '',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asInt(value: unknown, fallback = 0): number {
  const parsed = asNumberOrNull(value);
  return parsed == null ? fallback : Math.trunc(parsed);
}

function normalizeScorecard(input: unknown): ScorecardView {
  const root = isRecord(input) ? input : {};
  const rawSummary = isRecord(root.summary) ? root.summary : {};
  const rawItems = Array.isArray(root.items)
    ? root.items
    : Array.isArray(root.rows)
      ? root.rows
      : [];

  const items: ScorecardRow[] = rawItems
    .map((rawItem) => {
      if (!isRecord(rawItem)) return null;

      return {
        kpi_id: asInt(rawItem.kpi_id ?? rawItem.id, 0),
        code: asString(rawItem.code ?? rawItem.kpi_code, '-'),
        name: asString(rawItem.name ?? rawItem.kpi_name, '-'),
        description: asNullableString(rawItem.description),
        source_type: asString(rawItem.source_type, '-'),
        category_code: asString(rawItem.category_code, '-'),
        period_type: asString(rawItem.period_type, '-'),
        target_value: asNumberOrNull(rawItem.target_value),
        actual_value: asNumberOrNull(rawItem.actual_value),
        achievement_pct: asNumberOrNull(
          rawItem.achievement_pct ?? rawItem.achievement_value,
        ),
        status: asString(rawItem.status, 'MISSING'),
        measured_at: asNullableString(rawItem.measured_at ?? rawItem.created_at),
        measurement_note: asNullableString(rawItem.measurement_note),
        unit_code: asString(rawItem.unit_code, 'NUMBER'),
      };
    })
    .filter((item): item is ScorecardRow => item !== null);

  return {
    summary: {
      total_kpis: asInt(rawSummary.total_kpis),
      on_track_count: asInt(rawSummary.on_track_count),
      warning_count: asInt(rawSummary.warning_count),
      critical_count: asInt(rawSummary.critical_count),
      no_target_count: asInt(rawSummary.no_target_count),
      missing_count: asInt(rawSummary.missing_count),
    },
    items,
  };
}

function getYearOptions() {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 11 }, (_, index) => String(currentYear - 5 + index));
}

function getPeriodWindow(periodType: KpiPeriodType, parts: KpiPeriodParts) {
  const year = Number(parts.year || new Date().getFullYear());

  if (periodType === 'MONTHLY') {
    const month = Math.max(1, Math.min(12, Number(parts.month || 1)));
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  }

  if (periodType === 'QUARTERLY') {
    const quarter = parts.quarter || 'Q1';
    const quarterIndex =
      quarter === 'Q2' ? 1 : quarter === 'Q3' ? 2 : quarter === 'Q4' ? 3 : 0;
    const startMonth = quarterIndex * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 0);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  }

  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function SummaryCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'green' | 'amber' | 'rose' | 'slate';
}) {
  const className =
    tone === 'green'
      ? 'border-emerald-200 text-emerald-800'
      : tone === 'amber'
        ? 'border-amber-200 text-amber-800'
        : tone === 'rose'
          ? 'border-rose-200 text-rose-800'
          : tone === 'slate'
            ? 'border-slate-200 text-slate-800'
            : 'border-slate-200 text-slate-900';

  return (
    <div
      className={`rounded-[1.5rem] border bg-white/90 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] ${className}`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold">{value}</div>
    </div>
  );
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

function EmptyState({
  periodType,
  periodKey,
  onBackToMonthly,
}: {
  periodType: KpiPeriodType;
  periodKey: string;
  onBackToMonthly: () => void;
}) {
  const isMonthly = periodType === 'MONTHLY';

  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
      <div className="mx-auto max-w-2xl">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
          No scorecard rows
        </div>

        <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
          Belum ada KPI yang cocok untuk periode ini
        </h3>

        <p className="mt-3 text-sm leading-7 text-slate-700">
          Scorecard hanya menampilkan KPI yang period type-nya sama dengan pilihan saat
          ini. Untuk periode{' '}
          <span className="font-semibold text-slate-900">{periodType}</span> dengan key{' '}
          <span className="font-semibold text-slate-900">{periodKey}</span>, belum ada
          baris yang bisa ditampilkan.
        </p>

        {!isMonthly ? (
          <p className="mt-3 text-sm leading-7 text-slate-700">
            Ini normal kalau KPI yang sudah Anda buat saat ini masih dominan
            <span className="font-semibold text-slate-900"> MONTHLY</span>. KPI monthly
            memang tidak akan muncul saat selector ada di Quarterly atau Yearly.
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/kpis" className="itam-secondary-action">
            Open KPI Library
          </Link>

          {!isMonthly ? (
            <button
              type="button"
              onClick={onBackToMonthly}
              className="itam-primary-action"
            >
              Back to Monthly
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function KpiScorecardClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [periodType, setPeriodType] = useState<KpiPeriodType>('MONTHLY');
  const [periodParts, setPeriodParts] = useState<KpiPeriodParts>(() =>
    parsePeriodKeyToParts('MONTHLY', getCurrentPeriodKey('MONTHLY')),
  );
  const [scorecard, setScorecard] = useState<ScorecardView | null>(null);

  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [captureTarget, setCaptureTarget] = useState<ScorecardRow | null>(null);
  const [captureForm, setCaptureForm] = useState<CaptureFormState>(DEFAULT_CAPTURE_FORM);
  const [captureError, setCaptureError] = useState('');

  const canManage = useMemo(() => canManageKpis(roles), [roles]);
  const periodKey = useMemo(
    () => buildPeriodKeyFromParts(periodType, periodParts),
    [periodType, periodParts],
  );
  const yearOptions = useMemo(() => getYearOptions(), []);
  const periodWindow = useMemo(
    () => getPeriodWindow(periodType, periodParts),
    [periodType, periodParts],
  );
  const returnTo = useMemo(
    () =>
      `/kpi-scorecard?periodType=${encodeURIComponent(periodType)}&periodKey=${encodeURIComponent(periodKey)}`,
    [periodKey, periodType],
  );

  const summaryCards = useMemo(() => {
    if (!scorecard) return null;

    return [
      {
        label: 'Total KPI',
        value: scorecard.summary.total_kpis,
        tone: 'default' as const,
      },
      {
        label: 'On Track',
        value: scorecard.summary.on_track_count,
        tone: 'green' as const,
      },
      {
        label: 'Warning',
        value: scorecard.summary.warning_count,
        tone: 'amber' as const,
      },
      {
        label: 'Critical',
        value: scorecard.summary.critical_count,
        tone: 'rose' as const,
      },
      {
        label: 'No Target',
        value: scorecard.summary.no_target_count,
        tone: 'slate' as const,
      },
      {
        label: 'Missing',
        value: scorecard.summary.missing_count,
        tone: 'slate' as const,
      },
    ];
  }, [scorecard]);

  async function loadScorecard(nextPeriodType = periodType, nextPeriodKey = periodKey) {
    const result = await getKpiScorecardSummary(nextPeriodType, nextPeriodKey);
    setScorecard(normalizeScorecard(result));
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        setLoading(true);

        const me = await getAuthMe();
        if (cancelled) return;

        const roleCodes = extractRoleCodes(me);
        setRoles(roleCodes);

        if (!canViewKpiModule(roleCodes)) {
          router.replace('/assets');
          return;
        }

        setAuthReady(true);
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
  }, [router]);

  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;

    async function refreshScorecard() {
      try {
        setLoading(true);
        setErrorMessage('');

        const result = await getKpiScorecardSummary(periodType, periodKey);
        if (cancelled) return;

        setScorecard(normalizeScorecard(result));
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(getErrorMessage(error));
          setScorecard(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void refreshScorecard();

    return () => {
      cancelled = true;
    };
  }, [authReady, periodKey, periodType]);

  function handlePeriodTypeChange(nextType: KpiPeriodType) {
    setPeriodType(nextType);
    setPeriodParts(parsePeriodKeyToParts(nextType, getCurrentPeriodKey(nextType)));
  }

  function openCaptureModal(item: ScorecardRow) {
    setCaptureTarget(item);
    setCaptureForm(DEFAULT_CAPTURE_FORM);
    setCaptureError('');
    setIsCaptureModalOpen(true);
  }

  function closeCaptureModal() {
    if (submitting) return;
    setIsCaptureModalOpen(false);
    setCaptureTarget(null);
    setCaptureForm(DEFAULT_CAPTURE_FORM);
    setCaptureError('');
  }

  async function handleCaptureSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!captureTarget) return;

    try {
      setSubmitting(true);
      setCaptureError('');

      await createKpiMeasurement(String(captureTarget.kpi_id), {
        period_key: periodKey,
        actual_value: Number(captureForm.actual_value),
        measurement_note: captureForm.measurement_note.trim() || null,
      });

      closeCaptureModal();
      setLoading(true);
      await loadScorecard(periodType, periodKey);
    } catch (error) {
      setCaptureError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
      setLoading(false);
    }
  }

  function renderPeriodPicker() {
    if (periodType === 'MONTHLY') {
      const monthValue = `${periodParts.year}-${periodParts.month}`;

      return (
        <input
          type="month"
          value={monthValue}
          onChange={(event) => {
  const [year, month] = event.target.value.split('-');
  setPeriodParts((current) => ({
    ...current,
    year: year || current.year,
    month: month || current.month,
  }));
}}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
        />
      );
    }

    if (periodType === 'QUARTERLY') {
      return (
        <div className="grid grid-cols-2 gap-3">
          <select
            value={periodParts.quarter}
            onChange={(event) =>
              setPeriodParts((current) => ({
                ...current,
                quarter: event.target.value,
              }))
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
          >
            <option value="Q1">Q1</option>
            <option value="Q2">Q2</option>
            <option value="Q3">Q3</option>
            <option value="Q4">Q4</option>
          </select>

          <select
            value={periodParts.year}
            onChange={(event) =>
              setPeriodParts((current) => ({
                ...current,
                year: event.target.value,
              }))
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      );
    }

    return (
      <select
        value={periodParts.year}
        onChange={(event) =>
          setPeriodParts((current) => ({
            ...current,
            year: event.target.value,
          }))
        }
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
      >
        {yearOptions.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    );
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
                KPI Scorecard
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
                Ringkasan KPI per periode, target vs actual, dan status scorecard tenant.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Link href="/" className="itam-secondary-action">
                Back
              </Link>
              <Link href="/kpis" className="itam-secondary-action">
                Open KPI Library
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
            title="Scorecard"
            description={`Computed period key: ${periodKey}`}
            action={
              <button
                type="button"
                onClick={() => {
                  void loadScorecard(periodType, periodKey);
                }}
                className="itam-primary-action"
              >
                Refresh Scorecard
              </button>
            }
          >
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Period Type
                </label>
                <select
                  value={periodType}
                  onChange={(event) =>
                    handlePeriodTypeChange(event.target.value as KpiPeriodType)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Period Picker
                </label>
                {renderPeriodPicker()}
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <div>
                Computed period key: <span className="font-semibold">{periodKey}</span>
              </div>
              <div>
                Period window:{' '}
                <span className="font-semibold">
                  {periodWindow.start} to {periodWindow.end}
                </span>
              </div>
            </div>

            {summaryCards ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                {summaryCards.map((item) => (
                  <SummaryCard
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    tone={item.tone}
                  />
                ))}
              </div>
            ) : null}
          </PanelCard>
        </section>

        <section className="mt-8 rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <PanelCard
            title="Scorecard Items"
            description={`Total rows: ${scorecard?.items.length ?? 0}`}
          >
            {loading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
                Loading scorecard...
              </div>
            ) : !scorecard || scorecard.items.length === 0 ? (
              <EmptyState
                periodType={periodType}
                periodKey={periodKey}
                onBackToMonthly={() => handlePeriodTypeChange('MONTHLY')}
              />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[1200px] w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">KPI</th>
                      <th className="px-4 py-3 font-medium">Category</th>
                      <th className="px-4 py-3 font-medium">Source</th>
                      <th className="px-4 py-3 font-medium">Target</th>
                      <th className="px-4 py-3 font-medium">Actual</th>
                      <th className="px-4 py-3 font-medium">Achievement</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Measured At</th>
                      <th className="px-4 py-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {scorecard.items.map((item) => (
                      <tr key={`${item.kpi_id}-${item.code}`} className="align-top">
                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-900">{item.name}</div>
                          <div className="mt-1 font-mono text-xs text-slate-500">
                            {item.code}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {item.description || '-'}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-slate-700">{item.category_code}</td>

                        <td className="px-4 py-4">
                          <span className={getSourceBadgeClass(item.source_type)}>
                            {item.source_type}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-slate-700">
                          {formatKpiValue(item.target_value, item.unit_code)}
                        </td>

                        <td className="px-4 py-4 text-slate-700">
                          {item.actual_value == null
                            ? '-'
                            : formatKpiValue(item.actual_value, item.unit_code)}
                        </td>

                        <td className="px-4 py-4 text-slate-700">
                          {item.achievement_pct == null
                            ? '-'
                            : `${item.achievement_pct.toFixed(2)}%`}
                        </td>

                        <td className="px-4 py-4">
                          <span className={getStatusBadgeClass(item.status)}>
                            {item.status}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-slate-700">
                          {item.measured_at ? formatDateTime(item.measured_at) : '-'}
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap text-right">
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/kpis/${item.kpi_id}?returnTo=${encodeURIComponent(returnTo)}`}
                              className="inline-flex min-w-[92px] items-center justify-center whitespace-nowrap rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium leading-none text-slate-700 transition hover:bg-slate-50"
                            >
                              View Detail
                            </Link>

                            {canManage ? (
                             <button
  type="button"
  onClick={() => openCaptureModal(item)}
  className="inline-flex min-w-[88px] cursor-pointer items-center justify-center whitespace-nowrap rounded-full border border-cyan-300 bg-cyan-500 px-4 py-2 text-sm font-semibold leading-none text-white transition hover:bg-cyan-600"
>
  Capture
</button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PanelCard>
        </section>

        {isCaptureModalOpen && captureTarget ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
            <div className="w-full max-w-2xl rounded-[2rem] border border-white/80 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Capture KPI Measurement
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {captureTarget.name} · {periodKey}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeCaptureModal}
                  className="itam-secondary-action-sm"
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleCaptureSubmit} className="px-6 py-5">
                {captureError ? (
                  <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {captureError}
                  </div>
                ) : null}

                <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">
                    {captureTarget.name}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{captureTarget.code}</div>
                  <div className="mt-2 text-sm text-slate-700">
                    Target:{' '}
                    <span className="font-medium">
                      {formatKpiValue(captureTarget.target_value, captureTarget.unit_code)}
                    </span>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Actual Value
                    </label>
                    <input
                      value={captureForm.actual_value}
                      onChange={(event) =>
                        setCaptureForm((current) => ({
                          ...current,
                          actual_value: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Measurement Note
                    </label>
                    <textarea
                      rows={4}
                      value={captureForm.measurement_note}
                      onChange={(event) =>
                        setCaptureForm((current) => ({
                          ...current,
                          measurement_note: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    />
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeCaptureModal}
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