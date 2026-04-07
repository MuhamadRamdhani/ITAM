# Daftar Gap ITAM

Dokumen ini merangkum bagian yang masih kurang, belum matang, atau baru setengah jadi di projek ITAM saat ini. Fokusnya adalah gap yang paling berdampak untuk roadmap, audit-readiness, dan kelayakan SaaS enterprise.

## Ringkasan Singkat

- Core ITAM sudah kuat.
- Gap terbesar ada di governance maturity, improvement loop, dan integration layer.
- Beberapa area sudah ada fondasinya, tetapi belum menjadi workflow bisnis penuh.

## Prioritas P0 - Paling Penting

Ini bagian yang sebaiknya dikerjakan dulu karena paling mempengaruhi kesiapan ISO, audit, dan kontrol operasional.

### 1. CAPA Workflow Hardening

Yang kurang:

- Nonconformity register
- Root cause analysis
- Corrective action
- Preventive action
- Verification
- Closure
- Evidence link ke setiap tahap

Status sekarang:

- Fondasi CAPA sudah mulai ada di codebase.
- Gap tersisa ada pada hardening, linkage lintas modul, dan evidence/export yang lebih formal.

Kenapa penting:

- Ini penutup loop dari internal audit dan management review.
- Tanpa CAPA, sistem belum benar-benar punya siklus improvement yang utuh.

### 2. Risk Register ITAM

Yang kurang:

- Risk list
- Likelihood / impact score
- Risk owner
- Treatment plan
- Due date
- Status follow-up

Kenapa penting:

- Clause planning belum lengkap tanpa risk register.
- Risiko vendor, lisensi, security, dan operational gap perlu terdokumentasi.

### 3. Policy / Standard / Procedure Management

Yang kurang:

- Policy versioning
- Review / approve / publish flow
- Standard dan procedure register
- Acknowledgement user
- Retention informasi dokumen

Kenapa penting:

- Leadership dan support clause butuh documented information yang formal.
- Saat ini dokumen ada, tetapi belum terlihat sebagai governance artifact yang lengkap.

### 4. RACI / Authority Matrix Formal

Yang kurang:

- Matrix siapa boleh create / approve / reject / close
- Authority per proses
- Authority per asset class
- Authority per tenant / role

Kenapa penting:

- Role sudah ada, tetapi RACI formal belum terlihat.
- Ini penting supaya proses audit dan operasional tidak ambigu.

### 5. Change Management Integration

Yang kurang:

- Link aset ke change record
- Change impact tracking
- Extra approval untuk change sensitif
- Traceability dari change ke evidence

Kenapa penting:

- Banyak perubahan ITAM sebenarnya terjadi karena change operasional.
- Tanpa hubungan ini, traceability aset belum lengkap.

## Prioritas P1 - Penting Setelah Core Stabil

Ini fitur yang sangat berguna, tapi idealnya dikerjakan setelah P0 cukup aman.

### 6. Training Matrix dan Awareness Tracking

Yang kurang:

- Role-to-training mapping
- Training completion record
- Expiry sertifikasi atau awareness
- Reminder untuk role kritikal

Kenapa penting:

- Clause support butuh bukti awareness dan competence.

### 7. Communication Log

Yang kurang:

- Notice template
- Broadcast / reminder log
- Distribusi komunikasi governance
- Bukti komunikasi ke stakeholder

Kenapa penting:

- Governance tidak cukup hanya dengan kebijakan.
- Harus ada bukti komunikasi ke user dan stakeholder.

### 8. Process Specification / Process Map

Yang kurang:

- Process owner
- Input / output per proses
- Dependency antar proses
- Definition of done
- Kontrol per proses

Kenapa penting:

- Ini penting untuk membentuk sistem manajemen ITAM yang benar-benar formal.

### 9. Evidence Pack Export

Yang kurang:

- Export bukti per asset / approval / audit / contract / governance item
- Paket PDF / CSV / JSON yang konsisten
- Retention-friendly export

Kenapa penting:

- Saat audit atau review, bukti harus bisa dikumpulkan cepat.

### 10. Data Retention / Legal Hold / Data Residency Controls

Yang kurang:

- Retention policy per artefak
- Legal hold
- Penghapusan atau anonymization terkontrol
- Opsi residency jika nanti dibutuhkan enterprise

Kenapa penting:

- Ini penting untuk maturity SaaS enterprise dan compliance jangka panjang.

## Prioritas P2 - Advanced / Scale Layer

Bagian ini bukan paling mendesak, tapi penting untuk produk yang ingin naik kelas.

### 11. Discovery, Ingestion, dan Connector Layer

Yang kurang:

- CSV import formal yang lebih besar
- API ingestion layer
- Connector ke endpoint / MDM / cloud inventory
- Normalisasi dan deduplikasi otomatis

Kenapa penting:

- Tanpa discovery, data masih sangat bergantung pada input manual.

### 12. Reconciliation Engine

Yang kurang:

- Conflict resolution
- Confidence score
- Matching ke sumber lain
- Reconciliation dengan CMDB / finance / inventory eksternal

Kenapa penting:

- Ini diperlukan kalau data sudah berasal dari banyak sumber.

### 13. SSO / SCIM / Webhooks

Yang kurang:

- SSO enterprise
- SCIM provisioning
- Webhooks untuk integrasi
- Lifecycle event yang bisa dikonsumsi sistem lain

Kenapa penting:

- Ini akan sangat penting kalau produk diposisikan sebagai SaaS enterprise.

### 14. Consumption Optimization yang Lebih Canggih

Yang kurang:

- ELP snapshot yang lebih matang
- Reclaim suggestion
- Unused seat detection yang lebih akurat
- Renewal optimization

Kenapa penting:

- Saat ini fondasi consumption sudah mulai ada, tetapi optimization layer masih bisa diperkuat.

### 15. Async Processing dan Scale Hardening

Yang kurang:

- Queue-based job processing
- Batch worker
- Async export / import
- Monitoring job failure

Kenapa penting:

- Dibutuhkan kalau volume data dan pengguna naik.

## Area Yang Sudah Ada Tetapi Masih Perlu Diperkuat

Ini bukan gap kosong, tetapi masih perlu penguatan agar lebih matang.

- Internal audit: sudah ada, tetapi masih perlu dihubungkan lebih formal ke CAPA.
- Management review: sudah ada, tetapi perlu dipastikan alur keputusan dan action tracking benar-benar lengkap.
- Consumption / ELP: sudah mulai ada di kontrak, tetapi masih perlu dipertegas sebagai modul compliance penuh.
- Tenant subscription monitoring: sudah ada fondasi, tetapi belum menjadi workflow subscription management yang utuh.

## Kesimpulan Praktis

Kalau targetmu adalah ITAM SaaS yang kuat dan selaras ISO/IEC 19770-1, maka urutan pengerjaan paling sehat adalah:

1. CAPA
2. Risk register
3. Policy / procedure management
4. RACI formal
5. Change management integration
6. Training matrix dan communication log
7. Evidence pack export
8. Discovery / ingestion / reconciliation
9. SSO / SCIM / webhooks
10. Optimization dan scale hardening

## Catatan

Daftar ini disusun dari struktur repo dan modul yang sudah ada di codebase saat ini. Kalau kamu mau, daftar ini bisa saya ubah lagi menjadi:

- tabel prioritas `P0 / P1 / P2`
- backlog sprint
- atau checklist per module owner
