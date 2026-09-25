/**
 * @file yarnIssueTypes.ts
 * @description All page-local types for the Yarn Issue edit page in ONE file
 * (prevents circular imports between hooks, utils and components). API types live
 * in `@/utils/yarnIssueService`.
 */
import type { YarnIssueType } from "@/utils/yarnIssueService";

export type YarnIssueMode = "create" | "edit" | "view";

/**
 * A yarn issue line while it is being edited. Numeric fields stay STRINGS so the
 * text boxes can hold partial input ("12.") — they are parsed once on save.
 *
 * The lot (`yarnPurchaseLiId`) is the primary choice; the item follows from it.
 * `purchaseNo` / `lotTranDate` / `itemName` / `lotBalKg` are a snapshot from the
 * GET response so a saved line still renders when the lot picker no longer lists
 * that lot (e.g. it has been fully consumed since).
 */
export type EditableYarnIssueLine = {
	id: string;
	yarnIssueLiId: number | null;
	yarnPurchaseLiId: number | null;
	itemId: number | null;
	itemName: string | null;
	purchaseNo: string | null;
	lotTranDate: string | null;
	lotBalKg: number | null;
	noOfPackages: string;
	/** Authoritative weight; always in kilograms. */
	weightKg: string;
	remarks: string;
};

/** String-valued line fields edited through text boxes. */
export type EditableLineField = "noOfPackages" | "weightKg" | "remarks";

export type YarnIssueHeaderFormValues = {
	tranDate: string;
	issueType: YarnIssueType | null;
	deptId: number | null;
	remarks: string;
};

export type LineTotals = {
	packages: number;
	weightKg: number;
};

/**
 * Per-line balance picture computed on the client: the lot's balance (godown for
 * ISSUE, floor for RETURN) minus the other lines of this document on the same lot.
 * `null` when the lot's balance is not known (lot not in the loaded options).
 */
export type LineBalance = {
	lotBalance: number | null;
	usedByOtherLines: number;
	available: number | null;
	/** Positive when this line pushes the lot over its balance. */
	overBy: number;
};

/** Unvalidated save body built from the form; `yarnIssueSchema` turns it into the payload. */
export type YarnIssueSaveInput = {
	co_id: number;
	branch_id: number;
	tran_date: string;
	issue_type: YarnIssueType | null;
	dept_id: number | null;
	remarks: string | null;
	lines: Array<{
		item_id: number | null;
		yarn_purchase_li_id: number | null;
		no_of_packages: number | null;
		weight_kg: number | null;
		remarks: string | null;
	}>;
};
