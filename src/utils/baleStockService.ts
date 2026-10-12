/**
 * Service layer for Bale Stock & Inspection — bale-level stock derived from
 * Bale Production (one `jute_prod_bale_entry` row = one bale), the inspection
 * marking of sacking bales and the bale -> sales-invoice despatch link.
 *
 * Backend: /api/baleStock (vowerp3be src/juteProduction/bale_stock.py).
 * Spec: vowerp3be/docs/superpowers/specs/2026-10-12-bale-stock-inspection-design.md §4 / §6.
 *
 * Every figure is "as on" a date: a bale counts from its press date, leaves
 * stock on the date it was opened for a REPACK or despatched (against a live
 * invoice, or without one on a challan / delivery order — spec §7b), and reads
 * as inspected from its inspection date.
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";
import type { FinishingQualityType } from "@/utils/finishingStockService";

/** Derived state of one bale as on the requested date. */
export type BaleStockStatus = "IN_STOCK" | "INSPECTED" | "DESPATCHED" | "REPACKED";
/** Grid filter codes — STOCK = IN_STOCK + INSPECTED; ALL = no filter. */
export type BaleStockFilter =
  | "STOCK"
  | "INSPECTED"
  | "NOT_INSPECTED"
  | "DESPATCHED"
  | "REPACKED"
  | "ALL";
/** BALE_PROD: the branch has bale entries, own-company bale stock is derived. */
export type BaleStockSource = "BALE_PROD" | "MANUAL";
export type BaleEntryType = "PROD" | "REPACK";

export interface BaleStockQuality {
  finishing_quality_id: number;
  item_id: number;
  item_name: string | null;
  quality_type: FinishingQualityType;
}

export interface BaleStockSeries {
  bale_series_id: number;
  series_name: string;
  quality_type: FinishingQualityType;
  item_id: number | null;
}

export interface BaleStockStatusOption {
  code: BaleStockFilter;
  label: string;
}

/** Why bales left without an invoice — CHALLAN, DELIVERY_ORDER, TRANSFER, SAMPLE, OTHER (spec §7b). */
export interface BaleDespatchReason {
  code: string;
  label: string;
}

export interface BaleStockSetup {
  qualities: BaleStockQuality[];
  series: BaleStockSeries[];
  statuses: BaleStockStatusOption[];
  bale_source: BaleStockSource;
  despatch_reasons: BaleDespatchReason[];
}

export interface BaleStockInspection {
  bale_inspection_id: number;
  inspection_date: string;
  inspection_ref: string | null;
  inspector: string | null;
  remarks: string | null;
}

export interface BaleStockDespatch {
  bale_despatch_id: number;
  /** Null for a despatch without an invoice (challan / DO / transfer / sample) — linkable later. */
  invoice_id: number | null;
  /** Invoice fields are all null when `invoice_id` is null. */
  invoice_no: number | null;
  invoice_date: string | null;
  invoice_type: number | null;
  /** sales status id of the invoice header; 4 / 6 mean the link is void. */
  invoice_status_id: number | null;
  party_name: string | null;
  despatch_date: string;
  /** Reason code (`BaleDespatchReason.code`); set when despatched without an invoice. */
  despatch_reason: string | null;
  despatch_reason_label: string | null;
  /** Challan / delivery-order / gate-pass number. */
  despatch_ref: string | null;
  remarks: string | null;
}

export interface BaleStockRepackedBy {
  bale_entry_id: number;
  bale_no: number;
  tran_date: string;
}

export interface BaleStockRow {
  bale_entry_id: number;
  tran_date: string;
  entry_type: BaleEntryType;
  bale_series_id: number;
  series_name: string | null;
  bale_no: number;
  original_bale_no: number | null;
  finishing_quality_id: number;
  item_id: number | null;
  item_name: string | null;
  quality_type: FinishingQualityType;
  gross_wt: number;
  net_wt: number;
  status: BaleStockStatus;
  inspection: BaleStockInspection | null;
  /** Present even when the invoice is cancelled (status then is not DESPATCHED). */
  despatch: BaleStockDespatch | null;
  repacked_by: BaleStockRepackedBy | null;
}

export interface BaleStockRowsResult {
  as_on: string;
  rows: BaleStockRow[];
  /** True when the server hit its row cap — narrow the filters. */
  truncated: boolean;
}

export interface BaleStockSummaryLine {
  finishing_quality_id: number;
  item_id: number | null;
  item_name: string | null;
  quality_type: FinishingQualityType;
  /** Bales in stock (IN_STOCK + INSPECTED) as on the date. */
  bales: number;
  inspected_bales: number;
  total_kg: number;
  inspected_kg: number;
  per_wt_kg: number | null;
  wt_mt: number;
  /** Information only — bales linked to live invoices up to the date. */
  despatched_bales: number;
}

/**
 * A summary line split further by the series the bales were numbered in
 * (PUNJAB, BIHAR, …). Sacking is despatched and inspected per consignee series,
 * so every stock view shows this breakup next to the per-quality figures
 * (spec §7a). The server returns every quality type; the UI keeps sacking.
 */
export type BaleStockSeriesLine = BaleStockSummaryLine & {
  bale_series_id: number;
  series_name: string | null;
};

export interface BaleStockSummaryGroup {
  bales: number;
  inspected_bales: number;
  wt_mt: number;
}

export interface BaleStockSummary {
  as_on: string;
  bale_source: BaleStockSource;
  lines: BaleStockSummaryLine[];
  totals: BaleStockSummaryGroup & {
    hessian: BaleStockSummaryGroup;
    sacking: BaleStockSummaryGroup;
  };
  /** One line per (series, quality), all quality types — filter to sacking. */
  series_lines: BaleStockSeriesLine[];
}

export interface BaleStockInvoiceLine {
  invoice_line_item_id: number;
  item_id: number | null;
  item_name: string | null;
  quantity: number;
  uom_name: string | null;
  qty_bales: number | null;
}

export interface BaleStockInvoice {
  invoice_id: number;
  invoice_no: number | null;
  invoice_date: string | null;
  invoice_type: number | null;
  invoice_type_name: string | null;
  party_name: string | null;
  status_id: number | null;
  lines: BaleStockInvoiceLine[];
  /** Bales already linked to this invoice (live links). */
  linked_bales: number;
}

export interface BaleStockRowsQuery {
  coId: string | number;
  branchId: number;
  asOn: string;
  status?: BaleStockFilter;
  qualityType?: FinishingQualityType | null;
  finishingQualityId?: number | null;
  baleSeriesId?: number | null;
  baleNoFrom?: number | null;
  baleNoTo?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface MarkInspectedPayload {
  co_id: number;
  branch_id: number;
  bale_entry_ids: number[];
  inspection_date: string;
  inspection_ref: string | null;
  inspector: string | null;
  remarks: string | null;
}

/**
 * POST /baleStock/despatch body. With `invoice_id` the bales are linked to that
 * invoice (`despatch_date` defaults to the invoice date); without it they are
 * marked despatched on a challan / DO and `despatch_date` + `despatch_reason`
 * are required (400 otherwise). Bales already despatched without an invoice
 * get the invoice attached ("relinked") instead of a second despatch row.
 */
export interface LinkInvoicePayload {
  co_id: number;
  branch_id: number;
  bale_entry_ids: number[];
  invoice_id: number | null;
  /** Null to default to the invoice date (invoice mode only). */
  despatch_date: string | null;
  /** `BaleDespatchReason.code`; required without an invoice. */
  despatch_reason: string | null;
  /** Challan / DO / gate-pass number, ≤ 100 chars. */
  despatch_ref: string | null;
  remarks: string | null;
}

export interface BaleIdsPayload {
  co_id: number;
  bale_entry_ids: number[];
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

function scopeParams(coId: string | number, branchId: number): URLSearchParams {
  const qs = new URLSearchParams();
  qs.set("co_id", String(coId));
  qs.set("branch_id", String(branchId));
  return qs;
}

export async function fetchBaleStockSetup(params: {
  coId: string | number;
  branchId: number;
}): Promise<BaleStockSetup> {
  const qs = scopeParams(params.coId, params.branchId);
  const url = `${apiRoutesPortalMasters.BALE_STOCK_SETUP}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: BaleStockSetup }>(url);
  if (res.error || !res.data) throw new Error(res.error ?? "Failed to load bale stock setup");
  return res.data.data;
}

export async function fetchBaleStockRows(params: BaleStockRowsQuery): Promise<BaleStockRowsResult> {
  const qs = scopeParams(params.coId, params.branchId);
  qs.set("as_on", params.asOn);
  if (params.status) qs.set("status", params.status);
  if (params.qualityType != null) qs.set("quality_type", String(params.qualityType));
  if (params.finishingQualityId != null) {
    qs.set("finishing_quality_id", String(params.finishingQualityId));
  }
  if (params.baleSeriesId != null) qs.set("bale_series_id", String(params.baleSeriesId));
  if (params.baleNoFrom != null) qs.set("bale_no_from", String(params.baleNoFrom));
  if (params.baleNoTo != null) qs.set("bale_no_to", String(params.baleNoTo));
  if (params.dateFrom) qs.set("date_from", params.dateFrom);
  if (params.dateTo) qs.set("date_to", params.dateTo);
  const url = `${apiRoutesPortalMasters.BALE_STOCK_BALES}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: BaleStockRowsResult }>(url);
  if (res.error || !res.data) throw new Error(res.error ?? "Failed to load bales");
  return res.data.data;
}

export async function fetchBaleStockSummary(params: {
  coId: string | number;
  branchId: number;
  asOn: string;
}): Promise<BaleStockSummary> {
  const qs = scopeParams(params.coId, params.branchId);
  qs.set("as_on", params.asOn);
  const url = `${apiRoutesPortalMasters.BALE_STOCK_SUMMARY}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: BaleStockSummary }>(url);
  if (res.error || !res.data) throw new Error(res.error ?? "Failed to load bale stock summary");
  return res.data.data;
}

export async function fetchBaleStockInvoices(params: {
  coId: string | number;
  branchId: number;
  asOn: string;
  days?: number;
}): Promise<BaleStockInvoice[]> {
  const qs = scopeParams(params.coId, params.branchId);
  qs.set("as_on", params.asOn);
  if (params.days != null) qs.set("days", String(params.days));
  const url = `${apiRoutesPortalMasters.BALE_STOCK_INVOICES}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: { rows: BaleStockInvoice[] } }>(url);
  if (res.error || !res.data) throw new Error(res.error ?? "Failed to load invoices");
  return res.data.data.rows;
}

// ---------------------------------------------------------------------------
// Mutations — {ok, error, …} like finishingStockService
// ---------------------------------------------------------------------------

export async function markBalesInspected(payload: MarkInspectedPayload) {
  const res = await fetchWithCookie<{ data: { marked: number } }>(
    apiRoutesPortalMasters.BALE_STOCK_INSPECT,
    "POST",
    payload,
  );
  return { ok: !res.error, error: res.error, marked: res.data?.data?.marked ?? 0 };
}

export async function unmarkBalesInspected(payload: BaleIdsPayload) {
  const res = await fetchWithCookie<{ data: { unmarked: number } }>(
    apiRoutesPortalMasters.BALE_STOCK_UNINSPECT,
    "POST",
    payload,
  );
  return { ok: !res.error, error: res.error, unmarked: res.data?.data?.unmarked ?? 0 };
}

/**
 * Mark bales despatched — against an invoice or without one (see
 * `LinkInvoicePayload`). `relinked` counts bales that were already despatched
 * without an invoice and now carry this one.
 */
export async function linkBalesToInvoice(payload: LinkInvoicePayload) {
  const res = await fetchWithCookie<{
    data: { linked: number; relinked?: number; uninspected_sacking: number };
  }>(apiRoutesPortalMasters.BALE_STOCK_DESPATCH, "POST", payload);
  return {
    ok: !res.error,
    error: res.error,
    linked: res.data?.data?.linked ?? 0,
    relinked: res.data?.data?.relinked ?? 0,
    uninspectedSacking: res.data?.data?.uninspected_sacking ?? 0,
  };
}

export async function unlinkBalesFromInvoice(payload: BaleIdsPayload) {
  const res = await fetchWithCookie<{ data: { unlinked: number } }>(
    apiRoutesPortalMasters.BALE_STOCK_UNDESPATCH,
    "POST",
    payload,
  );
  return { ok: !res.error, error: res.error, unlinked: res.data?.data?.unlinked ?? 0 };
}
