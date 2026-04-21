'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  canManageKpis,
  canViewKpiModule,
  extractRoleCodes,
  getAuthMe,
  getCurrentPeriodKey,
  getErrorMessage,
  getKpiScorecardSummary,
  getStatusBadgeClass,
} from '@/app/lib/kpi';

type LauncherState = {
  periodKey: string;
  totalKpis: number;
  onTrackCount: number;
  warningCount: number;
  criticalCount: number;
  missingCount: number;
  attentionItems: Array<{
    kpi_id: number;
    code: string;
    name: string;
    status_code: string;
    source_type: string;
    measurement_id: number | null;
  }>;
};

function SummaryCard(props: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${props.className}`}>
      <div className="text-xs uppercase tracking-wide opacity-80">{props.label}</div>
      <div className="mt-2 text-3xl font-semibold">{props.value}</div>
    </div>
  );
}

export default function KpiModuleLauncher() {
  const [loading, setLoading] = useState(true);
  const [canView, setCanView] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [state, setState] = useState<LauncherState | null>(null);

  const currentPeriodKey = useMemo(() => getCurrentPeriodKey('MONTHLY'), []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        setLoading(true);
        setErrorMessage('');

        const me = await getAuthMe();
        if (cancelled) return;

        const roleCodes = extractRoleCodes(me);
        const allowedView = canViewKpiModule(roleCodes);
        const allowedManage = canManageKpis(roleCodes);

        setCanView(allowedView);
        setCanManage(allowedManage);

        if (!allowedView) {
          setState(null);
          return;
        }

        const summary = await getKpiScorecardSummary('MONTHLY', currentPeriodKey);
        if (cancelled) return;

        const attentionItems = summary.items
          .filter((item) =>
            ['CRITICAL', 'WARNING', 'MISSING'].includes(item.status_code)
          )
          .sort((a, b) => {
            const priority = (status: string) => {
              if (status === 'CRITICAL') return 1;
              if (status === 'MISSING') return 2;
              if (status === 'WARNING') return 3;
              return 9;
            };

            return priority(a.status_code) - priority(b.status_code);
          })
          .slice(0, 6)
          .map((item) => ({
            kpi_id: item.kpi_id,
            code: item.code,
            name: item.name,
            status_code: item.status_code,
            source_type: item.source_type,
            measurement_id: item.measurement_id,
          }));

        setState({
          periodKey: summary.period_key,
          totalKpis: summary.summary.total_kpis,
          onTrackCount: summary.summary.on_track_count,
          warningCount: summary.summary.warning_count,
          criticalCount: summary.summary.critical_count,
          missingCount: summary.summary.missing_count,
          attentionItems,
        });
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
  }, [currentPeriodKey]);

  if (!canView && !loading) {
    return null;
  }

  const hasAttentionItems = (state?.attentionItems.length ?? 0) > 0;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-600">MVP 3.0</p>
          <h2 className="text-xl font-semibold text-gray-900">KPI Workspace</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Monitoring KPI tenant, akses scorecard periode berjalan, dan quick access ke
            KPI Library.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/kpi-scorecard" className="itam-secondary-action">
            Open KPI Scorecard
          </Link>

          <Link href="/kpis" className="itam-primary-action">
            Open KPI Library
          </Link>

          {canManage && (
            <Link href="/kpis" className="itam-secondary-action">
              Manage KPI
            </Link>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500">
          Loading KPI workspace...
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-gray-600">
              Current monthly scorecard period:{' '}
              <span className="font-medium text-gray-900">
                {state?.periodKey || currentPeriodKey}
              </span>
            </div>

            {hasAttentionItems ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                There are KPI items that need attention this month.
              </div>
            ) : (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
                Monthly KPI scorecard is in good condition.
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              label="Total KPI"
              value={state?.totalKpis ?? 0}
              className="border-gray-200 bg-gray-50 text-gray-900"
            />
            <SummaryCard
              label="On Track"
              value={state?.onTrackCount ?? 0}
              className="border-green-200 bg-green-50 text-green-700"
            />
            <SummaryCard
              label="Warning"
              value={state?.warningCount ?? 0}
              className="border-yellow-200 bg-yellow-50 text-yellow-700"
            />
            <SummaryCard
              label="Critical"
              value={state?.criticalCount ?? 0}
              className="border-red-200 bg-red-50 text-red-700"
            />
            <SummaryCard
              label="Missing"
              value={state?.missingCount ?? 0}
              className="border-slate-200 bg-slate-50 text-slate-700"
            />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-900">What you can do here</div>
              <ul className="mt-3 space-y-2 text-sm text-gray-700">
                <li>• Review current monthly KPI scorecard</li>
                <li>• Open KPI Library to maintain KPI definitions</li>
                <li>• Inspect CRITICAL or MISSING KPI from scorecard</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-900">Recommended flow</div>
              <ul className="mt-3 space-y-2 text-sm text-gray-700">
                <li>• Open KPI Scorecard first for operational monitoring</li>
                <li>• Use KPI Detail to capture measurement and inspect trend</li>
                <li>• Use KPI Library for create/edit KPI master and thresholds</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-900">Operational status</div>
              <div className="mt-3 text-sm text-gray-700">
                {hasAttentionItems ? (
                  <>
                    <div>
                      Current month has{' '}
                      <span className="font-semibold text-red-700">
                        {(state?.criticalCount ?? 0) + (state?.missingCount ?? 0)}
                      </span>{' '}
                      KPI item(s) in critical/missing state.
                    </div>
                    <div className="mt-2">
                      Recommended action: review scorecard and capture missing measurements.
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      No critical or missing KPI detected for current monthly scorecard.
                    </div>
                    <div className="mt-2">
                      Recommended action: continue routine monitoring from scorecard.
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900">Attention items</div>
                <p className="mt-1 text-sm text-gray-600">
                  KPI yang perlu dicek lebih dulu untuk periode {state?.periodKey || currentPeriodKey}.
                </p>
              </div>

             <Link
  href="/kpi-scorecard"
  className="inline-flex items-center justify-center rounded-full border border-cyan-200 bg-gradient-to-r from-cyan-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(14,165,233,0.20)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(14,165,233,0.24)]"
>
  Open full scorecard
</Link>
            </div>

            <div className="mt-4 space-y-3">
              {!hasAttentionItems ? (
                <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                  No KPI attention items for current monthly period.
                </div>
              ) : (
                state?.attentionItems.map((item) => (
                  <div
                    key={`${item.kpi_id}-${item.status_code}`}
                    className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-semibold text-gray-900">
                          {item.name}
                        </div>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(
                            item.status_code
                          )}`}
                        >
                          {item.status_code}
                        </span>
                        <span className="inline-flex rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700">
                          {item.source_type}
                        </span>
                      </div>

                      <div className="mt-1 font-mono text-xs text-gray-500">{item.code}</div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
  href={`/kpis/${item.kpi_id}`}
  className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 hover:text-slate-900"
>
  View Detail
</Link>

                      <Link
  href="/kpi-scorecard"
  className="inline-flex items-center justify-center rounded-full border border-cyan-200 bg-gradient-to-r from-cyan-500 to-sky-500 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(14,165,233,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_22px_rgba(14,165,233,0.22)]"
>
  Open Scorecard
</Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}