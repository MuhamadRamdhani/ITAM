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
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700">Files</label>
        <input
          type="file"
          multiple
          disabled={submitting}
          className="mt-1 block w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
          onChange={(ev) => onPickFiles(ev.target.files)}
        />
        <p className="mt-1 text-xs text-gray-500">
          Max <b>10MB</b>/file. Max <b>{MAX_FILES}</b> files.
        </p>
      </div>

      {files.length > 0 ? (
        <div className="rounded-md border bg-gray-50 p-2 text-xs text-gray-700">
          <div className="mb-1 font-semibold">Selected:</div>
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
        <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-sm text-blue-700">
          {progressText}
        </div>
      ) : null}

      {err ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {submitting ? "Uploading..." : "Upload"}
      </button>
    </form>
  );
}