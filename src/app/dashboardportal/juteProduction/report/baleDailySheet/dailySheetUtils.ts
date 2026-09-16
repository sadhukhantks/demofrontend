/**
 * Pure helpers for the Daily Bale Sheet (no React, no fetch): label maps, the
 * weigh-time formatter and the block → flat-row flattening the Excel export
 * uses. Unit-tested in ./dailySheetUtils.test.ts.
 */

import type { GridColDef } from "@mui/x-data-grid";
import type { SearchableOption } from "@/components/ui/SearchableOptionSelect";
import {
  QUALITY_TYPE_HESSIAN,
  QUALITY_TYPE_SACKING,
  type BaleDailySheet,
  type BaleEntryType,
  type DailySheetExportRow,
  type EntryTypeFilter,
} from "./types";

export const ENTRY_TYPE_OPTIONS: ReadonlyArray<SearchableOption<EntryTypeFilter>> = [
  { value: "ALL", label: "All" },
  { value: "PROD", label: "Production" },
  { value: "REPACK", label: "Repack" },
];

/** Query-param value for the entry-type filter; undefined = don't send. */
export function entryTypeParam(filter: EntryTypeFilter): BaleEntryType | undefined {
  return filter === "ALL" ? undefined : filter;
}

export function entryTypeLabel(type: BaleEntryType | string): string {
  if (type === "PROD") return "Prod";
  if (type === "REPACK") return "Repack";
  return type;
}

/** 1 → Hessian, 2 → Sacking (same codes as jute_prod_finishing_quality). */
export function qualityTypeLabel(qualityType: number | null | undefined): string {
  if (qualityType === QUALITY_TYPE_HESSIAN) return "Hessian";
  if (qualityType === QUALITY_TYPE_SACKING) return "Sacking";
  return "";
}

/**
 * "2026-09-16T10:23:45" → "10:23". The clock part is read straight off the
 * ISO string so a trailing "Z" / offset can't shift the mill's wall time
 * through the browser's timezone; anything else falls back to Date parsing.
 */
export function fmtWeighTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /[T ](\d{2}):(\d{2})/.exec(iso);
  if (m) return `${m[1]}:${m[2]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Fixed-decimal number; "" for null so blanks stay blank. */
export function fmtKg(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "";
  return Number(value).toFixed(digits);
}

/** Signed 2dp percentage ("+2.08" / "-0.59"); "" for null. */
export function fmtSignedPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "";
  const n = Number(value);
  const s = n.toFixed(2);
  return n > 0 ? `+${s}` : s;
}

const EMPTY_TEXT = {
  entry_type: "",
  series_name: "",
  bale_no: null,
  original_bale_no: null,
  spell_code: "",
  trolly_name: "",
  weigh_time: "",
} as const;

/**
 * Flattens the per-quality blocks into one row list for the Excel export,
 * adding a Quality (+ Type) column so every bale row is self-describing, and
 * appending each block's footer, the per-type totals and the overall total as
 * summary rows. The summary markers are the ones the shared report kit
 * recognises: "Total" in SL with the quality filled → group shade; the overall
 * row leads with "Grand Total" → grand shade.
 */
export function flattenDailySheetForExcel(data: BaleDailySheet): DailySheetExportRow[] {
  const out: DailySheetExportRow[] = [];
  for (const b of data.blocks) {
    const type = qualityTypeLabel(b.quality_type);
    for (const r of b.rows) {
      out.push({
        __id: `b${b.finishing_quality_id}:r${r.sl_no}:${r.bale_no}`,
        quality: b.item_name,
        type,
        sl_no: r.sl_no,
        entry_type: entryTypeLabel(r.entry_type),
        series_name: r.series_name,
        bale_no: r.bale_no,
        original_bale_no: r.original_bale_no,
        spell_code: r.spell_code ?? "",
        gross_wt: r.gross_wt,
        trolly_name: r.trolly_name ?? "",
        net_wt: r.net_wt,
        weigh_time: fmtWeighTime(r.weigh_time),
        avg_net: null,
        dev_pct: null,
      });
    }
    out.push({
      __id: `b${b.finishing_quality_id}:total`,
      quality: b.item_name,
      type,
      sl_no: "Total",
      ...EMPTY_TEXT,
      series_name: `PROD ${b.prod_bales} · REPACK ${b.repack_bales}`,
      gross_wt: b.total_gross,
      net_wt: b.total_net,
      avg_net: b.avg_net,
      dev_pct: b.dev_pct,
    });
  }
  for (const t of data.totals.by_type) {
    out.push({
      __id: `type:${t.quality_type}`,
      quality: qualityTypeLabel(t.quality_type).toUpperCase(),
      type: "",
      sl_no: "Total",
      ...EMPTY_TEXT,
      series_name: `PROD ${t.prod_bales} · REPACK ${t.repack_bales}`,
      gross_wt: t.total_gross,
      net_wt: t.total_net,
      avg_net: null,
      dev_pct: null,
    });
  }
  const o = data.totals.overall;
  out.push({
    __id: "overall",
    quality: "Grand Total",
    type: "",
    sl_no: "",
    ...EMPTY_TEXT,
    series_name: `PROD ${o.prod_bales} · REPACK ${o.repack_bales}`,
    gross_wt: o.total_gross,
    net_wt: o.total_net,
    avg_net: null,
    dev_pct: null,
  });
  return out;
}

/** Column defs driving the Excel export (header text + numeric formats). */
export const DAILY_SHEET_EXPORT_COLUMNS: GridColDef<DailySheetExportRow>[] = [
  { field: "quality", headerName: "Quality", width: 260 },
  { field: "type", headerName: "Type", width: 90 },
  { field: "sl_no", headerName: "SL", width: 70 },
  { field: "entry_type", headerName: "Entry Type", width: 90 },
  { field: "series_name", headerName: "Series", width: 160 },
  { field: "bale_no", headerName: "Bale No", width: 90, type: "number" },
  { field: "original_bale_no", headerName: "Orig. Bale No", width: 100, type: "number" },
  { field: "spell_code", headerName: "Spell", width: 70 },
  { field: "gross_wt", headerName: "Gross (kg)", width: 100, type: "number" },
  { field: "trolly_name", headerName: "Trolley", width: 90 },
  { field: "net_wt", headerName: "Net (kg)", width: 100, type: "number" },
  { field: "weigh_time", headerName: "Time", width: 70 },
  { field: "avg_net", headerName: "Avg Net (PROD)", width: 110, type: "number" },
  { field: "dev_pct", headerName: "Dev % vs Std", width: 100, type: "number" },
];
