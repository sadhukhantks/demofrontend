import type {
	TargetStockStatus,
	TargetVsActualResponse,
	TargetVsActualRow,
} from "../types/reportTypes";

/** Grid row: API row plus id and the printable status (total row included). */
export type TargetVsActualGridRow = Omit<TargetVsActualRow, "item_id" | "quality_name"> & {
	id: string;
	item_id: number | null;
	quality_name: string;
	status_label: string;
};

export const TARGET_STATUS_LABEL: Record<TargetStockStatus, string> = {
	on_target: "On target",
	short: "Short",
	excess: "Excess",
	no_target: "No target",
};

/** "2026-10-07" or "2026-10-07 06:00:00" -> "07-10-2026" / "07-10-2026 06:00". */
export function formatDmy(value: string | null | undefined): string {
	if (!value) return "";
	const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(value);
	if (!m) return value;
	const date = `${m[3]}-${m[2]}-${m[1]}`;
	return m[4] ? `${date} ${m[4]}:${m[5]}` : date;
}

/** Quality rows followed by a "Total" row (ReportGrid / Excel shade it as a total). */
export function buildTargetVsActualGridRows(
	data: TargetVsActualResponse | null
): TargetVsActualGridRow[] {
	if (!data || data.rows.length === 0) return [];
	const rows: TargetVsActualGridRow[] = data.rows.map((r) => ({
		...r,
		id: String(r.item_id),
		quality_name: r.quality_name ?? `Item ${r.item_id}`,
		status_label: TARGET_STATUS_LABEL[r.status],
	}));
	const t = data.totals;
	rows.push({
		id: "__total__",
		item_id: null,
		quality_name: "Total",
		maturity_hours: null,
		maturity_source: null,
		target_stock_date: null,
		target_date_clamped: false,
		target_mt: t.target_mt,
		actual_mt: t.actual_mt,
		diff_mt: t.diff_mt,
		diff_pct: t.diff_pct,
		status: t.status,
		status_label: TARGET_STATUS_LABEL[t.status],
	});
	return rows;
}

/** Row tint: red for short, amber for excess (ReportGrid's shared perf classes). */
export function targetRowClass(row: { status: TargetStockStatus }): string {
	if (row.status === "short") return "report-perf-low";
	if (row.status === "excess") return "report-perf-watch";
	return "";
}

/** One-line explanation of which plan day the target belongs to. */
export function describeTargetBasis(data: TargetVsActualResponse): string {
	return (
		`Target = Jute Issue Planner target roll stock for mill day ${formatDmy(data.target_day)} ` +
		`(${formatDmy(data.target_day_from)} to ${formatDmy(data.target_day_to)}); ` +
		`actual = roll stock at ${formatDmy(data.as_of_dt)}. ` +
		`Within ±${data.tolerance_pct}% of target counts as on target.`
	);
}
