import { describe, expect, it } from "vitest";
import { gmsToLbs } from "./drawheadCalc";

describe("gmsToLbs (10-yd cut in grams → lbs/100yds)", () => {
	it("453.6 g over 10 yds = 10 lbs/100yds", () => {
		expect(gmsToLbs(453.6)).toBeCloseTo(10, 6);
	});

	it("rounds to the sheet's 2 decimals (486.25 g ≈ 10.72 lbs)", () => {
		expect(gmsToLbs(486.25).toFixed(2)).toBe("10.72");
	});
});
