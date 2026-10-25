import { describe, expect, it } from "vitest";
import { cutsFromMeter, diffMeter, missingStandards } from "./beamingCalc";

// Regression for TKT-000075: unconfigured jute_prod_beaming_target_map params
// resolve to 0 server-side and silently zero every derived figure. The form must
// name them (grouped by the page that sets them) instead of showing blank calcs.
describe("missingStandards", () => {
	it("names every unset param grouped by source page", () => {
		// The sls co-106 state that produced the ticket: machine speed/dia configured,
		// no quality standards, no SQC actual RPM.
		expect(missingStandards({ std_speed: 925, dia: 11.875 })).toEqual([
			"Laid Length, Cuts / Beam, Std Eff % — set in Beaming Standards → Quality / Standard",
			"Actual RPM — set in Beaming SQC → Actual RPM",
		]);
	});

	it("returns nothing when every param resolves", () => {
		expect(
			missingStandards({
				laid_length: 165,
				cuts_per_beam: 20,
				std_eff: 80,
				std_speed: 40,
				dia: 10.75,
				act_rpm: 40,
			})
		).toEqual([]);
	});

	it("treats 0 / null / absent standards alike and tolerates no response", () => {
		expect(missingStandards({ laid_length: 0, cuts_per_beam: null }).length).toBe(3);
		expect(missingStandards(null)).toEqual([]);
	});
});

describe("meter reading", () => {
	it("diffMeter handles a plain run and a counter wrap", () => {
		expect(diffMeter(1000, 15268, 100000)).toBe(14268);
		expect(diffMeter(99900, 50, 100000)).toBe(150);
		expect(diffMeter(500, 400, 0)).toBe(-100);
	});
	it("cutsFromMeter rounds to whole cuts and needs laid length", () => {
		expect(cutsFromMeter(57072, 174, 4)).toBe(82);
		expect(cutsFromMeter(57072, 0, 4)).toBe(0);
	});
});
