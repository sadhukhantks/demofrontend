/**
 * Cost Parameter form: Zod schema, form <-> payload mapping and display
 * helpers (ITM-019). The backend (params.py) stays the source of truth —
 * these rules mirror its 400s so the user sees them in the dialog, and the
 * product-scoped codes are read off /cost_param_setup
 * (param_codes[].product_scoped), never kept as a copy here.
 */

import { z } from "zod";
import type {
	CostParamCodeOption,
	CostParamPayload,
	CostParamRow,
	CostParamUpdatePayload,
} from "./_service";

/** Column limits: param_value DECIMAL(16,4), uom VARCHAR(20), source VARCHAR(120), remarks VARCHAR(255). */
export const VALUE_MAX = 999999999999.9999;
export const UOM_MAX = 20;
export const SOURCE_MAX = 120;
export const REMARKS_MAX = 255;

export const NO_SCOPED_CODES: ReadonlySet<string> = new Set();

/** The codes whose value differs per product (SACKING / HESSIAN / YARN), from the setup list. */
export function productScopedCodes(codes: ReadonlyArray<CostParamCodeOption>): ReadonlySet<string> {
	return new Set(codes.filter((c) => c.product_scoped).map((c) => c.code));
}

export function isProductScoped(code: string, scoped: ReadonlySet<string>): boolean {
	return scoped.has(code);
}

const baseSchema = z.object({
	param_code: z.string().min(1, { error: "Pick a parameter" }),
	product: z.string().nullable(),
	effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Pick an effective date" }),
	// NaN (nothing typed) fails the number check and gets the "Enter a value" text.
	param_value: z
		.number({ error: "Enter a value" })
		.min(0, { error: "Value cannot be negative" })
		.max(VALUE_MAX, { error: `Value cannot exceed ${VALUE_MAX}` }),
	uom: z.string().max(UOM_MAX, { error: `UoM: ${UOM_MAX} characters at most` }).nullable(),
	source: z.string().max(SOURCE_MAX, { error: `Source: ${SOURCE_MAX} characters at most` }).nullable(),
	remarks: z.string().max(REMARKS_MAX, { error: `Remarks: ${REMARKS_MAX} characters at most` }).nullable(),
	/** true = this branch only; false = every branch of the company. */
	scope_branch: z.boolean(),
	active: z.boolean(),
});

export type CostParamFormValues = z.infer<typeof baseSchema>;

/**
 * The form schema for one setup: a product is required exactly for the codes
 * the backend flags product_scoped, so a code added there shows the Product
 * field and gets the rule without a frontend change.
 */
export function makeCostParamFormSchema(scoped: ReadonlySet<string>) {
	return baseSchema.refine((v) => !scoped.has(v.param_code) || !!v.product, {
		error: "Pick a product for this parameter",
		path: ["product"],
	});
}

const blankToNull = (v: string | null | undefined): string | null => {
	const t = (v ?? "").trim();
	return t === "" ? null : t;
};

/**
 * POST body. The product goes only with a product-scoped code (anything typed
 * for another code is dropped); the branch only when the scope switch is on.
 * The value is passed through as the number the form holds — no second
 * conversion.
 */
export function toPayload(
	values: CostParamFormValues,
	coId: number,
	branchId: number,
	scoped: ReadonlySet<string>
): CostParamPayload {
	return {
		co_id: coId,
		branch_id: values.scope_branch ? branchId : null,
		effective_date: values.effective_date,
		param_code: values.param_code,
		param_value: values.param_value,
		uom: blankToNull(values.uom),
		product: scoped.has(values.param_code) ? blankToNull(values.product) : null,
		source: blankToNull(values.source),
		remarks: blankToNull(values.remarks),
	};
}

/** True when the edit form's date differs from the row being edited: the backend then files a NEW row. */
export function isDateMoved(effectiveDate: string, editing: Pick<CostParamRow, "effective_date"> | null): boolean {
	return editing != null && effectiveDate !== editing.effective_date;
}

/** ISO dates compare as strings; a future-dated row is not "in force" today. */
export function isFutureDated(effectiveDate: string, today: string): boolean {
	return effectiveDate > today;
}

/**
 * PUT body. Code, product and scope cannot change on an edit (the backend
 * refuses them — "create a new parameter instead"), so only the editable
 * fields go. A changed effective_date makes the backend file a new ACTIVE
 * row and refuses `active: 0` with it, so `active` is sent only when the
 * date stays (the dialog disables Status in that case too).
 */
export function toUpdatePayload(
	values: CostParamFormValues,
	editing: Pick<CostParamRow, "effective_date">
): CostParamUpdatePayload {
	const payload: CostParamUpdatePayload = {
		effective_date: values.effective_date,
		param_value: values.param_value,
		uom: blankToNull(values.uom),
		source: blankToNull(values.source),
		remarks: blankToNull(values.remarks),
	};
	if (!isDateMoved(values.effective_date, editing)) payload.active = values.active ? 1 : 0;
	return payload;
}

export function emptyForm(effectiveDate: string): CostParamFormValues {
	return {
		param_code: "",
		product: null,
		effective_date: effectiveDate,
		param_value: Number.NaN,
		uom: null,
		source: null,
		remarks: null,
		scope_branch: true,
		active: true,
	};
}

export function fromRow(row: CostParamRow): CostParamFormValues {
	return {
		param_code: row.param_code,
		product: row.product,
		effective_date: row.effective_date,
		param_value: row.param_value,
		uom: row.uom,
		source: row.source,
		remarks: row.remarks,
		scope_branch: row.branch_id != null,
		active: row.active === 1,
	};
}

/** The default unit of a code from the setup list, "" when unknown. */
export function uomOf(code: string, codes: ReadonlyArray<CostParamCodeOption>): string {
	return codes.find((c) => c.code === code)?.uom ?? "";
}

/**
 * Display value: en-IN grouping, up to 4 decimals for small factors
 * (1.12 kg/kg, 0.0125) and 2 for money-sized values (1,82,000.00).
 */
export function fmtParamValue(v: number | null | undefined): string {
	if (v == null || !Number.isFinite(v)) return "—";
	const dp = Math.abs(v) < 100 ? 4 : 2;
	return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: dp });
}
