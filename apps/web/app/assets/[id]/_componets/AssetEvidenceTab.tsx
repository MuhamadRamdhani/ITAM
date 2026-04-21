"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "../../../lib/api";
import EvidenceAttachForm from "./evidenceAttachForm";

type UiConfig = {
  page_size_options: number[];
  documents_page_size_default: number;
  evidence_max_per_target?: number;
};

type EvidenceLinkItem = {
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
  items: EvidenceLinkItem[];
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

export default function AssetEvidenceTab({
  assetId,
  canEdit = true,
}: {
  assetId: number;
  canEdit?: boolean;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [maxPerTarget, setMaxPerTarget] = useState(10);
  const [countPageSize, setCountPageSize] = useState(10);

  const [items, setItems] = useState<EvidenceLinkItem[]>([]);
  const [total, setTotal] = useState(0);

  const API_BASE = (
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001"
  ).replace(/\/+$/, "");

  async function loadAll() {
    try {
      setLoading(true);
      setError(null);

      const cfgRes = await apiGet<UiConfig>("/api/v1/config/ui");
      const cfg =
        (cfgRes as any)?.data?.data ??
        (cfgRes as any)?.data ??
        {};

      const pageSize = Number(cfg?.documents_page_size_default ?? 50);
      const nextMaxPerTarget = Number(cfg?.evidence_max_per_target ?? 10);
      const nextCountPageSize =
        Array.isArray(cfg?.page_size_options) && cfg.page_size_options.length > 0
          ? Math.min(...cfg.page_size_options.map((x: any) => Number(x)))
          : 10;

      setMaxPerTarget(nextMaxPerTarget);
      setCountPageSize(nextCountPageSize);

      const qs = new URLSearchParams({
        target_type: "ASSET",
        target_id: String(assetId),
        page: "1",
        page_size: String(pageSize),
      });

      const dataRes = await apiGet<EvidenceLinksList>(
        `/api/v1/evidence/links?${qs.toString()}`
      );

      const data =
        (dataRes as any)?.data?.data ??
        (dataRes as any)?.data ??
        {};

      const nextItems = Array.isArray(data.items) ? data.items : [];
      const nextTotal = Number(data.total ?? 0);

      setItems(nextItems);
      setTotal(nextTotal);
    } catch (eAny: any) {
      if (
        eAny?.code === "AUTH_REQUIRED" ||
        eAny?.code === "AUTH_UNAUTHORIZED" ||
        eAny?.http_status === 401
      ) {
        router.replace("/login");
        router.refresh();
        return;
      }

      setError(eAny?.message || "Failed to load evidence");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [assetId]);

  return (
    <div className="space-y-4">
      {canEdit ? (
        <EvidenceAttachForm
          targetType="ASSET"
          targetId={assetId}
          maxFilesPerTarget={maxPerTarget}
          pageSizeForCount={countPageSize}
          onChanged={loadAll}
        />
      ) : (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Evidence untuk asset ini bisa dilihat, tetapi upload dan attach hanya tersedia
          untuk role yang berwenang.
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
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {fmtDateTime(it.created_at)}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {it.file?.original_name ?? "-"}
                    </td>
                    <td className="py-2 pr-4">{it.note ?? "-"}</td>
                    <td className="py-2 pr-4">{it.file?.mime_type ?? "-"}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {fmtBytes(it.file?.size_bytes)}
                    </td>
                    <td className="py-2 pr-4">
                      {it.file?.id ? (
                        <a
                          className="text-blue-700 hover:underline"
                          href={`${API_BASE}/api/v1/evidence/files/${it.file.id}/download`}
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
                      Belum ada evidence untuk asset ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-gray-500">
            Tip: Upload + attach dilakukan sekali klik. Nanti gate <b>require_evidence</b> bisa pakai tab ini.
          </div>
        </>
      )}
    </div>
  );
}
