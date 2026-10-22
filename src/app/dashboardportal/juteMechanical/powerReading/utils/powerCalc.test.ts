import { describe, expect, it } from "vitest";
import {
	CLOSING_BELOW_OPENING_MSG,
	computeKwh,
	ddmmyyyy,
	dgWarning,
	isFutureDate,
	spikeWarning,
	toNumberOrNull,
} from "./powerCalc";
import {
	buildReadingsPayload,
	readingRowSchema,
	rowsFromDay,
	type PowerReadingFormValues,
	type ReadingRowValues,
} from "../types/powerTypes";
import type { MechPowerReadingsDay } from "@/utils/juteMechanicalService";

function row(overrides: Partial<ReadingRowValues> = {}): ReadingRowValues {
	return {
		meter_code: "MAIN",
		opening_kwh: "",
		closing_kwh: "",
		kwh: "",
		dg_hours: "",
		dg_litres: "",
		max_demand_kva: "",
		remarks: "",
		prefilled_opening: "",
		...overrides,
	};
}

describe("toNumberOrNull", () => {
	it("reads numbers and blanks", () => {
		expect(toNumberOrNull("1500.25")).toBe(1500.25);
		expect(toNumberOrNull(" 12 ")).toBe(12);
		expect(toNumberOrNull("")).toBeNull();
		expect(toNumberOrNull("   ")).toBeNull();
		expect(toNumberOrNull(null)).toBeNull();
		expect(toNumberOrNull(undefined)).toBeNull();
		expect(toNumberOrNull("abc")).toBeNull();
		expect(toNumberOrNull(7)).toBe(7);
	});
});

describe("computeKwh", () => {
	it("computes closing − opening when both bounds are keyed, ignoring a typed kWh", () => {
		expect(computeKwh(1000, 1500, 999)).toEqual({ kwh: 500, source: "computed", error: null });
		expect(computeKwh(10.1, 20.3, null).kwh).toBe(10.2);
	});

	it("refuses a closing below the opening", () => {
		expect(computeKwh(1500, 1000, null)).toEqual({
			kwh: null,
			source: "computed",
			error: CLOSING_BELOW_OPENING_MSG,
		});
	});

	it("uses the typed kWh only when a bound is missing (meter reset)", () => {
		expect(computeKwh(null, 1500, 420)).toEqual({ kwh: 420, source: "typed", error: null });
		expect(computeKwh(1000, null, 420).source).toBe("typed");
		expect(computeKwh(null, null, 0)).toEqual({ kwh: 0, source: "typed", error: null });
	});

	it("rejects a negative typed kWh and reports nothing when nothing is keyed", () => {
		expect(computeKwh(null, null, -5).error).toBe("kWh cannot be negative");
		expect(computeKwh(null, null, null)).toEqual({ kwh: null, source: "none", error: null });
	});
});

describe("isFutureDate", () => {
	it("compares ISO dates against the server's IST today", () => {
		expect(isFutureDate("2026-10-19", "2026-10-18")).toBe(true);
		expect(isFutureDate("2026-10-18", "2026-10-18")).toBe(false);
		expect(isFutureDate("2026-10-17", "2026-10-18")).toBe(false);
		expect(isFutureDate("", "2026-10-18")).toBe(false);
		expect(isFutureDate("2026-10-19", null)).toBe(false);
	});
});

describe("spikeWarning", () => {
	it("fires only above 3× the 30-day median", () => {
		expect(spikeWarning("DG1", 60, 11)).toContain("more than 3x the 30-day median");
		expect(spikeWarning("DG1", 60, 11)).toContain("DG1:");
		expect(spikeWarning("DG1", 33, 11)).toBeNull();
		expect(spikeWarning("DG1", 33.01, 11)).not.toBeNull();
	});

	it("is silent without history or without a kWh", () => {
		expect(spikeWarning("MAIN", 90000, null)).toBeNull();
		expect(spikeWarning("MAIN", 90000, 0)).toBeNull();
		expect(spikeWarning("MAIN", null, 100)).toBeNull();
	});
});

describe("dgWarning", () => {
	it("flags litres without hours", () => {
		expect(dgWarning("DG", null, 50)).toBe("DG litres keyed without DG hours");
		expect(dgWarning("DG", 0, 50)).toBe("DG litres keyed without DG hours");
	});

	it("flags DG figures on a non-DG meter", () => {
		expect(dgWarning("GRID", 2, null)).toBe("DG hours keyed on a non-DG meter");
		expect(dgWarning("SOLAR", 2, 10)).toBe("DG hours keyed on a non-DG meter");
	});

	it("is silent for a consistent DG row or an empty one", () => {
		expect(dgWarning("DG", 2.5, 310)).toBeNull();
		expect(dgWarning("DG", 2.5, null)).toBeNull();
		expect(dgWarning("GRID", null, null)).toBeNull();
	});
});

describe("ddmmyyyy", () => {
	it("formats an ISO date", () => {
		expect(ddmmyyyy("2026-10-17")).toBe("17/10/2026");
		expect(ddmmyyyy("")).toBe("");
		expect(ddmmyyyy(null)).toBe("");
	});
});

describe("readingRowSchema", () => {
	const issues = (values: ReadingRowValues): string[] => {
		const result = readingRowSchema.safeParse(values);
		return result.success ? [] : result.error.issues.map((issue) => issue.message);
	};

	it("accepts a wholly blank row (it is dropped on save)", () => {
		expect(issues(row())).toEqual([]);
	});

	it("accepts a row holding only the untouched opening prefill", () => {
		// DG1 was prefilled with yesterday's closing and left alone: no closing or
		// kWh is demanded of it, so keying the MAIN meter alone can go through.
		expect(issues(row({ opening_kwh: "250.5", prefilled_opening: "250.5" }))).toEqual([]);
	});

	it("validates a prefilled row once anything else is keyed on it", () => {
		expect(issues(row({ opening_kwh: "250.5", prefilled_opening: "250.5", dg_hours: "2" }))).toEqual([
			"Enter opening & closing, or kWh",
		]);
		expect(issues(row({ opening_kwh: "250.5", prefilled_opening: "250.5", closing_kwh: "300" }))).toEqual([]);
		// The prefill edited to something else is a keyed opening.
		expect(issues(row({ opening_kwh: "260", prefilled_opening: "250.5" }))).toEqual([
			"Enter opening & closing, or kWh",
		]);
	});

	it("accepts both bounds, and refuses closing below opening", () => {
		expect(issues(row({ opening_kwh: "1000", closing_kwh: "1500" }))).toEqual([]);
		expect(issues(row({ opening_kwh: "1500", closing_kwh: "1000" }))).toEqual([
			CLOSING_BELOW_OPENING_MSG,
		]);
	});

	it("needs a typed kWh when a bound is missing", () => {
		expect(issues(row({ closing_kwh: "1500" }))).toEqual(["Enter opening & closing, or kWh"]);
		expect(issues(row({ closing_kwh: "1500", kwh: "400" }))).toEqual([]);
		expect(issues(row({ dg_hours: "2" }))).toEqual(["Enter opening & closing, or kWh"]);
	});

	it("rejects negative DG / kVA figures", () => {
		expect(issues(row({ kwh: "10", dg_hours: "-1" }))).toEqual(["Cannot be negative"]);
	});
});

describe("buildReadingsPayload", () => {
	const values: PowerReadingFormValues = {
		rows: [
			row({ opening_kwh: "1000", closing_kwh: "1500", kwh: "999", max_demand_kva: "1200" }),
			row({ meter_code: "DG1" }),
			row({ meter_code: "DG2", kwh: "60", dg_hours: "2", dg_litres: "50", remarks: " reset " }),
		],
	};

	it("drops wholly blank rows and sends spell_id null for the whole day", () => {
		const payload = buildReadingsPayload(values, 1, 2, "2026-10-17", null);
		expect(payload).toMatchObject({ co_id: 1, branch_id: 2, tran_date: "2026-10-17", spell_id: null });
		expect(payload.rows.map((r) => r.meter_code)).toEqual(["MAIN", "DG2"]);
	});

	it("drops a row whose only content is the untouched opening prefill", () => {
		const prefillOnly: PowerReadingFormValues = {
			rows: [
				row({ opening_kwh: "1000", closing_kwh: "1500" }),
				row({ meter_code: "DG1", opening_kwh: "250.5", prefilled_opening: "250.5" }),
				row({ meter_code: "DG2", opening_kwh: "250.5", prefilled_opening: "250.5", closing_kwh: "310" }),
			],
		};
		const payload = buildReadingsPayload(prefillOnly, 1, 2, "2026-10-17", null);
		expect(payload.rows.map((r) => r.meter_code)).toEqual(["MAIN", "DG2"]);
		// A prefill the electrician completed travels as the opening.
		expect(payload.rows[1]).toMatchObject({ opening_kwh: 250.5, closing_kwh: 310, kwh: 59.5 });
	});

	it("sends the computed kWh when both bounds are present and the typed one otherwise", () => {
		const payload = buildReadingsPayload(values, 1, 2, "2026-10-17", 3);
		expect(payload.spell_id).toBe(3);
		expect(payload.rows[0]).toEqual({
			meter_code: "MAIN",
			opening_kwh: 1000,
			closing_kwh: 1500,
			kwh: 500,
			dg_hours: null,
			dg_litres: null,
			max_demand_kva: 1200,
			remarks: null,
		});
		expect(payload.rows[1]).toEqual({
			meter_code: "DG2",
			opening_kwh: null,
			closing_kwh: null,
			kwh: 60,
			dg_hours: 2,
			dg_litres: 50,
			max_demand_kva: null,
			remarks: "reset",
		});
	});
});

describe("rowsFromDay", () => {
	const day: MechPowerReadingsDay = {
		tran_date: "2026-10-17",
		spell_id: null,
		today: "2026-10-18",
		lock: { locked: false, can_override: false, lock_days: 7 },
		spells: [],
		rows: [
			{
				meter_code: "MAIN",
				meter_name: "Main grid meter",
				meter_type: "GRID",
				meter_active: 1,
				power_reading_id: null,
				opening_kwh: null,
				closing_kwh: null,
				kwh: null,
				dg_hours: null,
				dg_litres: null,
				max_demand_kva: null,
				remarks: null,
				prefill_opening_kwh: 1000,
				prefill_from_date: "2026-10-16",
				median30_kwh: 480.5,
			},
			{
				meter_code: "DG1",
				meter_name: "DG set 1",
				meter_type: "DG",
				meter_active: 1,
				power_reading_id: 11,
				opening_kwh: null,
				closing_kwh: null,
				kwh: 60,
				dg_hours: 2,
				dg_litres: 50,
				max_demand_kva: null,
				remarks: "reset",
				prefill_opening_kwh: 250.5,
				prefill_from_date: "2026-10-16",
				median30_kwh: null,
			},
		],
	};

	it("prefills the opening from the previous closing only on an unsaved row", () => {
		const rows = rowsFromDay(day);
		expect(rows[0]).toMatchObject({
			meter_code: "MAIN",
			opening_kwh: "1000",
			closing_kwh: "",
			prefilled_opening: "1000",
		});
		// Saved with a typed kWh (meter reset): the prefill must not overwrite the blank opening.
		expect(rows[1]).toMatchObject({
			meter_code: "DG1",
			opening_kwh: "",
			kwh: "60",
			dg_hours: "2",
			dg_litres: "50",
			remarks: "reset",
			prefilled_opening: "",
		});
		// Untouched, the prefilled row is blank; it is not sent.
		expect(buildReadingsPayload({ rows }, 1, 2, "2026-10-17", null).rows.map((r) => r.meter_code)).toEqual([
			"DG1",
		]);
		expect(rowsFromDay(null)).toEqual([]);
	});
});
