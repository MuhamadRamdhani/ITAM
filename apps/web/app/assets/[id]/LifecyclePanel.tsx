"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPostJson } from "../../lib/api";

type CurrentState = {
  code?: string;
  name?: string;
};

type GateRules = Record<string, any>;

type TransitionOption = {
  to_state_id?: number;
  to_state_code?: string;
  to_state_label?: string;
  require_approval?: boolean;
  require_evidence?: boolean;
  gate_rules?: GateRules;
  blocked?: boolean;
  blocked_reasons?: string[];
};

type StateHistoryRow = {
  id?: number;
  from_state_code?: string;
  from_state_label?: string;
  to_state_code?: string;
  to_state_label?: string;
  reason?: string;
  created_at?: string;
};

type SubmitResult =
  | { mode: "APPLIED" }
  | { mode: "APPROVAL_REQUIRED"; created?: boolean; approval_id?: number | null }
  | { mode?: string; [k: string]: any };

type Notice = {
  kind: "success" | "info" | "error";
  title: string;
  message?: string;
  approvalId?: number | null;
  returnTo?: string;
};

function unwrapData<T>(json: any): T {
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

function toNum(v: any): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

function fmtDateTime(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function parseGateRules(v: any): GateRules | undefined {
  if (!v) return undefined;
  if (typeof v === "object") return v as GateRules;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object") return parsed;
      return undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function normalizeTransitionOption(r: any): TransitionOption {
  const toState = r?.to_state ?? r?.toState ?? null;

  const to_state_id =
    toNum(r?.to_state_id) ??
    toNum(r?.to_id) ??
    toNum(toState?.id) ??
    toNum(toState?.state_id);

  const to_state_code =
    (typeof r?.to_state_code === "string" ? r.to_state_code : undefined) ??
    (typeof r?.to_code === "string" ? r.to_code : undefined) ??
    (typeof toState?.code === "string" ? toState.code : undefined);

  const to_state_label =
    (typeof r?.to_state_label === "string" ? r.to_state_label : undefined) ??
    (typeof r?.to_label === "string" ? r.to_label : undefined) ??
    (typeof toState?.label === "string" ? toState.label : undefined) ??
    (typeof toState?.name === "string" ? toState.name : undefined);

  const require_approval = Boolean(r?.require_approval ?? r?.requireApproval ?? false);
  const require_evidence = Boolean(r?.require_evidence ?? r?.requireEvidence ?? false);

  const gate_rules = parseGateRules(r?.gate_rules ?? r?.gateRules);

  const reasons =
    (Array.isArray(r?.blocked_reasons) ? r.blocked_reasons : null) ??
    (Array.isArray(r?.reasons) ? r.reasons : null) ??
    (typeof r?.blocked_reason === "string" ? [r.blocked_reason] : null) ??
    [];

  const blocked = Boolean(r?.blocked) || (reasons?.length ?? 0) > 0;

  return {
    to_state_id,
    to_state_code,
    to_state_label,
    require_approval,
    require_evidence,
    gate_rules,
    blocked,
    blocked_reasons: Array.from(new Set((reasons ?? []).filter(Boolean))),
  };
}

function optionKey(o: TransitionOption) {
  return o.to_state_code ?? (o.to_state_id != null ? String(o.to_state_id) : "");
}

function optionText(o: TransitionOption) {
  const code = o.to_state_code ?? "";
  const label = o.to_state_label ?? "";
  if (label && code) return `${label} (${code})`;
  if (label) return label;
  if (code) return code;
  return "-";
}

function friendlyGateLabel(key: string) {
  switch (key) {
    case "require_owner":
      return "Require Owner (Department)";
    case "require_custodian":
      return "Require Custodian (Identity)";
    case "require_location":
      return "Require Location";
    default:
      return key;
  }
}

function NoticeBox(props: { notice: Notice; onClose: () => void }) {
  const { notice } = props;

  const cls =
    notice.kind === "success"
      ? "border-green-200 bg-green-50 text-green-900"
      : notice.kind === "info"
      ? "border-blue-200 bg-blue-50 text-blue-900"
      : "border-red-200 bg-red-50 text-red-900";

  const rt = notice.returnTo ? `?returnTo=${encodeURIComponent(notice.returnTo)}` : "";
  const rt2 = notice.returnTo ? `&returnTo=${encodeURIComponent(notice.returnTo)}` : "";

  return (
    <div className={`mt-3 rounded-md border p-3 text-sm ${cls}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{notice.title}</div>
          {notice.message && <div className="mt-1">{notice.message}</div>}

          {notice.kind === "info" && (
            <div className="mt-2 flex flex-wrap gap-2">
              {notice.approvalId ? (
                <Link
                  href={`/approvals/${notice.approvalId}${rt}`}
                  className="inline-flex items-center rounded-md bg-white px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100"
                >
                  Open Approval #{notice.approvalId}
                </Link>
              ) : null}

              <Link
                href={`/approvals?status=PENDING${rt2}`}
                className="inline-flex items-center rounded-md bg-white px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100"
              >
                Open Approvals Queue
              </Link>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={props.onClose}
          className="rounded-md bg-white px-2 py-1 text-xs font-medium hover:bg-gray-100"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default function LifecyclePanel(props: {
  assetId: number;
  initialCurrentState?: CurrentState;
  canTransition?: boolean;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<TransitionOption[]>([]);
  const [history, setHistory] = useState<StateHistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentFromApi, setCurrentFromApi] = useState<CurrentState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const currentState: CurrentState = currentFromApi ?? props.initialCurrentState ?? {};
  const hasAnyOptions = options.length > 0;

  const selectedOption = useMemo(() => {
    if (!selectedKey) return null;
    return options.find((o) => optionKey(o) === selectedKey) ?? null;
  }, [options, selectedKey]);

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const [optJson, histJson] = await Promise.all([
        apiGet<any>(`/api/v1/assets/${props.assetId}/transition-options`),
        apiGet<any>(`/api/v1/assets/${props.assetId}/state-history`),
      ]);

      const optData = unwrapData<any>(optJson);
      const histData = unwrapData<any>(histJson);

      if (optData?.current) {
        setCurrentFromApi({
          code: typeof optData.current.code === "string" ? optData.current.code : undefined,
          name: typeof optData.current.label === "string" ? optData.current.label : undefined,
        });
      }

      const rawOptList = Array.isArray(optData)
        ? optData
        : Array.isArray(optData?.options)
        ? optData.options
        : [];

      const normalized: TransitionOption[] = rawOptList
  .map((r: any) => normalizeTransitionOption(r))
  .filter((o: TransitionOption) => Boolean(optionKey(o)));

      setOptions(normalized);

      const firstKey = normalized[0] ? optionKey(normalized[0]) : "";
      if (firstKey) setSelectedKey((prev) => (prev ? prev : firstKey));

      const rawHistList = Array.isArray(histData)
        ? histData
        : Array.isArray(histData?.items)
        ? histData.items
        : [];

      const histList: StateHistoryRow[] = rawHistList.map((r: any) => ({
        id: toNum(r?.id),
        from_state_code: r?.from_state_code ?? r?.from_code,
        from_state_label: r?.from_state_label ?? r?.from_label,
        to_state_code: r?.to_state_code ?? r?.to_code,
        to_state_label: r?.to_state_label ?? r?.to_label,
        reason: r?.reason,
        created_at: r?.created_at,
      }));

      setHistory(histList);
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
      setError(eAny?.message ?? "Gagal load lifecycle data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [props.assetId]);

  function openModal() {
    setSubmitError(null);
    setReason("");
    const firstKey = options[0] ? optionKey(options[0]) : "";
    setSelectedKey(firstKey);
    setIsModalOpen(true);
  }

  function closeModal() {
    if (submitting) return;
    setIsModalOpen(false);
  }

  async function submitTransition() {
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (!selectedOption) throw new Error("Target state belum dipilih");

      if (selectedOption.blocked) {
        const reasons = selectedOption.blocked_reasons?.length
          ? selectedOption.blocked_reasons.join(", ")
          : "Gate belum terpenuhi";
        throw new Error(`Transition blocked: ${reasons}`);
      }

      const payload: any = {
        reason: reason?.trim() ? reason.trim() : undefined,
        to_state_code: selectedOption.to_state_code,
        to_state_id: selectedOption.to_state_id,
      };

      const json = await apiPostJson<SubmitResult>(
        `/api/v1/assets/${props.assetId}/transition`,
        payload
      );

      const data = unwrapData<SubmitResult>(json);

      if (data?.mode === "APPROVAL_REQUIRED") {
        const approvalId = typeof data.approval_id === "number" ? data.approval_id : null;
        const created = data.created !== false;
        const returnTo = `/assets/${props.assetId}?tab=lifecycle`;

        setNotice({
          kind: "info",
          title: created ? "Approval created" : "Approval already pending",
          message: created
            ? "Transition membutuhkan approval. State asset akan berubah setelah approval diputuskan."
            : "Sudah ada approval PENDING untuk transition ini. Silakan buka approvals queue.",
          approvalId,
          returnTo,
        });
      } else {
        setNotice({
          kind: "success",
          title: "Transition applied",
          message: "State asset sudah berubah dan history tercatat.",
        });
      }

      setIsModalOpen(false);
      await loadAll();
      router.refresh();
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

      setSubmitError(eAny?.message ?? "Transition gagal");
      setNotice({
        kind: "error",
        title: "Submit failed",
        message: eAny?.message ?? "Transition gagal",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const gateEntries = useMemo(() => {
    const g = selectedOption?.gate_rules;
    if (!g || typeof g !== "object") return [];
    return Object.entries(g).filter(([_, v]) => v === true);
  }, [selectedOption]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm text-gray-500">Current state</div>
            <div className="text-lg font-semibold">
              {currentState?.name ? (
                <>
                  {currentState.name}{" "}
                  <span className="font-normal text-gray-500">
                    ({currentState.code ?? "-"})
                  </span>
                </>
              ) : (
                <span>{currentState.code ?? "-"}</span>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadAll}
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
              disabled={loading}
            >
              Refresh
            </button>

            {props.canTransition !== false ? (
              <button
                type="button"
                onClick={openModal}
                className="itam-primary-action-sm"
                disabled={loading || !hasAnyOptions}
                title={
                  !hasAnyOptions ? "Tidak ada transition config untuk state ini" : ""
                }
              >
                Transition
              </button>
            ) : (
              <span className="rounded-md border px-3 py-2 text-sm text-gray-400">
                Read only
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {notice && <NoticeBox notice={notice} onClose={() => setNotice(null)} />}

        {!loading && !error && !hasAnyOptions && (
          <div className="mt-3 rounded-md border bg-gray-50 p-3 text-sm text-gray-700">
            Tidak ada transition config untuk state ini.
          </div>
        )}
      </div>

      <div className="rounded-lg border">
        <div className="border-b p-4">
          <div className="text-base font-semibold">State history</div>
          <div className="text-sm text-gray-500">
            Append-only, audit-ready (asset_state_history)
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="text-sm text-gray-600">Loading...</div>
          ) : history.length === 0 ? (
            <div className="text-sm text-gray-600">Belum ada history.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500">
                  <tr>
                    <th className="py-2 pr-4">Waktu</th>
                    <th className="py-2 pr-4">Dari</th>
                    <th className="py-2 pr-4">Ke</th>
                    <th className="py-2 pr-4">Reason</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  {[...history]
                    .sort(
                      (a, b) =>
                        new Date(b.created_at ?? 0).getTime() -
                        new Date(a.created_at ?? 0).getTime()
                    )
                    .map((row, idx) => (
                      <tr key={row.id ?? idx} className="border-t">
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {fmtDateTime(row.created_at)}
                        </td>
                        <td className="py-2 pr-4">
                          {row.from_state_label
                            ? `${row.from_state_label} (${row.from_state_code ?? "-"})`
                            : row.from_state_code ?? "-"}
                        </td>
                        <td className="py-2 pr-4">
                          {row.to_state_label
                            ? `${row.to_state_label} (${row.to_state_code ?? "-"})`
                            : row.to_state_code ?? "-"}
                        </td>
                        <td className="py-2 pr-4">
                          {row.reason?.trim() ? row.reason : "-"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && props.canTransition !== false && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="border-b p-4">
              <div className="text-lg font-semibold">Transition lifecycle</div>
              <div className="text-sm text-gray-500">
                Pilih target state, lihat requirement, lalu submit.
              </div>
            </div>

            <div className="space-y-4 p-4">
              <div className="space-y-1">
                <div className="text-sm font-medium">Target state</div>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value)}
                  disabled={submitting || !hasAnyOptions}
                >
                  {options.map((o) => (
                    <option key={optionKey(o)} value={optionKey(o)}>
                      {o.blocked ? `⛔ ${optionText(o)}` : `✅ ${optionText(o)}`}
                    </option>
                  ))}
                </select>
              </div>

              {selectedOption && (
                <div className="rounded-md border bg-gray-50 p-3 text-sm text-gray-800">
                  <div className="mb-2 font-semibold">Requirements</div>

                  <div className="flex flex-wrap items-center gap-2">
                    {selectedOption.require_approval ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        Requires approval
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        Apply now
                      </span>
                    )}

                    {selectedOption.require_evidence ? (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                        Evidence required
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                        No evidence
                      </span>
                    )}
                  </div>

                  {selectedOption.require_approval && (
                    <div className="mt-2 text-xs text-gray-600">
                      Sistem akan membuat approval. State asset berubah setelah approval diputuskan.
                    </div>
                  )}

                  {gateEntries.length > 0 && (
                    <div className="mt-3">
                      <div className="font-medium">Gate rules</div>
                      <ul className="mt-1 list-disc pl-5">
                        {gateEntries.map(([k]) => (
                          <li key={k}>{friendlyGateLabel(k)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {gateEntries.length === 0 && (
                    <div className="mt-3 text-gray-600">Gate rules: -</div>
                  )}
                </div>
              )}

              {selectedOption?.blocked && (selectedOption.blocked_reasons?.length ?? 0) > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="font-semibold">Blocked</div>
                  <ul className="mt-1 list-disc pl-5">
                    {selectedOption.blocked_reasons!.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!selectedOption?.blocked && selectedOption && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                  Ready to transition.
                </div>
              )}

              <div className="space-y-1">
                <div className="text-sm font-medium">Reason (optional)</div>
                <textarea
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Contoh: Approved after ownership set"
                  disabled={submitting}
                />
              </div>

              {submitError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {submitError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t p-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitTransition}
                className="itam-primary-action-sm"
                disabled={submitting || !selectedOption || Boolean(selectedOption?.blocked)}
                title={selectedOption?.blocked ? "Blocked: lengkapi requirement dulu" : ""}
              >
                {submitting ? "Submitting..." : "Submit transition"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
