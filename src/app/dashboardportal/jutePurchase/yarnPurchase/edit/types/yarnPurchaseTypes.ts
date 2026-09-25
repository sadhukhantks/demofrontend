/**
 * @file yarnPurchaseTypes.ts
 * @description All page-local types for the Yarn Purchase edit page in ONE file
 * (prevents circular imports between hooks, utils and components). API types live
 * in `@/utils/yarnPurchaseService`.
 */

export type YarnPurchaseMode = "create" | "edit" | "view";

/**
 * A yarn line while it is being edited. Numeric fields stay STRINGS so the text
 * boxes can hold partial input ("12.") — they are parsed once on save.
 */
export type EditableYarnPurchaseLine = {
	id: string;
	yarnPurchaseLiId: number | null;
	itemId: number | null;
	packageType: string;
	noOfPackages: string;
	wtPerPackage: string;
	/** Authoritative weight; always editable. */
	weightKg: string;
	ratePerQtl: string;
	remarks: string;
	/**
	 * True while `weightKg` is derived from packages × wt/package (or is empty), so
	 * it keeps following those two fields. Typing a weight by hand turns it off;
	 * clearing the weight turns it back on.
	 */
	weightAutoFilled: boolean;
};

/** String-valued line fields that route through `applyLineChange`. */
export type EditableLineField = "packageType" | "noOfPackages" | "wtPerPackage" | "weightKg" | "ratePerQtl" | "remarks";

export type YarnPurchaseHeaderFormValues = {
	tranDate: string;
	partyId: number | null;
	challanNo: string;
	challanDate: string;
	vehicleNo: string;
	remarks: string;
};

export type PackageTypeOption = { value: string; label: string };

export type LineTotals = {
	packages: number;
	weightKg: number;
	amount: number;
};

/** Unvalidated save body built from the form; `yarnPurchaseSchema` turns it into the payload. */
export type YarnPurchaseSaveInput = {
	co_id: number;
	branch_id: number;
	tran_date: string;
	party_id: number | null;
	challan_no: string | null;
	challan_date: string | null;
	vehicle_no: string | null;
	remarks: string | null;
	lines: Array<{
		item_id: number | null;
		package_type: string | null;
		no_of_packages: number | null;
		wt_per_package: number | null;
		weight_kg: number | null;
		rate_per_qtl: number | null;
		remarks: string | null;
	}>;
};
