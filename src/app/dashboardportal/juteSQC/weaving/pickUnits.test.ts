import { describe, expect, it } from "vitest";
import { dmToPpi, equalsStandard, findRowsEqualToStandard, stdHint } from "./pickUnits";

describe("equalsStandard", () => {
	it("compares the typed picks/dm with the standard in PPI at 2 dp (server rule)", () => {
		// 48.7 picks/dm × 0.254 = 12.3698 PPI → 12.37 at 2 dp
		expect(dmToPpi(48.7)).toBeCloseTo(12.3698, 4);
		expect(equalsStandard(48.7, 12.37)).toBe(true);
		expect(equalsStandard(48.0, 12.37)).toBe(false);
	});

	it("is false without a value or without a standard", () => {
		expect(equalsStandard(null, 12.37)).toBe(false);
		expect(equalsStandard(undefined, 12.37)).toBe(false);
		expect(equalsStandard(48.7, null)).toBe(false);
		expect(equalsStandard(48.7, undefined)).toBe(false);
		expect(equalsStandard(48.7, 0)).toBe(false);
		expect(equalsStandard(0, 12.37)).toBe(false);
		expect(equalsStandard(Number.NaN, 12.37)).toBe(false);
	});
});

describe("findRowsEqualToStandard", () => {
	const standards = { 5: { std_picks_ppi: 12.37 }, 6: { std_picks_ppi: 10 } };

	it("returns only the indices of rows equal to their quality's standard", () => {
		const rows = [
			{ weaving_quality_id: 5, picks_dm: 48.7 }, // equal
			{ weaving_quality_id: 5, picks_dm: 47.0 }, // measured
			{ weaving_quality_id: 6, picks_dm: 39.37 }, // 39.37 × 0.254 = 10.00 → equal
			{ weaving_quality_id: 5, picks_dm: 48.7 }, // equal again
		];
		expect(findRowsEqualToStandard(rows, standards)).toEqual([0, 2, 3]);
	});

	it("ignores rows whose quality has no standard or that carry no picks", () => {
		const rows = [
			{ weaving_quality_id: 9, picks_dm: 48.7 }, // no standard for quality 9
			{ weaving_quality_id: 5, picks_dm: null }, // width-only
		];
		expect(findRowsEqualToStandard(rows, standards)).toEqual([]);
		expect(findRowsEqualToStandard([], standards)).toEqual([]);
	});
});

describe("stdHint", () => {
	it("shows the standard in picks/dm with PPI in brackets", () => {
		expect(stdHint({ std_picks_ppi: 12.37, std_picks_dm: 48.7 }, true)).toBe(
			"Std 48.70 picks/dm (12.37 PPI)"
		);
	});

	it("explains a missing standard or a missing quality", () => {
		expect(stdHint(undefined, true)).toBe("No standard for this quality");
		expect(stdHint(undefined, false)).toBe("Select a quality to see its standard");
		expect(stdHint({ std_picks_ppi: 12.37, std_picks_dm: 48.7 }, false)).toBe(
			"Select a quality to see its standard"
		);
	});
});
