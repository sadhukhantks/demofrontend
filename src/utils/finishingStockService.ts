/**
 * Service layer for Finishing Stock — the daily physical count of pressed
 * bales and loose finishing WIP (cuts / bundles at each stage).
 *
 * Backend: /api/finishingStock (vowerp3be src/juteProduction/finishing_stock.py).
 * Spec: vowerp3be/docs/superpowers/specs/2026-09-17-finishing-stock-design.md.
 * Weights are never stored as totals: the backend returns total_kg computed as
 * wt_kg (loose, weighed) or qty * wt_per_unit_kg (bales).
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

export type FinishingStockBucket = "BALE" | "LOOSE";
/** jute_prod_finishing_quality.quality_type: 1 = Hessian (cloth), 2 = Sacking (bags). */
export type FinishingQualityType = 1 | 2;
/** 0 = Dept, 1 = Contract (LOOSE lines only). */
export type FinishingStockWorkBy = 0 | 1;
export type FinishingStockLooseUom = "CUTS" | "BDL" | "PCS";

export interface FinishingStockQuality {
  finishing_quality_id: number;
  item_id: number;
  item_code: string | null;
  item_name: string | null;
  quality_type: FinishingQualityType;
  std_bale_weight: number | null;
  packsheet_wt: number | null;
  no_of_bags: number | null;
  /** kg per grey cut = weaving quality finished_length (yds) x ozs_yds x 28.35 / 1000, resolved by item_id; null when no active weaving quality shares the item. */
  cut_wt_kg: number | null;
  /** kg per bag = std_bale_weight / no_of_bags; null unless both are set. */
  bag_wt_kg: number | null;
  /** kg per bundle = spec-sheet sacksewing `pcs_per_bundle` standard x bag_wt_kg; null when either is missing. */
  bundle_wt_kg: number | null;
}

export interface FinishingStockStage {
  code: string;
  label: string;
}

export interface FinishingStockCompany {
  co_id: number;
  co_name: string;
}

export interface FinishingStockSetup {
  qualities: FinishingStockQuality[];
  stages: FinishingStockStage[];
  companies: FinishingStockCompany[];
  loose_qty_uoms: FinishingStockLooseUom[];
}

export interface FinishingStockRow {
  finishing_stock_id: number;
  co_id: number;
  branch_id: number;
  tran_date: string;
  bucket: FinishingStockBucket;
  finishing_quality_id: number;
  item_id: number;
  item_code: string | null;
  item_name: string | null;
  quality_type: FinishingQualityType;
  stage: string | null;
  stage_label: string | null;
  work_by: FinishingStockWorkBy;
  owner_co_id: number | null;
  owner_co_name: string | null;
  qty: number;
  qty_uom: string;
  wt_per_unit_kg: number | null;
  wt_kg: number | null;
  total_kg: number;
  remarks: string | null;
}

export interface FinishingStockDay {
  rows: FinishingStockRow[];
  prev_entry_date: string | null;
}

export interface FinishingStockCreatePayload {
  co_id: number;
  branch_id: number;
  tran_date: string;
  bucket: FinishingStockBucket;
  finishing_quality_id: number;
  stage: string | null;
  work_by: FinishingStockWorkBy;
  owner_co_id: number | null;
  qty: number;
  qty_uom: string;
  wt_per_unit_kg: number | null;
  wt_kg: number | null;
  remarks: string | null;
}

export type FinishingStockEditPayload = Omit<
  FinishingStockCreatePayload,
  "co_id" | "branch_id" | "tran_date"
>;

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface FinishingStockBaleLine {
  finishing_quality_id: number;
  item_id: number;
  item_name: string | null;
  bales: number;
  per_wt_kg: number | null;
  wt_mt: number;
}

export interface FinishingStockBaleTotal {
  bales: number;
  wt_mt: number;
}

export interface FinishingStockBaleBlock {
  owner_co_id: number | null;
  owner_co_name: string;
  is_own: boolean;
  hessian: FinishingStockBaleLine[];
  sacking: FinishingStockBaleLine[];
  hessian_total: FinishingStockBaleTotal;
  sacking_total: FinishingStockBaleTotal;
  total: FinishingStockBaleTotal;
}

export interface FinishingStockLooseLine {
  finishing_quality_id: number;
  item_id: number;
  item_name: string | null;
  wt_mt: number;
}

export interface FinishingStockLooseBlock {
  hessian: FinishingStockLooseLine[];
  sacking: FinishingStockLooseLine[];
  hessian_total_mt: number;
  sacking_total_mt: number;
  total_mt: number;
}

export interface FinishingStockLooseDetailLine {
  stage: string | null;
  stage_label: string | null;
  work_by: FinishingStockWorkBy;
  quality_type: FinishingQualityType;
  item_name: string | null;
  qty: number;
  qty_uom: string;
  wt_mt: number;
}

export interface FinishingStockDespatchLine {
  item_id: number;
  item_name: string | null;
  bales: number | null;
  qty: number;
  uom_name: string | null;
}

export interface FinishingStockReport {
  tran_date: string;
  co_name: string;
  branch_name: string;
  bales: FinishingStockBaleBlock[];
  loose: FinishingStockLooseBlock;
  loose_lines: FinishingStockLooseDetailLine[];
  despatch: FinishingStockDespatchLine[];
  totals: { bales_mt: number; loose_mt: number; stock_mt: number };
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

export async function fetchFinishingStockSetup(params: {
  coId: string | number;
  branchId: number;
}): Promise<FinishingStockSetup> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(params.coId));
  qs.set("branch_id", String(params.branchId));
  const url = `${apiRoutesPortalMasters.FINISHING_STOCK_SETUP}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: FinishingStockSetup }>(url);
  if (res.error || !res.data) throw new Error(res.error ?? "Failed to load setup");
  return res.data.data;
}

export async function fetchFinishingStockDay(params: {
  coId: string | number;
  branchId: number;
  tranDate: string;
}): Promise<FinishingStockDay> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(params.coId));
  qs.set("branch_id", String(params.branchId));
  qs.set("tran_date", params.tranDate);
  const url = `${apiRoutesPortalMasters.FINISHING_STOCK_ROWS_BY_DATE}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: FinishingStockDay }>(url);
  if (res.error || !res.data) throw new Error(res.error ?? "Failed to load stock rows");
  return res.data.data;
}

export async function createFinishingStockRow(payload: FinishingStockCreatePayload) {
  const res = await fetchWithCookie<{ data: { finishing_stock_id: number } }>(
    apiRoutesPortalMasters.FINISHING_STOCK_ROW_CREATE,
    "POST",
    payload,
  );
  return { ok: !res.error, error: res.error, id: res.data?.data?.finishing_stock_id ?? null };
}

export async function editFinishingStockRow(params: {
  id: number;
  coId: number;
  payload: FinishingStockEditPayload;
}) {
  const { id, coId, payload } = params;
  const url = `${apiRoutesPortalMasters.FINISHING_STOCK_ROW_EDIT}/${id}?co_id=${coId}`;
  const res = await fetchWithCookie(url, "PUT", payload);
  return { ok: !res.error, error: res.error, id };
}

export async function deleteFinishingStockRow(params: { id: number; coId: number }) {
  const { id, coId } = params;
  const url = `${apiRoutesPortalMasters.FINISHING_STOCK_ROW_DELETE}/${id}?co_id=${coId}`;
  const res = await fetchWithCookie(url, "DELETE");
  return { ok: !res.error, error: res.error, id };
}

export async function copyFinishingStockPreviousDay(payload: {
  co_id: number;
  branch_id: number;
  tran_date: string;
}) {
  const res = await fetchWithCookie<{ data: { copied: number; from_date: string } }>(
    apiRoutesPortalMasters.FINISHING_STOCK_COPY_PREVIOUS_DAY,
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

export async function fetchFinishingStockReport(params: {
  coId: string | number;
  branchId: number;
  tranDate: string;
}): Promise<FinishingStockReport> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(params.coId));
  qs.set("branch_id", String(params.branchId));
  qs.set("tran_date", params.tranDate);
  const url = `${apiRoutesPortalMasters.FINISHING_STOCK_REPORT}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: FinishingStockReport }>(url);
  if (res.error || !res.data) throw new Error(res.error ?? "Failed to load report");
  return res.data.data;
}
