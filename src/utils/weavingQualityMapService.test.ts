import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.mock("@/utils/apiClient2", () => ({
	fetchWithCookie: (...args: unknown[]) => fetchMock(...args),
}));

import {
	carryForwardQualityMap,
	carryForwardRequestSchema,
	fetchLoomGroupings,
	inclusiveDays,
	type CarryForwardRequest,
} from "./weavingQualityMapService";

beforeEach(() => {
	fetchMock.mockReset();
});

const base: CarryForwardRequest = {
	co_id: 106,
	branch_id: 87,
	from_date: "2026-10-07",
	to_date: "2026-10-08",
	spell_ids: [102, 105, 108],
	dry_run: true,
	today: "2026-10-09",
};

describe("carryForwardRequestSchema", () => {
	it("accepts a valid range", () => {
		expect(carryForwardRequestSchema.safeParse(base).success).toBe(true);
	});
	it.each([
		[{ from_date: "2026-10-09", to_date: "2026-10-08" }, "on or before"],
		[{ to_date: "2026-10-10" }, "Future"],
		[{ from_date: "2026-09-01" }, "At most 31"],
		[{ spell_ids: [] }, "at least one spell"],
		[{ to_date: "" }, "Pick a date"],
	])("rejects %o", (patch, msg) => {
		const r = carryForwardRequestSchema.safeParse({ ...base, ...patch });
		expect(r.success).toBe(false);
		if (!r.success) expect(r.error.issues.map((i) => i.message).join(" ")).toContain(msg);
	});
	it("counts days inclusively", () => {
		expect(inclusiveDays("2026-10-01", "2026-10-31")).toBe(31);
		expect(inclusiveDays("2026-10-08", "2026-10-08")).toBe(1);
	});
});

describe("carryForwardQualityMap", () => {
	it("posts the body without the client-only today field and unwraps data", async () => {
		const result = { dry_run: true, filled: 0, to_fill: 3, restamped: 0, cells: [] };
		fetchMock.mockResolvedValue({ data: { data: result }, error: null });
		await expect(carryForwardQualityMap(base)).resolves.toEqual(result);
		const [url, method, body] = fetchMock.mock.calls[0];
		expect(url).toContain("/weavingProd/quality_map_carry_forward");
		expect(method).toBe("POST");
		expect(body).toEqual({
			co_id: 106,
			branch_id: 87,
			from_date: "2026-10-07",
			to_date: "2026-10-08",
			spell_ids: [102, 105, 108],
			dry_run: true,
		});
	});
	it("throws the validation message without calling the API", async () => {
		await expect(carryForwardQualityMap({ ...base, to_date: "2026-10-10" })).rejects.toThrow("Future");
		expect(fetchMock).not.toHaveBeenCalled();
	});
	it("throws the backend error", async () => {
		fetchMock.mockResolvedValue({ data: null, error: "Spell(s) [9] do not belong to this branch" });
		await expect(carryForwardQualityMap(base)).rejects.toThrow("do not belong");
	});
});

describe("fetchLoomGroupings", () => {
	it("returns the groups for the branch", async () => {
		const g = [{ source: "machine_group", group_id: 1, group_code: "WVGS4", group_name: "WVGS4", machine_ids: [5] }];
		fetchMock.mockResolvedValue({ data: { data: g }, error: null });
		await expect(fetchLoomGroupings(2, 29)).resolves.toEqual(g);
		expect(fetchMock.mock.calls[0][0]).toContain("quality_map_groups?co_id=2&branch_id=29");
	});
	it("returns [] on an empty payload and throws on error", async () => {
		fetchMock.mockResolvedValueOnce({ data: null, error: null });
		await expect(fetchLoomGroupings(2, 29)).resolves.toEqual([]);
		fetchMock.mockResolvedValueOnce({ data: null, error: "boom" });
		await expect(fetchLoomGroupings(2, 29)).rejects.toThrow("boom");
	});
});
