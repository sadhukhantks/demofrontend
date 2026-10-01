/**
 * Pure row / format helpers for the Loom Modification Impact page — no React,
 * no fetch, so they are unit-tested on their own. Every figure comes from the
 * endpoint; these helpers only decide how it is written and coloured.
 */

import type { KpiState } from "../dailyProductionReport/_components/DprPieces";
import type {
  ImpactChain,
  ImpactComparison,
  ImpactDayRow,
  ImpactFlag,
  ImpactMechanicalRow,
  ImpactMeta,
  ImpactSegment,
  ImpactVerdict,
  ImpactVerdictCode,
  ImpactWindows,
} from "./_service";

/** Row plus a grid key — the endpoint returns no row id for most sections. */
export type WithId<T> = T & { row_id: number };

export function withIds<T>(rows: T[] | undefined | null): WithId<T>[] {
  return (rows ?? []).map((r, i) => ({ ...r, row_id: i }));
}

// ---------------------------------------------------------------------------
// Filter option lists (D4, D5, §7.1)
// ---------------------------------------------------------------------------

export const WINDOW_PRESETS: readonly number[] = [30, 60, 90, 180];
export const DEFAULT_WINDOW_DAYS = 60;
/** The two one-tap presets beside the window dropdown (D4). */
export const QUICK_WINDOW_PRESETS: readonly number[] = [30, 60];

export const SETTLE_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: "0 days" },
  { value: 3, label: "3 days" },
  { value: 7, label: "7 days" },
];

export const CONTROL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "speed_band", label: "Same dept + same std-speed band, not modified" },
  { value: "same_dept", label: "Same dept, not modified" },
  { value: "control_group", label: "A CONTROL group" },
  { value: "none", label: "None" },
];

// ---------------------------------------------------------------------------
// Number / date formatting
// ---------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08-31" → "31-Aug-26"; anything else → "—". */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  return `${m[3]}-${month}-${m[1].slice(2)}`;
}

/** Fixed decimals, em-dash for null/NaN. */
export function fmtVal(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(decimals);
}

/** Signed fixed-decimal number: "+2.10", "-1.00", "0.00"; em-dash for null. */
export function fmtSigned(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = v.toFixed(decimals);
  return v > 0 ? `+${s}` : s;
}

/** Signed percentage with one decimal: "+3.9%". */
export function fmtSignedPct(v: number | null | undefined, decimals = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${fmtSigned(v, decimals)}%`;
}

/**
 * Efficiency change in points with its relative size: "+2.10 pts (+3.9%)".
 * A null points delta is an em-dash even when the percentage is present.
 */
export function fmtDeltaPts(
  deltaPts: number | null | undefined,
  deltaPct: number | null | undefined,
  decimals = 2,
): string {
  if (deltaPts == null || !Number.isFinite(deltaPts)) return "—";
  const head = `${fmtSigned(deltaPts, decimals)} pts`;
  return deltaPct == null || !Number.isFinite(deltaPct)
    ? head
    : `${head} (${fmtSignedPct(deltaPct)})`;
}

/** "5 of 12" — em-dash when the count is unknown. */
export function fmtLooms(n: number | null | undefined, total: number | null | undefined): string {
  if (n == null) return "—";
  return total == null ? String(n) : `${n} of ${total}`;
}

/** "01-Jul-26..29-Aug-26 (60 d)". */
export function fmtSpan(
  from: string | null | undefined,
  to: string | null | undefined,
  days?: number | null,
): string {
  if (!from && !to) return "—";
  const core = `${fmtDate(from)}..${fmtDate(to)}`;
  return days == null ? core : `${core} (${days} d)`;
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

export const VERDICT_LABELS: Record<ImpactVerdictCode, string> = {
  IMPROVED: "IMPROVED",
  WORSE: "WORSE",
  NO_CLEAR_CHANGE: "NO CLEAR CHANGE",
  NOT_ENOUGH_DATA: "NOT ENOUGH DATA",
};

export type VerdictChipColor = "success" | "error" | "warning" | "default";

export function verdictLabel(code: ImpactVerdictCode | string | null | undefined): string {
  if (!code) return "—";
  return (VERDICT_LABELS as Record<string, string>)[code] ?? String(code).replace(/_/g, " ");
}

export function verdictChipColor(
  code: ImpactVerdictCode | string | null | undefined,
): VerdictChipColor {
  switch (code) {
    case "IMPROVED":
      return "success";
    case "WORSE":
      return "error";
    case "NO_CLEAR_CHANGE":
      return "warning";
    default:
      return "default";
  }
}

/**
 * Tile caption state for a relative change: good when it clears the
 * threshold upward, bad when it falls past it downward, neutral inside.
 */
export function deltaState(deltaPct: number | null | undefined, thresholdPct: number): KpiState {
  if (deltaPct == null || !Number.isFinite(deltaPct)) return undefined;
  if (deltaPct >= thresholdPct) return "good";
  if (deltaPct <= -thresholdPct) return "bad";
  return undefined;
}

/**
 * Verdict threshold (relative %) from meta.thresholds. Accepts
 * `VERDICT_THRESHOLD_PCT` is a plain number on the wire; falls back to the
 * spec default of 3 when missing or not a finite number.
 */
export function thresholdPctFor(thresholds: Record<string, unknown> | null | undefined): number {
  const raw = thresholds?.VERDICT_THRESHOLD_PCT ?? thresholds?.verdict_threshold_pct;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return 3;
}

/**
 * "since 31-Aug-26 · Rectification: small tweak (stage 2 of 2, 5 of 12 looms)"
 * — the line above the tiles that names which change the verdict is about.
 */
export function stageSubline(verdict: ImpactVerdict | null, chain: ImpactChain | null): string {
  if (!verdict) return "";
  const stage = chain?.stages.find((s) => s.seq === verdict.stage_seq) ?? null;
  const parts: string[] = [];
  if (verdict.since_date) parts.push(`since ${fmtDate(verdict.since_date)}`);
  if (stage) {
    const total = chain?.stages.length ?? 0;
    const label = `${stage.mod_kind_label || stage.mod_kind}: ${stage.title}`;
    const looms = fmtLooms(stage.loom_count, stage.root_loom_count);
    parts.push(`${label} (stage ${stage.seq} of ${total}, ${looms} looms)`);
  } else if (verdict.stage_label) {
    parts.push(verdict.stage_label);
  }
  return parts.join(" · ");
}

/** "4 of 5 looms improved" — "" when the counts are unknown. */
export function loomsImprovedLine(verdict: ImpactVerdict | null): string {
  if (!verdict || verdict.looms_improved == null || verdict.looms_total == null) return "";
  return `${verdict.looms_improved} of ${verdict.looms_total} looms improved`;
}

/**
 * "before 91 % (50 eff days) · after 87 % (18 eff days)" — the coverage of
 * the study loom-days and how many of them carried a measurable efficiency.
 */
export function coverageLine(verdict: ImpactVerdict | null): string {
  if (!verdict) return "";
  const side = (pct: number | null, days: number | null, name: string): string | null => {
    if (pct == null && days == null) return null;
    const p = pct == null ? "—" : `${fmtVal(pct, 0)} %`;
    return days == null ? `${name} ${p}` : `${name} ${p} (${fmtVal(days, 0)} eff days)`;
  };
  return [
    side(verdict.coverage_before_pct, verdict.eff_days_before, "before"),
    side(verdict.coverage_after_pct, verdict.eff_days_after, "after"),
  ]
    .filter((s): s is string => s != null)
    .join(" · ");
}

// ---------------------------------------------------------------------------
// Comparison block (owner, 2026-09-29) — this loom set vs looms not modified
// ---------------------------------------------------------------------------

export type ComparisonRowKind = "study" | "control" | "net";

export interface ComparisonRow {
  row_id: number;
  kind: ComparisonRowKind;
  label: string;
  looms: string;
  before: string;
  after: string;
  /** "+2.10 pts (+3.7%)" — points and relative size together. */
  change: string;
  state: KpiState;
}

const COMPARISON_LABELS: Record<ComparisonRowKind, string> = {
  study: "This loom set (modified)",
  control: "Other looms (not modified)",
  net: "Difference (net effect)",
};

function pctText(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "—" : `${fmtVal(v)} %`;
}

/**
 * Rows of the comparison table: the study looms, then — only when the server
 * sent a control set — the control looms and the net effect. The net row has
 * no looms / before / after of its own.
 */
export function comparisonRows(c: ImpactComparison | null | undefined, thresholdPct: number): ComparisonRow[] {
  if (!c) return [];
  const side = (kind: "study" | "control", s: ImpactComparison["study"], id: number): ComparisonRow => ({
    row_id: id,
    kind,
    label: COMPARISON_LABELS[kind],
    looms: s.looms_n == null ? "—" : fmtVal(s.looms_n, 0),
    before: pctText(s.before),
    after: pctText(s.after),
    change: fmtDeltaPts(s.delta_pts, s.delta_pct),
    state: deltaState(s.delta_pct, thresholdPct),
  });
  const rows: ComparisonRow[] = [side("study", c.study, 0)];
  if (c.control) {
    rows.push(side("control", c.control, 1));
    rows.push({
      row_id: 2,
      kind: "net",
      label: COMPARISON_LABELS.net,
      looms: "",
      before: "",
      after: "",
      change: fmtDeltaPts(c.net_delta_pts, c.net_delta_pct),
      state: deltaState(c.net_delta_pct, thresholdPct),
    });
  }
  return rows;
}

/** One-line note under the table when the figures are at the baseline standard; "" otherwise. */
export function comparisonBasisNote(c: ImpactComparison | null | undefined): string {
  if (!c || c.basis !== "efficiency_at_baseline_std") return "";
  return "Figures are efficiency at the baseline standard speed: a study loom's standard changed inside a window (flag S).";
}

const NO_CONTROL_NOTE = /^no eligible controls|excluded as controls|control group .*dropped/i;

/**
 * Why there is no comparison set: "control set to None" when the user chose
 * so, else the server note that explains the drop, else the generic reason.
 */
export function noComparisonReason(meta: ImpactMeta | null | undefined): string {
  if (meta?.control?.mode === "none") return "control set to None in the filters";
  const note = (meta?.notes ?? []).find((n) => NO_CONTROL_NOTE.test(n));
  return note ? note.replace(/\.$/, "") : "no eligible un-modified looms";
}

// ---------------------------------------------------------------------------
// Windows line (§7.2 A)
// ---------------------------------------------------------------------------

const CUT_REASON_TEXT: Record<string, string> = {
  window: "",
  next_event: "cut by next event",
  last_data_date: "cut by last data date",
};

/** "Before 01-Jul..29-Aug (60 d, extended) | Excluded 30-Aug..04-Sep | After-1 05-Sep..25-Sep (21 d, cut by last data date)". */
export function windowLine(w: ImpactWindows | null | undefined): string {
  if (!w) return "";
  const parts: string[] = [];
  if (w.before) {
    const ext = w.before.extended ? ", extended" : "";
    parts.push(
      `Before ${fmtDate(w.before.date_from)}..${fmtDate(w.before.date_to)} (${w.before.days} d${ext})`,
    );
  }
  for (const x of w.excluded ?? []) {
    parts.push(`Excluded${x.stage_seq != null ? `-${x.stage_seq}` : ""} ${fmtDate(x.date_from)}..${fmtDate(x.date_to)}`);
  }
  for (const a of w.after ?? []) {
    const cut = CUT_REASON_TEXT[a.cut_reason] ?? "";
    const tail = cut ? `${a.days} d, ${cut}` : `${a.days} d`;
    parts.push(`After-${a.stage_seq} ${fmtDate(a.date_from)}..${fmtDate(a.date_to)} (${tail})`);
  }
  return parts.join(" | ");
}

// ---------------------------------------------------------------------------
// Row classes (grid tints)
// ---------------------------------------------------------------------------

/** Extra row classes of this page — styled by the wrapper in TabGrid. */
export const ROW_CLASS_EXCLUDED = "lmi-row-excluded";
export const ROW_CLASS_CONTROL = "lmi-row-control";

export type PhaseKind = "before" | "excluded" | "after";

/** BEFORE / EXCLUDED / AFTER-k → its kind; unknown reads as "after". */
export function phaseKind(phase: string | null | undefined): PhaseKind {
  const p = (phase ?? "").toUpperCase();
  if (p.startsWith("BEFORE")) return "before";
  if (p.startsWith("EXCL")) return "excluded";
  return "after";
}

/** Day-wise rows inside a settling span are greyed out. */
export function dayRowClass(row: Pick<ImpactDayRow, "phase">): string {
  return phaseKind(row.phase) === "excluded" ? ROW_CLASS_EXCLUDED : "";
}

/**
 * Stage-ladder row tint: control twins are shaded; a study segment is red
 * when its change vs baseline is at or beyond −threshold, amber when the
 * verdict withheld for thin data. The Before row never tints.
 */
export function ladderRowClass(
  seg: Pick<ImpactSegment, "is_control" | "seq" | "delta_vs_baseline_pct" | "verdict">,
  thresholdPct: number,
): string {
  if (seg.is_control) return ROW_CLASS_CONTROL;
  if (seg.seq === 0) return "";
  if (seg.delta_vs_baseline_pct != null && seg.delta_vs_baseline_pct <= -thresholdPct) {
    return "report-perf-low";
  }
  if (seg.verdict === "NOT_ENOUGH_DATA") return "report-perf-watch";
  return "";
}

// ---------------------------------------------------------------------------
// Ladder rows (§7.2 B)
// ---------------------------------------------------------------------------

export interface LadderRow extends ImpactSegment {
  row_id: number;
  /** "Before" / "After-2 (Rectification)" / "Control · After-1". */
  segment: string;
  dates: string;
  looms: string;
  delta_vs_baseline_text: string;
  delta_vs_previous_text: string;
  net_vs_control_text: string;
  verdict_text: string;
}

/** Grid rows of the stage ladder, in the order the endpoint sent them. */
export function ladderRows(segments: ImpactSegment[] | null | undefined): LadderRow[] {
  return (segments ?? []).map((s, i) => ({
    ...s,
    row_id: i,
    segment: s.is_control ? `Control · ${s.label}` : s.label,
    dates: fmtSpan(s.date_from, s.date_to, s.days),
    looms: fmtLooms(s.looms_n, s.looms_total),
    delta_vs_baseline_text: fmtDeltaPts(s.delta_vs_baseline_pts, s.delta_vs_baseline_pct),
    delta_vs_previous_text: fmtDeltaPts(s.delta_vs_previous_pts, s.delta_vs_previous_pct),
    net_vs_control_text: fmtSignedPct(s.net_vs_control_pct),
    verdict_text: s.verdict ? verdictLabel(s.verdict) : "",
  }));
}

// ---------------------------------------------------------------------------
// Flags (§7.2 C)
// ---------------------------------------------------------------------------

export const FLAG_LEGEND_DEFAULT: Record<ImpactFlag, string> = {
  S: "effective standard changed inside a window",
  H: "hours coverage moved ≥ 20 pts between windows",
  W: "dominant weaver share moved ≥ 20 pts or weaver sets disjoint",
  D: "coverage < 50 %",
  N: "no standard",
};

export const FLAG_ORDER: readonly ImpactFlag[] = ["S", "H", "W", "D", "N"];

/** Server legend over the default, in S H W D N order. */
export function flagLegend(meta: ImpactMeta | null | undefined): { flag: ImpactFlag; text: string }[] {
  return FLAG_ORDER.map((flag) => ({
    flag,
    text: meta?.flags_legend?.[flag] ?? FLAG_LEGEND_DEFAULT[flag],
  }));
}

/** "S W" in legend order; "—" for a loom not in the stage, "" when clean. */
export function flagsText(flags: ImpactFlag[] | null | undefined, inStage = true): string {
  if (!inStage) return "—";
  const set = new Set<string>(flags ?? []);
  return FLAG_ORDER.filter((f) => set.has(f)).join(" ");
}

// ---------------------------------------------------------------------------
// Day-wise / mechanical text
// ---------------------------------------------------------------------------

export function markersText(markers: string[] | null | undefined): string {
  return (markers ?? []).filter((m) => m && m.trim() !== "").join(" · ");
}

export interface MechanicalRow extends ImpactMechanicalRow {
  row_id: number;
  /** Loom name, or "TOTAL" for the endpoint's total row. */
  loom_label: string;
}

export function mechanicalRows(rows: ImpactMechanicalRow[] | null | undefined): MechanicalRow[] {
  return (rows ?? []).map((r, i) => ({
    ...r,
    row_id: i,
    loom_label: r.row_kind === "total" ? "TOTAL" : (r.loom ?? ""),
  }));
}

/** Thresholds map flattened to label/value pairs for the Notes tab. */
export function thresholdRows(
  thresholds: Record<string, unknown> | null | undefined,
): { row_id: number; key: string; value: string }[] {
  if (!thresholds) return [];
  return Object.entries(thresholds).map(([key, v], i) => ({
    row_id: i,
    key,
    value: v == null ? "—" : String(v),
  }));
}

/** Labels of `MOD_DONE_BY` (src/juteProduction/constants.py) — the chain stage carries the code only. */
export const DONE_BY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  INHOUSE: "In-house",
  VENDOR: "Vendor",
});

/** "In-house" / "Vendor" for a done_by code; a server label wins, an unknown code is shown as is. */
export function doneByLabel(code: string | null | undefined, serverLabel?: string | null): string {
  if (serverLabel) return serverLabel;
  if (!code) return "";
  return DONE_BY_LABELS[code.toUpperCase()] ?? code;
}
