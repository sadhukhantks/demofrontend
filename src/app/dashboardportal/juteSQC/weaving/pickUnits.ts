// R-08-21: the SQC crew measures picks per decimetre (picks/dm); the stored
// value and the downstream efficiency formula use picks per inch (PPI).
// 1 inch = 0.254 dm, so PPI = picks_dm × 0.254.
export const PICKS_DM_TO_PPI = 0.254;

export const dmToPpi = (picksDm: number): number => picksDm * PICKS_DM_TO_PPI;

// Legacy rows (saved before picks_dm existed) only carry PPI — derive dm client-side.
export const ppiToDm = (ppi: number): number => ppi / PICKS_DM_TO_PPI;

// ─── ITM-013: typed value vs the quality standard ───────────────────────────
// The standard is jute_prod_weaving_target_map (id_type qid, value_role
// standard, param picks), stored as PPI. Equality is tested in PPI at 2 dp on
// both sides — the server's picks_equal_to_std applies the same rule (stored
// picks = round(picks_dm × 0.254, 3), so 2 dp absorbs the third decimal).
export const STD_EQUALITY_DP = 2;

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** True when the typed picks/dm equals the standard PPI at 2 dp. False when
 * either side is missing / not a number, or when either is <= 0. */
export function equalsStandard(
	picksDm: number | null | undefined,
	stdPpi: number | null | undefined
): boolean {
	if (picksDm == null || stdPpi == null) return false;
	if (!Number.isFinite(picksDm) || !Number.isFinite(stdPpi)) return false;
	if (stdPpi <= 0 || picksDm <= 0) return false;
	return Math.abs(round2(dmToPpi(picksDm)) - round2(stdPpi)) < 1e-6;
}

/** Indices of the rows whose picks/dm equals their quality's standard. Rows
 * whose quality has no standard, or that carry no picks (width-only), are
 * never returned. */
export function findRowsEqualToStandard<
	T extends { weaving_quality_id: number; picks_dm: number | null },
>(rows: readonly T[], standards: Readonly<Record<number, { std_picks_ppi: number }>>): number[] {
	const out: number[] = [];
	rows.forEach((r, i) => {
		const std = standards[r.weaving_quality_id];
		if (std && equalsStandard(r.picks_dm, std.std_picks_ppi)) out.push(i);
	});
	return out;
}

/** Helper text under the Picks / dm input: the standard in picks/dm (what the
 * crew keys) with PPI in brackets — a HINT only, never a prefill. */
export function stdHint(
	std: { std_picks_ppi: number; std_picks_dm: number } | undefined,
	qualitySelected: boolean
): string {
	if (!qualitySelected) return "Select a quality to see its standard";
	if (!std) return "No standard for this quality";
	return `Std ${std.std_picks_dm.toFixed(2)} picks/dm (${std.std_picks_ppi.toFixed(2)} PPI)`;
}
