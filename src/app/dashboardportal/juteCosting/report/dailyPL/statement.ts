/**
 * Pure helpers behind the P&L statement (ITM-027): the "vs benchmark" words,
 * the quantity story of a sub-line, the conversion-cost tile and the net
 * line as shown with the capital switch. No React, no DOM — unit-tested.
 */

import type { KpiState } from "../../../juteProduction/report/dailyProductionReport/_components/DprPieces";
import type {
	DailyPlCapital,
	DailyPlStatement,
	FgProduct,
	NotKeyed,
	StatementAmount,
	StatementHead,
	StatementLine,
} from "./_service";
import { fmtLakh, fmtMoney, fmtT } from "./dayColumns";

export interface Verdict {
	/** "" when there is no benchmark or no actual. */
	text: string;
	tone: KpiState;
}

/**
 * Words + tone of a cost head's ₹/t against its benchmark — lower is better
 * for every cost head. The words always carry the direction; the tone only
 * echoes them (never colour alone).
 *
 * An ESTIMATED head is priced at the benchmark itself (overheads at the
 * ₹2,000/t rule of thumb until a parameter is keyed), so "at rule of thumb"
 * would be a tautology dressed as good news: it prints "estimate = benchmark",
 * untoned. An estimated head that does differ from the benchmark (part keyed,
 * part estimated) still gets the normal verdict.
 */
export function vsBenchmark(
	perT: number | null,
	benchmark: number | null,
	benchmarkLabel: string | null,
	estimated = false,
): Verdict {
	if (perT == null || benchmark == null) return { text: "", tone: undefined };
	const what = benchmarkLabel === "keyed" ? "keyed benchmark" : "rule of thumb";
	const diff = perT - benchmark;
	if (Math.abs(diff) < 0.5) {
		return estimated ? { text: "estimate = benchmark", tone: undefined } : { text: `at ${what}`, tone: "good" };
	}
	if (diff < 0) return { text: `₹${fmtMoney(-diff)} below ${what}`, tone: "good" };
	return { text: `₹${fmtMoney(diff)} above ${what}`, tone: "warn" };
}

/** The quantity story of a sub-line, from whichever fields its head carries. */
export function lineDetail(line: StatementLine): string {
	const rate = line.rate;
	if (line.tonnes != null) {
		return rate != null ? `${fmtT(line.tonnes)} t × ₹${fmtMoney(rate)}/t` : `${fmtT(line.tonnes)} t`;
	}
	if (line.kwh != null) {
		return rate != null ? `${fmtMoney(line.kwh)} kWh × ₹${fmtMoney(rate, 2)}/kWh` : `${fmtMoney(line.kwh)} kWh`;
	}
	if (line.qty != null) {
		return rate != null ? `${fmtMoney(line.qty, 1)} hand-days × ₹${fmtMoney(rate)}` : `${fmtMoney(line.qty, 1)} hand-days`;
	}
	if (line.value_per_day != null) {
		const days = line.days != null ? ` × ${line.days} day${line.days === 1 ? "" : "s"}` : "";
		return `₹${fmtMoney(line.value_per_day)}/day${days}`;
	}
	if (line.rate_per_t != null) return `₹${fmtMoney(line.rate_per_t)}/t × cloth (rule of thumb)`;
	if (line.base_value != null) return `on ${fmtLakh(line.base_value)}`;
	if (line.qty_t != null) return `${fmtT(line.qty_t)} t`;
	return "";
}

export interface ConversionCost {
	/** stores + power + wages + overheads per t over the heads that are available; null when none is. */
	perT: number | null;
	wagesPerT: number | null;
	/** The statement's stores + power + overheads benchmark (₹10,000 by the rule of thumb) + wages per t. */
	benchmarkPerT: number | null;
	/** Heads left out because they are not available (power not keyed, …). */
	missing: string[];
}

const CONVERSION_HEADS = ["stores", "power", "wages", "overheads"] as const;
/** Short names for the tile caption (the statement labels are long). */
const CONVERSION_SHORT: Record<(typeof CONVERSION_HEADS)[number], string> = {
	stores: "stores",
	power: "electricity",
	wages: "wages",
	overheads: "overheads",
};

/** The conversion cost per tonne for the KPI tile, computed from the statement. */
export function conversionCostPerT(statement: DailyPlStatement | null): ConversionCost {
	if (!statement) return { perT: null, wagesPerT: null, benchmarkPerT: null, missing: [] };
	let sum: number | null = null;
	const missing: string[] = [];
	let wagesPerT: number | null = null;
	for (const key of CONVERSION_HEADS) {
		const head = statement.heads.find((h) => h.key === key);
		const v = head?.per_t ?? null;
		if (v == null) {
			missing.push(CONVERSION_SHORT[key]);
			continue;
		}
		sum = (sum ?? 0) + v;
		if (key === "wages") wagesPerT = v;
	}
	const bench = statement.conversion_cost.benchmark_per_t;
	const benchmarkPerT = bench == null ? null : bench + (wagesPerT ?? 0);
	return { perT: sum, wagesPerT, benchmarkPerT, missing };
}

/**
 * The conversion-cost row of the statement table. The backend's
 * `conversion_cost.period / per_t` INCLUDE wages (stores + electricity + wages
 * + overheads) while its `benchmark_per_t` (₹10,000 by the rule of thumb) is
 * stores + electricity + overheads only — so the row compares against the
 * benchmark PLUS the wages head's ₹/t, the same figure the KPI tile uses
 * (`conversionCostPerT().benchmarkPerT`). Tile and row therefore agree.
 */
export interface ConversionRow {
	perT: number | null;
	/** conversion_cost.benchmark_per_t + the wages head's ₹/t. */
	benchmarkPerT: number | null;
	/** "₹22,109 · rule of thumb ₹10,000 + wages" — "—" when there is no benchmark. */
	benchmarkText: string;
	verdict: Verdict;
}

export function conversionRow(statement: DailyPlStatement): ConversionRow {
	const conv = statement.conversion_cost;
	const { benchmarkPerT, wagesPerT } = conversionCostPerT(statement);
	const label = conv.benchmark_label ?? null;
	let benchmarkText = "—";
	if (benchmarkPerT != null && conv.benchmark_per_t != null) {
		const source = label === "keyed" ? "keyed" : "rule of thumb";
		const base = `${source} ₹${fmtMoney(conv.benchmark_per_t)}`;
		benchmarkText = `₹${fmtMoney(benchmarkPerT)} · ${wagesPerT == null ? `${base} (wages not available)` : `${base} + wages`}`;
	}
	return { perT: conv.per_t, benchmarkPerT, benchmarkText, verdict: vsBenchmark(conv.per_t, benchmarkPerT, label) };
}

/** Net as shown: operating profit while capital is excluded (the default), else the backend's net. */
export function netShown(statement: DailyPlStatement, includeCapital: boolean): StatementAmount {
	return includeCapital ? statement.net : statement.operating_profit;
}

/** Jute per kg cloth outside this band is flagged by the jute-issue check (LOW / HIGH). */
export const JUTE_RATIO_LOW = 0.9;
export const JUTE_RATIO_HIGH = 1.25;

/**
 * Jute per kg cloth against the std, in words, using the SAME bands as the
 * jute-issue check: below 0.90 is LOW (issue lines missing or under-weighed),
 * above 1.25 is HIGH (over-issue or production under-booked) — both warn;
 * only a ratio inside the band is toned good. The std is always quoted.
 */
export function kgPerKgVerdict(actual: number | null | undefined, std: number | null | undefined): Verdict {
	if (actual == null) return { text: "no cloth or no jute issued in the range", tone: undefined };
	if (std == null) return { text: "no std", tone: undefined };
	const stdText = `std ${std.toFixed(2)}`;
	if (actual < JUTE_RATIO_LOW) return { text: `${stdText} · LOW — issue lines may be missing or under-weighed`, tone: "warn" };
	if (actual > JUTE_RATIO_HIGH) return { text: `${stdText} · HIGH — over-issue or production under-booked`, tone: "warn" };
	const diff = actual - std;
	if (Math.abs(diff) < 0.005) return { text: `${stdText} · at std`, tone: "good" };
	return { text: `${stdText} · ${Math.abs(diff).toFixed(2)} ${diff < 0 ? "below" : "above"} std`, tone: "good" };
}

/** The not_keyed reasons that explain a head, for the "—" caption (the head's own `not_keyed` wins). */
const NOT_KEYED_BY_HEAD: Record<string, string[]> = {
	raw_material: ["JUTE_RATE_PER_KG"],
	power: ["power", "POWER_RATE_PER_KWH"],
	wages: ["WAGE_PER_HAND_DAY"],
	overheads: ["overheads", "FIXED_COST_PER_DAY"],
	capital: ["capital", "COST_OF_CAPITAL_PCT"],
};

/** Why a head is unavailable or estimated: the head's own reason, else the matching not_keyed line. */
export function headReason(head: StatementHead, notKeyed: ReadonlyArray<NotKeyed>): string | null {
	if (head.not_keyed) return head.not_keyed;
	const keys = NOT_KEYED_BY_HEAD[head.key] ?? [];
	const hit = notKeyed.find((n) => keys.some((k) => n.key === k || n.key.startsWith(`${k}:`)));
	if (hit) return hit.reason;
	if (head.estimated) return "estimated at the rule of thumb — key the parameter on the Cost Parameters page";
	if (!head.available) return "not available";
	return null;
}

/** The statement covers the priced days only — one line under the table. */
export function statementCoverage(statement: DailyPlStatement): string | null {
	const priced = statement.priced_days;
	const calendar = statement.calendar_days;
	if (priced == null || calendar == null) return null;
	const cloth = statement.cloth_t != null ? ` · ${fmtT(statement.cloth_t)} t cloth` : "";
	const base = `${priced} of ${calendar} day${calendar === 1 ? "" : "s"} priced${cloth}`;
	return priced === calendar ? base : `${base} · unpriced days are left out of the statement (see Not keyed)`;
}

/** fg_by_product as a list, whether the backend sent a dict keyed by product or a list. */
export function fgProducts(capital: DailyPlCapital | null): FgProduct[] {
	const raw = capital?.fg_by_product;
	if (!raw) return [];
	if (Array.isArray(raw)) return raw;
	return Object.entries(raw).map(([product, e]) => ({ product, ...e }));
}

/** The finished-goods sub-line label of head 6, naming where the tonnes come from. */
export function capitalFgLabel(capital: DailyPlCapital | null, fallback: string): string {
	if (!capital || capital.fg_t == null) return fallback;
	const source =
		capital.fg_source === "keyed"
			? "keyed FG_STOCK_T"
			: capital.fg_source === "bale_register"
				? "from bale register"
				: null;
	return source ? `Finished goods stock (${fmtT(capital.fg_t)} t, ${source})` : `Finished goods stock (${fmtT(capital.fg_t)} t)`;
}

/** The per-product detail of the finished-goods line: "sacking 900.000 t × ₹1,85,000/t · hessian …". */
export function fgDetail(capital: DailyPlCapital | null): string {
	return fgProducts(capital)
		.filter((e) => (e.tonnes ?? 0) > 0)
		.map((e) => {
			const name = (e.product ?? "").toLowerCase();
			const rate = e.rate != null ? ` × ₹${fmtMoney(e.rate)}/t` : " (no realisation rate — not valued)";
			return `${name} ${fmtT(e.tonnes)} t${rate}`;
		})
		.join(" · ");
}
