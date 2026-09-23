/**
 * Link from the Jute Gain/Loss ENTRY sheet to its computed statement
 * (TKT-000157). The report page reads `branch_id` and `month` (YYYY-MM) from
 * the query string; an unparseable month is simply not passed, and the report
 * falls back to its own default (last month).
 */
export const GAIN_LOSS_REPORT_PATH = "/dashboardportal/juteProduction/report/juteGainLoss";

export function gainLossReportHref(branchId: number | null, month: string): string {
	const qs = new URLSearchParams();
	if (branchId != null) qs.set("branch_id", String(branchId));
	if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) qs.set("month", month);
	const q = qs.toString();
	return q ? `${GAIN_LOSS_REPORT_PATH}?${q}` : GAIN_LOSS_REPORT_PATH;
}
