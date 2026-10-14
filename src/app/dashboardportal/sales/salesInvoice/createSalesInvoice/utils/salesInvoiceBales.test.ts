import { describe, expect, it } from "vitest";
import { baleLinkToastSuffix, capDateToToday, invoiceTypeUsesBales } from "./salesInvoiceBales";

describe("invoiceTypeUsesBales", () => {
	it("is true for Regular, Hessian and Govt Sacking", () => {
		expect(invoiceTypeUsesBales("1")).toBe(true);
		expect(invoiceTypeUsesBales(2)).toBe(true);
		expect(invoiceTypeUsesBales("3")).toBe(true);
	});

	it("is false for Jute Yarn, Raw Jute, Freight and blanks", () => {
		expect(invoiceTypeUsesBales("4")).toBe(false);
		expect(invoiceTypeUsesBales(5)).toBe(false);
		expect(invoiceTypeUsesBales("7")).toBe(false);
		expect(invoiceTypeUsesBales("")).toBe(false);
		expect(invoiceTypeUsesBales(null)).toBe(false);
		expect(invoiceTypeUsesBales(undefined)).toBe(false);
	});
});

describe("capDateToToday", () => {
	const today = "2026-10-12";

	it("keeps a past or current invoice date", () => {
		expect(capDateToToday("2026-10-01", today)).toBe("2026-10-01");
		expect(capDateToToday("2026-10-12", today)).toBe("2026-10-12");
	});

	it("caps a future invoice date at today", () => {
		expect(capDateToToday("2026-10-20", today)).toBe(today);
	});

	it("falls back to today for blank or malformed input", () => {
		expect(capDateToToday("", today)).toBe(today);
		expect(capDateToToday(null, today)).toBe(today);
		expect(capDateToToday(undefined, today)).toBe(today);
		expect(capDateToToday("12/10/2026", today)).toBe(today);
	});
});

describe("baleLinkToastSuffix", () => {
	it("counts linked and relinked together", () => {
		expect(baleLinkToastSuffix({ linked: 3, relinked: 2, uninspectedSacking: 0 })).toBe(" · 5 bales linked");
	});

	it("uses the singular for one bale", () => {
		expect(baleLinkToastSuffix({ linked: 1, relinked: 0, uninspectedSacking: 0 })).toBe(" · 1 bale linked");
	});

	it("appends the uninspected sacking warning when non-zero", () => {
		expect(baleLinkToastSuffix({ linked: 4, relinked: 0, uninspectedSacking: 2 }))
			.toBe(" · 4 bales linked · 2 sacking bales were not inspected");
		expect(baleLinkToastSuffix({ linked: 4, relinked: 0, uninspectedSacking: 1 }))
			.toBe(" · 4 bales linked · 1 sacking bale was not inspected");
	});
});
