/**
 * Pure helpers for the Outstanding PO Position page — grid-row builders (with
 * the Grand Total lines and the kg → MT conversion), the supplier-filter
 * re-aggregation, PO-level checkbox selection, stale/overdue row tints, the
 * settlement-rule caption, number formatting and the three-sheet Excel export.
 * No React, no fetch: unit-tested in ./poPositionUtils.test.ts.
 */
import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import {
  buildReportSheet,
  type ReportExportHeader,
  type Worksheet,
} from "@/components/reports/exportExcel";
import type {
  BulkCloseResult,
  DetailGridRow,
  LorryFigures,
  LorryLabels,
  MtWeights,
  PoPositionBucket,
  PoPositionDetailRow,
  PoPositionQualityRow,
  PoPositionReport,
  PoPositionSupplierRow,
  PoGridRow,
  PoSettleRule,
  QualityGridRow,
  RecomputeResult,
  SupplierGridRow,
} from "./types";

export const GRAND_TOTAL_LABEL = "Grand Total";
export const GRAND_TOTAL_ID = "grand-total";

export const isGrandTotalRow = (row: { id: string }): boolean =>
  row.id === GRAND_TOTAL_ID;

const EMPTY_BUCKET: PoPositionBucket = Object.freeze({
  po_count: 0,
  overdue_pos: 0,
  ordered_qty: 0,
  received_qty: 0,
  balance_qty: 0,
  ordered_wt: 0,
  received_wt: 0,
  balance_wt: 0,
  balance_pct: null,
  ordered_value: 0,
  balance_value: 0,
  avg_rate: null,
  stale_pos: 0,
  settle_suggest_pos: 0,
  order_lorries: 0,
  received_lorries: 0,
  returned_lorries: 0,
  pending_lorries: 0,
  returned_weight: 0,
});

// ------------------------------------------------------------------- MT ----

/**
 * kg → whole metric tonnes (owner rule, 2026-09-25: every weight on the page
 * is MT rounded to 0). Display-only: the API keeps returning kg. null stays
 * null so "no weight share" rows still render blank.
 */
export function toMt(kg: number | null | undefined): number | null {
  if (kg == null || !Number.isFinite(Number(kg))) return null;
  return Math.round(Number(kg) / 1000);
}

/** The three bucket weights in MT, from a bucket's kg fields. */
export function bucketMt(b: {
  ordered_wt: number | null;
  received_wt: number | null;
  balance_wt: number | null;
}): MtWeights {
  return {
    ordered_mt: toMt(b.ordered_wt),
    received_mt: toMt(b.received_wt),
    balance_mt: toMt(b.balance_wt),
  };
}

// ---------------------------------------------------------------- lorries ----

/** Grid cell text for a lorry-and-weight pair: "5 (70)"; "" when both unknown. */
export function lorryLabel(lorries: number | null | undefined, wtMt: number | null | undefined): string {
  if (lorries == null && wtMt == null) return "";
  return `${lorries ?? "—"} (${wtMt == null ? "—" : inr0.format(wtMt)})`;
}

/** The four "n (MT)" strings; Returned is blank when there is nothing returned. */
export function lorryLabels(f: LorryFigures): LorryLabels {
  return {
    order_lw: lorryLabel(f.order_lorries, f.order_wt_mt),
    recv_lw: lorryLabel(f.received_lorries, f.received_wt_mt),
    returned_lw: f.returned_lorries ? lorryLabel(f.returned_lorries, f.returned_wt_mt) : "",
    bal_lw: lorryLabel(f.pending_lorries, f.pending_wt_mt),
  };
}

const EMPTY_LORRIES: LorryFigures = Object.freeze({
  order_lorries: 0,
  order_wt_mt: 0,
  received_lorries: 0,
  received_wt_mt: 0,
  returned_lorries: 0,
  returned_wt_mt: 0,
  pending_lorries: 0,
  pending_wt_mt: 0,
});

/**
 * Lorry counts and PO-level weights summed over the DISTINCT POs in a set of
 * item rows (a PO with several item rows repeats its PO-level figures, so it
 * must be counted once). Used for the supplier rows, the grand totals and the
 * KPI tiles; weights are returned in whole MT.
 */
export function lorrySummary(rows: readonly PoPositionDetailRow[]): LorryFigures {
  const seen = new Set<number>();
  let order = 0, orderKg = 0, recv = 0, recvKg = 0, ret = 0, retKg = 0, pend = 0, pendKg = 0;
  for (const r of rows) {
    if (seen.has(r.jute_po_id)) continue;
    seen.add(r.jute_po_id);
    order += r.vehicle_quantity ?? 0;
    orderKg += r.po_weight ?? 0;
    recv += r.received_lorries ?? 0;
    recvKg += r.po_received_weight ?? 0;
    ret += r.returned_lorries ?? 0;
    retKg += r.returned_weight ?? 0;
    pend += r.pending_lorries ?? 0;
    pendKg += r.po_pending_weight ?? 0;
  }
  return {
    order_lorries: order,
    order_wt_mt: toMt(orderKg),
    received_lorries: recv,
    received_wt_mt: toMt(recvKg),
    returned_lorries: ret,
    returned_wt_mt: toMt(retKg),
    pending_lorries: pend,
    pending_wt_mt: toMt(pendKg),
  };
}

/** Short UOM for the Qualities text: BALE → bl, DRUM → dr, …; unknown → lower-case as is. */
export function uomShort(uom: string | null | undefined): string {
  const u = (uom ?? "").trim().toUpperCase();
  const map: Record<string, string> = {
    BALE: "bl", BALES: "bl", DRUM: "dr", DRUMS: "dr", KG: "kg", KGS: "kg",
    QUINTAL: "qtl", QTL: "qtl", MT: "mt", TON: "mt", TONNE: "mt", BAG: "bg", BAGS: "bg",
  };
  return map[u] ?? u.toLowerCase();
}

const qty3 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

/**
 * "D TD 6 ×250 bl, D TD 5 ×83 bl" from a PO's item rows. The PO Detail grid
 * passes `"\n"` so each quality sits on its own line (grid cells wrap, the
 * Excel cell has wrapText, autotable breaks on newlines).
 */
export function formatQualities(
  items: readonly Pick<PoPositionDetailRow, "item_name" | "ordered_qty" | "po_uom">[],
  separator = ", ",
): string {
  return items
    .map((i) => {
      const name = i.item_name ?? "—";
      if (i.ordered_qty == null) return name;
      const uom = uomShort(i.po_uom);
      return `${name} ×${qty3.format(Number(i.ordered_qty))}${uom ? ` ${uom}` : ""}`;
    })
    .join(separator);
}

/** Newline between qualities — one per line in the grid, Excel and PDF cells. */
export const QUALITY_LINE_SEP = "\n";

// ------------------------------------------------------------ grid rows ----

/** Quality rows plus a Grand Total line carrying the report totals. */
export function buildQualityGridRows(
  rows: readonly PoPositionQualityRow[],
  totals: PoPositionBucket | null | undefined,
): QualityGridRow[] {
  if (!rows.length) return [];
  const out: QualityGridRow[] = rows.map((r) => ({
    ...r,
    ...bucketMt(r),
    id: `q-${r.item_id ?? "x"}-${r.item_name ?? ""}`,
  }));
  const t = totals ?? EMPTY_BUCKET;
  out.push({
    ...t,
    ...bucketMt(t),
    id: GRAND_TOTAL_ID,
    item_id: null,
    item_code: null,
    item_name: GRAND_TOTAL_LABEL,
  });
  return out;
}

/**
 * Supplier rows plus a Grand Total line carrying the report totals. The four
 * lorry-and-weight pairs (§11.2) are summed client-side over each supplier's
 * distinct POs from the detail rows; the total line uses the whole set.
 */
export function buildSupplierGridRows(
  rows: readonly PoPositionSupplierRow[],
  totals: PoPositionBucket | null | undefined,
  detail: readonly PoPositionDetailRow[] = [],
): SupplierGridRow[] {
  if (!rows.length) return [];
  const out: SupplierGridRow[] = rows.map((r, i) => {
    const lorries = detail.length
      ? lorrySummary(detail.filter((d) => (d.party_name ?? null) === (r.party_name ?? null)))
      : EMPTY_LORRIES;
    return {
      ...r,
      ...bucketMt(r),
      ...lorries,
      ...lorryLabels(lorries),
      id: `s-${i}-${r.party_name ?? ""}`,
    };
  });
  const t = totals ?? EMPTY_BUCKET;
  const all = detail.length ? lorrySummary(detail) : EMPTY_LORRIES;
  out.push({
    ...t,
    ...bucketMt(t),
    ...all,
    ...lorryLabels(all),
    id: GRAND_TOTAL_ID,
    party_name: GRAND_TOTAL_LABEL,
    oldest_po_date: null,
  });
  return out;
}

/** One grid row per PO item; no total line (the PO-level columns repeat). */
export function buildDetailGridRows(
  rows: readonly PoPositionDetailRow[],
): DetailGridRow[] {
  return rows.map((r) => ({
    ...r,
    ...bucketMt(r),
    id: `${r.jute_po_id}-${r.item_id ?? 0}`,
    overdue_label: r.overdue ? "Yes" : "",
    stale_label: r.stale ? "Yes" : "",
    settle_label: r.settle_suggest ? "Yes" : "",
    po_weight_mt: toMt(r.po_weight),
    po_received_mt: toMt(r.po_received_weight),
    po_pending_mt: toMt(r.po_pending_weight),
  }));
}

/**
 * One grid row per PO (§11.2): item rows grouped by `jute_po_id` in first-seen
 * order. PO-level figures are read off the first item row; `balance_value` /
 * `ordered_value` are summed over the items; Bal % is the PO-level
 * po_pending_weight / po_weight.
 */
export function buildPoGridRows(rows: readonly PoPositionDetailRow[]): PoGridRow[] {
  const groups = new Map<number, PoPositionDetailRow[]>();
  for (const r of rows) {
    const g = groups.get(r.jute_po_id);
    if (g) g.push(r);
    else groups.set(r.jute_po_id, [r]);
  }
  return [...groups.values()].map((items) => {
    const f = items[0];
    const lorries: LorryFigures = {
      order_lorries: f.vehicle_quantity,
      order_wt_mt: toMt(f.po_weight),
      received_lorries: f.received_lorries,
      received_wt_mt: toMt(f.po_received_weight),
      returned_lorries: f.returned_lorries ?? 0,
      returned_wt_mt: toMt(f.returned_weight ?? 0),
      pending_lorries: f.pending_lorries,
      pending_wt_mt: toMt(f.po_pending_weight),
    };
    const sum = (k: "ordered_value" | "balance_value"): number | null =>
      items.every((i) => i[k] == null) ? null : r2(items.reduce((a, i) => a + Number(i[k] ?? 0), 0));
    const stale = items.some((i) => Boolean(i.stale));
    const suggest = items.some((i) => Boolean(i.settle_suggest));
    return {
      ...lorries,
      ...lorryLabels(lorries),
      id: String(f.jute_po_id),
      jute_po_id: f.jute_po_id,
      po_label: f.po_label,
      po_date: f.po_date,
      age_days: f.age_days,
      due_date: f.due_date,
      overdue: f.overdue,
      overdue_label: f.overdue ? "Yes" : "",
      po_status: f.po_status,
      party_name: f.party_name,
      mukam: f.mukam,
      qualities: formatQualities(items, QUALITY_LINE_SEP),
      item_ids: items.map((i) => i.item_id),
      balance_pct:
        f.po_weight && f.po_pending_weight != null
          ? r2((Number(f.po_pending_weight) / Number(f.po_weight)) * 100)
          : null,
      ordered_value: sum("ordered_value"),
      balance_value: sum("balance_value"),
      mr_count: items.reduce((m, i) => Math.max(m, i.mr_count ?? 0), 0),
      last_receipt_date: items.reduce<string | null>(
        (m, i) => (i.last_receipt_date && (!m || i.last_receipt_date > m) ? i.last_receipt_date : m),
        null,
      ),
      days_since_receipt: f.days_since_receipt ?? null,
      stale,
      stale_label: stale ? "Yes" : "",
      settle_suggest: suggest,
      settle_label: suggest ? "Yes" : "",
    };
  });
}

/** PO rows narrowed to the drill-down filter (quality = any item of the PO). */
export function filterPoRows(
  rows: readonly PoGridRow[],
  filter: DetailFilter | null,
): PoGridRow[] {
  if (!filter) return [...rows];
  if (filter.kind === "quality") {
    return rows.filter((r) => r.item_ids.includes(filter.item_id));
  }
  return rows.filter((r) => (r.party_name ?? null) === (filter.party_name ?? null));
}

/** Drill-down from a quality or supplier row to its PO lines. */
export type DetailFilter =
  | { kind: "quality"; item_id: number | null; label: string }
  | { kind: "supplier"; party_name: string | null; label: string };

/** Detail rows narrowed to the drill-down filter (all rows when none). */
export function filterDetailRows<T extends Pick<PoPositionDetailRow, "item_id" | "party_name">>(
  rows: readonly T[],
  filter: DetailFilter | null,
): T[] {
  if (!filter) return [...rows];
  if (filter.kind === "quality") {
    return rows.filter((r) => r.item_id === filter.item_id);
  }
  return rows.filter((r) => (r.party_name ?? null) === (filter.party_name ?? null));
}

// ---------------------------------------------------------------- filter ----

/** Option for the Supplier dropdown. */
export interface SupplierOption {
  party_name: string;
}

/**
 * Suppliers offered in the filter bar — every supplier of the loaded report
 * (from the unfiltered `by_supplier`), de-duplicated, unnamed skipped, in
 * report order. The caller keeps these from the unfiltered load so the list
 * never shrinks after filtering.
 */
export function supplierOptions(
  rows: readonly Pick<PoPositionSupplierRow, "party_name">[],
): SupplierOption[] {
  const seen = new Set<string>();
  const out: SupplierOption[] = [];
  for (const r of rows) {
    const name = r.party_name?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ party_name: name });
  }
  return out;
}

interface Acc {
  ordered_qty: number;
  received_qty: number;
  balance_qty: number;
  ordered_wt: number;
  received_wt: number;
  balance_wt: number;
  ordered_value: number;
  balance_value: number;
  pos: Set<number>;
  overdue: Set<number>;
  stale: Set<number>;
  suggest: Set<number>;
  rateWt: number;
  rateBase: number;
  /** PO-level lorry figures, counted once per distinct PO (kg, not MT). */
  lorries: {
    order_lorries: number;
    received_lorries: number;
    returned_lorries: number;
    pending_lorries: number;
    returned_weight: number;
  };
}

const newAcc = (): Acc => ({
  ordered_qty: 0,
  received_qty: 0,
  balance_qty: 0,
  ordered_wt: 0,
  received_wt: 0,
  balance_wt: 0,
  ordered_value: 0,
  balance_value: 0,
  pos: new Set(),
  overdue: new Set(),
  stale: new Set(),
  suggest: new Set(),
  rateWt: 0,
  rateBase: 0,
  lorries: { order_lorries: 0, received_lorries: 0, returned_lorries: 0, pending_lorries: 0, returned_weight: 0 },
});

const SUM_FIELDS = [
  "ordered_qty",
  "received_qty",
  "balance_qty",
  "ordered_wt",
  "received_wt",
  "balance_wt",
  "ordered_value",
  "balance_value",
] as const;

function accumulate(a: Acc, d: PoPositionDetailRow): void {
  for (const f of SUM_FIELDS) {
    const v = d[f];
    if (v != null) a[f] += Number(v);
  }
  if (!a.pos.has(d.jute_po_id)) {
    a.lorries.order_lorries += d.vehicle_quantity ?? 0;
    a.lorries.received_lorries += d.received_lorries ?? 0;
    a.lorries.returned_lorries += d.returned_lorries ?? 0;
    a.lorries.pending_lorries += d.pending_lorries ?? 0;
    a.lorries.returned_weight += d.returned_weight ?? 0;
  }
  a.pos.add(d.jute_po_id);
  if (d.overdue) a.overdue.add(d.jute_po_id);
  if (d.stale) a.stale.add(d.jute_po_id);
  if (d.settle_suggest) a.suggest.add(d.jute_po_id);
  if (d.balance_wt && d.po_rate != null) {
    a.rateWt += Number(d.balance_wt) * Number(d.po_rate);
    a.rateBase += Number(d.balance_wt);
  }
}

const r2 = (v: number): number => Math.round(v * 100) / 100;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

function finish(a: Acc): PoPositionBucket {
  return {
    po_count: a.pos.size,
    overdue_pos: a.overdue.size,
    ordered_qty: r3(a.ordered_qty),
    received_qty: r3(a.received_qty),
    balance_qty: r3(a.balance_qty),
    ordered_wt: r3(a.ordered_wt),
    received_wt: r3(a.received_wt),
    balance_wt: r3(a.balance_wt),
    balance_pct: a.ordered_wt ? r2((a.balance_wt / a.ordered_wt) * 100) : null,
    ordered_value: r2(a.ordered_value),
    balance_value: r2(a.balance_value),
    avg_rate: a.rateBase ? r2(a.rateWt / a.rateBase) : null,
    stale_pos: a.stale.size,
    settle_suggest_pos: a.suggest.size,
    ...a.lorries,
  };
}

/**
 * Re-aggregate By Quality / By Supplier / totals from a set of detail rows —
 * the client-side counterpart of the backend's `build_po_position` (same
 * sums, PO and overdue counts as distinct POs, balance-weighted `avg_rate`,
 * `balance_pct` = balance / ordered). Used when the Supplier filter narrows
 * the report so every tab and the KPI strip describe the same rows.
 */
export function aggregateDetailRows(
  rows: readonly PoPositionDetailRow[],
): Pick<PoPositionReport, "by_quality" | "by_supplier" | "totals"> {
  const totals = newAcc();
  const byQuality = new Map<string, { key: Pick<PoPositionQualityRow, "item_id" | "item_code" | "item_name">; acc: Acc }>();
  const bySupplier = new Map<string, { party_name: string | null; oldest: string | null; acc: Acc }>();

  for (const d of rows) {
    accumulate(totals, d);

    const qk = `${d.item_id ?? "x"}|${d.item_name ?? ""}`;
    let q = byQuality.get(qk);
    if (!q) {
      q = { key: { item_id: d.item_id, item_code: d.item_code, item_name: d.item_name }, acc: newAcc() };
      byQuality.set(qk, q);
    }
    accumulate(q.acc, d);

    const sk = d.party_name ?? "";
    let s = bySupplier.get(sk);
    if (!s) {
      s = { party_name: d.party_name, oldest: null, acc: newAcc() };
      bySupplier.set(sk, s);
    }
    accumulate(s.acc, d);
    if (d.po_date && (s.oldest == null || d.po_date < s.oldest)) s.oldest = d.po_date;
  }

  const by_quality: PoPositionQualityRow[] = [...byQuality.values()]
    .map((q) => ({ ...q.key, ...finish(q.acc) }))
    .sort((a, b) => (b.balance_wt ?? 0) - (a.balance_wt ?? 0));
  const by_supplier: PoPositionSupplierRow[] = [...bySupplier.values()]
    .map((s) => ({ party_name: s.party_name, oldest_po_date: s.oldest, ...finish(s.acc) }))
    .sort((a, b) => (b.balance_wt ?? 0) - (a.balance_wt ?? 0));

  return { by_quality, by_supplier, totals: finish(totals) };
}

/**
 * The report as it should be shown for the current filter: the loaded report
 * when there is no supplier filter, otherwise its detail rows narrowed to the
 * supplier and the sections re-aggregated from them. A quality drill-down
 * only narrows the PO Detail tab, so it leaves the sections alone.
 */
export function applySupplierFilter(
  data: PoPositionReport,
  filter: DetailFilter | null,
): PoPositionReport {
  if (!filter || filter.kind !== "supplier") return data;
  const detail = filterDetailRows(data.detail, filter);
  return { ...data, detail, ...aggregateDetailRows(detail) };
}

// ------------------------------------------------------------- selection ----

/** Distinct PO ids present in a set of detail rows, in row order. */
export function distinctPoIds(rows: readonly Pick<DetailGridRow, "jute_po_id">[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const r of rows) {
    if (!seen.has(r.jute_po_id)) {
      seen.add(r.jute_po_id);
      out.push(r.jute_po_id);
    }
  }
  return out;
}

/**
 * Toggle one PO in the selection. Selection is PO-level: one PO can span
 * several item rows and ticking any of them ticks the whole PO. Returns a new
 * set (never mutates the input).
 */
export function togglePoSelection(
  selected: ReadonlySet<number>,
  poId: number,
): Set<number> {
  const next = new Set(selected);
  if (next.has(poId)) next.delete(poId);
  else next.add(poId);
  return next;
}

/**
 * Header checkbox: when every visible PO is selected, clear them; otherwise
 * select all visible POs (keeping any hidden ones already selected).
 */
export function toggleAllPoSelection(
  selected: ReadonlySet<number>,
  visibleRows: readonly Pick<DetailGridRow, "jute_po_id">[],
): Set<number> {
  const visible = distinctPoIds(visibleRows);
  const next = new Set(selected);
  const allSelected = visible.length > 0 && visible.every((id) => next.has(id));
  if (allSelected) visible.forEach((id) => next.delete(id));
  else visible.forEach((id) => next.add(id));
  return next;
}

/** Drop selected POs that are no longer in the (reloaded / re-filtered) rows. */
export function pruneSelection(
  selected: ReadonlySet<number>,
  rows: readonly Pick<DetailGridRow, "jute_po_id">[],
): Set<number> {
  const present = new Set(rows.map((r) => r.jute_po_id));
  return new Set([...selected].filter((id) => present.has(id)));
}

// ------------------------------------------------------------- row class ----

/**
 * Row tint for the PO Detail grid: red (`report-perf-low`) when the PO is
 * stale, amber (`report-perf-watch`) when it is merely past due, none otherwise.
 */
export function detailRowClass(row: Pick<DetailGridRow, "overdue" | "stale">): string {
  if (row.stale) return "report-perf-low";
  if (row.overdue) return "report-perf-watch";
  return "";
}

// --------------------------------------------------------------- caption ----

/** "half a lorry" / "a quarter of a lorry" / "one lorry" / "0.4 of a lorry". */
export function lorryFractionText(fraction: number): string {
  const f = Math.round(Number(fraction) * 10000) / 10000;
  if (f === 0.5) return "half a lorry";
  if (f === 0.25) return "a quarter of a lorry";
  if (f === 1) return "one lorry";
  return `${f} of a lorry`;
}

/**
 * One-line settlement rule under the title, e.g. "Settles when all lorries are
 * received or weight is within half a lorry of the PO · stale after 30 days
 * without receipt" (§11.1). Falls back to the rev-1 percentage wording while a
 * backend still sends `weight_tolerance_pct`; null when there is no rule.
 */
export function ruleCaption(rule: PoSettleRule | null | undefined): string | null {
  if (!rule) return null;
  let weight: string | null = null;
  if (rule.tolerance_lorry_fraction != null) {
    weight = `weight is within ${lorryFractionText(rule.tolerance_lorry_fraction)} of the PO`;
  } else if (rule.weight_tolerance_pct != null) {
    const pct = Math.round((100 - Number(rule.weight_tolerance_pct)) * 100) / 100;
    weight = `weight ≥ ${pct}% of PO`;
  }
  let settles: string;
  if (rule.lorry_rule_enabled && weight) settles = `Settles when all lorries are received or ${weight}`;
  else if (rule.lorry_rule_enabled) settles = "Settles when all lorries are received";
  else if (weight) settles = `Settles when ${weight}`;
  else settles = "Settles only by manual close";
  const days = Number(rule.stale_days);
  return `${settles} · stale after ${days} ${days === 1 ? "day" : "days"} without receipt`;
}

// -------------------------------------------------------------- summaries ----

/** Toast text for a bulk close: "Closed 3 POs; skipped 1 (13260: not live)". */
export function summarizeBulkClose(result: BulkCloseResult | null | undefined): string {
  const closed = result?.closed ?? [];
  const skipped = result?.skipped ?? [];
  const parts = [`Closed ${closed.length} PO${closed.length === 1 ? "" : "s"}`];
  if (skipped.length) {
    const why = skipped.map((s) => `${s.jute_po_id}: ${s.reason}`).join(", ");
    parts.push(`skipped ${skipped.length} (${why})`);
  }
  return parts.join("; ");
}

/** Toast text for a recompute: "closed 2, reopened 0". */
export function summarizeRecompute(result: RecomputeResult | null | undefined): string {
  return `closed ${result?.closed ?? 0}, reopened ${result?.reopened ?? 0}`;
}

// ---------------------------------------------------------------- format ----

const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Weight for the KPI tiles: takes the API's kg, shows whole MT with Indian
 * grouping ("1,533" for 1,533,252 kg). "—" when unknown.
 */
export function fmtWt(kg: number | null | undefined): string {
  const mt = toMt(kg);
  if (mt == null) return "—";
  return inr0.format(mt);
}

/** Rupee amount for the KPI tiles ("₹ 17,19,78,763"). */
export function fmtInr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `₹ ${inr0.format(Number(value))}`;
}

/** Percentage with a % sign, 2 dp; "—" when null. */
export function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${inr2.format(Number(value))}%`;
}

// ---------------------------------------------------------------- export ----

/**
 * One-sheet workbook for the tab currently shown (PO-wise / Supplier-wise /
 * Quality-wise), built from the same column defs the export uses. exceljs +
 * file-saver load on demand so the spreadsheet library stays out of the page
 * bundle until someone exports.
 */
export async function exportPoPositionSheet<T extends GridValidRowModel>(
  sheet: { title: string; columns: GridColDef<T>[]; rows: T[] },
  header: ReportExportHeader,
  fileName: string,
): Promise<void> {
  const ExcelJS = await import("exceljs");
  const { saveAs } = await import("file-saver");

  const wb = new ExcelJS.Workbook();
  buildReportSheet(
    wb.addWorksheet(sheet.title) as unknown as Worksheet,
    sheet.columns,
    sheet.rows,
    header,
  );

  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`,
  );
}

/** The three tabs, in display order (§ owner 2026-09-25: PO Detail first). */
export const TABS = ["detail", "supplier", "quality"] as const;
export type TabKey = (typeof TABS)[number];

/** Section title / file slug for a tab — used by both downloads. */
export function tabExportName(tab: TabKey): { title: string; slug: string } {
  switch (tab) {
    case "detail":
      return { title: "PO-wise", slug: "po-wise" };
    case "supplier":
      return { title: "Supplier-wise", slug: "supplier-wise" };
    case "quality":
      return { title: "Quality-wise", slug: "quality-wise" };
  }
}
