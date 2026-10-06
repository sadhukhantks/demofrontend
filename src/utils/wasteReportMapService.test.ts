import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.mock("@/utils/apiClient2", () => ({
	fetchWithCookie: (...args: unknown[]) => fetchMock(...args),
}));

import { apiRoutesPortalMasters } from "@/utils/api";
import {
	createWasteReportMap,
	deactivateWasteReportMap,
	fetchWasteReportMapList,
	fetchWasteReportMapSetup,
	updateWasteReportMap,
	type WasteReportMapPayload,
} from "./wasteReportMapService";

beforeEach(() => {
	fetchMock.mockReset();
});

const PAYLOAD: WasteReportMapPayload = {
	co_id: 1,
	group_code: "LINE_WASTE",
	group_name: "Line Waste",
	day_denom: "WINDING",
	total_denom: "WINDING",
	item_id: 270197,
	dept_id: null,
	col_label: null,
	display_order: 15,
};

describe("wasteReportMapService", () => {
	it("fetches setup with co_id and fills missing lists", async () => {
		fetchMock.mockResolvedValue({
			data: { data: { waste_items: [{ item_id: 1, item_code: "1", item_name: "Hard Waste" }] } },
			error: null,
			status: 200,
		});

		const setup = await fetchWasteReportMapSetup(1);

		expect(fetchMock).toHaveBeenCalledWith(`${apiRoutesPortalMasters.WASTE_REPORT_MAP_SETUP}?co_id=1`, "GET", undefined);
		expect(setup.waste_items).toHaveLength(1);
		expect(setup.departments).toEqual([]);
		expect(setup.denominators).toEqual([]);
		expect(setup.groups).toEqual([]);
	});

	it("fetches the list with co_id", async () => {
		fetchMock.mockResolvedValue({ data: { data: [{ waste_report_map_id: 1 }] }, error: null, status: 200 });

		const rows = await fetchWasteReportMapList("2");

		expect(fetchMock).toHaveBeenCalledWith(`${apiRoutesPortalMasters.WASTE_REPORT_MAP_LIST}?co_id=2`, "GET", undefined);
		expect(rows).toEqual([{ waste_report_map_id: 1 }]);
	});

	it("posts create and update bodies", async () => {
		fetchMock.mockResolvedValue({
			data: { data: { waste_report_map_id: 9, group_code: "LINE_WASTE", group_rows_updated: 0 } },
			error: null,
			status: 200,
		});

		await createWasteReportMap(PAYLOAD);
		await updateWasteReportMap({ ...PAYLOAD, waste_report_map_id: 9 });

		expect(fetchMock).toHaveBeenNthCalledWith(1, apiRoutesPortalMasters.WASTE_REPORT_MAP_CREATE, "POST", PAYLOAD);
		expect(fetchMock).toHaveBeenNthCalledWith(2, apiRoutesPortalMasters.WASTE_REPORT_MAP_UPDATE, "POST", {
			...PAYLOAD,
			waste_report_map_id: 9,
		});
	});

	it("posts deactivate with a numeric co_id", async () => {
		fetchMock.mockResolvedValue({ data: { data: { waste_report_map_id: 9, active: 0 } }, error: null, status: 200 });

		await deactivateWasteReportMap("1", 9);

		expect(fetchMock).toHaveBeenCalledWith(apiRoutesPortalMasters.WASTE_REPORT_MAP_DEACTIVATE, "POST", {
			co_id: 1,
			waste_report_map_id: 9,
		});
	});

	it("throws the backend message on an error", async () => {
		fetchMock.mockResolvedValue({ data: null, error: "This waste item is already mapped", status: 400 });

		await expect(createWasteReportMap(PAYLOAD)).rejects.toThrow("This waste item is already mapped");
	});
});
