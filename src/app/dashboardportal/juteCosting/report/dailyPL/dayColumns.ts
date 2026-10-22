/**
 * The day-by-day columns of the Daily P&L (ITM-019, extended by ITM-027 with
 * jute waste, overheads, operating profit, capital cost and net) and the
 * number formatters the page shares. One definition drives the desktop grid, the
 * phone table and the Excel export; the `value` getters read the nested
 * money / per-tonne objects so all three agree.
 */

import type { DailyPlDay } from "./_service";
import type { Col } from "./tableColumns";

/** YYYY-MM-DD → dd/mm (the period, with its year, is in the report header). */
export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

/** Rupees with Indian grouping, no decimals by default; "—" for null. */
export function fmtMoney(v: number | null | undefined, decimals = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Tonnes, 3 dp; "—" for null. */
export function fmtT(v: number | null | undefined, decimals = 3): string {
  return fmtMoney(v, decimals);
}

/** A parameter value: up to 4 dp for small factors, 2 for money-sized values. */
export function fmtParam(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const dp = Math.abs(v) < 100 ? 4 : 2;
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: dp });
}

/** ₹ on a chart axis: 1.2 Cr / 1.77 L / 91 k / 850. */
export function fmtRupeeShort(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${Math.round(v / 1e3)} k`;
  return v.toFixed(0);
}

/**
 * Period money in lakh, 2 dp, for the P&L statement: "₹ 183.35 L"; a
 * negative figure keeps its sign in front of the rupee ("−₹ 0.50 L"); "—"
 * for null. Small figures stay in lakh too (₹ 0.02 L) so a column reads in
 * one unit.
 */
export function fmtLakh(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const lakh = Math.abs(v) / 1e5;
  const text = lakh.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "−" : ""}₹ ${text} L`;
}

/**
 * ₹ with Indian grouping, 0 dp, "—" for null. A negative figure keeps its sign
 * in front of the rupee ("−₹43", like fmtLakh) — never "₹-43"; a figure that
 * rounds to zero prints no sign.
 */
export function fmtRupee(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v < 0 && Math.round(Math.abs(v)) > 0 ? "−" : "";
  return `${sign}₹${fmtMoney(Math.abs(v))}`;
}

export const dayCols: Col<DailyPlDay>[] = [
  {
    field: "date",
    header: "Date",
    short: "Date",
    width: 90,
    value: (r) => shortDate(r.date),
    description: "dd/mm — the period (with its year) is in the report header",
  },
  { field: "weekday", header: "Day", width: 64, phone: false },
  { field: "sacking_t", header: "Sacking t", short: "Sack t", num: true, decimals: 3, width: 100 },
  { field: "hessian_t", header: "Hessian t", short: "Hess t", num: true, decimals: 3, width: 100 },
  { field: "cloth_t", header: "Cloth t", num: true, decimals: 3, width: 100 },
  { field: "yarn_t", header: "Yarn t", num: true, decimals: 3, width: 100 },
  { field: "yarn_surplus_t", header: "Yarn surplus t", num: true, decimals: 3, width: 125, phone: false },
  { field: "hands", header: "Hands", num: true, decimals: 1, width: 90 },
  { field: "spindle_hours", header: "Spindle-hrs", num: true, decimals: 0, width: 110, phone: false },
  {
    field: "money_realisation",
    header: "Realisation ₹",
    short: "Real ₹",
    num: true,
    decimals: 0,
    width: 130,
    value: (r) => r.money.realisation,
  },
  { field: "money_jute_cost", header: "Jute ₹", num: true, decimals: 0, width: 120, value: (r) => r.money.jute_cost },
  {
    field: "money_jute_waste_cost",
    header: "Jute waste ₹",
    short: "Waste ₹",
    num: true,
    decimals: 0,
    width: 120,
    phone: false,
    value: (r) => r.money.jute_waste_cost,
    description: "jute waste issued at its booked value — hidden while the range has none",
  },
  { field: "money_wages", header: "Wages ₹", num: true, decimals: 0, width: 110, value: (r) => r.money.wages },
  {
    field: "money_power",
    header: "Power ₹",
    num: true,
    decimals: 0,
    width: 100,
    value: (r) => r.money.power,
    description: "— when power is not keyed (the contribution then excludes it)",
  },
  { field: "money_stores", header: "Stores ₹", num: true, decimals: 0, width: 110, value: (r) => r.money.stores },
  {
    field: "money_dust_credit",
    header: "Dust credit ₹",
    num: true,
    decimals: 0,
    width: 120,
    phone: false,
    value: (r) => r.money.dust_credit,
  },
  {
    field: "money_contribution",
    header: "Contribution ₹",
    short: "Contrib ₹",
    num: true,
    decimals: 0,
    width: 140,
    value: (r) => r.money.contribution,
  },
  {
    field: "money_overheads",
    header: "Overheads ₹",
    short: "Ovh ₹",
    num: true,
    decimals: 0,
    width: 120,
    phone: false,
    value: (r) => r.money.overheads,
    description: "keyed OVERHEAD_* per day, else FIXED_COST_PER_DAY, else the ₹2,000/t estimate",
  },
  {
    field: "money_operating_profit",
    header: "Operating profit ₹",
    short: "Op profit ₹",
    num: true,
    decimals: 0,
    width: 150,
    value: (r) => r.money.operating_profit,
    description: "contribution − overheads",
  },
  {
    field: "money_capital_cost",
    header: "Capital cost ₹",
    short: "Capital ₹",
    num: true,
    decimals: 0,
    width: 130,
    phone: false,
    value: (r) => r.money.capital_cost,
    description: "interest on blocked capital per day — when COST_OF_CAPITAL_PCT is keyed and a stock value is available",
  },
  {
    field: "money_net",
    header: "Net ₹",
    num: true,
    decimals: 0,
    width: 120,
    phone: false,
    value: (r) => r.money.net,
    description: "operating profit − capital cost; — until the capital cost is available",
  },
  {
    field: "per_t_contribution",
    header: "Contribution ₹/t",
    short: "₹/t",
    num: true,
    decimals: 0,
    width: 140,
    value: (r) => r.per_t_cloth.contribution,
  },
  {
    field: "per_t_operating_profit",
    header: "Operating profit ₹/t",
    short: "Op ₹/t",
    num: true,
    decimals: 0,
    width: 160,
    value: (r) => r.per_t_cloth.operating_profit,
  },
  {
    field: "per_100sh_contribution",
    header: "₹ per 100 spindle-hrs",
    short: "₹/100 sp-h",
    num: true,
    decimals: 0,
    width: 165,
    value: (r) => r.per_100_spindles.contribution_per_100_spindle_hours,
  },
  {
    field: "per_t_realisation",
    header: "Realisation ₹/t",
    num: true,
    decimals: 0,
    width: 130,
    phone: false,
    value: (r) => r.per_t_cloth.realisation,
  },
  {
    field: "per_t_jute_cost",
    header: "Jute ₹/t",
    num: true,
    decimals: 0,
    width: 110,
    phone: false,
    value: (r) => r.per_t_cloth.jute_cost,
  },
  {
    field: "per_t_wages",
    header: "Wages ₹/t",
    num: true,
    decimals: 0,
    width: 110,
    phone: false,
    value: (r) => r.per_t_cloth.wages,
  },
  {
    field: "per_t_overheads",
    header: "Overheads ₹/t",
    num: true,
    decimals: 0,
    width: 120,
    phone: false,
    value: (r) => r.per_t_cloth.overheads,
  },
  {
    field: "per_t_capital_cost",
    header: "Capital ₹/t",
    num: true,
    decimals: 0,
    width: 110,
    phone: false,
    value: (r) => r.per_t_cloth.capital_cost,
  },
  {
    field: "per_t_net",
    header: "Net ₹/t",
    num: true,
    decimals: 0,
    width: 110,
    phone: false,
    value: (r) => r.per_t_cloth.net,
  },
  {
    field: "per_t_yarn_contribution",
    header: "Contribution ₹/t yarn",
    num: true,
    decimals: 0,
    width: 160,
    phone: false,
    value: (r) => r.per_t_yarn.contribution,
  },
];

/** Columns hidden by default while the range has none of their figure. */
const HIDDEN_WHEN_ZERO = ["money_jute_waste_cost"] as const;

/**
 * The columns to show for a range: the jute-waste column is hidden while no
 * day of the range booked any waste (0 or null everywhere — sls books none
 * today), so the table does not carry an always-empty column.
 */
export function visibleDayCols(days: ReadonlyArray<DailyPlDay>): Col<DailyPlDay>[] {
  const hasWaste = days.some((d) => (d.money.jute_waste_cost ?? 0) !== 0);
  if (hasWaste) return dayCols;
  return dayCols.filter((c) => !(HIDDEN_WHEN_ZERO as readonly string[]).includes(c.field));
}
