/**
 * @file yarnIssueSchema.ts
 * @description Zod schema for the Yarn Issue save body — the single source of
 * truth for what a valid issue / return looks like (CLAUDE.md: Zod on every form).
 *
 * Rules: tran_date, issue_type and dept_id required; at least one line; on every
 * line the purchase lot and item are required and weight_kg > 0; no_of_packages
 * optional but never negative.
 *
 * Balance rule (owner ruling): an ISSUE may not draw more from a lot than its
 * godown balance, counting every line of the document on that lot — a hard Zod
 * error. A RETURN above the floor balance is only a soft note (the backend
 * warns), so the schema does not block it. Pass the loaded lot balances via
 * `buildYarnIssueSchema` to enable the check; lots without a known balance are
 * left to the backend.
 */
import { z } from "zod";
import { findLotOverdraws } from "./yarnIssueCalc";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const optionalNonNegative = z.number({ error: "Must be a number" }).nonnegative("Cannot be negative").nullable().optional();

export const yarnIssueLineSchema = z.object({
	item_id: z.number({ error: "Yarn item is required (pick a lot)" }).int().positive("Yarn item is required (pick a lot)"),
	yarn_purchase_li_id: z.number({ error: "Purchase lot is required" }).int().positive("Purchase lot is required"),
	no_of_packages: optionalNonNegative,
	weight_kg: z.number({ error: "Weight (kg) is required" }).positive("Weight (kg) must be greater than 0"),
	remarks: z.string().max(255, "Remarks are too long (255 characters at most)").nullable().optional(),
});

const baseSchema = z.object({
	co_id: z.number({ error: "Company is required" }).int().positive("Company is required"),
	branch_id: z.number({ error: "Branch is required" }).int().positive("Branch is required"),
	tran_date: z.string({ error: "Date is required" }).min(1, "Date is required").regex(YMD, "Use the YYYY-MM-DD format"),
	issue_type: z.enum(["ISSUE", "RETURN"], { error: "Type is required" }),
	dept_id: z.number({ error: "Department is required" }).int().positive("Department is required"),
	remarks: z.string().max(255, "Remarks are too long (255 characters at most)").nullable().optional(),
	lines: z.array(yarnIssueLineSchema).min(1, "Add at least one yarn line"),
});

export type YarnIssueFormValues = z.infer<typeof baseSchema>;
export type YarnIssueLineValues = z.infer<typeof yarnIssueLineSchema>;

export type BuildYarnIssueSchemaOptions = {
	/** `yarn_purchase_li_id` → balance the lines draw on (godown for ISSUE, floor for RETURN). */
	lotBalances?: ReadonlyMap<number, number>;
	/** Optional `yarn_purchase_li_id` → label for readable messages (e.g. `PUR-24/25-0012`). */
	lotLabels?: ReadonlyMap<number, string>;
};

const formatKg = (value: number): string => value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Schema with the ISSUE over-balance check bound to the given lot balances.
 * With no balances it is the plain structural schema.
 */
export const buildYarnIssueSchema = ({ lotBalances, lotLabels }: BuildYarnIssueSchemaOptions = {}) =>
	baseSchema.superRefine((value, ctx) => {
		if (value.issue_type !== "ISSUE" || !lotBalances || lotBalances.size === 0) return;
		const overdraws = findLotOverdraws(value.lines, lotBalances);
		if (overdraws.size === 0) return;
		value.lines.forEach((line, index) => {
			const overdraw = overdraws.get(line.yarn_purchase_li_id);
			if (!overdraw) return;
			const lotLabel = lotLabels?.get(line.yarn_purchase_li_id) ?? `lot #${line.yarn_purchase_li_id}`;
			ctx.addIssue({
				code: "custom",
				path: ["lines", index, "weight_kg"],
				message: `Exceeds the godown balance of ${lotLabel}: ${formatKg(overdraw.requested)} kg on this document against ${formatKg(overdraw.balance)} kg available (over by ${formatKg(overdraw.overBy)} kg)`,
			});
		});
	});

/** Structural schema only (no balance check) — what the tests and simple callers use. */
export const yarnIssueSchema = buildYarnIssueSchema();

const HEADER_FIELD_LABELS: Record<string, string> = {
	co_id: "Company",
	branch_id: "Branch",
	tran_date: "Date",
	issue_type: "Type",
	dept_id: "Department",
	remarks: "Remarks",
	lines: "Lines",
};

const LINE_FIELD_LABELS: Record<string, string> = {
	item_id: "Yarn Item",
	yarn_purchase_li_id: "Purchase Lot",
	no_of_packages: "No. of Packages",
	weight_kg: "Weight (kg)",
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

/** Line-level issues keyed by `lines[i].field` — for red boxes in the grid. */
export const collectLineErrors = (error: z.ZodError): ReadonlyMap<number, Record<string, string>> => {
	const result = new Map<number, Record<string, string>>();
	for (const issue of error.issues) {
		const [head, index, field] = issue.path;
		if (head !== "lines" || typeof index !== "number" || field == null) continue;
		const existing = result.get(index) ?? {};
		const key = String(field);
		if (!(key in existing)) existing[key] = issue.message;
		result.set(index, existing);
	}
	return result;
};
