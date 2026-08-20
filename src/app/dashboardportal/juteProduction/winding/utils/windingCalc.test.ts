import { describe, expect, it } from "vitest";
import { winderWiseRows, winderWiseTotal } from "./windingCalc";
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
		item_id: 5,
		item_code: "Y-8LB",
		item_name: "YARN 8LB",
		sum_production: 0,
		opening_jugar: 0,
		closing_jugar: 0,
		production_kg: 0,
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
