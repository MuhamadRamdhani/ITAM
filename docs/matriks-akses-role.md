# Matriks Akses Per Role

Dokumen ini memetakan akses berdasarkan role yang benar-benar terlihat di kode.

Catatan:

- Tidak ada `role level` angka di codebase.
- Role master disimpan sebagai kode role, bukan level numerik.
- `SUPERADMIN` adalah role platform dan juga role yang diperlakukan paling tinggi.
- Kode role master yang terseed:
  - `SUPERADMIN`
  - `TENANT_ADMIN`
  - `ITAM_MANAGER`
  - `PROCUREMENT_CONTRACT_MANAGER`
  - `SECURITY_OFFICER`
  - `ASSET_CUSTODIAN`
  - `SERVICE_DESK_OPERATOR`
  - `AUDITOR`
  - `INTEGRATION_USER`

Legenda:

- `P` = read/list
- `W` = create/update/delete/decide
- `S` = special action atau scope khusus
- `-` = tidak terlihat aksesnya di kode yang saya baca

## Ringkasan Cepat

| Modul / Area | SUPERADMIN | TENANT_ADMIN | ITAM_MANAGER | PROCUREMENT_CONTRACT_MANAGER | ASSET_CUSTODIAN | AUDITOR | Catatan |
|---|---:|---:|---:|---:|---:|---:|---|
| Login / Auth | P | P | P | P | P | P | Public login, sesudah itu tenant context berlaku |
| Home / Dashboard | P | P | P | P | P | P | Launcher mengikuti role user |
| Assets | P/W | P/W | P/W | P | P/W(S) | P | List umumnya tenant-scoped, create/edit butuh role operasional |
| Approvals | P | P | P | P/W(S) | P | P | Decision action dibatasi role tertentu |
| Documents | P | P/W | P/W | - | - | P | Workflow draft -> review -> approve -> publish |
| Evidence | P | P/W | P/W | - | P/W(S) | P | Upload dan attach dibatasi role operasional |
| Audit Events | P | P | P | - | - | P | Audit trail read-only |
| Governance Scope | P | P/W | P/W | - | - | P | Scope version workflow |
| Governance Context | P | P/W | P/W | - | - | P | Register context + priority/status |
| Governance Stakeholders | P | P/W | P/W | - | - | P | Register stakeholder + priority/status |
| Vendors | P/W | P/W | P/W | P/W | - | P | Registry vendor tenant-scoped |
| Contracts | P/W | P/W | P/W | P/W | P/W(S) | P | Detail punya relation ke docs/assets/evidence |
| Software Products | P/W | P/W | P/W | P/W | - | P | Registry software product |
| Software Installations | P/W | P/W | P/W | - | - | P | Installasi software di aset |
| Software Assignments | P/W | P/W | P/W | - | - | P | Assignment software ke identity |
| Software Entitlements | P/W | P/W | P/W | P/W | - | P | Entitlement per contract |
| Entitlement Allocations | P/W | P/W | P/W | P/W | - | P | Allocations per entitlement |
| Admin Users | P/W | P/W | - | - | - | - | SUPERADMIN bisa pilih tenant target; reserved role hanya SUPERADMIN |
| Admin Departments | P/W | P/W | - | - | - | - | Master data tenant |
| Admin Locations | P/W | P/W | - | - | - | - | Master data tenant |
| Admin Identities | P/W | P/W | - | - | - | - | Master data tenant |
| Admin Asset Types | P/W | P/W | - | - | - | - | Hanya label yang editable |
| Admin Lifecycle States | P/W | P/W | - | - | - | - | Hanya label yang editable |
| Superadmin Tenants | P/W | - | - | - | - | - | Platform tenant management |
| Reports Asset Coverage | P | P | P | P | - | P | Report read-only |

## Detail Role

### SUPERADMIN

- Akses platform paling tinggi.
- Bisa mengelola tenant.
- Bisa mengelola user lintas tenant target.
- Bisa mengubah role platform reserved `SUPERADMIN`.
- Bisa masuk ke semua area yang memang dibuka untuk role lain.

### TENANT_ADMIN

- Admin tenant.
- Bisa mengelola user tenant.
- Bisa mengelola master data tenant.
- Bisa menjalankan mayoritas workflow operasional ITAM.

### ITAM_MANAGER

- Role operasional inti ITAM.
- Dipakai untuk aset, dokumen, evidence, software, contract relation, governance, dan report tertentu.

### PROCUREMENT_CONTRACT_MANAGER

- Role kuat di area vendor, kontrak, software entitlement, allocation, approval tertentu, dan report.

### ASSET_CUSTODIAN

- Role terbatas untuk ownership/evidence dan beberapa tindakan aset.

### AUDITOR

- Fokus baca dan audit trail.
- Dipakai untuk akses report, software read, vendor read, governance read, dan audit events.

### SECURITY_OFFICER / SERVICE_DESK_OPERATOR / INTEGRATION_USER

- Role ini ada di seed.
- Dari UI yang saya baca, belum semuanya diekspos sebagai gate utama.
- Kemungkinan dipakai di workflow API atau integrasi yang tidak muncul sebagai launcher utama.

