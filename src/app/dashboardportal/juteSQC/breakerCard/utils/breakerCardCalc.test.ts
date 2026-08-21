import { describe, expect, it } from "vitest";
import { computeRowPreview, gmsToLbs } from "./breakerCardCalc";

describe("gmsToLbs (5-yd cut in grams → lbs/100yds)", () => {
	it("matches the mill sheet magnitude (~486 g cut ≈ 21.4 lbs)", () => {
		expect(gmsToLbs(453.6)).toBeCloseTo(20, 6);
		expect(gmsToLbs(486.25)).toBeCloseTo(21.44, 2);
	});
});

describe("computeRowPreview CV% (owner's Excel, 2026-08-19)", () => {
	it("450/453/458/460 g @ MR 18/19.5/15/25 → CV 0.87% (pstdev of observed / mean)", () => {
		const p = computeRowPreview(["450", "453", "458", "460"], ["18", "19.5", "15", "25"]);
		expect(p?.cvPct).toBeCloseTo(0.87, 2);
	});
});
