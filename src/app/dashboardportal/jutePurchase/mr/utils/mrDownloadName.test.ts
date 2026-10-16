import { describe, expect, it } from "vitest";
import { mrDownloadSuffix } from "./mrDownloadName";

const none = { fromDate: "", toDate: "", geFromDate: "", geToDate: "" };

describe("mrDownloadSuffix (TKT-000226)", () => {
	it("is 'all' without any bound", () => {
		expect(mrDownloadSuffix(none)).toBe("all");
	});
	it("names the MR-date range as before", () => {
		expect(mrDownloadSuffix({ ...none, fromDate: "2026-09-01", toDate: "2026-09-30" })).toBe("2026-09-01_2026-09-30");
	});
	it("prefixes a gate-entry range with ge_", () => {
		expect(mrDownloadSuffix({ ...none, geFromDate: "2026-10-01", geToDate: "2026-10-12" })).toBe("ge_2026-10-01_2026-10-12");
	});
	it("keeps both when both are set (same as the backend file name)", () => {
		expect(mrDownloadSuffix({ ...none, fromDate: "2026-09-01", geToDate: "2026-10-12" })).toBe("2026-09-01_ge_2026-10-12");
	});
});
