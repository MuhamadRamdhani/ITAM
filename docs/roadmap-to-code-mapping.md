# Mapping Roadmap ke Kode

Dokumen ini menunjukkan bagaimana roadmap MVP ITAM SaaS kamu sudah tercermin di codebase saat ini, mana yang sudah matang, mana yang baru sebagian, dan mana yang belum terlihat sebagai modul penuh.

## Ringkasan Status

- `DONE` = fitur inti sudah terlihat nyata di backend/frontend.
- `PARTIAL` = fondasi ada, tetapi workflow penuh belum lengkap.
- `NOT SEEN` = belum terlihat sebagai modul yang terimplementasi di repo.

## MVP 0 - Identity, Multi-tenant Access, Admin Baseline

| Area | Status | Bukti di Kode |
|---|---:|---|
| Login / logout / me / refresh | DONE | `apps/api/src/modules/auth/auth.routes.js`, `apps/api/src/modules/auth/auth.service.js`, `apps/web/app/login/page.tsx`, `apps/web/app/lib/api.ts`, `apps/web/app/components/AuthGuard.tsx` |
| Cookie-based auth + auto refresh | DONE | `apps/web/app/lib/api.ts`, `apps/web/app/components/LogoutButton.tsx` |
| Tenant scoping / request context | DONE | `apps/api/src/app.js` dan modul context/tenant bootstrap yang dipakai server |
| Multi-role user model | DONE | `apps/api/src/modules/iam/routes.js`, `apps/api/src/modules/iam/iam.service.js`, `apps/web/app/admin/users/AdminUsersClient.tsx` |
| Superadmin tenant management | DONE | `apps/api/src/modules/superadmin/routes.js`, `apps/api/src/modules/superadmin/superadmin.service.js`, `apps/web/app/superadmin/tenants/SuperadminTenantsClient.tsx`, `apps/web/app/components/SuperadminTenantsLauncher.tsx` |
| Tenant subscription monitoring | PARTIAL | `apps/web/app/components/TenantSubscriptionBanner.tsx`, `apps/web/app/superadmin/tenants/[id]/SuperadminTenantDetailClient.tsx` |
| Tenant admin baseline master data | DONE | `apps/api/src/modules/departments/routes.js`, `apps/api/src/modules/locations/routes.js`, `apps/api/src/modules/identities/routes.js`, `apps/api/src/modules/masterdata/routes.js`, `apps/web/app/admin/departments/AdminDepartmentsClient.tsx`, `apps/web/app/admin/locations/AdminLocationsClient.tsx`, `apps/web/app/admin/identities/AdminIdentitiesClient.tsx`, `apps/web/app/admin/lifecycle-states/AdminLifecycleStatesClient.tsx`, `apps/web/app/admin/asset-types/AdminAssetTypesClient.tsx` |

## MVP 1 - Core ITAM + Audit-ready Baseline

| Area | Status | Bukti di Kode |
|---|---:|---|
| Asset registry core | DONE | `apps/api/src/modules/assets/assets.routes.js`, `apps/api/src/modules/assets/assets.service.js`, `apps/api/src/modules/assets/assets.schemas.js`, `apps/web/app/assets/AssetsClient.tsx`, `apps/web/app/assets/AssetsFilters.tsx`, `apps/web/app/assets/new/page.tsx`, `apps/web/app/assets/[id]/AssetDetailClient.tsx` |
| Asset detail / edit | DONE | `apps/web/app/assets/[id]/edit/page.tsx` |
| Ownership traceability | DONE | `apps/api/src/modules/ownership/routes.js`, `apps/api/src/modules/ownership/ownership.service.js`, `apps/web/app/assets/[id]/OwnershipPanel.tsx` |
| Lifecycle transitions | DONE | `apps/api/src/modules/lifecycle/routes.js`, `apps/api/src/modules/lifecycle/lifecycle.service.js`, `apps/web/app/assets/[id]/LifecyclePanel.tsx` |
| Approvals queue | DONE | `apps/api/src/modules/approvals/approvals.routes.js`, `apps/api/src/modules/approvals/approvals.service.js`, `apps/web/app/approvals/ApprovalsPageClient.tsx`, `apps/web/app/approvals/[id]/ApprovalDecisionPanel.tsx`, `apps/web/app/assets/[id]/ApprovalsPanel.tsx` |
| Documents repository + workflow | DONE | `apps/api/src/modules/documents/documents.routes.js`, `apps/api/src/modules/documents/documents.service.js`, `apps/web/app/documents/DocumentsPageClient.tsx`, `apps/web/app/documents/new/NewDocumentForm.tsx`, `apps/web/app/documents/[id]/DocumentDetailClient.tsx`, `apps/web/app/documents/[id]/AddVersionPanel.tsx`, `apps/web/app/documents/[id]/DocumentActionsPanel.tsx` |
| Evidence upload + attachment | DONE | `apps/api/src/modules/evidence/evidence.routes.js`, `apps/api/src/modules/evidence/evidence.service.js`, `apps/web/app/evidence/EvidencePageClient.tsx`, `apps/web/app/evidence/upload/uploadEvidenceForm.tsx`, `apps/web/app/assets/[id]/_componets/AssetEvidenceTab.tsx`, `apps/web/app/assets/[id]/_componets/evidenceAttachForm.tsx` |
| Governance clause 4 | DONE | `apps/api/src/modules/governance/scope.routes.js`, `apps/api/src/modules/governance/context.routes.js`, `apps/api/src/modules/governance/stakeholders.routes.js`, `apps/web/app/governance/scope/ScopeVersionsPageClient.tsx`, `apps/web/app/governance/context/ContextRegisterPageClient.tsx`, `apps/web/app/governance/stakeholders/StakeholdersRegisterPageClient.tsx` |
| Dashboard minimal | DONE | `apps/api/src/modules/dashboard/dashboard.routes.js`, `apps/api/src/modules/dashboard/dashboard.service.js`, `apps/web/app/page.tsx`, `apps/web/app/components/DashboardSummaryCards.tsx` |
| Audit trail viewer | DONE | `apps/api/src/modules/audit-events/audit-events.routes.js`, `apps/api/src/modules/audit-events/audit-events.service.js`, `apps/web/app/audit-events/AuditEventsPageClient.tsx` |
| UX hardening | DONE | `apps/web/app/components/GlobalLoadingProvider.tsx`, `apps/web/app/components/useGlobalLoadingAction.ts`, `apps/web/app/lib/useRequest.ts` |
| Asset validity data at instance level | DONE | validasi coverage/coverage-date di jalur asset dan form edit asset, bukan hanya di master asset type |

## MVP 2 - Commercial ITAM Operations

| Area | Status | Bukti di Kode |
|---|---:|---|
| Vendors | DONE | `apps/api/src/modules/vendors/routes.js`, `apps/api/src/modules/vendors/vendors.service.js`, `apps/web/app/vendors/VendorsClient.tsx`, `apps/web/app/vendors/[id]/VendorDetailClient.tsx` |
| Contracts | DONE | `apps/api/src/modules/contracts/routes.js`, `apps/api/src/modules/contracts/contracts.service.js`, `apps/api/src/modules/contracts/contracts.relations.service.js`, `apps/web/app/contracts/ContractsClient.tsx`, `apps/web/app/contracts/[id]/ContractDetailClient.tsx` |
| Contract health / expiry visibility | PARTIAL | `apps/web/app/contracts/[id]/ContractDetailClient.tsx` dan modul contracts repo/service, namun perlu dipastikan konsistensi badge/renewal UX di semua layar |
| Software products | DONE | `apps/api/src/modules/software-products/routes.js`, `apps/api/src/modules/software-products/software-products.service.js`, `apps/web/app/software-products/SoftwareProductsClient.tsx`, `apps/web/app/software-products/[id]/SoftwareProductDetailClient.tsx` |
| Software installations | DONE | `apps/api/src/modules/software-installations/routes.js`, `apps/api/src/modules/software-installations/software-installations.service.js`, `apps/web/app/assets/[id]/SoftwareInstallationsPanel.tsx` |
| Software assignments | DONE | `apps/api/src/modules/software-assignments/routes.js`, `apps/api/src/modules/software-assignments/software-assignments.service.js`, `apps/web/app/assets/[id]/SoftwareAssignmentsModal.tsx` |
| Software entitlements | DONE | `apps/api/src/modules/software-entitlements/routes.js`, `apps/api/src/modules/software-entitlements/software-entitlements.service.js`, `apps/web/app/assets/[id]/SoftwareEntitlementsPanel.tsx`, `apps/web/app/contracts/[id]/SoftwareEntitlementsPanel.tsx` |
| Entitlement allocations | DONE | `apps/api/src/modules/software-entitlement-allocations/routes.js`, `apps/api/src/modules/software-entitlement-allocations/software-entitlement-allocations.service.js`, `apps/web/app/contracts/[id]/SoftwareEntitlementAllocationsModal.tsx` |
| Asset transfer / cross-tenant transfer | DONE | `apps/api/src/modules/asset-transfer/asset-transfer.routes.js`, `apps/api/src/modules/asset-transfer/asset-transfer.service.js`, `apps/api/src/modules/asset-transfer/asset-transfer.access.js`, `apps/web/app/asset-transfer-requests/AssetTransferRequestsClient.tsx`, `apps/web/app/asset-transfer-requests/new/AssetTransferRequestCreateClient.tsx`, `apps/web/app/asset-transfer-requests/[id]/AssetTransferRequestDetailClient.tsx` |
| Consumption + ELP snapshot | NOT SEEN | belum terlihat sebagai modul penuh dengan snapshot/compliance engine yang dedicated |
| Optimization / reclaim suggestion | NOT SEEN | belum terlihat sebagai workflow formal terpisah |

## MVP 3 - Performance Evaluation, Audit, Management Review, CAPA

| Area | Status | Bukti di Kode |
|---|---:|---|
| KPI library | DONE | `apps/api/src/modules/kpi/kpi.routes.js`, `apps/api/src/modules/kpi/kpi.service.js`, `apps/api/src/modules/kpi/kpi.repo.js`, `apps/web/app/kpis/KpisClient.tsx`, `apps/web/app/kpis/[id]/KpiDetailClient.tsx` |
| KPI scorecard | DONE | `apps/web/app/kpi-scorecard/KpiScorecardClient.tsx`, `apps/web/app/lib/kpi.ts` |
| KPI trend / measurement | DONE | `apps/api/src/modules/kpi/kpi.routes.js`, helper logic di `apps/web/app/lib/kpi.ts` |
| Internal audit module | PARTIAL | `apps/api/src/modules/internal-audits/internal-audit.routes.js`, `apps/api/src/modules/internal-audits/internal-audit.service.js`, `apps/api/src/modules/internal-audits/internal-audit.repo.js`, `apps/api/src/modules/internal-audits/internal-audit.schemas.js`, `apps/web/app/internal-audits/InternalAuditsClient.tsx`, `apps/web/app/internal-audits/[id]/InternalAuditDetailClient.tsx` |
| Management review | NOT SEEN | belum terlihat sebagai modul dedicated |
| CAPA workflow | NOT SEEN | belum terlihat sebagai modul dedicated |

## Governance Maturity Layer

| Area | Status | Bukti di Kode |
|---|---:|---|
| Policy management | NOT SEEN | belum terlihat sebagai modul formal policy register |
| RACI / authority matrix | PARTIAL | role model dan permission layer ada, tetapi matriks RACI formal belum terlihat sebagai modul bisnis |
| Risk register ITAM | NOT SEEN | belum terlihat sebagai modul dedicated |
| Training matrix | NOT SEEN | belum terlihat sebagai modul dedicated |
| Communication log | NOT SEEN | belum terlihat sebagai modul dedicated |
| Process specification / process map | NOT SEEN | belum terlihat sebagai modul dedicated |

## Integration and Scale Layer

| Area | Status | Bukti di Kode |
|---|---:|---|
| API-first foundation | DONE | seluruh backend API route berbasis module dan REST-style |
| Reconciliation engine | NOT SEEN | belum terlihat sebagai service khusus |
| Discovery / ingestion / connectors | NOT SEEN | belum terlihat sebagai module dedicated |
| SCIM / SSO / webhooks | NOT SEEN | belum terlihat sebagai integrasi formal di repo |
| Async processing / queue-based scale | NOT SEEN | belum terlihat di code yang ada saat ini |
| Evidence export pack | PARTIAL | evidence dan audit data sudah ada, tetapi pack export formal belum terlihat |

## Kesimpulan Teknis

- Roadmap MVP 0 dan MVP 1 sudah sangat selaras dengan codebase yang ada.
- MVP 2 juga sudah mulai nyata, terutama vendor, contracts, software, entitlements, dan asset transfer.
- MVP 3 baru separuh jalan: KPI kuat, internal audit sudah ada dasar, tetapi management review dan CAPA masih belum tampak sebagai modul penuh.
- Governance maturity dan integration/scale masih menjadi ruang terbesar untuk ekspansi berikutnya.

## Rekomendasi Prioritas Lanjutan

- Stabilkan dulu konsistensi API response, enum status, dan audit event format.
- Lengkapi internal audit agar bisa menutup loop ke management review dan CAPA.
- Formalisasikan policy/risk/process register sebelum masuk discovery/optimization besar.
- Kalau targetmu enterprise SaaS yang kuat, lapisan governance maturity harus dikerjakan setelah core ITAM stabil.
