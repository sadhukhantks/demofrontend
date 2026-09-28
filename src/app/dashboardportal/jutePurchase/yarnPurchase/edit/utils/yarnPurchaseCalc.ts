/**
 * @file yarnPurchaseCalc.ts
 * @description Pure line arithmetic for Yarn Purchase: package-derived weight,
 * amount (kg × rate per kg) and footer totals. No React, fully unit-tested.
 */
import type { EditableLineField, EditableYarnPurchaseLine, LineTotals } from "../types/yarnPurchaseTypes";

export type NumericInput = string | number | null | undefined;

export type LineCalcInput = {
	noOfPackages: NumericInput;
	wtPerPackage: NumericInput;
	weightKg: NumericInput;
	ratePerKg: NumericInput;
	weightAutoFilled: boolean;
};

export type LineCalcResult = {
	/** Effective weight in kg (typed, or derived from packages), null when unknown. */
	weightKg: number | null;
	/** Whether `weightKg` is (still) derived from packages × wt/package. */
	weightAutoFilled: boolean;
	/** kg × rate per kg, 2 dp; null when weight or rate is missing. */
	amount: number | null;
};

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

/** packages × wt/package, whole kg, when both are positive numbers, else null. */
export const packagesWeight = (line: { noOfPackages: NumericInput; wtPerPackage: NumericInput }): number | null => {
	const packages = toNumber(line.noOfPackages);
	const wtPerPackage = toNumber(line.wtPerPackage);
	if (packages == null || wtPerPackage == null || packages <= 0 || wtPerPackage <= 0) return null;
	return round0(packages * wtPerPackage);
};

/** whole kg × rate per kg, 2 dp; null when either side is missing. */
export const computeAmount = (weightKg: NumericInput, ratePerKg: NumericInput): number | null => {
	const kg = toNumber(weightKg);
	const rate = toNumber(ratePerKg);
	if (kg == null || rate == null) return null;
	return round2(round0(kg) * rate);
};

/**
 * Resolve a line's effective weight and amount.
 *
 * - Weight empty, or previously auto-filled → derive from packages × wt/package.
 * - Weight typed by the user → keep it (it is the authoritative figure).
 */
export const computeLine = (input: LineCalcInput): LineCalcResult => {
	const typedWeight = toNumber(input.weightKg);
	const derived = packagesWeight(input);

	const useDerived = typedWeight == null || input.weightAutoFilled;
	const weightKg = useDerived ? derived : typedWeight;
	const weightAutoFilled = useDerived;

	return {
		weightKg,
		weightAutoFilled,
		amount: computeAmount(weightKg, input.ratePerKg),
	};
};

/** Amount for an editable line as rendered in the grid. */
export const lineAmount = (line: EditableYarnPurchaseLine): number | null => computeAmount(line.weightKg, line.ratePerKg);

/**
 * State transition for one text-box edit. Keeps the raw string the user typed in
 * the edited field and applies the auto-fill rule to `weightKg`:
 *
 * - editing `weightKg`: non-blank → authoritative (auto off); blank → auto on and
 *   re-derived from packages immediately.
 * - editing packages / wt-per-package while auto is on → weight follows.
 * - everything else leaves the weight alone.
 */
export const applyLineChange = (
	line: EditableYarnPurchaseLine,
	field: EditableLineField,
	value: string,
): EditableYarnPurchaseLine => {
	const next: EditableYarnPurchaseLine = { ...line, [field]: value };

	if (field === "weightKg") {
		const blank = value.trim() === "";
		next.weightAutoFilled = blank;
		if (blank) {
			const derived = packagesWeight(next);
			next.weightKg = derived != null ? String(derived) : "";
		}
		return next;
	}

	if ((field === "noOfPackages" || field === "wtPerPackage") && next.weightAutoFilled) {
		const derived = packagesWeight(next);
		next.weightKg = derived != null ? String(derived) : "";
	}

	return next;
};

/** A line counts as "real" once any business field is filled (the trailing blank row is not). */
export const lineHasAnyData = (line: EditableYarnPurchaseLine): boolean =>
	line.itemId != null ||
	line.packageType.trim() !== "" ||
	line.noOfPackages.trim() !== "" ||
	line.wtPerPackage.trim() !== "" ||
	line.weightKg.trim() !== "" ||
	line.ratePerKg.trim() !== "" ||
	line.remarks.trim() !== "";

/** Footer totals over the lines that hold data. */
export const sumLines = (lines: ReadonlyArray<EditableYarnPurchaseLine>): LineTotals => {
	let packages = 0;
	let weightKg = 0;
	let amount = 0;
	for (const line of lines) {
		if (!lineHasAnyData(line)) continue;
		packages += toNumber(line.noOfPackages) ?? 0;
		weightKg += toNumber(line.weightKg) ?? 0;
		amount += lineAmount(line) ?? 0;
	}
	return { packages: round2(packages), weightKg: round0(weightKg), amount: round2(amount) };
};
