/**
 * Hands Norms form: Zod schema, form <-> payload mapping and display helpers
 * (TKT-000202, v2 kinds + machine groups 2026-09-30). The backend
 * (hands_norms.normalise_norm) stays the source of truth; these rules only
 * mirror its 400s so the user sees them in the dialog.
 */

import { z } from "zod";
import {
	isNormKind,
	type DirectIndirect,
	type HandsNormPayload,
	type HandsNormRow,
	type NormKind,
	type NormType,
	type ProdUom,
} from "./_service";

/** Column limits: shift_* DECIMAL(7,2), units_per_hand DECIMAL(9,3), qty_per_hand DECIMAL(12,3). */
export const SHIFT_MAX = 99999.99;
export const UNITS_PER_HAND_MAX = 999999.999;
export const QTY_PER_HAND_MAX = 999999999.999;
export const NORMS_TEXT_MAX = 80;

export const SHIFT_KEYS = ["shift_a", "shift_b", "shift_c", "shift_g"] as const;
export type ShiftKey = (typeof SHIFT_KEYS)[number];
export const SHIFT_LABELS: Record<ShiftKey, string> = {
	shift_a: "Shift A",
	shift_b: "Shift B",
	shift_c: "Shift C",
	shift_g: "General",
};

export const NORM_KIND_LABELS: Record<NormKind, string> = {
	F: "Fixed",
	M: "Machine",
	P: "Production",
	N: "No norm",
	A: "As actual",
};

export const NORM_KIND_OPTIONS: ReadonlyArray<{ value: NormKind; label: string }> = Object.freeze([
	{ value: "F", label: "Fixed — hands per shift" },
	{ value: "M", label: "Machine — units of machines that ran ÷ units per hand" },
	{ value: "P", label: "Production — qty produced ÷ qty per hand" },
	{ value: "N", label: "No norm — target blank" },
	{ value: "A", label: "As actual — target = hands present" },
]);

export const DIRECT_INDIRECT_OPTIONS: ReadonlyArray<{ value: DirectIndirect; label: string }> = Object.freeze([
	{ value: "D", label: "Direct" },
	{ value: "I", label: "Indirect" },
]);

export const PROD_UOM_OPTIONS: ReadonlyArray<{ value: ProdUom; label: string }> = Object.freeze([
	{ value: "kg", label: "kg" },
	{ value: "cuts", label: "cuts" },
]);

/** How an M/P norm is scoped: exactly one of these carries the id. */
export type NormScope = "group" | "type" | "dept";

export const SCOPE_OPTIONS: ReadonlyArray<{ value: NormScope; label: string }> = Object.freeze([
	{ value: "group", label: "Machine group" },
	{ value: "type", label: "Machine type" },
	{ value: "dept", label: "Department" },
]);

export const SCOPE_FIELD: Record<NormScope, "machine_group_id" | "machine_type_id" | "scope_dept_id"> = {
	group: "machine_group_id",
	type: "machine_type_id",
	dept: "scope_dept_id",
};

/** Kinds whose target comes from a scope (group / type / department). */
export const SCOPED_KINDS: ReadonlyArray<NormKind> = Object.freeze(["M", "P"]);

/** Legacy mirror the API also derives: V for M/P, F for F/N/A. */
export function legacyType(kind: NormKind): NormType {
	return kind === "M" || kind === "P" ? "V" : "F";
}

/** Dialog state. Number inputs are kept as the typed strings. */
export interface HandsNormForm {
	designation_id: number | "";
	effective_date: string;
	norm_kind: NormKind;
	direct_indirect: DirectIndirect | "";
	shift_a: string;
	shift_b: string;
	shift_c: string;
	shift_g: string;
	/** Which of the three scope ids applies (M/P only). */
	scope: NormScope;
	machine_group_id: number | "";
	machine_type_id: number | "";
	scope_dept_id: number | "";
	units_per_hand: string;
	qty_per_hand: string;
	qty_uom: ProdUom | "";
	norms_text: string;
	active: number;
}

const isBlank = (v: string) => v.trim() === "";
const idField = () => z.union([z.number().int().positive(), z.literal("")]);

function shiftField(label: string) {
	return z
		.string()
		.refine((v) => isBlank(v) || (Number.isFinite(Number(v)) && Number(v) >= 0), {
			message: `${label}: enter 0 or more`,
		})
		.refine((v) => isBlank(v) || Number(v) <= SHIFT_MAX, {
			message: `${label} cannot exceed ${SHIFT_MAX}`,
		});
}

const SCOPE_MESSAGES: Record<NormScope, string> = {
	group: "Pick the machine group",
	type: "Pick the machine type",
	dept: "Pick the department",
};

function checkRate(
	ctx: z.RefinementCtx,
	field: "units_per_hand" | "qty_per_hand",
	text: string,
	label: string,
	max: number,
	required: boolean
) {
	const n = Number(text);
	if (!isBlank(text) && (!Number.isFinite(n) || n <= 0)) {
		ctx.addIssue({ code: "custom", path: [field], message: `${label} must be a positive number` });
		return;
	}
	if (!isBlank(text) && n > max) {
		ctx.addIssue({ code: "custom", path: [field], message: `${label} cannot exceed ${max}` });
		return;
	}
	if (required && isBlank(text)) {
		ctx.addIssue({ code: "custom", path: [field], message: `${label} is needed (greater than 0)` });
	}
}

export const handsNormFormSchema = z
	.object({
		designation_id: idField().refine((v) => v !== "", { message: "Pick a designation" }),
		effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an effective date"),
		norm_kind: z.enum(["F", "M", "P", "N", "A"]),
		direct_indirect: z.union([z.enum(["D", "I"]), z.literal("")]),
		shift_a: shiftField(SHIFT_LABELS.shift_a),
		shift_b: shiftField(SHIFT_LABELS.shift_b),
		shift_c: shiftField(SHIFT_LABELS.shift_c),
		shift_g: shiftField(SHIFT_LABELS.shift_g),
		scope: z.enum(["group", "type", "dept"]),
		machine_group_id: idField(),
		machine_type_id: idField(),
		scope_dept_id: idField(),
		units_per_hand: z.string(),
		qty_per_hand: z.string(),
		qty_uom: z.union([z.enum(["kg", "cuts"]), z.literal("")]),
		norms_text: z.string().max(NORMS_TEXT_MAX, `Norms text: ${NORMS_TEXT_MAX} characters at most`),
		active: z.number().int().min(0).max(1),
	})
	.superRefine((f, ctx) => {
		// Mirrors the backend: an ACTIVE machine / production norm without a scope
		// or a rate has no computable target, so it is refused. Retired rows may
		// stay incomplete. F / N / A need nothing beyond the header fields.
		if (f.norm_kind !== "M" && f.norm_kind !== "P") return;
		const active = f.active === 1;
		if (active && f[SCOPE_FIELD[f.scope]] === "") {
			ctx.addIssue({ code: "custom", path: [SCOPE_FIELD[f.scope]], message: SCOPE_MESSAGES[f.scope] });
		}
		if (f.norm_kind === "M") {
			checkRate(ctx, "units_per_hand", f.units_per_hand, "Units per hand", UNITS_PER_HAND_MAX, active);
		} else {
			checkRate(ctx, "qty_per_hand", f.qty_per_hand, "Qty per hand", QTY_PER_HAND_MAX, active);
			if (active && f.qty_uom === "") {
				ctx.addIssue({ code: "custom", path: ["qty_uom"], message: "Pick the unit (kg or cuts)" });
			}
		}
	});

/** First error message per field, for helperText. */
export function validateHandsNormForm(form: HandsNormForm): Partial<Record<keyof HandsNormForm, string>> {
	const parsed = handsNormFormSchema.safeParse(form);
	if (parsed.success) return {};
	const errors: Partial<Record<keyof HandsNormForm, string>> = {};
	for (const issue of parsed.error.issues) {
		const key = issue.path[0] as keyof HandsNormForm | undefined;
		if (key && !errors[key]) errors[key] = issue.message;
	}
	return errors;
}

const numOrZero = (v: string) => (isBlank(v) ? 0 : Number(v));
const numOrNull = (v: string) => (isBlank(v) ? null : Number(v));

/**
 * "Hands per unit" is the inverse view of units per hand (1 hand per 2 looms
 * <-> 0.5 hands per loom). Stored as units per hand, rounded to the column's
 * 3 decimals; blank / non-positive input clears it.
 */
export function handsPerUnitToUnits(handsPerUnit: string): string {
	const n = Number(handsPerUnit);
	if (isBlank(handsPerUnit) || !Number.isFinite(n) || n <= 0) return "";
	return String(Number((1 / n).toFixed(3)));
}

/** The inverse reading for the dialog's helper box, 4 decimals, "" when unknown. */
export function unitsToHandsPerUnit(unitsPerHand: string): string {
	const n = Number(unitsPerHand);
	if (isBlank(unitsPerHand) || !Number.isFinite(n) || n <= 0) return "";
	return String(Number((1 / n).toFixed(4)));
}

/**
 * Body for create / edit. Only the kind's own fields are sent; everything
 * else goes as null / 0 (the backend clears them anyway). For M / P exactly
 * one scope id — the one the radio points at — is sent.
 */
export function toPayload(form: HandsNormForm): HandsNormPayload {
	const kind = form.norm_kind;
	const scoped = kind === "M" || kind === "P";
	const fixed = kind === "F";
	const scopeId = (s: NormScope) => (scoped && form.scope === s && form[SCOPE_FIELD[s]] !== "" ? Number(form[SCOPE_FIELD[s]]) : null);
	return {
		effective_date: form.effective_date,
		norm_kind: kind,
		variable_fixed: legacyType(kind),
		direct_indirect: form.direct_indirect === "" ? null : form.direct_indirect,
		shift_a: fixed ? numOrZero(form.shift_a) : 0,
		shift_b: fixed ? numOrZero(form.shift_b) : 0,
		shift_c: fixed ? numOrZero(form.shift_c) : 0,
		shift_g: fixed ? numOrZero(form.shift_g) : 0,
		machine_group_id: scopeId("group"),
		machine_type_id: scopeId("type"),
		scope_dept_id: scopeId("dept"),
		units_per_hand: kind === "M" ? numOrNull(form.units_per_hand) : null,
		qty_per_hand: kind === "P" ? numOrNull(form.qty_per_hand) : null,
		qty_uom: kind === "P" && form.qty_uom !== "" ? form.qty_uom : null,
		norms_text: isBlank(form.norms_text) ? null : form.norms_text.trim(),
	};
}

export function emptyForm(effectiveDate: string): HandsNormForm {
	return {
		designation_id: "",
		effective_date: effectiveDate,
		norm_kind: "F",
		direct_indirect: "",
		shift_a: "",
		shift_b: "",
		shift_c: "",
		shift_g: "",
		scope: "group",
		machine_group_id: "",
		machine_type_id: "",
		scope_dept_id: "",
		units_per_hand: "",
		qty_per_hand: "",
		qty_uom: "",
		norms_text: "",
		active: 1,
	};
}

const numText = (v: number | null | undefined) => (v == null ? "" : String(v));

/**
 * A legacy per-machine norm: flagged Fixed but carrying a hands-per-machine rate,
 * no machine type and no shift counts (sls's seed left 47 such rows, e.g.
 * "2 MC = 1 HAND" -> 0.5). It is really a machine norm missing its scope.
 */
export function isUnlinkedRateRow(row: HandsNormRow): boolean {
	return (
		row.variable_fixed !== "V" &&
		row.machine_type_id == null &&
		row.machine_group_id == null &&
		row.hands_per_machine != null &&
		SHIFT_KEYS.every((k) => !row[k])
	);
}

/**
 * The row's kind. `norm_kind` when the backend sends one (v2); otherwise the
 * legacy reading — a V flag, a machine link or a per-machine rate is M, the
 * rest is F — the same rule the report's `_kind()` applies.
 */
export function rowKind(row: HandsNormRow): NormKind {
	if (isNormKind(row.norm_kind)) return row.norm_kind;
	if (row.variable_fixed === "V" || row.machine_type_id != null || row.machine_group_id != null) return "M";
	return isUnlinkedRateRow(row) ? "M" : "F";
}

/** The scope a saved row carries, else the kind's usual choice (M: group, P: department). */
export function rowScope(row: HandsNormRow, kind: NormKind): NormScope {
	if (row.machine_group_id != null) return "group";
	if (row.machine_type_id != null) return "type";
	if (row.scope_dept_id != null) return "dept";
	return kind === "P" ? "dept" : "group";
}

/**
 * Dialog state from a saved row. As a revision (``revisionDate`` given) it is a
 * NEW row for the same designation starting on that date, active. Legacy V and
 * F-with-rate rows open as M with units per hand derived from the rate when
 * the v2 column is empty; incomplete M / P rows from the migration open with
 * the kind preset and no scope, so only the missing fields are left to fill.
 */
export function formFromRow(row: HandsNormRow, revisionDate?: string): HandsNormForm {
	const di = (row.direct_indirect ?? "").trim().toUpperCase().charAt(0);
	const kind = rowKind(row);
	const units =
		row.units_per_hand != null && row.units_per_hand > 0
			? String(row.units_per_hand)
			: row.hands_per_machine != null && row.hands_per_machine > 0
				? String(Number((1 / row.hands_per_machine).toFixed(3)))
				: "";
	const uom = row.qty_uom === "kg" || row.qty_uom === "cuts" ? row.qty_uom : "";
	return {
		designation_id: row.designation_id,
		effective_date: revisionDate ?? row.effective_date,
		norm_kind: kind,
		direct_indirect: di === "D" || di === "I" ? di : "",
		shift_a: numText(row.shift_a),
		shift_b: numText(row.shift_b),
		shift_c: numText(row.shift_c),
		shift_g: numText(row.shift_g),
		scope: rowScope(row, kind),
		machine_group_id: row.machine_group_id ?? "",
		machine_type_id: row.machine_type_id ?? "",
		scope_dept_id: row.scope_dept_id ?? "",
		units_per_hand: kind === "M" ? units : "",
		qty_per_hand: kind === "P" ? numText(row.qty_per_hand) : "",
		qty_uom: kind === "P" ? uom : "",
		norms_text: row.norms_text ?? "",
		active: revisionDate ? 1 : row.active ? 1 : 0,
	};
}

const trim = (n: number, dp: number) => String(Number(n.toFixed(dp)));

/** "machine" -> "machines" for n != 1; a label already ending in s is left alone. */
export function pluralUnits(n: number, label: string | null | undefined): string {
	const base = (label ?? "").trim() || "machine";
	return n === 1 || base.endsWith("s") ? base : `${base}s`;
}

/**
 * Plain-words reading of hands per machine, e.g. 0.5 -> "1 hand per 2 machines",
 * 3 -> "3 hands per machine". Empty for a missing / non-positive value.
 */
export function describeHandsPerMachine(hpm: number | null | undefined): string {
	if (hpm == null || !Number.isFinite(hpm) || hpm <= 0) return "";
	if (hpm < 1) return `1 hand per ${trim(1 / hpm, 1)} machines`;
	if (hpm === 1) return "1 hand per machine";
	return `${trim(hpm, 4)} hands per machine`;
}

/** The name of the row's scope: group, machine type or department, else "". */
export function scopeName(row: HandsNormRow): string {
	if (row.machine_group_id != null) return row.machine_group ?? `group ${row.machine_group_id}`;
	if (row.machine_type_id != null) return row.machine_type_name ?? `type ${row.machine_type_id}`;
	if (row.scope_dept_id != null) return row.scope_dept ?? `dept ${row.scope_dept_id}`;
	return "";
}

/** The rate for the grid's "Per hand" column: "2 machines", "4 points", "315 kg". */
export function describePerHand(row: HandsNormRow): string {
	const kind = rowKind(row);
	if (kind === "M") {
		if (row.units_per_hand != null && row.units_per_hand > 0) {
			const label = row.machine_group_id != null ? row.unit_label : "machine";
			return `${trim(row.units_per_hand, 3)} ${pluralUnits(row.units_per_hand, label)}`;
		}
		return describeHandsPerMachine(row.hands_per_machine);
	}
	if (kind === "P" && row.qty_per_hand != null && row.qty_per_hand > 0) {
		return `${trim(row.qty_per_hand, 3)} ${row.qty_uom ?? ""}`.trim();
	}
	return "";
}

/**
 * The target as the grid shows it, per kind: "A 2 · B 2 · C 1",
 * "Σ units of Hessian looms ÷ 2 per hand", "kg of Winding ÷ 315 kg per hand",
 * "No norm — blank", "As actual". An M / P row the report cannot compute says why.
 */
export function describeTarget(row: HandsNormRow): string {
	const kind = rowKind(row);
	if (kind === "N") return "No norm — blank";
	if (kind === "A") return "As actual";
	if (kind === "M") {
		const scope = scopeName(row);
		const hasUnits = row.units_per_hand != null && row.units_per_hand > 0;
		const hasRate = hasUnits || (row.hands_per_machine != null && row.hands_per_machine > 0);
		if (!scope || !hasRate || !row.computable) {
			const rate = hasUnits
				? `${trim(row.units_per_hand ?? 0, 3)} per hand`
				: row.hands_per_machine != null
					? `${trim(row.hands_per_machine, 4)} per machine`
					: "no rate";
			return !scope ? `${rate}, no machine group / type / department — target blank` : `${rate}, incomplete — target blank`;
		}
		return hasUnits
			? `Σ units of ${scope} ÷ ${trim(row.units_per_hand ?? 0, 3)} per hand`
			: `${trim(row.hands_per_machine ?? 0, 4)} x ${scope} run`;
	}
	if (kind === "P") {
		const scope = scopeName(row);
		const hasQty = row.qty_per_hand != null && row.qty_per_hand > 0;
		const uom = row.qty_uom ?? "qty";
		if (!scope || !hasQty || !row.computable) {
			const rate = hasQty ? `${trim(row.qty_per_hand ?? 0, 3)} ${uom} per hand` : "no qty per hand";
			return !scope ? `${rate}, no machine group / type / department — target blank` : `${rate}, incomplete — target blank`;
		}
		return `${uom} of ${scope} ÷ ${trim(row.qty_per_hand ?? 0, 3)} ${uom} per hand`;
	}
	const parts = SHIFT_KEYS.filter((k) => (row[k] ?? 0) !== 0).map(
		(k) => `${k === "shift_g" ? "G" : k.slice(-1).toUpperCase()} ${trim(row[k] ?? 0, 2)}`
	);
	return parts.length ? parts.join(" · ") : "0 (no hands)";
}
