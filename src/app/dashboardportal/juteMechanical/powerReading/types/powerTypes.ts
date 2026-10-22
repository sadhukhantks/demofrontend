// Page-local form contract for Power Readings (ITM-004).
//
// ENTITY types (MechPowerMeter, MechPowerReadingRow, MechPowerReadingsDay,
// MechPowerReadingsSavePayload, ...) are owned by `src/utils/juteMechanicalService.ts`
// and are imported, never re-declared. What lives here is only what the SCREEN
// needs on top of them: the Zod form contracts, the form <-> API mappers and the
// stable empty references.
//
// Form fields are held as STRINGS (house style — MUI inputs bind to strings);
// they become numbers/nulls exactly once, in `buildReadingsPayload`.

import { z } from "zod";
import type {
	MechMeterType,
	MechPowerMeter,
	MechPowerMeterPayload,
	MechPowerReadingsDay,
	MechPowerReadingsSavePayload,
	MechPowerReadingSaveRow,
} from "@/utils/juteMechanicalService";
import { computeKwh, toNumberOrNull } from "../utils/powerCalc";

const MAX_REMARKS = 255;
const MAX_METER_CODE = 20;
const MAX_METER_NAME = 100;

/** Meter kinds, in the order the master lists them. */
export const METER_TYPES = ["GRID", "DG", "SOLAR"] as const satisfies ReadonlyArray<MechMeterType>;

// =============================================================================
// Readings form
// =============================================================================

/** Numeric fields of a reading row (every one a string in the form). */
const NUMERIC_FIELDS = [
	"opening_kwh",
	"closing_kwh",
	"kwh",
	"dg_hours",
	"dg_litres",
	"max_demand_kva",
] as const;

/** Blank-or-non-negative rule for the optional numeric fields (server 422s below 0). */
function nonNegativeIssue(value: string): string | null {
	if (value.trim() === "") return null;
	const parsed = toNumberOrNull(value);
	if (parsed == null) return "Must be a number";
	if (parsed < 0) return "Cannot be negative";
	return null;
}

/** The raw field shape of one row (shared by the schema and the blank-row rule). */
interface ReadingRowShape {
	meter_code: string;
	opening_kwh: string;
	closing_kwh: string;
	kwh: string;
	dg_hours: string;
	dg_litres: string;
	max_demand_kva: string;
	remarks: string;
	prefilled_opening: string;
}

/**
 * True when the row holds nothing the electrician keyed: every field blank, OR
 * the only content is the untouched opening prefill (the previous closing the
 * server offered). Such a row is neither validated nor sent — otherwise every
 * meter with a prefill would demand a closing before ANY row could be saved.
 */
function holdsNothingKeyed(row: ReadingRowShape): boolean {
	if (row.remarks.trim() !== "") return false;
	const othersBlank = NUMERIC_FIELDS.every(
		(key) => key === "opening_kwh" || row[key].trim() === ""
	);
	if (!othersBlank) return false;
	const opening = row.opening_kwh.trim();
	if (opening === "") return true;
	const prefill = row.prefilled_opening.trim();
	return prefill !== "" && opening === prefill;
}

/**
 * One meter's reading as the form holds it.
 *
 * A row with nothing keyed (blank, or only the untouched opening prefill) is
 * valid and is dropped on save. Once anything is keyed, the row must yield a
 * kWh: both bounds (closing ≥ opening) or a typed kWh. These mirror the
 * server's 400s so the electrician is told before the round trip.
 *
 * `prefilled_opening` is not an input: it records the prefill the row was
 * seeded with so the blank-row rule can tell "untouched" from "keyed".
 */
export const readingRowSchema = z
	.object({
		meter_code: z.string(),
		opening_kwh: z.string(),
		closing_kwh: z.string(),
		kwh: z.string(),
		dg_hours: z.string(),
		dg_litres: z.string(),
		max_demand_kva: z.string(),
		remarks: z.string().max(MAX_REMARKS, `Remarks cannot exceed ${MAX_REMARKS} characters`),
		prefilled_opening: z.string(),
	})
	.superRefine((row, ctx) => {
		if (holdsNothingKeyed(row)) return;

		// Each numeric field must at least parse and be ≥ 0.
		for (const key of ["dg_hours", "dg_litres", "max_demand_kva"] as const) {
			const message = nonNegativeIssue(row[key]);
			if (message) ctx.addIssue({ code: "custom", path: [key], message });
		}
		for (const key of ["opening_kwh", "closing_kwh"] as const) {
			if (row[key].trim() !== "" && toNumberOrNull(row[key]) == null) {
				ctx.addIssue({ code: "custom", path: [key], message: "Must be a number" });
			}
		}

		const opening = toNumberOrNull(row.opening_kwh);
		const closing = toNumberOrNull(row.closing_kwh);
		const typed = toNumberOrNull(row.kwh);
		const bothBounds = opening != null && closing != null;

		if (bothBounds) {
			const result = computeKwh(opening, closing, typed);
			if (result.error) {
				ctx.addIssue({ code: "custom", path: ["closing_kwh"], message: result.error });
			}
			return;
		}

		if (row.kwh.trim() !== "" && typed == null) {
			ctx.addIssue({ code: "custom", path: ["kwh"], message: "Must be a number" });
			return;
		}
		if (typed == null) {
			ctx.addIssue({
				code: "custom",
				path: ["kwh"],
				message: "Enter opening & closing, or kWh",
			});
			return;
		}
		if (typed < 0) {
			ctx.addIssue({ code: "custom", path: ["kwh"], message: "kWh cannot be negative" });
		}
	});

export const readingsFormSchema = z.object({
	rows: z.array(readingRowSchema),
});

/** The single source of truth for the readings form's TypeScript type. */
export type PowerReadingFormValues = z.infer<typeof readingsFormSchema>;

/** One row of the readings form. */
export type ReadingRowValues = PowerReadingFormValues["rows"][number];

/** Stable empty row list (frozen so memo dependencies never churn). */
export const EMPTY_ROWS: ReadonlyArray<ReadingRowValues> = Object.freeze([]);

/**
 * True when nothing has been keyed on the row (dropped on save): every field
 * blank, or only the untouched opening prefill.
 */
export function isBlankRow(row: ReadingRowValues): boolean {
	return holdsNothingKeyed(row);
}

function textOrNull(value: string): string | null {
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

function numberToField(value: number | null | undefined): string {
	return value == null ? "" : String(value);
}

/**
 * The day's rows lifted into form strings.
 *
 * A meter with no saved reading yet shows the previous closing as its opening
 * (`prefill_opening_kwh`) — visible and editable, so the electrician only keys
 * the closing. The same value is recorded in `prefilled_opening`, so a row left
 * at its prefill alone counts as blank (not validated, not sent). A saved
 * reading is shown exactly as stored, even when its opening is blank (a typed
 * kWh after a meter reset): the prefill must not overwrite it.
 */
export function rowsFromDay(day: MechPowerReadingsDay | null): ReadingRowValues[] {
	if (!day) return [];
	return day.rows.map((row) => {
		const unsaved = row.power_reading_id == null;
		const prefilled =
			unsaved && row.opening_kwh == null && row.prefill_opening_kwh != null
				? String(row.prefill_opening_kwh)
				: "";
		const opening = row.opening_kwh != null ? String(row.opening_kwh) : prefilled;
		return {
			meter_code: row.meter_code,
			opening_kwh: opening,
			closing_kwh: numberToField(row.closing_kwh),
			kwh: numberToField(row.kwh),
			dg_hours: numberToField(row.dg_hours),
			dg_litres: numberToField(row.dg_litres),
			max_demand_kva: numberToField(row.max_demand_kva),
			remarks: row.remarks ?? "",
			prefilled_opening: prefilled,
		};
	});
}

/** One validated form row -> the API row (numbers/nulls, computed kWh). */
export function buildReadingSaveRow(row: ReadingRowValues): MechPowerReadingSaveRow {
	const opening = toNumberOrNull(row.opening_kwh);
	const closing = toNumberOrNull(row.closing_kwh);
	const typed = toNumberOrNull(row.kwh);
	// Both bounds present → the computed figure travels (the server recomputes it
	// anyway and ignores a typed kWh); a bound missing → the typed kWh.
	const { kwh } = computeKwh(opening, closing, typed);
	return {
		meter_code: row.meter_code,
		opening_kwh: opening,
		closing_kwh: closing,
		kwh,
		dg_hours: toNumberOrNull(row.dg_hours),
		dg_litres: toNumberOrNull(row.dg_litres),
		max_demand_kva: toNumberOrNull(row.max_demand_kva),
		remarks: textOrNull(row.remarks),
	};
}

/**
 * Validated form values -> the POST /readings_save body. Rows with nothing keyed
 * (blank, or only the untouched opening prefill) are DROPPED; `spellId` null =
 * whole day.
 */
export function buildReadingsPayload(
	values: PowerReadingFormValues,
	coId: number,
	branchId: number,
	tranDate: string,
	spellId: number | null
): MechPowerReadingsSavePayload {
	return {
		co_id: coId,
		branch_id: branchId,
		tran_date: tranDate,
		spell_id: spellId,
		rows: values.rows.filter((row) => !isBlankRow(row)).map(buildReadingSaveRow),
	};
}

// =============================================================================
// Meter form (MeterDialog)
// =============================================================================

export const meterFormSchema = z.object({
	meter_code: z
		.string()
		.min(1, "Meter code is required")
		.max(MAX_METER_CODE, `Cannot exceed ${MAX_METER_CODE} characters`)
		.regex(/^[A-Z0-9_-]+$/i, "Letters, digits, - and _ only"),
	meter_name: z
		.string()
		.min(1, "Meter name is required")
		.max(MAX_METER_NAME, `Cannot exceed ${MAX_METER_NAME} characters`),
	meter_type: z.enum(METER_TYPES),
	active: z.enum(["1", "0"]),
});

export type MeterFormValues = z.infer<typeof meterFormSchema>;

/** Blank form, or a meter lifted back into form strings for editing. */
export function buildMeterFormValues(meter: MechPowerMeter | null): MeterFormValues {
	if (!meter) return { meter_code: "", meter_name: "", meter_type: "GRID", active: "1" };
	return {
		meter_code: meter.meter_code,
		meter_name: meter.meter_name,
		meter_type: meter.meter_type,
		active: meter.active === 0 ? "0" : "1",
	};
}

/** Validated meter form -> the create / edit body. The code is upper-cased here too. */
export function buildMeterPayload(
	values: MeterFormValues,
	coId: number,
	branchId: number
): MechPowerMeterPayload {
	return {
		co_id: coId,
		branch_id: branchId,
		meter_code: values.meter_code.trim().toUpperCase(),
		meter_name: values.meter_name.trim(),
		meter_type: values.meter_type,
		active: Number(values.active),
	};
}
