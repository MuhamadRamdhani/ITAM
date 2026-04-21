# Rekap Pengerjaan Testing dan Implementasi

Dokumen ini merangkum pekerjaan yang sudah dijalankan di repo ITAM selama sesi testing dan perbaikan terakhir.

Fokusnya:

- modul yang sudah ditest
- bug yang sempat ditemukan
- perbaikan kode yang sudah dilakukan
- status akhir tiap modul

## Ringkasan Singkat

Pekerjaan yang sudah diselesaikan mencakup:

- Auth & Dashboard
- Assets
- Approvals
- Documents
- Evidence
- Audit Events
- Governance
- Vendors
- Contracts
- Software Products
- Asset Transfer Requests
- KPI Library & Scorecard
- Internal Audits

Sebagian modul butuh perubahan aplikasi, sebagian lain cukup diperbaiki di Playwright agar scenario testing sesuai dengan UI dan workflow nyata.

## Status Modul

| Modul | Status akhir | Perubahan utama | Catatan bug yang sempat muncul |
|---|---|---|---|
| Auth & Dashboard | Clear | CORS localhost/127.0.0.1 dirapikan, overlay logout dibuat lebih stabil, ringkasan governance ditambahkan di dashboard | Login flow sempat flake karena host mismatch dan overlay logout |
| Assets | Clear | Asset type dibatasi oleh active governance scope, department/location ikut dibatasi scope, status asset diubah ke dropdown | Scope belum jadi enforcement, ownership/location belum ikut kebijakan, status masih free text |
| Approvals | Clear | Suite stabil setelah selector/helper dirapikan | Tidak ada bug produk tersisa setelah rerun |
| Documents | Clear | Role read-only dibatasi dari aksi write, attachment evidence tetap masuk alur dokumen | Aksi write sempat terlihat untuk role yang tidak berhak |
| Evidence | Clear | Duplicate relation diblok di backend, suite dibuat stabil di host `localhost` | Duplicate attach belum diblok, sempat flake karena base URL |
| Audit Events | Clear | Export Excel ditambahkan, actor dibuat lebih informatif dengan email | Export awalnya hanya JSON, actor tampil terlalu teknis |
| Governance | Clear | Scope summary dibuat human-readable, approve/activate scope dibatasi ke `TENANT_ADMIN`, dashboard dibagi menjadi Scope/Context/Stakeholder cards | JSON mentah di scope summary, approval scope terlalu longgar, department/location tampil sebagai ID |
| Vendors | Clear | Read-only access ditegaskan di UI, create/edit dibatasi role yang berhak | Auditor sempat melihat aksi yang terlalu longgar di UI |
| Contracts | Clear | Suite stabil, role guard diperketat, document/asset/evidence relation tetap terjaga | UI role read-only sempat perlu dirapikan |
| Software Products | Clear | Product registry, installations, assignments, entitlements, allocations, tenant isolation diverifikasi | Success message dan selector perlu dirapikan agar stabil |
| Asset Transfer Requests | Clear | Transfer request, preview, approval, execution, cancel guard diverifikasi | Setelah transfer sukses, asset tidak lagi terlihat dari tenant asal; assertion disesuaikan ke `404` |
| KPI Library & Scorecard | Clear | KPI measurement edit diperbaiki, suite rerun hijau | Route edit measurement sempat belum meng-import service update |
| Internal Audits | Clear | Suite Playwright dibangun dan distabilkan, start/complete/guard, checklist, findings, read access, tenant isolation diverifikasi | Banyak locator awal terlalu umum; modal dan status perlu dipersempit |

## Rincian Perubahan Penting

### 1. Governance

Perubahan governance yang paling penting:

- scope summary tidak lagi menampilkan `scope_json` mentah sebagai fokus utama
- department dan location ditampilkan sebagai nama, bukan ID
- `Scope -> Context -> Stakeholders` ditampilkan sebagai tiga card terpisah di dashboard
- `approve` dan `activate` scope dibatasi ke `TENANT_ADMIN`
- `Asset Types`, `Departments`, `Locations`, dan `Environments` pada scope dipakai sebagai policy boundary

File yang terlibat:

- `apps/web/app/components/DashboardSummaryCards.tsx`
- `apps/web/app/governance/scope/ScopeVersionsPageClient.tsx`
- `apps/web/app/governance/scope/[id]/ScopeVersionDetailClient.tsx`
- `apps/web/app/lib/governanceScope.ts`
- `apps/web/app/lib/governanceAccess.ts`
- `apps/api/src/modules/governance/scope.service.js`

### 2. Assets

Perubahan assets yang penting:

- create asset mengikuti active governance scope
- asset type yang tidak masuk scope tidak ditampilkan di dropdown create
- department dan location juga ikut dibatasi oleh scope
- status asset diubah menjadi dropdown
- halaman detail asset tidak lagi menampilkan nilai teknis yang tidak relevan untuk user

File yang terlibat:

- `apps/web/app/assets/new/page.tsx`
- `apps/web/app/assets/[id]/edit/page.tsx`
- `apps/web/app/assets/[id]/AssetDetailClient.tsx`
- `apps/web/app/assets/[id]/OwnershipPanel.tsx`
- `apps/web/app/lib/assetAccess.ts`
- `apps/web/app/lib/governanceScope.ts`
- `apps/api/src/modules/assets/assets.service.js`
- `apps/api/src/modules/ownership/ownership.service.js`

### 3. Audit Events

Perubahan audit events yang penting:

- export diperluas menjadi Excel selain JSON
- actor dibuat lebih informatif dengan email
- dashboard dan tabel audit trail tetap read-only

File yang terlibat:

- `apps/web/app/audit-events/AuditEventsPageClient.tsx`
- `apps/api/src/modules/audit-events/audit-events.routes.js`

### 4. Internal Audits

Perubahan internal audits terutama ada di test automation:

- suite Playwright baru dibuat
- seeding audit, members, checklist, results, findings dilakukan lewat API helper
- locator modal diperbaiki agar sesuai DOM nyata
- status dan guard assertion dibuat lebih spesifik

File utama:

- `apps/web/e2e/internal-audits.spec.ts`
- `apps/web/app/internal-audits/InternalAuditsClient.tsx`
- `apps/web/app/internal-audits/[id]/InternalAuditDetailClient.tsx`
- `apps/api/src/modules/internal-audits/internal-audit.service.js`

## Bug Yang Sudah Ditutup

| Modul | Bug | Penyelesaian |
|---|---|---|
| Auth & Dashboard | CORS/host mismatch dan logout overlay | Request host diseragamkan dan overlay logout ditutup lebih cepat |
| Assets | Scope belum jadi enforcement | Scope dipakai untuk membatasi create/edit asset |
| Evidence | Duplicate attach relation | Backend menolak duplicate relation dengan `409` |
| Audit Events | Export hanya JSON | Excel export ditambahkan |
| Governance | JSON mentah, approval scope terlalu longgar | Summary dirapikan dan approval dibatasi ke tenant admin |
| KPI | Measurement edit error | Service update di-import dan suite rerun hijau |
| Internal Audits | Locator/modal flake | Test flow dan locator disesuaikan dengan UI nyata |

## Status Testing Terakhir

Suite yang terakhir dijalankan dan hijau:

- `apps/web/e2e/auth-dashboard.spec.ts`
- `apps/web/e2e/assets.spec.ts`
- `apps/web/e2e/approvals.spec.ts`
- `apps/web/e2e/documents.spec.ts`
- `apps/web/e2e/evidence.spec.ts`
- `apps/web/e2e/audit-events.spec.ts`
- `apps/web/e2e/governance.spec.ts`
- `apps/web/e2e/vendors.spec.ts`
- `apps/web/e2e/contracts.spec.ts`
- `apps/web/e2e/software-products.spec.ts`
- `apps/web/e2e/asset-transfer-requests.spec.ts`
- `apps/web/e2e/kpi.spec.ts`
- `apps/web/e2e/internal-audits.spec.ts`

## Catatan Lanjutan

- Beberapa modul lain di workbook masih belum dikerjakan, seperti Management Reviews, CAPA, Reports, Admin Master Data, dan SA Tenants.
- Dokumentasi ini hanya merangkum pekerjaan yang sudah selesai dan tervalidasi di repo saat ini.

