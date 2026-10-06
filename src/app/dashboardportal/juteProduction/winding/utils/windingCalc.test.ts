import { describe, expect, it } from "vitest";
import { winderWiseRows, winderWiseShiftTotals, winderWiseTotal } from "./windingCalc";
import type { WindingSpellReportRow } from "../types/windingTypes";

function rec(p: Partial<WindingSpellReportRow>): WindingSpellReportRow {
	return {
		tran_date: "2026-08-18",
		spell_id: 97,
		spell_code: "A1",
		shift: "A",
		eb_id: 10,
		emp_code: "02413",
		worker_name: "LAXMI",
		machine_id: null,
		mech_code: null,
		machine_name: null,
		item_id: 5,
		item_code: "Y-8LB",
		item_name: "YARN 8LB",
		sum_production: 0,
		opening_jugar: 0,
		closing_jugar: 0,
		production_kg: 0,
		target_kg: null,
		...p,
	};
}

describe("winderWiseRows", () => {
	it("shows the reconciled kg, not the raw doff sum (TKT-000087)", () => {
		const out = winderWiseRows(
			[rec({ sum_production: 454, opening_jugar: 12, closing_jugar: 5, production_kg: 447 })],
			97,
		);
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({
			winder: "02413 - LAXMI",
			item_code: "Y-8LB",
			sum_production: 454,
			opening_jugar: 12,
			closing_jugar: 5,
			production_kg: 447,
		});
		expect(winderWiseTotal(out)).toBe(447);
	});

	it("keeps only the selected spell, and every spell when none is selected", () => {
		const rows = [
			rec({ spell_id: 97, sum_production: 100, production_kg: 100 }),
			rec({ spell_id: 100, eb_id: 11, emp_code: "02500", worker_name: "RAM", sum_production: 60, opening_jugar: 10, production_kg: 50 }),
		];
		expect(winderWiseRows(rows, 97)).toHaveLength(1);
		expect(winderWiseTotal(winderWiseRows(rows, 100))).toBe(50);
		expect(winderWiseTotal(winderWiseRows(rows, null))).toBe(150);
	});

	it("keeps rows whose worker or quality did not resolve", () => {
		const out = winderWiseRows(
			[
				rec({
					eb_id: null,
					emp_code: null,
					worker_name: null,
					item_id: null,
					item_code: null,
					sum_production: 7,
					production_kg: 7,
				}),
			],
			null,
		);
		expect(out[0]).toMatchObject({ winder: "—", item_code: "—", production_kg: 7 });
	});
});

// TKT-000169 — machine, target and every shift on the Winder Wise Production tab.
describe("winderWiseRows machine + target (TKT-000169)", () => {
	it("labels the machine by code, falls back to name, and shows a dash when unmapped", () => {
		const out = winderWiseRows(
			[
				rec({ eb_id: 1, mech_code: "4102", machine_name: "WINDING 4102" }),
				rec({ eb_id: 2, mech_code: null, machine_name: "WINDING 77" }),
				rec({ eb_id: 3, mech_code: null, machine_name: null }),
			],
			null,
		);
		expect(out.map((r) => r.machine).sort()).toEqual(["4102", "WINDING 77", "—"].sort());
	});

	it("carries the target through, and keeps a missing target null rather than 0", () => {
		const out = winderWiseRows(
			[
				rec({ eb_id: 1, target_kg: 120 }),
				rec({ eb_id: 2, target_kg: 0 }),
				rec({ eb_id: 3, target_kg: null }),
			],
			null,
		);
		const byEb = Object.fromEntries(out.map((r) => [r.eb_id, r.target_kg]));
		expect(byEb).toEqual({ 1: 120, 2: 0, 3: null });
	});

	it("with no spell selected returns all three shifts, ordered A, B, C then winder", () => {
		const out = winderWiseRows(
			[
				rec({ spell_id: 101, spell_code: "C", shift: "C", eb_id: 5, emp_code: "T1", worker_name: "ZED", production_kg: 30 }),
				rec({ spell_id: 109, spell_code: "A", shift: "A", eb_id: 6, emp_code: "02", worker_name: "BOB", production_kg: 10 }),
				rec({ spell_id: 110, spell_code: "B", shift: "B", eb_id: 7, emp_code: "03", worker_name: "AMY", production_kg: 20 }),
				rec({ spell_id: 109, spell_code: "A", shift: "A", eb_id: 8, emp_code: "01", worker_name: "CAL", production_kg: 15 }),
			],
			null,
		);
		expect(out.map((r) => `${r.shift}:${r.winder}`)).toEqual([
			"A:01 - CAL",
			"A:02 - BOB",
			"B:03 - AMY",
			"C:T1 - ZED",
		]);
		expect(winderWiseTotal(out)).toBe(75);
	});

	it("sorts a spell that resolves to no shift last", () => {
		const out = winderWiseRows(
			[
				rec({ spell_id: 1, spell_code: null, shift: null, eb_id: 1, production_kg: 1 }),
				rec({ spell_id: 110, spell_code: "B", shift: "B", eb_id: 2, production_kg: 2 }),
			],
			null,
		);
		expect(out.map((r) => r.shift)).toEqual(["B", ""]);
	});
});

describe("winderWiseShiftTotals", () => {
	const rows = () =>
		winderWiseRows(
			[
				rec({ spell_id: 109, shift: "A", eb_id: 1, production_kg: 100, target_kg: 120 }),
				rec({ spell_id: 109, shift: "A", eb_id: 2, production_kg: 80, target_kg: 120 }),
				// same winder, second spell inside shift A -> still one winder
				rec({ spell_id: 98, spell_code: "A2", shift: "A", eb_id: 1, item_id: 6, production_kg: 5, target_kg: null }),
				rec({ spell_id: 110, shift: "B", eb_id: 3, production_kg: 90, target_kg: 120 }),
			],
			null,
		);

	it("always lists A, B and C; an empty shift reads 0", () => {
		const t = winderWiseShiftTotals(rows());
		expect(t.map((x) => x.shift)).toEqual(["A", "B", "C"]);
		expect(t[2]).toEqual({ shift: "C", winders: 0, production_kg: 0, target_kg: null });
	});

	it("sums production, counts distinct winders and sums only the targets that exist", () => {
		const [a, b] = winderWiseShiftTotals(rows());
		expect(a).toEqual({ shift: "A", winders: 2, production_kg: 185, target_kg: 240 });
		expect(b).toEqual({ shift: "B", winders: 1, production_kg: 90, target_kg: 120 });
	});

	it("target is null for every shift when no quality has a target", () => {
		const t = winderWiseShiftTotals(
			winderWiseRows([rec({ shift: "A", production_kg: 10 })], null),
		);
		expect(t.every((x) => x.target_kg === null)).toBe(true);
	});

	it("adds an Other bucket only when a row resolves to no shift", () => {
		const none = winderWiseShiftTotals(rows());
		expect(none.some((x) => x.shift === "Other")).toBe(false);
		const withOther = winderWiseShiftTotals(
			winderWiseRows([rec({ spell_id: 1, spell_code: null, shift: null, production_kg: 7 })], null),
		);
		expect(withOther[3]).toMatchObject({ shift: "Other", production_kg: 7 });
	});
});
