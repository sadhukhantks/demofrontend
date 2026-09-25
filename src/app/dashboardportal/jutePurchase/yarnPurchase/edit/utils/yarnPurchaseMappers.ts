/**
 * @file yarnPurchaseMappers.ts
 * @description Factories and API ↔ UI converters for the Yarn Purchase edit page.
 */
import type { YarnPurchaseHeader, YarnPurchaseLine } from "@/utils/yarnPurchaseService";
import type {
	EditableYarnPurchaseLine,
	YarnPurchaseHeaderFormValues,
	YarnPurchaseSaveInput,
} from "../types/yarnPurchaseTypes";
import { lineHasAnyData, packagesWeight, round2, toNumber } from "./yarnPurchaseCalc";
import { todayYmd } from "../../utils/yarnPurchaseFormat";

let lineIdSeed = 0;
export const generateLineId = (): string => `yp-line-${++lineIdSeed}`;

export const getLineId = (line: EditableYarnPurchaseLine): string => line.id;

export const createBlankLine = (): EditableYarnPurchaseLine => ({
	id: generateLineId(),
	yarnPurchaseLiId: null,
	itemId: null,
	packageType: "",
	noOfPackages: "",
	wtPerPackage: "",
	weightKg: "",
	ratePerQtl: "",
	remarks: "",
	weightAutoFilled: true,
});

export const buildDefaultHeaderForm = (): YarnPurchaseHeaderFormValues => ({
	tranDate: todayYmd(),
	partyId: null,
	challanNo: "",
	challanDate: "",
	vehicleNo: "",
	remarks: "",
});

const numToStr = (value: number | null | undefined): string => (value == null ? "" : String(value));
const emptyToNull = (value: string): string | null => {
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
};

export const mapHeaderToForm = (header: YarnPurchaseHeader): YarnPurchaseHeaderFormValues => ({
	tranDate: (header.tran_date ?? "").slice(0, 10),
	partyId: header.party_id ?? null,
	challanNo: header.challan_no ?? "",
	challanDate: (header.challan_date ?? "").slice(0, 10),
	vehicleNo: header.vehicle_no ?? "",
	remarks: header.remarks ?? "",
});

/**
 * A stored weight that equals packages × wt/package is treated as auto-filled so
 * it keeps following those fields when the user edits them again.
 */
export const mapApiLineToEditable = (line: YarnPurchaseLine): EditableYarnPurchaseLine => {
	const derived = packagesWeight({ noOfPackages: line.no_of_packages, wtPerPackage: line.wt_per_package });
	const stored = toNumber(line.weight_kg);
	return {
		id: `yp-li-${line.yarn_purchase_li_id}`,
		yarnPurchaseLiId: line.yarn_purchase_li_id,
		itemId: line.item_id,
		packageType: line.package_type ?? "",
		noOfPackages: numToStr(line.no_of_packages),
		wtPerPackage: numToStr(line.wt_per_package),
		weightKg: numToStr(line.weight_kg),
		ratePerQtl: numToStr(line.rate_per_qtl),
		remarks: line.remarks ?? "",
		weightAutoFilled: stored == null || (derived != null && round2(stored) === derived),
	};
};

export const mapApiLinesToEditable = (lines: ReadonlyArray<YarnPurchaseLine>): EditableYarnPurchaseLine[] =>
	lines.map(mapApiLineToEditable);

/** Header form + lines → the (still unvalidated) save body. Blank trailing rows are dropped. */
export const buildSaveInput = (args: {
	coId: number;
	branchId: number;
	form: YarnPurchaseHeaderFormValues;
	lines: ReadonlyArray<EditableYarnPurchaseLine>;
}): YarnPurchaseSaveInput => ({
	co_id: args.coId,
	branch_id: args.branchId,
	tran_date: args.form.tranDate,
	party_id: args.form.partyId ?? null,
	challan_no: emptyToNull(args.form.challanNo),
	challan_date: emptyToNull(args.form.challanDate),
	vehicle_no: emptyToNull(args.form.vehicleNo),
	remarks: emptyToNull(args.form.remarks),
	lines: args.lines.filter(lineHasAnyData).map((line) => ({
		item_id: line.itemId,
		package_type: emptyToNull(line.packageType),
		no_of_packages: toNumber(line.noOfPackages),
		wt_per_package: toNumber(line.wtPerPackage),
		weight_kg: toNumber(line.weightKg),
		rate_per_qtl: toNumber(line.ratePerQtl),
		remarks: emptyToNull(line.remarks),
	})),
});
