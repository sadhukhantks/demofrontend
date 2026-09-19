/**
 * Doff Analysis service — GET /api/juteProductionReports/doff_analysis.
 *
 * One endpoint, two modes:
 *   mode=details — one date: per spell+frame doff summary, spell totals, the
 *                  2 kg weight bands and the raw doff list.
 *   mode=frames  — a date range (server caps it at 31 days): quality x shift
 *                  averages and the frame x date pivot, plus the per-frame
 *                  drill-down when `frame` is supplied.
 *
 * Kept beside the page rather than in utils/juteProductionReportService.ts:
 * this is the only consumer, and the shared file is being edited by the other
 * report ports at the same time.
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

/** Standard `data.meta` block of the ported jute production reports. */
export interface DoffMeta {
  co_id?: number;
  branch_id?: number;
  date_from?: string | null;
  date_to?: string | null;
  notes?: string[];
}

/**
 * Production target of a row and how the actual compares. The target is the
 * Spinning Production grid's "Tgt Prod" (Spinning Standards master + the day's
 * SQC count). All three are null when the standards behind it have not been
 * entered — blank on screen, and left out of every target total.
 */
export interface TargetFields {
  target_wt?: number | null;
  /** Actual - target: negative = short of target. */
  diff_wt?: number | null;
  /** Actual / target x 100. */
  achv_pct?: number | null;
}

export interface DoffSummaryRow extends TargetFields {
  spell_code: string | null;
  frame: string | null;
  item_id: number | null;
  quality_name: string | null;
  net_wt: number | null;
  num_doffs: number | null;
  avg_wt: number | null;
  max_wt: number | null;
  min_wt: number | null;
  last_doff_wt: number | null;
}

export interface DoffSpellTotalRow {
  spell_code: string | null;
  net_wt: number | null;
  /** Summed over the rows that HAVE a target only (see target_rows / rows). */
  target_wt?: number | null;
  diff_wt?: number | null;
  target_rows?: number;
  rows?: number;
}

export interface DoffWeightBandRow {
  band: string;
  frame_count: number | null;
  /** Count per spell code — the keys vary with the day, so the columns do too. */
  spell_breakup: Record<string, number> | null;
}

export interface DoffRawRow {
  frame: string | null;
  item_id: number | null;
  quality_name: string | null;
  spell_code: string | null;
  eb_label: string | null;
  net_wt: number | null;
}

export interface DoffDetailsData {
  doff_summary: DoffSummaryRow[];
  spell_totals: DoffSpellTotalRow[];
  weight_bands: DoffWeightBandRow[];
  raw_rows: DoffRawRow[];
  meta?: DoffMeta;
}

export interface QualityShiftAvgRow {
  quality_name: string | null;
  shift: string | null;
  avg_net_wt: number | null;
}

export interface FramePivotRow {
  frame: string | null;
  quality_name: string | null;
  /** date (YYYY-MM-DD) -> that day's weight normalised per shift. */
  per_date: Record<string, number | null> | null;
  avg: number | null;
  max: number | null;
  min: number | null;
}

export interface FrameDateShiftRow extends TargetFields {
  date: string | null;
  shift: string | null;
  net_wt: number | null;
}

export interface FrameDoffEventRow {
  date: string | null;
  shift: string | null;
  eb_label: string | null;
  num_doffs: number | null;
  production: number | null;
  avg_doff_wt: number | null;
  max_doff: number | null;
  min_doff: number | null;
}

export interface FrameDetail {
  date_shift: FrameDateShiftRow[];
  doff_events: FrameDoffEventRow[];
}

export interface FrameAnalysisData {
  quality_shift_avg: QualityShiftAvgRow[];
  frame_pivot: FramePivotRow[];
  /** Only populated when a frame is selected. */
  frame_detail?: FrameDetail | null;
  meta?: DoffMeta;
}

type QueryValue = string | number | null | undefined;

async function fetchDoffAnalysis<T>(params: Record<string, QueryValue>): Promise<T> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      qs.set(key, String(value));
    }
  }
  const res = await fetchWithCookie<{ data: T }>(
    `${apiRoutesPortalMasters.JP_DOFF_ANALYSIS}?${qs.toString()}`,
  );
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to load the doff analysis");
  }
  return res.data.data;
}

export function fetchDoffDetails(params: {
  coId: number;
  branchId: number;
  reportDate: string;
  spellId?: number | null;
  itemId?: number | null;
}): Promise<DoffDetailsData> {
  return fetchDoffAnalysis<Partial<DoffDetailsData>>({
    mode: "details",
    co_id: params.coId,
    branch_id: params.branchId,
    report_date: params.reportDate,
    spell_id: params.spellId,
    item_id: params.itemId,
  }).then((d) => ({
    // A section the server omits (nothing produced that day) must not blow up
    // the grid that maps over it.
    doff_summary: d.doff_summary ?? [],
    spell_totals: d.spell_totals ?? [],
    weight_bands: d.weight_bands ?? [],
    raw_rows: d.raw_rows ?? [],
    meta: d.meta,
  }));
}

export function fetchDoffFrames(params: {
  coId: number;
  branchId: number;
  dateFrom: string;
  dateTo: string;
  itemId?: number | null;
  /** Adds the per-frame drill-down to the response. */
  frame?: string | null;
}): Promise<FrameAnalysisData> {
  return fetchDoffAnalysis<Partial<FrameAnalysisData>>({
    mode: "frames",
    co_id: params.coId,
    branch_id: params.branchId,
    date_from: params.dateFrom,
    date_to: params.dateTo,
    item_id: params.itemId,
    frame: params.frame,
  }).then((d) => ({
    quality_shift_avg: d.quality_shift_avg ?? [],
    frame_pivot: d.frame_pivot ?? [],
    frame_detail: d.frame_detail
      ? {
          date_shift: d.frame_detail.date_shift ?? [],
          doff_events: d.frame_detail.doff_events ?? [],
        }
      : null,
    meta: d.meta,
  }));
}

/** DataGrid needs a row id and none of these rows carry a key — index will do,
 * the grids are rebuilt whole on every fetch. */
export function withId<T>(rows: T[]): (T & { id: number })[] {
  return rows.map((row, i) => ({ ...row, id: i }));
}
