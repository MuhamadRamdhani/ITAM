# SOP Per Role Lengkap

Dokumen ini menjelaskan alur kerja yang disarankan untuk setiap role yang terlihat di codebase.

Tujuan dokumen ini:

- Menjelaskan apa yang biasanya dilakukan tiap role.
- Menjelaskan modul mana yang paling relevan untuk role itu.
- Menjadi panduan operasional berdasarkan akses yang benar-benar tampak di code.

Catatan penting:

- Tidak semua role memiliki launcher UI utama.
- Jika suatu aksi tidak terlihat di file yang saya baca, saya tulis sebagai `belum terlihat diekspos jelas di UI yang dibaca`.
- Akses final tetap ditentukan backend, bukan hanya tampilan frontend.

## 1. SUPERADMIN

### Tujuan peran

- Mengelola platform secara keseluruhan.
- Menjadi role paling tinggi untuk tenant dan user lintas tenant.
- Menangani setup tenant, user target tenant, dan kontrol platform reserved role.

### SOP harian

1. Login ke platform.
2. Cek homepage untuk melihat banner dan summary.
3. Masuk ke `Superadmin Tenants` untuk melihat status tenant platform.
4. Jika perlu, buat tenant baru.
5. Jika perlu, pilih tenant target untuk pengelolaan user.
6. Buka `Admin Users` untuk create user atau assign role pada tenant target.
7. Gunakan `Admin Departments`, `Admin Locations`, `Admin Identities`, `Admin Asset Types`, dan `Admin Lifecycle States` untuk memastikan master data siap.
8. Monitoring dashboard dan reports untuk melihat kondisi operasional tenant.

### Area yang paling relevan

- Superadmin tenants.
- Admin users lintas tenant target.
- Semua master data tenant.
- Monitoring subscription health dan contract health.

### SOP detail

- Saat membuat tenant baru, pastikan:
  - `code` unik.
  - `name` jelas.
  - `status_code` sesuai.
  - `plan_code` dipilih.
  - `contract_start_date` dan `contract_end_date` diisi.
  - `subscription_notes` ditulis jika perlu.
- Saat memilih tenant target di admin users:
  - pastikan tenant target sudah benar sebelum create user.
  - periksa apakah user platform-managed ada di daftar.
- Saat mengubah role:
  - cek apakah role termasuk reserved platform role.
  - jangan hapus role terakhir user.

### Risiko dan perhatian

- Kesalahan tenant target adalah risiko paling besar.
- Role platform-managed hanya boleh diubah oleh superadmin.
- Perubahan tenant berdampak luas ke semua modul tenant tersebut.

## 2. TENANT_ADMIN

### Tujuan peran

- Admin operasional tenant.
- Mengelola master data tenant dan user tenant.
- Menangani hampir semua workflow bisnis utama.

### SOP harian

1. Login ke tenant.
2. Cek dashboard untuk melihat summary, approval queue, dan status kontrak tenant.
3. Buka `Assets` untuk cek aset baru, lifecycle, dan ownership.
4. Buka `Approvals` untuk memproses permintaan persetujuan.
5. Buka `Documents` untuk review dan publish dokumen.
6. Buka `Evidence` untuk upload atau verifikasi file bukti.
7. Buka `Contracts` dan `Vendors` untuk monitoring vendor dan kontrak.
8. Buka `Governance Scope`, `Context`, dan `Stakeholders` untuk update register.
9. Jika perlu, buka `KPI Workspace`.
10. Kelola user tenant dan master data tenant melalui admin pages.

### Area yang paling relevan

- Assets, approvals, documents, evidence.
- Contracts, vendors, software products.
- Governance scope/context/stakeholders.
- KPI.
- Admin users dan master data tenant.

### SOP detail

- Saat membuat asset:
  - pilih asset type yang tepat.
  - pilih lifecycle state awal.
  - isi coverage yang sesuai dengan asset type.
- Saat memproses approval:
  - baca action code dan subject type dulu.
  - cek payload yang menunjukkan origin dan target.
- Saat mengelola contract:
  - pilih vendor aktif.
  - tentukan start/end date.
  - cek contract health setelah contract dibuat.
- Saat mengelola KPI:
  - pastikan KPI library konsisten dengan scorecard yang dipantau.
  - gunakan measurement capture untuk update nilai aktual.
- Saat mengelola user:
  - pastikan role yang diberikan sesuai job function.
  - jangan menghapus akses yang masih diperlukan untuk workflow.

### Risiko dan perhatian

- Tenant admin biasanya punya akses luas, jadi perlu disiplin perubahan.
- Salah konfigurasi master data bisa berdampak ke banyak modul downstream.

## 3. ITAM_MANAGER

### Tujuan peran

- Role operasional inti ITAM.
- Biasanya jadi penggerak utama aset, workflow, evidence, governance, dan monitoring.

### SOP harian

1. Login dan cek dashboard.
2. Review assets yang baru dibuat atau berubah state.
3. Proses approvals jika ada task yang masuk.
4. Update ownership atau lifecycle bila diperlukan.
5. Upload atau attach evidence yang mendukung aktivitas operasional.
6. Buka contracts, vendors, dan software products untuk sinkronisasi data.
7. Cek governance scope/context/stakeholders.
8. Cek KPI Workspace untuk monitoring performa.
9. Buka reports bila perlu mencari gap coverage atau mapping.

### Area yang paling relevan

- Assets.
- Approvals.
- Documents.
- Evidence.
- Contracts.
- Vendors.
- Software products.
- Governance.
- KPI.
- Reports.

### SOP detail

- Untuk asset:
  - pastikan status, ownership, dan coverage tetap konsisten.
  - cek apakah transition tertentu memerlukan approval.
- Untuk evidence:
  - pastikan file yang diupload relevan dengan objek bisnis.
  - gunakan attachment yang tepat agar audit trail jelas.
- Untuk contracts:
  - cek contract health, expiry, dan renewal notice.
- Untuk software:
  - cek publisher, product, installation, assignment, entitlement, dan allocation secara berurutan.
- Untuk governance dan KPI:
  - gunakan scope dan context sebagai basis pengukuran.
  - pastikan KPI measurement tidak tertinggal.

### Risiko dan perhatian

- ITAM manager sering menjadi titik pusat perubahan data lintas modul.
- Salah update ownership atau contract relation bisa memengaruhi report dan compliance.

## 4. PROCUREMENT_CONTRACT_MANAGER

### Tujuan peran

- Fokus pada vendor, kontrak, entitlement, allocation, dan approval yang berkaitan dengan procurement.

### SOP harian

1. Login.
2. Cek dashboard dan contract alert.
3. Buka `Vendors` untuk melihat vendor aktif/inaktif.
4. Buka `Contracts` untuk memantau masa berlaku kontrak.
5. Buka `Approvals` bila ada keputusan yang terkait procurement.
6. Buka `Software Products` dan `Contracts` untuk memastikan entitlement sesuai pembelian.
7. Cek `Reports` untuk coverage dan mapping yang berhubungan dengan kontrak.

### Area yang paling relevan

- Vendors.
- Contracts.
- Software entitlements.
- Entitlement allocations.
- Approvals.
- Reports.

### SOP detail

- Saat membuat vendor:
  - pastikan vendor code unik.
  - isi primary contact jika tersedia.
- Saat membuat contract:
  - pastikan vendor aktif.
  - isi end date agar health bisa dihitung.
  - isi renewal notice days sesuai kebijakan.
- Saat membuat entitlement:
  - pastikan contract dan product sudah benar.
  - quantity purchased masuk akal.
- Saat alokasi entitlement:
  - pilih basis alokasi yang sesuai.
  - cek apakah allocation mengacu ke asset, installation, atau assignment yang valid.

### Risiko dan perhatian

- Kesalahan kontrak akan mengganggu health dashboard dan laporan coverage.
- Allocation yang salah bisa memengaruhi kepatuhan lisensi.

## 5. SECURITY_OFFICER

### Tujuan peran

- Fokus pada kontrol keamanan, evidence, dan pemeriksaan area yang sensitif.

### Status di codebase

- Role ini ada di seed role.
- Dari UI yang saya baca, belum terlihat sebagai launcher utama yang kuat.
- Kemungkinan dipakai di workflow API tertentu atau di sisi operasional internal.

### SOP yang disarankan berdasarkan modul yang ada

1. Login.
2. Review audit events bila diberikan akses baca.
3. Review evidence yang berkaitan dengan kontrol keamanan.
4. Review documents dan approvals yang berisi bukti kepatuhan.
5. Review governance context dan stakeholder untuk risiko dan kontrol.
6. Review reports yang menunjukkan coverage atau mapping gap.

### Area yang paling relevan

- Evidence.
- Audit events.
- Governance context.
- Governance stakeholders.
- Reports.
- Documents.

### Risiko dan perhatian

- Jika role ini nanti dipakai lebih aktif, sebaiknya ditambahkan launcher dan gate yang eksplisit di UI.
- Saat ini, beberapa akses kemungkinan masih hidden atau belum diekspos penuh di frontend.

## 6. ASSET_CUSTODIAN

### Tujuan peran

- Fokus pada aset yang dititipkan, diperbarui, atau perlu evidence pendukung.

### SOP harian

1. Login.
2. Buka assets untuk melihat aset yang berada dalam tanggung jawabnya.
3. Update ownership atau cek status aset bila diberi hak.
4. Upload evidence untuk mendukung kondisi aset.
5. Cek approvals yang berkaitan dengan perubahan aset.
6. Cek reports bila perlu melihat coverage atau mapping terkait aset tersebut.

### Area yang paling relevan

- Assets.
- Evidence.
- Approvals.
- Reports.

### SOP detail

- Saat bekerja dengan asset:
  - pastikan data fisik/operasional cocok dengan data registri.
  - cek lokasi dan custodian bila berubah.
- Saat upload evidence:
  - gunakan file yang relevan dengan aset.
  - pastikan file tidak duplikatif tanpa alasan.
- Saat mengikuti approval:
  - pastikan approval tersebut memang terkait aset yang dipegang.

### Risiko dan perhatian

- Akses custodian biasanya spesifik dan tidak seluas admin tenant.
- Perubahan yang dilakukan harus terdokumentasi dengan jelas agar audit trail kuat.

## 7. SERVICE_DESK_OPERATOR

### Tujuan peran

- Mendukung operasional harian, biasanya terkait insiden, request, atau data pendukung.

### Status di codebase

- Role ini ada di seed role.
- Dari file yang saya baca, belum terlihat launcher utama atau gate UI yang sangat spesifik untuk role ini.

### SOP yang disarankan berdasarkan modul yang ada

1. Login.
2. Cek dashboard untuk konteks operasional.
3. Cari aset atau dokumen yang relevan untuk membantu request.
4. Gunakan evidence dan approvals bila diminta sebagai bukti pendukung.
5. Eskalasi ke tenant admin atau ITAM manager jika butuh perubahan master data atau keputusan workflow.

### Area yang paling relevan

- Assets.
- Documents.
- Evidence.
- Approvals.

### Risiko dan perhatian

- Jika role ini dipakai lebih aktif, perlu ditentukan batas aksi yang jelas agar tidak overlap dengan ITAM manager.

## 8. AUDITOR

### Tujuan peran

- Fokus pada review, verifikasi, dan pemeriksaan tanpa banyak tindakan perubahan.

### SOP harian

1. Login.
2. Review dashboard untuk memahami kondisi umum tenant.
3. Buka audit events untuk memeriksa jejak perubahan.
4. Buka reports untuk asset coverage dan asset mapping.
5. Buka governance scope/context/stakeholders untuk memahami konteks kontrol.
6. Buka contracts, vendors, dan evidence bila perlu verifikasi silang.
7. Buka KPI scorecard untuk melihat performa dan konsistensi target vs actual.

### Area yang paling relevan

- Audit events.
- Reports.
- Governance.
- Contracts.
- Evidence.
- KPI scorecard.
- Read-only view ke banyak modul lain.

### SOP detail

- Saat audit:
  - mulai dari audit trail.
  - lanjut ke report agregat.
  - baru verifikasi ke detail module jika ada gap.
- Saat membaca KPI:
  - fokus pada status `CRITICAL`, `WARNING`, dan `MISSING`.
- Saat membaca governance:
  - cek apakah scope yang aktif masuk akal untuk kondisi tenant.

### Risiko dan perhatian

- Auditor idealnya tidak mengubah data master kecuali ada proses resmi.
- Banyak halaman auditor lebih cocok dipakai sebagai evidence gathering daripada editing.

## 9. INTEGRATION_USER

### Tujuan peran

- Dipakai untuk integrasi sistem atau workflow otomatis.

### Status di codebase

- Role ini ada di seed role.
- Dari UI yang saya baca, belum terlihat launcher utama yang mengarahkan role ini ke halaman khusus.

### SOP yang disarankan berdasarkan codebase

1. Login melalui mekanisme yang disediakan platform.
2. Gunakan endpoint API yang memang disiapkan untuk integrasi.
3. Pastikan request mengikuti tenant context dan auth cookie/JWT yang benar.
4. Hindari alur UI manual jika role ini memang ditujukan untuk machine-to-machine usage.

### Area yang paling relevan

- Endpoint API.
- Data sinkronisasi.
- Automasi workflow yang tidak selalu terlihat di UI.

### Risiko dan perhatian

- Role ini paling berisiko jika dipakai tanpa definisi scope yang jelas.
- Karena belum banyak diekspos di UI yang saya baca, sebaiknya penggunaan role ini didokumentasikan lebih lanjut bila sudah ada workflow khusus.

## 10. SOP Umum Semua Role

Apa pun role-nya, urutan kerja yang aman biasanya sama:

1. Login.
2. Cek tenant context di header atau badge user.
3. Cek halaman home/dashboard untuk melihat kondisi sistem.
4. Masuk ke modul yang relevan.
5. Gunakan filter dan page size sesuai kebutuhan.
6. Baca status dan health sebelum create/update apa pun.
7. Gunakan approval dan evidence bila workflow memang membutuhkannya.
8. Tutup perubahan dengan audit trail yang jelas.

## 11. Aturan Praktis Operasional

- Jangan menganggap semua role punya akses create/update walaupun module-nya bisa dilihat.
- Jangan mengubah tenant target tanpa memastikan konteks login.
- Jangan update master data tanpa memahami efeknya ke asset, contract, report, dan KPI.
- Jangan mengirim evidence tanpa validasi objek yang dituju.
- Jangan membuat KPI atau scope version tanpa memastikan period dan labelnya konsisten.

## 12. Ringkasan Cepat Role

- `SUPERADMIN`: platform, tenant, user target tenant.
- `TENANT_ADMIN`: admin tenant dan workflow operasional luas.
- `ITAM_MANAGER`: operasi ITAM inti.
- `PROCUREMENT_CONTRACT_MANAGER`: vendor, contract, entitlement, allocation.
- `SECURITY_OFFICER`: kontrol dan verifikasi keamanan.
- `ASSET_CUSTODIAN`: tanggung jawab aset dan evidence.
- `SERVICE_DESK_OPERATOR`: dukungan operasional dan eskalasi.
- `AUDITOR`: verifikasi, review, dan audit trail.
- `INTEGRATION_USER`: automasi dan integrasi sistem.

## 13. Penutup

Dokumen ini sengaja ditulis detail supaya kamu bisa menjadikannya:

- SOP internal,
- bahan onboarding,
- atau referensi pembacaan source code per role.

Kalau kamu mau, saya bisa lanjut membuat versi berikutnya:

- versi tabel ringkas per role,
- versi flowchart per role,
- atau versi SOP langkah demi langkah per halaman UI.
