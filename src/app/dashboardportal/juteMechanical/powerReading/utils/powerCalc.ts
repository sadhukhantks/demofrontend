// Pure client-side helpers for the Power Readings page (ITM-004).
//
// The backend is the authority on every rule (compute_kwh / spike_warning /
// dg_warning / validate_tran_date in src/juteMechanical/utility.py). These
// mirror those rules so the electrician sees the kWh and the warnings while
// typing, before the round trip — nothing computed here is persisted as-is;
// the server recomputes kWh from the bounds it receives.
//
//   kwh  = closing − opening when both bounds are keyed (closing < opening rejected)
//        = the typed kWh only when a bound is missing (meter reset)
//   spike warning: kwh > 3 × the meter's 30-day median   (warn, never reject)
//   DG warning:    litres without hours / DG figures on a non-DG meter

/** kWh above this multiple of the 30-day median is flagged (server: POWER_SPIKE_FACTOR). */
export const SPIKE_FACTOR = 3;

/** Inline message for a closing reading below the opening (server: 400 on save). */
export const CLOSING_BELOW_OPENING_MSG = "Closing cannot be lower than opening";

/** Inline message for a negative typed kWh. */
export const KWH_NEGATIVE_MSG = "kWh cannot be negative";

/** Numeric read of a form string; null when blank or not a finite number. */
export function toNumberOrNull(value: string | number | null | undefined): number | null {
	if (value == null) return null;
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	const trimmed = value.trim();
	if (trimmed === "") return null;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : null;
}

/** Two-decimal rounding without a floating-point tail (meter readings are 2 dp). */
export function round2(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Where the kWh figure came from. */
export type KwhSource = "computed" | "typed" | "none";

export interface KwhResult {
	kwh: number | null;
	source: KwhSource;
	/** Inline message when the inputs cannot yield a kWh; null when fine or empty. */
	error: string | null;
}

/**
 * The kWh the server will store for these inputs.
 *
 * Both bounds keyed → closing − opening (a typed kWh is ignored, exactly as the
 * server ignores it); a bound missing → the typed kWh; nothing → none. Mirrors
 * `compute_kwh` in utility.py.
 */
export function computeKwh(
	opening: number | null,
	closing: number | null,
	typed: number | null
): KwhResult {
	if (opening != null && closing != null) {
		if (closing < opening) {
			return { kwh: null, source: "computed", error: CLOSING_BELOW_OPENING_MSG };
		}
		return { kwh: round2(closing - opening), source: "computed", error: null };
	}
	if (typed != null) {
		if (typed < 0) return { kwh: null, source: "typed", error: KWH_NEGATIVE_MSG };
		return { kwh: typed, source: "typed", error: null };
	}
	return { kwh: null, source: "none", error: null };
}

/**
 * True when `iso` (YYYY-MM-DD) lies after `todayIso`. Lexicographic compare is
 * exact for ISO dates. `todayIso` is the server's IST date (GET /readings
 * `today`) — the server clock is UTC, so the client never derives it itself.
 */
export function isFutureDate(
	iso: string | null | undefined,
	todayIso: string | null | undefined
): boolean {
	if (!iso || !todayIso) return false;
	return iso > todayIso;
}

/** "18,420" — Indian grouping, fixed decimals, em dash for blank. */
export function fmtKwh(value: number | null | undefined, decimals = 0): string {
	if (value == null || Number.isNaN(value)) return "—";
	return value.toLocaleString("en-IN", {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	});
}

/**
 * The spike hint for a meter, worded like the server's warning: shown when the
 * kWh is more than 3× the meter's 30-day median. Null without history.
 */
export function spikeWarning(
	meterCode: string,
	kwh: number | null | undefined,
	median30: number | null | undefined
): string | null {
	if (kwh == null || median30 == null || median30 <= 0) return null;
	if (kwh > SPIKE_FACTOR * median30) {
		return `${meterCode}: ${fmtKwh(kwh)} kWh is more than ${SPIKE_FACTOR}x the 30-day median ${fmtKwh(
			median30
		)} kWh — check the reading`;
	}
	return null;
}

/**
 * DG consistency hint (server `dg_warning`): litres without hours, or DG
 * figures on a meter that is not a DG set. A warning only — the save goes through.
 */
export function dgWarning(
	meterType: string | null | undefined,
	dgHours: number | null | undefined,
	dgLitres: number | null | undefined
): string | null {
	const hours = dgHours ?? 0;
	const litres = dgLitres ?? 0;
	if (litres > 0 && hours <= 0) return "DG litres keyed without DG hours";
	if (meterType !== "DG" && (hours > 0 || litres > 0)) return "DG hours keyed on a non-DG meter";
	return null;
}

/** "17/10/2026" from "2026-10-17"; anything shorter is echoed. */
export function ddmmyyyy(iso: string | null | undefined): string {
	if (!iso || iso.length < 10) return iso ?? "";
	return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** "17/10" from "2026-10-17". */
export function ddmm(iso: string | null | undefined): string {
	if (!iso || iso.length < 10) return iso ?? "";
	return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
