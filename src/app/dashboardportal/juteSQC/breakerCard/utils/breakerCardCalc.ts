// Client-side preview for R-08-05/06/07 Breaker Card (Coarse-Side SWT). Mirrors
// the backend compute_breaker_card_stats (build plan §2). The server recomputes
// and persists every value on save and is AUTHORITATIVE; this only reproduces the
// math for live per-row display so the inspector sees the corrected sliver weight
// and CV% before saving the whole sheet.
//
// The quality linkage is a YARN GROUP, which has no single std, so the preview always
// uses DEFAULT_STD_MR_PCT (16, breaker default) and no CV band.

// Standard moisture regain % used for every yarn group row (a yarn group has no per-row std).
export const DEFAULT_STD_MR_PCT = 16;

// The operator weighs each 5-yd cut in GRAMS (raw grams are what get stored); the
// sheet reports sliver weight as LBS per 100 yds. Display-only conversion — the
// server keeps computing calc_* in the entered (gram) unit.
export const GMS_PER_LB = 453.6;
export const SAMPLE_LENGTH_YDS = 5;
export function gmsToLbs(gms: number): number {
	return (Number(gms) / GMS_PER_LB) * (100 / SAMPLE_LENGTH_YDS);
}

function round2(x: number): number {
	return Math.round(x * 100) / 100;
}

function round4(x: number): number {
	return Math.round(x * 10000) / 10000;
}

// corrected_i = obs_i * (100 + std_mr_pct) / (100 + mr_i)
export function correctedWeight(observed: number, mrPct: number, stdMrPct: number): number {
	const denom = 100 + Number(mrPct);
	if (!denom) return 0;
	return round2((Number(observed) * (100 + Number(stdMrPct))) / denom);
}

export function mean(nums: number[]): number {
	if (nums.length === 0) return 0;
	return nums.reduce((a, b) => a + Number(b), 0) / nums.length;
}

// POPULATION standard deviation (n divisor) — the mill sheet's STDEVP. Guard n<=1 → 0.0.
export function populationStdev(nums: number[]): number {
	const n = nums.length;
	if (n <= 1) return 0;
	const m = mean(nums);
	const variance = nums.reduce((acc, v) => acc + (Number(v) - m) * (Number(v) - m), 0) / n;
	return Math.sqrt(variance);
}

// CV ratio on the OBSERVED basis: pstdev(observed) / mean(observed). Guard mean > 0.
// Returned as a RATIO (render ×100 for a percentage). Unit-invariant (gms == lbs).
export function cvRatio(stdev: number, meanObs: number): number {
	if (!meanObs || meanObs <= 0) return 0;
	return stdev / meanObs;
}

// Band pass flag. The high edge is the upper tolerance: a row passes when its
// CV% (as a percentage, i.e. ratio×100) is at or under std_cv_high. When no high
// edge is seeded the band is not evaluated → null (cv_within_band unknown).
export function cvWithinBand(
	cvRatioValue: number,
	stdCvHigh: number | null | undefined,
): boolean | null {
	if (stdCvHigh == null) return null;
	return cvRatioValue * 100 <= Number(stdCvHigh);
}

// ─── Full per-row preview bundle ─────────────────────────────────────────────

export type BreakerCardPreview = {
	observed: number[]; // raw cut weights
	corrected: number[]; // per-cut corrected weight
	avgWt: number | null; // mean observed
	avgMrPct: number | null; // mean MR%
	corrWt: number | null; // avg-then-correct corrected sliver weight
	sdev: number | null; // POPULATION stdev of the raw observed cuts
	cvPct: number | null; // already ×100 (a percentage)
	withinBand: boolean | null; // pass / fail / null (no band)
	n: number; // # of valid (numeric, >0) weight readings used
};

// Compute the live advisory preview for a single row from string-state inputs.
// Empty/invalid readings are dropped pairwise (a weight without its MR%, or vice
// versa, is ignored). Returns null when no usable reading pair exists yet.
//
// A yarn group has no single std, so the preview always uses std 16 with NO CV band
// (withinBand is always null). Corr Wt follows the cached-value path:
// avg-then-correct (avgWt corrected by avgMr), which matches the sheet exactly.
// The CV% follows the owner's Excel (2026-08-19): POPULATION stdev of the RAW
// observed cuts over their mean — no MR correction in the CV path.
export function computeRowPreview(
	weightStrings: string[],
	mrStrings: string[],
): BreakerCardPreview | null {
	const stdMr = DEFAULT_STD_MR_PCT;

	const observed: number[] = [];
	const mr: number[] = [];
	const corrected: number[] = [];
	for (let i = 0; i < weightStrings.length; i++) {
		const w = Number(weightStrings[i]);
		const m = Number(mrStrings[i]);
		if (
			weightStrings[i] === "" ||
			!Number.isFinite(w) ||
			w <= 0 ||
			mrStrings[i] === "" ||
			!Number.isFinite(m)
		) {
			continue;
		}
		observed.push(w);
		mr.push(m);
		corrected.push(correctedWeight(w, m, stdMr));
	}

	if (observed.length === 0) return null;

	const avgWt = round2(mean(observed));
	const avgMr = round2(mean(mr));
	// avg-then-correct: corrected average weight from the row averages.
	const corrWt = correctedWeight(avgWt, avgMr, stdMr);
	const sdev = round4(populationStdev(observed));
	const cv = cvRatio(sdev, avgWt);

	return {
		observed,
		corrected,
		avgWt,
		avgMrPct: avgMr,
		corrWt,
		sdev,
		cvPct: round2(cv * 100),
		withinBand: null, // yarn group has no std → no CV band
		n: observed.length,
	};
}

export function todayISO(): string {
	const d = new Date();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${d.getFullYear()}-${m}-${day}`;
}
