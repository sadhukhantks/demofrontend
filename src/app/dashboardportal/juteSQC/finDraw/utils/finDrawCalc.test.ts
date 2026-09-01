import { describe, expect, it } from "vitest";
import { gmsToLbs } from "./finDrawCalc";

describe("gmsToLbs (50-yd cut in grams → lbs/spyndle of 14,400 yds)", () => {
	it("1 lb over 50 yds = 288 lbs per spyndle (14400 / 50)", () => {
		expect(gmsToLbs(453.6)).toBeCloseTo(288, 6);
	});

	it("rounds to the 2-dp the sheet prints (~24 g cut ≈ 15.24 lbs)", () => {
		expect(gmsToLbs(24).toFixed(2)).toBe("15.24");
	});
});
