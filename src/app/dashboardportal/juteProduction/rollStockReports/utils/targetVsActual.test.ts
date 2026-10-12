import { describe, expect, it } from "vitest";
import { isReportTotalRow } from "@/components/reports/ReportGrid";
import type { TargetVsActualResponse, TargetVsActualRow } from "../types/reportTypes";
import {
	buildTargetVsActualGridRows,
	describeTargetBasis,
	formatDmy,
	targetRowClass,
} from "./targetVsActual";

function row(overrides: Partial<TargetVsActualRow>): TargetVsActualRow {
	return {
		item_id: 501,
		quality_name: "A TD-7",
		maturity_hours: 48,
		maturity_source: "master",
		target_stock_date: "2026-10-09",
		target_date_clamped: false,
		target_mt: 10,
		actual_mt: 8,
		diff_mt: -2,
		diff_pct: -20,
		status: "short",
		...overrides,
	};
}

function response(rows: TargetVsActualRow[]): TargetVsActualResponse {
	return {
		as_of_dt: "2026-10-08 06:00:00",
		target_day: "2026-10-07",
		target_day_from: "2026-10-07 06:00:00",
		target_day_to: "2026-10-08 06:00:00",
		plan_window_from: "2026-10-07",
		plan_window_to: "2026-10-11",
		tolerance_pct: 10,
		rows,
		totals: {
			target_mt: 14,
			actual_mt: 10,
			diff_mt: -4,
			diff_pct: -28.6,
			status: "short",
			short_count: 1,
			excess_count: 1,
			excluded_waste_target_mt: 0,
			excluded_waste_count: 0,
		},
	};
}

describe("formatDmy", () => {
	it("formats dates and datetimes", () => {
		expect(formatDmy("2026-10-07")).toBe("07-10-2026");
		expect(formatDmy("2026-10-08 06:00:00")).toBe("08-10-2026 06:00");
		expect(formatDmy("2026-10-08T14:00")).toBe("08-10-2026 14:00");
		expect(formatDmy(null)).toBe("");
		expect(formatDmy("garbage")).toBe("garbage");
	});
});

describe("buildTargetVsActualGridRows", () => {
	it("returns nothing without data or rows", () => {
		expect(buildTargetVsActualGridRows(null)).toEqual([]);
		expect(buildTargetVsActualGridRows(response([]))).toEqual([]);
	});

	it("appends a Total row that the report grid treats as a total", () => {
		const rows = buildTargetVsActualGridRows(
			response([row({}), row({ item_id: 502, quality_name: "D TD-6", status: "excess" })])
		);
		expect(rows).toHaveLength(3);
		expect(rows[0]).toMatchObject({ id: "501", status_label: "Short" });
		expect(rows[1]).toMatchObject({ id: "502", status_label: "Excess" });
		const total = rows[2];
		expect(total).toMatchObject({ id: "__total__", quality_name: "Total", target_mt: 14, diff_pct: -28.6 });
		expect(isReportTotalRow(total)).toBe(true);
		expect(isReportTotalRow(rows[0])).toBe(false);
	});

	it("falls back to the item id when the quality name is missing", () => {
		const rows = buildTargetVsActualGridRows(response([row({ quality_name: null })]));
		expect(rows[0].quality_name).toBe("Item 501");
	});
});

describe("targetRowClass", () => {
	it("tints short red and excess amber only", () => {
		expect(targetRowClass({ status: "short" })).toBe("report-perf-low");
		expect(targetRowClass({ status: "excess" })).toBe("report-perf-watch");
		expect(targetRowClass({ status: "on_target" })).toBe("");
		expect(targetRowClass({ status: "no_target" })).toBe("");
	});
});

describe("describeTargetBasis", () => {
	it("names the mill day, its window, the as-at time and the tolerance", () => {
		expect(describeTargetBasis(response([]))).toBe(
			"Target = Jute Issue Planner target roll stock for mill day 07-10-2026 " +
				"(07-10-2026 06:00 to 08-10-2026 06:00); actual = roll stock at 08-10-2026 06:00. " +
				"Within ±10% of target counts as on target."
		);
	});
});
