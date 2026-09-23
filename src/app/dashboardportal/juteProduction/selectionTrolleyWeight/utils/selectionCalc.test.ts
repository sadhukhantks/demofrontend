import { describe, expect, it } from "vitest";
import {
	computeNet,
	computeTotals,
	formatDateDMY,
	formatKg,
	formatKgGrouped,
	formatTare,
	formatTime,
	gateEntriesForQuality,
	gateEntryHasQuality,
	gateEntryLabel,
	gateEntryShort,
	isFutureISODate,
	qualityLabel,
	rollupByQuality,
	todayISO,
	trollyLabel,
} from "./selectionCalc";
import { buildDefaultSelectionFormValues, buildSelectionEntryPayload, selectionEntrySchema } from "./selectionSchema";
import type { SelectionGateEntryOption, SelectionRow } from "../types/selectionTypes";

function row(p: Partial<SelectionRow>): SelectionRow {
	return {
		selection_wt_id: 1,
		co_id: 1,
		branch_id: 2,
		tran_date: "2026-01-24",
		spell_id: null,
		spell_code: null,
		item_id: 10,
		item_code: "DTD5",
		item_name: "D TD 5",
		trolly_id: 4,
		trolly_name: "74",
		jute_mr_id: null,
		gate_entry_no: null,
		gate_entry_date: null,
		trolly_wt: 77,
		gross_wt: 250.5,
		net_wt: 173.5,
		weigh_time: "2026-01-24 10:15:00",
		remarks: null,
		...p,
	};
}

function gateEntry(p: Partial<SelectionGateEntryOption>): SelectionGateEntryOption {
	return {
		jute_mr_id: 120,
		gate_entry_no: 36,
		gate_entry_date: "2026-01-20",
		supplier_name: "ABC Jute",
		item_ids: [10, 11],
		issued_kg: 21480,
		...p,
	};
}

describe("computeNet (D2)", () => {
	it("subtracts the trolley tare only", () => {
		expect(computeNet(250.5, 77)).toBe(173.5);
		expect(computeNet(300, 61.5)).toBe(238.5);
	});

	it("treats a null/undefined tare as zero", () => {
		expect(computeNet(294, null)).toBe(294);
		expect(computeNet(294, undefined)).toBe(294);
	});

	it("rounds to 3 decimals so float noise never reaches the preview", () => {
		expect(computeNet(0.3, 0.1)).toBe(0.2);
		expect(computeNet(100.0005, 0)).toBe(100.001);
	});

	it("can go to zero or negative — the form, not the helper, blocks the save", () => {
		expect(computeNet(77, 77)).toBe(0);
		expect(computeNet(50, 77)).toBe(-27);
	});
});

describe("computeTotals", () => {
	it("counts trolleys and sums gross / tare / net", () => {
		const rows = [
			row({ selection_wt_id: 1, gross_wt: 250.5, trolly_wt: 77, net_wt: 173.5 }),
			row({ selection_wt_id: 2, gross_wt: 300.25, trolly_wt: 61.5, net_wt: 238.75 }),
		];
		expect(computeTotals(rows)).toEqual({ trolleys: 2, gross_wt: 550.75, trolly_wt: 138.5, net_wt: 412.25 });
	});

	it("is all zeros for an empty day", () => {
		expect(computeTotals([])).toEqual({ trolleys: 0, gross_wt: 0, trolly_wt: 0, net_wt: 0 });
	});

	it("coerces numeric strings the API may return", () => {
		const r = row({ gross_wt: "100.5" as unknown as number, trolly_wt: "0.5" as unknown as number, net_wt: "100" as unknown as number });
		expect(computeTotals([r])).toEqual({ trolleys: 1, gross_wt: 100.5, trolly_wt: 0.5, net_wt: 100 });
	});
});

describe("rollupByQuality", () => {
	it("groups by item_id, counting trolleys and summing net, ordered by item_name", () => {
		const rows = [
			row({ selection_wt_id: 1, item_id: 20, item_name: "M6 (B.BOT)", net_wt: 100 }),
			row({ selection_wt_id: 2, item_id: 10, item_name: "D TD 5", net_wt: 173.5 }),
			row({ selection_wt_id: 3, item_id: 10, item_name: "D TD 5", net_wt: 26.5 }),
		];
		expect(rollupByQuality(rows)).toEqual([
			{ item_id: 10, item_name: "D TD 5", trolleys: 2, net_wt: 200 },
			{ item_id: 20, item_name: "M6 (B.BOT)", trolleys: 1, net_wt: 100 },
		]);
	});

	it("returns an empty list for no rows", () => {
		expect(rollupByQuality([])).toEqual([]);
	});
});

describe("gate entries by quality (D7)", () => {
	const ge36 = gateEntry({ jute_mr_id: 120, gate_entry_no: 36, item_ids: [10, 11] });
	const ge37 = gateEntry({ jute_mr_id: 121, gate_entry_no: 37, item_ids: [11] });
	const ge38 = gateEntry({ jute_mr_id: 122, gate_entry_no: 38, item_ids: [] });

	it("keeps only gate entries that issued the chosen quality", () => {
		expect(gateEntriesForQuality([ge36, ge37, ge38], 10).map((g) => g.jute_mr_id)).toEqual([120]);
		expect(gateEntriesForQuality([ge36, ge37, ge38], 11).map((g) => g.jute_mr_id)).toEqual([120, 121]);
		expect(gateEntriesForQuality([ge36, ge37, ge38], 99)).toEqual([]);
	});

	it("offers every gate entry while no quality is chosen", () => {
		expect(gateEntriesForQuality([ge36, ge37], null)).toHaveLength(2);
	});

	it("gateEntryHasQuality drives the auto-clear when the quality changes", () => {
		expect(gateEntryHasQuality(ge36, 10)).toBe(true);
		expect(gateEntryHasQuality(ge36, 12)).toBe(false);
		expect(gateEntryHasQuality(null, 10)).toBe(false);
		expect(gateEntryHasQuality(ge36, null)).toBe(false);
	});

	it("tolerates item_ids arriving as numeric strings", () => {
		const g = gateEntry({ item_ids: ["10" as unknown as number] });
		expect(gateEntryHasQuality(g, 10)).toBe(true);
	});
});

describe("labels", () => {
	it("quality label appends the issued kg", () => {
		expect(qualityLabel({ item_id: 10, item_code: "X", item_name: "D TD 5", issued_kg: 21480 })).toBe("D TD 5 · 21,480 kg issued");
		expect(qualityLabel({ item_id: 10, item_code: "X", item_name: "D TD 5", issued_kg: null })).toBe("D TD 5 · 0 kg issued");
	});

	it("gate entry label is GE no · date · supplier, dropping missing parts", () => {
		expect(gateEntryLabel(gateEntry({}))).toBe("GE 36 · 20-Jan-2026 · ABC Jute");
		expect(gateEntryLabel(gateEntry({ supplier_name: null }))).toBe("GE 36 · 20-Jan-2026");
		expect(gateEntryLabel(gateEntry({ gate_entry_date: null, supplier_name: null }))).toBe("GE 36");
		expect(gateEntryLabel(gateEntry({ gate_entry_no: null }))).toBe("GE 120 · 20-Jan-2026 · ABC Jute");
	});

	it("trolley label shows the tare with 3 decimals", () => {
		expect(trollyLabel({ trolly_id: 4, trolly_name: "74", trolly_weight: 77, trolly_posting_code: null })).toBe("74 (tare 77.000 kg)");
		expect(trollyLabel({ trolly_id: 4, trolly_name: "74", trolly_weight: null, trolly_posting_code: null })).toBe("74 (tare 0.000 kg)");
	});

	it("gateEntryShort is blank without a gate entry", () => {
		expect(gateEntryShort({ jute_mr_id: null, gate_entry_no: null })).toBe("");
		expect(gateEntryShort({ jute_mr_id: 120, gate_entry_no: 36 })).toBe("GE 36");
	});
});

describe("formatters", () => {
	it("formatKg strips trailing zeros and caps at 3 dp", () => {
		expect(formatKg(294)).toBe("294");
		expect(formatKg(293.5)).toBe("293.5");
		expect(formatKg(0.1234)).toBe("0.123");
		expect(formatKg(null)).toBe("");
	});

	it("formatTare is fixed 3 dp", () => {
		expect(formatTare(77)).toBe("77.000");
		expect(formatTare("61.5" as unknown as number)).toBe("61.500");
	});

	it("formatKgGrouped rounds and groups", () => {
		expect(formatKgGrouped(21480.4)).toBe("21,480");
		expect(formatKgGrouped(null)).toBe("0");
	});

	it("formatDateDMY renders dd-MMM-yyyy", () => {
		expect(formatDateDMY("2026-01-20")).toBe("20-Jan-2026");
		expect(formatDateDMY("2026-12-05 10:00:00")).toBe("05-Dec-2026");
		expect(formatDateDMY(null)).toBe("");
		expect(formatDateDMY("garbage")).toBe("garbage");
	});

	it("formatTime returns HH:mm from a MySQL datetime or ISO string", () => {
		expect(formatTime("2026-09-22 10:15:00")).toBe("10:15");
		expect(formatTime("2026-09-22T10:15:00")).toBe("10:15");
		expect(formatTime(null)).toBe("");
	});

	it("date helpers", () => {
		expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(isFutureISODate("2999-01-01")).toBe(true);
		expect(isFutureISODate("2000-01-01")).toBe(false);
		expect(isFutureISODate("")).toBe(false);
	});
});

describe("selectionEntrySchema + payload", () => {
	it("requires quality, trolley and a gross weight in range", () => {
		const r = selectionEntrySchema.safeParse(buildDefaultSelectionFormValues());
		expect(r.success).toBe(false);
		if (!r.success) {
			const paths = r.error.issues.map((i) => i.path[0]);
			expect(paths).toContain("item_id");
			expect(paths).toContain("trolly_id");
			expect(paths).toContain("gross_wt");
		}
	});

	it("rejects gross above the max or with too many decimals", () => {
		const base = { ...buildDefaultSelectionFormValues(), item_id: "10", trolly_id: "4" };
		expect(selectionEntrySchema.safeParse({ ...base, gross_wt: "5001" }).success).toBe(false);
		expect(selectionEntrySchema.safeParse({ ...base, gross_wt: "0.5" }).success).toBe(false);
		expect(selectionEntrySchema.safeParse({ ...base, gross_wt: "12.3456" }).success).toBe(false);
		expect(selectionEntrySchema.safeParse({ ...base, gross_wt: "250.5" }).success).toBe(true);
	});

	it("builds the API body with numbers and nulls", () => {
		const payload = buildSelectionEntryPayload(
			{ item_id: "10", jute_mr_id: "", trolly_id: "4", gross_wt: "250.5", remarks: "  " },
			{ coId: 1, branchId: 2, tranDate: "2026-01-24", spellId: null }
		);
		expect(payload).toEqual({
			co_id: 1,
			branch_id: 2,
			tran_date: "2026-01-24",
			spell_id: null,
			item_id: 10,
			trolly_id: 4,
			jute_mr_id: null,
			gross_wt: 250.5,
			remarks: null,
		});
		const withGe = buildSelectionEntryPayload(
			{ item_id: "10", jute_mr_id: "120", trolly_id: "4", gross_wt: "250.5", remarks: " ok " },
			{ coId: 1, branchId: 2, tranDate: "2026-01-24", spellId: 3 }
		);
		expect(withGe.jute_mr_id).toBe(120);
		expect(withGe.spell_id).toBe(3);
		expect(withGe.remarks).toBe("ok");
	});
});
