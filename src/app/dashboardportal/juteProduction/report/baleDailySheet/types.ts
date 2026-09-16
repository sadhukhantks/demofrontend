/**
 * Daily Bale Sheet — response contract.
 * Mirrors `docs/bale-production-spec-sheet.md` §6.3
 * (`GET /api/juteProductionReports/bale_daily_sheet?co_id&branch_id&tran_date[&spell_id][&entry_type]`).
 * Every response is wrapped as `{ data: BaleDailySheet }`.
 */

/** PROD = fresh press output (BALE tab); REPACK = a bale opened and re-pressed
 * (REPACK tab) — same table, flagged, with `original_bale_no` filled (D2). */
export type BaleEntryType = "PROD" | "REPACK";

/** Quality type code shared with `jute_prod_finishing_quality.quality_type`. */
export const QUALITY_TYPE_HESSIAN = 1;
export const QUALITY_TYPE_SACKING = 2;

export interface DailySheetRow {
  sl_no: number;
  entry_type: BaleEntryType;
  series_name: string;
  bale_no: number;
  original_bale_no: number | null;
  spell_code: string | null;
  gross_wt: number;
  trolly_name: string | null;
  net_wt: number;
  /** ISO datetime — orders the sheet within a spell. */
  weigh_time: string;
}

export interface DailySheetBlock {
  finishing_quality_id: number;
  item_name: string;
  quality_type: number;
  std_bale_wt: number | null;
  packsheet_wt: number | null;
  rows: DailySheetRow[];
  prod_bales: number;
  repack_bales: number;
  total_gross: number;
  total_net: number;
  /** Average net weight over PROD rows only. */
  avg_net: number | null;
  /** (avg_net − std) / std × 100; null when no std or no PROD rows. */
  dev_pct: number | null;
}

export interface DailySheetTypeTotal {
  quality_type: number;
  prod_bales: number;
  repack_bales: number;
  total_gross: number;
  total_net: number;
}

export interface DailySheetOverall {
  prod_bales: number;
  repack_bales: number;
  total_gross: number;
  total_net: number;
}

export interface BaleDailySheet {
  tran_date: string;
  branch_name: string | null;
  blocks: DailySheetBlock[];
  totals: {
    by_type: DailySheetTypeTotal[];
    overall: DailySheetOverall;
  };
}

/** `spells` slice of `GET /api/baleProd/entry_setup?co_id&branch_id` (§6.3),
 * which is where this report's spell filter takes its options from. */
export interface BaleSpellOption {
  spell_id: number;
  spell_code: string;
  spell_name: string;
  working_hours: number | null;
}

export interface BaleEntrySetupSpells {
  spells: BaleSpellOption[];
}

/** Entry-type filter values: ALL is the UI's own sentinel (no `entry_type`
 * query param); PROD / REPACK are sent verbatim. */
export type EntryTypeFilter = "ALL" | BaleEntryType;

/** One line of the flattened Excel export: a bale row, a block footer, a
 * type total or the overall total. Text columns hold "" where a row has no
 * value; numeric columns hold null so the sheet's number format still applies. */
export interface DailySheetExportRow {
  __id: string;
  quality: string;
  type: string;
  sl_no: number | string;
  entry_type: string;
  series_name: string;
  bale_no: number | null;
  original_bale_no: number | null;
  spell_code: string;
  gross_wt: number | null;
  trolly_name: string;
  net_wt: number | null;
  weigh_time: string;
  avg_net: number | null;
  dev_pct: number | null;
}
