/**
 * @file yarnIssueMappers.ts
 * @description Factories and API ↔ UI converters for the Yarn Issue edit page.
 */
import type { YarnIssueHeader, YarnIssueLine, YarnIssueLot } from "@/utils/yarnIssueService";
import type { EditableYarnIssueLine, YarnIssueHeaderFormValues, YarnIssueSaveInput } from "../types/yarnIssueTypes";
import { lineHasAnyData, toNumber } from "./yarnIssueCalc";
import { todayYmd } from "../../utils/yarnIssueFormat";

let lineIdSeed = 0;
export const generateLineId = (): string => `yi-line-${++lineIdSeed}`;

export const getLineId = (line: EditableYarnIssueLine): string => line.id;

export const createBlankLine = (): EditableYarnIssueLine => ({
	id: generateLineId(),
	yarnIssueLiId: null,
	yarnPurchaseLiId: null,
	itemId: null,
	itemName: null,
	purchaseNo: null,
	lotTranDate: null,
	lotBalKg: null,
	noOfPackages: "",
	weightKg: "",
	remarks: "",
});

export const buildDefaultHeaderForm = (): YarnIssueHeaderFormValues => ({
	tranDate: todayYmd(),
	issueType: "ISSUE",
	deptId: null,
	remarks: "",
});

const numToStr = (value: number | null | undefined): string => (value == null ? "" : String(value));
const emptyToNull = (value: string): string | null => {
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
};

export const mapHeaderToForm = (header: YarnIssueHeader): YarnIssueHeaderFormValues => ({
	tranDate: (header.tran_date ?? "").slice(0, 10),
	issueType: header.issue_type ?? null,
	deptId: header.dept_id ?? null,
	remarks: header.remarks ?? "",
});

export const mapApiLineToEditable = (line: YarnIssueLine): EditableYarnIssueLine => ({
	id: `yi-li-${line.yarn_issue_li_id}`,
	yarnIssueLiId: line.yarn_issue_li_id,
	yarnPurchaseLiId: line.yarn_purchase_li_id,
	itemId: line.item_id,
	itemName: line.item_name ?? null,
	purchaseNo: line.purchase_no ?? null,
	lotTranDate: line.lot_tran_date ?? null,
	lotBalKg: toNumber(line.lot_bal_kg),
	noOfPackages: numToStr(line.no_of_packages),
	weightKg: numToStr(line.weight_kg),
	remarks: line.remarks ?? "",
});

export const mapApiLinesToEditable = (lines: ReadonlyArray<YarnIssueLine>): EditableYarnIssueLine[] =>
	lines.map(mapApiLineToEditable);

/** Picking a lot sets the lot AND the item it belongs to (plus the display snapshot). */
export const applyLotToLine = (line: EditableYarnIssueLine, lot: YarnIssueLot | null): EditableYarnIssueLine =>
	lot
		? {
				...line,
				yarnPurchaseLiId: lot.yarn_purchase_li_id,
				itemId: lot.item_id,
				itemName: lot.item_name,
				purchaseNo: lot.purchase_no,
				lotTranDate: lot.tran_date,
				lotBalKg: toNumber(lot.bal_kg),
			}
		: { ...line, yarnPurchaseLiId: null, itemId: null, itemName: null, purchaseNo: null, lotTranDate: null, lotBalKg: null };

/**
 * A stand-in lot option for a saved line whose lot the picker no longer lists,
 * built from the GET snapshot so the row still shows what it referenced.
 */
export const lotOptionFromLine = (line: EditableYarnIssueLine): YarnIssueLot | null =>
	line.yarnPurchaseLiId == null
		? null
		: {
				yarn_purchase_li_id: line.yarnPurchaseLiId,
				yarn_purchase_id: 0,
				purchase_no: line.purchaseNo,
				tran_date: line.lotTranDate ?? "",
				supp_name: null,
				item_id: line.itemId ?? 0,
				item_name: line.itemName ?? "",
				item_code: null,
				package_type: null,
				received_kg: 0,
				bal_kg: line.lotBalKg ?? 0,
				bal_pkgs: null,
				floor_bal_kg: null,
				floor_bal_pkgs: null,
			};

/** Header form + lines → the (still unvalidated) save body. Blank trailing rows are dropped. */
export const buildSaveInput = (args: {
	coId: number;
	branchId: number;
	form: YarnIssueHeaderFormValues;
	lines: ReadonlyArray<EditableYarnIssueLine>;
}): YarnIssueSaveInput => ({
	co_id: args.coId,
	branch_id: args.branchId,
	tran_date: args.form.tranDate,
	issue_type: args.form.issueType,
	dept_id: args.form.deptId ?? null,
	remarks: emptyToNull(args.form.remarks),
	lines: args.lines.filter(lineHasAnyData).map((line) => ({
		item_id: line.itemId,
		yarn_purchase_li_id: line.yarnPurchaseLiId,
		no_of_packages: toNumber(line.noOfPackages),
		weight_kg: toNumber(line.weightKg),
		remarks: emptyToNull(line.remarks),
	})),
});
