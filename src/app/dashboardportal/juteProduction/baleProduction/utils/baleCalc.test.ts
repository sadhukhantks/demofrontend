import { describe, expect, it } from "vitest";
import {
	BALE_DEVIATION_WARN_PCT,
	computeNet,
	deviationPct,
	deviationSeverity,
	formatKg,
	formatPct,
	isFutureISODate,
	nextBaleNo,
	resolveSeries,
	todayISO,
} from "./baleCalc";
import type { BaleSeriesOption } from "../types/baleTypes";

function series(p: Partial<BaleSeriesOption>): BaleSeriesOption {
	return {
		bale_series_id: 1,
		series_name: "PUNJAB",
		quality_type: 2,
		item_id: null,
		state_id: null,
		party_id: null,
		last_bale_no: 0,
		...p,
	};
}

describe("computeNet (F0)", () => {
	it("subtracts trolley tare and packsheet from gross", () => {
		expect(computeNet(294, 0, 5)).toBe(289);
		expect(computeNet(300, 61.5, 5)).toBe(233.5);
	});

	it("treats null/undefined tares as zero", () => {
		expect(computeNet(294, null, undefined)).toBe(294);
	});

	it("rounds to 3 decimals so float noise never reaches the preview", () => {
		expect(computeNet(0.3, 0.1, 0)).toBe(0.2);
		expect(computeNet(100.0005, 0, 0)).toBe(100.001);
	});

	it("can go negative — the form, not the helper, blocks the save", () => {
		expect(computeNet(3, 5, 5)).toBe(-7);
	});
});

describe("deviationPct / deviationSeverity", () => {
	it("is positive when heavy and negative when light (SPEC §5 sign convention)", () => {
		expect(deviationPct(376.67, 369)).toBeCloseTo(2.078, 2);
		expect(deviationPct(366.83, 369)).toBeCloseTo(-0.588, 2);
	});

	it("is null without a usable standard", () => {
		expect(deviationPct(300, null)).toBeNull();
		expect(deviationPct(300, 0)).toBeNull();
		expect(deviationPct(300, undefined)).toBeNull();
	});

	it("warns only beyond the ±3 % band", () => {
		expect(BALE_DEVIATION_WARN_PCT).toBe(3);
		expect(deviationSeverity(2.9)).toBe("ok");
		expect(deviationSeverity(-3)).toBe("ok");
		expect(deviationSeverity(3.01)).toBe("warn");
		expect(deviationSeverity(-7)).toBe("warn");
		expect(deviationSeverity(null)).toBeNull();
	});
});

describe("nextBaleNo (F9)", () => {
	it("is last + 1, starting from 1 for a fresh series", () => {
		expect(nextBaleNo(24746)).toBe(24747);
		expect(nextBaleNo(0)).toBe(1);
		expect(nextBaleNo(null)).toBe(1);
	});
});

describe("resolveSeries", () => {
	const all = [
		series({ bale_series_id: 1, series_name: "PUNJAB", quality_type: 2 }),
		series({ bale_series_id: 2, series_name: "FCI", quality_type: 2 }),
		series({ bale_series_id: 3, series_name: '40"-6.50', quality_type: 1, item_id: 1189 }),
		series({ bale_series_id: 4, series_name: '39"-5.85', quality_type: 1, item_id: 1036 }),
	];

	it("prefers the series bound to the quality's own item (hessian pattern) and auto-selects it", () => {
		const r = resolveSeries(all, { item_id: 1189, quality_type: 1 });
		expect(r.rule).toBe("item");
		expect(r.candidates.map((s) => s.bale_series_id)).toEqual([3]);
		expect(r.auto?.bale_series_id).toBe(3);
	});

	it("falls back to unbound series of the same type (sacking pattern) and leaves the pick open when several", () => {
		const r = resolveSeries(all, { item_id: 2115, quality_type: 2 });
		expect(r.rule).toBe("type");
		expect(r.candidates.map((s) => s.series_name)).toEqual(["PUNJAB", "FCI"]);
		expect(r.auto).toBeNull();
	});

	it("auto-selects a lone type-level series", () => {
		const r = resolveSeries([all[0], all[2]], { item_id: 2115, quality_type: 2 });
		expect(r.auto?.series_name).toBe("PUNJAB");
	});

	it("never offers a series bound to a different item", () => {
		const r = resolveSeries(all, { item_id: 999, quality_type: 1 });
		expect(r.rule).toBe("none");
		expect(r.candidates).toEqual([]);
		expect(r.auto).toBeNull();
	});

	it("returns nothing without a quality", () => {
		expect(resolveSeries(all, null)).toEqual({ candidates: [], auto: null, rule: "none" });
	});
});

describe("formatting", () => {
	it("formatKg strips trailing zeros but keeps up to 3 decimals", () => {
		expect(formatKg(294)).toBe("294");
		expect(formatKg(293.5)).toBe("293.5");
		expect(formatKg(0.1255)).toBe("0.126");
		expect(formatKg(null)).toBe("");
	});

	it("formatPct is signed with a real minus sign", () => {
		expect(formatPct(2.078)).toBe("+2.1 %");
		expect(formatPct(-0.588)).toBe("−0.6 %");
		expect(formatPct(0)).toBe("0.0 %");
		expect(formatPct(null)).toBe("");
	});
});

describe("dates", () => {
	it("todayISO is a local YYYY-MM-DD and never in the future", () => {
		expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(isFutureISODate(todayISO())).toBe(false);
		expect(isFutureISODate("2999-01-01")).toBe(true);
		expect(isFutureISODate("")).toBe(false);
	});
});
