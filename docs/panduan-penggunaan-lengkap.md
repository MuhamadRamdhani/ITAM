# Panduan Penggunaan Lengkap

Panduan ini disusun berdasarkan UI dan API yang ada di repo.

Prinsip baca dokumen ini:

- Kalau sebuah halaman punya tombol atau dropdown, saya jelaskan fungsi dan siapa yang boleh memakainya.
- Kalau backend tidak menunjukkan role gate yang eksplisit, saya tandai sebagai `tenant-authenticated` atau `role gate tidak terlihat di file yang dibaca`.
- Nama dropdown saya tulis sesuai nilai code yang benar-benar muncul di source.

## 1. Login

### Fungsi

- Masuk ke tenant menggunakan `tenant code`, email, dan password.
- Setelah login sukses, user diarahkan ke home.
- Jika kontrak tenant habis, belum aktif, atau tenant suspended, login ditolak dan muncul modal penjelasan.

### Akses

- Public.

### Input utama

- `Tenant Code`
- `Email Address`
- `Password`

### Output / perilaku penting

- Sistem mengecek status tenant dan kesehatan kontrak sebelum sesi dibuat.
- `SUPERADMIN` dapat bypass beberapa block tenant contract/suspension di layer auth.

## 2. Home / Dashboard

### Fungsi

- Menjadi landing page setelah login.
- Menampilkan ringkasan operasional dan launcher ke modul-modul utama.

### Akses

- Semua user yang sudah login.

### Isi utama

- Summary cards dashboard.
- Launcher ke modul utama.
- Quick links untuk create asset, create document, upload evidence, dan buka halaman penting.

### Dropdown

- Tidak ada dropdown utama di home.

## 3. Assets

### 3.1 Assets List

### Fungsi

- Melihat daftar aset tenant.
- Mencari aset.
- Memfilter berdasarkan type dan lifecycle state.

### Akses

- List aset terlihat di konteks tenant.
- Create/edit action dibatasi role operasional.

### Dropdown / filter

- `Asset Type`
  - `All`
  - Nilai diambil dari config/master asset types tenant.
- `Lifecycle State`
  - `All`
  - Nilai diambil dari lifecycle states tenant.
- `Page size`
  - Mengikuti config UI.

### Aksi

- Buka detail aset.
- Buka halaman create asset.

### 3.2 New Asset

### Fungsi

- Membuat aset baru.

### Akses

- Backend create asset dibatasi `TENANT_ADMIN` dan `ITAM_MANAGER`.

### Dropdown

- `Asset Type`
  - Diisi dari `/api/v1/config/asset-types`.
- `Initial State`
  - Diisi dari `/api/v1/config/lifecycle-states`.

### Field penting lain

- `Asset Tag`
- `Name`
- `Status`
- `Purchase Date`
- `Warranty Start / End`
- `Support Start / End`
- `Subscription Start / End`

### 3.3 Asset Detail

Asset detail terdiri dari beberapa panel.

#### Ownership Panel

### Fungsi

- Mengubah owner department, custodian identity, dan location.
- Melihat riwayat ownership.

### Akses

- Change ownership dibatasi oleh `TENANT_ADMIN`, `ITAM_MANAGER`, atau `ASSET_CUSTODIAN`.

### Dropdown / lookup

- Department selector
  - Search field + dropdown hasil `departments`.
- Identity selector
  - Search field + dropdown hasil `identities`.
- Location selector
  - Search field + dropdown hasil `locations`.

### Field tambahan

- `Reason` optional

#### Lifecycle Panel

### Fungsi

- Melihat current state.
- Melakukan transition state.
- Melihat history state aset.

### Akses

- Lintasan transition bergantung config gate di backend.

### Dropdown

- `Target state`
  - Daftar transition options dari API.
  - Bisa menampilkan indikator:
    - approval required
    - evidence required
    - gate rules
    - blocked reasons

### Perilaku penting

- Kalau transition butuh approval, sistem membuat approval dan state berubah setelah approval disetujui.

#### Software Installations Panel

### Fungsi

- Mencatat software installation di aset.
- Melihat installation history.

### Akses

- Read: `SUPERADMIN`, `TENANT_ADMIN`, `ITAM_MANAGER`, `AUDITOR`
- Write: `SUPERADMIN`, `TENANT_ADMIN`, `ITAM_MANAGER`

### Dropdown

- `Software Product`
  - Hanya product aktif / tersedia dari registry software product.
- `Installation Status`
  - `INSTALLED`
  - `DETECTED`
  - `UNINSTALLED`

### Field tambahan

- `Installed Version`
- `Installation Date`
- `Uninstalled Date`
- `Discovered By`
- `Discovery Source`
- `Notes`

#### Software Assignments Modal

### Fungsi

- Mengaitkan identity ke software installation.

### Akses

- Read: `SUPERADMIN`, `TENANT_ADMIN`, `ITAM_MANAGER`, `AUDITOR`
- Write: `SUPERADMIN`, `TENANT_ADMIN`, `ITAM_MANAGER`

### Dropdown

- `Identity`
  - hasil pencarian identity.
- `Assignment Role`
  - `PRIMARY_USER`
  - `SECONDARY_USER`
  - `ADMINISTRATOR`
  - `SERVICE_ACCOUNT`
- `Assignment Status`
  - `ACTIVE`
  - `REVOKED`

### Field tambahan

- `Assigned At`
- `Unassigned At`
- `Notes`

## 4. Approvals

### Fungsi

- Melihat queue approval.
- Membuka detail approval.
- Menyetujui atau menolak approval.

### Akses

- List/detail tersedia dalam konteks tenant.
- Decision action dibatasi `TENANT_ADMIN`, `ITAM_MANAGER`, dan `PROCUREMENT_CONTRACT_MANAGER`.

### Dropdown / filter

- `Status`
  - `PENDING`
  - `APPROVED`
  - `REJECTED`
- `Page size`

### Perilaku penting

- Approval dipakai oleh workflow lifecycle asset dan workflow lain yang membutuhkan persetujuan.

## 5. Documents

### Fungsi

- Mengelola dokumen tenant dengan workflow versioning.

### Akses

- List detail: tenant context.
- Create/version/submit: `TENANT_ADMIN` dan `ITAM_MANAGER`
- Approve/publish/archive: `TENANT_ADMIN`

### Dropdown / filter

- `Status`
  - `ALL`
  - `DRAFT`
  - `IN_REVIEW`
  - `APPROVED`
  - `PUBLISHED`
  - `ARCHIVED`
- `Type`
  - input bebas untuk type code.
- `Page size`

### Perilaku penting

- Workflow dokumen:
  - `DRAFT`
  - `IN_REVIEW`
  - `APPROVED`
  - `PUBLISHED`
  - `ARCHIVED`

### Create document

- `doc_type_code`
- `title`
- `content_json`

## 6. Evidence

### Fungsi

- Upload file evidence.
- Melihat library evidence.
- Mengikat evidence ke asset, document, approval, atau contract.

### Akses

- List evidence: tenant context.
- Upload dan attach:
  - `TENANT_ADMIN`
  - `ITAM_MANAGER`
  - `ASSET_CUSTODIAN`

### Dropdown / filter

- `Page size`
- Search berbasis filename, mime, atau sha.

### Perilaku penting

- File upload dibatasi keamanan file type dan ukuran.
- File yang sudah di-upload bisa diunduh dari endpoint download.

## 7. Audit Events

### Fungsi

- Melihat audit trail tenant.

### Akses

- `SUPERADMIN`
- `TENANT_ADMIN`
- `ITAM_MANAGER`
- `AUDITOR`

### Dropdown / filter

- filter audit biasanya berbasis actor, entity, action, status, tanggal, dan page size dari UI.

### Perilaku penting

- Read-only.
- Dipakai untuk investigasi dan audit compliance.

## 8. Governance Scope

### Fungsi

- Membuat dan mengelola scope version.
- Submit, approve, activate, dan supersede scope.

### Akses

- Read: `SUPERADMIN`, `TENANT_ADMIN`, `ITAM_MANAGER`, `AUDITOR`
- Write: `SUPERADMIN`, `TENANT_ADMIN`, `ITAM_MANAGER`

### Dropdown / pilihan

- `Status`
  - `ALL`
  - `DRAFT`
  - `SUBMITTED`
  - `APPROVED`
  - `ACTIVE`
  - `SUPERSEDED`
- `Asset Types in Scope`
  - checkbox multi-select dari master asset types.
- `Departments in Scope`
  - checkbox multi-select dari master departments.
- `Locations in Scope`
  - checkbox multi-select dari master locations.
- `Environments`
  - `ON_PREM`
  - `CLOUD`
  - `SAAS`
- `Page size`

### Field lain

- `Version Note`
- `Additional Notes`
- `Stakeholder Summary`

## 9. Governance Context

### Fungsi

- Mendaftarkan context register tenant.

### Akses

- Read: `SUPERADMIN`, `TENANT_ADMIN`, `ITAM_MANAGER`, `AUDITOR`
- Write: `SUPERADMIN`, `TENANT_ADMIN`, `ITAM_MANAGER`

### Dropdown

- `Category`
  - `INTERNAL`
  - `EXTERNAL`
- `Priority`
  - `LOW`
  - `MEDIUM`
  - `HIGH`
  - `CRITICAL`
- `Status`
  - `OPEN`
  - `MONITORING`
  - `CLOSED`
- `Owner Identity`
  - select identity tenant.

### Field lain

- `Title`
- `Description`
- `Review Date`

## 10. Governance Stakeholders

### Fungsi

- Mendaftarkan stakeholder register tenant.

### Akses

- Read: `SUPERADMIN`, `TENANT_ADMIN`, `ITAM_MANAGER`, `AUDITOR`
- Write: `SUPERADMIN`, `TENANT_ADMIN`, `ITAM_MANAGER`

### Dropdown

- `Category`
  - `INTERNAL`
  - `REGULATOR`
  - `VENDOR`
  - `CUSTOMER`
  - `PARTNER`
  - `EXTERNAL`
- `Priority`
  - `LOW`
  - `MEDIUM`
  - `HIGH`
  - `CRITICAL`
- `Status`
  - `OPEN`
  - `MONITORING`
  - `CLOSED`
- `Owner Identity`
  - select identity tenant.

### Field lain

- `Name`
- `Expectations`
- `Review Date`

## 11. Vendors

### Fungsi

- Registri vendor tenant.

### Akses

- Read:
  - `SUPERADMIN`
  - `TENANT_ADMIN`
  - `ITAM_MANAGER`
  - `PROCUREMENT_CONTRACT_MANAGER`
  - `AUDITOR`
- Write:
  - `SUPERADMIN`
  - `TENANT_ADMIN`
  - `ITAM_MANAGER`
  - `PROCUREMENT_CONTRACT_MANAGER`

### Dropdown / filter

- `Vendor Type`
  - `SOFTWARE_PUBLISHER`
  - `HARDWARE_SUPPLIER`
  - `SERVICE_PROVIDER`
  - `CLOUD_PROVIDER`
  - `MSP`
  - `OTHER`
- `Status`
  - `ACTIVE`
  - `INACTIVE`
- Search bar untuk code/name/type/contact.

### Create field utama

- `Vendor Code`
- `Vendor Name`
- `Primary Contact Name`
- `Primary Contact Email`
- `Primary Contact Phone`
- `Notes`

## 12. Contracts

### Fungsi

- Registri kontrak tenant.
- Menghubungkan contract dengan vendor, documents, assets, evidence, dan software entitlements.

### Akses

- List/detail/create/update terlihat sebagai tenant-scoped module.
- Relation actions punya gate role yang lebih spesifik:
  - Documents/assets relation: `TENANT_ADMIN`, `ITAM_MANAGER`
  - Evidence relation: `TENANT_ADMIN`, `ITAM_MANAGER`, `ASSET_CUSTODIAN`

### Dropdown / filter

- Status tabs:
  - `ALL`
  - `DRAFT`
  - `ACTIVE`
  - `EXPIRED`
  - `TERMINATED`
- `Health`
  - `ACTIVE`
  - `EXPIRING`
  - `EXPIRED`
  - `NO_END_DATE`
- `Vendor`
  - dropdown dari vendor aktif tenant.
- `Contract Type`
  - `SOFTWARE`
  - `HARDWARE`
  - `SERVICE`
  - `CLOUD`
  - `MAINTENANCE`
  - `OTHER`
- `Status` saat create/edit
  - `DRAFT`
  - `ACTIVE`
  - `EXPIRED`
  - `TERMINATED`

### Field lain

- `Contract Code`
- `Contract Name`
- `Start Date`
- `End Date`
- `Renewal Notice Days`
- `Owner Identity ID`
- `Notes`

### Contract Detail relation

#### Documents tab

- Select `Document` untuk attach ke contract.

#### Assets tab

- Select `Asset` untuk attach ke contract.

#### Evidence tab

- Select `Evidence File` untuk attach ke contract.

#### Software Entitlements panel

### Fungsi

- Membuat entitlement software untuk contract.

### Akses

- Read:
  - `SUPERADMIN`
  - `TENANT_ADMIN`
  - `ITAM_MANAGER`
  - `PROCUREMENT_CONTRACT_MANAGER`
  - `AUDITOR`
- Write:
  - `SUPERADMIN`
  - `TENANT_ADMIN`
  - `ITAM_MANAGER`
  - `PROCUREMENT_CONTRACT_MANAGER`

### Dropdown

- `Software Product`
  - product aktif tenant.
- `Licensing Metric`
  - `SUBSCRIPTION`
  - `PER_USER`
  - `PER_DEVICE`
  - `PER_NAMED_USER`
  - `PER_CONCURRENT_USER`
  - `PER_CORE`
  - `PER_PROCESSOR`
  - `SITE`
  - `ENTERPRISE`
  - `OTHER`
- `Status`
  - `ACTIVE`
  - `INACTIVE`
  - `EXPIRED`

### Field lain

- `Entitlement Code`
- `Entitlement Name`
- `Quantity Purchased`
- `Start Date`
- `End Date`
- `Notes`

#### Entitlement Allocations modal

### Fungsi

- Mengalokasikan entitlement ke asset, installation, atau assignment.

### Akses

- Read:
  - `SUPERADMIN`
  - `TENANT_ADMIN`
  - `ITAM_MANAGER`
  - `PROCUREMENT_CONTRACT_MANAGER`
  - `AUDITOR`
- Write:
  - `SUPERADMIN`
  - `TENANT_ADMIN`
  - `ITAM_MANAGER`
  - `PROCUREMENT_CONTRACT_MANAGER`

### Dropdown

- `Asset`
  - asset yang terkait contract.
- `Allocation Basis`
  - `INSTALLATION`
  - `ASSIGNMENT`
  - `ASSET`
  - `MANUAL`
- `Software Installation`
  - muncul kalau basis mengharuskan installation.
- `Software Assignment`
  - muncul kalau basis mengharuskan assignment.
- `Status`
  - `ACTIVE`
  - `RELEASED`

### Field lain

- `Allocated Quantity`
- `Allocated At`
- `Notes`

## 13. Software Products

### Fungsi

- Registry software product.

### Akses

- Read:
  - `SUPERADMIN`
  - `TENANT_ADMIN`
  - `ITAM_MANAGER`
  - `PROCUREMENT_CONTRACT_MANAGER`
  - `AUDITOR`
- Write:
  - `SUPERADMIN`
  - `TENANT_ADMIN`
  - `ITAM_MANAGER`
  - `PROCUREMENT_CONTRACT_MANAGER`

### Dropdown / filter

- `Category`
  - `OPERATING_SYSTEM`
  - `DATABASE`
  - `OFFICE_PRODUCTIVITY`
  - `SECURITY`
  - `DEVELOPER_TOOL`
  - `MIDDLEWARE`
  - `BUSINESS_APPLICATION`
  - `DESIGN_MULTIMEDIA`
  - `COLLABORATION`
  - `INFRASTRUCTURE_TOOL`
  - `OTHER`
- `Deployment Model`
  - `ON_PREMISE`
  - `SAAS`
  - `HYBRID`
  - `CLOUD_MARKETPLACE`
  - `OTHER`
- `Licensing Metric`
  - `USER`
  - `NAMED_USER`
  - `DEVICE`
  - `CONCURRENT_USER`
  - `CORE`
  - `PROCESSOR`
  - `SERVER`
  - `INSTANCE`
  - `VM`
  - `SUBSCRIPTION`
  - `SITE`
  - `ENTERPRISE`
  - `OTHER`
- `Status`
  - `ACTIVE`
  - `INACTIVE`
- `Version Policy`
  - `VERSIONED`
  - `VERSIONLESS`
- `Publisher Vendor`
  - select vendor aktif.

### Field lain

- `Product Code`
- `Product Name`
- `Notes`

## 14. Software Installations

### Fungsi

- Mencatat installation software pada asset.

### Akses

- Read:
  - `SUPERADMIN`
  - `TENANT_ADMIN`
  - `ITAM_MANAGER`
  - `AUDITOR`
- Write:
  - `SUPERADMIN`
  - `TENANT_ADMIN`
  - `ITAM_MANAGER`

### Dropdown

- `Software Product`
  - software product aktif.
- `Installation Status`
  - `INSTALLED`
  - `DETECTED`
  - `UNINSTALLED`

### Field lain

- `Installed Version`
- `Installation Date`
- `Uninstalled Date`
- `Discovered By`
- `Discovery Source`
- `Notes`

## 15. Software Assignments

### Fungsi

- Menghubungkan software installation ke identity.

### Akses

- Read:
  - `SUPERADMIN`
  - `TENANT_ADMIN`
  - `ITAM_MANAGER`
  - `AUDITOR`
- Write:
  - `SUPERADMIN`
  - `TENANT_ADMIN`
  - `ITAM_MANAGER`

### Dropdown

- `Identity`
  - select identity tenant.
- `Assignment Role`
  - `PRIMARY_USER`
  - `SECONDARY_USER`
  - `ADMINISTRATOR`
  - `SERVICE_ACCOUNT`
- `Assignment Status`
  - `ACTIVE`
  - `REVOKED`

### Field lain

- `Assigned At`
- `Unassigned At`
- `Notes`

## 16. Reports - Asset Coverage

### Fungsi

- Analisis coverage aset.

### Akses

- `TENANT_ADMIN`
- `ITAM_MANAGER`
- `PROCUREMENT_CONTRACT_MANAGER`
- `AUDITOR`

### Dropdown / filter

- `All types`
- `Vendor`
- `Contract`
- `Page size`
- Beberapa filter lain mengikuti report UI dan data coverage yang tersedia.

### Perilaku penting

- Read-only.
- Dipakai untuk coverage analysis dan gap detection.

## 17. Admin Users

### Fungsi

- Membuat user tenant.
- Enable/disable user.
- Assign/remove role.

### Akses

- Hanya `SUPERADMIN` atau `TENANT_ADMIN`.

### Dropdown

- `SUPERADMIN Target Tenant`
  - hanya muncul kalau login sebagai `SUPERADMIN`.
  - menentukan tenant target untuk list user, create user, dan assign role.
- `Status` saat create user
  - `ACTIVE`
  - `DISABLED`
- `Role` selector per user
  - daftar role tenant yang tersedia dari API role list.

### Pembatasan penting

- User platform-managed hanya bisa diubah oleh `SUPERADMIN`.
- Role `SUPERADMIN` juga reserved dan tidak boleh dikelola oleh non-SUPERADMIN.

## 18. Admin Departments

### Fungsi

- Master data department tenant.
- Umumnya untuk ownership aset, governance scope, dan lookup form.

### Akses

- `SUPERADMIN`
- `TENANT_ADMIN`

### Dropdown

- Tidak ada dropdown besar di list utama.
- Edit biasanya fokus ke label/display name.

## 19. Admin Locations

### Fungsi

- Master data lokasi tenant.

### Akses

- `SUPERADMIN`
- `TENANT_ADMIN`

### Dropdown

- Tidak ada dropdown besar di list utama.
- Edit fokus ke label/display name.

## 20. Admin Identities

### Fungsi

- Master data identity tenant untuk custodian, owner, assignment, governance, dan approval.

### Akses

- `SUPERADMIN`
- `TENANT_ADMIN`

### Dropdown

- Beberapa field lookup / status / relasi identity sesuai form yang sedang dibuka.

## 21. Admin Asset Types

### Fungsi

- Master data asset type tenant.

### Akses

- `SUPERADMIN`
- `TENANT_ADMIN`

### Dropdown

- Tidak ada dropdown besar.
- Yang editable adalah label/display name.
- `code` dipakai logic sistem dan dijaga stabil.

## 22. Admin Lifecycle States

### Fungsi

- Master data lifecycle state tenant.

### Akses

- `SUPERADMIN`
- `TENANT_ADMIN`

### Dropdown

- Tidak ada dropdown besar.
- Yang editable adalah label/display name.
- `code` dan `sort_order` dijaga stabil untuk workflow.

## 23. Superadmin Tenants

### Fungsi

- Registri tenant platform.
- Create, edit, dan lihat summary tenant.

### Akses

- `SUPERADMIN` saja.

### Dropdown / filter

- `status_code`
- `contract_health`
- `sort_by`
- `sort_dir`
- `page_size`

### Field create/edit

- `code`
- `name`
- `status_code`
- `plan_code`
- `contract_start_date`
- `contract_end_date`
- `subscription_notes`

## 24. Ringkasan Dropdown Utama

Untuk memudahkan pembacaan, dropdown yang paling sering muncul di proyek ini adalah:

- `tenant selector`
- `role selector`
- `status selector`
- `asset type selector`
- `lifecycle state selector`
- `vendor selector`
- `contract type selector`
- `contract health selector`
- `software product selector`
- `licensing metric selector`
- `deployment model selector`
- `version policy selector`
- `assignment role selector`
- `assignment status selector`
- `allocation basis selector`
- `allocation status selector`
- `category selector`
- `priority selector`
- `page size selector`

## 25. Cara Pakai Dokumen Ini

- Jika kamu mau training user, mulai dari `Home`, `Assets`, `Documents`, `Evidence`, lalu `Contracts`.
- Jika kamu mau training admin, mulai dari `Admin Users`, `Asset Types`, `Lifecycle States`, `Departments`, `Locations`, lalu `Superadmin Tenants`.
- Jika kamu mau training auditor, fokus ke `Audit Events`, `Reports`, dan module read-only lainnya.

## 26. Catatan Akhir

- Dokumen ini mengikuti codebase per tanggal `2026-03-27`.
- Kalau ada role atau dropdown baru di code, dokumen ini perlu di-update.
- Kalau kamu mau, versi berikutnya bisa saya ubah menjadi SOP langkah demi langkah per menu, atau versi tabel yang siap ditempel ke Confluence/Notion.

