"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatchJson, apiPostJson } from "@/app/lib/api";
import { ErrorState } from "@/app/lib/loadingComponents";
import SoftwareEntitlementsPanel from "./SoftwareEntitlementsPanel";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ||
  "http://localhost:3001";

type VendorItem = {
  id: number | string;
  tenant_id: number | string;
  vendor_code: string;
  vendor_name: string;
  vendor_type: string;
  status: string;
};

type ContractDetail = {
  id: number | string;
  tenant_id: number | string;
  vendor_id: number | string;
  contract_code: string;
  contract_name: string;
  contract_type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  renewal_notice_days: number;
  owner_identity_id: number | string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vendor_code?: string;
  vendor_name?: string;
  contract_health?: string;
  days_to_expiry?: number | null;
};

type ContractDetailResponse = {
  ok: boolean;
  data?: ContractDetail;
};

type VendorsListData = {
  total: number;
  items: VendorItem[];
};

type DocumentListItem = {
  id: number | string;
  tenant_id: number | string;
  doc_type_code: string;
  title: string;
  status_code: string;
  current_version: number;
  created_at: string;
  updated_at: string;
};

type ContractDocumentLink = {
  id: number | string;
  tenant_id: number | string;
  contract_id: number | string;
  document_id: number | string;
  note: string | null;
  created_by_identity_id: number | string | null;
  created_at: string;
  document: {
    id: number | string;
    doc_type_code: string;
    title: string;
    status_code: string;
    current_version: number;
    updated_at: string;
  };
};

type EvidenceFileItem = {
  id: number | string;
  tenant_id: number | string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  uploaded_by_identity_id: number | string | null;
  created_at: string;
};

type ContractEvidenceLink = {
  id: number | string;
  tenant_id: number | string;
  target_type: string;
  target_id: number | string;
  evidence_file_id: number | string;
  note: string | null;
  created_by_identity_id: number | string | null;
  created_at: string;
  file: {
    id: number | string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    sha256: string | null;
  };
};

type AssetListItem = {
  id: number | string;
  asset_tag: string;
  name: string;
  status?: string | null;
  asset_type?: {
    code?: string;
    label?: string;
  } | null;
  state?: {
    code?: string;
    label?: string;
  } | null;
};

type ContractAssetLink = {
  id: number | string;
  tenant_id: number | string;
  contract_id: number | string;
  asset_id: number | string;
  note: string | null;
  created_by_identity_id: number | string | null;
  created_at: string;
  asset: {
    id: number | string;
    asset_tag: string;
    name: string;
    status: string | null;
    asset_type?: {
      code?: string;
      label?: string;
    } | null;
    state?: {
      code?: string;
      label?: string;
    } | null;
  };
};

const CONTRACT_TYPES = [
  "SOFTWARE",
  "HARDWARE",
  "SERVICE",
  "CLOUD",
  "MAINTENANCE",
  "OTHER",
] as const;

const CONTRACT_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "EXPIRED",
  "TERMINATED",
] as const;

function getErrorMessage(error: unknown, fallback = "Failed to load contract detail") {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;

  const e = error as any;
  return e?.error?.message || e?.message || fallback;
}

function fmtDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function fmtDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function fmtBytes(size?: number | null) {
  const n = Number(size ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function statusPill(status: string) {
  const s = String(status ?? "").toUpperCase();
  if (s === "DRAFT") return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-800";
  if (s === "ACTIVE") return "rounded-full bg-green-50 px-2 py-1 text-xs text-green-800";
  if (s === "EXPIRED") return "rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-800";
  if (s === "TERMINATED") return "rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700";
  return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
}

function healthPill(health: string) {
  const s = String(health ?? "").toUpperCase();
  if (s === "ACTIVE") return "rounded-full bg-green-50 px-2 py-1 text-xs text-green-800";
  if (s === "EXPIRING") return "rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800";
  if (s === "EXPIRED") return "rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-800";
  if (s === "NO_END_DATE") return "rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700";
  return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
}

function documentStatusPill(status: string) {
  const s = String(status ?? "").toUpperCase();
  if (s === "DRAFT") return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-800";
  if (s === "IN_REVIEW") return "rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800";
  if (s === "APPROVED") return "rounded-full bg-green-50 px-2 py-1 text-xs text-green-800";
  if (s === "PUBLISHED") return "rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-800";
  if (s === "ARCHIVED") return "rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700";
  return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
}

function normalizeVendorsList(res: any): VendorsListData {
  const raw = res?.data?.data ?? res?.data ?? {};
  return {
    total: Number(raw?.total ?? 0),
    items: Array.isArray(raw?.items) ? raw.items : [],
  };
}

function normalizeDocumentsList(res: any): DocumentListItem[] {
  const raw = res?.data?.data ?? res?.data ?? {};
  return Array.isArray(raw?.items) ? raw.items : [];
}

function normalizeContractDocumentsList(res: any): ContractDocumentLink[] {
  const raw = res?.data?.data ?? res?.data ?? {};
  return Array.isArray(raw?.items) ? raw.items : [];
}

function normalizeEvidenceFilesList(res: any): EvidenceFileItem[] {
  const raw = res?.data?.data ?? res?.data ?? {};
  return Array.isArray(raw?.items) ? raw.items : [];
}

function normalizeContractEvidenceList(res: any): ContractEvidenceLink[] {
  const raw = res?.data?.data ?? res?.data ?? {};
  return Array.isArray(raw?.items) ? raw.items : [];
}

function normalizeAssetsList(res: any): AssetListItem[] {
  const raw = res?.data?.data ?? res?.data ?? {};
  return Array.isArray(raw?.items) ? raw.items : [];
}

function normalizeContractAssetsList(res: any): ContractAssetLink[] {
  const raw = res?.data?.data ?? res?.data ?? {};
  return Array.isArray(raw?.items) ? raw.items : [];
}

async function parseJsonSafe(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function apiDelete(path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    credentials: "include",
  });

  const json = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(json?.error?.message || json?.message || "Request failed");
  }

  return json;
}

export default function ContractDetailClient(props: { contractId: string }) {
  const contractIdNum = useMemo(() => Number(props.contractId), [props.contractId]);

  const [loading, setLoading] = useState(true);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [saving, setSaving] = useState(false);

  const [loadingRelations, setLoadingRelations] = useState(true);
  const [loadingAssetsCatalog, setLoadingAssetsCatalog] = useState(false);

  const [linkingDocument, setLinkingDocument] = useState(false);
  const [unlinkingDocumentId, setUnlinkingDocumentId] = useState<string | number | null>(null);

  const [linkingAsset, setLinkingAsset] = useState(false);
  const [unlinkingAssetId, setUnlinkingAssetId] = useState<string | number | null>(null);

  const [linkingEvidence, setLinkingEvidence] = useState(false);
  const [unlinkingEvidenceLinkId, setUnlinkingEvidenceLinkId] = useState<string | number | null>(null);

  const [showCreateDocument, setShowCreateDocument] = useState(false);
  const [creatingDocument, setCreatingDocument] = useState(false);

  const [showUploadEvidence, setShowUploadEvidence] = useState(false);
  const [uploadingEvidenceFile, setUploadingEvidenceFile] = useState(false);
  const [uploadEvidenceInputKey, setUploadEvidenceInputKey] = useState(0);

  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [vendors, setVendors] = useState<VendorItem[]>([]);

  const [availableDocuments, setAvailableDocuments] = useState<DocumentListItem[]>([]);
  const [relatedDocuments, setRelatedDocuments] = useState<ContractDocumentLink[]>([]);

  const [assetSearch, setAssetSearch] = useState("");
  const [availableAssets, setAvailableAssets] = useState<AssetListItem[]>([]);
  const [relatedAssets, setRelatedAssets] = useState<ContractAssetLink[]>([]);

  const [availableEvidenceFiles, setAvailableEvidenceFiles] = useState<EvidenceFileItem[]>([]);
  const [relatedEvidence, setRelatedEvidence] = useState<ContractEvidenceLink[]>([]);

  const [form, setForm] = useState({
    vendor_id: "",
    contract_code: "",
    contract_name: "",
    contract_type: "SOFTWARE",
    status: "DRAFT",
    start_date: "",
    end_date: "",
    renewal_notice_days: "30",
    owner_identity_id: "",
    notes: "",
  });

  const [attachDocumentForm, setAttachDocumentForm] = useState({
    document_id: "",
    note: "",
  });

  const [createDocumentForm, setCreateDocumentForm] = useState({
    doc_type_code: "CONTRACT",
    title: "",
    relation_note: "",
  });

  const [attachAssetForm, setAttachAssetForm] = useState({
    asset_id: "",
    note: "",
  });

  const [attachEvidenceForm, setAttachEvidenceForm] = useState({
    evidence_file_id: "",
    note: "",
  });

  const [uploadEvidenceForm, setUploadEvidenceForm] = useState({
    file: null as File | null,
    note: "",
  });

  const loadVendors = useCallback(async () => {
    setLoadingVendors(true);

    try {
      const res = await apiGet<any>("/api/v1/vendors?page=1&page_size=100&status=ACTIVE", {
        loadingKey: "contract_detail_vendors",
      });

      const data = normalizeVendorsList(res);
      setVendors(data.items);
    } catch {
      setVendors([]);
    } finally {
      setLoadingVendors(false);
    }
  }, []);

  const loadDetail = useCallback(async () => {
    if (!Number.isInteger(contractIdNum) || contractIdNum <= 0) {
      setErr("Invalid contract id.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const res = (await apiGet(`/api/v1/contracts/${contractIdNum}`, {
        loadingKey: "contract_detail",
        loadingDelay: 300,
      })) as ContractDetailResponse;

      const row = res?.data || null;
      setDetail(row);

      if (row) {
        setForm({
          vendor_id: String(row.vendor_id ?? ""),
          contract_code: row.contract_code ?? "",
          contract_name: row.contract_name ?? "",
          contract_type: row.contract_type ?? "SOFTWARE",
          status: row.status ?? "DRAFT",
          start_date: row.start_date ? String(row.start_date).slice(0, 10) : "",
          end_date: row.end_date ? String(row.end_date).slice(0, 10) : "",
          renewal_notice_days: String(row.renewal_notice_days ?? 30),
          owner_identity_id:
            row.owner_identity_id == null ? "" : String(row.owner_identity_id),
          notes: row.notes ?? "",
        });
      }
    } catch (error) {
      setErr(getErrorMessage(error));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [contractIdNum]);

  const loadAssetOptions = useCallback(async (q?: string) => {
    setLoadingAssetsCatalog(true);

    try {
      const trimmed = String(q ?? "").trim();
      const query = trimmed ? `?page=1&q=${encodeURIComponent(trimmed)}` : "?page=1";

      const res = await apiGet<any>(`/api/v1/assets${query}`, {
        loadingKey: "contract_related_assets_catalog",
      });

      setAvailableAssets(normalizeAssetsList(res));
    } catch (error) {
      setAvailableAssets([]);
      setErr(getErrorMessage(error, "Failed to load asset options"));
    } finally {
      setLoadingAssetsCatalog(false);
    }
  }, []);

  const loadRelations = useCallback(async () => {
    if (!Number.isInteger(contractIdNum) || contractIdNum <= 0) return;

    setLoadingRelations(true);

    try {
      const [docsRes, relatedDocsRes, relatedAssetsRes, filesRes, relatedEvidenceRes] =
        await Promise.all([
          apiGet<any>("/api/v1/documents?page=1&page_size=10", {
            loadingKey: "contract_related_documents_catalog",
          }),
          apiGet<any>(`/api/v1/contracts/${contractIdNum}/documents?page=1&page_size=10`, {
            loadingKey: "contract_related_documents",
          }),
          apiGet<any>(`/api/v1/contracts/${contractIdNum}/assets?page=1&page_size=10`, {
            loadingKey: "contract_related_assets",
          }),
          apiGet<any>("/api/v1/evidence/files?page=1&page_size=10", {
            loadingKey: "contract_related_evidence_catalog",
          }),
          apiGet<any>(`/api/v1/contracts/${contractIdNum}/evidence?page=1&page_size=10`, {
            loadingKey: "contract_related_evidence",
          }),
        ]);

      setAvailableDocuments(normalizeDocumentsList(docsRes));
      setRelatedDocuments(normalizeContractDocumentsList(relatedDocsRes));
      setRelatedAssets(normalizeContractAssetsList(relatedAssetsRes));
      setAvailableEvidenceFiles(normalizeEvidenceFilesList(filesRes));
      setRelatedEvidence(normalizeContractEvidenceList(relatedEvidenceRes));
    } catch (error) {
      setErr(getErrorMessage(error, "Failed to load related documents/assets/evidence"));
      setAvailableDocuments([]);
      setRelatedDocuments([]);
      setRelatedAssets([]);
      setAvailableEvidenceFiles([]);
      setRelatedEvidence([]);
    } finally {
      setLoadingRelations(false);
    }
  }, [contractIdNum]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    void loadVendors();
  }, [loadVendors]);

  useEffect(() => {
    void loadRelations();
  }, [loadRelations]);

  useEffect(() => {
    void loadAssetOptions("");
  }, [loadAssetOptions]);

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!detail) return;

    setSaving(true);
    setErr(null);
    setSuccess(null);

    try {
      const payload = {
        vendor_id: Number(form.vendor_id),
        contract_code: form.contract_code.trim(),
        contract_name: form.contract_name.trim(),
        contract_type: form.contract_type,
        status: form.status,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        renewal_notice_days: Number(form.renewal_notice_days || 0),
        owner_identity_id: form.owner_identity_id
          ? Number(form.owner_identity_id)
          : null,
        notes: form.notes.trim() || null,
      };

      await apiPatchJson(`/api/v1/contracts/${detail.id}`, payload);
      setSuccess("Perubahan kontrak berhasil disimpan.");
      await loadDetail();
    } catch (error) {
      setErr(getErrorMessage(error, "Failed to update contract"));
    } finally {
      setSaving(false);
    }
  }

  async function onAttachDocument(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!detail || !attachDocumentForm.document_id) return;

    setLinkingDocument(true);
    setErr(null);
    setSuccess(null);

    try {
      await apiPostJson(`/api/v1/contracts/${detail.id}/documents`, {
        document_id: Number(attachDocumentForm.document_id),
        note: attachDocumentForm.note.trim() || null,
      });

      setAttachDocumentForm({ document_id: "", note: "" });
      setSuccess("Document berhasil dihubungkan ke contract.");
      await loadRelations();
    } catch (error) {
      setErr(getErrorMessage(error, "Failed to attach document"));
    } finally {
      setLinkingDocument(false);
    }
  }

  async function onCreateAndAttachDocument(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!detail) return;

    setCreatingDocument(true);
    setErr(null);
    setSuccess(null);

    try {
      const createRes = (await apiPostJson("/api/v1/documents", {
        doc_type_code: createDocumentForm.doc_type_code.trim(),
        title: createDocumentForm.title.trim(),
        content_json: {},
      })) as any;

      const documentId = Number(createRes?.data?.document?.id);
      if (!Number.isInteger(documentId) || documentId <= 0) {
        throw new Error("Created document id not found");
      }

      await apiPostJson(`/api/v1/contracts/${detail.id}/documents`, {
        document_id: documentId,
        note: createDocumentForm.relation_note.trim() || null,
      });

      setCreateDocumentForm({
        doc_type_code: "CONTRACT",
        title: "",
        relation_note: "",
      });
      setShowCreateDocument(false);

      setSuccess("Document baru berhasil dibuat dan langsung dihubungkan ke contract.");
      await loadRelations();
    } catch (error) {
      setErr(getErrorMessage(error, "Failed to create and attach document"));
    } finally {
      setCreatingDocument(false);
    }
  }

  async function onDetachDocument(documentId: string | number) {
    if (!detail) return;

    setUnlinkingDocumentId(documentId);
    setErr(null);
    setSuccess(null);

    try {
      await apiDelete(`/api/v1/contracts/${detail.id}/documents/${documentId}`);
      setSuccess("Document relation berhasil dilepas.");
      await loadRelations();
    } catch (error) {
      setErr(getErrorMessage(error, "Failed to detach document"));
    } finally {
      setUnlinkingDocumentId(null);
    }
  }

  async function onSearchAssets(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    await loadAssetOptions(assetSearch);
  }

  async function onClearAssetSearch() {
    setAssetSearch("");
    setErr(null);
    await loadAssetOptions("");
  }

  async function onAttachAsset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!detail || !attachAssetForm.asset_id) return;

    setLinkingAsset(true);
    setErr(null);
    setSuccess(null);

    try {
      await apiPostJson(`/api/v1/contracts/${detail.id}/assets`, {
        asset_id: Number(attachAssetForm.asset_id),
        note: attachAssetForm.note.trim() || null,
      });

      setAttachAssetForm({ asset_id: "", note: "" });
      setSuccess("Asset berhasil dihubungkan ke contract.");
      await loadRelations();
      await loadAssetOptions(assetSearch);
    } catch (error) {
      setErr(getErrorMessage(error, "Failed to attach asset"));
    } finally {
      setLinkingAsset(false);
    }
  }

  async function onDetachAsset(assetId: string | number) {
    if (!detail) return;

    setUnlinkingAssetId(assetId);
    setErr(null);
    setSuccess(null);

    try {
      await apiDelete(`/api/v1/contracts/${detail.id}/assets/${assetId}`);
      setSuccess("Asset relation berhasil dilepas.");
      await loadRelations();
      await loadAssetOptions(assetSearch);
    } catch (error) {
      setErr(getErrorMessage(error, "Failed to detach asset"));
    } finally {
      setUnlinkingAssetId(null);
    }
  }

  async function onAttachEvidence(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!detail || !attachEvidenceForm.evidence_file_id) return;

    setLinkingEvidence(true);
    setErr(null);
    setSuccess(null);

    try {
      await apiPostJson(`/api/v1/contracts/${detail.id}/evidence`, {
        evidence_file_id: Number(attachEvidenceForm.evidence_file_id),
        note: attachEvidenceForm.note.trim() || null,
      });

      setAttachEvidenceForm({ evidence_file_id: "", note: "" });
      setSuccess("Evidence berhasil dihubungkan ke contract.");
      await loadRelations();
    } catch (error) {
      setErr(getErrorMessage(error, "Failed to attach evidence"));
    } finally {
      setLinkingEvidence(false);
    }
  }

  async function onUploadAndAttachEvidence(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!detail || !uploadEvidenceForm.file) return;

    setUploadingEvidenceFile(true);
    setErr(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", uploadEvidenceForm.file);

      const uploadRes = await fetch(`${API_BASE}/api/v1/evidence/files`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const uploadJson = await parseJsonSafe(uploadRes);

      if (!uploadRes.ok) {
        throw new Error(
          uploadJson?.error?.message ||
            uploadJson?.message ||
            "Failed to upload evidence"
        );
      }

      const evidenceFileId = Number(uploadJson?.data?.file?.id);
      if (!Number.isInteger(evidenceFileId) || evidenceFileId <= 0) {
        throw new Error("Uploaded evidence file id not found");
      }

      await apiPostJson(`/api/v1/contracts/${detail.id}/evidence`, {
        evidence_file_id: evidenceFileId,
        note: uploadEvidenceForm.note.trim() || null,
      });

      setUploadEvidenceForm({
        file: null,
        note: "",
      });
      setUploadEvidenceInputKey((v) => v + 1);
      setShowUploadEvidence(false);

      setSuccess("Evidence baru berhasil di-upload dan langsung dihubungkan ke contract.");
      await loadRelations();
    } catch (error) {
      setErr(getErrorMessage(error, "Failed to upload and attach evidence"));
    } finally {
      setUploadingEvidenceFile(false);
    }
  }

  async function onDetachEvidence(linkId: string | number) {
    if (!detail) return;

    setUnlinkingEvidenceLinkId(linkId);
    setErr(null);
    setSuccess(null);

    try {
      await apiDelete(`/api/v1/contracts/${detail.id}/evidence-links/${linkId}`);
      setSuccess("Evidence relation berhasil dilepas.");
      await loadRelations();
    } catch (error) {
      setErr(getErrorMessage(error, "Failed to detach evidence"));
    } finally {
      setUnlinkingEvidenceLinkId(null);
    }
  }

  if (!Number.isInteger(contractIdNum) || contractIdNum <= 0) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.10),_transparent_28%),radial-gradient(circle_at_80%_20%,_rgba(14,165,233,0.08),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.06),_transparent_22%)]" />
        <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-cyan-300/12 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-sky-300/8 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-10 lg:py-8">
          <div className="mt-4">
            <ErrorState error="Invalid contract id." />
          </div>
        </div>
      </main>
    );
  }

  const activeVendorOptions = vendors.filter(
    (v) => String(v.status).toUpperCase() === "ACTIVE"
  );

  const attachableDocuments = availableDocuments.filter(
    (doc) => !relatedDocuments.some((linked) => String(linked.document_id) === String(doc.id))
  );

  const attachableAssets = availableAssets.filter(
    (asset) => !relatedAssets.some((linked) => String(linked.asset_id) === String(asset.id))
  );

  const attachableEvidenceFiles = availableEvidenceFiles.filter(
    (file) =>
      !relatedEvidence.some((linked) => String(linked.evidence_file_id) === String(file.id))
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.10),_transparent_28%),radial-gradient(circle_at_80%_20%,_rgba(14,165,233,0.08),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.06),_transparent_22%)]" />
      <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-cyan-300/12 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-sky-300/8 blur-3xl" />
      <div className="relative mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-10 lg:py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Contracts
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              Contract Detail
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-700">
              Lihat, ubah, dan kelola relasi dokumen, asset, dan evidence untuk contract.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/contracts"
              className="itam-secondary-action"
            >
              Back
            </Link>
          </div>
        </div>

        {err ? (
          <div className="mt-4">
            <ErrorState
              error={err}
              onRetry={() => {
                window.location.reload();
              }}
            />
          </div>
        ) : null}

        {success ? (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <div className="text-sm text-slate-600">Loading contract...</div>
          </div>
        ) : !detail ? (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <div className="text-sm text-slate-600">Contract not found.</div>
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Status
                </div>
                <div className="mt-2">
                  <span className={statusPill(detail.status)}>{detail.status}</span>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Health
                </div>
                <div className="mt-2">
                  <span className={healthPill(detail.contract_health || "")}>
                    {detail.contract_health || "-"}
                  </span>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Vendor
                </div>
                <div className="mt-2 text-sm font-medium text-slate-900">
                  {detail.vendor_name || "-"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {detail.vendor_code || "-"}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Updated
                </div>
                <div className="mt-2 text-sm font-medium text-slate-900">
                  {fmtDateTime(detail.updated_at)}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
              <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={onSave}>
                <div>
                  <div className="mb-1 text-sm font-medium text-gray-700">Vendor</div>
                  <select
                    value={form.vendor_id}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, vendor_id: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={saving || loadingVendors}
                    required
                  >
                    <option value="">
                      {loadingVendors ? "Loading vendors..." : "Select vendor"}
                    </option>
                    {activeVendorOptions.map((v) => (
                      <option key={String(v.id)} value={String(v.id)}>
                        {v.vendor_code} - {v.vendor_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-1 text-sm font-medium text-gray-700">Contract Code</div>
                  <input
                    value={form.contract_code}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, contract_code: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={saving}
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 text-sm font-medium text-gray-700">Contract Name</div>
                  <input
                    value={form.contract_name}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, contract_name: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={saving}
                    required
                  />
                </div>

                <div>
                  <div className="mb-1 text-sm font-medium text-gray-700">Contract Type</div>
                  <select
                    value={form.contract_type}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, contract_type: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={saving}
                  >
                    {CONTRACT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-1 text-sm font-medium text-gray-700">Status</div>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, status: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={saving}
                  >
                    {CONTRACT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-1 text-sm font-medium text-gray-700">Start Date</div>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, start_date: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={saving}
                  />
                </div>

                <div>
                  <div className="mb-1 text-sm font-medium text-gray-700">End Date</div>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, end_date: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={saving}
                  />
                </div>

                <div>
                  <div className="mb-1 text-sm font-medium text-gray-700">Renewal Notice Days</div>
                  <input
                    type="number"
                    min={0}
                    value={form.renewal_notice_days}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        renewal_notice_days: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={saving}
                  />
                </div>

                <div>
                  <div className="mb-1 text-sm font-medium text-gray-700">
                    Owner Identity ID (optional)
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={form.owner_identity_id}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        owner_identity_id: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={saving}
                  />
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 text-sm font-medium text-gray-700">Notes</div>
                  <textarea
                    rows={5}
                    value={form.notes}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={saving}
                  />
                </div>

                <div className="md:col-span-2 flex justify-end gap-2">
                  <Link
                    href="/contracts"
                    className="itam-secondary-action"
                  >
                    Back to Contracts
                  </Link>
                  <button
                    type="submit"
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>

              <div className="mt-4 text-xs text-slate-500">
                Created: {fmtDateTime(detail.created_at)} · Updated: {fmtDateTime(detail.updated_at)} · End Date:{" "}
                {fmtDate(detail.end_date)}
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Related Documents</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Attach document existing ke contract ini untuk audit dan referensi.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCreateDocument((v) => !v)}
                  className="itam-secondary-action"
                  disabled={creatingDocument}
                >
                  {showCreateDocument ? "Close Create" : "Create New Document"}
                </button>
              </div>

              <form className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={onAttachDocument}>
                <div>
                  <div className="mb-1 text-sm font-medium text-gray-700">Document</div>
                  <select
                    value={attachDocumentForm.document_id}
                    onChange={(e) =>
                      setAttachDocumentForm((prev) => ({
                        ...prev,
                        document_id: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={linkingDocument || loadingRelations}
                    required
                  >
                    <option value="">
                      {loadingRelations ? "Loading documents..." : "Select document"}
                    </option>
                    {attachableDocuments.map((doc) => (
                      <option key={String(doc.id)} value={String(doc.id)}>
                        {doc.doc_type_code} - {doc.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-1 text-sm font-medium text-gray-700">Note (optional)</div>
                  <input
                    value={attachDocumentForm.note}
                    onChange={(e) =>
                      setAttachDocumentForm((prev) => ({
                        ...prev,
                        note: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    placeholder="Attachment note..."
                    disabled={linkingDocument}
                  />
                </div>

                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    disabled={linkingDocument || !attachableDocuments.length}
                  >
                    {linkingDocument ? "Attaching..." : "Attach Document"}
                  </button>
                </div>
              </form>

              {showCreateDocument ? (
                <form
                  className="mt-4 grid grid-cols-1 gap-3 border-t border-gray-200 pt-4 md:grid-cols-2"
                  onSubmit={onCreateAndAttachDocument}
                >
                  <div>
                    <div className="mb-1 text-sm font-medium text-gray-700">Document Type</div>
                    <input
                      value={createDocumentForm.doc_type_code}
                      onChange={(e) =>
                        setCreateDocumentForm((prev) => ({
                          ...prev,
                          doc_type_code: e.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                      placeholder="CONTRACT"
                      disabled={creatingDocument}
                      required
                    />
                    <div className="mt-1 text-xs text-slate-500">
                      Document akan dibuat di modul Documents lalu otomatis dihubungkan ke contract ini.
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-sm font-medium text-gray-700">Title</div>
                    <input
                      value={createDocumentForm.title}
                      onChange={(e) =>
                        setCreateDocumentForm((prev) => ({
                          ...prev,
                          title: e.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                      placeholder="Agreement Supporting Document"
                      disabled={creatingDocument}
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <div className="mb-1 text-sm font-medium text-gray-700">Relation Note (optional)</div>
                    <input
                      value={createDocumentForm.relation_note}
                      onChange={(e) =>
                        setCreateDocumentForm((prev) => ({
                          ...prev,
                          relation_note: e.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                      placeholder="Attachment note..."
                      disabled={creatingDocument}
                    />
                  </div>

                  <div className="md:col-span-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateDocument(false);
                        setCreateDocumentForm({
                          doc_type_code: "CONTRACT",
                          title: "",
                          relation_note: "",
                        });
                      }}
                      className="itam-secondary-action"
                      disabled={creatingDocument}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                      disabled={
                        creatingDocument ||
                        !createDocumentForm.doc_type_code.trim() ||
                        !createDocumentForm.title.trim()
                      }
                    >
                      {creatingDocument ? "Creating..." : "Create & Attach"}
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2 pr-4">Title</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Version</th>
                      <th className="py-2 pr-4">Linked At</th>
                      <th className="py-2 pr-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingRelations ? (
                      <tr className="border-t">
                        <td colSpan={6} className="py-6 text-slate-600">
                          Loading related documents...
                        </td>
                      </tr>
                    ) : relatedDocuments.length === 0 ? (
                      <tr className="border-t">
                        <td colSpan={6} className="py-6 text-slate-600">
                          Tidak ada document yang terhubung.
                        </td>
                      </tr>
                    ) : (
                      relatedDocuments.map((item) => (
                        <tr key={String(item.id)} className="border-t">
                          <td className="py-2 pr-4 font-mono text-xs">
                            {item.document.doc_type_code}
                          </td>
                          <td className="py-2 pr-4">
                            <Link
                              href={`/documents/${item.document.id}`}
                              className="text-cyan-700 hover:text-cyan-800 hover:underline"
                            >
                              {item.document.title}
                            </Link>
                          </td>
                          <td className="py-2 pr-4">
                            <span className={documentStatusPill(item.document.status_code)}>
                              {item.document.status_code}
                            </span>
                          </td>
                          <td className="py-2 pr-4">v{item.document.current_version}</td>
                          <td className="py-2 pr-4">{fmtDateTime(item.created_at)}</td>
                          <td className="py-2 pr-4 text-right">
                            <button
                              type="button"
                              onClick={() => onDetachDocument(item.document_id)}
                              className="text-rose-700 hover:text-rose-800 hover:underline disabled:opacity-60"
                              disabled={unlinkingDocumentId === item.document_id}
                            >
                              {unlinkingDocumentId === item.document_id ? "Removing..." : "Unlink"}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Related Assets</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Hubungkan asset existing ke contract ini. Gunakan pencarian berdasarkan asset tag atau nama asset.
                  </p>
                </div>
              </div>

              <form className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto]" onSubmit={onSearchAssets}>
                <div>
                  <div className="mb-1 text-sm font-medium text-gray-700">Search Asset</div>
                  <input
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    placeholder="Contoh: AST-001 atau Laptop Finance"
                    disabled={loadingAssetsCatalog}
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-60"
                    disabled={loadingAssetsCatalog}
                  >
                    {loadingAssetsCatalog ? "Searching..." : "Search"}
                  </button>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={onClearAssetSearch}
                    className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-60"
                    disabled={loadingAssetsCatalog}
                  >
                    Reset
                  </button>
                </div>
              </form>

              <form className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={onAttachAsset}>
                <div>
                  <div className="mb-1 text-sm font-medium text-gray-700">Asset</div>
                  <select
                    value={attachAssetForm.asset_id}
                    onChange={(e) =>
                      setAttachAssetForm((prev) => ({
                        ...prev,
                        asset_id: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={linkingAsset || loadingAssetsCatalog || loadingRelations}
                    required
                  >
                    <option value="">
                      {loadingAssetsCatalog
                        ? "Loading assets..."
                        : attachableAssets.length
                        ? "Select asset"
                        : "No asset found in current search"}
                    </option>
                    {attachableAssets.map((asset) => (
                      <option key={String(asset.id)} value={String(asset.id)}>
                        {asset.asset_tag} - {asset.name}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-xs text-slate-500">
                    Hasil mengikuti page size config tenant dan kata kunci pencarian saat ini.
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-sm font-medium text-gray-700">Note (optional)</div>
                  <input
                    value={attachAssetForm.note}
                    onChange={(e) =>
                      setAttachAssetForm((prev) => ({
                        ...prev,
                        note: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    placeholder="Coverage note..."
                    disabled={linkingAsset}
                  />
                </div>

                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    disabled={linkingAsset || !attachableAssets.length}
                  >
                    {linkingAsset ? "Attaching..." : "Attach Asset"}
                  </button>
                </div>
              </form>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2 pr-4">Asset Tag</th>
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2 pr-4">State</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Linked At</th>
                      <th className="py-2 pr-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingRelations ? (
                      <tr className="border-t">
                        <td colSpan={7} className="py-6 text-slate-600">
                          Loading related assets...
                        </td>
                      </tr>
                    ) : relatedAssets.length === 0 ? (
                      <tr className="border-t">
                        <td colSpan={7} className="py-6 text-slate-600">
                          Tidak ada asset yang terhubung.
                        </td>
                      </tr>
                    ) : (
                      relatedAssets.map((item) => (
                        <tr key={String(item.id)} className="border-t">
                          <td className="py-2 pr-4 font-mono text-xs text-gray-700">
                            {item.asset.asset_tag}
                          </td>
                          <td className="py-2 pr-4">
                            <Link
                              href={`/assets/${item.asset.id}`}
                              className="text-cyan-700 hover:text-cyan-800 hover:underline"
                            >
                              {item.asset.name}
                            </Link>
                          </td>
                          <td className="py-2 pr-4">
                            {item.asset.asset_type?.label || item.asset.asset_type?.code || "-"}
                          </td>
                          <td className="py-2 pr-4">
                            {item.asset.state?.label || item.asset.state?.code || "-"}
                          </td>
                          <td className="py-2 pr-4">{item.asset.status || "-"}</td>
                          <td className="py-2 pr-4">{fmtDateTime(item.created_at)}</td>
                          <td className="py-2 pr-4 text-right">
                            <button
                              type="button"
                              onClick={() => onDetachAsset(item.asset_id)}
                              className="text-rose-700 hover:text-rose-800 hover:underline disabled:opacity-60"
                              disabled={unlinkingAssetId === item.asset_id}
                            >
                              {unlinkingAssetId === item.asset_id ? "Removing..." : "Unlink"}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Related Evidence</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Attach evidence existing ke contract ini sebagai bukti pendukung.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowUploadEvidence((v) => !v)}
                  className="itam-secondary-action"
                  disabled={uploadingEvidenceFile}
                >
                  {showUploadEvidence ? "Close Upload" : "Upload New Evidence"}
                </button>
              </div>

              <form className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={onAttachEvidence}>
                <div>
                  <div className="mb-1 text-sm font-medium text-gray-700">Evidence File</div>
                  <select
                    value={attachEvidenceForm.evidence_file_id}
                    onChange={(e) =>
                      setAttachEvidenceForm((prev) => ({
                        ...prev,
                        evidence_file_id: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    disabled={linkingEvidence || loadingRelations}
                    required
                  >
                    <option value="">
                      {loadingRelations ? "Loading evidence..." : "Select evidence file"}
                    </option>
                    {attachableEvidenceFiles.map((file) => (
                      <option key={String(file.id)} value={String(file.id)}>
                        {file.original_name} ({fmtBytes(file.size_bytes)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-1 text-sm font-medium text-gray-700">Note (optional)</div>
                  <input
                    value={attachEvidenceForm.note}
                    onChange={(e) =>
                      setAttachEvidenceForm((prev) => ({
                        ...prev,
                        note: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                    placeholder="Attachment note..."
                    disabled={linkingEvidence}
                  />
                </div>

                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    disabled={linkingEvidence || !attachableEvidenceFiles.length}
                  >
                    {linkingEvidence ? "Attaching..." : "Attach Evidence"}
                  </button>
                </div>
              </form>

              {showUploadEvidence ? (
                <form
                  className="mt-4 grid grid-cols-1 gap-3 border-t border-gray-200 pt-4 md:grid-cols-2"
                  onSubmit={onUploadAndAttachEvidence}
                >
                  <div>
                    <div className="mb-1 text-sm font-medium text-gray-700">New Evidence File</div>
                    <input
                      key={uploadEvidenceInputKey}
                      type="file"
                      onChange={(e) =>
                        setUploadEvidenceForm((prev) => ({
                          ...prev,
                          file: e.target.files?.[0] ?? null,
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                      disabled={uploadingEvidenceFile}
                      required
                    />
                    <div className="mt-1 text-xs text-slate-500">
                      File akan di-upload ke Evidence library lalu otomatis dihubungkan ke contract ini.
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-sm font-medium text-gray-700">Note (optional)</div>
                    <input
                      value={uploadEvidenceForm.note}
                      onChange={(e) =>
                        setUploadEvidenceForm((prev) => ({
                          ...prev,
                          note: e.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                      placeholder="Attachment note..."
                      disabled={uploadingEvidenceFile}
                    />
                  </div>

                  <div className="md:col-span-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowUploadEvidence(false);
                        setUploadEvidenceForm({ file: null, note: "" });
                        setUploadEvidenceInputKey((v) => v + 1);
                      }}
                      className="itam-secondary-action"
                      disabled={uploadingEvidenceFile}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                      disabled={uploadingEvidenceFile || !uploadEvidenceForm.file}
                    >
                      {uploadingEvidenceFile ? "Uploading..." : "Upload & Attach"}
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2 pr-4">File</th>
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2 pr-4">Size</th>
                      <th className="py-2 pr-4">Linked At</th>
                      <th className="py-2 pr-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingRelations ? (
                      <tr className="border-t">
                        <td colSpan={5} className="py-6 text-slate-600">
                          Loading related evidence...
                        </td>
                      </tr>
                    ) : relatedEvidence.length === 0 ? (
                      <tr className="border-t">
                        <td colSpan={5} className="py-6 text-slate-600">
                          Tidak ada evidence yang terhubung.
                        </td>
                      </tr>
                    ) : (
                      relatedEvidence.map((item) => (
                        <tr key={String(item.id)} className="border-t">
                          <td className="py-2 pr-4 font-medium text-slate-900">
                            {item.file.original_name}
                          </td>
                          <td className="py-2 pr-4">{item.file.mime_type}</td>
                          <td className="py-2 pr-4">{fmtBytes(item.file.size_bytes)}</td>
                          <td className="py-2 pr-4">{fmtDateTime(item.created_at)}</td>
                          <td className="py-2 pr-4 text-right">
                            <button
                              type="button"
                              onClick={() => onDetachEvidence(item.id)}
                              className="text-rose-700 hover:text-rose-800 hover:underline disabled:opacity-60"
                              disabled={unlinkingEvidenceLinkId === item.id}
                            >
                              {unlinkingEvidenceLinkId === item.id ? "Removing..." : "Unlink"}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6">
              <SoftwareEntitlementsPanel contractId={detail.id} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}



