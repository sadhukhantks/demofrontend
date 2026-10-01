import { describe, expect, it } from "vitest";
import type {
	LoomGroupMember,
	LoomOption,
	ModificationDetail,
	ModificationMember,
} from "@/utils/loomModificationService";
import {
	DONE_BY_INHOUSE,
	DONE_BY_VENDOR,
	MOD_KIND_FOLLOWUP,
	MOD_KIND_INITIAL,
	addMembers,
	autoGroupMembers,
	bandOf,
	buildAddLoomsSchema,
	buildChecklistRows,
	buildDefaultModificationFormValues,
	buildFollowUpFormValues,
	buildInsertEarlierFormValues,
	buildModificationPayload,
	dataCheckIsRed,
	existingGroupings,
	followUpCount,
	formatSaveMessage,
	impactReportHref,
	isAutoGroupKey,
	loomNamePrefix,
	loomNumber,
	loomOptionIsActive,
	memberIsActive,
	modificationFormSchema,
	numericTail,
	pickByLine,
	pickByNameRange,
	rowHasChildren,
	savedGroupId,
	scopeText,
	stageText,
	toChecklistMembers,
	toChecklistRows,
	toModificationFormValues,
	todayISO,
	validateMembers,
	type ChecklistMember,
	type ModificationFormValues,
} from "./modificationTypes";

// ---- fixtures ----------------------------------------------------------------

function values(overrides: Partial<ModificationFormValues> = {}): ModificationFormValues {
	return {
		...buildDefaultModificationFormValues(),
		mod_date: "2026-08-01",
		mod_category: "MECHANICAL",
		title: "New picking arm",
		...overrides,
	};
}

function issues(input: ModificationFormValues): Record<string, string[]> {
	const result = modificationFormSchema.safeParse(input);
	if (result.success) return {};
	const out: Record<string, string[]> = {};
	for (const issue of result.error.issues) {
		const key = String(issue.path[0]);
		out[key] = [...(out[key] ?? []), issue.message];
	}
	return out;
}

/**
 * A `/setup` loom exactly as the wire sends it: `get_looms_query` filters
 * `m.active = 1` and returns NO `active` column, so the fixture omits it unless a
 * test passes one explicitly.
 */
function loom(id: number, name: string, line: string | number | null = 1, active?: number): LoomOption {
	return {
		machine_id: id,
		machine_name: name,
		mech_code: `L${id}`,
		line_no: line,
		dept_id: 15009,
		dept_desc: "Weaving",
		branch_id: 12,
		...(active === undefined ? {} : { active }),
	};
}

/** A setup loom carrying its legacy share code (`machine_mst.mech_shr_code`). */
function loomShr(
	id: number,
	name: string,
	code: string | null,
	line: string | number | null = 1,
): LoomOption {
	return { ...loom(id, name, line), mech_shr_code: code };
}

/** A snapshot row as the wire sends it: the loom flag is `machine_active`. */
function snap(id: number, name: string, active = 1, doneDate: string | null = null): ModificationMember {
	return {
		machine_id: id,
		machine_name: name,
		mech_code: `L${id}`,
		line_no: 1,
		done_date: doneDate,
		done_to_date: null,
		remarks: null,
		machine_active: active,
	};
}

/** A group member as the wire sends it: `machine_active`, no `active`. */
function groupMember(id: number, name: string, active = 1): LoomGroupMember {
	return { machine_id: id, machine_name: name, mech_code: `L${id}`, line_no: 1, machine_active: active };
}

function member(id: number, doneDate = "", doneToDate = ""): ChecklistMember {
	return { machine_id: id, done_date: doneDate, done_to_date: doneToDate };
}

// ---- zod rules ----------------------------------------------------------------

describe("modificationFormSchema", () => {
	it("accepts an initial change with the default header", () => {
		expect(issues(values())).toEqual({});
	});

	it("requires Follows unless the kind is Initial", () => {
		expect(issues(values({ mod_kind: MOD_KIND_FOLLOWUP })).parent_modification_id).toEqual([
			"Pick the stage this one follows",
		]);
		expect(issues(values({ mod_kind: MOD_KIND_FOLLOWUP, parent_modification_id: "7" }))).toEqual({});
		expect(issues(values({ mod_kind: MOD_KIND_INITIAL, parent_modification_id: "" }))).toEqual({});
	});

	it("rejects a date done in the future (backend: 'date done cannot be in the future')", () => {
		expect(issues(values({ mod_date: "2999-01-01" })).mod_date).toEqual([
			"date done cannot be in the future",
		]);
		expect(issues(values({ mod_date: todayISO() }))).toEqual({});
	});

	it("keeps Completed on at or after Date done", () => {
		expect(issues(values({ mod_to_date: "2026-07-31" })).mod_to_date).toEqual([
			"Completed on cannot be earlier than Date done",
		]);
		expect(issues(values({ mod_to_date: "2026-08-01" }))).toEqual({});
	});

	it("requires a party when the work was done by a vendor", () => {
		expect(issues(values({ done_by: DONE_BY_VENDOR })).party_id).toEqual([
			"Party is required when the work was done by a vendor",
		]);
		expect(issues(values({ done_by: DONE_BY_VENDOR, party_id: "3" }))).toEqual({});
	});

	it("requires whole settling days, a category and a non-blank title", () => {
		expect(issues(values({ settle_days: "1.5" })).settle_days).toEqual([
			"Settling days must be a whole number",
		]);
		expect(issues(values({ settle_days: "" })).settle_days).toEqual(["Settling days is required"]);
		expect(issues(values({ mod_category: "" })).mod_category).toEqual(["Category is required"]);
		expect(issues(values({ title: "   " })).title).toEqual(["Title is required"]);
	});

	it("needs a code and a name when 'Save these looms as a group' is ticked", () => {
		const result = issues(values({ save_as_group: true }));
		expect(result.group_code).toEqual(["Group code is required"]);
		expect(result.group_name).toEqual(["Group name is required"]);
		expect(issues(values({ save_as_group: true, group_code: "G", group_name: "Group" }))).toEqual({});
	});
});

// ---- member rules -----------------------------------------------------------

describe("validateMembers", () => {
	it("needs at least one loom", () => {
		expect(validateMembers([], "2026-08-01", "")).toBe("Tick at least one loom");
	});

	it("accepts blank per-loom dates (they inherit the event's)", () => {
		expect(validateMembers([member(1), member(2)], "2026-08-01", "")).toBeNull();
	});

	it("keeps per-loom dates inside the event's dates", () => {
		expect(validateMembers([member(1, "2026-07-31")], "2026-08-01", "2026-08-08")).toMatch(
			/inside the event's dates/,
		);
		expect(validateMembers([member(1, "2026-08-09")], "2026-08-01", "2026-08-08")).toMatch(
			/inside the event's dates/,
		);
		expect(validateMembers([member(1, "2026-08-02")], "2026-08-01", "2026-08-08")).toBeNull();
		// A one-day event: the only legal done date is the event date.
		expect(validateMembers([member(1, "2026-08-02")], "2026-08-01", "")).toMatch(/inside/);
	});

	it("orders done-to after done and refuses a done-to without a done date", () => {
		expect(validateMembers([member(1, "2026-08-03", "2026-08-02")], "2026-08-01", "2026-08-08")).toMatch(
			/cannot precede/,
		);
		expect(validateMembers([member(1, "", "2026-08-02")], "2026-08-01", "2026-08-08")).toMatch(
			/needs a done date/,
		);
	});

	it("refuses a future done date and names the loom", () => {
		const rows = buildChecklistRows({ looms: [loom(1, "S293")] });
		expect(validateMembers([member(1, "2999-01-01")], "2999-01-01", "", rows)).toBe(
			"L1 — S293 (line 1): date done cannot be in the future",
		);
	});
});

// ---- payload builder ----------------------------------------------------------

describe("buildModificationPayload", () => {
	it("maps strings to numbers, blanks to null and drops the parent for an initial", () => {
		const payload = buildModificationPayload(
			values({
				parent_modification_id: "9",
				loom_group_id: "",
				settle_days: "3",
				total_cost: "1250.5",
				description: "  ",
				expected_effect: "fewer breaks ",
			}),
			[member(1), member(2, "2026-08-01")],
			9,
			12,
		);
		expect(payload).toEqual({
			co_id: 9,
			branch_id: 12,
			loom_group_id: null,
			members: [
				{ machine_id: 1, done_date: null, done_to_date: null },
				{ machine_id: 2, done_date: "2026-08-01", done_to_date: null },
			],
			mod_date: "2026-08-01",
			mod_to_date: null,
			settle_days: 3,
			mod_kind: MOD_KIND_INITIAL,
			parent_modification_id: null,
			mod_category: "MECHANICAL",
			title: "New picking arm",
			description: null,
			expected_effect: "fewer breaks",
			done_by: DONE_BY_INHOUSE,
			party_id: null,
			total_cost: 1250.5,
			remarks: null,
			save_as_group: null,
		});
	});

	it("keeps the parent and the group for a follow-up, and the party only for a vendor", () => {
		const followUp = buildModificationPayload(
			values({
				mod_kind: MOD_KIND_FOLLOWUP,
				parent_modification_id: "9",
				loom_group_id: "4",
				done_by: DONE_BY_VENDOR,
				party_id: "77",
			}),
			[member(1)],
			9,
			12,
		);
		expect(followUp).toMatchObject({
			mod_kind: MOD_KIND_FOLLOWUP,
			parent_modification_id: 9,
			loom_group_id: 4,
			party_id: 77,
		});
		const inHouse = buildModificationPayload(
			values({ done_by: DONE_BY_INHOUSE, party_id: "77" }),
			[member(1)],
			9,
			12,
		);
		expect(inHouse.party_id).toBeNull();
	});

	it("sends save_as_group only for a hand-picked list", () => {
		const picked = buildModificationPayload(
			values({ save_as_group: true, group_code: " G4 ", group_name: " Four " }),
			[member(1)],
			9,
			12,
		);
		expect(picked.save_as_group).toEqual({ group_code: "G4", group_name: "Four" });
		const fromGroup = buildModificationPayload(
			values({ loom_group_id: "4", save_as_group: true, group_code: "G4", group_name: "Four" }),
			[member(1)],
			9,
			12,
		);
		expect(fromGroup.save_as_group).toBeNull();
	});
});

// ---- prefill -------------------------------------------------------------------

const parentDetail: ModificationDetail = {
	modification_id: 9,
	co_id: 9,
	branch_id: 12,
	root_modification_id: 9,
	parent_modification_id: null,
	loom_group_id: 4,
	group_name: "Line 4",
	mod_kind: MOD_KIND_INITIAL,
	mod_date: "2026-07-01",
	mod_to_date: "2026-07-02",
	settle_days: 5,
	mod_category: "SETTING",
	title: "Original change",
	description: "desc",
	expected_effect: null,
	done_by: DONE_BY_VENDOR,
	party_id: 77,
	total_cost: 100,
	remarks: null,
	members: [snap(1, "S293", 1, "2026-07-01"), snap(2, "S294", 0), snap(3, "S295")],
	parent: null,
	children: [],
};

describe("follow-up prefill", () => {
	it("follows the parent, is a Follow-up, keeps the group and category, dated today", () => {
		const form = buildFollowUpFormValues(parentDetail);
		expect(form).toMatchObject({
			mod_kind: MOD_KIND_FOLLOWUP,
			parent_modification_id: "9",
			loom_group_id: "4",
			mod_category: "SETTING",
			mod_date: todayISO(),
			settle_days: "3",
			title: "",
			done_by: DONE_BY_INHOUSE,
			party_id: "",
		});
	});

	it("ticks the parent snapshot without its dates", () => {
		expect(toChecklistMembers(parentDetail.members, false)).toEqual([
			member(1),
			member(2),
			member(3),
		]);
		expect(toChecklistMembers(parentDetail.members)[0]).toEqual(member(1, "2026-07-01"));
	});

	it("labels the union of snapshot and group per §5", () => {
		const rows = buildChecklistRows({
			looms: [loom(1, "S293"), loom(3, "S295"), loom(4, "S296"), loom(5, "S297", 2)],
			snapshot: parentDetail.members,
			groupMembers: [groupMember(1, "S293"), groupMember(3, "S295"), groupMember(4, "S296")],
			snapshotIsParent: true,
		});
		const byId = new Map(rows.map((row) => [row.machine_id, row]));
		// In the parent snapshot and still in the group: no label.
		expect(byId.get(1)?.tag).toBeNull();
		// Retired since the parent stage: "inactive", still listed.
		expect(byId.get(2)?.tag).toBe("inactive");
		expect(byId.get(2)?.active).toBe(false);
		// In the parent snapshot and still a member: no label either.
		expect(byId.get(3)?.tag).toBeNull();
		// Added to the group after the first change: unticked, labelled.
		expect(byId.get(4)?.tag).toBe("not in previous stage");
		// The rest of the branch, unlabelled.
		expect(byId.get(5)?.tag).toBeNull();
		// Snapshot looms lead, then the rest of the branch in name order.
		expect(rows.map((row) => row.machine_id)).toEqual([1, 2, 3, 4, 5]);
	});

	it("labels a snapshot loom that left the group as 'no longer in group'", () => {
		const rows = buildChecklistRows({
			looms: [loom(1, "S293"), loom(3, "S295")],
			snapshot: [snap(1, "S293"), snap(3, "S295")],
			groupMembers: [groupMember(1, "S293")],
			snapshotIsParent: true,
		});
		expect(rows.find((row) => row.machine_id === 3)?.tag).toBe("no longer in group");
	});

	it("lifts a saved event into the form for editing", () => {
		expect(toModificationFormValues(parentDetail)).toMatchObject({
			mod_kind: MOD_KIND_INITIAL,
			parent_modification_id: "",
			loom_group_id: "4",
			mod_date: "2026-07-01",
			mod_to_date: "2026-07-02",
			settle_days: "5",
			done_by: DONE_BY_VENDOR,
			party_id: "77",
			total_cost: "100",
			description: "desc",
			expected_effect: "",
		});
	});

	it("seeds an earlier stage as a blank-dated Initial over the old root's group", () => {
		expect(buildInsertEarlierFormValues(parentDetail)).toMatchObject({
			mod_kind: MOD_KIND_INITIAL,
			parent_modification_id: "",
			loom_group_id: "4",
			mod_date: "",
			old_root_kind: MOD_KIND_FOLLOWUP,
		});
	});
});

// ---- checklist helpers ----------------------------------------------------------

describe("active flags on the wire", () => {
	it("treats a /setup loom without an `active` column as active", () => {
		expect(loomOptionIsActive(loom(1, "S293"))).toBe(true);
		expect(loomOptionIsActive(loom(1, "S293", 1, 0))).toBe(false);
		expect(loomOptionIsActive(loom(1, "S293", 1, 1))).toBe(true);
	});

	it("builds tickable rows from setup looms that carry no `active` key", () => {
		const rows = toChecklistRows([loom(1, "S293"), loom(2, "S294", 2)]);
		expect(rows.map((r) => r.active)).toEqual([true, true]);
		expect(rows.map((r) => r.tag)).toEqual([null, null]);
		const built = buildChecklistRows({ looms: [loom(1, "S293"), loom(2, "S294")] });
		expect(built.every((r) => r.active)).toBe(true);
	});

	it("reads members' machine_active first, then active, else active", () => {
		expect(memberIsActive({ machine_active: 1 })).toBe(true);
		expect(memberIsActive({ machine_active: 0 })).toBe(false);
		expect(memberIsActive({ machine_active: 0, active: 1 })).toBe(false);
		expect(memberIsActive({ active: 1 })).toBe(true);
		expect(memberIsActive({ active: false })).toBe(false);
		expect(memberIsActive({})).toBe(true);
	});

	it("pre-ticks group members and labels retired ones from machine_active", () => {
		const rows = buildChecklistRows({
			looms: [loom(1, "S293"), loom(3, "S295")],
			groupMembers: [groupMember(1, "S293", 1), groupMember(2, "S294", 0)],
		});
		const byId = new Map(rows.map((r) => [r.machine_id, r]));
		expect(byId.get(1)?.active).toBe(true);
		expect(byId.get(1)?.tag).toBeNull();
		expect(byId.get(2)?.active).toBe(false);
		expect(byId.get(2)?.tag).toBe("inactive");
		expect(byId.get(3)?.active).toBe(true);
	});
});

describe("buildAddLoomsSchema", () => {
	const rows = toChecklistRows([loom(1, "S293"), loom(2, "S294")]);

	it("refuses an empty tick-list", () => {
		const result = buildAddLoomsSchema("2026-08-01", "", rows).safeParse({ members: [] });
		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.issues[0]?.message).toBe("Tick at least one loom");
	});

	it("applies the §5 per-loom date rules", () => {
		const schema = buildAddLoomsSchema("2026-08-01", "2026-08-05", rows);
		const outside = schema.safeParse({ members: [member(1, "2026-08-09")] });
		expect(outside.success).toBe(false);
		if (!outside.success) {
			expect(outside.error.issues[0]?.message).toBe(
				"L1 — S293 (line 1): done date must be inside the event's dates",
			);
		}
		const inverted = schema.safeParse({ members: [member(2, "2026-08-04", "2026-08-02")] });
		expect(inverted.success).toBe(false);
		expect(schema.safeParse({ members: [member(1, "2026-08-03"), member(2)] }).success).toBe(true);
	});
});

describe("checklist helpers", () => {
	const rows = buildChecklistRows({
		looms: [
			loom(1, "S101", 1),
			loom(2, "S102", 1),
			loom(3, "S110", 2),
			loom(4, "S112", "2"),
			loom(5, "T105", 3),
			loom(6, "LOOM", null),
		],
	});

	it("reads the numeric tail of a loom name", () => {
		expect(numericTail("S101")).toBe(101);
		expect(numericTail("LOOM 12 ")).toBe(12);
		expect(numericTail("ABC")).toBeNull();
	});

	it("picks a name range by the numeric tail, honouring a typed prefix", () => {
		expect(pickByNameRange(rows, "S101", "S112")).toEqual([1, 2, 3, 4]);
		// Rows are in natural order (by numeric tail), so T105 sits between S102 and S110.
		expect(pickByNameRange(rows, "101", "112")).toEqual([1, 2, 5, 3, 4]);
		expect(pickByNameRange(rows, "S112", "S101")).toEqual([1, 2, 3, 4]);
		expect(pickByNameRange(rows, "", "S112")).toEqual([]);
	});

	it("fills from a line comparing line numbers as strings (INT on dev3, VARCHAR on sls)", () => {
		expect(pickByLine(rows, "2")).toEqual([3, 4]);
		expect(pickByLine(rows, "")).toEqual([]);
	});

	it("adds ids without duplicating or losing the dates of existing members", () => {
		const next = addMembers([member(1, "2026-08-01")], [1, 2]);
		expect(next).toEqual([member(1, "2026-08-01"), member(2)]);
	});
});

// ---- existing groupings: bands of six and share codes ----------------------------

describe("loom name helpers", () => {
	it("splits a name into its prefix and trailing number", () => {
		expect(loomNamePrefix("S4 LOOM 1")).toBe("S4 LOOM");
		expect(loomNumber("S4 LOOM 1")).toBe(1);
		expect(loomNamePrefix("LOOM-12")).toBe("LOOM");
		expect(loomNumber("LOOM-12")).toBe(12);
		expect(loomNamePrefix("Loom #7")).toBe("Loom");
		expect(loomNumber("Loom #7")).toBe(7);
		expect(loomNamePrefix("S293")).toBe("S");
		expect(loomNumber("S293")).toBe(293);
		expect(loomNamePrefix(" 101 ")).toBe("");
		expect(loomNumber(" 101 ")).toBe(101);
		expect(loomNamePrefix("ABC")).toBe("ABC");
		expect(loomNumber("ABC")).toBeNull();
	});

	it("buckets loom numbers into bands of six like the low-producer report", () => {
		expect(bandOf(1)).toEqual({ start: 1, end: 6 });
		expect(bandOf(6)).toEqual({ start: 1, end: 6 });
		expect(bandOf(7)).toEqual({ start: 7, end: 12 });
		expect(bandOf(293)).toEqual({ start: 289, end: 294 });
		expect(bandOf(300)).toEqual({ start: 295, end: 300 });
	});
});

describe("existingGroupings", () => {
	const s4 = (id: number, n: number, code: string | null = null): LoomOption =>
		loomShr(id, `S4 LOOM ${n}`, code);

	it("bands six consecutive looms of one prefix into a weaver's set", () => {
		const rows = toChecklistRows(Array.from({ length: 12 }, (_, i) => s4(i + 1, i + 1)));
		const groups = existingGroupings(rows);
		expect(groups.map((g) => g.key)).toEqual(["band:S4 LOOM:1", "band:S4 LOOM:7"]);
		expect(groups.map((g) => g.label)).toEqual([
			"S4 LOOM 1–6 (6 looms)",
			"S4 LOOM 7–12 (6 looms)",
		]);
		expect(groups[0]).toMatchObject({ kind: "band", machine_ids: [1, 2, 3, 4, 5, 6] });
		expect(groups[1].machine_ids).toEqual([7, 8, 9, 10, 11, 12]);
	});

	it("keeps mixed prefixes on one line apart, sorted by prefix", () => {
		const rows = toChecklistRows([
			s4(1, 1),
			s4(2, 2),
			loom(3, "Hessian Loom 1"),
			loom(4, "Hessian Loom 2"),
		]);
		expect(existingGroupings(rows).map((g) => g.label)).toEqual([
			"Hessian Loom 1–2 (2 looms)",
			"S4 LOOM 1–2 (2 looms)",
		]);
	});

	it("labels a band by the real lowest–highest numbers present and skips a single-loom band", () => {
		const rows = toChecklistRows([
			...[7, 8, 9, 10, 12].map((n) => loom(n, `Hessian Loom ${n}`)),
			loom(13, "Hessian Loom 13"),
		]);
		expect(existingGroupings(rows)).toEqual([
			{
				key: "band:Hessian Loom:7",
				kind: "band",
				label: "Hessian Loom 7–12 (5 looms)",
				machine_ids: [7, 8, 9, 10, 12],
			},
		]);
	});

	it("ignores looms without a numeric tail and inactive looms", () => {
		const rows = toChecklistRows([s4(1, 1), s4(2, 2), loom(3, "LOOM"), loom(4, "S4 LOOM 3", 1, 0)]);
		const groups = existingGroupings(rows);
		expect(groups).toHaveLength(1);
		expect(groups[0].machine_ids).toEqual([1, 2]);
	});

	it("groups share codes covering two or more looms, never one", () => {
		const rows = toChecklistRows([s4(1, 1, "12"), s4(2, 2, "12"), s4(3, 3, "13"), s4(4, 4, null)]);
		expect(existingGroupings(rows).filter((g) => g.kind === "share")).toEqual([
			{
				key: "share:12",
				kind: "share",
				label: "Share 12: S4 LOOM 1, S4 LOOM 2 (2 looms)",
				machine_ids: [1, 2],
			},
		]);
	});

	it("orders share codes numerically, then alphabetically, and drops blank codes", () => {
		const rows = toChecklistRows([
			loomShr(1, "X1", "10"),
			loomShr(2, "X2", "10"),
			loomShr(3, "X3", "9"),
			loomShr(4, "X4", "9"),
			loomShr(5, "X5", "A1"),
			loomShr(6, "X6", "A1"),
			loomShr(7, "X7", ""),
			loomShr(8, "X8", "  "),
		]);
		expect(rows[6].mech_shr_code).toBeNull();
		expect(rows[7].mech_shr_code).toBeNull();
		const shares = existingGroupings(rows).filter((g) => g.kind === "share");
		expect(shares.map((g) => g.key)).toEqual(["share:9", "share:10", "share:A1"]);
		expect(shares[1].label).toBe("Share 10: X1, X2 (2 looms)");
	});

	it("reads dev3-style names like S293 (prefix 'S', band 289–294)", () => {
		// S295 opens the next band (295–300) and, alone there, is skipped.
		const groups = existingGroupings(toChecklistRows([loom(1, "S293"), loom(2, "S294"), loom(3, "S295")]));
		expect(groups).toEqual([
			{ key: "band:S:289", kind: "band", label: "S 293–294 (2 looms)", machine_ids: [1, 2] },
		]);
	});

	it("is deterministic regardless of row order, bands before share codes", () => {
		const looms = [s4(3, 3, "7"), s4(1, 1, "7"), s4(9, 9), s4(8, 8), s4(2, 2)];
		const forward = existingGroupings(toChecklistRows(looms));
		const backward = existingGroupings(toChecklistRows([...looms].reverse()));
		expect(backward).toEqual(forward);
		expect(forward.map((g) => g.key)).toEqual(["band:S4 LOOM:1", "band:S4 LOOM:7", "share:7"]);
		expect(forward[0].machine_ids).toEqual([1, 2, 3]);
		expect(forward[2].label).toBe("Share 7: S4 LOOM 1, S4 LOOM 3 (2 looms)");
	});

	it("carries the share code from the setup list onto snapshot rows", () => {
		const rows = buildChecklistRows({
			looms: [s4(1, 1, "12"), s4(2, 2, "12")],
			snapshot: [snap(1, "S4 LOOM 1"), snap(3, "S4 LOOM 3", 0)],
		});
		const byId = new Map(rows.map((r) => [r.machine_id, r]));
		expect(byId.get(1)?.mech_shr_code).toBe("12");
		expect(byId.get(2)?.mech_shr_code).toBe("12");
		// Retired and absent from the setup list: no share code, never grouped.
		expect(byId.get(3)?.mech_shr_code).toBeNull();
		expect(existingGroupings(rows).find((g) => g.kind === "share")?.machine_ids).toEqual([1, 2]);
	});

	it("pre-ticks a grouping's looms without dates, like a saved group", () => {
		expect(autoGroupMembers({ machine_ids: [4, 5] })).toEqual([member(4), member(5)]);
	});
});

describe("existing-grouping keys in the form", () => {
	it("tells an existing-grouping key from a saved group id", () => {
		expect(isAutoGroupKey("band:S4 LOOM:1")).toBe(true);
		expect(isAutoGroupKey("share:12")).toBe(true);
		expect(isAutoGroupKey("4")).toBe(false);
		expect(isAutoGroupKey("")).toBe(false);
		expect(savedGroupId("4")).toBe(4);
		expect(savedGroupId("band:S4 LOOM:1")).toBeNull();
		expect(savedGroupId("share:12")).toBeNull();
		expect(savedGroupId("")).toBeNull();
	});

	it("sends an existing grouping as a hand-picked list (loom_group_id null)", () => {
		const payload = buildModificationPayload(
			values({ loom_group_id: "share:12" }),
			[member(1), member(2)],
			9,
			12,
		);
		expect(payload.loom_group_id).toBeNull();
		expect(payload.members.map((m) => m.machine_id)).toEqual([1, 2]);
		expect(payload.save_as_group).toBeNull();
		// ...and, unlike a saved group, still lets the user name it as one.
		const named = buildModificationPayload(
			values({
				loom_group_id: "band:S4 LOOM:1",
				save_as_group: true,
				group_code: "W1",
				group_name: "Weaver 1",
			}),
			[member(1)],
			9,
			12,
		);
		expect(named.loom_group_id).toBeNull();
		expect(named.save_as_group).toEqual({ group_code: "W1", group_name: "Weaver 1" });
	});

	it("keeps an edited row with no group on the hand-picked path", () => {
		const form = toModificationFormValues({ ...parentDetail, loom_group_id: null });
		expect(form.loom_group_id).toBe("");
		expect(isAutoGroupKey(form.loom_group_id)).toBe(false);
		expect(buildModificationPayload(form, [member(1)], 9, 12).loom_group_id).toBeNull();
	});
});

// ---- display -------------------------------------------------------------------

describe("display helpers", () => {
	it("prints the scope and the stage", () => {
		expect(scopeText({ group_name: "EJM-L4", loom_count: 12 })).toBe("Group EJM-L4 — 12 looms");
		expect(scopeText({ group_name: null, loom_count: 5 })).toBe("5 looms picked");
		expect(scopeText({ group_name: null, loom_count: 1 })).toBe("1 loom picked");
		expect(stageText({ stage_seq: 2, stage_count: 3 })).toBe("2 of 3");
	});

	it("reads the stage from the wire's stage_no / stage_label, not only stage_seq", () => {
		// `/modification_table` sends `stage_no` + `stage_count` (+ `stage_label`), never `stage_seq`.
		expect(stageText({ stage_no: 2, stage_count: 3 })).toBe("2 of 3");
		expect(stageText({ stage_no: 3, stage_count: 3, stage_label: "3 of 3" })).toBe("3 of 3");
		expect(stageText({})).toBe("1 of 1");
	});

	it("derives follow-ups from the wire's children_count", () => {
		expect(rowHasChildren({ children_count: 2 })).toBe(true);
		expect(followUpCount({ children_count: 2 })).toBe(2);
		expect(rowHasChildren({ children_count: 0 })).toBe(false);
		expect(rowHasChildren({})).toBe(false);
		// The service's derived flag is honoured too.
		expect(rowHasChildren({ children_count: 0, has_children: true })).toBe(true);
	});

	it("flags a data check with an empty side", () => {
		expect(dataCheckIsRed({ before_days: 0, after_days: 40 })).toBe(true);
		expect(dataCheckIsRed({ before_days: 30, after_days: 0 })).toBe(true);
		expect(dataCheckIsRed({ before_days: 30, after_days: 40 })).toBe(false);
		expect(dataCheckIsRed(null)).toBe(false);
	});

	it("prints the data check in the save snackbar", () => {
		expect(formatSaveMessage("saved", { before_days: 0, after_days: 40 })).toBe(
			"saved — 0 producing loom-days in the 90 days before: the report will say NOT ENOUGH DATA",
		);
		expect(formatSaveMessage("saved", { before_days: 30, after_days: 0 })).toBe(
			"saved — 0 producing loom-days in the 90 days after: the report will say NOT ENOUGH DATA",
		);
		expect(formatSaveMessage("saved", { before_days: 30, after_days: 40 })).toBe(
			"saved — 30 producing loom-days before, 40 after (90 days each side)",
		);
		expect(formatSaveMessage("saved", null)).toBe("saved");
	});

	it("links any stage id to the impact report", () => {
		expect(impactReportHref(12)).toBe(
			"/dashboardportal/juteProduction/report/loomModificationImpact?modification_id=12",
		);
	});
});
