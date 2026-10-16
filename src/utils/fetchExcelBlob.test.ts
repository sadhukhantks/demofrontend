import axios, { AxiosError, type AxiosResponse } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchExcelBlob } from "./fetchExcelBlob";

function rejectWithBody(body: string) {
	const err = new AxiosError("Request failed", "ERR_BAD_RESPONSE", undefined, undefined, {
		// jsdom's Blob lacks .text(); browsers have it
		data: Object.assign(new Blob([body]), { text: async () => body }),
		status: 500,
	} as AxiosResponse);
	vi.spyOn(axios, "get").mockRejectedValueOnce(err);
}

describe("fetchExcelBlob", () => {
	afterEach(() => vi.restoreAllMocks());

	it("surfaces the backend detail instead of the generic message", async () => {
		rejectWithBody(JSON.stringify({ detail: "Result set too large" }));
		await expect(fetchExcelBlob("/x", { coId: 1 })).rejects.toThrow("Result set too large");
	});

	it("falls back to the generic message for a non-JSON body", async () => {
		rejectWithBody("<html>502</html>");
		await expect(fetchExcelBlob("/x", { coId: 1 })).rejects.toThrow("Excel download failed");
	});

	it("sends gate-entry-date bounds as ge_from_date / ge_to_date beside the document dates (TKT-000226)", async () => {
		const spy = vi.spyOn(axios, "get").mockResolvedValueOnce({ data: new Blob() } as AxiosResponse);
		await fetchExcelBlob("/x", { coId: 1, fromDate: "2026-09-01", geFromDate: "2026-10-01", geToDate: "2026-10-12" });
		const qs = new URLSearchParams(String(spy.mock.calls[0][0]).split("?")[1]);
		expect(qs.get("from_date")).toBe("2026-09-01");
		expect(qs.has("to_date")).toBe(false);
		expect(qs.get("ge_from_date")).toBe("2026-10-01");
		expect(qs.get("ge_to_date")).toBe("2026-10-12");
	});
});
