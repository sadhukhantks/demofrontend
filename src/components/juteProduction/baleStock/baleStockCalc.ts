import type { ChipProps } from "@mui/material";
import type {
  BaleStockInvoice,
  BaleStockQuality,
  BaleStockRow,
  BaleStockSeries,
  BaleStockSeriesLine,
  BaleStockStatus,
  BaleStockSummaryLine,
  BaleSuggestPurpose,
} from "@/utils/baleStockService";

/**
 * Pure helpers for Bale Stock & Inspection — no React, no API. Everything the
 * grid, the range selector, the dialogs and the page agree on lives here so a
 * single vitest file pins the rules down (see `baleStockCalc.test.ts`).
 *
 * Spec: vowerp3be/docs/superpowers/specs/2026-10-12-bale-stock-inspection-design.md §6.
 */

/** Printed scale for kg and MT on the mill's stock sheets. */
export const WT_SCALE = 3;

/** Sales status ids whose invoice voids a despatch link (Rejected / Cancelled). */
export const VOID_INVOICE_STATUS_IDS: ReadonlyArray<number> = Object.freeze([4, 6]);

/** Sacking is the only quality type the inspection applies to (spec D3). */
export const SACKING_QUALITY_TYPE = 2;

export type ChipColor = NonNullable<ChipProps["color"]>;

/** Outcome of an action gate: `ok` plus the first blocking reason, if any. */
export interface ActionCheck {
  ok: boolean;
  reason: string | null;
}

// ---------------------------------------------------------------------------
// Dates & numbers
// ---------------------------------------------------------------------------

/**
 * Local ISO date (YYYY-MM-DD). `toISOString()` reads the UTC date, which is
 * still "yesterday" in IST before 05:30 and would reject a form's own default.
 * Kept local on purpose: `src/components` does not import from `src/app`.
 */
export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Round to the printed scale so float addition never leaks 0.30000000000000004. */
export function round3(value: number): number {
  const factor = 10 ** WT_SCALE;
  return Number.isFinite(value) ? Math.round(value * factor) / factor : 0;
}

/** Weighed kg for a cell — trailing zeros dropped ("290", "290.5"), "" when unknown. */
export function formatKg(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return String(Number(n.toFixed(WT_SCALE)));
}

/** MT at the fixed printed scale ("34.800"), "" when unknown. */
export function formatMt(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(WT_SCALE) : "";
}

export function qualityTypeLabel(qualityType: number): string {
  return qualityType === SACKING_QUALITY_TYPE ? "Sacking" : "Hessian";
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<BaleStockStatus, string> = {
  IN_STOCK: "In stock",
  INSPECTED: "Inspected",
  DESPATCHED: "Despatched",
  REPACKED: "Repacked",
};

const STATUS_COLORS: Record<BaleStockStatus, ChipColor> = {
  IN_STOCK: "default",
  INSPECTED: "success",
  DESPATCHED: "info",
  REPACKED: "secondary",
};

export function statusLabel(status: BaleStockStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/** MUI Chip colour for a status — theme palette keys, never raw colours. */
export function statusColor(status: BaleStockStatus): ChipColor {
  return STATUS_COLORS[status] ?? "default";
}

/**
 * A despatch link whose invoice was later Rejected / Cancelled. The server
 * still returns the link (so it can be undone or re-linked) but the bale
 * reads as back in stock. A despatch without an invoice is never void.
 */
export function isDespatchVoid(row: Pick<BaleStockRow, "despatch">): boolean {
  const d = row.despatch;
  if (!d || d.invoice_id == null) return false;
  return d.invoice_status_id != null && VOID_INVOICE_STATUS_IDS.includes(d.invoice_status_id);
}

/**
 * Despatched without an invoice (challan / delivery order / transfer / sample —
 * spec §7b). The bale is out of stock but can still be linked to its invoice
 * later; the server then attaches the invoice to this row ("relink").
 */
export function isNoInvoiceDespatch(row: Pick<BaleStockRow, "despatch">): boolean {
  const d = row.despatch;
  return d != null && d.invoice_id == null;
}

/** Bales in the selection already despatched without an invoice — the link dialog relinks them. */
export function noInvoiceDespatchCount(rows: ReadonlyArray<Pick<BaleStockRow, "despatch">>): number {
  return rows.filter(isNoInvoiceDespatch).length;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * `bale_entry_id`s of the loaded rows in `seriesId` whose bale number lies in
 * `[from, to]` (inclusive). A reversed range is swapped, not rejected — the
 * operator typing 650–612 means the same bales as 612–650.
 */
export function selectRange(
  rows: ReadonlyArray<BaleStockRow>,
  seriesId: number,
  from: number,
  to: number,
): number[] {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return [];
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return rows
    .filter((r) => r.bale_series_id === seriesId && r.bale_no >= lo && r.bale_no <= hi)
    .map((r) => r.bale_entry_id);
}

/** Distinct series among the loaded rows, by name — for a dialog that has no setup list. */
export function seriesOptionsFromRows(
  rows: ReadonlyArray<BaleStockRow>,
): Array<{ bale_series_id: number; series_name: string }> {
  const seen = new Map<number, string>();
  rows.forEach((r) => {
    if (!seen.has(r.bale_series_id)) {
      seen.set(r.bale_series_id, r.series_name ?? `Series #${r.bale_series_id}`);
    }
  });
  return [...seen.entries()]
    .map(([bale_series_id, series_name]) => ({ bale_series_id, series_name }))
    .sort((a, b) => a.series_name.localeCompare(b.series_name));
}

/** Latest press date among the rows — the earliest date an action on them may carry. */
export function latestPressDate(rows: ReadonlyArray<BaleStockRow>): string | null {
  let latest: string | null = null;
  rows.forEach((r) => {
    if (latest === null || r.tran_date > latest) latest = r.tran_date;
  });
  return latest;
}

/** "n bales · qualities: A, B" header line for the action dialogs. */
export function selectionSummary(rows: ReadonlyArray<BaleStockRow>): string {
  const names = [...new Set(rows.map((r) => r.item_name ?? `#${r.item_id ?? r.finishing_quality_id}`))];
  const bales = `${rows.length} ${rows.length === 1 ? "bale" : "bales"}`;
  return names.length ? `${bales} · qualities: ${names.join(", ")}` : bales;
}

// ---------------------------------------------------------------------------
// Action gates — mirror the backend's 400 matrix so the button is disabled
// with the same reason the server would give.
// ---------------------------------------------------------------------------

const NONE_SELECTED = "Select at least one bale";

function baleRef(r: BaleStockRow): string {
  return `bale ${r.bale_no}${r.series_name ? ` (${r.series_name})` : ""}`;
}

/** Mark inspected: every bale sacking AND status IN_STOCK. */
export function canInspect(rows: ReadonlyArray<BaleStockRow>): ActionCheck {
  if (rows.length === 0) return { ok: false, reason: NONE_SELECTED };
  for (const r of rows) {
    if (r.quality_type !== SACKING_QUALITY_TYPE) {
      return {
        ok: false,
        reason: `Only sacking bales are inspected — ${baleRef(r)} is hessian`,
      };
    }
    if (r.status === "INSPECTED") {
      return { ok: false, reason: `${capitalize(baleRef(r))} is already inspected` };
    }
    if (r.status !== "IN_STOCK") {
      return {
        ok: false,
        reason: `${capitalize(baleRef(r))} is not in stock (${statusLabel(r.status).toLowerCase()})`,
      };
    }
  }
  return { ok: true, reason: null };
}

/** Undo inspection: every bale currently INSPECTED. */
export function canUninspect(rows: ReadonlyArray<BaleStockRow>): ActionCheck {
  if (rows.length === 0) return { ok: false, reason: NONE_SELECTED };
  for (const r of rows) {
    if (r.status !== "INSPECTED") {
      return { ok: false, reason: `${capitalize(baleRef(r))} is not marked inspected` };
    }
  }
  return { ok: true, reason: null };
}

/**
 * Mark despatched / link to invoice: every bale in stock (IN_STOCK or
 * INSPECTED), or already despatched **without** an invoice (it can be linked
 * to one later). A bale despatched against an invoice or repacked blocks.
 */
export function canLink(rows: ReadonlyArray<BaleStockRow>): ActionCheck {
  if (rows.length === 0) return { ok: false, reason: NONE_SELECTED };
  for (const r of rows) {
    if (r.status === "IN_STOCK" || r.status === "INSPECTED") continue;
    if (r.status === "DESPATCHED" && isNoInvoiceDespatch(r)) continue;
    if (r.status === "DESPATCHED" && r.despatch) {
      return {
        ok: false,
        reason: `${capitalize(baleRef(r))} is already despatched against invoice #${
          r.despatch.invoice_no ?? r.despatch.invoice_id
        }`,
      };
    }
    return {
      ok: false,
      reason: `${capitalize(baleRef(r))} is not in stock (${statusLabel(r.status).toLowerCase()})`,
    };
  }
  return { ok: true, reason: null };
}

/** Unlink / undo despatch: every bale carries a despatch row (with or without an invoice, live or void). */
export function canUnlink(rows: ReadonlyArray<BaleStockRow>): ActionCheck {
  if (rows.length === 0) return { ok: false, reason: NONE_SELECTED };
  for (const r of rows) {
    if (!r.despatch) {
      return { ok: false, reason: `${capitalize(baleRef(r))} is not despatched` };
    }
  }
  return { ok: true, reason: null };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Sacking bales in the selection that carry no inspection marking. Despatch
 * without inspection is allowed (spec D9 — the mill ships uninspected sacking
 * against non-govt orders), so the link dialogs only warn with this count.
 */
export function uninspectedSackingCount(
  rows: ReadonlyArray<Pick<BaleStockRow, "quality_type" | "status" | "inspection">>,
): number {
  return rows.filter((r) => r.quality_type === SACKING_QUALITY_TYPE && r.status !== "INSPECTED" && !r.inspection)
    .length;
}

/** Series name then bale number — the order the despatch quick dialog lists bales in. */
function bySeriesAndBaleNo(a: BaleStockRow, b: BaleStockRow): number {
  const sa = a.series_name ?? `Series #${a.bale_series_id}`;
  const sb = b.series_name ?? `Series #${b.bale_series_id}`;
  return sa.localeCompare(sb) || a.bale_no - b.bale_no || a.bale_entry_id - b.bale_entry_id;
}

/**
 * Rows the despatch quick dialog offers: the in-stock rows first, then the
 * despatched rows that carry no invoice (so they can be linked from there),
 * each group sorted by series and bale number, duplicates and anything
 * `canLink` would refuse dropped.
 */
export function mergeLinkableRows(
  inStock: ReadonlyArray<BaleStockRow>,
  despatched: ReadonlyArray<BaleStockRow>,
): BaleStockRow[] {
  const seen = new Set<number>();
  const take = (rows: ReadonlyArray<BaleStockRow>): BaleStockRow[] =>
    rows
      .filter((r) => {
        if (seen.has(r.bale_entry_id) || !canLink([r]).ok) return false;
        seen.add(r.bale_entry_id);
        return true;
      })
      .sort(bySeriesAndBaleNo);
  const stock = take(inStock);
  const noInvoice = take(despatched.filter(isNoInvoiceDespatch));
  return [...stock, ...noInvoice];
}

// ---------------------------------------------------------------------------
// Despatch result → snackbar text (both pages say the same thing)
// ---------------------------------------------------------------------------

/** What POST /baleStock/despatch did, as the dialogs hand it back. */
export interface DespatchResult {
  /** Bales newly despatched / linked. */
  linked: number;
  /** Bales that were already despatched without an invoice and now carry this one. */
  relinked: number;
  /** Sacking bales despatched without an inspection marking (spec D9) — the page warns. */
  uninspectedSacking: number;
  /** "#<invoice_no>" (or "#<invoice_id>") of the invoice linked to; null when despatched without one. */
  invoiceRef: string | null;
}

function bales(n: number): string {
  return `${n} ${n === 1 ? "bale" : "bales"}`;
}

/**
 * "Marked n bales despatched" (no invoice) or "Linked n bales to invoice #x",
 * plus " · m already-despatched bales linked" and " · k sacking bales were
 * not inspected" when those counts are non-zero.
 */
export function despatchDoneMessage(r: DespatchResult): string {
  const parts: string[] = [];
  if (r.invoiceRef == null) {
    parts.push(`Marked ${bales(r.linked)} despatched`);
  } else if (r.linked === 0 && r.relinked > 0) {
    parts.push(`Linked ${r.relinked} already-despatched ${r.relinked === 1 ? "bale" : "bales"} to invoice ${r.invoiceRef}`);
  } else {
    parts.push(`Linked ${bales(r.linked)} to invoice ${r.invoiceRef}`);
    if (r.relinked > 0) {
      parts.push(`${r.relinked} already-despatched ${r.relinked === 1 ? "bale" : "bales"} linked`);
    }
  }
  if (r.uninspectedSacking > 0) {
    parts.push(
      `${r.uninspectedSacking} sacking ${r.uninspectedSacking === 1 ? "bale was" : "bales were"} not inspected`,
    );
  }
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface SummaryGroupTotals {
  bales: number;
  inspected: number;
  notInspected: number;
  mt: number;
}

export interface SummaryTotals {
  hessian: SummaryGroupTotals;
  sacking: SummaryGroupTotals;
  overall: SummaryGroupTotals;
}

function emptyGroup(): SummaryGroupTotals {
  return { bales: 0, inspected: 0, notInspected: 0, mt: 0 };
}

function addLine(g: SummaryGroupTotals, line: BaleStockSummaryLine): void {
  const bales = Number(line.bales) || 0;
  const inspected = Number(line.inspected_bales) || 0;
  g.bales += bales;
  g.inspected += inspected;
  g.notInspected += Math.max(bales - inspected, 0);
  g.mt += Number(line.wt_mt) || 0;
}

/** Bales / inspected / not inspected / MT per quality type and overall. */
export function summaryTotals(lines: ReadonlyArray<BaleStockSummaryLine>): SummaryTotals {
  const hessian = emptyGroup();
  const sacking = emptyGroup();
  const overall = emptyGroup();
  lines.forEach((line) => {
    addLine(line.quality_type === SACKING_QUALITY_TYPE ? sacking : hessian, line);
    addLine(overall, line);
  });
  [hessian, sacking, overall].forEach((g) => {
    g.mt = round3(g.mt);
  });
  return { hessian, sacking, overall };
}

// ---------------------------------------------------------------------------
// Series breakup (spec §7a) — sacking bales are numbered per consignee series
// ---------------------------------------------------------------------------

/** Display name of a series line — the series name, or "Series #id" when unnamed. */
export function seriesLineName(
  line: Pick<BaleStockSeriesLine, "bale_series_id" | "series_name">,
): string {
  const name = line.series_name?.trim();
  return name ? name : `Series #${line.bale_series_id}`;
}

/** Quality name of a summary line, or "#id" when the item is unnamed. */
function lineQualityName(line: BaleStockSummaryLine): string {
  return line.item_name ?? `#${line.item_id ?? line.finishing_quality_id}`;
}

/**
 * The sacking series lines (all other quality types dropped), sorted by series
 * name then quality name — the order every series table prints in.
 */
export function sackingSeriesLines(
  lines: ReadonlyArray<BaleStockSeriesLine>,
): BaleStockSeriesLine[] {
  return lines
    .filter((l) => l.quality_type === SACKING_QUALITY_TYPE)
    .sort(
      (a, b) =>
        seriesLineName(a).localeCompare(seriesLineName(b)) ||
        lineQualityName(a).localeCompare(lineQualityName(b)),
    );
}

export interface SeriesSummaryTotals extends SummaryGroupTotals {
  /** Σ total_kg over the lines (printed scale). */
  kg: number;
  /** Σ total_kg / Σ bales — null when nothing is in stock. */
  perBaleKg: number | null;
}

/**
 * Bales / inspected / not inspected / kg / MT over series lines, plus the
 * weighted per-bale kg. Pass the output of `sackingSeriesLines` for the
 * "Sacking total" row — the function itself does not filter by quality type.
 */
export function seriesSummaryTotals(
  lines: ReadonlyArray<BaleStockSeriesLine>,
): SeriesSummaryTotals {
  const g = emptyGroup();
  let kg = 0;
  lines.forEach((line) => {
    addLine(g, line);
    kg += Number(line.total_kg) || 0;
  });
  kg = round3(kg);
  return {
    ...g,
    mt: round3(g.mt),
    kg,
    perBaleKg: g.bales > 0 ? kg / g.bales : null,
  };
}

// ---------------------------------------------------------------------------
// Cell text
// ---------------------------------------------------------------------------

/** "date · ref · inspector" — blank parts dropped, "" when not inspected. */
export function inspectionCell(row: Pick<BaleStockRow, "inspection">): string {
  const i = row.inspection;
  if (!i) return "";
  return [i.inspection_date, i.inspection_ref, i.inspector]
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .join(" · ");
}

/**
 * "#no · date · party" for a despatch against an invoice; "No invoice · <reason
 * label> · <ref>" for one without (blank parts dropped); "" when not despatched.
 */
export function invoiceCell(row: Pick<BaleStockRow, "despatch">): string {
  const d = row.despatch;
  if (!d) return "";
  const parts =
    d.invoice_id == null
      ? ["No invoice", d.despatch_reason_label ?? d.despatch_reason, d.despatch_ref]
      : [`#${d.invoice_no ?? d.invoice_id}`, d.invoice_date, d.party_name];
  return parts.filter((p): p is string => typeof p === "string" && p.trim() !== "").join(" · ");
}

/** "bale no · date" of the REPACK that consumed this bale — "" when none. */
export function repackedByCell(row: Pick<BaleStockRow, "repacked_by">): string {
  const r = row.repacked_by;
  if (!r) return "";
  return `${r.bale_no} · ${r.tran_date}`;
}

/** Picker label for a candidate invoice: `#no · date · party · type`. */
export function invoiceLabel(inv: BaleStockInvoice): string {
  return [
    `#${inv.invoice_no ?? inv.invoice_id}`,
    inv.invoice_date,
    inv.party_name,
    inv.invoice_type_name,
  ]
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .join(" · ");
}

// ---------------------------------------------------------------------------
// Suggested pick by series + count (spec §7e) — BaleSuggestPicker
// ---------------------------------------------------------------------------

/**
 * `primary` keeps its order and wins on a duplicate id; rows of `extra` not
 * already present follow. The page and the quick dialogs gate their actions on
 * the rows they loaded plus the rows the suggest picker reported, which may
 * lie outside the loaded (filtered / capped) set.
 */
export function mergeRowsById(
  primary: ReadonlyArray<BaleStockRow>,
  extra: ReadonlyArray<BaleStockRow>,
): BaleStockRow[] {
  const seen = new Set(primary.map((r) => r.bale_entry_id));
  const out = [...primary];
  extra.forEach((r) => {
    if (!seen.has(r.bale_entry_id)) {
      seen.add(r.bale_entry_id);
      out.push(r);
    }
  });
  return out;
}

/**
 * Series the picker offers, by name. `inspect` keeps sacking series only
 * (spec D3). When `finishingQualityId` names a quality in `qualities`, the
 * list narrows to series of that quality's type whose `item_id` is null
 * (open to every quality of the type) or that quality's item; a quality the
 * setup does not know leaves every series of the right type.
 */
export function suggestSeriesOptions(
  series: ReadonlyArray<BaleStockSeries>,
  qualities: ReadonlyArray<BaleStockQuality>,
  purpose: BaleSuggestPurpose,
  finishingQualityId?: number | null,
): BaleStockSeries[] {
  let list = purpose === "inspect" ? series.filter((s) => s.quality_type === SACKING_QUALITY_TYPE) : [...series];
  const quality =
    finishingQualityId == null ? undefined : qualities.find((q) => q.finishing_quality_id === finishingQualityId);
  if (quality) {
    list = list.filter(
      (s) => s.quality_type === quality.quality_type && (s.item_id == null || s.item_id === quality.item_id),
    );
  }
  return list.sort((a, b) => a.series_name.localeCompare(b.series_name));
}

/** Σ net_wt / 1000 over the rows whose id is in `ids`, at the printed scale. */
export function selectedMt(
  rows: ReadonlyArray<Pick<BaleStockRow, "bale_entry_id" | "net_wt">>,
  ids: ReadonlyArray<number>,
): number {
  const wanted = new Set(ids);
  let kg = 0;
  rows.forEach((r) => {
    if (wanted.has(r.bale_entry_id)) kg += Number(r.net_wt) || 0;
  });
  return round3(kg / 1000);
}

/** "n selected of m available · x.xxx MT" — the line under the picker's grid. */
export function suggestCaption(selected: number, available: number, mt: number): string {
  return `${selected} selected of ${available} available · ${formatMt(mt)} MT`;
}

/** "Only m bales available in this series" when the asked count exceeds the eligible total; null otherwise. */
export function shortfallMessage(count: number, available: number): string | null {
  if (!Number.isFinite(count) || count <= available) return null;
  return `Only ${available} ${available === 1 ? "bale" : "bales"} available in this series`;
}
