import axios from "axios";
import { fetchWithCookie } from "./apiClient2";
import { apiRoutesPortalMasters } from "./api";
import type {
  JuteStockReportRow,
  JuteQtyWiseReportRow,
  JuteWithValueRow,
  JuteTxnSummaryRow,
  JutePeriodWiseRow,
  JuteMrInStockRow,
  JuteMrWiseRow,
  JuteGodownWiseRow,
  JutePercentClaimsRow,
  JuteMukhamMoistureRow,
  BatchCostReportRow,
  JuteIssueYarnWiseApiRow,
  IssuePlannerApiResponse,
  IssuePlannerReport,
  MrListReportRow,
  JuteMrIssueDetailRow,
  JuteMrMovementDetailRow,
  JuteMrOptionRow,
  JutePoOptionRow,
  JutePoMrReceiptDetailRow,
  JutePoPendingRow,
  PaginatedReportApiResponse,
  ReportApiResponse,
} from "@/app/dashboardportal/jutePurchase/reports/types/reportTypes";
import {
  parseBatchPlanStatus,
  type BatchPlanStatus,
} from "@/app/dashboardportal/jutePurchase/reports/batchCost/planStatus";

/** Reporting basis (decision D5, 2026-09-03): "actual" = today's reports;
 * "accounts" = receipt on jute_mr_date, approved weight, issues dated before
 * the MR date shifted to the MR date. Defaults to "actual" everywhere. */
export type JuteReportBasis = "actual" | "accounts";

export async function fetchJuteStockReport(
  branchId: number,
  date: string,
  basis: JuteReportBasis = "actual",
): Promise<JuteStockReportRow[]> {
  const url = `${apiRoutesPortalMasters.JUTE_REPORT_STOCK}?branch_id=${branchId}&date=${date}&basis=${basis}`;
  const result = await fetchWithCookie<ReportApiResponse<JuteStockReportRow>>(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch jute stock report");
  }
  return result.data.data;
}

export async function fetchBatchCostReport(
  branchId: number,
  date: string,
  basis: JuteReportBasis = "actual",
): Promise<BatchCostReportRow[]> {
  return (await fetchBatchCostReportWithPlan(branchId, date, basis)).rows;
}

/** The batch cost rows plus the plan status (TKT-000206): why planned weight
 * is 0 — no batch plan assigned for the day / a yarn quality, or no issue.
 * `planStatus` is null when the backend sends none. */
export async function fetchBatchCostReportWithPlan(
  branchId: number,
  date: string,
  basis: JuteReportBasis = "actual",
): Promise<{ rows: BatchCostReportRow[]; planStatus: BatchPlanStatus | null }> {
  const url = `${apiRoutesPortalMasters.JUTE_REPORT_BATCH_COST}?branch_id=${branchId}&date=${date}&basis=${basis}`;
  const result = await fetchWithCookie<
    ReportApiResponse<BatchCostReportRow> & { plan_status?: unknown }
  >(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch batch cost report");
  }
  return {
    rows: result.data.data,
    planStatus: parseBatchPlanStatus(result.data.plan_status),
  };
}

/** GET /api/juteReports/issue-yarn-wise (TKT-000214) — jute issued per yarn
 * quality on `date` and from the 1st of that month up to it, in kg. */
export async function fetchJuteIssueYarnWise(
  branchId: number,
  date: string,
): Promise<JuteIssueYarnWiseApiRow[]> {
  const qs = new URLSearchParams({ branch_id: String(branchId), date });
  const url = `${apiRoutesPortalMasters.JUTE_REPORT_ISSUE_YARN_WISE}?${qs.toString()}`;
  const result =
    await fetchWithCookie<ReportApiResponse<JuteIssueYarnWiseApiRow>>(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch jute issue yarn wise report");
  }
  return result.data.data;
}

// =============================================================================
// ISSUE SYNC (decision "Sync", 2026-09-03) — re-derive issue.weight /
// issue_value from the MR line's current actual_weight/actual_qty.
// =============================================================================

export interface SyncIssueWeightsRow {
  jute_issue_id: number;
  jute_mr_li_id: number;
  quantity: number;
  status_id: number;
  weight_before: number;
  weight_after: number;
  issue_value_before: number;
  issue_value_after: number;
}

export interface SyncIssueWeightsResponse {
  data: SyncIssueWeightsRow[];
  totals: {
    lines_processed: number;
    issues_processed: number;
    issues_changed: number;
    weight_before: number;
    weight_after: number;
  };
}

/** POST /api/juteIssue/sync_issue_weights — updates every non-rejected issue
 * (Draft/Open/Approved) on one MR in place, from the line's CURRENT weights. */
export async function syncIssueWeights(
  coId: number | string,
  mrId: number,
  branchId: number,
): Promise<SyncIssueWeightsResponse> {
  const url = `${apiRoutesPortalMasters.JUTE_ISSUE_SYNC_WEIGHTS}?co_id=${coId}`;
  const result = await fetchWithCookie<SyncIssueWeightsResponse>(url, "POST", {
    jute_mr_id: mrId,
    branch_id: branchId,
  });
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to sync issued weights");
  }
  return result.data;
}

export interface RepriceIssuesResult {
  issues_checked: number;
  issues_changed: number;
  value_before: number;
  value_after: number;
  /** MRs whose lines still have no rate — their issues stay at 0. */
  no_rate_mr_ids: number[];
}

/** POST /api/juteIssue/reprice_issues — Re-evaluate: re-prices every
 * non-rejected MR-sourced issue of the branch in the range from its MR line's
 * CURRENT rate (weights untouched). Used by the Batch Cost report. */
export async function repriceIssues(
  coId: number | string,
  branchId: number,
  dateFrom: string,
  dateTo: string,
): Promise<RepriceIssuesResult> {
  const url = `${apiRoutesPortalMasters.JUTE_ISSUE_REPRICE}?co_id=${coId}`;
  const result = await fetchWithCookie<{ data: RepriceIssuesResult }>(url, "POST", {
    branch_id: branchId,
    date_from: dateFrom,
    date_to: dateTo,
  });
  if (result.error || !result.data?.data) {
    throw new Error(result.error ?? "Failed to re-evaluate issue values");
  }
  return result.data.data;
}

export async function fetchJuteQtyWiseReport(
  branchId: number,
  dateFrom: string,
  dateTo: string,
): Promise<JuteQtyWiseReportRow[]> {
  const qs = new URLSearchParams({
    branch_id: String(branchId),
    date_from: dateFrom,
    date_to: dateTo,
  });
  const url = `${apiRoutesPortalMasters.JUTE_REPORT_QTY_WISE}?${qs.toString()}`;
  const result =
    await fetchWithCookie<ReportApiResponse<JuteQtyWiseReportRow>>(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch jute quantity wise report");
  }
  return result.data.data;
}

function dateRangeUrl(
  route: string,
  branchId: number,
  dateFrom: string,
  dateTo: string,
): string {
  const qs = new URLSearchParams({
    branch_id: String(branchId),
    date_from: dateFrom,
    date_to: dateTo,
  });
  return `${route}?${qs.toString()}`;
}

export function fetchJutePercentClaims(
  branchId: number,
  dateFrom: string,
  dateTo: string,
): Promise<JutePercentClaimsRow[]> {
  const url = dateRangeUrl(
    apiRoutesPortalMasters.JUTE_REPORT_PERCENT_CLAIMS,
    branchId,
    dateFrom,
    dateTo,
  );
  return fetchBranchReport<JutePercentClaimsRow>(
    url,
    "Failed to fetch percent claims report",
  );
}

export function fetchJuteMukhamMoisture(
  branchId: number,
  dateFrom: string,
  dateTo: string,
): Promise<JuteMukhamMoistureRow[]> {
  const url = dateRangeUrl(
    apiRoutesPortalMasters.JUTE_REPORT_MUKHAM_MOISTURE,
    branchId,
    dateFrom,
    dateTo,
  );
  return fetchBranchReport<JuteMukhamMoistureRow>(
    url,
    "Failed to fetch mukham moisture report",
  );
}

export async function fetchJuteWithValue(
  branchId: number,
  dateFrom: string,
  dateTo: string,
): Promise<JuteWithValueRow[]> {
  const qs = new URLSearchParams({
    branch_id: String(branchId),
    date_from: dateFrom,
    date_to: dateTo,
  });
  const url = `${apiRoutesPortalMasters.JUTE_REPORT_WITH_VALUE}?${qs.toString()}`;
  const result = await fetchWithCookie<ReportApiResponse<JuteWithValueRow>>(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch jute with value report");
  }
  return result.data.data;
}

export async function fetchJuteTxnSummary(
  branchId: number,
  dateFrom: string,
  dateTo: string,
  type: "R" | "I" | "ALL" = "ALL",
  search?: string,
): Promise<JuteTxnSummaryRow[]> {
  const qs = new URLSearchParams({
    branch_id: String(branchId),
    date_from: dateFrom,
    date_to: dateTo,
    type,
  });
  if (search) qs.append("search", search);
  const url = `${apiRoutesPortalMasters.JUTE_REPORT_TXN_SUMMARY}?${qs.toString()}`;
  const result = await fetchWithCookie<ReportApiResponse<JuteTxnSummaryRow>>(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch issue/receipt summary");
  }
  return result.data.data;
}

export async function fetchJutePeriodWise(
  branchId: number,
  dateFrom: string,
  dateTo: string,
  period: "month" | "day",
): Promise<JutePeriodWiseRow[]> {
  const qs = new URLSearchParams({
    branch_id: String(branchId),
    date_from: dateFrom,
    date_to: dateTo,
    period,
  });
  const url = `${apiRoutesPortalMasters.JUTE_REPORT_PERIOD_WISE}?${qs.toString()}`;
  const result = await fetchWithCookie<ReportApiResponse<JutePeriodWiseRow>>(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch period wise report");
  }
  return result.data.data;
}

/** Cluster B reports are current-position, branch-scoped only (no date). */
async function fetchBranchReport<T>(
  url: string,
  errMsg: string,
): Promise<T[]> {
  const result = await fetchWithCookie<ReportApiResponse<T>>(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? errMsg);
  }
  return result.data.data;
}

export function fetchJuteMrInStock(branchId: number): Promise<JuteMrInStockRow[]> {
  const url = `${apiRoutesPortalMasters.JUTE_REPORT_MR_IN_STOCK}?branch_id=${branchId}`;
  return fetchBranchReport<JuteMrInStockRow>(url, "Failed to fetch MR in stock report");
}

export function fetchJuteMrWise(branchId: number): Promise<JuteMrWiseRow[]> {
  const url = `${apiRoutesPortalMasters.JUTE_REPORT_MR_WISE}?branch_id=${branchId}`;
  return fetchBranchReport<JuteMrWiseRow>(url, "Failed to fetch MR wise report");
}

export function fetchJuteGodownWise(branchId: number): Promise<JuteGodownWiseRow[]> {
  const url = `${apiRoutesPortalMasters.JUTE_REPORT_GODOWN_WISE}?branch_id=${branchId}`;
  return fetchBranchReport<JuteGodownWiseRow>(url, "Failed to fetch godown wise report");
}

export interface FetchMrIssueDetailParams {
  coId: number;
  branchId: number;
  dateFrom: string;
  dateTo: string;
  /** Optional — when set the backend ignores the date range and returns every
   * issue of that MR. */
  mrId?: string;
}

export function fetchJuteMrIssueDetail(
  p: FetchMrIssueDetailParams,
): Promise<JuteMrIssueDetailRow[]> {
  const url =
    dateRangeUrl(
      apiRoutesPortalMasters.JUTE_REPORT_MR_ISSUE_DETAIL,
      p.branchId,
      p.dateFrom,
      p.dateTo,
    ) +
    `&co_id=${p.coId}` +
    (p.mrId ? `&mr_id=${encodeURIComponent(p.mrId)}` : "");
  return fetchBranchReport<JuteMrIssueDetailRow>(
    url,
    "Failed to fetch MR issue detail report",
  );
}

/** MR-wise Movement Detail — same scope params as the Issue Detail report,
 * with raw-jute sales unioned in. */
export function fetchJuteMrMovementDetail(
  p: FetchMrIssueDetailParams,
): Promise<JuteMrMovementDetailRow[]> {
  const url =
    dateRangeUrl(
      apiRoutesPortalMasters.JUTE_REPORT_MR_MOVEMENT_DETAIL,
      p.branchId,
      p.dateFrom,
      p.dateTo,
    ) +
    `&co_id=${p.coId}` +
    (p.mrId ? `&mr_id=${encodeURIComponent(p.mrId)}` : "");
  return fetchBranchReport<JuteMrMovementDetailRow>(
    url,
    "Failed to fetch MR movement detail report",
  );
}

/** MR picker options for one branch. Dates are optional — the picker lists
 * every eligible MR so a user can reach an MR outside the report period. */
export function fetchJuteMrOptions(
  coId: number,
  branchId: number,
  dateFrom?: string,
  dateTo?: string,
): Promise<JuteMrOptionRow[]> {
  const qs = new URLSearchParams({
    co_id: String(coId),
    branch_id: String(branchId),
  });
  if (dateFrom) qs.append("date_from", dateFrom);
  if (dateTo) qs.append("date_to", dateTo);
  const url = `${apiRoutesPortalMasters.JUTE_REPORT_MR_OPTIONS}?${qs.toString()}`;
  return fetchBranchReport<JuteMrOptionRow>(url, "Failed to fetch MR list");
}

/** PO picker options for one branch. Dates optional — the picker lists every
 * live PO so a user can reach a PO outside the report period. */
export function fetchJutePoOptions(
  coId: number,
  branchId: number,
  dateFrom?: string,
  dateTo?: string,
): Promise<JutePoOptionRow[]> {
  const qs = new URLSearchParams({
    co_id: String(coId),
    branch_id: String(branchId),
  });
  if (dateFrom) qs.append("date_from", dateFrom);
  if (dateTo) qs.append("date_to", dateTo);
  const url = `${apiRoutesPortalMasters.JUTE_REPORT_PO_OPTIONS}?${qs.toString()}`;
  return fetchBranchReport<JutePoOptionRow>(url, "Failed to fetch PO list");
}

export interface FetchPoMrReceiptDetailParams {
  coId: number;
  branchId: number;
  dateFrom: string;
  dateTo: string;
  /** Optional — when set the backend ignores the date range and returns every
   * receipt of that PO. */
  poId?: string;
}

/** PO-wise MR Receipt Detail — ordered vs received per PO item, one row per
 * matched MR line. */
export function fetchJutePoMrReceiptDetail(
  p: FetchPoMrReceiptDetailParams,
): Promise<JutePoMrReceiptDetailRow[]> {
  const url =
    dateRangeUrl(
      apiRoutesPortalMasters.JUTE_REPORT_PO_MR_RECEIPT_DETAIL,
      p.branchId,
      p.dateFrom,
      p.dateTo,
    ) +
    `&co_id=${p.coId}` +
    (p.poId ? `&po_id=${encodeURIComponent(p.poId)}` : "");
  return fetchBranchReport<JutePoMrReceiptDetailRow>(
    url,
    "Failed to fetch PO MR receipt detail report",
  );
}

/** Pending PO report — current position, no dates. */
export function fetchJutePoPending(
  coId: number,
  branchId: number,
): Promise<JutePoPendingRow[]> {
  const url =
    `${apiRoutesPortalMasters.JUTE_REPORT_PO_PENDING}` +
    `?co_id=${coId}&branch_id=${branchId}`;
  return fetchBranchReport<JutePoPendingRow>(
    url,
    "Failed to fetch pending PO report",
  );
}

export type MrListStatusMode = "approved" | "all";

export interface FetchMrListParams {
  coId: number;
  branchId: number | null;
  dateFrom: string;
  dateTo: string;
  page?: number;
  limit?: number;
  search?: string;
  /** "approved" (default): approved / finalised MRs by MR date. "all": every MR,
   *  placed by its MR date or, when it has none yet, its gate-entry date. */
  status?: MrListStatusMode;
}

export async function fetchMrListReport(
  params: FetchMrListParams,
): Promise<{ data: MrListReportRow[]; total: number }> {
  const { coId, branchId, dateFrom, dateTo, page, limit, search, status } = params;
  const qs = new URLSearchParams();
  qs.append("co_id", String(coId));
  if (branchId != null) qs.append("branch_id", String(branchId));
  qs.append("date_from", dateFrom);
  qs.append("date_to", dateTo);
  if (status && status !== "approved") qs.append("status", status);
  if (page != null) qs.append("page", String(page));
  if (limit != null) qs.append("limit", String(limit));
  if (search) qs.append("search", search);

  const url = `${apiRoutesPortalMasters.JUTE_REPORT_MR_LIST}?${qs.toString()}`;
  const result = await fetchWithCookie<PaginatedReportApiResponse<MrListReportRow>>(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch MR list report");
  }
  return {
    data: result.data.data ?? [],
    total: result.data.total ?? 0,
  };
}

export interface FetchJuteTallyDownloadParams {
  coId: number;
  branchId: number | null;
  dateFrom: string;
  dateTo: string;
}

export async function fetchJuteTallyDownload(
  params: FetchJuteTallyDownloadParams,
): Promise<Blob> {
  const { coId, branchId, dateFrom, dateTo } = params;
  const qs = new URLSearchParams();
  qs.append("co_id", String(coId));
  if (branchId != null) qs.append("branch_id", String(branchId));
  qs.append("date_from", dateFrom);
  qs.append("date_to", dateTo);

  const url = `${apiRoutesPortalMasters.JUTE_REPORT_TALLY_DOWNLOAD}?${qs.toString()}`;
  try {
    const response = await axios.get<Blob>(url, {
      responseType: "blob",
      withCredentials: true,
    });
    return response.data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
      let detail: string | undefined;
      try {
        detail = (JSON.parse(await err.response.data.text()) as { detail?: string }).detail;
      } catch {
        // non-JSON error body
      }
      throw new Error(detail ?? "Tally download failed");
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export async function fetchJuteIssuePlanner(
  branchId: number,
  date: string,
): Promise<IssuePlannerReport> {
  const qs = new URLSearchParams({
    branch_id: String(branchId),
    date,
  });
  const url = `${apiRoutesPortalMasters.JUTE_REPORT_ISSUE_PLANNER}?${qs.toString()}`;
  const result = await fetchWithCookie<IssuePlannerApiResponse>(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch jute issue planner report");
  }
  return result.data.data;
}
