/**
 * Machine group dialog: form state, Zod validation, member-picker helpers and
 * payload mapping (Hands Norms v2, 2026-09-30). A group is a named set of the
 * branch's machines, each with a unit weight (a loom is 1 machine, a drawing
 * frame 10 points, a heavy spinning frame 2), that an M / P norm can be scoped
 * to. The API (hands_norms.py groups endpoints) stays the source of truth;
 * these rules mirror its 400s so the user sees them in the dialog.
 */

import { z } from "zod";
import type {
	MachineGroupCreatePayload,
	MachineGroupDetail,
	MachineGroupEditPayload,
	NormMachine,
} from "./_service";

/** Column limits: group_code VARCHAR(30), group_name VARCHAR(100), unit_label VARCHAR(20),
 * remarks VARCHAR(255), units DECIMAL(9,3). */
export const GROUP_CODE_MAX = 30;
export const GROUP_NAME_MAX = 100;
export const UNIT_LABEL_MAX = 20;
export const GROUP_REMARKS_MAX = 255;
export const MEMBER_UNITS_MAX = 999999.999;

/** Suggested unit labels; the field stays free text. */
export const UNIT_LABEL_SUGGESTIONS: ReadonlyArray<string> = Object.freeze(["machine", "point", "spindle"]);

/** One member row of the dialog grid. `units` is the typed string. */
export interface GroupMemberForm {
	machine_id: number;
	machine_name: string;
	mech_code: string | null;
	machine_type_id: number | null;
	machine_type_name: string | null;
	dept: string | null;
	units: string;
}

export interface MachineGroupForm {
	group_code: string;
	group_name: string;
	unit_label: string;
	remarks: string;
	active: number;
	members: GroupMemberForm[];
}

export type GroupFormErrors = Partial<Record<keyof MachineGroupForm, string>>;

const isBlank = (v: string) => v.trim() === "";

/** True when a units text is a finite number > 0 within the column's range. */
export function unitsValid(units: string): boolean {
	const n = Number(units);
	return !isBlank(units) && Number.isFinite(n) && n > 0 && n <= MEMBER_UNITS_MAX;
}

const memberSchema = z.object({
	machine_id: z.number().int().positive(),
	machine_name: z.string(),
	units: z.string(),
});

export const machineGroupFormSchema = z
	.object({
		group_code: z
			.string()
			.refine((v) => !isBlank(v), { message: "Enter a group code" })
			.refine((v) => v.trim().length <= GROUP_CODE_MAX, { message: `Group code: ${GROUP_CODE_MAX} characters at most` }),
		group_name: z
			.string()
			.refine((v) => !isBlank(v), { message: "Enter a group name" })
			.refine((v) => v.trim().length <= GROUP_NAME_MAX, { message: `Group name: ${GROUP_NAME_MAX} characters at most` }),
		unit_label: z
			.string()
			.refine((v) => !isBlank(v), { message: "Enter the unit label (machine, point, spindle ...)" })
			.refine((v) => v.trim().length <= UNIT_LABEL_MAX, { message: `Unit label: ${UNIT_LABEL_MAX} characters at most` }),
		remarks: z.string().max(GROUP_REMARKS_MAX, `Remarks: ${GROUP_REMARKS_MAX} characters at most`),
		active: z.number().int().min(0).max(1),
		members: z.array(memberSchema),
	})
	.superRefine((f, ctx) => {
		const bad = f.members.filter((m) => !unitsValid(m.units)).map((m) => m.machine_name);
		if (bad.length) {
			ctx.addIssue({
				code: "custom",
				path: ["members"],
				message: `Units must be greater than 0 for: ${bad.slice(0, 5).join(", ")}${bad.length > 5 ? ` and ${bad.length - 5} more` : ""}`,
			});
		}
		const seen = new Set<number>();
		const dup = new Set<string>();
		for (const m of f.members) {
			if (seen.has(m.machine_id)) dup.add(m.machine_name);
			seen.add(m.machine_id);
		}
		if (dup.size) {
			ctx.addIssue({
				code: "custom",
				path: ["members"],
				message: `A machine may be in the group only once: ${[...dup].join(", ")}`,
			});
		}
	});

/** First error message per field, for helperText / the members alert. */
export function validateGroupForm(form: MachineGroupForm): GroupFormErrors {
	const parsed = machineGroupFormSchema.safeParse(form);
	if (parsed.success) return {};
	const errors: GroupFormErrors = {};
	for (const issue of parsed.error.issues) {
		const key = issue.path[0] as keyof MachineGroupForm | undefined;
		if (key && !errors[key]) errors[key] = issue.message;
	}
	return errors;
}

export interface CandidateFilter {
	/** "" = every machine type. */
	machineTypeId: number | "";
	/** Case-insensitive substring of the machine name or mech code; blank = all. */
	nameContains: string;
	/** Machines already in the group are never candidates. */
	excludeIds: ReadonlySet<number>;
}

/** The branch machines matching the picker filters and not yet members. */
export function filterCandidates(machines: ReadonlyArray<NormMachine>, filter: CandidateFilter): NormMachine[] {
	const q = filter.nameContains.trim().toLowerCase();
	return machines.filter((m) => {
		if (filter.excludeIds.has(m.machine_id)) return false;
		if (filter.machineTypeId !== "" && m.machine_type_id !== filter.machineTypeId) return false;
		if (!q) return true;
		return [m.machine_name, m.mech_code].some((s) => (s ?? "").toLowerCase().includes(q));
	});
}

export function memberFromMachine(m: NormMachine, units: string): GroupMemberForm {
	return {
		machine_id: m.machine_id,
		machine_name: m.machine_name ?? `#${m.machine_id}`,
		mech_code: m.mech_code ?? null,
		machine_type_id: m.machine_type_id ?? null,
		machine_type_name: m.machine_type_name ?? null,
		dept: m.dept ?? null,
		units,
	};
}

/** Appends the machines as members (skipping ones already present) with the given units. */
export function addMembers(
	members: ReadonlyArray<GroupMemberForm>,
	machines: ReadonlyArray<NormMachine>,
	units: string
): GroupMemberForm[] {
	const have = new Set(members.map((m) => m.machine_id));
	const added = machines.filter((m) => !have.has(m.machine_id)).map((m) => memberFromMachine(m, units));
	return [...members, ...added];
}

/** Sets `units` on the selected members; others are left as they are. */
export function applyUnitsToSelection(
	members: ReadonlyArray<GroupMemberForm>,
	selectedIds: ReadonlySet<number> | ReadonlyArray<number>,
	units: string
): GroupMemberForm[] {
	const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds as ReadonlyArray<number>);
	return members.map((m) => (ids.has(m.machine_id) ? { ...m, units } : m));
}

export function removeMembers(
	members: ReadonlyArray<GroupMemberForm>,
	ids: ReadonlySet<number> | ReadonlyArray<number>
): GroupMemberForm[] {
	const drop = ids instanceof Set ? ids : new Set(ids as ReadonlyArray<number>);
	return members.filter((m) => !drop.has(m.machine_id));
}

/** Σ units over the members whose units parse; 3 decimals. */
export function totalUnits(members: ReadonlyArray<GroupMemberForm>): number {
	const sum = members.reduce((acc, m) => {
		const n = Number(m.units);
		return acc + (m.units.trim() !== "" && Number.isFinite(n) ? n : 0);
	}, 0);
	return Number(sum.toFixed(3));
}

export function emptyGroupForm(): MachineGroupForm {
	return { group_code: "", group_name: "", unit_label: "machine", remarks: "", active: 1, members: [] };
}

export function groupFormFromDetail(g: MachineGroupDetail): MachineGroupForm {
	return {
		group_code: g.group_code ?? "",
		group_name: g.group_name ?? "",
		unit_label: g.unit_label ?? "machine",
		remarks: g.remarks ?? "",
		active: g.active ? 1 : 0,
		members: (g.members ?? []).map((m) => ({
			machine_id: m.machine_id,
			machine_name: m.machine_name ?? `#${m.machine_id}`,
			mech_code: m.mech_code ?? null,
			machine_type_id: m.machine_type_id ?? null,
			machine_type_name: m.machine_type_name ?? null,
			dept: m.dept ?? null,
			units: m.units == null ? "" : String(m.units),
		})),
	};
}

const memberPayload = (members: ReadonlyArray<GroupMemberForm>) =>
	members.map((m) => ({ machine_id: m.machine_id, units: Number(m.units) }));

export function toGroupCreatePayload(form: MachineGroupForm, coId: number, branchId: number): MachineGroupCreatePayload {
	return {
		co_id: coId,
		branch_id: branchId,
		group_code: form.group_code.trim(),
		group_name: form.group_name.trim(),
		unit_label: form.unit_label.trim(),
		remarks: isBlank(form.remarks) ? null : form.remarks.trim(),
		members: memberPayload(form.members),
	};
}

/** Edit body: the code is fixed once created; members are a full replacement. */
export function toGroupEditPayload(form: MachineGroupForm): MachineGroupEditPayload {
	return {
		group_name: form.group_name.trim(),
		unit_label: form.unit_label.trim(),
		remarks: isBlank(form.remarks) ? null : form.remarks.trim(),
		active: form.active,
		members: memberPayload(form.members),
	};
}
