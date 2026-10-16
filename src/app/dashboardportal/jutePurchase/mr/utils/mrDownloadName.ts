/** The date bounds the MR list can be filtered by (TKT-000226). */
export type MRListDateBounds = {
	/** MR date (from_date / to_date). */
	fromDate: string;
	toDate: string;
	/** Gate entry date (ge_from_date / ge_to_date). */
	geFromDate: string;
	geToDate: string;
};

/**
 * File-name tag for the MR Excel, mirroring the backend's
 * `mr_download_date_suffix`: the MR-date range, then `ge_` + the gate-entry
 * range, else `all`.
 */
export function mrDownloadSuffix(s: MRListDateBounds): string {
	const parts = [s.fromDate, s.toDate].filter(Boolean);
	const geParts = [s.geFromDate, s.geToDate].filter(Boolean);
	if (geParts.length > 0) parts.push(`ge_${geParts.join("_")}`);
	return parts.length > 0 ? parts.join("_") : "all";
}
