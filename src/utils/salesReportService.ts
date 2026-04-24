import axios from "axios";
import { apiRoutesPortalMasters } from "./api";

export interface FetchSalesJuteTallyParams {
  coId: number;
  branchId?: number | null;
  dateFrom: string;
  dateTo: string;
}

export async function fetchSalesJuteTallyDownload(
  params: FetchSalesJuteTallyParams,
): Promise<Blob> {
  const { coId, branchId, dateFrom, dateTo } = params;
  const qs = new URLSearchParams();
  qs.append("co_id", String(coId));
  if (branchId != null) qs.append("branch_id", String(branchId));
  qs.append("date_from", dateFrom);
  qs.append("date_to", dateTo);

  const url = `${apiRoutesPortalMasters.SALES_REPORT_JUTE_TALLY_DOWNLOAD}?${qs.toString()}`;
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
        throw new Error(parsed.detail ?? "Sales tally download failed");
      } catch {
        throw new Error("Sales tally download failed");
      }
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}
