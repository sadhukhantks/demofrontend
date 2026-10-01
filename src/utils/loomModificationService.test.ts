import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.mock("@/utils/apiClient2", () => ({
	fetchWithCookie: (...args: unknown[]) => fetchMock(...args),
}));

import {
	fetchLoomGroupDetail,
	fetchModificationById,
	fetchModificationChain,
	fetchModificationTable,
	normalizeMemberActive,
	normalizeModificationRow,
	type ModificationRowWire,
} from "./loomModificationService";

beforeEach(() => {
	fetchMock.mockReset();
});

/** A `/modification_table` row exactly as `_EVENT_COLUMNS` + `_serialize` emit it. */
function wireRow(overrides: Partial<ModificationRowWire> = {}): ModificationRowWire {
	return {
		modification_id: 7,
		root_modification_id: 5,
		parent_modification_id: 5,
		mod_kind: "FOLLOWUP",
		mod_kind_label: "Follow-up",
		mod_date: "2026-07-10",
		mod_to_date: null,
		settle_days: 3,
		title: "Tighter beat-up",
		mod_category: "SETTING",
		mod_category_label: "Setting",
		done_by: "INHOUSE",
		party_name: null,
		total_cost: null,
		loom_group_id: 2,
		group_name: "Line 4",
		loom_count: 12,
		children_count: 1,
		stage_count: 3,
		stage_no: 2,
		stage_label: "2 of 3",
		data_check: { before_days: 30, after_days: 12 },
		...overrides,
	};
}

describe("normalizeModificationRow", () => {
	it("derives has_children / stage_seq from the wire's children_count / stage_no", () => {
		const row = normalizeModificationRow(wireRow());
		expect(row.has_children).toBe(true);
		expect(row.stage_seq).toBe(2);
		expect(row.children_count).toBe(1);
		expect(row.stage_no).toBe(2);
		expect(row.stage_count).toBe(3);
	});

	it("marks a leaf stage as deletable and defaults a missing stage_no to 1", () => {
		const leaf = normalizeModificationRow(wireRow({ children_count: 0, stage_no: 3 }));
		expect(leaf.has_children).toBe(false);
		expect(leaf.stage_seq).toBe(3);
		const bare = normalizeModificationRow({
			...wireRow(),
			children_count: undefined as unknown as number,
			stage_no: undefined as unknown as number,
		});
		expect(bare.has_children).toBe(false);
		expect(bare.stage_seq).toBe(1);
	});
});

describe("normalizeMemberActive", () => {
	it("copies machine_active into active and defaults a bare row to active", () => {
		expect(normalizeMemberActive({ machine_active: 0 }).active).toBe(0);
		expect(normalizeMemberActive({ machine_active: 1 }).active).toBe(1);
		expect(normalizeMemberActive({ active: 0 }).active).toBe(0);
		expect(normalizeMemberActive({}).active).toBe(1);
	});
});

describe("fetchModificationTable", () => {
	it("returns grid rows carrying has_children and stage_seq from a wire page", async () => {
		fetchMock.mockResolvedValue({
			data: { data: [wireRow(), wireRow({ modification_id: 8, children_count: 0, stage_no: 3 })], total: 2, page: 1, page_size: 25 },
			error: null,
		});
		const result = await fetchModificationTable({ coId: 9, branchId: 12, page: 1, limit: 25 });
		expect(result.total).toBe(2);
		expect(result.data.map((r) => r.has_children)).toEqual([true, false]);
		expect(result.data.map((r) => r.stage_seq)).toEqual([2, 3]);
		const url = String(fetchMock.mock.calls[0]?.[0]);
		expect(url).toContain("co_id=9");
		expect(url).toContain("branch_id=12");
	});

	it("throws the backend's message on error", async () => {
		fetchMock.mockResolvedValue({ data: null, error: "branch_id is required" });
		await expect(fetchModificationTable({ coId: 9 })).rejects.toThrow("branch_id is required");
	});
});

describe("member normalisation on detail calls", () => {
	const wireMember = (id: number, machineActive: number) => ({
		machine_id: id,
		machine_name: `S${id}`,
		mech_code: null,
		line_no: "1",
		machine_active: machineActive,
		label: `S${id}`,
	});

	it("fetchLoomGroupDetail exposes members' machine_active as active", async () => {
		fetchMock.mockResolvedValue({
			data: {
				data: {
					loom_group_id: 2,
					co_id: 9,
					branch_id: 12,
					group_code: "L4",
					group_name: "Line 4",
					group_purpose: "STUDY",
					member_count: 2,
					remarks: null,
					event_count: 0,
					members: [wireMember(1, 1), wireMember(2, 0)],
				},
			},
			error: null,
		});
		const detail = await fetchLoomGroupDetail(2, 9);
		expect(detail.members.map((m) => m.active)).toEqual([1, 0]);
		expect(detail.members.map((m) => m.machine_active)).toEqual([1, 0]);
	});

	it("fetchModificationById exposes snapshot rows' machine_active as active", async () => {
		fetchMock.mockResolvedValue({
			data: {
				data: {
					modification_id: 7,
					members: [
						{ ...wireMember(1, 1), done_date: null, done_to_date: null, remarks: null },
						{ ...wireMember(2, 0), done_date: "2026-07-11", done_to_date: null, remarks: null },
					],
					parent: null,
					children: [],
				},
			},
			error: null,
		});
		const detail = await fetchModificationById(7, 9);
		expect(detail.members.map((m) => m.active)).toEqual([1, 0]);
	});

	it("fetchModificationChain unwraps the {root_modification_id, events} envelope", async () => {
		fetchMock.mockResolvedValue({
			data: {
				data: {
					root_modification_id: 5,
					events: [{ modification_id: 5, members: [wireMember(1, 0)] }],
				},
			},
			error: null,
		});
		const stages = await fetchModificationChain(5, 9);
		expect(stages).toHaveLength(1);
		expect(stages[0]?.members[0]?.active).toBe(0);
	});
});
