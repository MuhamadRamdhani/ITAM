import Link from "next/link";
import AdminLocationsClient from "./AdminLocationsClient";

export default function AdminLocationsPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900">
      <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_60%)] pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-6 py-8 lg:px-10 lg:py-10">
        <div className="flex flex-col gap-4 rounded-3xl border border-white bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Enterprise Settings
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              Locations
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
              MVP0.3 - tenant location master data.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Back
          </Link>
        </div>

        <div className="mt-8">
          <AdminLocationsClient />
        </div>
      </div>
    </main>
  );
}
