import { describe, expect, it } from "vitest";
import type { MachineGroupDetail, NormMachine } from "./_service";
import {
	addMembers,
	applyUnitsToSelection,
	emptyGroupForm,
	filterCandidates,
	groupFormFromDetail,
	memberFromMachine,
	removeMembers,
	toGroupCreatePayload,
	toGroupEditPayload,
	totalUnits,
	unitsValid,
	validateGroupForm,
	type MachineGroupForm,
} from "./_groupSchema";

const machine = (id: number, name: string, typeId: number, typeName: string, mech: string | null = null): NormMachine => ({
	machine_id: id,
	machine_name: name,
	mech_code: mech,
	machine_type_id: typeId,
	machine_type_name: typeName,
	dept_id: 3,
	dept: "WEAVING",
});

const machines: NormMachine[] = [
	machine(1, "Hessian Loom - 1", 7, "Loom", "HL1"),
	machine(2, "Hessian Loom - 2", 7, "Loom", "HL2"),
	machine(3, "S4 Loom - 1", 7, "Loom", "S41"),
	machine(4, "Breaker Card 1", 32, "R/G"),
	machine(5, "Finisher Card 1", 32, "R/G"),
];

const validForm: MachineGroupForm = {
	...emptyGroupForm(),
	group_code: "HESS",
	group_name: "Hessian looms",
	unit_label: "machine",
	members: [memberFromMachine(machines[0], "1"), memberFromMachine(machines[1], "1")],
};

describe("filterCandidates by type and name", () => {
	const none = new Set<number>();

	it("returns every machine with no filters", () => {
		expect(filterCandidates(machines, { machineTypeId: "", nameContains: "", excludeIds: none })).toHaveLength(5);
	});

	it("filters by machine type", () => {
		expect(filterCandidates(machines, { machineTypeId: 32, nameContains: "", excludeIds: none }).map((m) => m.machine_id)).toEqual([
			4, 5,
		]);
	});

	it("filters by name (case-insensitive) or mech code", () => {
		expect(filterCandidates(machines, { machineTypeId: "", nameContains: "hessian", excludeIds: none }).map((m) => m.machine_id)).toEqual(
			[1, 2]
		);
		expect(filterCandidates(machines, { machineTypeId: "", nameContains: "s41", excludeIds: none }).map((m) => m.machine_id)).toEqual([3]);
	});

	it("combines type and name and drops machines already in the group", () => {
		expect(
			filterCandidates(machines, { machineTypeId: 7, nameContains: "Loom", excludeIds: new Set([1]) }).map((m) => m.machine_id)
		).toEqual([2, 3]);
	});
});

describe("members", () => {
	it("addMembers appends with the given units and skips ones already present", () => {
		const next = addMembers(validForm.members, [machines[1], machines[4]], "2");
		expect(next.map((m) => [m.machine_id, m.units])).toEqual([
			[1, "1"],
			[2, "1"],
			[5, "2"],
		]);
	});

	it("applyUnitsToSelection sets units on the selected members only", () => {
		const members = [memberFromMachine(machines[0], "1"), memberFromMachine(machines[1], "1"), memberFromMachine(machines[2], "1")];
		expect(applyUnitsToSelection(members, new Set([1, 3]), "10").map((m) => m.units)).toEqual(["10", "1", "10"]);
		expect(applyUnitsToSelection(members, [2], "0.5").map((m) => m.units)).toEqual(["1", "0.5", "1"]);
	});

	it("removeMembers drops the given machines", () => {
		expect(removeMembers(validForm.members, [1]).map((m) => m.machine_id)).toEqual([2]);
	});

	it("totalUnits sums parsable units to 3 decimals", () => {
		expect(totalUnits(validForm.members)).toBe(2);
		expect(
			totalUnits([memberFromMachine(machines[0], "10"), memberFromMachine(machines[1], "0.1"), memberFromMachine(machines[2], "x")])
		).toBe(10.1);
		expect(totalUnits([])).toBe(0);
	});

	it("unitsValid accepts positive numbers within the column range", () => {
		expect(unitsValid("1")).toBe(true);
		expect(unitsValid("0.001")).toBe(true);
		expect(unitsValid("0")).toBe(false);
		expect(unitsValid("")).toBe(false);
		expect(unitsValid("-2")).toBe(false);
		expect(unitsValid("1000000")).toBe(false);
	});
});

describe("validateGroupForm", () => {
	it("accepts a complete group", () => {
		expect(validateGroupForm(validForm)).toEqual({});
	});

	it("needs code, name and unit label within their limits", () => {
		const errors = validateGroupForm({ ...validForm, group_code: " ", group_name: "", unit_label: "" });
		expect(errors.group_code).toMatch(/code/);
		expect(errors.group_name).toMatch(/name/);
		expect(errors.unit_label).toMatch(/unit label/);
		expect(validateGroupForm({ ...validForm, group_code: "x".repeat(31) }).group_code).toMatch(/30/);
		expect(validateGroupForm({ ...validForm, group_name: "x".repeat(101) }).group_name).toMatch(/100/);
		expect(validateGroupForm({ ...validForm, unit_label: "x".repeat(21) }).unit_label).toMatch(/20/);
		expect(validateGroupForm({ ...validForm, remarks: "x".repeat(256) }).remarks).toMatch(/255/);
	});

	it("every member needs units > 0", () => {
		const errors = validateGroupForm({
			...validForm,
			members: [memberFromMachine(machines[0], "0"), memberFromMachine(machines[1], ""), memberFromMachine(machines[2], "2")],
		});
		expect(errors.members).toMatch(/greater than 0/);
		expect(errors.members).toMatch(/Hessian Loom - 1, Hessian Loom - 2/);
		expect(errors.members).not.toMatch(/S4 Loom/);
	});

	it("refuses a duplicate machine", () => {
		const errors = validateGroupForm({
			...validForm,
			members: [memberFromMachine(machines[0], "1"), memberFromMachine(machines[0], "2")],
		});
		expect(errors.members).toMatch(/only once: Hessian Loom - 1/);
	});

	it("allows a group with no members yet (the API decides)", () => {
		expect(validateGroupForm({ ...validForm, members: [] })).toEqual({});
	});
});

describe("payload mapping", () => {
	it("create sends trimmed header fields, the branch and numeric member units", () => {
		const payload = toGroupCreatePayload({ ...validForm, group_code: " HESS ", remarks: "  " }, 2, 29);
		expect(payload).toEqual({
			co_id: 2,
			branch_id: 29,
			group_code: "HESS",
			group_name: "Hessian looms",
			unit_label: "machine",
			remarks: null,
			members: [
				{ machine_id: 1, units: 1 },
				{ machine_id: 2, units: 1 },
			],
		});
	});

	it("edit sends no code, the active flag and the full member list", () => {
		const payload = toGroupEditPayload({ ...validForm, active: 0, remarks: "all Hessian looms" });
		expect(payload).toEqual({
			group_name: "Hessian looms",
			unit_label: "machine",
			remarks: "all Hessian looms",
			active: 0,
			members: [
				{ machine_id: 1, units: 1 },
				{ machine_id: 2, units: 1 },
			],
		});
		expect("group_code" in payload).toBe(false);
	});

	it("groupFormFromDetail reads the header and members back as form text", () => {
		const detail: MachineGroupDetail = {
			machine_group_id: 3,
			group_code: "DRW1",
			group_name: "1st Drawing F/S",
			unit_label: "point",
			remarks: null,
			active: 1,
			member_count: 1,
			total_units: 10,
			members: [
				{ machine_id: 9, machine_name: "1st Drawing 1", mech_code: null, machine_type_id: 12, machine_type_name: "Drawing", dept: "DRAWING", units: 10 },
			],
		};
		const form = groupFormFromDetail(detail);
		expect(form.group_code).toBe("DRW1");
		expect(form.unit_label).toBe("point");
		expect(form.remarks).toBe("");
		expect(form.members).toEqual([
			{ machine_id: 9, machine_name: "1st Drawing 1", mech_code: null, machine_type_id: 12, machine_type_name: "Drawing", dept: "DRAWING", units: "10" },
		]);
		expect(totalUnits(form.members)).toBe(10);
	});
});
