// Page-local view types and the form contract for Breakdown Entry.
//
// ENTITY types (MechBreakdown, MechBreakdownDetail, MechBreakdownCreate,
// MechBreakdownSetup, MechReason, MechOpenBreakdown, ...) are owned by
// `src/utils/juteMechanicalService.ts` and are imported, never re-declared.
// What lives here is only what the SCREEN needs on top of them: the Zod form
// contract, the option shapes the spares editor binds to, and the payload
// builders that turn validated form strings into the service's body type.
//
// Form fields are held as STRINGS (house style — MUI inputs bind to strings);
// they become numbers/nulls exactly once, in `buildBreakdownPayload`.

import { z } from "zod";
import type {
	MechBreakdownCreate,
	MechBreakdownDetail,
	MechBreakdownSpareInput,
	MechBreakdownClosePayload,
} from "@/utils/juteMechanicalService";
import {
	DEFAULT_DOWNTIME_TYPE,
	isFutureDateTime,
	minutesBetween,
	spareLineAmount,
	toApiDateTime,
	toDateTimeLocalInput,
	toNumberOrNull,
} from "../utils/breakdownCalc";

// =============================================================================
// Stable empty references (frozen so memo dependencies never churn)
// =============================================================================

export const EMPTY_SPARE_ITEMS: ReadonlyArray<SpareItemOption> = Object.freeze([]);
export const EMPTY_UOMS: ReadonlyArray<UomOption> = Object.freeze([]);

// =============================================================================
// Option shapes the spares editor binds to
// =============================================================================

/**
 * A stores item offered as a spare. Sourced from the shared item-search service
 * (the breakdown setup endpoint carries no item list), reduced to what the line
 * editor needs: the id, a display label, and the item's base UOM so a freshly
 * picked spare arrives with its unit already filled in.
 */
export interface SpareItemOption {
	item_id: number;
	label: string;
	uom_id: number | null;
	uom_name: string | null;
}

/** A unit of measure offered on a spare line. */
export interface UomOption {
	uom_id: number;
	uom_name: string;
}

// =============================================================================
// Grid / board view state
// =============================================================================

/**
 * Body for the quick close. Re-exported from the service so the hooks and the
 * page share one name; `co_id` is part of the service type, since every write is
 * company-scoped server-side.
 */
export type BreakdownCloseBody = MechBreakdownClosePayload;

/** Row lifted into the form for editing: the header plus its spare lines. */
export type EditingBreakdown = MechBreakdownDetail;

// =============================================================================
// Zod form contract
// =============================================================================

const MAX_TEXT = 255;
const MAX_LONG_TEXT = 1000;

/** One spare line as the form holds it (every value a string). */
export const spareLineSchema = z.object({
	item_id: z.string(),
	qty: z.string(),
	uom_id: z.string(),
	rate: z.string(),
	remarks: z.string().max(MAX_TEXT, `Remarks cannot exceed ${MAX_TEXT} characters`),
});

/**
 * The breakdown entry form.
 *
 * Only four things are structurally required — machine, stop datetime, reason
 * and downtime type. Everything else is optional by design: this screen is
 * keyed during a shift while a machine is down, so the fast path is
 * machine + stop time + reason, and the analysis fields get filled in later.
 *
 * Cross-field rules mirror the backend's 400s, so the operator is told before
 * the round trip rather than after it.
 */
export const breakdownFormSchema = z
	.object({
		machine_id: z.string().min(1, "Machine is required"),
		stop_datetime: z.string().min(1, "Stop date & time is required"),
		attended_datetime: z.string(),
		/** Blank is normal and MEANS "still down" — never validate it as missing. */
		restart_datetime: z.string(),
		spell_id: z.string(),
		reason_id: z.string().min(1, "Reason is required"),
		component_id: z.string(),
		discipline: z.string(),
		downtime_type: z.string().min(1, "Downtime type is required"),
		attended_dept_id: z.string(),
		attended_by: z.string().max(MAX_TEXT, `Cannot exceed ${MAX_TEXT} characters`),
		reported_by: z.string().max(MAX_TEXT, `Cannot exceed ${MAX_TEXT} characters`),
		root_cause: z.string().max(MAX_LONG_TEXT, `Cannot exceed ${MAX_LONG_TEXT} characters`),
		action_taken: z.string().max(MAX_LONG_TEXT, `Cannot exceed ${MAX_LONG_TEXT} characters`),
		preventive_action: z
			.string()
			.max(MAX_LONG_TEXT, `Cannot exceed ${MAX_LONG_TEXT} characters`),
		production_loss_qty: z.string(),
		remarks: z.string().max(MAX_TEXT, `Remarks cannot exceed ${MAX_TEXT} characters`),
		spares: z.array(spareLineSchema),
	})
	.superRefine((values, ctx) => {
		// Backend: "stop_datetime cannot be in the future".
		if (isFutureDateTime(values.stop_datetime)) {
			ctx.addIssue({
				code: "custom",
				path: ["stop_datetime"],
				message: "Stop time cannot be in the future",
			});
		}

		// Backend: "restart_datetime cannot be earlier than stop_datetime".
		const downtime = minutesBetween(values.stop_datetime, values.restart_datetime);
		if (downtime != null && downtime < 0) {
			ctx.addIssue({
				code: "custom",
				path: ["restart_datetime"],
				message: "Restart cannot be before the stop time",
			});
		}

		// Backend: attended_datetime must sit between stop and restart.
		const response = minutesBetween(values.stop_datetime, values.attended_datetime);
		if (response != null && response < 0) {
			ctx.addIssue({
				code: "custom",
				path: ["attended_datetime"],
				message: "Attended cannot be before the stop time",
			});
		}
		const attendedToRestart = minutesBetween(
			values.attended_datetime,
			values.restart_datetime
		);
		if (attendedToRestart != null && attendedToRestart < 0) {
			ctx.addIssue({
				code: "custom",
				path: ["attended_datetime"],
				message: "Attended cannot be after the restart time",
			});
		}

		// Production loss is a quantity, so it must be a non-negative number.
		if (values.production_loss_qty.trim() !== "") {
			const loss = toNumberOrNull(values.production_loss_qty);
			if (loss == null) {
				ctx.addIssue({
					code: "custom",
					path: ["production_loss_qty"],
					message: "Production loss must be a number",
				});
			} else if (loss < 0) {
				ctx.addIssue({
					code: "custom",
					path: ["production_loss_qty"],
					message: "Production loss cannot be negative",
				});
			}
		}

		// Spare lines: a line is either wholly blank (ignored on save) or has an
		// item AND a quantity greater than zero.
		values.spares.forEach((line, index) => {
			const hasItem = line.item_id.trim() !== "";
			const hasAnyValue =
				line.qty.trim() !== "" ||
				line.rate.trim() !== "" ||
				line.uom_id.trim() !== "" ||
				line.remarks.trim() !== "";

			if (!hasItem && hasAnyValue) {
				ctx.addIssue({
					code: "custom",
					path: ["spares", index, "item_id"],
					message: "Pick an item or clear this line",
				});
				return;
			}
			if (!hasItem) return;

			const qty = toNumberOrNull(line.qty);
			if (qty == null) {
				ctx.addIssue({
					code: "custom",
					path: ["spares", index, "qty"],
					message: "Quantity is required",
				});
			} else if (qty <= 0) {
				ctx.addIssue({
					code: "custom",
					path: ["spares", index, "qty"],
					message: "Quantity must be greater than 0",
				});
			}

			if (line.rate.trim() !== "") {
				const rate = toNumberOrNull(line.rate);
				if (rate == null) {
					ctx.addIssue({
						code: "custom",
						path: ["spares", index, "rate"],
						message: "Rate must be a number",
					});
				} else if (rate < 0) {
					ctx.addIssue({
						code: "custom",
						path: ["spares", index, "rate"],
						message: "Rate cannot be negative",
					});
				}
			}
		});
	});

/** The single source of truth for the form's TypeScript type. */
export type BreakdownFormValues = z.infer<typeof breakdownFormSchema>;

/** One spare line of the form, as its own type for the line editor's props. */
export type SpareLineValues = BreakdownFormValues["spares"][number];

/** A blank spare line — appended when the operator adds a row. */
export function createBlankSpareLine(): SpareLineValues {
	return { item_id: "", qty: "", uom_id: "", rate: "", remarks: "" };
}

/**
 * Blank form state. `stop_datetime` defaults to now because the overwhelmingly
 * common case is logging a stoppage as it happens; `restart_datetime` stays
 * blank because the machine is, by definition, still down at that moment.
 */
export function buildDefaultFormValues(nowLocal: string): BreakdownFormValues {
	return {
		machine_id: "",
		stop_datetime: nowLocal,
		attended_datetime: "",
		restart_datetime: "",
		spell_id: "",
		reason_id: "",
		component_id: "",
		discipline: "",
		downtime_type: DEFAULT_DOWNTIME_TYPE,
		attended_dept_id: "",
		attended_by: "",
		reported_by: "",
		root_cause: "",
		action_taken: "",
		preventive_action: "",
		production_loss_qty: "",
		remarks: "",
		spares: [createBlankSpareLine()],
	};
}

/**
 * A saved incident (header + spares) lifted back into form values.
 *
 * Datetimes are converted to the `datetime-local` shape; a null
 * `restart_datetime` becomes "", which the form renders as "still down" rather
 * than as a missing field. A trailing blank spare line is always appended so the
 * operator can add one more part without pressing "Add spare" first.
 */
export function buildFormValuesFromEntry(entry: MechBreakdownDetail): BreakdownFormValues {
	return {
		machine_id: String(entry.machine_id),
		stop_datetime: toDateTimeLocalInput(entry.stop_datetime),
		attended_datetime: toDateTimeLocalInput(entry.attended_datetime),
		restart_datetime: toDateTimeLocalInput(entry.restart_datetime),
		spell_id: entry.spell_id == null ? "" : String(entry.spell_id),
		reason_id: String(entry.reason_id),
		component_id: entry.component_id == null ? "" : String(entry.component_id),
		discipline: entry.discipline ?? "",
		downtime_type: entry.downtime_type || DEFAULT_DOWNTIME_TYPE,
		attended_dept_id: entry.attended_dept_id == null ? "" : String(entry.attended_dept_id),
		attended_by: entry.attended_by ?? "",
		reported_by: entry.reported_by ?? "",
		root_cause: entry.root_cause ?? "",
		action_taken: entry.action_taken ?? "",
		preventive_action: entry.preventive_action ?? "",
		production_loss_qty:
			entry.production_loss_qty == null ? "" : String(entry.production_loss_qty),
		remarks: entry.remarks ?? "",
		spares: [
			...(entry.spares ?? []).map((spare) => ({
				item_id: String(spare.item_id),
				qty: spare.qty == null ? "" : String(spare.qty),
				uom_id: spare.uom_id == null ? "" : String(spare.uom_id),
				rate: spare.rate == null ? "" : String(spare.rate),
				remarks: spare.remarks ?? "",
			})),
			createBlankSpareLine(),
		],
	};
}

/** Blank a string field into null the way the API body expects. */
function textOrNull(value: string): string | null {
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

/** Blank a numeric-id field into null. */
function idOrNull(value: string): number | null {
	return value.trim() === "" ? null : Number(value);
}

/**
 * Spare lines reduced to the API's line shape. Wholly blank lines (the trailing
 * row the editor always keeps) are dropped, and `amount` is sent pre-computed
 * as qty x rate — the same figure the backend would derive if it were omitted.
 */
export function buildSparePayload(
	lines: ReadonlyArray<SpareLineValues>
): MechBreakdownSpareInput[] {
	return lines
		.filter((line) => line.item_id.trim() !== "")
		.map((line) => ({
			item_id: Number(line.item_id),
			qty: toNumberOrNull(line.qty),
			uom_id: idOrNull(line.uom_id),
			rate: toNumberOrNull(line.rate),
			amount: spareLineAmount(line.qty, line.rate),
			remarks: textOrNull(line.remarks),
		}));
}

/**
 * Validated form values -> the create/edit body.
 *
 * Every optional field is sent EXPLICITLY, null included. That matters on edit:
 * the backend merges `BreakdownUpdate` by `model_fields_set`, so an omitted key
 * leaves the stored value untouched while an explicit null clears it. Sending
 * `restart_datetime: null` is therefore how a wrongly-closed incident is
 * reopened, and how "still down" survives an edit.
 */
export function buildBreakdownPayload(
	values: BreakdownFormValues,
	coId: number,
	branchId: number | null
): MechBreakdownCreate {
	return {
		co_id: coId,
		branch_id: branchId,
		machine_id: Number(values.machine_id),
		stop_datetime: toApiDateTime(values.stop_datetime) ?? values.stop_datetime,
		reason_id: Number(values.reason_id),
		spell_id: idOrNull(values.spell_id),
		attended_datetime: toApiDateTime(values.attended_datetime),
		restart_datetime: toApiDateTime(values.restart_datetime),
		component_id: idOrNull(values.component_id),
		discipline: textOrNull(values.discipline),
		downtime_type: values.downtime_type,
		attended_dept_id: idOrNull(values.attended_dept_id),
		attended_by: textOrNull(values.attended_by),
		reported_by: textOrNull(values.reported_by),
		root_cause: textOrNull(values.root_cause),
		action_taken: textOrNull(values.action_taken),
		preventive_action: textOrNull(values.preventive_action),
		production_loss_qty: toNumberOrNull(values.production_loss_qty),
		remarks: textOrNull(values.remarks),
		spares: buildSparePayload(values.spares),
	};
}
