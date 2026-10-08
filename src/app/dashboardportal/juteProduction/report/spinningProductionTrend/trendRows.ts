/**
 * Pure helpers for the Spinning Production Trend page — the server sends the
 * cuts long (one row per day x quality, day x shift, ...), the charts and the
 * pivot read them wide. No React, no fetch: everything here is unit-tested.
 */

import type { KpiState } from "../dailyProductionReport/_components/DprPieces";
import {
  OTHER_COLOR,
  QUALITY_SLOT_CAP,
  SERIES_COLORS,
  SHIFT_LABEL,
  SHIFT_ORDER,
  STD_COLOR,
  TGT_COLOR,
} from "./chartPalette";
import type {
  TrendDayQualityRow,
  TrendDayShiftRow,
  TrendQualityRow,
} from "./_service";

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

/** One colour slot per quality, assigned in period-volume order; qualities
 * past the cap share the grey "Other" slot. */
export interface QualitySlot extends SeriesDef {
  itemIds: (number | null)[];
}

export const OTHER_KEY = "other";

export function qualityKey(itemId: number | null | undefined): string {
  return itemId == null ? "null" : String(itemId);
}

/** Top qualities by kg keep their own slot; the tail folds into "Other". The
 * fold only happens when there is more than ONE quality past the cap — a lone
 * 8th quality just takes the 8th slot. */
export function qualitySlots(qualities: TrendQualityRow[]): QualitySlot[] {
  const ordered = [...qualities].sort((a, b) => b.kg - a.kg);
  const fold = ordered.length > QUALITY_SLOT_CAP + 1;
  const own = fold ? ordered.slice(0, QUALITY_SLOT_CAP) : ordered;
  const slots: QualitySlot[] = own.map((q, i) => ({
    key: qualityKey(q.item_id),
    label: q.quality,
    color: SERIES_COLORS[i],
    itemIds: [q.item_id],
  }));
  if (fold) {
    slots.push({
      key: OTHER_KEY,
      label: `Other (${ordered.length - QUALITY_SLOT_CAP})`,
      color: OTHER_COLOR,
      itemIds: ordered.slice(QUALITY_SLOT_CAP).map((q) => q.item_id),
    });
  }
  return slots;
}

function slotIndex(slots: QualitySlot[]): Map<string, number> {
  const idx = new Map<string, number>();
  slots.forEach((s, i) => s.itemIds.forEach((id) => idx.set(qualityKey(id), i)));
  return idx;
}

export interface StackedSeries extends SeriesDef {
  data: number[];
}

export interface StackedChart {
  dates: string[];
  series: StackedSeries[];
}

/** Production by day stacked by quality (kg). A date with nothing for a
 * series gets 0 so the stack stays aligned. */
export function stackByQuality(
  dates: string[],
  rows: TrendDayQualityRow[],
  slots: QualitySlot[],
): StackedChart {
  const idx = slotIndex(slots);
  const dateIdx = new Map(dates.map((d, i) => [d, i]));
  const data = slots.map(() => dates.map(() => 0));
  rows.forEach((r) => {
    const s = idx.get(qualityKey(r.item_id));
    const d = dateIdx.get(r.date);
    if (s == null || d == null) return;
    data[s][d] = round2(data[s][d] + r.kg);
  });
  return {
    dates,
    series: slots.map((s, i) => ({ key: s.key, label: s.label, color: s.color, data: data[i] })),
  };
}

/** Production by day stacked by shift letter. Only shifts that occur are
 * drawn, but each keeps its fixed colour slot. */
export function stackByShift(dates: string[], rows: TrendDayShiftRow[]): StackedChart {
  const dateIdx = new Map(dates.map((d, i) => [d, i]));
  const present = new Set(rows.map((r) => r.shift));
  const shifts = SHIFT_ORDER.filter((s) => present.has(s));
  const data = shifts.map(() => dates.map(() => 0));
  rows.forEach((r) => {
    const s = shifts.indexOf(r.shift as (typeof SHIFT_ORDER)[number]);
    const d = dateIdx.get(r.date);
    if (s < 0 || d == null) return;
    data[s][d] = round2(data[s][d] + r.kg);
  });
  return {
    dates,
    series: shifts.map((sh, i) => ({
      key: sh,
      label: SHIFT_LABEL[sh] ?? sh,
      color: SERIES_COLORS[SHIFT_ORDER.indexOf(sh)],
      data: data[i],
    })),
  };
}

export interface LineSeries extends SeriesDef {
  data: (number | null)[];
  /** Standard and target lines are drawn dashed / dotted so the actual
   * (solid) is the one the eye lands on. */
  dash?: "dash" | "dot";
}

/** Which figure a line carries: the actual kg per frame-shift, the standard
 * or the target (where a target efficiency is entered). */
export type LineMeasure = "actual" | "std" | "tgt";

interface RatioParts {
  num: number;
  den: number;
}

/** Numerator / denominator of a measure on one day x quality row, so folded
 * qualities combine as a weighted figure (kg over frame-shifts), never an
 * average of averages. */
function measureParts(r: TrendDayQualityRow, measure: LineMeasure): RatioParts | null {
  if (measure === "actual") return r.frame_shifts ? { num: r.kg, den: r.frame_shifts } : null;
  const kg = measure === "std" ? r.std_kg : r.tgt_kg;
  const perFs = measure === "std" ? r.std_kg_per_frame_shift : r.tgt_kg_per_frame_shift;
  if (kg == null || !perFs) return null;
  return { num: kg, den: kg / perFs };
}

/** Kg per frame-shift (actual / standard / target) by quality over the days.
 * A day the quality did not run is null (a gap), never 0. */
export function qualityLines(
  dates: string[],
  rows: TrendDayQualityRow[],
  slots: QualitySlot[],
  measure: LineMeasure = "actual",
): LineSeries[] {
  const idx = slotIndex(slots);
  const dateIdx = new Map(dates.map((d, i) => [d, i]));
  const num = slots.map(() => dates.map(() => 0));
  const den = slots.map(() => dates.map(() => 0));
  rows.forEach((r) => {
    const s = idx.get(qualityKey(r.item_id));
    const d = dateIdx.get(r.date);
    if (s == null || d == null) return;
    const parts = measureParts(r, measure);
    if (!parts) return;
    num[s][d] += parts.num;
    den[s][d] += parts.den;
  });
  return slots.map((s, i) => ({
    key: s.key,
    label: s.label,
    color: s.color,
    data: dates.map((_, d) => (den[i][d] ? round1(num[i][d] / den[i][d]) : null)),
  }));
}

/** Actual / standard / target lines for ONE series over the days — the
 * small-multiple form (one quality, one shift, the whole mill). `tgt` is
 * left out when no day carries a target. */
export function actualStdTgtLines(
  label: string,
  color: string,
  actual: (number | null)[],
  std: (number | null)[],
  tgt: (number | null)[],
): LineSeries[] {
  const out: LineSeries[] = [
    { key: "actual", label: `${label} actual`, color, data: actual },
    { key: "std", label: "Standard", color: STD_COLOR, data: std, dash: "dash" },
  ];
  if (tgt.some((v) => v != null)) {
    out.push({ key: "tgt", label: "Target", color: TGT_COLOR, data: tgt, dash: "dot" });
  }
  return out;
}

export type PivotMeasure =
  | "kg"
  | "kg_per_frame_shift"
  | "std_kg_per_frame_shift"
  | "std_kg"
  | "tgt_kg_per_frame_shift"
  | "tgt_kg"
  | "frame_shifts";

export const PIVOT_MEASURES: {
  value: PivotMeasure;
  label: string;
  /** Toggle label on phones. */
  short: string;
  decimals: number;
  /** Only offered when the data carries a target. */
  needsTarget?: boolean;
}[] = [
  { value: "kg", label: "Production (kg)", short: "Kg", decimals: 0 },
  { value: "kg_per_frame_shift", label: "Kg per frame-shift", short: "Kg / fr-shift", decimals: 1 },
  { value: "std_kg_per_frame_shift", label: "Std per frame-shift", short: "Std / fr-shift", decimals: 1 },
  { value: "std_kg", label: "Standard (kg)", short: "Std kg", decimals: 0 },
  { value: "tgt_kg_per_frame_shift", label: "Target per frame-shift", short: "Tgt / fr-shift", decimals: 1, needsTarget: true },
  { value: "tgt_kg", label: "Target (kg)", short: "Tgt kg", decimals: 0, needsTarget: true },
  { value: "frame_shifts", label: "Frame-shifts", short: "Fr-shifts", decimals: 0 },
];

export interface PivotRow {
  id: number;
  quality: string;
  /** Whole-period figure for the measure (kg, frame-shifts, or the period's
   * kg per frame-shift — never a sum of the daily ratios). */
  total: number | null;
  [dateField: string]: number | string | null;
}

export function pivotField(date: string): string {
  return `d_${date}`;
}

/** Day x quality pivot for one measure, one row per quality in volume order. */
export function pivotDayQuality(
  dates: string[],
  rows: TrendDayQualityRow[],
  qualities: TrendQualityRow[],
  measure: PivotMeasure,
): PivotRow[] {
  const byQuality = new Map<string, PivotRow>();
  const ordered = [...qualities].sort((a, b) => b.kg - a.kg);
  ordered.forEach((q, i) => {
    const row: PivotRow = { id: i, quality: q.quality, total: q[measure] ?? null };
    dates.forEach((d) => {
      row[pivotField(d)] = null;
    });
    byQuality.set(qualityKey(q.item_id), row);
  });
  rows.forEach((r) => {
    const row = byQuality.get(qualityKey(r.item_id));
    if (!row) return;
    row[pivotField(r.date)] = r[measure] ?? null;
  });
  return Array.from(byQuality.values());
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 26,594 / 72.9 — Indian grouping, fixed decimals, em-dash for blank. */
export function fmtKg(v: number | null | undefined, decimals = 0): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** "+4.2%" / "−3.1%" / "0.0%" / "—". */
export function fmtDelta(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) return "—";
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

/** Tile caption tone for a delta: direction x whether up is good. Within
 * ±0.5 % reads as flat (no tone). */
export function deltaState(pct: number | null | undefined, upIsGood = true): KpiState {
  if (pct == null || Number.isNaN(pct) || Math.abs(pct) < 0.5) return undefined;
  const up = pct > 0;
  return up === upIsGood ? "good" : "bad";
}

/** Tone for an actual against its standard: at or over good, within 5 %
 * warn, further bad. */
export function vsStdState(actual: number | null | undefined, std: number | null | undefined): KpiState {
  if (actual == null || std == null || !std) return undefined;
  const pct = (actual / std) * 100;
  if (pct >= 100) return "good";
  if (pct >= 95) return "warn";
  return "bad";
}

/** "07/10" for axis ticks (dd/mm) and "07 Oct" for tooltips. */
export function shortDate(d: string): string {
  return d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : d;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function longDate(d: string): string {
  if (d.length < 10) return d;
  const m = Number(d.slice(5, 7));
  return `${d.slice(8, 10)} ${MONTHS[m - 1] ?? d.slice(5, 7)}`;
}

/** Axis tick for kg: 26,000 -> "26k", 850 -> "850". */
export function fmtAxisKg(v: number): string {
  if (Math.abs(v) >= 1000) {
    const k = v / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return String(v);
}
