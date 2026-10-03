import { describe, expect, it } from "vitest";
import type { HandsNormRow } from "./_service";
import {
	describeHandsPerMachine,
	describePerHand,
	describeTarget,
	emptyForm,
	formFromRow,
	handsPerUnitToUnits,
	rowKind,
	toPayload,
	unitsToHandsPerUnit,
	validateHandsNormForm,
	type HandsNormForm,
} from "./_schema";

const machineForm: HandsNormForm = {
	...emptyForm("2026-10-01"),
	designation_id: 20,
	norm_kind: "M",
	scope: "group",
	machine_group_id: 3,
	units_per_hand: "2",
};

const productionForm: HandsNormForm = {
	...emptyForm("2026-10-01"),
	designation_id: 21,
	norm_kind: "P",
	scope: "dept",
	scope_dept_id: 9,
	qty_per_hand: "315",
	qty_uom: "kg",
};

/** A row as a PRE-v2 backend returns it: no norm_kind / group / units fields. */
const legacyRow: HandsNormRow = {
	hands_norm_id: 113,
	co_id: 2,
	branch_id: 29,
	designation_id: 2,
	designation: "JUTE ISSUE MAZDOOR",
	dept_id: 14,
	dept: "JUTE(EJM)",
	direct_indirect: "I",
	variable_fixed: "V",
	shift_a: 5,
	shift_b: 0,
	shift_c: 0,
	shift_g: 0,
	machine_type_id: null,
	machine_type_name: null,
	hands_per_machine: null,
	norms_text: "10 MT / HAND, 5 IN A",
	effective_date: "2000-01-01",
	active: 1,
	computable: false,
	in_force: true,
	duplicate: false,
};

/** A v2 row: machine norm on a group. */
const groupRow: HandsNormRow = {
	...legacyRow,
	hands_norm_id: 200,
	designation: "WEAVER(H)",
	variable_fixed: "V",
	shift_a: 0,
	norm_kind: "M",
	machine_group_id: 3,
	machine_group: "Hessian looms",
	unit_label: "machine",
	units_per_hand: 2,
	hands_per_machine: 0.5,
	computable: true,
};

describe("validateHandsNormForm", () => {
	it("accepts a complete machine norm on a group and a production norm on a department", () => {
		expect(validateHandsNormForm(machineForm)).toEqual({});
		expect(validateHandsNormForm(productionForm)).toEqual({});
	});

	it("accepts a machine norm scoped by machine type", () => {
		expect(
			validateHandsNormForm({ ...machineForm, scope: "type", machine_group_id: "", machine_type_id: 7 })
		).toEqual({});
	});

	it("requires a designation and an effective date", () => {
		const errors = validateHandsNormForm({ ...emptyForm(""), shift_a: "1" });
		expect(errors.designation_id).toBeDefined();
		expect(errors.effective_date).toBeDefined();
	});

	it("an active machine norm needs the chosen scope and units per hand > 0", () => {
		const errors = validateHandsNormForm({ ...machineForm, machine_group_id: "", units_per_hand: "0" });
		expect(errors.machine_group_id).toMatch(/machine group/);
		expect(errors.units_per_hand).toMatch(/positive/);
		const missing = validateHandsNormForm({ ...machineForm, scope: "type", units_per_hand: "" });
		expect(missing.machine_type_id).toMatch(/machine type/);
		expect(missing.units_per_hand).toMatch(/greater than 0/);
		const dept = validateHandsNormForm({ ...machineForm, scope: "dept" });
		expect(dept.scope_dept_id).toMatch(/department/);
	});

	it("caps units per hand at the column limit", () => {
		expect(validateHandsNormForm({ ...machineForm, units_per_hand: "1000000" }).units_per_hand).toMatch(/exceed/);
	});

	it("an active production norm needs a scope, qty per hand > 0 and a unit", () => {
		const errors = validateHandsNormForm({ ...productionForm, scope_dept_id: "", qty_per_hand: "", qty_uom: "" });
		expect(errors.scope_dept_id).toMatch(/department/);
		expect(errors.qty_per_hand).toMatch(/greater than 0/);
		expect(errors.qty_uom).toMatch(/kg or cuts/);
		expect(validateHandsNormForm({ ...productionForm, qty_per_hand: "-3" }).qty_per_hand).toMatch(/positive/);
	});

	it("a retired machine / production norm may stay incomplete", () => {
		expect(validateHandsNormForm({ ...machineForm, machine_group_id: "", units_per_hand: "", active: 0 })).toEqual({});
		expect(validateHandsNormForm({ ...productionForm, scope_dept_id: "", qty_per_hand: "", qty_uom: "", active: 0 })).toEqual(
			{}
		);
	});

	it("no-norm and as-actual need nothing beyond the header", () => {
		expect(validateHandsNormForm({ ...emptyForm("2026-10-01"), designation_id: 1, norm_kind: "N" })).toEqual({});
		expect(validateHandsNormForm({ ...emptyForm("2026-10-01"), designation_id: 1, norm_kind: "A" })).toEqual({});
	});

	it("a fixed norm rejects negative shift hands and needs no scope", () => {
		const errors = validateHandsNormForm({ ...emptyForm("2026-10-01"), designation_id: 1, shift_b: "-1" });
		expect(errors.shift_b).toBeDefined();
		expect(validateHandsNormForm({ ...emptyForm("2026-10-01"), designation_id: 1, shift_a: "2" })).toEqual({});
	});

	it("caps the norms text at 80 characters", () => {
		const errors = validateHandsNormForm({ ...machineForm, norms_text: "x".repeat(81) });
		expect(errors.norms_text).toBeDefined();
	});
});

describe("hands per unit <-> units per hand", () => {
	it("hands per unit converts to units per hand", () => {
		expect(handsPerUnitToUnits("0.5")).toBe("2");
		expect(handsPerUnitToUnits("3")).toBe("0.333");
		expect(handsPerUnitToUnits("0")).toBe("");
		expect(handsPerUnitToUnits("")).toBe("");
		expect(unitsToHandsPerUnit("2")).toBe("0.5");
		expect(unitsToHandsPerUnit("22")).toBe("0.0455");
		expect(unitsToHandsPerUnit("")).toBe("");
	});
});

describe("toPayload sends only the kind's fields", () => {
	it("a fixed norm sends the shifts and no scope or rate", () => {
		const payload = toPayload({ ...machineForm, norm_kind: "F", shift_a: "2", shift_c: "1" });
		expect(payload.norm_kind).toBe("F");
		expect(payload.variable_fixed).toBe("F");
		expect([payload.shift_a, payload.shift_b, payload.shift_c, payload.shift_g]).toEqual([2, 0, 1, 0]);
		expect(payload.machine_group_id).toBeNull();
		expect(payload.machine_type_id).toBeNull();
		expect(payload.scope_dept_id).toBeNull();
		expect(payload.units_per_hand).toBeNull();
		expect(payload.qty_per_hand).toBeNull();
		expect(payload.qty_uom).toBeNull();
	});

	it("a machine norm sends exactly the radio's scope, units per hand and shifts 0", () => {
		const payload = toPayload({ ...machineForm, machine_type_id: 7, scope_dept_id: 9, shift_a: "5", norms_text: "  2 MC = 1 HAND " });
		expect(payload.norm_kind).toBe("M");
		expect(payload.variable_fixed).toBe("V");
		expect(payload.machine_group_id).toBe(3);
		expect(payload.machine_type_id).toBeNull();
		expect(payload.scope_dept_id).toBeNull();
		expect(payload.units_per_hand).toBe(2);
		expect(payload.qty_per_hand).toBeNull();
		expect(payload.shift_a).toBe(0);
		expect(payload.norms_text).toBe("2 MC = 1 HAND");
		expect(payload.direct_indirect).toBeNull();
		expect(toPayload({ ...machineForm, scope: "type", machine_type_id: 7 })).toMatchObject({
			machine_group_id: null,
			machine_type_id: 7,
			scope_dept_id: null,
		});
	});

	it("a production norm sends the department, qty per hand and uom only", () => {
		const payload = toPayload({ ...productionForm, units_per_hand: "2" });
		expect(payload.norm_kind).toBe("P");
		expect(payload.variable_fixed).toBe("V");
		expect(payload.scope_dept_id).toBe(9);
		expect(payload.machine_group_id).toBeNull();
		expect(payload.qty_per_hand).toBe(315);
		expect(payload.qty_uom).toBe("kg");
		expect(payload.units_per_hand).toBeNull();
	});

	it("no-norm and as-actual send nothing but the kind", () => {
		for (const kind of ["N", "A"] as const) {
			const payload = toPayload({ ...productionForm, norm_kind: kind, shift_a: "3" });
			expect(payload.norm_kind).toBe(kind);
			expect(payload.variable_fixed).toBe("F");
			expect(payload.shift_a).toBe(0);
			expect(payload.scope_dept_id).toBeNull();
			expect(payload.qty_per_hand).toBeNull();
			expect(payload.qty_uom).toBeNull();
		}
	});
});

describe("formFromRow", () => {
	it("edit keeps the row's own date and values", () => {
		const form = formFromRow(legacyRow);
		expect(form.effective_date).toBe("2000-01-01");
		expect(form.shift_a).toBe("5");
		expect(form.machine_type_id).toBe("");
		expect(form.direct_indirect).toBe("I");
	});

	it("formFromRow maps legacy V and F-with-rate rows to M with derived units per hand", () => {
		// V flag, no rate: M with no scope and no rate — the fields left to fill.
		const v = formFromRow(legacyRow);
		expect(v.norm_kind).toBe("M");
		expect(v.scope).toBe("group");
		expect(v.units_per_hand).toBe("");
		expect(validateHandsNormForm(v).machine_group_id).toBeDefined();
		// F flagged but carrying a per-machine rate: M with units = 1 / rate.
		const rate = formFromRow({ ...legacyRow, variable_fixed: "F", shift_a: 0, hands_per_machine: 0.5, norms_text: "2 MC = 1 HAND" });
		expect(rate.norm_kind).toBe("M");
		expect(rate.units_per_hand).toBe("2");
		expect(validateHandsNormForm(rate).machine_group_id).toBeDefined();
		// V with a machine type already linked: scope = type, units from the rate.
		const typed = formFromRow({ ...legacyRow, machine_type_id: 7, hands_per_machine: 0.0455 });
		expect(typed.scope).toBe("type");
		expect(typed.machine_type_id).toBe(7);
		expect(typed.units_per_hand).toBe("21.978");
	});

	it("prefers the v2 units per hand over the legacy rate and reads the group scope", () => {
		const form = formFromRow(groupRow);
		expect(form.norm_kind).toBe("M");
		expect(form.scope).toBe("group");
		expect(form.machine_group_id).toBe(3);
		expect(form.units_per_hand).toBe("2");
	});

	it("an incomplete migrated P row opens as P with the department scope preset and no scope id", () => {
		const form = formFromRow({ ...legacyRow, variable_fixed: "F", shift_a: 0, norm_kind: "P", qty_uom: "kg", qty_per_hand: null });
		expect(form.norm_kind).toBe("P");
		expect(form.scope).toBe("dept");
		expect(form.scope_dept_id).toBe("");
		expect(form.qty_uom).toBe("kg");
		expect(form.qty_per_hand).toBe("");
	});

	it("a Fixed row with shift counts stays Fixed; N / A rows keep their kind", () => {
		expect(formFromRow({ ...legacyRow, variable_fixed: "F", shift_a: 2, hands_per_machine: 0.5 }).norm_kind).toBe("F");
		expect(formFromRow({ ...legacyRow, variable_fixed: "F", norm_kind: "N" }).norm_kind).toBe("N");
		expect(formFromRow({ ...legacyRow, variable_fixed: "F", norm_kind: "A" }).norm_kind).toBe("A");
	});

	it("a revision starts on the given date and is active", () => {
		const form = formFromRow({ ...legacyRow, active: 0 }, "2026-09-30");
		expect(form.effective_date).toBe("2026-09-30");
		expect(form.active).toBe(1);
		expect(form.designation_id).toBe(2);
	});
});

describe("display helpers", () => {
	it("reads hands per machine in plain words", () => {
		expect(describeHandsPerMachine(0.5)).toBe("1 hand per 2 machines");
		expect(describeHandsPerMachine(0.0455)).toBe("1 hand per 22 machines");
		expect(describeHandsPerMachine(1)).toBe("1 hand per machine");
		expect(describeHandsPerMachine(3)).toBe("3 hands per machine");
		expect(describeHandsPerMachine(null)).toBe("");
	});

	it("resolves the kind of legacy and v2 rows", () => {
		expect(rowKind(legacyRow)).toBe("M");
		expect(rowKind({ ...legacyRow, variable_fixed: "F", shift_a: 2 })).toBe("F");
		expect(rowKind({ ...legacyRow, variable_fixed: "F", shift_a: 0, hands_per_machine: 0.5 })).toBe("M");
		expect(rowKind({ ...legacyRow, variable_fixed: "F", norm_kind: "N" })).toBe("N");
		expect(rowKind({ ...legacyRow, norm_kind: "x" })).toBe("M");
	});

	it("describeTarget per kind", () => {
		expect(describeTarget(groupRow)).toBe("Σ units of Hessian looms ÷ 2 per hand");
		expect(
			describeTarget({
				...groupRow,
				machine_group_id: null,
				machine_group: null,
				scope_dept_id: 5,
				scope_dept: "WINDING",
				norm_kind: "P",
				qty_per_hand: 315,
				qty_uom: "kg",
			})
		).toBe("kg of WINDING ÷ 315 kg per hand");
		expect(describeTarget({ ...legacyRow, variable_fixed: "F", norm_kind: "N" })).toBe("No norm — blank");
		expect(describeTarget({ ...legacyRow, variable_fixed: "F", norm_kind: "A" })).toBe("As actual");
		const fixed = { ...legacyRow, variable_fixed: "F" as const, computable: true };
		expect(describeTarget({ ...fixed, shift_a: 2, shift_b: 2, shift_c: 1 })).toBe("A 2 · B 2 · C 1");
		expect(describeTarget({ ...fixed, shift_a: 0 })).toBe("0 (no hands)");
	});

	it("describeTarget says why an incomplete M / P row is blank, and reads legacy rows", () => {
		expect(describeTarget(legacyRow)).toBe("no rate, no machine group / type / department — target blank");
		expect(describeTarget({ ...legacyRow, variable_fixed: "F", shift_a: 0, hands_per_machine: 0.5 })).toBe(
			"0.5 per machine, no machine group / type / department — target blank"
		);
		expect(
			describeTarget({ ...legacyRow, machine_type_id: 7, machine_type_name: "Loom", hands_per_machine: 0.5, computable: true })
		).toBe("0.5 x Loom run");
		expect(describeTarget({ ...groupRow, norm_kind: "P", qty_per_hand: null, computable: false })).toBe(
			"no qty per hand, incomplete — target blank"
		);
	});

	it("describePerHand shows units with the group's unit label, or the qty and uom", () => {
		expect(describePerHand(groupRow)).toBe("2 machines");
		expect(describePerHand({ ...groupRow, unit_label: "point", units_per_hand: 4 })).toBe("4 points");
		expect(describePerHand({ ...groupRow, unit_label: "spindle", units_per_hand: 1 })).toBe("1 spindle");
		expect(describePerHand({ ...groupRow, norm_kind: "P", qty_per_hand: 315, qty_uom: "kg" })).toBe("315 kg");
		expect(describePerHand({ ...legacyRow, hands_per_machine: 0.5 })).toBe("1 hand per 2 machines");
		expect(describePerHand({ ...legacyRow, variable_fixed: "F", shift_a: 2 })).toBe("");
	});
});
