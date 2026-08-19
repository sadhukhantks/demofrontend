import { describe, expect, it } from "vitest";
import { groupFrameWise, populationStdDev, prevShiftRef, sampleStdDev } from "./spinningCalc";
import type { DoffEntryRow } from "../types/spinningTypes";

function doff(p: Partial<DoffEntryRow>): DoffEntryRow {
	return {
		daily_doff_tbl_id: 1,
		doff_date: "2026-08-01",
		spell_id: 1,
		spell_code: "A",
		mc_id: 11,
		mech_code: "F-01",
		machine_name: "FRAME 1",
		trolly_id: 1,
		trolly_name: "T1",
		item_id: 5,
		item_source: "mapper",
		item_code: "Y-8LB",
		item_name: "Yarn 8LB",
		eb_id: 10,
		eb_source: "sync",
		eb_name: "02413 - LAXMI DEBI",
		gross_weight: 0,
		tare_weight: 0,
		net_weight: 0,
		...p,
	};
}

describe("groupFrameWise", () => {
	it("groups by frame+quality, lists nets, averages them", () => {
		const rows = groupFrameWise([
			doff({ net_weight: 34 }),
			doff({ net_weight: 45, eb_name: "02901 - SITA DEVI" }),
			doff({ mc_id: 12, mech_code: "F-02", item_id: 6, item_code: "Y-10LB", net_weight: 40 }),
		]);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			frame: "F-01",
			item_code: "Y-8LB",
			operators: "02413 - LAXMI DEBI, 02901 - SITA DEVI",
			doffs: 2,
			weights: "34 + 45",
			total: 79,
			avg_doff: 39.5,
			prev_avg_doff: null,
		});
		expect(rows[1]).toMatchObject({ frame: "F-02", doffs: 1, avg_doff: 40 });
	});

	it("carries the previous shift average for the same frame+quality only", () => {
		const rows = groupFrameWise(
			[doff({ net_weight: 40 })],
			[doff({ net_weight: 30 }), doff({ net_weight: 36 }), doff({ mc_id: 99, net_weight: 5 })],
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].prev_avg_doff).toBe(33);
	});
});

describe("prevShiftRef", () => {
	const spells = [{ spell_id: 1 }, { spell_id: 2 }, { spell_id: 3 }];

	it("returns the preceding spell on the same date", () => {
		expect(prevShiftRef(spells, 2, "2026-08-01")).toEqual({ spellId: 1, date: "2026-08-01" });
	});

	it("rolls back to the previous date's last spell on the first spell", () => {
		expect(prevShiftRef(spells, 1, "2026-08-01")).toEqual({ spellId: 3, date: "2026-07-31" });
	});

	it("returns null for an unknown or missing spell", () => {
		expect(prevShiftRef(spells, 99, "2026-08-01")).toBeNull();
		expect(prevShiftRef(spells, null, "2026-08-01")).toBeNull();
	});
});

describe("populationStdDev / sampleStdDev", () => {
	// e:\ejmhands\cvp.xlsx — the lab's R-08-15 working: MV 10.86, SD = SQRT(SUM((x-mean)^2)/30) = 1.6159, CV 14.88.
	const lab = [11.4, 9.8, 12.2, 10.4, 11, 10.2, 10.4, 10.2, 9.6, 11, 12, 10.4, 10.4, 16.2, 10, 10.2, 9.4, 9.6, 12.4, 10.2, 11.4, 9.8, 16.2, 10.4, 10.4, 9.8, 10.2, 9.6, 11, 10];

	it("population SD matches the lab Excel sheet (÷n)", () => {
		const sd = populationStdDev(lab);
		expect(sd).not.toBeNull();
		expect(sd as number).toBeCloseTo(1.6159, 3);
		const mean = lab.reduce((a, b) => a + b, 0) / lab.length;
		expect(((sd as number) / mean) * 100).toBeCloseTo(14.88, 2);
	});

	it("population vs sample on a 2-value set", () => {
		expect(populationStdDev([4, 8])).toBe(2);
		expect(sampleStdDev([4, 8])).toBeCloseTo(Math.SQRT2 * 2, 10);
	});

	it("population SD is 0 for one value and null for none", () => {
		expect(populationStdDev([5])).toBe(0);
		expect(populationStdDev([])).toBeNull();
		expect(populationStdDev([Number.NaN])).toBeNull();
	});
});
