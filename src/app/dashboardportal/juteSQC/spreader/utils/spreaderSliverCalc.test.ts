import { describe, expect, it } from "vitest";
import { gmsToLbs } from "./spreaderSliverCalc";

describe("gmsToLbs (5-yd spreader sliver cut in grams → lbs/100yds)", () => {
	it("converts one pound over a 5-yd cut to 20 lbs/100yds", () => {
		expect(gmsToLbs(453.6)).toBeCloseTo(20, 6);
	});

	// sls TKT-153 row #6 (2026-09-01): calc_avg_obs 1484.9 g, calc_avg_corr 1203.852 g.
	it("matches the sls sheet magnitude (~1484.9 g cut ≈ 65.47 lbs)", () => {
		expect(gmsToLbs(1484.9)).toBeCloseTo(65.47, 2);
		expect(gmsToLbs(1203.852)).toBeCloseTo(53.08, 2);
	});
});
