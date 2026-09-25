/**
 * @file yarnPurchaseSchema.ts
 * @description Zod schema for the Yarn Purchase save body — the single source of
 * truth for what a valid purchase looks like (CLAUDE.md: Zod on every form).
 *
 * Rules: tran_date required, at least one line, weight_kg > 0, item_id required;
 * no_of_packages / wt_per_package / rate_per_qtl optional but never negative.
 */
import { z } from "zod";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const optionalNonNegative = z.number({ error: "Must be a number" }).nonnegative("Cannot be negative").nullable().optional();

/** `YYYY-MM-DD`, or empty/null for "not given". */
const optionalYmd = z
	.union([z.string().regex(YMD, "Use the YYYY-MM-DD format"), z.literal(""), z.null()])
	.optional()
	.transform((value) => (value ? value : null));

export const yarnPurchaseLineSchema = z.object({
	item_id: z.number({ error: "Yarn item is required" }).int().positive("Yarn item is required"),
	package_type: z.string().max(50, "Package type is too long").nullable().optional(),
	no_of_packages: optionalNonNegative,
	wt_per_package: optionalNonNegative,
	weight_kg: z.number({ error: "Weight (kg) is required" }).positive("Weight (kg) must be greater than 0"),
	rate_per_qtl: optionalNonNegative,
	remarks: z.string().max(500, "Remarks are too long").nullable().optional(),
});

export const yarnPurchaseSchema = z.object({
	co_id: z.number({ error: "Company is required" }).int().positive("Company is required"),
	branch_id: z.number({ error: "Branch is required" }).int().positive("Branch is required"),
	tran_date: z.string({ error: "Date is required" }).min(1, "Date is required").regex(YMD, "Use the YYYY-MM-DD format"),
	party_id: z.number().int().positive("Supplier is invalid").nullable().optional(),
	challan_no: z.string().max(50, "Challan no is too long").nullable().optional(),
	challan_date: optionalYmd,
	vehicle_no: z.string().max(50, "Vehicle no is too long").nullable().optional(),
	remarks: z.string().max(1000, "Remarks are too long").nullable().optional(),
	lines: z.array(yarnPurchaseLineSchema).min(1, "Add at least one yarn line"),
});

export type YarnPurchaseFormValues = z.infer<typeof yarnPurchaseSchema>;
export type YarnPurchaseLineValues = z.infer<typeof yarnPurchaseLineSchema>;

const HEADER_FIELD_LABELS: Record<string, string> = {
	co_id: "Company",
	branch_id: "Branch",
	tran_date: "Date",
	party_id: "Supplier",
	challan_no: "Challan No",
	challan_date: "Challan Date",
	vehicle_no: "Vehicle No",
	remarks: "Remarks",
	lines: "Lines",
};

const LINE_FIELD_LABELS: Record<string, string> = {
	item_id: "Yarn Item",
	package_type: "Package Type",
	no_of_packages: "No. of Packages",
	wt_per_package: "Wt / Package",
	weight_kg: "Weight (kg)",
	rate_per_qtl: "Rate / Qtl",
	remarks: "Remarks",
};

/** Human-readable issue list, e.g. `Line 2 (Weight (kg)): Weight (kg) must be greater than 0`. */
export const formatIssues = (error: z.ZodError): string[] =>
	error.issues.map((issue) => {
		const [head, index, field] = issue.path;
		if (head === "lines" && typeof index === "number") {
			const fieldLabel = field != null ? LINE_FIELD_LABELS[String(field)] ?? String(field) : null;
			return `Line ${index + 1}${fieldLabel ? ` (${fieldLabel})` : ""}: ${issue.message}`;
		}
		const label = head != null ? HEADER_FIELD_LABELS[String(head)] ?? String(head) : "Form";
		return `${label}: ${issue.message}`;
	});

/** First message per header field (path length 1), keyed by field name — for inline errors. */
export const collectFieldErrors = (error: z.ZodError): Record<string, string> => {
	const result: Record<string, string> = {};
	for (const issue of error.issues) {
		if (issue.path.length !== 1) continue;
		const key = String(issue.path[0]);
		if (!(key in result)) result[key] = issue.message;
	}
	return result;
};
