import Link from "next/link";
import LogoutButton from "./components/LogoutButton";
import UserIdentityBadge from "./components/UserIdentityBadge";
import DashboardSummaryCards from "./components/DashboardSummaryCards";
import TenantSubscriptionBanner from "./components/TenantSubscriptionBanner";
import KpiModuleLauncher from "./components/KpiModuleLauncher";
import AppShell from "./components/AppShell";

function QuickAction({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 hover:text-slate-900"
    >
      {label}
    </Link>
  );
}

function FocusCard({
  title,
  description,
  href,
  actionLabel,
}: {
  title: string;
  description: string;
  href: string;
  actionLabel: string;
}) {
  return (
    <div className="itam-page-card p-5 md:p-6">
      <div className="text-lg font-semibold tracking-tight text-slate-900">
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-700">{description}</p>
      <div className="mt-5">
        <Link href={href} className="itam-primary-action-sm">
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <AppShell>
      <div className="space-y-8">
        <section className="rounded-[32px] border border-white/80 bg-white/72 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl md:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-700 shadow-[0_8px_20px_rgba(6,182,212,0.10)]">
                  Enterprise Dashboard
                </div>

                <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                  Live workspace
                </div>
              </div>

              <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                ITAM SaaS Dashboard
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700 md:text-base">
                Dashboard ini difokuskan untuk ringkasan operasional, alert, KPI,
                dan pekerjaan prioritas. Seluruh navigasi modul utama sekarang
                dipusatkan di sidebar kiri agar lebih rapi dan tidak membingungkan
                pengguna.
              </p>
            </div>

            <div className="flex flex-col items-start gap-4 xl:min-w-[240px] xl:items-end">
              <UserIdentityBadge />
              <LogoutButton />
            </div>
          </div>
        </section>

        <section>
          <TenantSubscriptionBanner />
        </section>

        <section>
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-800">
              Ringkasan Operasional
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              Kondisi sistem saat ini
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
              Statistik utama untuk aset, approval, dokumentasi, evidence, dan
              governance tenant saat ini.
            </p>
          </div>

          <DashboardSummaryCards />
        </section>

        <section>
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-800">
              KPI Workspace
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              Monitoring performa KPI tenant
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
              Gunakan area ini untuk melihat status KPI dan masuk ke modul KPI
              Library atau KPI Scorecard.
            </p>
          </div>

          <div className="mt-5">
            <KpiModuleLauncher />
          </div>
        </section>

        <section>
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-800">
              Fokus Kerja
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              Pekerjaan prioritas hari ini
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
              Bukan daftar semua modul. Area ini hanya menampilkan fokus kerja
              yang paling sering dibutuhkan user.
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <FocusCard
              title="Pending Approvals"
              description="Masuk ke daftar approval yang masih menunggu keputusan agar workflow tidak tertahan."
              href="/approvals?status=PENDING"
              actionLabel="Open Approvals"
            />
            <FocusCard
              title="Governance Review"
              description="Lanjutkan pekerjaan governance yang paling sering dipantau seperti scope, context, dan stakeholders."
              href="/governance/scope"
              actionLabel="Open Governance"
            />
            <FocusCard
              title="Asset Operations"
              description="Kelola aktivitas operasional aset seperti registry, transfer, vendor, dan contract dari sidebar."
              href="/assets"
              actionLabel="Open Assets"
            />
          </div>
        </section>

        <section>
          <div className="itam-page-card p-5 md:p-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-800">
              Quick Actions
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              Aksi cepat
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
              Cukup beberapa aksi yang paling sering dipakai. Navigasi penuh
              modul tetap ada di sidebar kiri.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <QuickAction href="/assets/new" label="+ New Asset" />
              <QuickAction href="/documents/new" label="+ New Document" />
              <QuickAction href="/evidence/upload" label="+ Upload Evidence" />
              <QuickAction href="/asset-transfer-requests" label="Asset Transfers" />
              <QuickAction href="/approvals?status=PENDING" label="Pending Approvals" />
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}