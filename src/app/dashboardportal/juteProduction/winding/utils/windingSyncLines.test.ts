import { describe, expect, it } from "vitest";
import {
	machineCode,
	removableAbsent,
	syncChangeLines,
	syncExceptionLines,
	syncSummary,
	winderLabel,
	type WindingSyncResult,
} from "./windingSyncLines";

const ref = (eb: number, code: string | null = `E${eb}`, name: string | null = `WINDER ${eb}`) => ({
	winding_daily_qlty_id: eb,
	eb_id: eb,
	emp_code: code,
	worker_name: name,
});
const mc = (code: string | null, name: string | null = null, id = 1) => ({
	machine_id: id,
	mech_code: code,
	machine_name: name,
});

function result(p: Partial<WindingSyncResult> = {}): WindingSyncResult {
	return {
		mode: "fill",
		attendance_missing: false,
		counts: { attendance_winders: 0, map_rows: 0, doff_winders: 0 },
		added: [],
		machine_filled: [],
		machine_updated: [],
		removed: [],
		exceptions: { machine_differs: [], absent_on_map: [], machine_ambiguous: [] },
		...p,
	};
}

// TKT-000171 — the winding Sync button's wording.
describe("winderLabel / machineCode", () => {
	it("uses the shared 'code - name' label and falls back to EB id", () => {
		expect(winderLabel(ref(1, "02413", "LAXMI DEBI"))).toBe("02413 - LAXMI DEBI");
		expect(winderLabel(ref(1, " 02413 ", null))).toBe("02413");
		expect(winderLabel(ref(1, null, "LAXMI"))).toBe("LAXMI");
		expect(winderLabel(ref(77, null, null))).toBe("EB 77");
	});

	it("prefers the machine code, then the name, then a dash", () => {
		expect(machineCode(mc("4101", "WINDING4101"))).toBe("4101");
		expect(machineCode(mc(null, "WINDING4101"))).toBe("WINDING4101");
		expect(machineCode(mc(" ", null))).toBe("—");
	});
});

describe("syncSummary", () => {
	it("says the map already matches when nothing happened", () => {
		expect(syncSummary(result())).toBe("Sync: map already matches attendance.");
	});

	it("counts every bucket with singular/plural", () => {
		const r = result({
			added: [{ ...ref(1), ...mc("4101"), item_id: 5, source: "attendance" }],
			machine_filled: [{ ...ref(2), ...mc("4102"), old_machine_id: null, old_mech_code: null, old_machine_name: null }],
			exceptions: {
				machine_differs: [
					{ ...ref(3), ...mc("4103"), old_machine_id: 9, old_mech_code: "4109", old_machine_name: null },
					{ ...ref(4), ...mc("4104"), old_machine_id: 9, old_mech_code: "4109", old_machine_name: null },
				],
				absent_on_map: [{ ...ref(5), has_doffs: false, other_spells: [] }],
				machine_ambiguous: [],
			},
		});
		expect(syncSummary(r)).toBe(
			"Sync: 1 winder added, 1 machine filled, 2 machines differ from attendance, 1 absent.",
		);
	});

	it("mentions missing attendance", () => {
		expect(syncSummary(result({ attendance_missing: true }))).toBe(
			"Sync: no attendance entered for this spell.",
		);
	});
});

describe("syncChangeLines / syncExceptionLines", () => {
	it("splits added winders by source and shows machine moves old → new", () => {
		const r = result({
			added: [
				{ ...ref(1, "02413", "LAXMI DEBI"), ...mc("4101"), item_id: 5, source: "attendance" },
				{ ...ref(2, "02414", "SITA"), ...mc(null), item_id: 9, source: "doff" },
			],
			machine_filled: [
				{ ...ref(3, "02415", "GITA"), ...mc("4102"), old_machine_id: null, old_mech_code: null, old_machine_name: null },
			],
			machine_updated: [
				{ ...ref(4, "02416", "RITA"), ...mc("4103"), old_machine_id: 9, old_mech_code: "4109", old_machine_name: null },
			],
			removed: [ref(5, "02417", "MITA")],
		});
		expect(syncChangeLines(r)).toEqual([
			"Added from attendance: 02413 - LAXMI DEBI (4101)",
			"Added because they have doffs (no attendance machine): 02414 - SITA",
			"Machine filled from attendance: 02415 - GITA → 4102",
			"Machine changed to the attendance machine: 02416 - RITA 4109 → 4103",
			"Removed (absent, no doffs): 02417 - MITA",
		]);
		expect(syncExceptionLines(r)).toEqual([]);
	});

	it("reports differences, absentees (with doffs / other spell) and ambiguity", () => {
		const r = result({
			attendance_missing: false,
			exceptions: {
				machine_differs: [
					{ ...ref(1, "02413", "LAXMI DEBI"), ...mc("4102"), old_machine_id: 9, old_mech_code: "4101", old_machine_name: null },
				],
				absent_on_map: [
					{ ...ref(2, "02414", "SITA"), has_doffs: true, other_spells: ["B"] },
					{ ...ref(3, "02415", "GITA"), has_doffs: false, other_spells: [] },
				],
				machine_ambiguous: [{ eb_id: 4, machine_ids: [41, 42], used_machine_id: 41 }],
			},
		});
		expect(syncChangeLines(r)).toEqual([]);
		expect(syncExceptionLines(r)).toEqual([
			"Map machine differs from attendance (not changed): 02413 - LAXMI DEBI map 4101 / attendance 4102",
			"On the map but no attendance in this spell: 02414 - SITA (has doffs, marked in B), 02415 - GITA",
			"Marked on more than one winding machine (first-marked used): EB 4 → #41 of [41, 42]",
		]);
		// only the un-doffed absentee is removable
		expect(removableAbsent(r).map((a) => a.eb_id)).toEqual([3]);
	});

	it("explains missing attendance first", () => {
		expect(syncExceptionLines(result({ attendance_missing: true }))[0]).toMatch(
			/^No attendance entered yet/,
		);
	});
});
