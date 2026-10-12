import { describe, expect, it } from "vitest";
import type {
  BaleStockDespatch,
  BaleStockInvoice,
  BaleStockRow,
  BaleStockSeriesLine,
  BaleStockSummaryLine,
} from "@/utils/baleStockService";
import {
  canInspect,
  canLink,
  canUninspect,
  canUnlink,
  despatchDoneMessage,
  formatKg,
  formatMt,
  inspectionCell,
  invoiceCell,
  invoiceLabel,
  isDespatchVoid,
  isNoInvoiceDespatch,
  latestPressDate,
  mergeLinkableRows,
  noInvoiceDespatchCount,
  qualityTypeLabel,
  repackedByCell,
  sackingSeriesLines,
  selectRange,
  selectionSummary,
  seriesLineName,
  seriesOptionsFromRows,
  seriesSummaryTotals,
  statusColor,
  statusLabel,
  summaryTotals,
  todayISO,
  uninspectedSackingCount,
} from "./baleStockCalc";

/** Minimal row builder — a sacking PROD bale in stock unless overridden. */
function row(over: Partial<BaleStockRow>): BaleStockRow {
  return {
    bale_entry_id: 1,
    tran_date: "2026-10-10",
    entry_type: "PROD",
    bale_series_id: 1,
    series_name: "PUNJAB",
    bale_no: 612,
    original_bale_no: null,
    finishing_quality_id: 2,
    item_id: 270011,
    item_name: "PRINTED TYPE A",
    quality_type: 2,
    gross_wt: 340,
    net_wt: 290,
    status: "IN_STOCK",
    inspection: null,
    despatch: null,
    repacked_by: null,
    ...over,
  };
}

const despatchLive: BaleStockDespatch = {
  bale_despatch_id: 9,
  invoice_id: 171,
  invoice_no: 52,
  invoice_date: "2026-10-11",
  invoice_type: 3,
  invoice_status_id: 3,
  party_name: "BIHAR STATE FOOD",
  despatch_date: "2026-10-11",
  despatch_reason: null,
  despatch_reason_label: null,
  despatch_ref: null,
  remarks: null,
};

/** Despatched on a challan, no invoice yet (spec §7b). */
const despatchNoInvoice: BaleStockDespatch = {
  bale_despatch_id: 10,
  invoice_id: null,
  invoice_no: null,
  invoice_date: null,
  invoice_type: null,
  invoice_status_id: null,
  party_name: null,
  despatch_date: "2026-10-11",
  despatch_reason: "CHALLAN",
  despatch_reason_label: "Delivery challan",
  despatch_ref: "DC/118",
  remarks: null,
};

/** A bale out on a challan — status DESPATCHED, despatch without invoice. */
function noInvoiceRow(over: Partial<BaleStockRow> = {}): BaleStockRow {
  return row({ status: "DESPATCHED", despatch: despatchNoInvoice, ...over });
}

function line(over: Partial<BaleStockSummaryLine>): BaleStockSummaryLine {
  return {
    finishing_quality_id: 2,
    item_id: 270011,
    item_name: "PRINTED TYPE A",
    quality_type: 2,
    bales: 0,
    inspected_bales: 0,
    total_kg: 0,
    inspected_kg: 0,
    per_wt_kg: null,
    wt_mt: 0,
    despatched_bales: 0,
    ...over,
  };
}

function seriesLine(over: Partial<BaleStockSeriesLine>): BaleStockSeriesLine {
  return { ...line({}), bale_series_id: 1, series_name: "PUNJAB", ...over };
}

describe("todayISO", () => {
  it("is a local YYYY-MM-DD", () => {
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    expect(todayISO()).toBe(expected);
  });
});

describe("formatKg / formatMt", () => {
  it("formats kg at 3 dp with trailing zeros dropped", () => {
    expect(formatKg(290)).toBe("290");
    expect(formatKg(290.5)).toBe("290.5");
    expect(formatKg(290.12345)).toBe("290.123");
    expect(formatKg(null)).toBe("");
    expect(formatKg(undefined)).toBe("");
    expect(formatKg(Number.NaN)).toBe("");
  });
  it("formats MT at a fixed 3 dp", () => {
    expect(formatMt(34.8)).toBe("34.800");
    expect(formatMt(0)).toBe("0.000");
    expect(formatMt(null)).toBe("");
  });
});

describe("qualityTypeLabel", () => {
  it("names the two quality types", () => {
    expect(qualityTypeLabel(1)).toBe("Hessian");
    expect(qualityTypeLabel(2)).toBe("Sacking");
  });
});

describe("statusLabel / statusColor", () => {
  it("labels every status", () => {
    expect(statusLabel("IN_STOCK")).toBe("In stock");
    expect(statusLabel("INSPECTED")).toBe("Inspected");
    expect(statusLabel("DESPATCHED")).toBe("Despatched");
    expect(statusLabel("REPACKED")).toBe("Repacked");
  });
  it("maps statuses to theme chip colours", () => {
    expect(statusColor("IN_STOCK")).toBe("default");
    expect(statusColor("INSPECTED")).toBe("success");
    expect(statusColor("DESPATCHED")).toBe("info");
    expect(statusColor("REPACKED")).toBe("secondary");
  });
});

describe("isDespatchVoid", () => {
  it("is false without a link or with a live invoice", () => {
    expect(isDespatchVoid(row({}))).toBe(false);
    expect(isDespatchVoid(row({ despatch: despatchLive }))).toBe(false);
  });
  it("is true when the invoice is rejected (4) or cancelled (6)", () => {
    expect(isDespatchVoid(row({ despatch: { ...despatchLive, invoice_status_id: 4 } }))).toBe(true);
    expect(isDespatchVoid(row({ despatch: { ...despatchLive, invoice_status_id: 6 } }))).toBe(true);
  });
  it("treats an unknown header status as live", () => {
    expect(isDespatchVoid(row({ despatch: { ...despatchLive, invoice_status_id: null } }))).toBe(false);
  });
  it("is never void for a despatch without invoice, whatever the status field says", () => {
    expect(isDespatchVoid(noInvoiceRow())).toBe(false);
    expect(isDespatchVoid(noInvoiceRow({ despatch: { ...despatchNoInvoice, invoice_status_id: 6 } }))).toBe(false);
  });
});

describe("isNoInvoiceDespatch / noInvoiceDespatchCount", () => {
  it("is true only for a despatch row with a null invoice", () => {
    expect(isNoInvoiceDespatch(row({}))).toBe(false);
    expect(isNoInvoiceDespatch(row({ despatch: despatchLive }))).toBe(false);
    expect(isNoInvoiceDespatch(row({ despatch: { ...despatchLive, invoice_status_id: 6 } }))).toBe(false);
    expect(isNoInvoiceDespatch(noInvoiceRow())).toBe(true);
  });
  it("counts the no-invoice despatches in a selection", () => {
    expect(noInvoiceDespatchCount([])).toBe(0);
    expect(
      noInvoiceDespatchCount([row({}), noInvoiceRow(), row({ status: "DESPATCHED", despatch: despatchLive }), noInvoiceRow()]),
    ).toBe(2);
  });
});

describe("selectRange", () => {
  const rows = [
    row({ bale_entry_id: 10, bale_series_id: 1, bale_no: 610 }),
    row({ bale_entry_id: 11, bale_series_id: 1, bale_no: 611 }),
    row({ bale_entry_id: 12, bale_series_id: 1, bale_no: 612 }),
    row({ bale_entry_id: 13, bale_series_id: 1, bale_no: 613 }),
    row({ bale_entry_id: 20, bale_series_id: 2, bale_no: 611 }),
  ];
  it("is inclusive at both ends and limited to the series", () => {
    expect(selectRange(rows, 1, 611, 612)).toEqual([11, 12]);
    expect(selectRange(rows, 2, 600, 700)).toEqual([20]);
  });
  it("swaps a reversed range", () => {
    expect(selectRange(rows, 1, 613, 611)).toEqual([11, 12, 13]);
  });
  it("returns nothing for an empty range or a non-numeric bound", () => {
    expect(selectRange(rows, 1, 700, 800)).toEqual([]);
    expect(selectRange(rows, 1, Number.NaN, 612)).toEqual([]);
  });
  it("a single bale is from === to", () => {
    expect(selectRange(rows, 1, 612, 612)).toEqual([12]);
  });
});

describe("seriesOptionsFromRows", () => {
  it("lists each series once, sorted by name, with a fallback name", () => {
    const rows = [
      row({ bale_series_id: 2, series_name: "BIHAR" }),
      row({ bale_series_id: 1, series_name: "PUNJAB" }),
      row({ bale_series_id: 1, series_name: "PUNJAB" }),
      row({ bale_series_id: 3, series_name: null }),
    ];
    expect(seriesOptionsFromRows(rows)).toEqual([
      { bale_series_id: 2, series_name: "BIHAR" },
      { bale_series_id: 1, series_name: "PUNJAB" },
      { bale_series_id: 3, series_name: "Series #3" },
    ]);
  });
});

describe("latestPressDate / selectionSummary", () => {
  it("finds the latest tran_date", () => {
    expect(latestPressDate([])).toBeNull();
    expect(
      latestPressDate([row({ tran_date: "2026-10-01" }), row({ tran_date: "2026-10-09" }), row({ tran_date: "2026-10-05" })]),
    ).toBe("2026-10-09");
  });
  it("summarises count and distinct qualities", () => {
    expect(selectionSummary([])).toBe("0 bales");
    expect(selectionSummary([row({})])).toBe("1 bale · qualities: PRINTED TYPE A");
    expect(selectionSummary([row({}), row({ item_name: "B TWILL" }), row({})])).toBe(
      "3 bales · qualities: PRINTED TYPE A, B TWILL",
    );
  });
});

describe("canInspect", () => {
  it("needs a selection", () => {
    expect(canInspect([])).toEqual({ ok: false, reason: "Select at least one bale" });
  });
  it("accepts sacking bales in stock", () => {
    expect(canInspect([row({}), row({ bale_entry_id: 2, bale_no: 613 })])).toEqual({ ok: true, reason: null });
  });
  it("rejects hessian", () => {
    const check = canInspect([row({}), row({ bale_no: 7, quality_type: 1, series_name: "HESS" })]);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("bale 7 (HESS) is hessian");
  });
  it("rejects already inspected / despatched / repacked", () => {
    expect(canInspect([row({ status: "INSPECTED" })]).reason).toMatch(/already inspected/);
    expect(canInspect([row({ status: "DESPATCHED" })]).reason).toMatch(/not in stock \(despatched\)/);
    expect(canInspect([row({ status: "REPACKED" })]).reason).toMatch(/not in stock \(repacked\)/);
  });
  it("still allows a bale whose despatch is void (status reads IN_STOCK)", () => {
    expect(canInspect([row({ despatch: { ...despatchLive, invoice_status_id: 6 } })]).ok).toBe(true);
  });
});

describe("canUninspect", () => {
  it("requires every bale to be INSPECTED", () => {
    expect(canUninspect([]).ok).toBe(false);
    expect(canUninspect([row({ status: "INSPECTED" })]).ok).toBe(true);
    expect(canUninspect([row({ status: "INSPECTED" }), row({ status: "IN_STOCK", bale_no: 1 })]).reason).toMatch(
      /bale 1 .*not marked inspected/i,
    );
  });
});

describe("canLink", () => {
  it("accepts IN_STOCK and INSPECTED, rejects DESPATCHED-with-invoice / REPACKED", () => {
    expect(canLink([]).ok).toBe(false);
    expect(canLink([row({ status: "IN_STOCK" }), row({ status: "INSPECTED" })]).ok).toBe(true);
    expect(canLink([row({ status: "DESPATCHED", despatch: despatchLive })]).ok).toBe(false);
    expect(canLink([row({ status: "REPACKED" })]).reason).toMatch(/not in stock \(repacked\)/);
  });
  it("names the invoice a despatched bale is already on", () => {
    expect(canLink([row({ status: "DESPATCHED", despatch: despatchLive })]).reason).toBe(
      "Bale 612 (PUNJAB) is already despatched against invoice #52",
    );
    expect(canLink([row({ status: "DESPATCHED", despatch: { ...despatchLive, invoice_no: null } })]).reason).toMatch(
      /invoice #171$/,
    );
    // No despatch detail at all (should not happen) — generic not-in-stock reason.
    expect(canLink([row({ status: "DESPATCHED" })]).reason).toMatch(/not in stock \(despatched\)/);
  });
  it("lets a bale despatched without invoice be linked later, alone or mixed with stock", () => {
    expect(canLink([noInvoiceRow()]).ok).toBe(true);
    expect(canLink([row({}), noInvoiceRow({ bale_entry_id: 2, bale_no: 613 }), row({ status: "INSPECTED" })])).toEqual({
      ok: true,
      reason: null,
    });
  });
  it("still blocks when one bale of the selection is on an invoice", () => {
    const check = canLink([noInvoiceRow(), row({ status: "DESPATCHED", despatch: despatchLive, bale_no: 700 })]);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/Bale 700 .*already despatched against invoice #52/);
  });
  it("lets a bale with a void link be re-linked", () => {
    expect(canLink([row({ status: "IN_STOCK", despatch: { ...despatchLive, invoice_status_id: 4 } })]).ok).toBe(true);
  });
});

describe("canUnlink", () => {
  it("requires a despatch row on every bale (with or without invoice, live or void)", () => {
    expect(canUnlink([]).ok).toBe(false);
    expect(canUnlink([row({ status: "DESPATCHED", despatch: despatchLive })]).ok).toBe(true);
    expect(canUnlink([noInvoiceRow()]).ok).toBe(true);
    expect(canUnlink([row({ status: "IN_STOCK", despatch: { ...despatchLive, invoice_status_id: 6 } })]).ok).toBe(true);
    expect(canUnlink([row({ status: "DESPATCHED", despatch: despatchLive }), row({})]).reason).toMatch(
      /Bale 612 .*is not despatched/,
    );
  });
});

describe("mergeLinkableRows", () => {
  const inspection = {
    bale_inspection_id: 1,
    inspection_date: "2026-10-10",
    inspection_ref: null,
    inspector: null,
    remarks: null,
  };
  it("lists in-stock rows first, then no-invoice despatches, each by series then bale no", () => {
    const stock = [
      row({ bale_entry_id: 3, series_name: "PUNJAB", bale_no: 613 }),
      row({ bale_entry_id: 1, series_name: "BIHAR", bale_series_id: 2, bale_no: 900 }),
      row({ bale_entry_id: 2, series_name: "PUNJAB", bale_no: 612, status: "INSPECTED", inspection }),
    ];
    const despatched = [
      noInvoiceRow({ bale_entry_id: 12, series_name: "PUNJAB", bale_no: 611 }),
      row({ bale_entry_id: 20, status: "DESPATCHED", despatch: despatchLive, bale_no: 1 }),
      noInvoiceRow({ bale_entry_id: 11, series_name: "BIHAR", bale_series_id: 2, bale_no: 899 }),
    ];
    expect(mergeLinkableRows(stock, despatched).map((r) => r.bale_entry_id)).toEqual([1, 2, 3, 11, 12]);
  });
  it("drops duplicates, repacked bales and despatches with an invoice", () => {
    const stock = [row({ bale_entry_id: 1 }), row({ bale_entry_id: 1 }), row({ bale_entry_id: 5, status: "REPACKED" })];
    const despatched = [noInvoiceRow({ bale_entry_id: 1 }), row({ bale_entry_id: 9, status: "DESPATCHED", despatch: despatchLive })];
    expect(mergeLinkableRows(stock, despatched).map((r) => r.bale_entry_id)).toEqual([1]);
  });
  it("falls back to Series #id when a series is unnamed and is empty for no input", () => {
    const stock = [
      row({ bale_entry_id: 2, series_name: null, bale_series_id: 9, bale_no: 1 }),
      row({ bale_entry_id: 1, series_name: "BIHAR", bale_no: 1 }),
    ];
    expect(mergeLinkableRows(stock, []).map((r) => r.bale_entry_id)).toEqual([1, 2]);
    expect(mergeLinkableRows([], [])).toEqual([]);
  });
});

describe("despatchDoneMessage", () => {
  it("says marked despatched without an invoice", () => {
    expect(despatchDoneMessage({ linked: 3, relinked: 0, uninspectedSacking: 0, invoiceRef: null })).toBe(
      "Marked 3 bales despatched",
    );
    expect(despatchDoneMessage({ linked: 1, relinked: 0, uninspectedSacking: 1, invoiceRef: null })).toBe(
      "Marked 1 bale despatched · 1 sacking bale was not inspected",
    );
  });
  it("says linked to the invoice, with the relink and inspection tails", () => {
    expect(despatchDoneMessage({ linked: 5, relinked: 0, uninspectedSacking: 0, invoiceRef: "#52" })).toBe(
      "Linked 5 bales to invoice #52",
    );
    expect(despatchDoneMessage({ linked: 5, relinked: 2, uninspectedSacking: 3, invoiceRef: "#52" })).toBe(
      "Linked 5 bales to invoice #52 · 2 already-despatched bales linked · 3 sacking bales were not inspected",
    );
    expect(despatchDoneMessage({ linked: 2, relinked: 1, uninspectedSacking: 0, invoiceRef: "#52" })).toBe(
      "Linked 2 bales to invoice #52 · 1 already-despatched bale linked",
    );
  });
  it("reads naturally when only already-despatched bales were linked", () => {
    expect(despatchDoneMessage({ linked: 0, relinked: 2, uninspectedSacking: 0, invoiceRef: "#52" })).toBe(
      "Linked 2 already-despatched bales to invoice #52",
    );
    expect(despatchDoneMessage({ linked: 0, relinked: 1, uninspectedSacking: 0, invoiceRef: "#52" })).toBe(
      "Linked 1 already-despatched bale to invoice #52",
    );
  });
});

describe("summaryTotals", () => {
  it("splits hessian / sacking and totals bales, inspected, not inspected and MT", () => {
    const lines = [
      line({ quality_type: 1, bales: 40, inspected_bales: 0, wt_mt: 10.5 }),
      line({ quality_type: 2, bales: 120, inspected_bales: 80, wt_mt: 34.8 }),
      line({ quality_type: 2, finishing_quality_id: 3, bales: 10, inspected_bales: 10, wt_mt: 2.9 }),
    ];
    expect(summaryTotals(lines)).toEqual({
      hessian: { bales: 40, inspected: 0, notInspected: 40, mt: 10.5 },
      sacking: { bales: 130, inspected: 90, notInspected: 40, mt: 37.7 },
      overall: { bales: 170, inspected: 90, notInspected: 80, mt: 48.2 },
    });
  });
  it("is all zeros for no lines and never goes negative on bad data", () => {
    expect(summaryTotals([]).overall).toEqual({ bales: 0, inspected: 0, notInspected: 0, mt: 0 });
    expect(summaryTotals([line({ bales: 1, inspected_bales: 3 })]).sacking.notInspected).toBe(0);
  });
  it("rounds MT at the printed scale", () => {
    const lines = [line({ wt_mt: 0.1 }), line({ wt_mt: 0.2 })];
    expect(summaryTotals(lines).overall.mt).toBe(0.3);
  });
});

describe("uninspectedSackingCount", () => {
  it("counts sacking bales not marked inspected, ignoring hessian", () => {
    expect(uninspectedSackingCount([])).toBe(0);
    expect(
      uninspectedSackingCount([
        row({ status: "IN_STOCK" }),
        row({ status: "INSPECTED" }),
        row({ status: "IN_STOCK", quality_type: 1 }),
        row({ status: "DESPATCHED" }),
      ]),
    ).toBe(2);
  });
  it("does not count a despatched bale that was inspected before it left", () => {
    const inspection = {
      bale_inspection_id: 1,
      inspection_date: "2026-10-10",
      inspection_ref: null,
      inspector: null,
      remarks: null,
    };
    expect(uninspectedSackingCount([noInvoiceRow({ inspection }), noInvoiceRow({ bale_entry_id: 2 })])).toBe(1);
  });
});

describe("seriesLineName", () => {
  it("is the series name, falling back to Series #id", () => {
    expect(seriesLineName(seriesLine({}))).toBe("PUNJAB");
    expect(seriesLineName(seriesLine({ bale_series_id: 7, series_name: null }))).toBe("Series #7");
    expect(seriesLineName(seriesLine({ bale_series_id: 7, series_name: "  " }))).toBe("Series #7");
  });
});

describe("sackingSeriesLines", () => {
  it("keeps only sacking, sorted by series name then quality name", () => {
    const lines = [
      seriesLine({ bale_series_id: 3, series_name: "HESS", quality_type: 1, finishing_quality_id: 9 }),
      seriesLine({ bale_series_id: 1, series_name: "PUNJAB", item_name: "PRINTED TYPE A" }),
      seriesLine({ bale_series_id: 2, series_name: "BIHAR", item_name: "B TWILL", finishing_quality_id: 3 }),
      seriesLine({ bale_series_id: 1, series_name: "PUNJAB", item_name: "B TWILL", finishing_quality_id: 3 }),
      seriesLine({ bale_series_id: 4, series_name: null, item_name: "B TWILL", finishing_quality_id: 3 }),
    ];
    expect(sackingSeriesLines(lines).map((l) => [seriesLineName(l), l.item_name])).toEqual([
      ["BIHAR", "B TWILL"],
      ["PUNJAB", "B TWILL"],
      ["PUNJAB", "PRINTED TYPE A"],
      ["Series #4", "B TWILL"],
    ]);
  });
  it("does not mutate its input and is empty for no sacking lines", () => {
    const lines = [seriesLine({ series_name: "Z" }), seriesLine({ series_name: "A", bale_series_id: 2 })];
    sackingSeriesLines(lines);
    expect(lines.map((l) => l.series_name)).toEqual(["Z", "A"]);
    expect(sackingSeriesLines([seriesLine({ quality_type: 1 })])).toEqual([]);
    expect(sackingSeriesLines([])).toEqual([]);
  });
});

describe("seriesSummaryTotals", () => {
  it("sums bales, inspected, not inspected, kg and MT, with kg / bales per bale", () => {
    const totals = seriesSummaryTotals([
      seriesLine({ bales: 100, inspected_bales: 60, total_kg: 29000, wt_mt: 29 }),
      seriesLine({ bale_series_id: 2, series_name: "BIHAR", bales: 20, inspected_bales: 20, total_kg: 5900, wt_mt: 5.9 }),
    ]);
    expect(totals).toEqual({
      bales: 120,
      inspected: 80,
      notInspected: 40,
      mt: 34.9,
      kg: 34900,
      perBaleKg: 34900 / 120,
    });
  });
  it("has no per-bale kg without bales, and rounds at the printed scale", () => {
    expect(seriesSummaryTotals([])).toEqual({
      bales: 0,
      inspected: 0,
      notInspected: 0,
      mt: 0,
      kg: 0,
      perBaleKg: null,
    });
    const totals = seriesSummaryTotals([
      seriesLine({ bales: 1, total_kg: 0.1, wt_mt: 0.1 }),
      seriesLine({ bales: 1, total_kg: 0.2, wt_mt: 0.2 }),
    ]);
    expect(totals.kg).toBe(0.3);
    expect(totals.mt).toBe(0.3);
  });
  it("agrees with the quality summary when every sacking line is split by series", () => {
    const quality = [
      line({ quality_type: 2, bales: 120, inspected_bales: 80, total_kg: 34900, wt_mt: 34.9 }),
    ];
    const bySeries = [
      seriesLine({ bales: 100, inspected_bales: 60, total_kg: 29000, wt_mt: 29 }),
      seriesLine({ bale_series_id: 2, series_name: "BIHAR", bales: 20, inspected_bales: 20, total_kg: 5900, wt_mt: 5.9 }),
    ];
    const q = summaryTotals(quality).sacking;
    const s = seriesSummaryTotals(sackingSeriesLines(bySeries));
    expect({ bales: s.bales, inspected: s.inspected, notInspected: s.notInspected, mt: s.mt }).toEqual(q);
  });
});

describe("cell text", () => {
  it("inspectionCell joins date · ref · inspector and skips blanks", () => {
    expect(inspectionCell(row({}))).toBe("");
    expect(
      inspectionCell(
        row({
          inspection: {
            bale_inspection_id: 3,
            inspection_date: "2026-10-11",
            inspection_ref: "IC/22",
            inspector: "IJIRA",
            remarks: null,
          },
        }),
      ),
    ).toBe("2026-10-11 · IC/22 · IJIRA");
    expect(
      inspectionCell(
        row({
          inspection: {
            bale_inspection_id: 3,
            inspection_date: "2026-10-11",
            inspection_ref: null,
            inspector: "",
            remarks: null,
          },
        }),
      ),
    ).toBe("2026-10-11");
  });
  it("invoiceCell is #no · date · party, falling back to the invoice id", () => {
    expect(invoiceCell(row({}))).toBe("");
    expect(invoiceCell(row({ despatch: despatchLive }))).toBe("#52 · 2026-10-11 · BIHAR STATE FOOD");
    expect(invoiceCell(row({ despatch: { ...despatchLive, invoice_no: null, party_name: null } }))).toBe(
      "#171 · 2026-10-11",
    );
  });
  it("invoiceCell reads No invoice · reason · ref for a despatch without invoice, blanks dropped", () => {
    expect(invoiceCell(noInvoiceRow())).toBe("No invoice · Delivery challan · DC/118");
    expect(invoiceCell(noInvoiceRow({ despatch: { ...despatchNoInvoice, despatch_ref: null } }))).toBe(
      "No invoice · Delivery challan",
    );
    expect(
      invoiceCell(noInvoiceRow({ despatch: { ...despatchNoInvoice, despatch_reason_label: null, despatch_ref: " " } })),
    ).toBe("No invoice · CHALLAN");
    expect(
      invoiceCell(
        noInvoiceRow({ despatch: { ...despatchNoInvoice, despatch_reason: null, despatch_reason_label: null, despatch_ref: null } }),
      ),
    ).toBe("No invoice");
  });
  it("repackedByCell is bale no · date", () => {
    expect(repackedByCell(row({}))).toBe("");
    expect(repackedByCell(row({ repacked_by: { bale_entry_id: 99, bale_no: 700, tran_date: "2026-10-12" } }))).toBe(
      "700 · 2026-10-12",
    );
  });
  it("invoiceLabel is #no · date · party · type", () => {
    const inv: BaleStockInvoice = {
      invoice_id: 171,
      invoice_no: 52,
      invoice_date: "2026-05-08",
      invoice_type: 3,
      invoice_type_name: "Govt Sacking",
      party_name: "BIHAR STATE FOOD",
      status_id: 3,
      lines: [],
      linked_bales: 0,
    };
    expect(invoiceLabel(inv)).toBe("#52 · 2026-05-08 · BIHAR STATE FOOD · Govt Sacking");
    expect(invoiceLabel({ ...inv, invoice_no: null, party_name: null })).toBe("#171 · 2026-05-08 · Govt Sacking");
  });
});
