import axios from "axios";

export type ExcelBlobParams = {
	coId?: number | string | null;
	branchId?: number | string | null;
	search?: string | null;
	fromDate?: string | null;
	toDate?: string | null;
	/** Gate-entry-date bounds (ge_from_date / ge_to_date), beside the document-date ones (TKT-000226). */
	geFromDate?: string | null;
	geToDate?: string | null;
	branchIds?: string | null;
	statusId?: number | string | null;
	includeCompleted?: boolean;
};

/**
 * GET an .xlsx blob from a backend route, applying optional filters as query
 * params. Error JSON inside a Blob response is surfaced as the Error message.
 */
export async function fetchExcelBlob(url: string, params: ExcelBlobParams): Promise<Blob> {
	const qs = new URLSearchParams();
	if (params.coId !== null && params.coId !== undefined && String(params.coId) !== "")
		qs.append("co_id", String(params.coId));
	if (params.branchId !== null && params.branchId !== undefined && String(params.branchId) !== "")
		qs.append("branch_id", String(params.branchId));
	if (params.branchIds && params.branchIds.trim()) qs.append("branch_ids", params.branchIds.trim());
	if (params.search && params.search.trim()) qs.append("search", params.search.trim());
	if (params.statusId !== null && params.statusId !== undefined && String(params.statusId) !== "")
		qs.append("status_id", String(params.statusId));
	if (params.fromDate) qs.append("from_date", params.fromDate);
	if (params.toDate) qs.append("to_date", params.toDate);
	if (params.geFromDate) qs.append("ge_from_date", params.geFromDate);
	if (params.geToDate) qs.append("ge_to_date", params.geToDate);
	if (params.includeCompleted) qs.append("include_completed", "1");

	const fullUrl = `${url}?${qs.toString()}`;

	try {
		const response = await axios.get<Blob>(fullUrl, {
			responseType: "blob",
			withCredentials: true,
		});
		return response.data;
	} catch (err: unknown) {
		if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
			// Throw outside the try — a throw inside it was swallowed by its own catch.
			let detail: string | undefined;
			try {
				detail = (JSON.parse(await err.response.data.text()) as { detail?: string }).detail;
			} catch {
				// non-JSON error body
			}
			throw new Error(detail ?? "Excel download failed");
		}
		throw err instanceof Error ? err : new Error(String(err));
	}
}
