/**
 * Pure helpers of the FE-2 tabs (no React, no fetch): dispatch batches and
 * the printable dispatch register, the stage summary bars and totals, the
 * monthly trend labels. Covered by _tabsUtils.test.ts.
 */

import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import type { PrintSection } from "@/components/reports/printReport";
import type {
  LaDispatchRow,
  LaSetup,
  LaStageSummary,
  LaStageSummaryDept,
  LaTrendRow,
} from "@/utils/longAbsenteeismService";
import { stageColor, stageLabel, stageOrder, type ChipColor } from "./_utils";

// ─── Dispatch ────────────────────────────────────────────────────────

export interface DispatchBatch {
  /** null = letters issued one by one (no batch). */
  batchRef: string | null;
  rows: LaDispatchRow[];
}

/** Rows grouped by batch, in the order the batches first appear (the API sends newest first). */
export function groupByBatch(rows: ReadonlyArray<LaDispatchRow>): DispatchBatch[] {
  const map = new Map<string, DispatchBatch>();
  for (const r of rows) {
    const key = r.batch_ref ?? "";
    let g = map.get(key);
    if (!g) {
      g = { batchRef: r.batch_ref ?? null, rows: [] };
      map.set(key, g);
    }
    g.rows.push(r);
  }
  return [...map.values()];
}

/** "Batch B20261011-1030-5" / "Issued one by one". */
export function batchTitle(batchRef: string | null): string {
  return batchRef ? `Batch ${batchRef}` : "Issued one by one";
}

/** A letter's sent state in words: the sent date, or "Not sent". */
export function sentText(sentDate: string | null | undefined): string {
  return sentDate ? fmtDate(sentDate) : "Not sent";
}

/** Stage label of a dispatch row ("1st warning" …), the code when the label is missing. */
export function dispatchStageText(row: Pick<LaDispatchRow, "stage_label" | "stage_code">): string {
  return row.stage_label || row.stage_code;
}

export const DISPATCH_PRINT_COLUMNS = Object.freeze([
  { header: "SL" },
  { header: "Batch" },
  { header: "EB No" },
  { header: "Name" },
  { header: "Address" },
  { header: "Stage" },
  { header: "Issue date" },
  { header: "A.D. no" },
]);

/** The dispatch register: one print section per batch (batch, EB, name, address, stage, issue date, A.D. no). */
export function dispatchPrintSections(rows: ReadonlyArray<LaDispatchRow>): PrintSection[] {
  return groupByBatch(rows).map((g) => ({
    title: batchTitle(g.batchRef),
    subtitle: `${g.rows.length} letter${g.rows.length === 1 ? "" : "s"}`,
    columns: DISPATCH_PRINT_COLUMNS.map((c) => ({ ...c, align: c.header === "SL" ? ("right" as const) : undefined })),
    rows: g.rows.map((r, i) => [
      i + 1,
      r.batch_ref ?? "",
      r.emp_code ?? "",
      r.emp_name ?? "",
      r.address ?? "",
      dispatchStageText(r),
      fmtDate(r.issue_date),
      r.ad_no ?? "",
    ]),
  }));
}

// ─── Stage summary ───────────────────────────────────────────────────

export interface StageBar {
  code: string;
  label: string;
  count: number;
  /** Share of the card's live cases, 0..100. */
  pct: number;
  color: ChipColor;
}

/** Every stage code in ladder order: /setup's stages, then any extra code the counts carry. */
function stageCodes(setup: Pick<LaSetup, "stages"> | null | undefined, counts: Record<string, number>): string[] {
  const fromSetup = setup?.stages?.length ? [...setup.stages].sort((a, b) => a.order - b.order).map((s) => s.code) : [];
  const extra = Object.keys(counts).filter((c) => !fromSetup.includes(c));
  return [...fromSetup, ...extra.sort((a, b) => stageOrder(setup, a) - stageOrder(setup, b))];
}

/**
 * One bar per stage for a department card, in ladder order. Zero stages are
 * left out unless `includeZero` (the totals card shows the whole ladder); a
 * zero "Struck off" is always left out (struck-off cases are closed, so the
 * live count is normally nothing).
 */
export function stageBars(
  counts: Record<string, number>,
  total: number,
  setup: Pick<LaSetup, "stages"> | null | undefined,
  includeZero = false,
): StageBar[] {
  const denom = total > 0 ? total : 0;
  return stageCodes(setup, counts).flatMap((code) => {
    const count = counts[code] ?? 0;
    if (count === 0 && (!includeZero || code === "STRUCK_OFF")) return [];
    return [
      {
        code,
        label: stageLabel(setup, code),
        count,
        pct: denom ? Math.min(100, Math.round((count / denom) * 1000) / 10) : 0,
        color: stageColor(code),
      },
    ];
  });
}

/** All departments added up (the first card). */
export function stageSummaryTotals(summary: Pick<LaStageSummary, "by_dept">): LaStageSummaryDept {
  const counts: Record<string, number> = {};
  let parked = 0;
  let total = 0;
  for (const d of summary.by_dept) {
    for (const [code, n] of Object.entries(d.counts)) counts[code] = (counts[code] ?? 0) + n;
    parked += d.parked;
    total += d.total_live;
  }
  return { dept_desc: "All departments", counts, parked, total_live: total };
}

// ─── Monthly trend ───────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10" -> "Oct 26" (axis ticks) or "Oct 2026" (long); the raw value when it is not YYYY-MM. */
export function monthLabel(month: string, long = false): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return month;
  return `${MONTHS[idx]} ${long ? m[1] : m[1].slice(2)}`;
}

export type TrendKey = "opened" | "struck_off" | "rejoined" | "other_exits";

export const TREND_SERIES: ReadonlyArray<{ key: TrendKey; label: string }> = Object.freeze([
  { key: "opened", label: "Opened" },
  { key: "struck_off", label: "Struck off" },
  { key: "rejoined", label: "Rejoined" },
  { key: "other_exits", label: "Other exits" },
]);

/** Sum of each series over the months shown. */
export function trendTotals(rows: ReadonlyArray<LaTrendRow>): Record<TrendKey, number> {
  const out: Record<TrendKey, number> = { opened: 0, struck_off: 0, rejoined: 0, other_exits: 0 };
  for (const r of rows) {
    for (const s of TREND_SERIES) out[s.key] += r[s.key];
  }
  return out;
}

// ─── Templates ───────────────────────────────────────────────────────

/** "2026-10-11T14:05:09" -> "11-10-2026 14:05"; "" for null; the raw value when it is not a date-time. */
export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(value);
  if (!m) return fmtDate(value);
  return `${fmtDate(m[1])} ${m[2]}`;
}
