/**
 * EB No -> worker lookup for the follow-up forms, over the existing HRMS
 * endpoint GET /api/hrms/worker_by_eb_no/{eb_no}?branch_id= (untyped in
 * hrmsService, so the response is narrowed here).
 */

import { fetchWorkerByEbNo } from "@/utils/hrmsService";

export interface WorkerLookup {
  eb_id: number;
  eb_no: string;
  worker_name: string | null;
}

export type WorkerLookupResult =
  | { ok: true; worker: WorkerLookup }
  /** notFound = the EB No is not on the branch's rolls (404); otherwise a transport / server error. */
  | { ok: false; notFound: boolean; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads `{ data: { eb_id, eb_no, worker_name, ... } }` (or the bare object). */
export function parseWorkerLookup(payload: unknown): WorkerLookup | null {
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
  if (!isRecord(data)) return null;
  const ebId = Number(data.eb_id);
  if (data.eb_id == null || !Number.isFinite(ebId)) return null;
  const ebNo = typeof data.eb_no === "string" || typeof data.eb_no === "number" ? String(data.eb_no) : "";
  const name = typeof data.worker_name === "string" ? data.worker_name.replace(/\s+/g, " ").trim() : "";
  return { eb_id: ebId, eb_no: ebNo, worker_name: name || null };
}

/** Looks a worker up by EB No within a branch. Never throws. */
export async function lookupWorkerByEbNo(branchId: number, ebNo: string): Promise<WorkerLookupResult> {
  const trimmed = ebNo.trim();
  if (!trimmed) return { ok: false, notFound: true, message: "Enter an EB No" };
  try {
    const res = await fetchWorkerByEbNo(branchId, encodeURIComponent(trimmed));
    if (res.error) {
      return { ok: false, notFound: res.status === 404, message: res.error };
    }
    const payload: unknown = res.data;
    const worker = parseWorkerLookup(payload);
    if (!worker) return { ok: false, notFound: false, message: "Unexpected response from the employee lookup" };
    return { ok: true, worker };
  } catch (err: unknown) {
    return {
      ok: false,
      notFound: false,
      message: err instanceof Error ? err.message : "Employee lookup failed",
    };
  }
}
