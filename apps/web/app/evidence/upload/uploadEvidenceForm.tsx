"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { apiPostForm } from "../../lib/api";
import { useGlobalLoading } from "../../components/GlobalLoadingProvider";

type UploadResp = {
  file: {
    id: number;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    sha256: string;
    storage_path: string;
    created_at: string;
  };
};

const MAX_FILES = 5;
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export default function UploadEvidenceForm() {
  const router = useRouter();
  const { show, hide } = useGlobalLoading();
  const inFlightRef = useRef(false);

  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);

  function onPickFiles(list: FileList | null) {
    if (submitting) return;

    setErr(null);

    const picked = list ? Array.from(list) : [];

    if (picked.length > MAX_FILES) {
      setErr(`Maksimal ${MAX_FILES} file.`);
      setFiles(picked.slice(0, MAX_FILES));
      return;
    }

    const tooBig = picked.find((f) => f.size > MAX_SIZE_BYTES);
    if (tooBig) {
      setFiles([]);
      setErr(`File "${tooBig.name}" melebihi 10MB.`);
      return;
    }

    setFiles(picked);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setErr(null);

    if (files.length === 0) {
      setErr("Pilih file dulu.");
      inFlightRef.current = false;
      return;
    }

    if (files.length > MAX_FILES) {
      setErr(`Maksimal ${MAX_FILES} file.`);
      inFlightRef.current = false;
      return;
    }

    const tooBig = files.find((f) => f.size > MAX_SIZE_BYTES);
    if (tooBig) {
      setErr(`File "${tooBig.name}" melebihi 10MB.`);
      inFlightRef.current = false;
      return;
    }

    setSubmitting(true);
    show("Uploading...");

    let shouldHideOverlay = true;

    try {
      for (let i = 0; i < files.length; i += 1) {
        const f = files[i];
        setProgressText(`Uploading ${i + 1}/${files.length}: ${f.name}`);

        const fd = new FormData();
        fd.append("file", f);

        await apiPostForm<UploadResp>("/api/v1/evidence/files", fd);
      }

      shouldHideOverlay = false;
      router.push("/evidence");
      router.refresh();
    } catch (eAny: any) {
      setErr(eAny?.message || "Upload gagal");
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
      setProgressText(null);

      if (shouldHideOverlay) {
        hide();
      }
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">Files</label>
        <input
          type="file"
          multiple
          disabled={submitting}
          className="mt-1 block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition file:mr-4 file:rounded-full file:border-0 file:bg-gradient-to-r file:from-cyan-500 file:to-sky-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white disabled:cursor-not-allowed disabled:bg-slate-100"
          onChange={(ev) => onPickFiles(ev.target.files)}
        />
        <p className="mt-1 text-xs text-slate-500">
          Max <b>10MB</b>/file. Max <b>{MAX_FILES}</b> files.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Image file akan dikompres otomatis sebelum disimpan.
        </p>
      </div>

      {files.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <div className="mb-1 font-semibold text-slate-900">Selected:</div>
          <ul className="list-disc pl-5">
            {files.map((f, idx) => (
              <li key={`${f.name}-${f.size}-${f.lastModified}-${idx}`}>
                {f.name} ({Math.round(f.size / 1024)} KB)
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {progressText ? (
        <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-700">
          {progressText}
        </div>
      ) : null}

      {err ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="itam-primary-action"
      >
        {submitting ? "Uploading..." : "Upload"}
      </button>
    </form>
  );
}
