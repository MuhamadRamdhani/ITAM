import Image from "next/image";
import Link from "next/link";
import LogoutButton from "./components/LogoutButton";
import UserIdentityBadge from "./components/UserIdentityBadge";
import DashboardSummaryCards from "./components/DashboardSummaryCards";
import TenantSubscriptionBanner from "./components/TenantSubscriptionBanner";
import AdminUsersLauncher from "./components/AdminUsersLauncher";
import SuperadminTenantsLauncher from "./components/SuperadminTenantsLauncher";
import AdminDepartmentsLauncher from "./components/AdminDepartmentsLauncher";
import AdminLocationsLauncher from "./components/AdminLocationsLauncher";
import AdminIdentitiesLauncher from "./components/AdminIdentitiesLauncher";
import AdminAssetTypesLauncher from "./components/AdminAssetTypesLauncher";
import AdminLifecycleStatesLauncher from "./components/AdminLifecycleStatesLauncher";
import AssetTransfersLauncher from "./components/AssetTransfersLauncher";
import KpiModuleLauncher from "./components/KpiModuleLauncher";
import KpiCardsLauncher from "./components/KpiCardsLauncher";
import KpiQuickLinks from "./components/KpiQuickLinks";

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

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#edf4fb_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.10),_transparent_28%),radial-gradient(circle_at_80%_20%,_rgba(14,165,233,0.08),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.06),_transparent_22%)]" />
      <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-cyan-300/12 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-sky-300/8 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-10 lg:py-8">
        <div className="rounded-[2rem] border border-white/80 bg-white/72 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-6 lg:p-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-4">
                <div className="inline-flex items-center gap-3 rounded-[1.15rem] border border-slate-200 bg-white/90 px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                  <Image
                    src="/viriya-logo.png"
                    alt="Viriya logo"
                    width={42}
                    height={42}
                    className="h-10 w-10 rounded-lg object-contain"
                    priority
                  />
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-700">
                      Viriya
                    </span>
                    <span className="text-sm text-slate-500">IT Asset Management</span>
                  </div>
                </div>

                <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700 shadow-[0_8px_20px_rgba(6,182,212,0.12)]">
                  Enterprise Dashboard
                </div>
              </div>

              <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl lg:text-5xl">
                ITAM SaaS
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-700 md:text-base">
                Dashboard summary + module launcher dengan bahasa visual light premium yang
                modern, bersih, dan nyaman dipakai untuk kerja harian.
              </p>
            </div>

            <div className="flex flex-col items-start gap-4 lg:min-w-[220px] lg:items-end">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                Live workspace
              </div>
              <UserIdentityBadge />
              <LogoutButton />
            </div>
          </div>

          <div className="mt-8">
            <TenantSubscriptionBanner />
          </div>

          <section className="mt-8">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-800">
                  Ringkasan Operasional
                </div>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                  Kondisi sistem saat ini
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
                  Statistik utama untuk aset, approval, dokumentasi, evidence, dan governance.
                </p>
              </div>
            </div>

            <DashboardSummaryCards />
          </section>

          <section className="mt-10">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-800">
                  KPI Workspace
                </div>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                  Monitoring performa KPI tenant
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
                  Akses cepat ke KPI Library dan KPI Scorecard beserta ringkasan scorecard
                  bulanan periode berjalan.
                </p>
              </div>
            </div>

            <div className="mt-5">
              <KpiModuleLauncher />
            </div>
          </section>

          <section className="mt-10">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-800">
                  Modul Utama
                </div>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                  Akses cepat ke area kerja
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
                  Semua modul disusun sebagai kartu kerja premium agar mudah dipindai dan tetap
                  terasa rapi.
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card
                title="Assets"
                desc="Registry + detail + ownership + lifecycle"
                href="/assets"
              />
              <Card
                title="Approvals"
                desc="Queue approvals + decision + audit events"
                href="/approvals?status=PENDING"
              />
              <Card
                title="Documents"
                desc="MVP1.4 versioning + workflow"
                href="/documents"
              />
              <Card
                title="Evidence"
                desc="MVP1.5 upload files + attach evidence"
                href="/evidence"
              />
              <Card
                title="Audit Events"
                desc="MVP1.7 audit trail viewer + export JSON"
                href="/audit-events"
              />
              <Card
                title="Governance Scope"
                desc="MVP1.6 scope versions + submit/approve/activate"
                href="/governance/scope"
              />
              <Card
                title="Governance Context"
                desc="MVP1.6 context register"
                href="/governance/context"
              />
              <Card
                title="Governance Stakeholders"
                desc="MVP1.6 stakeholder register"
                href="/governance/stakeholders"
              />
              <Card
                title="Vendors"
                desc="MVP2.0 vendor registry"
                href="/vendors"
              />
              <Card title="Contracts" desc="MVP2.0 contract registry" href="/contracts" />
              <Card
                title="Asset Report"
                desc="Coverage dan mapping digabung dalam satu report dan satu export"
                href="/reports/asset-mapping"
              />
              <Card
                title="Software Products"
                desc="MVP2.0 software product registry"
                href="/software-products"
              />

              <Card
                title="Internal Audits"
                desc="MVP2.0 internal audit register + schedule"
                href="/internal-audits"
              />

              <KpiCardsLauncher />

              <AssetTransfersLauncher />
              <AdminUsersLauncher />
              <SuperadminTenantsLauncher />
              <AdminDepartmentsLauncher />
              <AdminLocationsLauncher />
              <AdminIdentitiesLauncher />
              <AdminAssetTypesLauncher />
              <AdminLifecycleStatesLauncher />
            </div>
          </section>

          <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.10)] md:p-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-800">
              Quick links
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 hover:text-slate-900"
                href="/assets/new"
              >
                + New Asset
              </Link>
              <Link
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 hover:text-slate-900"
                href="/documents/new"
              >
                + New Document
              </Link>
              <Link
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 hover:text-slate-900"
                href="/evidence/upload"
              >
                + Upload Evidence
              </Link>
              <Link
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 hover:text-slate-900"
                href="/vendors"
              >
                Vendors
              </Link>
              <Link
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 hover:text-slate-900"
                href="/contracts"
              >
                Contracts
              </Link>
              <Link
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 hover:text-slate-900"
                href="/approvals?status=PENDING"
              >
                Pending Approvals
              </Link>
              <Link
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 hover:text-slate-900"
                href="/governance/scope"
              >
                Governance Scope
              </Link>
              <Link
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 hover:text-slate-900"
                href="/governance/context"
              >
                Governance Context
              </Link>
              <Link
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 hover:text-slate-900"
                href="/governance/stakeholders"
              >
                Governance Stakeholders
              </Link>
              <Link
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 hover:text-slate-900"
                href="/audit-events"
              >
                Audit Events
              </Link>

              <KpiQuickLinks />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}