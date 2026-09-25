import { describe, expect, it } from "vitest";
import { GAIN_LOSS_REPORT_PATH, gainLossReportHref } from "./reportHref";

describe("gainLossReportHref (TKT-000157)", () => {
	it("carries branch and month to the report page", () => {
		expect(gainLossReportHref(29, "2026-08")).toBe(
			`${GAIN_LOSS_REPORT_PATH}?branch_id=29&month=2026-08`,
		);
	});
	it("drops an unparseable month and a missing branch", () => {
		expect(gainLossReportHref(null, "")).toBe(GAIN_LOSS_REPORT_PATH);
		expect(gainLossReportHref(29, "2026-13")).toBe(`${GAIN_LOSS_REPORT_PATH}?branch_id=29`);
	});
});
