# Diagram Per Modul

Dokumen ini memetakan alur modul satu per satu berdasarkan code yang ada di repo.

Tujuan dokumen ini:

- Membantu kamu melihat hubungan antar modul dengan cepat.
- Menunjukkan dependensi data dan workflow.
- Menjadi jembatan dari pemahaman high-level ke pembacaan source code.

## 1. Auth dan Session

```mermaid
flowchart TD
  A[Login Page] --> B[POST /api/v1/auth/login]
  B --> C{Tenant valid?}
  C -- no --> D[Reject: contract expired / suspended / captcha invalid]
  C -- yes --> E[Set cookies itam_at + itam_rt]
  E --> F[Frontend redirect to /]
  F --> G[GET /api/v1/auth/me]
  G --> H[Read tenant, user, roles, identity]
  H --> I[Render app shell + role based launchers]
  I --> J{401 on request?}
  J -- yes --> K[POST /api/v1/auth/refresh]
  K --> L[Retry original request]
```

Catatan penting:

- Auth adalah pintu utama semua tenant-scoped request.
- Frontend tidak menyimpan token di localStorage; token session disimpan di cookie httpOnly.
- Refresh token flow ada di client wrapper, bukan di setiap halaman manual.

## 2. Home / Dashboard

```mermaid
flowchart TD
  A[Home Page] --> B[GET /api/v1/auth/me]
  A --> C[GET /api/v1/dashboard/summary]
  A --> D[GET /api/v1/contracts?health=EXPIRING]
  A --> E[GET /api/v1/contracts?health=EXPIRED]
  B --> F[User badge + tenant banner + role detection]
  C --> G[Summary cards: assets, approvals, docs, evidence, scope]
  D --> H[Vendor contract alert]
  E --> H
  F --> I[Launcher visibility rules]
  G --> I
  H --> I
```

Karakter dashboard:

- Dashboard adalah hub operasional.
- Ia tidak menyimpan data bisnis baru, hanya menampilkan agregasi.
- Banyak launcher di-render hanya kalau role user memenuhi syarat.

## 3. Assets

```mermaid
flowchart TD
  A[Assets List] --> B[GET /api/v1/config/ui]
  A --> C[GET /api/v1/config/asset-types]
  A --> D[GET /api/v1/config/lifecycle-states]
  A --> E[GET /api/v1/assets]
  E --> F[Asset table]
  F --> G[View detail]
  F --> H[Edit asset]
  F --> I[Transfer request]

  J[New Asset] --> B
  J --> C
  J --> D
  J --> K[POST /api/v1/assets]
  K --> L[Redirect to asset detail]

  M[Asset Detail] --> N[Ownership panel]
  M --> O[Lifecycle panel]
  M --> P[Software installation panel]
  M --> Q[Software assignment panel]
```

Penekanan business rules:

- Coverage field berubah tergantung asset type.
- Lifecycle transition bisa memicu approval.
- Assets menjadi titik sentral untuk ownership, evidence, contracts, software, dan transfer.

## 4. Approvals

```mermaid
flowchart TD
  A[Workflow source] --> B[Need approval?]
  B -- no --> C[Continue workflow]
  B -- yes --> D[Create approval record]
  D --> E[GET /api/v1/approvals]
  E --> F[Approval detail]
  F --> G[Approve or reject]
  G --> H[Workflow source updated]
```

Penjelasan:

- Approvals bukan modul berdiri sendiri dalam arti bisnis; dia adalah gate untuk workflow lain.
- Yang dipantau user biasanya adalah antrian approval dan hasil keputusan.

## 5. Documents

```mermaid
flowchart TD
  A[Documents List] --> B[Filter by status/type/q]
  A --> C[New Document]
  C --> D[Create doc + version 1]
  D --> E[DRAFT]
  E --> F[IN_REVIEW]
  F --> G[APPROVED]
  G --> H[PUBLISHED]
  H --> I[ARCHIVED]
  E --> J[Attach evidence]
  F --> K[Approval flow]
```

Catatan:

- Dokumen memakai workflow versioning.
- Status menentukan apakah dokumen masih bisa diedit.
- Evidence dan approval menjadi bagian penting dari lifecycle dokumen.

## 6. Evidence

```mermaid
flowchart TD
  A[Upload evidence] --> B[Multipart upload]
  B --> C[Validate size + mime + file safety]
  C --> D[Store in tenant folder]
  D --> E[Optional image optimization]
  E --> F[GET /api/v1/evidence/files]
  F --> G[Download endpoint]
  D --> H[Attach to asset/document/approval/contract]
```

Catatan keamanan:

- File path divalidasi.
- MIME tidak hanya diambil dari ekstensi.
- Upload dibatasi ukuran dan jumlah file.

## 7. Vendors

```mermaid
flowchart TD
  A[Vendor List] --> B[Search + status filter]
  A --> C[Create vendor]
  C --> D[POST /api/v1/vendors]
  D --> E[Vendor registry updated]
  E --> F[Used by contracts]
  E --> G[Used by software product publisher]
```

Vendor adalah master data yang dipakai oleh beberapa modul hilir.

## 8. Contracts

```mermaid
flowchart TD
  A[Contracts List] --> B[Filter by status + health]
  A --> C[Create contract]
  C --> D[Select active vendor]
  D --> E[Set start/end/renewal]
  E --> F[Contract health calculated]
  F --> G[Attach documents/assets/evidence]
  F --> H[Create software entitlement]
  H --> I[Allocate entitlement]
```

Kondisi yang dihitung backend:

- `ACTIVE`
- `EXPIRING`
- `EXPIRED`
- `NO_END_DATE`

## 9. Software Products, Installations, Assignments, Entitlements, Allocations

```mermaid
flowchart TD
  A[Software Products] --> B[Create product]
  B --> C[Link publisher vendor]
  C --> D[Used by installation]

  D --> E[Software Installation on Asset]
  E --> F[Software Assignment to Identity]

  G[Contract Entitlement] --> H[Entitlement created]
  H --> I[Allocation to asset / installation / assignment]
  I --> J[Compliance and usage analysis]
```

Logika utama:

- Product adalah master software.
- Installation adalah fakta software ada di asset.
- Assignment adalah siapa yang memakai software.
- Entitlement adalah hak lisensi dari kontrak.
- Allocation adalah pembagian hak lisensi ke aset atau pengguna.

## 10. Governance

### 10.1 Scope Versions

```mermaid
flowchart TD
  A[Scope Versions] --> B[Create DRAFT]
  B --> C[Submit]
  C --> D[Approve]
  D --> E[Activate]
  E --> F[Supersede previous active version]
```

### 10.2 Context Register

```mermaid
flowchart TD
  A[Context Register] --> B[Create entry]
  B --> C[Categorize INTERNAL / EXTERNAL]
  C --> D[Set priority]
  D --> E[Track status OPEN / MONITORING / CLOSED]
```

### 10.3 Stakeholder Register

```mermaid
flowchart TD
  A[Stakeholder Register] --> B[Create stakeholder]
  B --> C[Set category]
  C --> D[Set priority]
  D --> E[Assign owner identity]
  E --> F[Track review date]
```

## 11. KPI Workspace

```mermaid
flowchart TD
  A[KPI Library] --> B[Create or edit KPI definition]
  B --> C[Define source type MANUAL or SYSTEM]
  C --> D[Set target, threshold, baseline]
  D --> E[Scorecard summary]
  E --> F[Select period]
  F --> G[Capture measurement]
  G --> H[Trend and status recalculation]
```

KPI workspace isinya:

- KPI library untuk master data.
- Scorecard untuk monitoring.
- Measurement untuk capture real value.
- Trend untuk melihat pergeseran performa.

## 12. Audit Events dan Internal Audits

```mermaid
flowchart TD
  A[Business action] --> B[Audit event written]
  A --> C[Internal audit process]
  C --> D[Draft / review / validation]
  D --> E[Audit findings recorded]
  E --> F[Report / follow-up]
```

Perbedaan:

- `audit-events` = trail sistem umum.
- `internal-audits` = proses audit internal yang aktif dan terstruktur.

## 13. Superadmin dan Admin Master Data

```mermaid
flowchart TD
  A[SUPERADMIN] --> B[Manage tenants]
  A --> C[Target tenant user admin]
  A --> D[Platform reserved role control]

  E[TENANT_ADMIN] --> F[Manage tenant master data]
  F --> G[Departments]
  F --> H[Locations]
  F --> I[Identities]
  F --> J[Asset type labels]
  F --> K[Lifecycle state labels]
```

Ringkasan:

- Superadmin mengurus platform dan tenant.
- Tenant admin mengurus master data tenant dan user dalam tenant.

## 14. Reports

```mermaid
flowchart TD
  A[Reports] --> B[Asset coverage]
  A --> C[Asset mapping]
  B --> D[Coverage summary]
  B --> E[Coverage list]
  B --> F[Excel export]
  C --> G[Mapping summary]
  C --> H[Mapping list]
  C --> I[Excel export]
```

Reports itu read-only dan lebih cocok dipakai untuk monitoring, audit, dan analisis gap.

## 15. Cara Membaca Diagram Ini

- Mulai dari auth dulu kalau ingin memahami sesi dan tenant context.
- Lanjut ke assets kalau ingin memahami core data model.
- Lanjut ke contracts dan software kalau ingin memahami hubungan komersial dan lisensi.
- Lanjut ke governance, KPI, dan internal audits kalau ingin memahami layer kontrol dan pengukuran.

