/**
 * Service layer for the Winding Stock daily count.
 *
 * Backend: /api/windingStock (vowerp3be src/juteProduction/winding_stock.py).
 * MT is never stored — the backend returns stock_mt computed as
 * no_of_samples * wt_per_sample / 1000.
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

export interface WindingStockYarnItem {
  item_id: number;
  item_code: string | null;
  item_name: string | null;
  quality_name: string | null;
  yarn_count: number | null;
}

export interface WindingStockArea {
  wastage_area_id: number;
  area_name: string;
  dept_id: number | null;
  branch_id: number | null;
}

export interface WindingStockSetup {
  buckets: string[];
  yarn_items: WindingStockYarnItem[];
  areas: WindingStockArea[];
}

export interface WindingStockRow {
  winding_stock_id: number;
  co_id: number;
  branch_id: number;
  tran_date: string;
  bucket: string;
  item_id: number | null;
  item_code: string | null;
  item_name: string | null;
  quality_name: string | null;
  yarn_count: number | null;
  package_label: string;
  wastage_area_id: number | null;
  area_name: string | null;
  no_of_samples: number;
  wt_per_sample: number;
  stock_mt: number;
  remarks: string | null;
}

export interface WindingStockDay {
  rows: WindingStockRow[];
  bucket_totals: Record<string, number>;
  grand_total_mt: number;
  prev_entry_date: string | null;
  locked: boolean;
}

export interface WindingStockCreatePayload {
  co_id: number;
  branch_id: number;
  tran_date: string;
  bucket: string;
  item_id: number | null;
  package_label: string;
  wastage_area_id: number | null;
  no_of_samples: number;
  wt_per_sample: number;
  remarks: string | null;
}

export type WindingStockEditPayload = Partial<
  Omit<WindingStockCreatePayload, "co_id" | "branch_id" | "tran_date">
>;

export async function fetchWindingStockSetup(params: {
  coId: string | number;
  branchId: number;
}): Promise<WindingStockSetup> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(params.coId));
  qs.set("branch_id", String(params.branchId));
  const url = `${apiRoutesPortalMasters.WINDING_STOCK_SETUP}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: WindingStockSetup }>(url);
  if (res.error || !res.data) throw new Error(res.error ?? "Failed to load setup");
  return res.data.data;
}

export async function fetchWindingStockDay(params: {
  coId: string | number;
  branchId: number;
  tranDate: string;
}): Promise<WindingStockDay> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(params.coId));
  qs.set("branch_id", String(params.branchId));
  qs.set("tran_date", params.tranDate);
  const url = `${apiRoutesPortalMasters.WINDING_STOCK_ROWS_BY_DATE}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: WindingStockDay }>(url);
  if (res.error || !res.data) throw new Error(res.error ?? "Failed to load stock rows");
  return res.data.data;
}

/**
 * The kg-per-piece last saved for this (item, package) key — the entire
 * weight-per-sample "master". Returns null for a key never counted before.
 */
export async function fetchWtDefault(params: {
  coId: string | number;
  branchId: number;
  itemId: number | null;
  packageLabel: string;
}): Promise<number | null> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(params.coId));
  qs.set("branch_id", String(params.branchId));
  qs.set("package_label", params.packageLabel);
  if (params.itemId != null) qs.set("item_id", String(params.itemId));
  const url = `${apiRoutesPortalMasters.WINDING_STOCK_WT_DEFAULT}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: { wt_per_sample: number | null } }>(url);
  if (res.error || !res.data) return null;
  return res.data.data.wt_per_sample;
}

export async function createWindingStockRow(payload: WindingStockCreatePayload) {
  const res = await fetchWithCookie<{ data: { winding_stock_id: number } }>(
    apiRoutesPortalMasters.WINDING_STOCK_ROW_CREATE,
    "POST",
    payload,
  );
  return { ok: !res.error, error: res.error, id: res.data?.data?.winding_stock_id ?? null };
}

export async function editWindingStockRow(params: {
  id: number;
  coId: number;
  payload: WindingStockEditPayload;
}) {
  const { id, coId, payload } = params;
  const url = `${apiRoutesPortalMasters.WINDING_STOCK_ROW_EDIT}/${id}?co_id=${coId}`;
  const res = await fetchWithCookie(url, "PUT", payload);
  return { ok: !res.error, error: res.error, id };
}

export async function deleteWindingStockRow(params: { id: number; coId: number }) {
  const { id, coId } = params;
  const url = `${apiRoutesPortalMasters.WINDING_STOCK_ROW_DELETE}/${id}?co_id=${coId}`;
  const res = await fetchWithCookie(url, "DELETE");
  return { ok: !res.error, error: res.error, id };
}

export async function copyPreviousDay(payload: {
  co_id: number;
  branch_id: number;
  tran_date: string;
}) {
  const res = await fetchWithCookie<{ data: { copied: number; from_date: string } }>(
    apiRoutesPortalMasters.WINDING_STOCK_COPY_PREVIOUS_DAY,
    "POST",
    payload,
  );
  return {
    ok: !res.error,
    error: res.error,
    copied: res.data?.data?.copied ?? 0,
    fromDate: res.data?.data?.from_date ?? null,
  };
}

export async function setWindingStockLock(params: {
  coId: number;
  branchId: number;
  tranDate: string;
  locked: boolean;
}) {
  const { coId, branchId, tranDate, locked } = params;
  const url = locked
    ? apiRoutesPortalMasters.WINDING_STOCK_LOCK
    : apiRoutesPortalMasters.WINDING_STOCK_UNLOCK;
  const body = { co_id: coId, branch_id: branchId, tran_date: tranDate };
  const res = await fetchWithCookie<{ data: { locked: boolean } }>(url, "POST", body);
  return { ok: !res.error, error: res.error, locked: res.data?.data?.locked ?? locked };
}
