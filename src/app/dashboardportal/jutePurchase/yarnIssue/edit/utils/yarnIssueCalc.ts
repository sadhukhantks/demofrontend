/**
 * @file yarnIssueCalc.ts
 * @description Pure lot-balance arithmetic for Yarn Issue / Return: how much of a
 * purchase lot is still available to a line once the other lines of the same
 * document on that lot are counted, plus footer totals. No React, fully unit-tested.
 *
 * Balance source per type: ISSUE draws on the lot's godown balance (`bal_kg`),
 * RETURN on the department's floor balance for that lot (`floor_bal_kg`).
 */
import type { YarnIssueLot, YarnIssueType } from "@/utils/yarnIssueService";
import type { EditableYarnIssueLine, LineBalance, LineTotals } from "../types/yarnIssueTypes";

export type NumericInput = string | number | null | undefined;

/** Parse a text-box value; blank / non-numeric → null. */
export const toNumber = (value: NumericInput): number | null => {
	if (value == null) return null;
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	const trimmed = value.trim();
	if (trimmed === "") return null;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : null;
};

export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
/** Weight is kept in whole kilograms (owner ruling 2026-09-26). */
export const round0 = (value: number): number => Math.round(value + Number.EPSILON);

/** The balance a line of the given type draws on: godown for ISSUE, floor for RETURN. */
export const lotBalanceForType = (
	lot: Pick<YarnIssueLot, "bal_kg"> & Partial<Pick<YarnIssueLot, "floor_bal_kg">>,
	issueType: YarnIssueType | null,
): number | null => (issueType === "RETURN" ? toNumber(lot.floor_bal_kg) : toNumber(lot.bal_kg));

/** `yarn_purchase_li_id` → balance (per the type) for the loaded lot options. */
export const buildLotBalanceMap = (
	lots: ReadonlyArray<YarnIssueLot>,
	issueType: YarnIssueType | null,
): ReadonlyMap<number, number> => {
	const map = new Map<number, number>();
	for (const lot of lots) {
		const balance = lotBalanceForType(lot, issueType);
		if (balance != null) map.set(lot.yarn_purchase_li_id, balance);
	}
	return map;
};

/**
 * Balance to check a line against. The loaded lot options win; for ISSUE a saved
 * line's stored godown balance is the fallback when the picker no longer lists
 * the lot. RETURN has no fallback (the floor figure depends on the department).
 */
export const resolveLotBalance = (
	line: Pick<EditableYarnIssueLine, "yarnPurchaseLiId" | "lotBalKg">,
	lotBalances: ReadonlyMap<number, number>,
	issueType: YarnIssueType | null,
): number | null => {
	if (line.yarnPurchaseLiId == null) return null;
	const fromOptions = lotBalances.get(line.yarnPurchaseLiId);
	if (fromOptions != null) return fromOptions;
	return issueType === "ISSUE" ? toNumber(line.lotBalKg) : null;
};

/** Kg already claimed on `lotId` by the OTHER lines of this document (self excluded). */
export const usedOnLotByOtherLines = (
	lines: ReadonlyArray<Pick<EditableYarnIssueLine, "id" | "yarnPurchaseLiId" | "weightKg">>,
	lotId: number,
	excludeLineId: string,
): number => {
	let used = 0;
	for (const other of lines) {
		if (other.id === excludeLineId || other.yarnPurchaseLiId !== lotId) continue;
		used += toNumber(other.weightKg) ?? 0;
	}
	return round2(used);
};

/** Balance picture for one line given the lot balance (null when unknown). */
export const computeLineBalance = (
	line: Pick<EditableYarnIssueLine, "id" | "yarnPurchaseLiId" | "weightKg">,
	lines: ReadonlyArray<Pick<EditableYarnIssueLine, "id" | "yarnPurchaseLiId" | "weightKg">>,
	lotBalance: number | null,
): LineBalance => {
	if (line.yarnPurchaseLiId == null) {
		return { lotBalance: null, usedByOtherLines: 0, available: null, overBy: 0 };
	}
	const usedByOtherLines = usedOnLotByOtherLines(lines, line.yarnPurchaseLiId, line.id);
	if (lotBalance == null) {
		return { lotBalance: null, usedByOtherLines, available: null, overBy: 0 };
	}
	const available = round2(lotBalance - usedByOtherLines);
	const requested = toNumber(line.weightKg) ?? 0;
	const overBy = requested > available ? round2(requested - available) : 0;
	return { lotBalance, usedByOtherLines, available, overBy };
};

/** `line.id` → balance picture, for the grid and the Zod check. */
export const computeLineBalances = (
	lines: ReadonlyArray<EditableYarnIssueLine>,
	lotBalances: ReadonlyMap<number, number>,
	issueType: YarnIssueType | null,
): ReadonlyMap<string, LineBalance> => {
	const result = new Map<string, LineBalance>();
	for (const line of lines) {
		result.set(line.id, computeLineBalance(line, lines, resolveLotBalance(line, lotBalances, issueType)));
	}
	return result;
};

export type LotOverdraw = { lotId: number; balance: number; requested: number; overBy: number };

/**
 * Lots whose total requested kg across the payload lines exceeds the known
 * balance. Lots with no known balance are skipped (the backend is authoritative).
 */
export const findLotOverdraws = (
	lines: ReadonlyArray<{ yarn_purchase_li_id: number | null | undefined; weight_kg: number | null | undefined }>,
	lotBalances: ReadonlyMap<number, number>,
): ReadonlyMap<number, LotOverdraw> => {
	const requestedByLot = new Map<number, number>();
	for (const line of lines) {
		if (line.yarn_purchase_li_id == null) continue;
		requestedByLot.set(line.yarn_purchase_li_id, (requestedByLot.get(line.yarn_purchase_li_id) ?? 0) + (line.weight_kg ?? 0));
	}
	const result = new Map<number, LotOverdraw>();
	for (const [lotId, requestedRaw] of requestedByLot) {
		const balance = lotBalances.get(lotId);
		if (balance == null) continue;
		const requested = round2(requestedRaw);
		if (requested > balance) {
			result.set(lotId, { lotId, balance, requested, overBy: round2(requested - balance) });
		}
	}
	return result;
};

/** A line counts as "real" once any business field is filled (the trailing blank row is not). */
export const lineHasAnyData = (line: EditableYarnIssueLine): boolean =>
	line.yarnPurchaseLiId != null ||
	line.itemId != null ||
	line.noOfPackages.trim() !== "" ||
	line.weightKg.trim() !== "" ||
	line.remarks.trim() !== "";

/** Footer totals over the lines that hold data. */
export const sumLines = (lines: ReadonlyArray<EditableYarnIssueLine>): LineTotals => {
	let packages = 0;
	let weightKg = 0;
	for (const line of lines) {
		if (!lineHasAnyData(line)) continue;
		packages += toNumber(line.noOfPackages) ?? 0;
		weightKg += toNumber(line.weightKg) ?? 0;
	}
	return { packages: round2(packages), weightKg: round0(weightKg) };
};
