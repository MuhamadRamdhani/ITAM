# Roadmap MVP ITAM SaaS - Final

Dokumen ini merapikan roadmap yang kamu susun agar lebih konsisten secara produk, lebih mudah dibaca mentor, dan lebih selaras dengan arah codebase yang sudah ada di repo.

## Prinsip Desain

- Multi-tenant dari awal, bukan ditambahkan belakangan.
- Audit-ready lebih penting daripada sekadar banyak fitur.
- Data inti harus benar sebelum otomatisasi.
- Workflow harus bisa ditelusuri dari aksi sampai evidence.
- Role dan approval harus mengikuti batas tenant dengan ketat.
- Fitur ISO/IEC 19770-1 dipetakan sebagai kemampuan sistem manajemen, bukan sekadar menu aplikasi.

## Status Implementasi Saat Ini

Legenda:

- `SUDAH` = sudah terlihat nyata di codebase.
- `SEDANG BERJALAN` = fondasi sudah ada, tetapi workflow penuh belum lengkap.
- `BELUM` = belum terlihat sebagai modul penuh di repo.

| Area | Status | Catatan singkat |
|---|---:|---|
| Auth, login, logout, refresh, me | SUDAH | Alur session cookie dan auto refresh sudah ada |
| Roles, multi-role user, user management | SUDAH | Role management dan admin user sudah berjalan |
| Superadmin tenant management | SUDAH | Tenant list, detail, dan baseline platform sudah ada |
| Tenant subscription monitoring | SEDANG BERJALAN | Banner/detail sudah ada, tapi belum jadi modul subscription penuh |
| Tenant admin master data | SUDAH | Departments, locations, identities, asset types, lifecycle states |
| Asset registry core | SUDAH | List, create, edit, detail, filter, pagination |
| Ownership dan custody traceability | SUDAH | Ownership panel dan history sudah tersedia |
| Lifecycle transition dan gate control | SUDAH | Transition flow dan panel sudah ada |
| Approvals queue | SUDAH | List, detail, dan approval decision ada |
| Documents dan versioning | SUDAH | Repository, add version, workflow actions ada |
| Evidence upload dan attachment | SUDAH | Upload, library, link ke entity sudah ada |
| Governance clause 4 | SUDAH | Scope, context, stakeholders sudah ada |
| Dashboard minimal dan audit trail viewer | SUDAH | Summary cards dan audit events viewer ada |
| UX hardening | SUDAH | Global loading dan safe request handling sudah ada |
| Vendor dan contracts | SUDAH | Registry dan detail sudah ada |
| Software products, installations, assignments | SUDAH | Modul software sudah nyata di backend dan frontend |
| Entitlements dan allocations | SUDAH | Entitlement dan allocation flow sudah ada |
| Consumption + ELP snapshot | BELUM | Belum terlihat sebagai modul khusus |
| Asset transfer antar tenant | SUDAH | Request, approval, detail, dan access guard ada |
| KPI library, scorecard, trend | SUDAH | KPI module dan scorecard sudah ada |
| Internal audit module | SEDANG BERJALAN | Modul ada, tetapi belum menjadi lifecycle audit yang penuh |
| Management review | BELUM | Belum terlihat sebagai modul khusus |
| CAPA workflow | BELUM | Belum terlihat sebagai modul khusus |
| Policy management, RACI, risk register, training matrix | BELUM | Belum terlihat sebagai modul governance maturity |
| Discovery, ingestion, reconciliation, SCIM, webhooks | BELUM | Belum terlihat sebagai integrasi/scale layer |

## MVP 0 - Identity, Multi-tenant Access, Admin Baseline [SUDAH]

### Tujuan

- Membangun fondasi platform.
- Menetapkan batas tenant dan identitas pengguna.
- Menegaskan perbedaan superadmin platform dan admin tenant.
- Menyiapkan baseline admin untuk data master tenant.

### MVP 0.0 - Auth / Login [SUDAH]

Scope:

- Login
- Logout
- Me
- Cookie-based auth
- Strict auth mode
- Inject `tenant_id`, `user_id`, `roles[]`, `identity_id`

BE:

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

FE:

- Login page
- Auth guard
- Middleware cek cookie
- Auto refresh session

Audit:

- Login success/fail
- Logout
- Refresh token activity

### MVP 0.1 - Roles + User Management [SUDAH]

Scope:

- Seed master role
- Create user
- Patch user
- Assign role
- Role-based visibility
- Multi-role per akun

Roles minimum:

- `SUPERADMIN`
- `TENANT_ADMIN`
- `ITAM_MANAGER`
- `PROCUREMENT_CONTRACT_MANAGER`
- `SECURITY_OFFICER`
- `ASSET_CUSTODIAN`
- `SERVICE_DESK_OPERATOR`
- `AUDITOR`
- `INTEGRATION_USER`

Catatan:

- Satu user boleh punya lebih dari satu role.
- Role disimpan di `user_roles`.
- Tenant admin hanya mengelola user di tenant-nya.
- Superadmin platform tetap dipisah secara konsep.

### MVP 0.2 - Superadmin Platform / Tenant Management [SUDAH]

Scope:

- Create tenant
- Update tenant
- Activate / suspend tenant
- Plan tenant
- Tenant summary
- Seed baseline roles + tenant settings

FE:

- Superadmin tenants list
- Create tenant
- Tenant detail

Tambahan penting:

- Kontrak tenant harus dimodelkan sebagai subscription platform, bukan vendor contract.
- Field minimum:
  - `contract_start_date`
  - `contract_end_date`
  - `grace_until`
  - `plan_code`
  - `status_operasional`
- Badge wajib:
  - expiring
  - expired
  - grace

Catatan:

- Tenant admin boleh melihat status subscription, tetapi tidak mengeditnya.
- Semua kontrol subscription dikelola di superadmin.

### MVP 0.3 - Tenant Admin Baseline + Master Data [SUDAH]

Scope:

- Org admin dashboard
- Departments
- Locations
- Identities
- Asset types
- Lifecycle states

Tambahan penting:

- Locations dipakai untuk menentukan posisi aset.
- Struktur lokasi minimal:
  - branch / cabang
  - site
  - building
  - floor
  - room
- Lokasi tetap tenant-scoped.
- Hirarki lokasi boleh ditingkatkan bertahap tanpa redesign besar.

## MVP 1 - Core ITAM + Audit-ready Baseline [SUDAH]

### Tujuan

- Membentuk single source of truth untuk aset TI.
- Menyiapkan traceability end-to-end.
- Menjadikan workflow utama aman untuk audit.

### MVP 1.0 - Asset Registry Core [SUDAH]

Scope:

- List assets
- Filter
- Search
- Pagination
- Create asset
- Edit asset
- Asset detail

BE:

- `GET /assets`
- `POST /assets`
- `GET /assets/:id`
- `PATCH /assets/:id`

FE:

- Assets list
- Asset detail
- New / edit asset

Tambahan penting:

- Validity data harus berada di level asset instance, bukan di master asset type.
- Field contoh:
  - `purchase_date`
  - `warranty_start_date`
  - `warranty_end_date`
  - `support_start_date`
  - `support_end_date`
  - `subscription_start_date`
  - `subscription_end_date`
- Asset type tetap config-driven.

### MVP 1.1 - Ownership & Custody Traceability [SUDAH]

Scope:

- Owner department
- Custodian identity
- Location
- Ownership history
- Change owner / custodian / location
- Timeline traceability

FE:

- Ownership tab
- Modal change ownership

Catatan:

- Semua perubahan harus append-only.
- Riwayat harus bisa dibaca sebagai timeline.

### MVP 1.2 - Lifecycle Transition + Gate Control [SUDAH]

Scope:

- Transition options
- Gate rules
- Require approval
- Require evidence
- Blocked reasons
- State history

FE:

- Lifecycle tab
- Transition modal
- Requirement display
- Refresh after transition

### MVP 1.3 - Approvals Queue [SUDAH]

Scope:

- Approvals list
- Approvals detail
- Approve / reject
- Polymorphic approval engine

FE:

- Approvals queue
- Approval detail
- Approvals tab di asset detail

### MVP 1.4 - Documents + Versioning + Workflow [SUDAH]

Scope:

- Document repository
- Version list
- Add version
- Submit review
- Approve
- Publish
- Archive

FE:

- List
- Detail
- Workflow actions

### MVP 1.5 - Evidence Upload + Evidence Links [SUDAH]

Scope:

- Upload evidence
- Evidence library
- Attach evidence ke entity
- Link evidence ke asset / approval / scope / document

Tambahan penting:

- Upload perlu size guard yang ketat.
- Image compression boleh, tapi jangan dipaksakan ke semua file.
- PDF, doc, dan zip harus tetap aman secara audit.

### MVP 1.6 - Governance Clause 4 [SUDAH]

Scope:

- Scope versions
- Submit / approve / activate
- Context register
- Stakeholders register

FE:

- `governance/scope`
- `governance/context`
- `governance/stakeholders`

### MVP 1.7 - Dashboard Minimal + Audit Trail Viewer [SUDAH]

Scope:

- Dashboard summary
- Counts by type / state
- Pending approvals
- Docs in review
- Evidence files
- Governance counts
- Audit events explorer

FE:

- Homepage summary cards
- Audit events page
- JSON payload viewer

### MVP 1.8 - UX Hardening / Safe Interaction Layer [SUDAH]

Scope:

- Anti double click
- Anti double submit
- Loading state konsisten
- Full-page global loading overlay
- Disable submit saat request berjalan

Contoh penerapan:

- Login
- Logout
- Approval decide
- Upload evidence
- Lifecycle transition
- Ownership change
- Create / edit asset
- Document actions
- Governance actions
- Admin users
- Superadmin tenants

### MVP 1.9 - Tenant Subscription Monitoring [SEDANG BERJALAN]

Scope:

- Expiring badge
- Grace period handling
- Tenant banner warning
- Detail subscription info di tenant detail
- Initial onboarding flow tenant admin

Catatan:

- Ini turunan dari subscription platform superadmin.
- Tenant admin hanya observasi, bukan edit.

## MVP 2 - Commercial ITAM Operations: Vendor, Contract, Software, License [SEDANG BERJALAN]

### Tujuan

- Memperkuat lapisan komersial ITAM.
- Menyatukan vendor, kontrak, software, dan entitlement.
- Menyiapkan compliance dan renewal awareness.

### MVP 2.0 - Vendor & Contracts [SUDAH]

Scope:

- Vendors
- Contracts
- Contract detail
- Contract expiry / renewal visibility
- Relation contract -> asset
- Relation contract -> document / evidence

FE:

- Vendors list / detail
- Contracts list / detail
- Expiry badge / expiring soon
- Renewal monitoring

Catatan:

- Ini berbeda dari tenant subscription superadmin.
- Ini adalah kontrak operasional tenant terhadap vendor.

### MVP 2.1 - Software Model [SUDAH]

Scope:

- Software products
- Installations
- User assignment
- Software asset visibility

FE:

- Software registry
- Installation mapping
- Assignment mapping

Kaitan:

- Masih nyambung ke masa berlaku software.
- Coverage dan subscription per software harus tercatat di asset instance.

### MVP 2.2 - Entitlements & Allocations [SUDAH]

Scope:

- Entitlements
- Allocation per user / device
- Quantity / metric
- Compliance baseline

### MVP 2.3 - Consumption + ELP Snapshot + Optimization Basic [BELUM]

Scope:

- Consumption snapshots
- Effective License Position
- Unused seat detection
- Reclaim suggestion
- Renewal awareness

### MVP 2.4 - Asset Transfer / Cross-tenant Transfer Workflow [SUDAH]

Scope:

- Transfer request
- Validation target tenant
- Remap ownership / location / master data
- Audit event transfer
- Optional approval

Catatan:

- Jangan diperlakukan sebagai sekadar update `tenant_id`.
- Ini fitur berisiko tinggi karena menyentuh history, evidence, dan audit trail.
- Letakkan di fase advanced seperti ini, bukan di core baseline.

## MVP 3 - Performance Evaluation, Audit, Management Review, CAPA [SEDANG BERJALAN]

### Tujuan

- Menyelesaikan siklus ISO evaluation dan improvement.
- Menjadikan sistem benar-benar audit-ready.

### MVP 3.0 - KPI Scorecard [SUDAH]

Scope:

- KPI library
- KPI measurement
- Scorecard
- Trend chart

FE:

- KPI summary
- KPI trend
- Target vs actual

### MVP 3.1 - Internal Audit Module [SEDANG BERJALAN]

Scope:

- Audit plan
- Audit checklist
- Audit findings
- Finding severity
- Evidence link ke finding

FE:

- Audit plan page
- Checklist page
- Findings page

### MVP 3.2 - Management Review [BELUM]

Scope:

- Management review sessions
- Minutes
- Review decisions
- Action items
- Due dates

FE:

- Meeting minutes
- Action tracker

### MVP 3.3 - CAPA Workflow [BELUM]

Scope:

- Nonconformity
- Root cause
- Corrective action
- Preventive action
- Verification
- Closure

FE:

- CAPA detail
- Workflow state
- Evidence closure

## Rekomendasi Urutan Release

### Release 1

- MVP 0.0
- MVP 0.1
- MVP 0.2
- MVP 0.3

### Release 2

- MVP 1.0
- MVP 1.1
- MVP 1.2
- MVP 1.3
- MVP 1.4
- MVP 1.5

### Release 3

- MVP 1.6
- MVP 1.7
- MVP 1.8
- MVP 1.9

### Release 4

- MVP 2.0
- MVP 2.1
- MVP 2.2
- MVP 2.3
- MVP 2.4

### Release 5

- MVP 3.0
- MVP 3.1
- MVP 3.2
- MVP 3.3

## Kesimpulan

- Roadmap ini sudah cukup besar untuk menjadi platform SaaS ITAM yang serius.
- Urutan paling aman adalah trust foundation -> core ITAM -> commercial operations -> performance evaluation -> improvement maturity.
- Kalau core data belum stabil, jangan terlalu cepat memprioritaskan discovery, optimization, atau automation yang kompleks.
