import { describe, expect, it } from "vitest";
import type { LoomGroupDetail } from "@/utils/loomModificationService";
import {
	GROUP_PURPOSE_CONTROL,
	GROUP_PURPOSE_STUDY,
	buildDefaultLoomGroupFormValues,
	buildLoomGroupCreatePayload,
	buildLoomGroupEditPayload,
	deleteConfirmText,
	idsToMembers,
	loomGroupSchema,
	membersToIds,
	purposeLabel,
	toLoomGroupFormValues,
	type LoomGroupFormValues,
} from "./loomGroupTypes";

function values(overrides: Partial<LoomGroupFormValues> = {}): LoomGroupFormValues {
	return {
		...buildDefaultLoomGroupFormValues(),
		group_code: "EJM-L4",
		group_name: "Line 4 weaver A",
		machine_ids: [101, 102, 103],
		...overrides,
	};
}

function issues(input: LoomGroupFormValues): Record<string, string[]> {
	const result = loomGroupSchema.safeParse(input);
	if (result.success) return {};
	const out: Record<string, string[]> = {};
	for (const issue of result.error.issues) {
		const key = String(issue.path[0]);
		out[key] = [...(out[key] ?? []), issue.message];
	}
	return out;
}

describe("loomGroupSchema", () => {
	it("accepts a code, a name, a purpose and at least one member", () => {
		expect(issues(values())).toEqual({});
	});

	it("rejects a blank or whitespace-only code and name", () => {
		expect(issues(values({ group_code: "   " })).group_code).toEqual(["Group code is required"]);
		expect(issues(values({ group_name: "" })).group_name).toEqual(["Group name is required"]);
	});

	it("rejects an empty member list", () => {
		expect(issues(values({ machine_ids: [] })).machine_ids).toEqual(["Tick at least one loom"]);
	});

	it("only accepts STUDY or CONTROL as the purpose", () => {
		expect(issues(values({ group_purpose: GROUP_PURPOSE_CONTROL }))).toEqual({});
		expect(issues(values({ group_purpose: "OTHER" })).group_purpose).toEqual(["Purpose is required"]);
	});

	it("defaults to a Study group with no members", () => {
		expect(buildDefaultLoomGroupFormValues()).toEqual({
			group_code: "",
			group_name: "",
			group_purpose: GROUP_PURPOSE_STUDY,
			remarks: "",
			machine_ids: [],
		});
	});
});

describe("payload builders", () => {
	it("trims text, nulls blank remarks and copies the ids on create", () => {
		const payload = buildLoomGroupCreatePayload(
			values({ group_code: " EJM-L4 ", group_name: " Line 4 ", remarks: "  " }),
			9,
			12,
		);
		expect(payload).toEqual({
			co_id: 9,
			branch_id: 12,
			group_code: "EJM-L4",
			group_name: "Line 4",
			group_purpose: GROUP_PURPOSE_STUDY,
			remarks: null,
			machine_ids: [101, 102, 103],
		});
	});

	it("sends every field and the replacement member list on edit (no co_id in the body)", () => {
		const payload = buildLoomGroupEditPayload(values({ remarks: "night shift" }), 12);
		expect(payload).toEqual({
			branch_id: 12,
			group_code: "EJM-L4",
			group_name: "Line 4 weaver A",
			group_purpose: GROUP_PURPOSE_STUDY,
			remarks: "night shift",
			machine_ids: [101, 102, 103],
		});
		expect("co_id" in payload).toBe(false);
	});
});

describe("edit prefill", () => {
	it("keeps retired members in the id list so the edit never drops them", () => {
		const detail: LoomGroupDetail = {
			loom_group_id: 5,
			co_id: 9,
			branch_id: 12,
			group_code: "G1",
			group_name: "Group one",
			group_purpose: GROUP_PURPOSE_CONTROL,
			member_count: 2,
			remarks: null,
			event_count: 0,
			members: [
				// As the wire sends them: `machine_active`, no `active`.
				{ machine_id: 1, machine_name: "S293", mech_code: "L1", line_no: 1, machine_active: 1 },
				{ machine_id: 2, machine_name: "S294", mech_code: "L2", line_no: 1, machine_active: 0 },
			],
		};
		expect(toLoomGroupFormValues(detail)).toEqual({
			group_code: "G1",
			group_name: "Group one",
			group_purpose: GROUP_PURPOSE_CONTROL,
			remarks: "",
			machine_ids: [1, 2],
		});
	});

	it("round-trips ids through checklist members", () => {
		expect(membersToIds(idsToMembers([3, 4]))).toEqual([3, 4]);
		expect(idsToMembers([3])[0]).toEqual({ machine_id: 3, done_date: "", done_to_date: "" });
	});
});

describe("labels", () => {
	it("names the purposes and falls back to the code", () => {
		expect(purposeLabel(GROUP_PURPOSE_STUDY)).toBe("Study");
		expect(purposeLabel(GROUP_PURPOSE_CONTROL)).toBe("Control");
		expect(purposeLabel("X")).toBe("X");
	});

	it("names the group and warns about referenced groups in the delete confirm", () => {
		const text = deleteConfirmText({ group_code: "G1", group_name: "One", member_count: 1 });
		expect(text).toContain('"G1 — One" (1 loom)');
		expect(text).toContain("cannot be deleted");
	});
});
