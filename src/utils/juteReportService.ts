import axios from "axios";
import { fetchWithCookie } from "./apiClient2";
import { apiRoutesPortalMasters } from "./api";
import type {
  JuteStockReportRow,
  BatchCostReportRow,
  MrListReportRow,
  PaginatedReportApiResponse,
  ReportApiResponse,
} from "@/app/dashboardportal/jutePurchase/reports/types/reportTypes";

export async function fetchJuteStockReport(
  branchId: number,
  date: string,
): Promise<JuteStockReportRow[]> {
  const url = `${apiRoutesPortalMasters.JUTE_REPORT_STOCK}?branch_id=${branchId}&date=${date}`;
  const result = await fetchWithCookie<ReportApiResponse<JuteStockReportRow>>(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch jute stock report");
  }
  return result.data.data;
}

export async function fetchBatchCostReport(
  branchId: number,
  date: string,
): Promise<BatchCostReportRow[]> {
  const url = `${apiRoutesPortalMasters.JUTE_REPORT_BATCH_COST}?branch_id=${branchId}&date=${date}`;
  const result = await fetchWithCookie<ReportApiResponse<BatchCostReportRow>>(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch batch cost report");
  }
  return result.data.data;
}

export interface FetchMrListParams {
  coId: number;
  branchId: number | null;
  dateFrom: string;
  dateTo: string;
  page?: number;
  limit?: number;
  search?: string;
}

export async function fetchMrListReport(
  params: FetchMrListParams,
): Promise<{ data: MrListReportRow[]; total: number }> {
  const { coId, branchId, dateFrom, dateTo, page, limit, search } = params;
  const qs = new URLSearchParams();
  qs.append("co_id", String(coId));
  if (branchId != null) qs.append("branch_id", String(branchId));
  qs.append("date_from", dateFrom);
  qs.append("date_to", dateTo);
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
      try {
        const text = await err.response.data.text();
        const parsed = JSON.parse(text) as { detail?: string };
        throw new Error(parsed.detail ?? "Tally download failed");
      } catch {
        throw new Error("Tally download failed");
      }
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}
