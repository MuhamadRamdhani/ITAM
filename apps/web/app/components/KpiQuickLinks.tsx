'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  canViewKpiModule,
  extractRoleCodes,
  getAuthMe,
  getErrorMessage,
} from '@/app/lib/kpi';

function QuickLink(props: { href: string; children: React.ReactNode }) {
  return (
    <Link
      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 hover:text-slate-900"
      href={props.href}
    >
      {props.children}
    </Link>
  );
}

export default function KpiQuickLinks() {
  const [loading, setLoading] = useState(true);
  const [canView, setCanView] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        setLoading(true);
        setErrorMessage('');

        const me = await getAuthMe();
        if (cancelled) return;

        const roleCodes = extractRoleCodes(me);
        setCanView(canViewKpiModule(roleCodes));
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
  }, []);

  if (loading) return null;
  if (!canView) return null;

  return (
    <>
      {errorMessage ? (
        <div className="w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <QuickLink href="/kpis">KPI Library</QuickLink>
      <QuickLink href="/kpi-scorecard">KPI Scorecard</QuickLink>
    </>
  );
}