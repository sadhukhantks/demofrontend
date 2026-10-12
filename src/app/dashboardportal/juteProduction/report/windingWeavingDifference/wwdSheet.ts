/**
 * The Winding & Weaving Difference sheet's layout: block order, labels and
 * warning texts — shared by the on-screen page and the PDF download so the
 * two can never drift apart — plus the pure builder that turns a loaded
 * report into a {@link TablesPdfSpec} (same sections, same numbers, same
 * "not comparable" treatment as the screen; collapsed blocks are always
 * included, exactly like the browser print).
 */

import type {
  WindingWeavingDifference,
  WwdReconciliation,
  WwdStockRow,
} from "@/utils/juteProductionReportService";
import type { PdfPrefaceLine, PdfTableSection, TablesPdfSpec } from "@/components/reports/tablesPdf";
import { pdfFileSlug } from "@/components/reports/tablesPdf";
import { fmt } from "../dailyProductionReport/_components/DprPieces";
import { purchaseDetailMatches, purchaseDetailTotalKg, purchaseDetailTotalMt } from "./purchaseDetail";

// Stock blocks in the printed sheet's order. Backend always returns every
// bucket (possibly empty) so the shape is stable, but empty buckets are
// skipped in the render per the brief.
export const BUCKET_ORDER = ["MILL_USE", "PURCHASE", "SALE_YARN", "BALL", "WASTE"] as const;

export const BUCKET_LABELS: Record<string, string> = {
  MILL_USE: "Yarn for Mill Use",
  PURCHASE: "Outside Purchase Yarn",
  SALE_YARN: "Sale Yarn Stock",
  BALL: "Ball Stock",
  WASTE: "Waste",
};

// Mill use is the only block with a consolidated table and the only collapsible
// one (TKT-000182); the rest render exactly as before, in the sheet's order.
export const MILL_USE_BUCKET = "MILL_USE";
export const OTHER_BUCKET_ORDER = BUCKET_ORDER.filter((b) => b !== MILL_USE_BUCKET);

export const CLOTH_SPLIT_ORDER = ["HESSIAN", "SACKING", "OTHER"] as const;
export const CLOTH_SPLIT_LABELS: Record<string, string> = {
  HESSIAN: "Hessian",
  SACKING: "Sacking",
  OTHER: "Other",
};

// Production-reconciliation rows, in the printed sheet's order. difference_pct
// is shown in the header strip, not this table; difference_mt gets its own
// (highlighted) row below the loop.
export const RECON_ROWS: { key: keyof WwdReconciliation; label: string }[] = [
  { key: "jute_issue_mt", label: "Jute Issue (MT)" },
  { key: "opening_mt", label: "Opening Stock (MT)" },
  // Spinning feeds winding, so it reads directly above it. Context only: it is
  // not part of the book-stock arithmetic (see the backend's build_reconciliation).
  { key: "spinning_mt", label: "Spinning Production (MT)" },
  { key: "winding_mt", label: "Winding Production (MT)" },
  { key: "twisting_mt", label: "Twisting (Consumed) (MT)" },
  { key: "weaving_mt", label: "Weaving Production (MT)" },
  { key: "purchase_mt", label: "Purchase Yarn (MT)" },
  { key: "sale_mt", label: "Sale Yarn (MT)" },
  { key: "should_be_closing_mt", label: "Should-Be Closing (MT)" },
  { key: "actual_closing_mt", label: "Actual Closing (MT)" },
];

export const STOCK_BLOCK_HEAD = [
  "Count",
  "Quality",
  "Package",
  "No. of Samples",
  "Weight/Sample (kg)",
  "Prvs Stock (MT)",
  "Stock Position (MT)",
  "Place",
];

/** null means a percentage of zero winding production — never render 0.00%. */
export function pctDisplay(pct: number | null): string {
  return pct === null ? "—" : `${fmt(pct, 2)}%`;
}

/** One bucket's rows, tolerating grand_total_mt (a number) sharing the map. */
export function bucketOf(
  stock: WindingWeavingDifference["stock"],
  name: string,
): { rows: WwdStockRow[]; subtotal_mt: number } | null {
  const v = stock[name];
  return v && typeof v === "object" ? v : null;
}

/** The two "not comparable" conditions the sheet greys out. */
export function wwdComparability(data: WindingWeavingDifference): {
  chainBroken: boolean;
  mtdOpeningUnknown: boolean;
} {
  return {
    chainBroken: !data.chain.ok,
    // No count before the 1st of the month: mtd opening came back 0.0, so the
    // MTD should-be closing silently omits the whole opening balance.
    mtdOpeningUnknown: data.chain.month_opening_date == null,
  };
}

/** The amber warnings above the tables, in the page's order. */
export function wwdWarningTexts(data: WindingWeavingDifference): string[] {
  const { chainBroken, mtdOpeningUnknown } = wwdComparability(data);
  const out: string[] = [];
  if (chainBroken) {
    out.push(
      data.chain.prev_entry_date
        ? `Opening stock is taken from ${data.chain.prev_entry_date}, not the previous day. Counts are missing in between.`
        : "No earlier stock count exists — opening stock could not be verified.",
    );
  }
  if (mtdOpeningUnknown) {
    out.push(
      "No stock count exists before the start of the month, so the month-to-date opening balance is unknown and the To-Date figures below are not comparable.",
    );
  }
  if (data.warnings.purchase_unknown_uoms.length > 0) {
    out.push(
      `Purchased yarn booked in ${data.warnings.purchase_unknown_uoms.join(", ")} was not converted — MTR is metres, not tonnes, so that quantity is missing from the totals.`,
    );
  }
  if (data.warnings.weaving_unresolved_day > 0 || data.warnings.weaving_unresolved_mtd > 0) {
    out.push(
      `${data.warnings.weaving_unresolved_day} weaving row(s) today and ${data.warnings.weaving_unresolved_mtd} this month have no resolvable weaving quality — that production is excluded from Weaving Production (MT), so the difference below is overstated.`,
    );
  }
  // Purchase Yarn (MT) reads Yarn Purchase documents only, so yarn still
  // arriving through a Stores receipt of the old item is NOT in the figures.
  if (data.warnings.legacy_stores_yarn_warning) {
    out.push(
      data.warnings.legacy_stores_yarn_warning +
        (typeof data.warnings.legacy_stores_yarn_mt === "number"
          ? ` Stores receipts of the legacy yarn item this month: ${fmt(data.warnings.legacy_stores_yarn_mt, 3)} MT — not included in Purchase Yarn (MT).`
          : ""),
    );
  }
  return out;
}

function stockBlockSection(
  title: string,
  block: { rows: WwdStockRow[]; subtotal_mt: number },
): PdfTableSection {
  const body = block.rows.map((r) => [
    fmt(r.yarn_count),
    r.item_name ?? r.item_code ?? r.quality_name ?? "—",
    r.package_label || "—",
    fmt(r.no_of_samples, 0),
    fmt(r.wt_per_sample),
    fmt(r.prvs_stock_mt, 3),
    fmt(r.stock_mt, 3),
    r.area_name ?? "—",
  ]);
  body.push(["Subtotal", "", "", "", "", "", fmt(block.subtotal_mt, 3), ""]);
  return {
    title,
    head: STOCK_BLOCK_HEAD,
    body,
    aligns: ["right", "left", "left", "right", "right", "right", "right", "left"],
    totalRows: [body.length - 1],
  };
}

export interface WwdPdfContext {
  companyName?: string | null;
  branchName?: string | null;
}

/**
 * Loaded report → PDF spec, section for section with the screen. Pure; tested.
 */
export function buildWwdPdfSpec(data: WindingWeavingDifference, ctx: WwdPdfContext): TablesPdfSpec {
  const { chainBroken, mtdOpeningUnknown } = wwdComparability(data);
  const day = data.production.day;
  const mtd = data.production.mtd;
  const sections: PdfTableSection[] = [];

  // Header strip
  const preface: PdfPrefaceLine[] = [
    {
      text: [
        `Report Date: ${data.report_date}`,
        `Month Opening: ${mtdOpeningUnknown ? "no count before month start" : data.chain.month_opening_date}`,
        `Today Difference %: ${chainBroken ? "not comparable" : pctDisplay(day.difference_pct)}`,
        `To-Date Difference %: ${mtdOpeningUnknown ? "not comparable" : pctDisplay(mtd.difference_pct)}`,
      ].join("    "),
    },
    ...wwdWarningTexts(data).map((text) => ({ text, tone: "warning" as const })),
  ];

  // Production reconciliation
  const reconBody = RECON_ROWS.map((r) => [r.label, fmt(day[r.key], 3), fmt(mtd[r.key], 3)]);
  const diffRow = reconBody.length;
  reconBody.push([
    "Difference (MT)",
    chainBroken ? "— not comparable" : fmt(day.difference_mt, 3),
    mtdOpeningUnknown ? "— not comparable" : fmt(mtd.difference_mt, 3),
  ]);
  const struck: [number, number][] = [];
  const muted: [number, number][] = [];
  RECON_ROWS.forEach((_, i) => {
    if (chainBroken) struck.push([i, 1]);
    if (mtdOpeningUnknown) struck.push([i, 2]);
  });
  if (chainBroken) muted.push([diffRow, 1]);
  if (mtdOpeningUnknown) muted.push([diffRow, 2]);
  const reconNotes: string[] = [];
  if (chainBroken) {
    reconNotes.push(
      "Today's opening stock was carried from an older count (see warning above), so the Today column is struck through — it is not a real day-over-day variance.",
    );
  }
  if (mtdOpeningUnknown) {
    reconNotes.push(
      "No count exists before the start of the month (see warning above), so the month-to-date opening balance is unknown and the To-Date column is struck through — it is not a real month-to-date variance.",
    );
  }
  sections.push({
    title: "Production Reconciliation",
    subtitle: "Book stock (opening + winding + purchase − weaving − sale) vs counted closing stock",
    head: [
      "Metric",
      `Today${chainBroken ? " (not comparable)" : ""}`,
      `To-Date (MTD)${mtdOpeningUnknown ? " (not comparable)" : ""}`,
    ],
    body: reconBody,
    aligns: ["left", "right", "right"],
    totalRows: [diffRow],
    struckCells: struck,
    mutedCells: muted,
    notes: reconNotes,
  });

  // Purchase yarn documents (absent on backends predating Yarn Purchase)
  const purchaseRows = data.purchase_detail;
  if (purchaseRows) {
    const totalMt = purchaseDetailTotalMt(purchaseRows);
    const notes: string[] = [];
    if (purchaseRows.length === 0) notes.push(`No approved Yarn Purchase document since ${data.date_from}.`);
    if (!purchaseDetailMatches(purchaseRows, mtd.purchase_mt)) {
      notes.push(
        `Documents total ${fmt(totalMt, 3)} MT but Purchase Yarn (MTD) above reads ${fmt(mtd.purchase_mt, 3)} MT — the two were not built from the same documents.`,
      );
    }
    const body = purchaseRows.map((r) => [
      r.purchase_no,
      r.tran_date ?? "—",
      r.item_name ?? "—",
      fmt(r.yarn_count),
      fmt(r.kg, 3),
    ]);
    if (purchaseRows.length > 0) body.push([`Total (${fmt(totalMt, 3)} MT)`, "", "", "", fmt(purchaseDetailTotalKg(purchaseRows), 3)]);
    sections.push({
      title: "Purchase yarn (documents)",
      subtitle: `${purchaseRows.length} document line(s) since ${data.date_from}`,
      head: purchaseRows.length > 0 ? ["Purchase No", "Date", "Yarn Item", "Count", "Kg"] : undefined,
      body,
      aligns: ["left", "left", "left", "right", "right"],
      totalRows: purchaseRows.length > 0 ? [body.length - 1] : [],
      notes,
    });
  }

  // Cloth split
  sections.push({
    title: "Weaving Cloth Split (MT)",
    subtitle: "Weaving production split by cloth quality type",
    head: ["Cloth Type", "Today", "To-Date (MTD)"],
    body: CLOTH_SPLIT_ORDER.map((k) => [
      CLOTH_SPLIT_LABELS[k],
      fmt(data.cloth_split.day[k], 3),
      fmt(data.cloth_split.mtd[k], 3),
    ]),
    aligns: ["left", "right", "right"],
  });

  // Mill use: consolidated position, then the detail table
  const summary = data.stock_summary;
  if (summary && summary.rows.length > 0) {
    const lineCount = summary.rows.reduce((a, r) => a + r.line_count, 0);
    const body = summary.rows.map((r) => [
      fmt(r.yarn_count),
      r.item_name ?? r.item_code ?? r.quality_name ?? "—",
      r.quality_name ?? "—",
      fmt(r.prvs_stock_mt, 3),
      fmt(r.total_mt, 3),
    ]);
    body.push(["Total (Mill Use)", "", "", fmt(summary.prvs_total_mt, 3), fmt(summary.total_mt, 3)]);
    sections.push({
      title: `${BUCKET_LABELS[MILL_USE_BUCKET]} — Consolidated Position (Yarn Quality wise)`,
      subtitle: `${summary.rows.length} quality/qualities consolidated from ${lineCount} counted mill-use line(s); a quality counted yesterday but not today shows 0.000`,
      head: ["Count", "Quality", "Group", "Prvs Stock (MT)", "Stock Position (MT)"],
      body,
      aligns: ["right", "left", "left", "right", "right"],
      totalRows: [body.length - 1],
    });
  }
  const millUse = bucketOf(data.stock, MILL_USE_BUCKET);
  if (millUse && millUse.rows.length > 0) {
    sections.push(stockBlockSection(`${BUCKET_LABELS[MILL_USE_BUCKET]} — Details`, millUse));
  }

  // The other stock blocks, skipping empty ones
  for (const bucket of OTHER_BUCKET_ORDER) {
    const block = bucketOf(data.stock, bucket);
    if (block && block.rows.length > 0) sections.push(stockBlockSection(BUCKET_LABELS[bucket], block));
  }

  return {
    fileName: pdfFileSlug(`Winding-Weaving-Difference-${ctx.branchName ?? "branch"}-${data.report_date}`),
    orientation: "portrait",
    companyName: ctx.companyName,
    title: "Winding & Weaving Difference",
    subtitleLines: [
      [ctx.branchName ? `Branch: ${ctx.branchName}` : null, `Report Date: ${data.report_date} (MTD from ${data.date_from})`]
        .filter(Boolean)
        .join("    "),
    ],
    preface,
    sections,
    closingLines: [`Grand Total Stock: ${fmt(data.stock.grand_total_mt, 3)} MT`],
    footNote: data.note,
  };
}
