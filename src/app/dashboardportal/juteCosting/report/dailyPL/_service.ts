/**
 * Daily P&L and Cost per Tonne service (ITM-019, extended by ITM-027) —
 * GET /api/juteCostReports/daily_pl (vowerp3be src/juteCosting/daily_pl.py)
 * plus the two lazy endpoints of ITM-027:
 *   GET /daily_pl/breakdown?head=…     — small aggregated tables for one head
 *   GET /daily_pl/jute_issue_checks    — the flagged jute-issue lines
 *
 * One call returns, for a date range (capped at 62 days by the server), one
 * row per calendar day: the physical inputs the DPR already knows (cloth by
 * product, yarn, hands, spindle-hours, jute issued, stores, dust, power),
 * the money those inputs price to with the cost parameters in force on
 * that day (realisation, jute cost, jute waste, wages, power, stores, dust
 * credit → contribution; − overheads → operating profit; − capital cost →
 * net), and the same money per tonne of cloth, per tonne of yarn and per
 * 100 spindle-hours. `mtd` sums the range; `std` is the 30-day median
 * ending on the To date (no achievement %); `statement` is the six-head
 * P&L of the owner's format; `capital` the blocked-capital components (read
 * as of today, not per day); `params_used` lists every parameter row
 * actually picked; `not_keyed` says what could not be priced and why. A
 * null figure is one that is NOT AVAILABLE (never 0): power when no reading
 * is keyed, a per-tonne ratio on a day without cloth.
 *
 * Kept beside the page: this is the only consumer.
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

/** The money lines of one day / the period, in the backend's MONEY_KEYS order. */
export interface DailyPlMoney {
	realisation: number | null;
	jute_cost: number | null;
	/** Jute waste issued at its booked value (0 when none). */
	jute_waste_cost: number | null;
	wages: number | null;
	/** null when power is not keyed — the contribution then EXCLUDES it. */
	power: number | null;
	stores: number | null;
	dust_credit: number | null;
	/** realisation − jute − jute waste − wages − power − stores + dust credit. */
	contribution: number | null;
	/** Keyed OVERHEAD_*_PER_DAY, else FIXED_COST_PER_DAY, else the ₹2,000/t estimate. */
	overheads: number | null;
	/** contribution − overheads; null when contribution is null. */
	operating_profit: number | null;
	/** Interest on blocked capital per day; null when the pct is not keyed or no stock value is available. */
	capital_cost: number | null;
	/** operating_profit − capital_cost; null when either is null. */
	net: number | null;
}

/** Money ÷ cloth tonnes — null when the day wove nothing. */
export interface DailyPlPerT {
	realisation: number | null;
	jute_cost: number | null;
	jute_waste_cost: number | null;
	wages: number | null;
	power: number | null;
	stores: number | null;
	dust_credit: number | null;
	contribution: number | null;
	overheads: number | null;
	operating_profit: number | null;
	capital_cost: number | null;
	net: number | null;
}

/** Money ÷ yarn tonnes — null when the day spun nothing. */
export interface DailyPlPerTYarn {
	jute_cost: number | null;
	wages: number | null;
	contribution: number | null;
}

/** Contribution per 100 spindles — null when no spindle-hours were planned. */
export interface DailyPlPer100Spindles {
	contribution_per_100_spindle_hours: number | null;
	contribution_per_100_spindle_days: number | null;
}

export interface DailyPlFlags {
	/** Contribution was computed without power (not keyed). */
	power_excluded: boolean;
	/** A produced product had no realisation rate and was skipped. */
	realisation_partial: boolean;
	/** DG kWh priced at the grid rate (DG_RATE_PER_KWH not keyed). */
	dg_at_grid_rate?: boolean;
	/** Solar kWh priced at ₹0 (SOLAR_RATE_PER_KWH not keyed). */
	solar_at_zero?: boolean;
	/** Overheads are the ₹2,000/t rule-of-thumb estimate, not a keyed figure. */
	overheads_estimated?: boolean;
}

export interface DailyPlPeriodFlags extends DailyPlFlags {
	/** At least one day of the range could not be priced (contribution null):
	 * the money totals and every per-unit line cover the priced days only. */
	contribution_partial: boolean;
}

export type PowerMeterType = "GRID" | "DG" | "SOLAR" | "OTHER";
export type StoresCategory = "SPARES" | "CONSUMABLES" | "PACKING" | "GENERAL";

/** kWh and its cost for one meter type on one day. */
export interface PowerByType {
	kwh: number | null;
	cost: number | null;
}

/** One overhead sub-line in force on a day. */
export interface OverheadLine {
	code: string;
	label: string;
	value_per_day: number | null;
	amount: number | null;
}

/** Realisation of one product on a day / the period. */
export interface RealisationByProduct {
	tonnes: number;
	rate?: number | null;
	amount: number | null;
}

export interface DailyPlDay {
	/** YYYY-MM-DD. */
	date: string;
	/** Mon … Sun. */
	weekday: string;
	sacking_t: number;
	hessian_t: number;
	cloth_t: number;
	yarn_t: number;
	/** null = purchased yarn is not tracked on this tenant. */
	purchased_yarn_t: number | null;
	/** yarn_t + purchased − cloth_t. */
	yarn_surplus_t: number;
	hands: number;
	hours: number;
	spindle_hours: number;
	jute_issued_t: number;
	jute_issue_value: number;
	/** Jute issued with no booked value — priced at the keyed rate or the MR line rate. */
	jute_unvalued_t: number;
	stores_value: number;
	dust_kg: number;
	/** null = no power reading table / rows. */
	power_kwh: number | null;
	money: DailyPlMoney;
	per_t_cloth: DailyPlPerT;
	per_t_yarn: DailyPlPerTYarn;
	per_100_spindles: DailyPlPer100Spindles;
	flags: DailyPlFlags;
	/** kWh and cost per meter type (GRID / DG / SOLAR / OTHER). */
	power_by_type?: Partial<Record<PowerMeterType, PowerByType>>;
	/** Stores value per category (SPARES / CONSUMABLES / PACKING / GENERAL). */
	stores_by_category?: Partial<Record<StoresCategory, number | null>>;
	/** The overhead sub-lines actually used on the day. */
	overheads_lines?: OverheadLine[];
	realisation_by_product?: Partial<Record<string, RealisationByProduct>>;
	dg_hours?: number | null;
	dg_litres?: number | null;
	/** Jute waste issued (tonnes). */
	jute_waste_t?: number;
	/** Jute issue lines with no booked value. */
	zero_value_lines?: number;
}

/** The range summed ("MTD" when From is the 1st, else "Period"). */
export interface DailyPlPeriod {
	label: string;
	sacking_t: number;
	hessian_t: number;
	cloth_t: number;
	yarn_t: number;
	purchased_yarn_t: number | null;
	yarn_surplus_t: number;
	hands: number;
	hours: number;
	spindle_hours: number;
	jute_issued_t: number;
	jute_issue_value: number;
	jute_unvalued_t: number;
	stores_value: number;
	dust_kg: number;
	power_kwh: number | null;
	/** Each line sums the days it is priced on. */
	money: DailyPlMoney;
	/** Restated over the priced days only (an unpriced day's tonnes are left out). */
	per_t_cloth: DailyPlPerT;
	per_t_yarn: DailyPlPerTYarn;
	per_100_spindles: DailyPlPer100Spindles;
	/** Days with cloth_t > 0. */
	producing_days: number;
	calendar_days: number;
	/** Days whose contribution could not be priced (see not_keyed). */
	unpriced_days: number;
	/** Σ contribution ÷ producing days among the priced days. */
	contribution_per_producing_day: number | null;
	flags: DailyPlPeriodFlags;
	power_by_type?: Partial<Record<PowerMeterType, PowerByType>>;
	stores_by_category?: Partial<Record<StoresCategory, number | null>>;
	overheads_lines?: OverheadLine[];
	realisation_by_product?: Partial<Record<string, RealisationByProduct>>;
	dg_hours?: number | null;
	dg_litres?: number | null;
	jute_waste_t?: number;
	zero_value_lines?: number;
	/** Period-level captions from the backend (e.g. "Overheads and capital cost cover the 15 priced days of 19 only…"). */
	notes?: string[];
}

/** The 30-day median ending on the To date, over producing days with a
 * contribution; every field null when there is no such day. */
export interface DailyPlStd {
	window_from: string;
	window_to: string;
	days_used: number;
	contribution_per_t: number | null;
	contribution_per_day: number | null;
	contribution_per_100_spindle_hours: number | null;
	realisation_per_t: number | null;
	jute_cost_per_t: number | null;
	wages_per_t: number | null;
	operating_profit_per_t: number | null;
}

/** One parameter row that priced at least one day of the range. */
export interface ParamUsed {
	param_code: string;
	/** Display label, from the backend catalogue (params.PARAM_LABELS). */
	param_label: string;
	product: string | null;
	value: number;
	uom: string | null;
	effective_date: string | null;
	branch_id: number | null;
	scope: "branch" | "all";
	source: string | null;
	cost_param_id: number;
	days_used: number;
	/** Where the row priced something: the day rows, the statement, the capital head. Absent on an older backend. */
	used_in?: ParamUsedIn[];
}

export type ParamUsedIn = "days" | "statement" | "capital";

export interface NotKeyed {
	key: string;
	reason: string;
}

export interface DailyPlMeta {
	co_id: number;
	branch_id: number | null;
	date_from: string;
	date_to: string;
	std_window_from: string;
	std_window_days: number;
	notes: string[];
}

// ---------------------------------------------------------------------------
// Statement (ITM-027 §1.4) — the six-head P&L in the owner's order
// ---------------------------------------------------------------------------

export type StatementHeadKey = "raw_material" | "stores" | "power" | "wages" | "overheads" | "capital";
/** The heads that have a lazy breakdown dialog. */
export type BreakdownHead = "raw_material" | "stores" | "power" | "wages";

/** A period figure and the same over the cloth tonnes of the priced days. */
export interface StatementAmount {
	period: number | null;
	per_t: number | null;
}

/** One sub-line of the realisation or of a head. The quantity fields present
 * depend on the head: tonnes × rate (realisation), qty_t (raw material),
 * kwh × rate (power), qty hands × rate (wages), value_per_day × days
 * (overheads), base_value (capital). */
export interface StatementLine extends StatementAmount {
	key?: string;
	/** Overhead sub-lines carry their parameter code instead of a key. */
	code?: string;
	label: string;
	tonnes?: number | null;
	qty_t?: number | null;
	qty?: number | null;
	kwh?: number | null;
	rate?: number | null;
	value_per_day?: number | null;
	/** Overheads estimate line: ₹/t × cloth (value_per_day null). */
	rate_per_t?: number | null;
	days?: number | null;
	base_value?: number | null;
}

/** Head KPIs; which keys are present depends on the head (§1.4). */
export interface StatementKpis {
	jute_kg_per_kg_cloth?: number | null;
	jute_kg_per_kg_cloth_std?: number | null;
	jute_issued_t?: number | null;
	jute_unvalued_t?: number | null;
	zero_value_lines?: number | null;
	kwh_per_t?: number | null;
	dg_hours?: number | null;
	dg_litres?: number | null;
	hands?: number | null;
	hands_per_t?: number | null;
	hours?: number | null;
	pct?: number | null;
	days?: number | null;
}

export interface StatementHead extends StatementAmount {
	no: number;
	key: StatementHeadKey;
	label: string;
	/** ₹/t rule of thumb or keyed benchmark; null when the head has none. */
	benchmark_per_t: number | null;
	/** "keyed" when a BENCH_* parameter is in force, else the rule-of-thumb source
	 * (or, for raw material without a benchmark, the hint on what to key). */
	benchmark_label: string | null;
	/** The figure is an estimate (overheads at the rule of thumb). */
	estimated: boolean;
	/** false = the head could not be priced; `not_keyed` says why. */
	available: boolean;
	lines: StatementLine[];
	kpis?: StatementKpis;
	has_breakdown: boolean;
	/** Raw material only: the jute-issue data check. */
	has_check?: boolean;
	/** Capital: the owner's note on why it is usually not costed. */
	memo?: string | null;
	/** Why the head is unavailable / estimated (when the backend says so). */
	not_keyed?: string | null;
}

export interface StatementRealisation extends StatementAmount {
	lines: StatementLine[];
}

export interface StatementConversionCost extends StatementAmount {
	/** Σ of the stores + power + overheads benchmarks. */
	benchmark_per_t: number | null;
	/** "keyed" when all three BENCH_* are keyed, else the rule-of-thumb source (or "keyed + rule of thumb"). */
	benchmark_label?: string | null;
}

export interface DailyPlStatement {
	realisation: StatementRealisation;
	heads: StatementHead[];
	contribution: StatementAmount;
	operating_profit: StatementAmount;
	net: StatementAmount;
	conversion_cost: StatementConversionCost;
	/** Days with a contribution — the statement sums these only. */
	priced_days?: number;
	calendar_days?: number;
	/** Cloth tonnes of the priced days — the per_t denominator. */
	cloth_t?: number;
}

/** Finished goods of one product: tonnes in stock valued at its REALISATION_PER_T. */
export interface FgProduct {
	product?: string;
	tonnes: number | null;
	rate: number | null;
	value: number | null;
}

/** The blocked-capital components (read as of TODAY, not per day). */
export interface DailyPlCapital {
	jute_stock_value: number | null;
	jute_stock_kg: number | null;
	/** Stock on MR lines that have no rate yet — valued at ₹0 (the capital notes say so). */
	jute_stock_unrated_kg?: number | null;
	jute_stock_unrated_lines?: number | null;
	jute_stock_unrated_value?: number | null;
	/** "now" — the stock view is as-of today, not as-of the To date. */
	jute_stock_as_of?: string | null;
	fg_value: number | null;
	fg_t: number | null;
	other: number | null;
	/** COST_OF_CAPITAL_PCT; null when not keyed. */
	pct: number | null;
	/** A capital cost can be computed (pct keyed and at least one stock value known). */
	available?: boolean;
	/** The date the position was read for (the view is as-of now, not as-of this date). */
	as_on?: string | null;
	notes?: string[];
	/** Per product (keyed by product name, or a list with `product`). */
	fg_by_product?: Record<string, FgProduct> | FgProduct[] | null;
	/** Where the finished-goods tonnes come from. */
	fg_source?: "keyed" | "bale_register" | null;
	bales_entered?: number | null;
	bales_despatched?: number | null;
}

export interface DailyPlData {
	days: DailyPlDay[];
	mtd: DailyPlPeriod;
	std: DailyPlStd;
	params_used: ParamUsed[];
	not_keyed: NotKeyed[];
	meta: DailyPlMeta;
	/** Absent only on a backend that predates ITM-027. */
	statement: DailyPlStatement | null;
	capital: DailyPlCapital | null;
}

// ---------------------------------------------------------------------------
// Breakdown (ITM-027 §1.5) — small aggregated tables, fetched on dialog open
// ---------------------------------------------------------------------------

export interface RawMaterialByQuality {
	item_id: number | null;
	item_name: string | null;
	lines: number;
	kg: number | null;
	value: number | null;
	/** value ÷ kg × 100 over the valued lines. */
	avg_rate_qtl: number | null;
	zero_value_lines: number;
	mr_rated_value: number | null;
}

export interface RawMaterialByMr {
	jute_mr_id: number;
	branch_mr_no: string | null;
	jute_gate_entry_no: string | null;
	mr_date: string | null;
	/** One row per MR: the qualities on it, comma-joined ("D TD-5, D TD-6, D TD-7"). */
	item_name: string | null;
	/** How many qualities the MR carries. */
	items?: number | null;
	/** null when no MR line carries a rate yet. */
	mr_rate_qtl: number | null;
	kg: number | null;
	value: number | null;
	lines: number;
}

export interface RawMaterialByDay {
	tran_date: string;
	kg: number | null;
	value: number | null;
	lines: number;
	zero_value_lines: number;
}

export interface WasteByItem {
	item_name: string | null;
	kg: number | null;
	value: number | null;
}

/** Extras every breakdown carries: small totals, captions and the head's meta. */
export interface BreakdownExtras {
	summary?: Record<string, number | null>;
	notes?: string[];
	meta?: Record<string, unknown>;
}

export interface RawMaterialBreakdown extends BreakdownExtras {
	by_quality: RawMaterialByQuality[];
	by_mr: RawMaterialByMr[];
	by_day: RawMaterialByDay[];
	waste_by_item: WasteByItem[];
}

export interface StoresByCategory {
	category: StoresCategory | string;
	label?: string | null;
	value: number | null;
	lines?: number | null;
}

export interface StoresByGroup {
	item_grp_name: string | null;
	category: string | null;
	value: number | null;
	lines: number | null;
}

export interface StoresByDept {
	dept_desc: string | null;
	value: number | null;
	lines?: number | null;
}

export interface StoresByExpenseType {
	expense_type_name: string | null;
	value: number | null;
	lines?: number | null;
}

export interface StoresTopItem {
	item_name: string | null;
	item_grp_name: string | null;
	qty: number | null;
	value: number | null;
}

export interface StoresBreakdown extends BreakdownExtras {
	by_category: StoresByCategory[];
	by_group: StoresByGroup[];
	by_dept: StoresByDept[];
	by_expense_type: StoresByExpenseType[];
	top_items: StoresTopItem[];
}

export interface PowerByMeter {
	meter_code: string | null;
	meter_name: string | null;
	meter_type: string | null;
	meter_type_label?: string | null;
	kwh: number | null;
	dg_hours: number | null;
	dg_litres: number | null;
	max_demand_kva: number | null;
	days: number | null;
}

export interface PowerByDayType {
	tran_date: string;
	meter_type: string | null;
	kwh: number | null;
}

export interface PowerBreakdown extends BreakdownExtras {
	by_meter: PowerByMeter[];
	by_day_type: PowerByDayType[];
}

/** Hands by spell / designation / department — the name key differs per table. */
export interface WagesBySpell {
	spell_name?: string | null;
	spell?: string | null;
	hands: number | null;
	hours?: number | null;
	rows?: number | null;
}

export interface WagesByDesignation {
	designation?: string | null;
	designation_name?: string | null;
	hands: number | null;
	hours?: number | null;
	rows?: number | null;
}

export interface WagesByDepartment {
	department?: string | null;
	dept_desc?: string | null;
	hands: number | null;
	hours?: number | null;
	rows?: number | null;
}

export interface WagesHoursProfile {
	working_hours: number | null;
	rows: number | null;
}

export interface WagesRate {
	value: number | null;
	source: string | null;
	effective_date?: string | null;
}

export interface WagesBreakdown extends BreakdownExtras {
	by_spell: WagesBySpell[];
	by_designation: WagesByDesignation[];
	by_department: WagesByDepartment[];
	hours_profile: WagesHoursProfile[];
	/** The WAGE_PER_HAND_DAY in force on date_to. */
	rate: WagesRate | null;
}

export type PlBreakdown =
	| { head: "raw_material"; data: RawMaterialBreakdown }
	| { head: "stores"; data: StoresBreakdown }
	| { head: "power"; data: PowerBreakdown }
	| { head: "wages"; data: WagesBreakdown };

// ---------------------------------------------------------------------------
// Jute-issue data check (ITM-027 §1.6)
// ---------------------------------------------------------------------------

/** The flag codes known today — the dialog is driven by `flag_labels`, never by this list. */
export type IssueFlag =
	| "ZERO_WEIGHT"
	| "NO_VALUE"
	| "NO_MR_RATE"
	| "VALUE_RATE_MISMATCH"
	| "RATE_OUTLIER"
	| "ITEM_MISMATCH"
	| "MR_OPEN"
	| "MR_STATUS"
	| "DUPLICATE"
	| "OVER_ISSUE"
	| "FUTURE_DATE"
	| "NO_ISSUE_DAY";

export interface JuteIssueCheckSummary {
	lines: number;
	flagged: number;
	by_flag: Partial<Record<IssueFlag | string, number>>;
	issued_kg: number | null;
	cloth_t: number | null;
	jute_kg_per_kg_cloth: number | null;
	/** 1.06 */
	std: number | null;
	ratio_flag: "LOW" | "HIGH" | null;
	/** 2-line identical groups (same day, MR line, weight) — normal repeated trolley weights, not flagged. */
	identical_pairs?: number | null;
	/** Waste-ledger lines (booked ₹0 by design) sit outside this check. */
	waste_ledger_lines?: number | null;
	waste_ledger_kg?: number | null;
	waste_ledger_value?: number | null;
}

export interface JuteIssueCheckRow {
	jute_issue_id: number;
	issue_date: string;
	issue_status_id: number | null;
	jute_mr_id: number | null;
	jute_mr_li_id: number | null;
	branch_mr_no: string | null;
	jute_gate_entry_no: string | null;
	mr_status_id: number | null;
	mr_status: string | null;
	item_name: string | null;
	weight_kg: number | null;
	issue_value: number | null;
	implied_rate_qtl: number | null;
	mr_rate_qtl: number | null;
	median_rate_qtl: number | null;
	/** weight/100 × MR rate when the MR rate is present, else at the period median. */
	suggested_value: number | null;
	suggested_basis?: "mr_rate" | "median" | null;
	item_id?: number | null;
	mr_line_balance_kg: number | null;
	flags: (IssueFlag | string)[];
	/** Size of the (date, MR line, weight) group this line sits in; the smallest keyed-in gap in seconds. */
	dup_group_size?: number | null;
	dup_seconds?: number | null;
}

export interface JuteIssueDayFlag {
	tran_date: string;
	cloth_t: number | null;
	issued_kg: number | null;
	flag: "NO_ISSUE_DAY" | string;
}

export interface JuteIssueCheckData {
	summary: JuteIssueCheckSummary;
	/** Flagged rows only, ordered by date then id. */
	rows: JuteIssueCheckRow[];
	day_flags: JuteIssueDayFlag[];
	flag_labels: Record<string, string>;
	/** The thresholds the flags were computed with (footnote). */
	meta?: { thresholds?: Record<string, number | string>; [k: string]: unknown };
	/** Captions from the backend, e.g. the waste-ledger lines left outside the check. */
	notes?: string[];
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

const FROZEN_EMPTY = Object.freeze([]) as never[];

export interface PlRangeArgs {
	coId: number;
	/** null = every branch of the company; the page always sends one. */
	branchId: number | null;
	dateFrom: string;
	dateTo: string;
}

function rangeQuery(args: PlRangeArgs): URLSearchParams {
	const qs = new URLSearchParams({
		co_id: String(args.coId),
		date_from: args.dateFrom,
		date_to: args.dateTo,
	});
	if (args.branchId != null) qs.set("branch_id", String(args.branchId));
	return qs;
}

export async function fetchDailyPl(args: PlRangeArgs): Promise<DailyPlData> {
	const qs = rangeQuery(args);
	const res = await fetchWithCookie<{ data: Partial<DailyPlData> }>(
		`${apiRoutesPortalMasters.JUTE_COST_DAILY_PL}?${qs.toString()}`,
		"GET"
	);
	const d = res.data?.data;
	if (res.error || !d) throw new Error(res.error ?? "Failed to load the daily P&L");
	if (!d.mtd || !d.std || !d.meta) throw new Error("The daily P&L response is incomplete");
	return {
		days: d.days ?? FROZEN_EMPTY,
		mtd: d.mtd,
		std: d.std,
		params_used: d.params_used ?? FROZEN_EMPTY,
		not_keyed: d.not_keyed ?? FROZEN_EMPTY,
		meta: { ...d.meta, notes: d.meta.notes ?? FROZEN_EMPTY },
		statement: d.statement ?? null,
		capital: d.capital ?? null,
	};
}

/** The lazy breakdown of one head — fetched when its dialog opens. */
export async function fetchPlBreakdown(head: BreakdownHead, args: PlRangeArgs): Promise<PlBreakdown> {
	const qs = rangeQuery(args);
	qs.set("head", head);
	const res = await fetchWithCookie<{ data: unknown }>(
		`${apiRoutesPortalMasters.JUTE_COST_DAILY_PL_BREAKDOWN}?${qs.toString()}`,
		"GET"
	);
	const d = res.data?.data;
	if (res.error || d == null || typeof d !== "object") {
		throw new Error(res.error ?? "Failed to load the breakdown");
	}
	switch (head) {
		case "raw_material": {
			const b = d as Partial<RawMaterialBreakdown>;
			return {
				head,
				data: {
					by_quality: b.by_quality ?? FROZEN_EMPTY,
					by_mr: b.by_mr ?? FROZEN_EMPTY,
					by_day: b.by_day ?? FROZEN_EMPTY,
					waste_by_item: b.waste_by_item ?? FROZEN_EMPTY,
					notes: b.notes ?? FROZEN_EMPTY,
					summary: b.summary,
					meta: b.meta,
				},
			};
		}
		case "stores": {
			const b = d as Partial<StoresBreakdown>;
			return {
				head,
				data: {
					by_category: b.by_category ?? FROZEN_EMPTY,
					by_group: b.by_group ?? FROZEN_EMPTY,
					by_dept: b.by_dept ?? FROZEN_EMPTY,
					by_expense_type: b.by_expense_type ?? FROZEN_EMPTY,
					top_items: b.top_items ?? FROZEN_EMPTY,
					notes: b.notes ?? FROZEN_EMPTY,
					summary: b.summary,
					meta: b.meta,
				},
			};
		}
		case "power": {
			const b = d as Partial<PowerBreakdown>;
			return {
				head,
				data: {
					by_meter: b.by_meter ?? FROZEN_EMPTY,
					by_day_type: b.by_day_type ?? FROZEN_EMPTY,
					notes: b.notes ?? FROZEN_EMPTY,
					summary: b.summary,
					meta: b.meta,
				},
			};
		}
		case "wages": {
			const b = d as Partial<WagesBreakdown>;
			return {
				head,
				data: {
					by_spell: b.by_spell ?? FROZEN_EMPTY,
					by_designation: b.by_designation ?? FROZEN_EMPTY,
					by_department: b.by_department ?? FROZEN_EMPTY,
					hours_profile: b.hours_profile ?? FROZEN_EMPTY,
					rate: b.rate ?? null,
					notes: b.notes ?? FROZEN_EMPTY,
					summary: b.summary,
					meta: b.meta,
				},
			};
		}
	}
}

/** The jute-issue data check — fetched when its dialog opens. */
export async function fetchJuteIssueChecks(args: PlRangeArgs): Promise<JuteIssueCheckData> {
	const qs = rangeQuery(args);
	const res = await fetchWithCookie<{ data: Partial<JuteIssueCheckData> }>(
		`${apiRoutesPortalMasters.JUTE_COST_DAILY_PL_ISSUE_CHECKS}?${qs.toString()}`,
		"GET"
	);
	const d = res.data?.data;
	if (res.error || !d) throw new Error(res.error ?? "Failed to load the jute issue checks");
	const summary: JuteIssueCheckSummary = {
		lines: d.summary?.lines ?? 0,
		flagged: d.summary?.flagged ?? 0,
		by_flag: d.summary?.by_flag ?? {},
		issued_kg: d.summary?.issued_kg ?? null,
		cloth_t: d.summary?.cloth_t ?? null,
		jute_kg_per_kg_cloth: d.summary?.jute_kg_per_kg_cloth ?? null,
		std: d.summary?.std ?? null,
		ratio_flag: d.summary?.ratio_flag ?? null,
		identical_pairs: d.summary?.identical_pairs ?? null,
		waste_ledger_lines: d.summary?.waste_ledger_lines ?? null,
		waste_ledger_kg: d.summary?.waste_ledger_kg ?? null,
		waste_ledger_value: d.summary?.waste_ledger_value ?? null,
	};
	return {
		summary,
		rows: d.rows ?? FROZEN_EMPTY,
		day_flags: d.day_flags ?? FROZEN_EMPTY,
		flag_labels: d.flag_labels ?? {},
		meta: d.meta,
		notes: d.notes ?? FROZEN_EMPTY,
	};
}
