import { describe, expect, it } from "vitest";
import { gmsToLbs } from "./interCardCalc";

describe("gmsToLbs (5-yd cut in grams → lbs/100yds)", () => {
	it("converts one pound over a 5-yd cut to 20 lbs/100yds", () => {
		expect(gmsToLbs(453.6)).toBeCloseTo(20, 6);
	});

	it("matches the mill sheet magnitude (~486 g cut ≈ 21.44 lbs)", () => {
		expect(gmsToLbs(486.25)).toBeCloseTo(21.44, 2);
	});
});
