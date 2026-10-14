/**
 * Pure helpers for the Bale Register page (no React, no fetch): filter option
 * lists, the date-range check, group / despatch labels and the register →
 * flat-row projection the Excel export uses. Unit-tested in
 * ./registerShape.test.ts so page.tsx stays presentation only.
 *
 * Contract: spec 2026-10-12-bale-stock-inspection-design.md §7c
 * (`GET /api/juteProductionReports/bale_register`).
 */

import type { GridColDef } from "@mui/x-data-grid";
import type { SearchableOption } from "@/components/ui/SearchableOptionSelect";
import type { FinishingQualityType } from "@/utils/finishingStockService";
import type {
  BaleRegisterDay,
  BaleRegisterDespatchDetail,
  BaleRegisterGroup,
  BaleRegisterGroupBy,
  BaleRegisterPeriod,
  BaleRegisterReport,
} from "@/utils/juteProductionReportService";

// ------------------------------------------------------------ filters ----

/** Quality-type filter codes; "ALL" sends no `quality_type`. */
export type QualityTypeFilter = "ALL" | "HESSIAN" | "SACKING";

export const QUALITY_TYPE_HESSIAN: FinishingQualityType = 1;
export const QUALITY_TYPE_SACKING: FinishingQualityType = 2;

export const QUALITY_TYPE_OPTIONS: ReadonlyArray<SearchableOption<QualityTypeFilter>> = [
  { value: "ALL", label: "All" },
  { value: "HESSIAN", label: "Hessian" },
  { value: "SACKING", label: "Sacking" },
];

export const GROUP_BY_OPTIONS: ReadonlyArray<{ value: BaleRegisterGroupBy; label: string }> = [
  { value: "quality", label: "Quality" },
  { value: "series", label: "Series" },
];

/** Query-param value for the quality-type filter; undefined = don't send. */
export function qualityTypeParam(filter: QualityTypeFilter): FinishingQualityType | undefined {
  if (filter === "HESSIAN") return QUALITY_TYPE_HESSIAN;
  if (filter === "SACKING") return QUALITY_TYPE_SACKING;
  return undefined;
}

/** 1 → Hessian, 2 → Sacking (jute_prod_finishing_quality.quality_type). */
export function qualityTypeLabel(qualityType: number | null | undefined): string {
  if (qualityType === QUALITY_TYPE_HESSIAN) return "Hessian";
  if (qualityType === QUALITY_TYPE_SACKING) return "Sacking";
  return "";
}

/** The server refuses longer ranges with a 400 (spec §7c). */
export const MAX_RANGE_DAYS = 92;

const DAY_MS = 86_400_000;

/** Whole days between two ISO dates, inclusive of both ends. */
export function rangeDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / DAY_MS) + 1;
}

/**
 * Validates the filter dates the way the server does, so the page can refuse
 * the Submit instead of round-tripping for a 400. Returns the message to show,
 * or null when the range is fine.
 */
export function validateDateRange(
  from: string,
  to: string,
  today: string,
): string | null {
  if (!from || !to) return "Enter both dates";
  if (from > to) return "From date must be on or before To date";
  if (to > today) return "To date cannot be after today";
  if (rangeDays(from, to) > MAX_RANGE_DAYS) {
    return `Range cannot exceed ${MAX_RANGE_DAYS} days`;
  }
  return null;
}

// ------------------------------------------------------------- labels ----

/** Card / summary label of a group: the quality name, or "<series> · <quality>"
 * when the register is grouped by series. */
export function groupLabel(
  group: Pick<BaleRegisterGroup, "item_name" | "series_name">,
  groupBy: BaleRegisterGroupBy,
): string {
  const item = group.item_name ?? "—";
  if (groupBy === "series") return `${group.series_name ?? "—"} · ${item}`;
  return item;
}

/** Despatch-detail row label, matching the register's own group naming. */
export function despatchGroupLabel(
  d: Pick<BaleRegisterDespatchDetail, "item_name" | "series_name">,
): string {
  const item = d.item_name ?? "—";
  return d.series_name ? `${d.series_name} · ${item}` : item;
}

/**
 * "Invoice / Challan" cell: `#<no> · <date>` against an invoice, otherwise the
 * reason label (Delivery challan, Transfer, …) followed by its reference.
 */
export function despatchRefLabel(
  d: Pick<
    BaleRegisterDespatchDetail,
    "invoice_no" | "invoice_date" | "despatch_reason_label" | "despatch_ref"
  >,
): string {
  if (d.invoice_no != null && d.invoice_no !== "") {
    return d.invoice_date ? `#${d.invoice_no} · ${d.invoice_date}` : `#${d.invoice_no}`;
  }
  const reason = d.despatch_reason_label ?? "No invoice";
  return d.despatch_ref ? `${reason} · ${d.despatch_ref}` : reason;
}

/** A day with no movement at all — rendered muted so the active days stand out. */
export function isIdleDay(
  day: Pick<BaleRegisterDay, "pressed" | "repacked_out" | "despatched">,
): boolean {
  return day.pressed === 0 && day.repacked_out === 0 && day.despatched === 0;
}

/** Nothing to show: no group survived the backend's "no activity and zero
 * opening" pruning and no despatch line either. */
export function isRegisterEmpty(report: BaleRegisterReport): boolean {
  return report.groups.length === 0 && report.despatch_detail.length === 0;
}

// -------------------------------------------------------------- Excel ----

export const SECTION_REGISTER = "REGISTER";
export const SECTION_PERIOD = "PERIOD";
export const SECTION_DESPATCH = "DESPATCH";

/** Label the shared exporter shades as a group total (see `reportTotalLevel`). */
export const TOTAL_LABEL = "Total";
/** Label the shared exporter shades as the grand total. */
export const GRAND_TOTAL_LABEL = "Grand Total";

export interface FlatRow {
  /** Group label (quality, or series · quality); "Hessian" / "Sacking" /
   * "Grand Total" on the period total rows. Leads the sheet so the exporter's
   * total shading reads the right level off it. */
  group: string;
  /** REGISTER (day rows + per-group total), PERIOD (summary) or DESPATCH. */
  section: string;
  /** ISO day on day and despatch rows; "Total" on summary rows; "" on the
   * per-group period summary rows. */
  date: string;
  opening: number | null;
  pressed: number | null;
  repacked_out: number | null;
  despatched_invoice: number | null;
  despatched_no_invoice: number | null;
  closing: number | null;
  /** Period rows only — Σ net weight of the closing stock, MT at 3 dp. */
  closing_mt: number | null;
  /** Despatch rows only. */
  bale_nos: string;
  count: number | null;
  reference: string;
  party: string;
}

/**
 * Columns of the flattened Excel sheet (the screen layout is hand-laid).
 * `group` leads on purpose: the shared exporter shades summary rows through
 * `reportTotalLevel`, which reads the level off the FIRST column — "Grand
 * Total" there is the grand shade, any other non-empty value a group total.
 */
export const EXPORT_COLUMNS: GridColDef<FlatRow>[] = [
  { field: "group", headerName: "Quality / Series", width: 280 },
  { field: "section", headerName: "Section", width: 110 },
  { field: "date", headerName: "Date", width: 110 },
  { field: "opening", headerName: "Opening", type: "number", width: 100 },
  { field: "pressed", headerName: "Pressed", type: "number", width: 100 },
  { field: "repacked_out", headerName: "Repacked out", type: "number", width: 120 },
  { field: "despatched_invoice", headerName: "Desp. (Invoice)", type: "number", width: 130 },
  { field: "despatched_no_invoice", headerName: "Desp. (Challan)", type: "number", width: 130 },
  { field: "closing", headerName: "Closing", type: "number", width: 100 },
  { field: "closing_mt", headerName: "Closing MT", type: "number", width: 110 },
  { field: "bale_nos", headerName: "Bale nos", width: 200 },
  { field: "count", headerName: "Count", type: "number", width: 90 },
  { field: "reference", headerName: "Invoice / Challan", width: 220 },
  { field: "party", headerName: "Party", width: 220 },
];

const BLANK_DESPATCH = { bale_nos: "", count: null, reference: "", party: "" } as const;

const dayRow = (group: string, d: BaleRegisterDay): FlatRow => ({
  group,
  section: SECTION_REGISTER,
  date: d.date,
  opening: d.opening,
  pressed: d.pressed,
  repacked_out: d.repacked_out,
  despatched_invoice: d.despatched_invoice,
  despatched_no_invoice: d.despatched_no_invoice,
  closing: d.closing,
  closing_mt: null,
  ...BLANK_DESPATCH,
});

const periodRow = (
  group: string,
  section: string,
  date: string,
  p: BaleRegisterPeriod,
): FlatRow => ({
  group,
  section,
  date,
  opening: p.opening,
  pressed: p.pressed,
  repacked_out: p.repacked_out,
  despatched_invoice: p.despatched_invoice,
  despatched_no_invoice: p.despatched_no_invoice,
  closing: p.closing,
  closing_mt: p.closing_mt,
  ...BLANK_DESPATCH,
});

const despatchRow = (d: BaleRegisterDespatchDetail): FlatRow => ({
  group: despatchGroupLabel(d),
  section: SECTION_DESPATCH,
  date: d.date,
  opening: null,
  pressed: null,
  repacked_out: null,
  despatched_invoice: d.invoice_id != null || d.invoice_no != null ? d.count : null,
  despatched_no_invoice: d.invoice_id == null && d.invoice_no == null ? d.count : null,
  closing: null,
  closing_mt: null,
  bale_nos: d.bale_nos,
  count: d.count,
  reference: despatchRefLabel(d),
  party: d.party_name ?? "",
});

/**
 * One flat sheet of the whole report: for every group its day rows closed by a
 * "Total" row (the period figures), then the PERIOD summary — one row per
 * group plus the Hessian / Sacking totals (only for types that have a group)
 * and the Grand Total — then the despatch detail. Pure; see the test.
 */
export function flattenRegister(report: BaleRegisterReport): FlatRow[] {
  const rows: FlatRow[] = [];
  const { group_by: groupBy } = report;

  for (const g of report.groups) {
    const label = groupLabel(g, groupBy);
    for (const d of g.days) rows.push(dayRow(label, d));
    rows.push(periodRow(label, SECTION_REGISTER, TOTAL_LABEL, g.period));
  }

  if (report.groups.length) {
    for (const g of report.groups) {
      rows.push(periodRow(groupLabel(g, groupBy), SECTION_PERIOD, "", g.period));
    }
    if (report.groups.some((g) => g.quality_type === QUALITY_TYPE_HESSIAN)) {
      rows.push(periodRow("Hessian", SECTION_PERIOD, TOTAL_LABEL, report.totals.hessian));
    }
    if (report.groups.some((g) => g.quality_type === QUALITY_TYPE_SACKING)) {
      rows.push(periodRow("Sacking", SECTION_PERIOD, TOTAL_LABEL, report.totals.sacking));
    }
    rows.push(periodRow(GRAND_TOTAL_LABEL, SECTION_PERIOD, TOTAL_LABEL, report.totals.all));
  }

  for (const d of report.despatch_detail) rows.push(despatchRow(d));

  return rows;
}
