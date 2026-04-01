'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  KpiPeriodType,
  KpiScorecardItem,
  KpiScorecardSummary,
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
  getStatusBadgeClass,
  getSourceBadgeClass,
} from '@/app/lib/kpi';

type CaptureFormState = {
  actual_value: string;
  measurement_note: string;
};

const DEFAULT_CAPTURE_FORM: CaptureFormState = {
  actual_value: '',
  measurement_note: '',
};

export default function KpiScorecardClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [periodType, setPeriodType] = useState<KpiPeriodType>('MONTHLY');
  const [periodKey, setPeriodKey] = useState(getCurrentPeriodKey('MONTHLY'));
  const [scorecard, setScorecard] = useState<KpiScorecardSummary | null>(null);

  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [captureTarget, setCaptureTarget] = useState<KpiScorecardItem | null>(null);
  const [captureForm, setCaptureForm] = useState<CaptureFormState>(DEFAULT_CAPTURE_FORM);
  const [captureError, setCaptureError] = useState('');

  const canManage = useMemo(() => canManageKpis(roles), [roles]);

  const summaryCards = useMemo(() => {
    if (!scorecard) return null;

    return [
      {
        label: 'Total KPI',
        value: scorecard.summary.total_kpis,
        className: 'border-gray-200 bg-white text-gray-900',
      },
      {
        label: 'On Track',
        value: scorecard.summary.on_track_count,
        className: 'border-green-200 bg-green-50 text-green-700',
      },
      {
        label: 'Warning',
        value: scorecard.summary.warning_count,
        className: 'border-yellow-200 bg-yellow-50 text-yellow-700',
      },
      {
        label: 'Critical',
        value: scorecard.summary.critical_count,
        className: 'border-red-200 bg-red-50 text-red-700',
      },
      {
        label: 'No Target',
        value: scorecard.summary.no_target_count,
        className: 'border-gray-200 bg-gray-50 text-gray-700',
      },
      {
        label: 'Missing',
        value: scorecard.summary.missing_count,
        className: 'border-slate-200 bg-slate-50 text-slate-700',
      },
    ];
  }, [scorecard]);

  async function loadScorecard(nextPeriodType = periodType, nextPeriodKey = periodKey) {
    const result = await getKpiScorecardSummary(nextPeriodType, nextPeriodKey);
    setScorecard(result);
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

        const result = await getKpiScorecardSummary(periodType, periodKey);

        if (cancelled) return;
        setScorecard(result);
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
  }, [periodKey, periodType, router]);

  function openCaptureModal(item: KpiScorecardItem) {
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

  async function handleCaptureSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!captureTarget) return;

    try {
      setSubmitting(true);
      setCaptureError('');

      if (captureTarget.source_type === 'MANUAL' && captureForm.actual_value.trim() === '') {
        setCaptureError('actual_value is required for MANUAL KPI.');
        return;
      }

      await createKpiMeasurement(captureTarget.kpi_id, {
        period_key: periodKey,
        period_type: periodType,
        actual_value:
          captureTarget.source_type === 'MANUAL'
            ? Number(captureForm.actual_value)
            : undefined,
        measurement_note: captureForm.measurement_note || null,
      });

      await loadScorecard(periodType, periodKey);
      closeCaptureModal();
    } catch (error) {
      setCaptureError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  function renderActionCell(item: KpiScorecardItem) {
    const showQuickCapture = canManage && item.measurement_id == null;

    return (
      <div className="flex justify-end gap-2 whitespace-nowrap">
        <Link
          href={`/kpis/${item.kpi_id}`}
          className="inline-flex rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
        >
          View Detail
        </Link>

        {showQuickCapture && (
          <button
            type="button"
            onClick={() => openCaptureModal(item)}
            className="inline-flex rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-black"
          >
            {item.source_type === 'SYSTEM' ? 'Snapshot' : 'Capture'}
          </button>
        )}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600">MVP 3.0</p>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
              KPI Scorecard
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Ringkasan KPI per periode, target vs actual, dan status scorecard tenant.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/kpis"
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              Open KPI Library
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Period Type
              </label>
              <select
                value={periodType}
                onChange={(event) => {
                  const nextType = event.target.value as KpiPeriodType;
                  setPeriodType(nextType);
                  setPeriodKey(getCurrentPeriodKey(nextType));
                }}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-gray-900"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Period Key
              </label>
              <input
                value={periodKey}
                onChange={(event) => setPeriodKey(event.target.value)}
                placeholder={
                  periodType === 'MONTHLY'
                    ? '2026-04'
                    : periodType === 'QUARTERLY'
                    ? '2026-Q2'
                    : '2026'
                }
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-gray-900"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={async () => {
                  try {
                    setLoading(true);
                    await loadScorecard(periodType, periodKey);
                  } catch (error) {
                    setErrorMessage(getErrorMessage(error));
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white"
              >
                Refresh Scorecard
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          {scorecard && (
            <div className="mt-4 text-sm text-gray-600">
              Period window:{' '}
              <span className="font-medium text-gray-900">
                {scorecard.period_start_date}
              </span>{' '}
              to{' '}
              <span className="font-medium text-gray-900">
                {scorecard.period_end_date}
              </span>
            </div>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            {(summaryCards || []).map((card) => (
              <div
                key={card.label}
                className={`rounded-2xl border p-4 shadow-sm ${card.className}`}
              >
                <div className="text-xs uppercase tracking-wide opacity-80">
                  {card.label}
                </div>
                <div className="mt-2 text-3xl font-semibold">{card.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">KPI</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Actual</th>
                  <th className="px-4 py-3">Achievement</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Measured At</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-gray-500">
                      Loading scorecard...
                    </td>
                  </tr>
                ) : !scorecard || scorecard.items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-gray-500">
                      No KPI scorecard rows found for this period.
                    </td>
                  </tr>
                ) : (
                  scorecard.items.map((item) => (
                    <tr key={item.kpi_id} className="align-top">
                      <td className="px-4 py-4">
                        <div className="font-medium text-gray-900">{item.name}</div>
                        <div className="mt-1 font-mono text-xs text-gray-500">
                          {item.code}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {item.description || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-gray-700">{item.category_code}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getSourceBadgeClass(
                            item.source_type
                          )}`}
                        >
                          {item.source_type}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        {formatKpiValue(item.target_value, item.unit_code)}
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        {formatKpiValue(item.actual_value, item.unit_code)}
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        {formatKpiValue(item.achievement_pct, 'PERCENT')}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(
                            item.status_code
                          )}`}
                        >
                          {item.status_code}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        {formatDateTime(item.measured_at)}
                      </td>
                      <td className="px-4 py-4 text-right">{renderActionCell(item)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isCaptureModalOpen && captureTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {captureTarget.source_type === 'SYSTEM'
                  ? 'Create System Snapshot'
                  : 'Capture Manual Measurement'}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                KPI: <span className="font-medium text-gray-900">{captureTarget.name}</span>
                {' · '}
                Period: <span className="font-medium text-gray-900">{periodKey}</span>
              </p>
            </div>

            <form onSubmit={handleCaptureSubmit} className="space-y-5 px-6 py-6">
              {captureError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {captureError}
                </div>
              )}

              {captureTarget.source_type === 'MANUAL' && (
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Actual Value
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={captureForm.actual_value}
                    onChange={(event) =>
                      setCaptureForm((current) => ({
                        ...current,
                        actual_value: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
                    placeholder="89"
                    required
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Note
                </label>
                <textarea
                  value={captureForm.measurement_note}
                  onChange={(event) =>
                    setCaptureForm((current) => ({
                      ...current,
                      measurement_note: event.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
                  placeholder="Optional note"
                />
              </div>

              {captureTarget.source_type === 'SYSTEM' && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  Actual value will be calculated automatically from backend metric source.
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={closeCaptureModal}
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
                    : captureTarget.source_type === 'SYSTEM'
                    ? 'Create Snapshot'
                    : 'Capture Measurement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}