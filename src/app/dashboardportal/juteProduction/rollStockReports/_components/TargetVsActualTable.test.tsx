/**
 * @vitest-environment jsdom
 *
 * TKT-000170: Target vs Actual roll stock table on Roll Stock Reports > Stock As At.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TargetVsActualTable from "./TargetVsActualTable";
import type { TargetVsActualResponse } from "../types/reportTypes";

const exportRowsToExcel = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/components/reports/exportExcel", () => ({
	exportRowsToExcel: (...args: unknown[]) => exportRowsToExcel(...args),
}));

const data: TargetVsActualResponse = {
	as_of_dt: "2026-10-08 06:00:00",
	target_day: "2026-10-07",
	target_day_from: "2026-10-07 06:00:00",
	target_day_to: "2026-10-08 06:00:00",
	plan_window_from: "2026-10-07",
	plan_window_to: "2026-10-11",
	tolerance_pct: 10,
	rows: [
		{
			item_id: 501, quality_name: "A TD-7", maturity_hours: 48, maturity_source: "master",
			target_stock_date: "2026-10-09", target_date_clamped: false,
			target_mt: 16.447, actual_mt: 17.901, diff_mt: 1.454, diff_pct: 8.8, status: "on_target",
		},
		{
			item_id: 502, quality_name: "SN-1 TD-5", maturity_hours: 48, maturity_source: "default",
			target_stock_date: "2026-10-09", target_date_clamped: false,
			target_mt: 9.85, actual_mt: 0, diff_mt: -9.85, diff_pct: -100, status: "short",
		},
	],
	totals: {
		target_mt: 26.297, actual_mt: 17.901, diff_mt: -8.396, diff_pct: -31.9, status: "short",
		short_count: 1, excess_count: 0, excluded_waste_target_mt: 9.868, excluded_waste_count: 6,
	},
};

const header = { companyName: "SLS", branchName: "Mill", reportName: "Roll Stock Target vs Actual" };

afterEach(() => {
	cleanup();
	exportRowsToExcel.mockClear();
});

describe("TargetVsActualTable", () => {
	it("renders qualities, the total row, counts and the basis caption", () => {
		render(<TargetVsActualTable data={data} loading={false} error={null} exportHeader={header} />);
		expect(screen.getByText("A TD-7")).toBeTruthy();
		expect(screen.getByText("SN-1 TD-5")).toBeTruthy();
		expect(screen.getByText("Total")).toBeTruthy();
		expect(screen.getByText("Short: 1")).toBeTruthy();
		expect(screen.getByText("Excess: 0")).toBeTruthy();
		expect(screen.getByText(/mill day 07-10-2026/)).toBeTruthy();
		expect(screen.getByText(/Jute waste qualities with no rolls \(6, target 9\.868 MT\)/)).toBeTruthy();
		expect(screen.getByText(/48 h default used/)).toBeTruthy();
		const shortRow = screen.getByText("SN-1 TD-5").closest(".MuiDataGrid-row");
		expect(shortRow?.className).toContain("report-perf-low");
	});

	it("exports the grid rows including the total", () => {
		render(<TargetVsActualTable data={data} loading={false} error={null} exportHeader={header} />);
		fireEvent.click(screen.getByRole("button", { name: "Export Excel" }));
		expect(exportRowsToExcel).toHaveBeenCalledTimes(1);
		const [, rows, prefix, hdr] = exportRowsToExcel.mock.calls[0] as [unknown, Array<{ id: string }>, string, unknown];
		expect(rows.map((r) => r.id)).toEqual(["501", "502", "__total__"]);
		expect(prefix).toBe("roll-stock-target-vs-actual");
		expect(hdr).toEqual(header);
	});

	it("shows an info message when nothing is planned or in stock", () => {
		render(
			<TargetVsActualTable
				data={{ ...data, rows: [], totals: { ...data.totals, excluded_waste_count: 0 } }}
				loading={false}
				error={null}
				exportHeader={header}
			/>
		);
		expect(screen.getByText("No target or roll stock for this date and time.")).toBeTruthy();
		expect((screen.getByRole("button", { name: "Export Excel" }) as HTMLButtonElement).disabled).toBe(true);
	});
});
