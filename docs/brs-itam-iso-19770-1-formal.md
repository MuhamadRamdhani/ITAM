# Business Requirements Specification
# Aplikasi IT Asset Management (ITAM) - Selaras ISO/IEC 19770-1

Versi ini merapikan kebutuhan bisnis agar bisa dipakai sebagai spesifikasi formal untuk roadmap produk, evaluasi mentor, dan penyelarasan dengan codebase yang sudah ada.

## 1. Tujuan Dokumen

### 1.1 Tujuan

Mendefinisikan kebutuhan bisnis dan fitur aplikasi IT Asset Management (ITAM) yang mendukung penerapan Sistem Manajemen Aset TI sesuai kerangka ISO/IEC 19770-1:2017 dengan fokus pada konteks organisasi, leadership, planning, support, operation, performance evaluation, dan improvement.

### 1.2 Sasaran Bisnis

- Satu sumber kebenaran untuk aset TI lintas hardware, software, SaaS, dan cloud resource.
- Tata kelola yang jelas untuk role, otorisasi, evidence, approval, dan audit trail.
- Kesiapan audit internal maupun eksternal dengan bukti yang dapat ditelusuri.
- Pelaporan kinerja ITAM yang dapat dipakai untuk keputusan operasional dan manajerial.
- Fondasi SaaS multi-tenant yang aman, terukur, dan bisa dikembangkan bertahap.

## 2. Ruang Lingkup

### 2.1 In-Scope

- Manajemen sistem ITAM.
- Data inti aset dan relasi aset.
- Governance, approval, dan documented information.
- License / entitlement / consumption / compliance baseline.
- Evidence management dan immutable audit trail.
- KPI, internal audit, management review, dan CAPA.
- Multi-tenant access control dan baseline admin tenant.

### 2.2 Out-of-Scope

- Sistem akuntansi penuh sebagai system of record.
- Implementasi discovery/connector tingkat enterprise sebagai kewajiban MVP awal.
- Pemaksaan satu metode operasional ITAM yang kaku, selama tetap memenuhi kontrol ISO.

## 3. Definisi Istilah

- Asset: hardware, software, SaaS subscription, cloud resource, VM/container, network device, atau entitas TI lain yang dikelola.
- Entitlement: hak penggunaan berdasarkan kontrak atau perjanjian.
- Consumption: pemakaian aktual berdasarkan install, seat, user, device, core, atau metric lain.
- ELP: Effective License Position, yaitu entitlements dikurangi consumption.
- Evidence / Documented Information: dokumen atau bukti yang dikontrol dengan versi dan approval.
- Audit Trail: catatan immutable atas aksi penting dan otorisasi.

## 4. Pemangku Kepentingan dan Peran Pengguna

### 4.1 Stakeholder

- CIO / IT Director
- ITAM Manager
- Procurement / Contract Manager
- Security / Compliance Officer
- Service Desk / IT Operations
- Internal Auditor
- Finance / Commercial stakeholder
- SaaS Platform Admin

### 4.2 Peran Minimum Sistem

- `SUPERADMIN`
- `TENANT_ADMIN`
- `ITAM_MANAGER`
- `PROCUREMENT_CONTRACT_MANAGER`
- `SECURITY_OFFICER`
- `ASSET_CUSTODIAN`
- `SERVICE_DESK_OPERATOR`
- `AUDITOR`
- `INTEGRATION_USER`

### 4.3 Prinsip Akses

- Satu user boleh memiliki lebih dari satu role.
- Data tenant harus terisolasi ketat.
- `SUPERADMIN` mengelola platform.
- `TENANT_ADMIN` mengelola tenant miliknya.
- `AUDITOR` bersifat read-only kecuali workspace audit yang secara eksplisit diizinkan.

## 5. Kebutuhan Fungsional

### 5.1 Clause 4 - Context of the Organization

#### FR-CX-01 Register Konteks Organisasi

Sistem harus menyediakan modul untuk mencatat isu internal dan eksternal yang mempengaruhi ITAM.

Kriteria minimum:

- status
- owner
- tanggal review
- lampiran evidence

#### FR-CX-02 Register Pihak Berkepentingan

Sistem harus menyimpan stakeholder dan requirement/ekspektasi terhadap ITAM.

Kriteria minimum:

- klasifikasi stakeholder
- prioritas
- kebutuhan atau ekspektasi
- relasi dengan scope ITAM

#### FR-CX-03 Manajemen Scope ITAM

Sistem harus mendefinisikan batasan scope seperti jenis aset, unit bisnis, lokasi, dan lingkungan operasi.

Perubahan scope wajib:

- tercatat sebagai versi baru
- mendapat approval
- dapat ditelusuri

#### FR-CX-04 Peta Proses ITAM

Sistem harus menyimpan process map atau model yang menunjukkan proses utama, interface antar proses, dependency, dan owner proses.

### 5.2 Clause 5 - Leadership

#### FR-LD-01 Manajemen Kebijakan

Sistem harus mendukung pembuatan, review, approval, dan publikasi kebijakan ITAM serta turunannya.

#### FR-LD-02 RACI

Sistem harus mampu memetakan peran, tanggung jawab, dan wewenang untuk aktivitas utama ITAM.

#### FR-LD-03 Kalender Tata Kelola

Sistem harus menyimpan jadwal forum governance, notulen, dan keputusan.

### 5.3 Clause 6 - Planning

#### FR-PL-01 Risk Register ITAM

Sistem harus menyimpan risiko ITAM dengan skor, kategori, owner, dan due date.

#### FR-PL-02 Risk Treatment Plan

Sistem harus menyimpan rencana mitigasi dan status penyelesaiannya.

#### FR-PL-03 Objectives & Targets

Sistem harus menyimpan KPI target, baseline, periode, dan evaluasi.

#### FR-PL-04 Process Specification

Sistem harus menyimpan spesifikasi proses operasional berupa input, output, kontrol, RACI, tools, dan definition of done.

### 5.4 Clause 7 - Support

#### FR-SP-01 Kompetensi dan Awareness

Sistem harus mendukung training matrix berbasis role dan pencatatan pelatihan atau sertifikasi.

#### FR-SP-02 Rencana Komunikasi ITAM

Sistem harus mendukung template komunikasi dan log distribusi.

#### FR-SP-03 Information Requirements dan Data Standard

Sistem harus mendefinisikan atribut wajib per asset type dan aturan kualitas data.

#### FR-SP-04 Kontrol Dokumen

Sistem harus menyediakan repository dokumen dengan versioning, approval workflow, retention, dan akses terkontrol.

#### FR-SP-05 Traceability Ownership

Setiap aset harus memiliki owner, custodian, dan responsible org yang dapat ditelusuri sepanjang waktu.

#### FR-SP-06 Audit Trail Otorisasi

Sistem harus menyimpan catatan immutable untuk aksi kritikal seperti approval, perubahan scope, alokasi lisensi, disposal, dan perubahan data sensitif.

### 5.5 Clause 8 - Operation

#### FR-OP-01 Workflow Lifecycle Aset

Sistem harus mendukung alur request -> approve -> procure -> receive -> tag -> deploy -> maintain -> reassign -> retire -> dispose.

#### FR-OP-02 Control Points dan Evidence

Sistem harus memungkinkan gate control seperti approval wajib, evidence wajib, atau blokir jika syarat belum terpenuhi.

#### FR-CH-01 Keterkaitan Aset dengan Change

Sistem harus bisa mengaitkan aset dengan perubahan operasional atau change record.

#### FR-DM-01 Asset Registry

Sistem harus menjadi system of record untuk aset hardware, software, SaaS subscription, cloud resource, VM/container, dan network/peripheral.

#### FR-DM-02 Ingestion dan Discovery

Sistem harus mendukung ingestion dari CSV, API, atau konektor jika tersedia.

#### FR-DM-03 Data Quality dan Reconciliation

Sistem harus menyediakan aturan validasi data, confidence score, conflict resolution, dan rekonsiliasi dengan sistem lain jika terintegrasi.

#### FR-LM-01 Contract dan Entitlement

Sistem harus menyimpan perjanjian vendor/publisher, metrik lisensi, masa maintenance, dan klausul audit.

#### FR-LM-02 Effective License Position

Sistem harus dapat menghitung entitlement terhadap consumption untuk menilai compliance.

#### FR-LM-03 Optimasi Lisensi

Sistem harus dapat mendeteksi unused install atau seat dan memberi sinyal reclaim atau true-up.

#### FR-SC-01 Status Keamanan per Aset

Sistem harus menyimpan status kontrol keamanan seperti encryption, EDR, patch level, dan vulnerability flags.

#### FR-SC-02 Kontrol Akses dan Integritas

Sistem harus mendukung RBAC granular dan immutable audit log untuk aksi kritikal.

#### FR-OT-01 Procurement dan Vendor Management

Sistem harus mendukung approved vendor, renewal alert, dan expiry contract.

#### FR-OT-02 Disposal dan Sustainability

Sistem harus menyimpan chain-of-custody, sertifikat wipe, dokumen e-waste, dan status disposal.

#### FR-OS-01 Boundary Management

Sistem harus mampu membedakan aset provider-owned dan customer-owned.

#### FR-MR-01 BYOD / Shared Responsibility

Sistem harus menyimpan matriks tanggung jawab untuk BYOD, contractor assets, dan shared devices.

### 5.6 Clause 9 - Performance Evaluation

#### FR-PE-01 KPI Library dan Scorecard

Sistem harus menyediakan KPI library, target per periode, scorecard, dan trend.

#### FR-PE-02 Monitoring dan Dashboard

Sistem harus menampilkan dashboard ringkas dan menyediakan export laporan.

#### FR-PE-03 Internal Audit Module

Sistem harus menyediakan audit plan, checklist, evidence, finding, severity, dan action plan.

#### FR-PE-04 Management Review

Sistem harus mendukung meeting minutes, keputusan, action items, dan follow-up.

### 5.7 Clause 10 - Improvement

#### FR-IM-01 Nonconformity dan Corrective Action

Sistem harus mendukung alur finding -> root cause -> corrective action -> verification -> closure.

#### FR-IM-02 Preventive Action

Sistem harus mendukung preventive action berdasarkan trend KPI atau risiko.

#### FR-IM-03 Continual Improvement Backlog

Sistem harus menyimpan register improvement, prioritas, PIC, dan outcome terukur.

## 6. Model Data Minimum

- Tenant / Organization
- Business Unit
- Location
- Person / Identity
- Department
- Asset
- Asset Relationship
- Contract
- Entitlement
- Allocation
- Renewal
- Policy / Standard / Procedure
- Risk
- Control
- Evidence Artifact
- Request / Approval / Workflow State
- Change Record
- Audit
- Finding
- CAPA
- Audit Log

## 7. Non-Functional Requirements

### NFR-01 Security

- Isolasi tenant
- Enkripsi in-transit dan at-rest
- RBAC
- MFA / SSO opsional
- IP allowlist opsional

### NFR-02 Auditability dan Evidence

- Audit trail immutable
- Export evidence pack
- Retensi log sesuai paket

### NFR-03 Availability dan Resilience

- Backup terjadwal
- Restore test
- Definisi RPO / RTO per tier

### NFR-04 Data Governance

- Retention policy
- Legal hold
- Data residency opsional
- Penghapusan atau anonymization sesuai regulasi

### NFR-05 Scalability

- Mendukung batch ingestion
- Mendukung asynchronous processing
- Mendukung dataset besar

### NFR-06 Integrations

- API-first
- Webhooks opsional
- SCIM opsional
- Connector endpoint / cloud opsional

## 8. Kebutuhan Multi-Tenant dan Subscription

- Onboarding wizard.
- Tenant plan limit.
- Billing integration opsional.
- Tenant admin settings.
- Monitoring status subscription.
- Banner expiring / expired / grace.

## 9. Output dan Artefak

- Scope ITAM.
- Stakeholder register.
- Kebijakan ITAM.
- Process specification.
- Objective / target / KPI set.
- Risk register dan treatment plan.
- Evidence pack.
- Internal audit report.
- Management review minutes.
- CAPA closure evidence.

## 10. Kriteria Sukses

- Data aset lengkap dan akurat sesuai target.
- Effective License Position dapat dihitung dan dibuktikan.
- Internal audit berjalan end-to-end.
- Management review menghasilkan keputusan dan action item.
- CAPA dapat ditutup dengan evidence yang valid.

## 11. Catatan Implementasi

- Mulai dari core data, lifecycle, dan audit trail.
- Tambahkan license position dan audit module setelah core stabil.
- Tambahkan security posture, outsourcing boundary, dan automation setelah governance matang.

## 12. Mapping ke Codebase Saat Ini

Dokumen BRS ini sudah punya fondasi implementasi nyata di repo, terutama pada area berikut:

- Auth dan tenant-aware session handling.
- Role management dan admin baseline.
- Asset registry, ownership, lifecycle, approvals.
- Documents dan evidence.
- Vendor, contract, software, entitlement, allocation.
- Governance scope, context, stakeholder.
- Dashboard dan audit events.
- KPI dan internal audits.

Artinya, dokumen ini bukan target abstrak, tetapi penguatan formal dari arah produk yang sudah mulai dibangun.
