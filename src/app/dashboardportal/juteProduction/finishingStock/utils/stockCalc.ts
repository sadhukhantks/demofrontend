import type { FinishingStockQuality, FinishingStockRow } from "@/utils/finishingStockService";

export { todayISO } from "../../finishing/_shared/finishingConfig";

/** The scale the mill's stock sheet prints MT and kg at. */
export const MT_SCALE = 3;

/** Round to the printed scale so float addition never leaks 0.30000000000000004. */
export function round3(value: number): number {
  const factor = 10 ** MT_SCALE;
  return Number.isFinite(value) ? Math.round(value * factor) / factor : 0;
}

/** kg -> MT at the printed scale. 16002 kg = 16.002 MT. */
export function kgToMt(kg: number | null | undefined): number {
  return round3(Number(kg) / 1000);
}

/**
 * Total kg for one counted line — mirrors the backend formula exactly
 * (`wt_kg` when weighed, else `qty * wt_per_unit_kg`) so grid, footer and
 * report agree without a round-trip.
 */
export function lineTotalKg(
  row: Pick<FinishingStockRow, "bucket" | "qty" | "wt_per_unit_kg" | "wt_kg">,
): number {
  if (row.bucket === "LOOSE") {
    const kg = Number(row.wt_kg);
    return Number.isFinite(kg) ? round3(kg) : 0;
  }
  const qty = Number(row.qty);
  const per = Number(row.wt_per_unit_kg);
  if (!Number.isFinite(qty) || !Number.isFinite(per)) return 0;
  return round3(qty * per);
}

/**
 * kg per counted unit for a LOOSE line, from the quality's derived standards:
 * CUTS -> cut_wt_kg, BDL -> bundle_wt_kg, PCS -> bag_wt_kg. null when the
 * quality cannot resolve one (or the UoM is not a counted unit) — the operator
 * then types the weighed figure, which always wins.
 */
export function unitWtFor(
  quality:
    | Pick<FinishingStockQuality, "cut_wt_kg" | "bag_wt_kg" | "bundle_wt_kg">
    | null
    | undefined,
  uom: string,
): number | null {
  if (!quality) return null;
  const kg =
    uom === "CUTS"
      ? quality.cut_wt_kg
      : uom === "BDL"
        ? quality.bundle_wt_kg
        : uom === "PCS"
          ? quality.bag_wt_kg
          : null;
  return typeof kg === "number" && Number.isFinite(kg) ? kg : null;
}

/**
 * The Weight (kg) the form prefills for a counted lot: count x unit kg at the
 * printed scale. "" when there is no standard or no usable count, so the field
 * is simply left for the operator.
 */
export function prefillWtKg(count: string | number, unitWt: number | null): string {
  if (unitWt == null) return "";
  // A cleared field is "not counted yet", not zero — Number("") would say 0.
  const n = typeof count === "string" && count.trim() === "" ? Number.NaN : Number(count);
  if (!Number.isFinite(n) || n < 0) return "";
  return String(round3(n * unitWt));
}

export interface GroupedRows {
  bale: {
    /** owner_co_id NULL — the company doing the count. */
    own: FinishingStockRow[];
    /** One entry per foreign owner, keyed by its display name. */
    others: Record<string, FinishingStockRow[]>;
  };
  loose: { hessian: FinishingStockRow[]; sacking: FinishingStockRow[] };
}

/**
 * Split a day's rows the way the stock sheet is laid out: bale blocks per
 * owner (own first), loose split Hessian / Sacking. Input order is preserved
 * inside every group — the backend already orders rows the way the sheet reads.
 */
export function groupRows(rows: ReadonlyArray<FinishingStockRow>): GroupedRows {
  const grouped: GroupedRows = {
    bale: { own: [], others: {} },
    loose: { hessian: [], sacking: [] },
  };
  rows.forEach((r) => {
    if (r.bucket === "BALE") {
      if (r.owner_co_id == null) {
        grouped.bale.own.push(r);
        return;
      }
      const name = r.owner_co_name ?? `Company #${r.owner_co_id}`;
      (grouped.bale.others[name] ??= []).push(r);
      return;
    }
    if (r.quality_type === 2) grouped.loose.sacking.push(r);
    else grouped.loose.hessian.push(r);
  });
  return grouped;
}

export interface SectionTotals {
  /** Bales counted — BALE lines only; a loose section reports 0. */
  bales: number;
  kg: number;
  mt: number;
}

export function sectionTotals(rows: ReadonlyArray<FinishingStockRow>): SectionTotals {
  let bales = 0;
  let kg = 0;
  rows.forEach((r) => {
    if (r.bucket === "BALE") bales += Number(r.qty) || 0;
    kg += lineTotalKg(r);
  });
  return { bales: round3(bales), kg: round3(kg), mt: kgToMt(kg) };
}

export interface FooterTotals {
  baleOwnMt: number;
  baleOthersMt: number;
  looseMt: number;
  totalMt: number;
}

export function footerTotals(rows: ReadonlyArray<FinishingStockRow>): FooterTotals {
  let ownKg = 0;
  let othersKg = 0;
  let looseKg = 0;
  rows.forEach((r) => {
    const kg = lineTotalKg(r);
    if (r.bucket === "LOOSE") looseKg += kg;
    else if (r.owner_co_id == null) ownKg += kg;
    else othersKg += kg;
  });
  return {
    baleOwnMt: kgToMt(ownKg),
    baleOthersMt: kgToMt(othersKg),
    looseMt: kgToMt(looseKg),
    totalMt: kgToMt(ownKg + othersKg + looseKg),
  };
}

export function formatMt(value: number | null | undefined): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(MT_SCALE) : "";
}

export const WORK_BY_LABELS: Record<number, string> = { 0: "Dept", 1: "Contract" };

/** Section heading for a quality_type, used by the grid's group column. */
export function qualityTypeLabel(qualityType: number): string {
  return qualityType === 2 ? "Sacking" : "Hessian";
}
