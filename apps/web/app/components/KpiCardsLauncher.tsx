'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  canViewKpiModule,
  extractRoleCodes,
  getAuthMe,
  getErrorMessage,
} from '@/app/lib/kpi';

function Card(props: { title: string; desc: string; href: string }) {
  return (
    <Link
      href={props.href}
      className="group flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_18px_60px_rgba(15,23,42,0.10)] transition duration-300 hover:-translate-y-1 hover:border-cyan-200 hover:shadow-[0_22px_70px_rgba(15,23,42,0.14)]"
    >
      <div className="text-lg font-semibold tracking-tight text-slate-900">
        {props.title}
      </div>
      <div className="mt-2 text-sm leading-6 text-slate-700">{props.desc}</div>
      <div className="mt-5 text-sm font-semibold text-cyan-700 transition group-hover:text-cyan-800">
        Open →
      </div>
    </Link>
  );
}

export default function KpiCardsLauncher() {
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
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <Card
        title="KPI Library"
        desc="MVP3.0 KPI definitions, target, threshold, dan source manual/system"
        href="/kpis"
      />
      <Card
        title="KPI Scorecard"
        desc="MVP3.0 target vs actual, status scorecard, dan capture snapshot"
        href="/kpi-scorecard"
      />
    </>
  );
}