"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPostForm, apiPostJson } from "../../../lib/api";

type UploadResp = {
  file: { id: number; original_name: string };
};

type LinkResp = {
  link: { id: number };
};

type EvidenceLinksList = {
  items: any[];
  total: number;
  page: number;
  page_size: number;
};

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export default function EvidenceAttachForm(props: {
  targetType: "ASSET" | "DOCUMENT" | "APPROVAL";
  targetId: number;
  maxFilesPerTarget: number; // from /config/ui
  pageSizeForCount: number; // must be valid per page_size_options
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState<string>("");

  const [currentTotal, setCurrentTotal] = useState<number>(0);
  const [loadingCount, setLoadingCount] = useState<boolean>(true);

  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const maxPerTarget = Number.isFinite(props.maxFilesPerTarget) && props.maxFilesPerTarget > 0 ? props.maxFilesPerTarget : 10;

  const slotsLeft = useMemo(() => Math.max(0, maxPerTarget - currentTotal), [currentTotal, maxPerTarget]);

  async function refreshCount() {
    setLoadingCount(true);
    try {
      const qs = new URLSearchParams({
        target_type: props.targetType,
        target_id: String(props.targetId),
        page: "1",
        page_size: String(props.pageSizeForCount),
      });
      const res = await apiGet<EvidenceLinksList>(`/api/v1/evidence/links?${qs.toString()}`);
      setCurrentTotal(Number(res.data.total ?? 0));
    } catch {
      // kalau gagal, jangan block user total
    } finally {
      setLoadingCount(false);
    }
  }

  useEffect(() => {
    refreshCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.targetType, props.targetId]);

  function onPickFiles(list: FileList | null) {
    setErr(null);
    setOkMsg(null);

    if (!list) {
      setFiles([]);
      return;
    }

    if (slotsLeft <= 0) {
      setFiles([]);
      setErr(`Batas tercapai. Maksimal ${maxPerTarget} evidence per target.`);
      return;
    }

    const picked = Array.from(list);

    if (picked.length > slotsLeft) {
      setErr(`Sisa slot ${slotsLeft}. Kamu memilih ${picked.length} file. Akan dipotong otomatis.`);
    }

    const trimmed = picked.slice(0, slotsLeft);

    const tooBig = trimmed.find((f) => f.size > MAX_SIZE_BYTES);
    if (tooBig) {
      setFiles([]);
      setErr(`File "${tooBig.name}" melebihi 10MB.`);
      return;
    }

    setFiles(trimmed);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOkMsg(null);

    if (files.length === 0) {
      setErr("Pilih file dulu.");
      return;
    }

    startTransition(async () => {
      try {
        let attached = 0;

        for (const f of files) {
          // 1) upload
          const fd = new FormData();
          fd.append("file", f);
          const up = await apiPostForm<UploadResp>("/api/v1/evidence/files", fd);
          const fileId = up.data.file.id;

          // 2) attach
          try {
            await apiPostJson<LinkResp>("/api/v1/evidence/links", {
              target_type: props.targetType,
              target_id: props.targetId,
              evidence_file_id: fileId,
              note: note?.trim() || undefined,
            });
            attached++;
          } catch (e2: any) {
            // Stop loop kalau limit tercapai biar tidak bikin orphan lebih banyak
            if (e2?.code === "EVIDENCE_LIMIT_REACHED") {
              const details = e2?.details || {};
              const max = details?.max_files ?? maxPerTarget;
              const cur = details?.current ?? currentTotal;
              setErr(`Batas tercapai. Maksimal ${max} evidence per target. Saat ini: ${cur}.`);
              break;
            }
            throw e2;
          }
        }

        setFiles([]);
        setNote("");

        await refreshCount();

        setOkMsg(attached > 0 ? `Attached ${attached} file.` : "Tidak ada file yang ter-attach.");

        router.refresh();
      } catch (eAny: any) {
        setErr(eAny?.message || "Attach gagal");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border bg-white p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="file"
            multiple
            className="w-full sm:w-72 rounded-md border px-3 py-2 text-sm"
            onChange={(ev) => onPickFiles(ev.target.files)}
          />

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional, applied to all)"
            className="w-full sm:w-80 rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <button
          disabled={isPending || loadingCount || slotsLeft <= 0}
          className="itam-primary-action"
        >
          {isPending ? "Uploading..." : "Upload & Attach"}
        </button>
      </div>

      <div className="mt-2 text-xs text-gray-500">
        Rule: max <b>10MB</b>/file, max <b>{maxPerTarget}</b> files per target.{" "}
        {loadingCount ? (
          <span>(checking slots...)</span>
        ) : (
          <span>
            Slots left: <b>{slotsLeft}</b> / {maxPerTarget}
          </span>
        )}
      </div>

      {files.length > 0 ? (
        <div className="mt-2 rounded-md border bg-gray-50 p-2 text-xs text-gray-700">
          <div className="font-semibold mb-1">Selected:</div>
          <ul className="list-disc pl-5">
            {files.map((f) => (
              <li key={f.name}>
                {f.name} ({Math.round(f.size / 1024)} KB)
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {err && <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{err}</div>}
      {okMsg && (
        <div className="mt-2 rounded-md border border-green-200 bg-green-50 p-2 text-sm text-green-700">{okMsg}</div>
      )}
    </form>
  );
}
