/**
 * Spinning Production Trend service —
 * GET /api/juteProductionReports/spinning_production_trend.
 *
 * One call returns every cut of the report for a date range (capped at 93
 * days by the server): the period summary with its previous-period deltas,
 * the day rows, day x quality, day x shift, the quality totals and the frame
 * ranking. "Kg per frame-shift" is production divided by the number of
 * (frame, shift letter, day) runs — the DPR's frame-run convention — so a
 * one-shift Sunday compares with a three-shift weekday.
 *
 * Kept beside the page: this is the only consumer.
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

/** Standard (and, where a target efficiency is entered, target) overlay
 * carried by every cut. `std_kg` is the standard production of the
 * frame-shifts that have standards; `std_kg_per_frame_shift` divides by
 * those frame-shifts only, so it lines up against the actual kg per
 * frame-shift. All null when no unit in the cut has standards; `tgt_*` null
 * when no target efficiency is entered. */
export interface TargetFields {
  std_kg: number | null;
  std_kg_per_frame_shift?: number | null;
  std_frame_shifts?: number;
  std_ach_pct: number | null;
  std_coverage_pct?: number | null;
  tgt_kg?: number | null;
  tgt_kg_per_frame_shift?: number | null;
  tgt_frame_shifts?: number;
  /** The standard restated at the yarn's standard count (Yarn master) in
   * place of the day's SQC count — what the standard would be at the count
   * the yarn is meant to be spun at. Null where no unit in the cut has both
   * a standard and the two counts. */
  stdc_kg?: number | null;
  stdc_kg_per_frame_shift?: number | null;
  stdc_frame_shifts?: number;
}

export interface TrendDayRow extends TargetFields, GapFields {
  date: string;
  weekday: string;
  shifts: string[];
  frames: number;
  frame_shifts: number;
  doffs: number;
  kg: number;
  kg_per_frame_shift: number | null;
  kg_per_frame: number | null;
  avg_doff_kg: number | null;
}

export interface TrendDayQualityRow extends TargetFields {
  date: string;
  item_id: number | null;
  quality: string;
  kg: number;
  frames: number;
  frame_shifts: number;
  doffs: number;
  kg_per_frame_shift: number | null;
}

export interface TrendDayShiftRow extends TargetFields {
  date: string;
  shift: string;
  kg: number;
  frames: number;
  doffs: number;
  frame_shifts: number;
  kg_per_frame_shift: number | null;
}

/** Gap to standard carried by the day / quality / frame cuts. */
export interface GapFields {
  gap_kg: number | null;
  /** Share of the period's total gap, %. */
  gap_share_pct: number | null;
}

export interface TrendQualityRow extends TargetFields, GapFields {
  item_id: number | null;
  quality: string;
  kg: number;
  share_pct: number | null;
  days: number;
  frames: number;
  frame_shifts: number;
  doffs: number;
  kg_per_frame_shift: number | null;
  avg_doff_kg: number | null;
}

export type FrameStatus = "low" | "watch" | "ok";

export interface TrendFrameRow extends TargetFields, GapFields {
  machine_id: number | null;
  frame: string | null;
  kg: number;
  days: number;
  frame_shifts: number;
  doffs: number;
  kg_per_frame_shift: number | null;
  /** Expected for the frame's own quality mix (each quality's period average,
   * weighted by the frame-shifts the frame ran on it). */
  expected_kg_per_frame_shift: number | null;
  vs_peers_pct: number | null;
  status: FrameStatus | null;
  qualities: string[];
  /** Mean and spread of the frame's per-frame-shift achievement %. */
  mean_ach_pct: number | null;
  ach_sd: number | null;
}

/** One cut of the loss analysis (a shift, a weekday, a hands type, a spinner). */
export interface LossCutRow extends TargetFields, GapFields {
  days: number;
  frames: number;
  frame_shifts: number;
  kg: number;
  kg_per_frame_shift: number | null;
}

export interface LossShiftRow extends LossCutRow {
  shift: string;
}

export interface LossWeekdayRow extends LossCutRow {
  weekday: string;
}

export interface LossHandsRow extends LossCutRow {
  kind: "regular" | "contract";
}

export interface LossSpinnerRow extends LossCutRow {
  spinner: string;
}

export interface BridgeStep {
  step: "capacity" | "idle_frames" | "idle_shifts" | "run_std" | "efficiency" | "actual";
  label: string;
  kg: number;
  kind: "total" | "loss";
}

export interface LossBridge {
  installed_frames: number;
  frames_ran: number;
  producing_days: number;
  shifts_per_day: number;
  std_per_frame_shift: number | null;
  capacity_frame_shifts: number;
  idle_frame_frame_shifts: number;
  idle_shift_frame_shifts: number;
  run_frame_shifts: number;
  utilization_pct: number | null;
  steps: BridgeStep[];
}

export interface LossHistogramRow {
  band: string;
  frame_shifts: number;
  kg: number;
}

export interface ShortFrameShiftRow {
  date: string;
  shift: string;
  frame: string | null;
  doffs: number;
  median_doffs: number;
  kg: number;
  std_kg: number | null;
  tgt_kg: number | null;
  ach_pct: number | null;
  gap_kg: number | null;
}

export interface WorstFrameShiftRow {
  date: string;
  shift: string;
  frame: string | null;
  qualities: string;
  spinner: string;
  doffs: number;
  kg: number;
  std_kg: number;
  tgt_kg: number | null;
  ach_pct: number | null;
  gap_kg: number;
}

export interface HeatFrameRow {
  frame: string | null;
  mean_ach_pct: number | null;
  /** The frame's total actual - standard over the period (negative = short). */
  gap_kg: number;
  /** date -> actual as % of standard (all shifts of the day together) — the
   * colour of the cell. */
  cells: Record<string, number | null>;
  /** date -> actual - standard in kg — the number printed in the cell. */
  gap_cells: Record<string, number | null>;
}

/** One frame-shift with a standard: a point on the actual-vs-standard scatter. */
export interface FrameShiftPoint {
  date: string;
  shift: string;
  frame: string | null;
  kg: number;
  std_kg: number;
  tgt_kg: number | null;
}

export interface LossBlock {
  gap_kg: number | null;
  /** null when a quality filter is on or the frame count is unknown. */
  bridge: LossBridge | null;
  ach_histogram: LossHistogramRow[];
  median_ach_pct: number | null;
  by_shift: LossShiftRow[];
  by_weekday: LossWeekdayRow[];
  hands: LossHandsRow[];
  spinners: LossSpinnerRow[];
  spinner_count: number;
  short_frame_shifts: {
    count: number;
    share_pct: number | null;
    gap_kg: number;
    rule: string;
    rows: ShortFrameShiftRow[];
  };
  worst_frame_shifts: WorstFrameShiftRow[];
  heat: { dates: string[]; frames: HeatFrameRow[] };
  frame_shift_points: FrameShiftPoint[];
  attention: AttentionRow[];
}

/** A frame flagged by the attention rules, with the reasons spelled out. */
export interface AttentionRow extends GapFields {
  frame: string | null;
  machine_id: number | null;
  status: FrameStatus | null;
  qualities: string[];
  frame_shifts: number;
  kg: number;
  kg_per_frame_shift: number | null;
  expected_kg_per_frame_shift: number | null;
  vs_peers_pct: number | null;
  std_kg: number | null;
  std_kg_per_frame_shift: number | null;
  std_ach_pct: number | null;
  mean_ach_pct: number | null;
  ach_sd: number | null;
  short_count: number;
  worst_count: number;
  reasons: string[];
}

export interface TrendOptions {
  shifts: string[];
  frames: string[];
}

export interface TrendPeriod {
  date_from: string;
  date_to: string;
  producing_days: number;
  production_kg: number;
  avg_kg_per_day: number | null;
  frame_shifts: number;
  kg_per_frame_shift: number | null;
  frames_avg_per_day: number | null;
}

export interface TrendSummary extends TrendPeriod, TargetFields {
  calendar_days: number;
  gap_kg: number | null;
  doffs: number;
  avg_doff_kg: number | null;
  best_day: { date: string; kg: number } | null;
  worst_day: { date: string; kg: number } | null;
  previous: TrendPeriod | null;
  /** % change vs the previous period, null when either side is blank. */
  delta: {
    production_kg: number | null;
    avg_kg_per_day: number | null;
    kg_per_frame_shift: number | null;
    frames_avg_per_day: number | null;
  } | null;
}

export interface TrendMeta {
  co_id?: number;
  branch_id?: number;
  date_from?: string;
  date_to?: string;
  item_id?: number | null;
  shift?: string | null;
  frame?: string | null;
  notes?: string[];
}

export interface SpinningTrendData {
  summary: TrendSummary;
  days: TrendDayRow[];
  day_quality: TrendDayQualityRow[];
  day_shift: TrendDayShiftRow[];
  qualities: TrendQualityRow[];
  frames: TrendFrameRow[];
  loss: LossBlock;
  options: TrendOptions;
  meta?: TrendMeta;
}

export interface SpinningTrendParams {
  coId: number;
  branchId: number;
  dateFrom: string;
  dateTo: string;
  /** Global filters — every chart, table and the previous period use them. */
  itemId?: number | null;
  shift?: string | null;
  frame?: string | null;
}

const EMPTY_LOSS: LossBlock = Object.freeze({
  gap_kg: null,
  bridge: null,
  ach_histogram: [],
  median_ach_pct: null,
  by_shift: [],
  by_weekday: [],
  hands: [],
  spinners: [],
  spinner_count: 0,
  short_frame_shifts: { count: 0, share_pct: null, gap_kg: 0, rule: "", rows: [] },
  worst_frame_shifts: [],
  heat: { dates: [], frames: [] },
  frame_shift_points: [],
  attention: [],
}) as LossBlock;

export async function fetchSpinningTrend(
  params: SpinningTrendParams,
): Promise<SpinningTrendData> {
  const qs = new URLSearchParams({
    co_id: String(params.coId),
    branch_id: String(params.branchId),
    date_from: params.dateFrom,
    date_to: params.dateTo,
  });
  if (params.itemId != null) qs.set("item_id", String(params.itemId));
  if (params.shift) qs.set("shift", params.shift);
  if (params.frame) qs.set("frame", params.frame);
  const res = await fetchWithCookie<{ data: Partial<SpinningTrendData> }>(
    `${apiRoutesPortalMasters.JP_SPINNING_PRODUCTION_TREND}?${qs.toString()}`,
  );
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to load the spinning production trend");
  }
  const d = res.data.data;
  if (!d.summary) throw new Error("Spinning production trend: malformed response");
  // A section the server omits must not blow up the charts that map over it.
  return {
    summary: d.summary,
    days: d.days ?? [],
    day_quality: d.day_quality ?? [],
    day_shift: d.day_shift ?? [],
    qualities: d.qualities ?? [],
    frames: d.frames ?? [],
    loss: d.loss ?? EMPTY_LOSS,
    options: d.options ?? { shifts: [], frames: [] },
    meta: d.meta,
  };
}
