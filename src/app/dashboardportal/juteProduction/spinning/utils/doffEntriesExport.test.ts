import { describe, expect, it } from "vitest";
import type { DoffEntryRow } from "../types/spinningTypes";
import {
	DOFF_EXPORT_COLUMNS,
	doffEntriesSection,
	doffPeriodLabel,
	doffRowsMachineWise,
	doffTotalRow,
} from "./doffEntriesExport";

function row(over: Partial<DoffEntryRow>): DoffEntryRow {
	return {
		daily_doff_tbl_id: 1,
		doff_date: "2026-09-23",
		spell_id: 109,
		spell_code: "A",
		mc_id: 1,
		mech_code: "SF-1",
		machine_name: "Spinning Frame 1",
		trolly_id: 1,
		trolly_name: "T1",
		item_id: 5,
		item_source: "mapper",
		item_code: "16-SKWP",
		item_name: "16 lbs",
		eb_id: 9,
		eb_source: "sync",
		eb_name: "Asha",
		gross_weight: 10,
		tare_weight: 2,
		net_weight: 8,
		...over,
	};
}

const ROWS: DoffEntryRow[] = [
	row({ daily_doff_tbl_id: 3, mech_code: "SF-10", gross_weight: 12.5, tare_weight: 2.5, net_weight: 10 }),
	row({ daily_doff_tbl_id: 1, mech_code: "SF-2", gross_weight: 10.25, tare_weight: 2, net_weight: 8.25 }),
	row({ daily_doff_tbl_id: 2, mech_code: "SF-2", gross_weight: 11, tare_weight: 2, net_weight: 9 }),
];

describe("doffRowsMachineWise", () => {
	it("sorts numeric-aware by machine code, then doff id, without mutating", () => {
		const out = doffRowsMachineWise(ROWS);
		expect(out.map((r) => r.daily_doff_tbl_id)).toEqual([1, 2, 3]);
		expect(ROWS.map((r) => r.daily_doff_tbl_id)).toEqual([3, 1, 2]);
	});
});

describe("doffTotalRow", () => {
	it("sums the weights and counts the doffs", () => {
		const t = doffTotalRow(ROWS);
		expect(t.mech_code).toBe("Total");
		expect(t.machine_name).toBe("3 doff(s)");
		expect(t.gross_weight).toBe(33.75);
		expect(t.tare_weight).toBe(6.5);
		expect(t.net_weight).toBe(27.25);
	});
});

describe("doffEntriesSection", () => {
	it("is machine-wise with a trailing Total and the export columns", () => {
		const s = doffEntriesSection(ROWS);
		expect(s.columns).toBe(DOFF_EXPORT_COLUMNS);
		expect(s.columns[0].field).toBe("mech_code");
		expect(s.rows.map((r) => r.mech_code)).toEqual(["SF-2", "SF-2", "SF-10", "Total"]);
		expect(s.rows[3].net_weight).toBe(27.25);
		expect(s.rows[3].daily_doff_tbl_id).toBe("");
	});
	it("is empty when there are no doffs (no lone Total line)", () => {
		expect(doffEntriesSection([]).rows).toEqual([]);
	});
});

describe("doffPeriodLabel", () => {
	it("adds the spell code only when a spell is selected", () => {
		expect(doffPeriodLabel("2026-09-23", ROWS, null)).toBe("2026-09-23");
		expect(doffPeriodLabel("2026-09-23", ROWS, 109)).toBe("2026-09-23 (Spell A)");
		expect(doffPeriodLabel("2026-09-23", ROWS, 999)).toBe("2026-09-23");
	});
});
