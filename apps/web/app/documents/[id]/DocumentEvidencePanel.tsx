"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "../../lib/api";
import { canManageEvidence } from "../../lib/evidenceAccess";
import EvidenceAttachForm from "../../assets/[id]/_componets/evidenceAttachForm";

type UiConfig = {
  page_size_options: number[];
  documents_page_size_default: number;
  evidence_max_per_target?: number;
};

type DocumentEvidenceLink = {
  id: number;
  target_type: string;
  target_id: number;
  evidence_file_id: number;
  note: string | null;
  created_at: string;
  file: {
    id: number;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    sha256: string | null;
  };
};

type EvidenceLinksList = {
  items: DocumentEvidenceLink[];
  total: number;
  page: number;
  page_size: number;
};

function fmtDateTime(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function fmtBytes(n?: number) {
  if (!Number.isFinite(Number(n))) return "-";
  const x = Number(n);
  if (x < 1024) return `${x} B`;
  if (x < 1024 * 1024) return `${(x / 1024).toFixed(1)} KB`;
  if (x < 1024 * 1024 * 1024) return `${(x / (1024 * 1024)).toFixed(1)} MB`;
  return `${(x / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getErrorMessage(error: unknown, fallback = "Failed to load document evidence") {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;

  const e = error as { error?: { message?: string }; message?: string; code?: string; http_status?: number };
  return e?.error?.message || e?.message || fallback;
}

function normalizeUiConfig(res: { data?: { data?: UiConfig } | UiConfig }): UiConfig {
  return (res?.data?.data ?? res?.data ?? {}) as UiConfig;
}

function normalizeEvidenceList(res: { data?: { data?: EvidenceLinksList } | EvidenceLinksList }): EvidenceLinksList {
  const raw = res?.data?.data ?? res?.data ?? {};
  return {
    items: Array.isArray(raw?.items) ? (raw.items as DocumentEvidenceLink[]) : [],
    total: Number(raw?.total ?? 0),
    page: Number(raw?.page ?? 1),
    page_size: Number(raw?.page_size ?? 10),
  };
}

export default function DocumentEvidencePanel(props: {
  documentId: number;
  roles: string[];
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maxPerTarget, setMaxPerTarget] = useState(10);
  const [countPageSize, setCountPageSize] = useState(10);
  const [items, setItems] = useState<DocumentEvidenceLink[]>([]);
  const [total, setTotal] = useState(0);

  const canEdit = canManageEvidence(props.roles);
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const cfgRes = await apiGet<UiConfig>("/api/v1/config/ui", {
        loadingKey: "document_evidence_config",
      });
      const cfg = normalizeUiConfig(cfgRes);

      const pageSize = Number(cfg?.documents_page_size_default ?? 50);
      const nextMaxPerTarget = Number(cfg?.evidence_max_per_target ?? 10);
      const nextCountPageSize =
        Array.isArray(cfg?.page_size_options) && cfg.page_size_options.length > 0
          ? Math.min(...cfg.page_size_options.map((x) => Number(x)))
          : 10;

      setMaxPerTarget(nextMaxPerTarget);
      setCountPageSize(nextCountPageSize);

      const qs = new URLSearchParams({
        target_type: "DOCUMENT",
        target_id: String(props.documentId),
        page: "1",
        page_size: String(pageSize),
      });

      const dataRes = await apiGet<EvidenceLinksList>(`/api/v1/evidence/links?${qs.toString()}`, {
        loadingKey: "document_evidence_links",
      });
      const data = normalizeEvidenceList(dataRes);

      setItems(data.items);
      setTotal(data.total);
    } catch (eAny: unknown) {
      const err = eAny as { code?: string; http_status?: number; message?: string };
      if (err?.code === "AUTH_REQUIRED" || err?.code === "AUTH_UNAUTHORIZED" || err?.http_status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }

      setError(getErrorMessage(eAny));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [props.documentId, router]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  return (
    <div className="space-y-4">
      {canEdit ? (
        <EvidenceAttachForm
          targetType="DOCUMENT"
          targetId={props.documentId}
          maxFilesPerTarget={maxPerTarget}
          pageSizeForCount={countPageSize}
          onChanged={loadAll}
        />
      ) : (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Evidence untuk document ini bisa dilihat, tetapi upload dan attach hanya tersedia untuk role yang berwenang.
        </div>
      )}

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-gray-600">Loading evidence...</div>
      ) : (
        <>
          <div className="text-sm text-gray-500">Total evidence: {total}</div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4">File</th>
                  <th className="py-2 pr-4">Note</th>
                  <th className="py-2 pr-4">Mime</th>
                  <th className="py-2 pr-4">Size</th>
                  <th className="py-2 pr-4">Download</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={String(it.id)} className="border-t">
                    <td className="py-2 pr-4 whitespace-nowrap">{fmtDateTime(it.created_at)}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{it.file?.original_name ?? "-"}</td>
                    <td className="py-2 pr-4">{it.note ?? "-"}</td>
                    <td className="py-2 pr-4">{it.file?.mime_type ?? "-"}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{fmtBytes(it.file?.size_bytes)}</td>
                    <td className="py-2 pr-4">
                      {it.file?.id ? (
                        <a
                          className="text-blue-700 hover:underline"
                          href={`${apiBase}/api/v1/evidence/files/${it.file.id}/download`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Download
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}

                {items.length === 0 && (
                  <tr className="border-t">
                    <td colSpan={6} className="py-6 text-gray-600">
                      Belum ada evidence untuk document ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-gray-500">
            Tip: Upload + attach dilakukan sekali klik. Evidence relation untuk document menggunakan target_type DOCUMENT.
          </div>
        </>
      )}
    </div>
  );
}
