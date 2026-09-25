import { describe, expect, it } from "vitest";
import {
  GRAND_TOTAL_ID,
  GRAND_TOTAL_LABEL,
  aggregateDetailRows,
  applySupplierFilter,
  buildDetailGridRows,
  buildPoGridRows,
  buildQualityGridRows,
  buildSupplierGridRows,
  bucketMt,
  detailRowClass,
  distinctPoIds,
  filterDetailRows,
  filterPoRows,
  formatQualities,
  lorryFractionText,
  lorryLabel,
  lorrySummary,
  fmtInr,
  fmtPct,
  fmtWt,
  isGrandTotalRow,
  pruneSelection,
  ruleCaption,
  summarizeBulkClose,
  summarizeRecompute,
  supplierOptions,
  tabExportName,
  TABS,
  toMt,
  uomShort,
  toggleAllPoSelection,
  togglePoSelection,
} from "./poPositionUtils";
import type {
  PoPositionBucket,
  PoPositionDetailRow,
  PoPositionQualityRow,
  PoPositionReport,
  PoPositionSupplierRow,
} from "./types";

const bucket = (over: Partial<PoPositionBucket> = {}): PoPositionBucket => ({
  po_count: 2,
  overdue_pos: 1,
  ordered_qty: 333.333,
  received_qty: 100,
  balance_qty: 233.333,
  ordered_wt: 57500,
  received_wt: 15000,
  balance_wt: 42500,
  balance_pct: 73.91,
  ordered_value: 7705000,
  balance_value: 5695000,
  avg_rate: 13400,
  ...over,
});

const quality: PoPositionQualityRow = {
  ...bucket(),
  item_id: 269848,
  item_code: "3",
  item_name: "D TD 6",
};

const supplier: PoPositionSupplierRow = {
  ...bucket(),
  party_name: "SUKUMAR SAHA",
  oldest_po_date: "2026-09-01",
};

const detail: PoPositionDetailRow = {
  jute_po_id: 13260,
  po_label: "EJM/F/JPO/26-27/00047",
  po_date: "2026-09-01",
  age_days: 23,
  due_date: "2026-09-11",
  overdue: true,
  po_status: "APPROVED",
  party_name: "SUKUMAR SAHA",
  mukam: "JALANGI",
  vehicle_quantity: 5,
  received_lorries: 2,
  pending_lorries: 3,
  po_weight: 50000,
  po_received_weight: 20000,
  po_pending_weight: 30000,
  item_id: 269848,
  item_code: "3",
  item_name: "D TD 6",
  po_uom: "BALE",
  po_rate: 13400,
  ordered_qty: 250,
  received_qty: 100,
  balance_qty: 150,
  ordered_wt: 37500,
  received_wt: 15000,
  balance_wt: 22500,
  balance_pct: 60,
  ordered_value: 5025000,
  balance_value: 3015000,
  mr_count: 2,
  last_receipt_date: "2026-09-20",
};

describe("buildQualityGridRows", () => {
  it("appends a Grand Total row carrying the report totals", () => {
    const rows = buildQualityGridRows([quality], bucket({ po_count: 9 }));
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe("q-269848-D TD 6");
    const total = rows[1];
    expect(total.id).toBe(GRAND_TOTAL_ID);
    expect(total.item_name).toBe(GRAND_TOTAL_LABEL);
    expect(total.po_count).toBe(9);
    expect(total.balance_wt).toBe(42500);
    expect(isGrandTotalRow(total)).toBe(true);
    expect(isGrandTotalRow(rows[0])).toBe(false);
  });

  it("returns nothing at all when there are no quality rows", () => {
    expect(buildQualityGridRows([], bucket())).toEqual([]);
  });

  it("falls back to a zero total when totals are missing", () => {
    const rows = buildQualityGridRows([quality], null);
    expect(rows[1].po_count).toBe(0);
    expect(rows[1].balance_pct).toBeNull();
  });

  it("carries whole-MT weights on every row including the total", () => {
    const rows = buildQualityGridRows([quality], bucket({ balance_wt: 1533252 }));
    expect(rows[0]).toMatchObject({ ordered_mt: 58, received_mt: 15, balance_mt: 43 });
    expect(rows[1].balance_mt).toBe(1533);
  });
});

describe("buildSupplierGridRows", () => {
  it("keeps supplier order and adds the total line", () => {
    const rows = buildSupplierGridRows(
      [supplier, { ...supplier, party_name: "KISHAN KOTHARI" }],
      bucket(),
    );
    expect(rows.map((r) => r.party_name)).toEqual([
      "SUKUMAR SAHA",
      "KISHAN KOTHARI",
      GRAND_TOTAL_LABEL,
    ]);
    expect(rows[2].oldest_po_date).toBeNull();
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
    expect(rows[0].balance_mt).toBe(43);
    // No detail rows given → lorry figures are zero, labels "0 (0)".
    expect(rows[0].order_lorries).toBe(0);
    expect(rows[0].bal_lw).toBe("0 (0)");
  });

  it("sums lorry-and-weight pairs over each supplier's distinct POs", () => {
    const items: PoPositionDetailRow[] = [
      detail, // 13260: 5 lorries / 50 MT, recv 2 / 20, pend 3 / 30
      { ...detail, item_id: 1 }, // same PO, second item — must not double count
      {
        ...detail,
        jute_po_id: 13261,
        vehicle_quantity: 4,
        po_weight: 40000,
        received_lorries: 1,
        po_received_weight: 9500,
        pending_lorries: 3,
        po_pending_weight: 30500,
        returned_lorries: 1,
        returned_weight: 9000,
      },
      { ...detail, jute_po_id: 13300, party_name: "KISHAN KOTHARI", vehicle_quantity: 2, po_weight: 20000 },
    ];
    const rows = buildSupplierGridRows(
      [supplier, { ...supplier, party_name: "KISHAN KOTHARI" }],
      bucket(),
      items,
    );
    expect(rows[0]).toMatchObject({
      order_lorries: 9,
      order_wt_mt: 90,
      received_lorries: 3,
      received_wt_mt: 30,
      returned_lorries: 1,
      returned_wt_mt: 9,
      pending_lorries: 6,
      pending_wt_mt: 61,
      order_lw: "9 (90)",
      recv_lw: "3 (30)",
      returned_lw: "1 (9)",
      bal_lw: "6 (61)",
    });
    expect(rows[1]).toMatchObject({ order_lorries: 2, order_wt_mt: 20, returned_lw: "" });
    // Grand total spans every PO once.
    expect(rows[2]).toMatchObject({ order_lorries: 11, order_wt_mt: 110, returned_lorries: 1 });
  });
});

describe("buildPoGridRows (one row per PO)", () => {
  const items: PoPositionDetailRow[] = [
    detail, // D TD 6 ×250 BALE, balance_value 3015000
    {
      ...detail,
      item_id: 269847,
      item_name: "D TD 5",
      ordered_qty: 83.333,
      balance_value: 500000,
      ordered_value: 600000,
      last_receipt_date: "2026-09-22",
      stale: true,
    },
    {
      ...detail,
      jute_po_id: 13261,
      po_label: "B",
      party_name: "KISHAN KOTHARI",
      vehicle_quantity: null,
      po_weight: null,
      po_pending_weight: null,
      returned_lorries: 2,
      returned_weight: 18400,
      balance_value: null,
      settle_suggest: true,
    },
  ];

  it("groups item rows by PO in first-seen order and lists the qualities", () => {
    const rows = buildPoGridRows(items);
    expect(rows.map((r) => r.id)).toEqual(["13260", "13261"]);
    // One quality per line (grid wraps, Excel wrapText, autotable breaks on \n).
    expect(rows[0].qualities).toBe("D TD 6 ×250 bl\nD TD 5 ×83.333 bl");
    expect(rows[1].qualities).toBe("D TD 6 ×250 bl");
    expect(rows[0].item_ids).toEqual([269848, 269847]);
  });

  it("reads PO-level lorries and weights once and sums item values", () => {
    const [po] = buildPoGridRows(items);
    expect(po).toMatchObject({
      order_lorries: 5,
      order_wt_mt: 50,
      received_lorries: 2,
      received_wt_mt: 20,
      returned_lorries: 0,
      returned_wt_mt: 0,
      pending_lorries: 3,
      pending_wt_mt: 30,
      order_lw: "5 (50)",
      recv_lw: "2 (20)",
      returned_lw: "",
      bal_lw: "3 (30)",
      balance_pct: 60,
      balance_value: 3515000,
      ordered_value: 5625000,
      last_receipt_date: "2026-09-22",
      stale: true,
      stale_label: "Yes",
      settle_label: "",
    });
  });

  it("handles a PO without lorry data and shows returned lorries", () => {
    const po = buildPoGridRows(items)[1];
    expect(po.order_lw).toBe(""); // no lorries and no weight → blank cell
    expect(po.balance_pct).toBeNull();
    expect(po.balance_value).toBeNull();
    expect(po.returned_lw).toBe("2 (18)");
    expect(po.settle_label).toBe("Yes");
    expect(po.stale_label).toBe("");
  });

  it("filters PO rows by supplier or by any item of the PO", () => {
    const rows = buildPoGridRows(items);
    expect(filterPoRows(rows, null)).toHaveLength(2);
    expect(
      filterPoRows(rows, { kind: "quality", item_id: 269847, label: "D TD 5" }).map((r) => r.id),
    ).toEqual(["13260"]);
    expect(
      filterPoRows(rows, { kind: "supplier", party_name: "KISHAN KOTHARI", label: "x" }).map((r) => r.id),
    ).toEqual(["13261"]);
  });
});

describe("lorry helpers", () => {
  it("formats lorry-and-weight labels", () => {
    expect(lorryLabel(5, 70)).toBe("5 (70)");
    expect(lorryLabel(12, 1533)).toBe("12 (1,533)");
    expect(lorryLabel(null, 70)).toBe("— (70)");
    expect(lorryLabel(null, null)).toBe("");
  });

  it("shortens UOMs for the qualities text", () => {
    expect(uomShort("BALE")).toBe("bl");
    expect(uomShort("Drum")).toBe("dr");
    expect(uomShort("QUINTAL")).toBe("qtl");
    expect(uomShort("Nos")).toBe("nos");
    expect(uomShort(null)).toBe("");
  });

  it("formats qualities with and without quantities", () => {
    expect(
      formatQualities([
        { item_name: "D TD 6", ordered_qty: 250, po_uom: "BALE" },
        { item_name: "TD4", ordered_qty: null, po_uom: "BALE" },
        { item_name: null, ordered_qty: 10, po_uom: null },
      ]),
    ).toBe("D TD 6 ×250 bl, TD4, — ×10");
    expect(
      formatQualities(
        [
          { item_name: "A", ordered_qty: 1, po_uom: "BALE" },
          { item_name: "B", ordered_qty: 2, po_uom: "BALE" },
        ],
        "\n",
      ),
    ).toBe("A ×1 bl\nB ×2 bl");
  });

  it("lorrySummary counts each PO once", () => {
    const s = lorrySummary([detail, { ...detail, item_id: 1 }, { ...detail, jute_po_id: 2, vehicle_quantity: 1, po_weight: 10000 }]);
    expect(s.order_lorries).toBe(6);
    expect(s.order_wt_mt).toBe(60);
    expect(lorrySummary([]).order_lorries).toBe(0);
  });

  it("words the tolerance fraction", () => {
    expect(lorryFractionText(0.5)).toBe("half a lorry");
    expect(lorryFractionText(0.25)).toBe("a quarter of a lorry");
    expect(lorryFractionText(1)).toBe("one lorry");
    expect(lorryFractionText(0.4)).toBe("0.4 of a lorry");
  });
});

describe("buildDetailGridRows", () => {
  it("keys rows by PO and item and labels overdue as text", () => {
    const rows = buildDetailGridRows([detail, { ...detail, overdue: false, item_id: 1 }]);
    expect(rows[0].id).toBe("13260-269848");
    expect(rows[0].overdue_label).toBe("Yes");
    expect(rows[1].id).toBe("13260-1");
    expect(rows[1].overdue_label).toBe("");
  });

  it("uses 0 for a null item id", () => {
    expect(buildDetailGridRows([{ ...detail, item_id: null }])[0].id).toBe("13260-0");
  });

  it("converts item and PO weights to whole MT and labels stale / settle", () => {
    const [row] = buildDetailGridRows([{ ...detail, stale: true, settle_suggest: true }]);
    expect(row).toMatchObject({
      ordered_mt: 38,
      received_mt: 15,
      balance_mt: 23,
      po_weight_mt: 50,
      po_received_mt: 20,
      po_pending_mt: 30,
      stale_label: "Yes",
      settle_label: "Yes",
    });
  });

  it("leaves the settlement labels blank when the backend has not sent them", () => {
    const [row] = buildDetailGridRows([detail]);
    expect(row.stale_label).toBe("");
    expect(row.settle_label).toBe("");
    expect(buildDetailGridRows([{ ...detail, ordered_wt: null }])[0].ordered_mt).toBeNull();
  });
});

describe("MT conversion", () => {
  it("divides kg by 1000 and rounds to a whole tonne", () => {
    expect(toMt(1533252)).toBe(1533);
    expect(toMt(22500)).toBe(23);
    expect(toMt(499)).toBe(0);
    expect(toMt(0)).toBe(0);
    expect(toMt(null)).toBeNull();
    expect(toMt(undefined)).toBeNull();
    expect(toMt(Number.NaN)).toBeNull();
  });

  it("maps the three bucket weights", () => {
    expect(bucketMt(bucket())).toEqual({ ordered_mt: 58, received_mt: 15, balance_mt: 43 });
  });
});

describe("formatters", () => {
  it("formats kg as whole MT with Indian grouping", () => {
    expect(fmtWt(1533252)).toBe("1,533");
    expect(fmtWt(22500.4)).toBe("23");
    expect(fmtWt(1234567890)).toBe("12,34,568");
    expect(fmtWt(null)).toBe("—");
  });

  it("formats rupees", () => {
    expect(fmtInr(171978763.48)).toBe("₹ 17,19,78,763");
    expect(fmtInr(undefined)).toBe("—");
  });

  it("formats percentages", () => {
    expect(fmtPct(82.87)).toBe("82.87%");
    expect(fmtPct(100)).toBe("100.00%");
    expect(fmtPct(null)).toBe("—");
  });
});

describe("filterDetailRows", () => {
  const rows = buildDetailGridRows([
    detail,
    { ...detail, item_id: 1, item_name: "TD4", party_name: "KISHAN KOTHARI" },
    { ...detail, item_id: null, party_name: null },
  ]);

  it("returns every row when there is no filter", () => {
    expect(filterDetailRows(rows, null)).toHaveLength(3);
  });

  it("narrows to one quality by item id", () => {
    const out = filterDetailRows(rows, { kind: "quality", item_id: 1, label: "TD4" });
    expect(out.map((r) => r.item_name)).toEqual(["TD4"]);
    expect(filterDetailRows(rows, { kind: "quality", item_id: null, label: "?" })).toHaveLength(1);
  });

  it("narrows to one supplier, including the unnamed one", () => {
    expect(
      filterDetailRows(rows, { kind: "supplier", party_name: "SUKUMAR SAHA", label: "SUKUMAR SAHA" }),
    ).toHaveLength(1);
    expect(filterDetailRows(rows, { kind: "supplier", party_name: null, label: "—" })).toHaveLength(1);
  });
});

describe("supplier filter", () => {
  // Two POs for SUKUMAR SAHA (one with two item rows), one for KISHAN KOTHARI.
  const rows: PoPositionDetailRow[] = [
    detail, // 13260 / D TD 6 / balance 22500 @ 13400, overdue
    {
      ...detail,
      item_id: 269847,
      item_name: "D TD 5",
      ordered_wt: 10000,
      received_wt: 0,
      balance_wt: 10000,
      po_rate: 10000,
      ordered_qty: 50,
      received_qty: 0,
      balance_qty: 50,
      ordered_value: 500000,
      balance_value: 500000,
      stale: true,
    },
    {
      ...detail,
      jute_po_id: 13261,
      po_label: "EJM/F/JPO/26-27/00048",
      po_date: "2026-08-15",
      overdue: false,
      ordered_wt: 5000,
      received_wt: 5000,
      balance_wt: 0,
      po_rate: 9000,
      ordered_qty: 25,
      received_qty: 25,
      balance_qty: 0,
      ordered_value: 225000,
      balance_value: 0,
      settle_suggest: true,
    },
    {
      ...detail,
      jute_po_id: 13300,
      po_label: "EJM/F/JPO/26-27/00090",
      party_name: "KISHAN KOTHARI",
      po_date: "2026-07-01",
      ordered_wt: 20000,
      received_wt: 2000,
      balance_wt: 18000,
      po_rate: 12000,
      ordered_value: 2400000,
      balance_value: 2160000,
    },
  ];

  it("lists each supplier once, skipping unnamed, in report order", () => {
    expect(
      supplierOptions([
        supplier,
        { ...supplier, party_name: "KISHAN KOTHARI" },
        { ...supplier, party_name: "SUKUMAR SAHA" },
        { ...supplier, party_name: null },
        { ...supplier, party_name: "  " },
      ]),
    ).toEqual([{ party_name: "SUKUMAR SAHA" }, { party_name: "KISHAN KOTHARI" }]);
  });

  it("re-aggregates totals: sums, distinct PO counts, weighted rate, pct", () => {
    const { totals } = aggregateDetailRows(rows);
    expect(totals.po_count).toBe(3);
    expect(totals.overdue_pos).toBe(2); // 13260 (both rows) + 13300
    expect(totals.stale_pos).toBe(1);
    expect(totals.settle_suggest_pos).toBe(1);
    // Lorry figures counted once per distinct PO (13260 has two item rows).
    expect(totals.order_lorries).toBe(15);
    expect(totals.received_lorries).toBe(6);
    expect(totals.pending_lorries).toBe(9);
    expect(totals.returned_lorries).toBe(0);
    expect(totals.ordered_wt).toBe(37500 + 10000 + 5000 + 20000);
    expect(totals.balance_wt).toBe(22500 + 10000 + 18000);
    expect(totals.balance_value).toBe(3015000 + 500000 + 2160000);
    expect(totals.balance_pct).toBe(Math.round((50500 / 72500) * 10000) / 100);
    // Balance-weighted rate: rows with zero balance do not count.
    const expectedRate = (22500 * 13400 + 10000 * 10000 + 18000 * 12000) / 50500;
    expect(totals.avg_rate).toBe(Math.round(expectedRate * 100) / 100);
  });

  it("groups by quality and by supplier with oldest PO date", () => {
    const { by_quality, by_supplier } = aggregateDetailRows(rows);
    expect(by_quality.map((q) => q.item_name)).toEqual(["D TD 6", "D TD 5"]);
    const td6 = by_quality[0];
    expect(td6.po_count).toBe(3);
    expect(td6.balance_wt).toBe(22500 + 18000);

    expect(by_supplier.map((s) => s.party_name)).toEqual(["SUKUMAR SAHA", "KISHAN KOTHARI"]);
    const saha = by_supplier[0];
    expect(saha.po_count).toBe(2);
    expect(saha.overdue_pos).toBe(1);
    expect(saha.oldest_po_date).toBe("2026-08-15");
    expect(saha.avg_rate).toBe(Math.round(((22500 * 13400 + 10000 * 10000) / 32500) * 100) / 100);
  });

  it("returns empty sections and zero totals for no rows", () => {
    const out = aggregateDetailRows([]);
    expect(out.by_quality).toEqual([]);
    expect(out.by_supplier).toEqual([]);
    expect(out.totals.po_count).toBe(0);
    expect(out.totals.balance_pct).toBeNull();
    expect(out.totals.avg_rate).toBeNull();
  });

  const report: PoPositionReport = {
    as_on: "2026-09-25",
    branch_id: 2,
    branch_name: "Factory",
    detail: rows,
    by_quality: [quality],
    by_supplier: [supplier],
    totals: bucket({ po_count: 99 }),
  };

  it("applySupplierFilter narrows detail and re-aggregates every section", () => {
    const out = applySupplierFilter(report, {
      kind: "supplier",
      party_name: "KISHAN KOTHARI",
      label: "KISHAN KOTHARI",
    });
    expect(out.detail.map((d) => d.jute_po_id)).toEqual([13300]);
    expect(out.totals.po_count).toBe(1);
    expect(out.totals.balance_wt).toBe(18000);
    expect(out.by_supplier).toHaveLength(1);
    expect(out.by_quality).toHaveLength(1);
    expect(out.as_on).toBe("2026-09-25");
  });

  it("applySupplierFilter leaves the report alone for no filter or a quality drill", () => {
    expect(applySupplierFilter(report, null)).toBe(report);
    expect(applySupplierFilter(report, { kind: "quality", item_id: 1, label: "x" })).toBe(report);
  });
});

describe("PO-level selection", () => {
  const rows = buildDetailGridRows([
    detail,
    { ...detail, item_id: 1 }, // second item row of the same PO
    { ...detail, jute_po_id: 13261, po_label: "B" },
    { ...detail, jute_po_id: 13262, po_label: "C" },
  ]);

  it("lists distinct PO ids in row order", () => {
    expect(distinctPoIds(rows)).toEqual([13260, 13261, 13262]);
  });

  it("toggles one PO in and out without mutating the input", () => {
    const empty = new Set<number>();
    const one = togglePoSelection(empty, 13260);
    expect([...one]).toEqual([13260]);
    expect(empty.size).toBe(0);
    expect(togglePoSelection(one, 13260).size).toBe(0);
    expect([...togglePoSelection(one, 13262)]).toEqual([13260, 13262]);
  });

  it("selects every visible PO, then clears them all when all are ticked", () => {
    const all = toggleAllPoSelection(new Set(), rows);
    expect([...all]).toEqual([13260, 13261, 13262]);
    expect(toggleAllPoSelection(all, rows).size).toBe(0);
    // Partially selected → completes the selection.
    expect(toggleAllPoSelection(new Set([13261]), rows).size).toBe(3);
    // Nothing visible → nothing happens.
    expect(toggleAllPoSelection(new Set([1]), []).size).toBe(1);
  });

  it("prunes POs that left the visible rows", () => {
    const kept = pruneSelection(new Set([13260, 13262, 99999]), rows);
    expect([...kept]).toEqual([13260, 13262]);
  });
});

describe("detailRowClass", () => {
  it("tints stale red, overdue amber, otherwise nothing", () => {
    expect(detailRowClass({ overdue: true, stale: true })).toBe("report-perf-low");
    expect(detailRowClass({ overdue: true, stale: false })).toBe("report-perf-watch");
    expect(detailRowClass({ overdue: true })).toBe("report-perf-watch");
    expect(detailRowClass({ overdue: false, stale: false })).toBe("");
  });
});

describe("ruleCaption", () => {
  it("builds the rev-2 one-liner from the lorry-fraction rule", () => {
    expect(
      ruleCaption({ lorry_rule_enabled: true, tolerance_lorry_fraction: 0.5, stale_days: 30, is_default: true }),
    ).toBe(
      "Settles when all lorries are received or weight is within half a lorry of the PO · stale after 30 days without receipt",
    );
    expect(
      ruleCaption({ lorry_rule_enabled: false, tolerance_lorry_fraction: 0.25, stale_days: 1, is_default: false }),
    ).toBe("Settles when weight is within a quarter of a lorry of the PO · stale after 1 day without receipt");
  });

  it("falls back to the percentage wording while the backend still sends weight_tolerance_pct", () => {
    expect(
      ruleCaption({ lorry_rule_enabled: true, weight_tolerance_pct: 5, stale_days: 30, is_default: true }),
    ).toBe(
      "Settles when all lorries are received or weight ≥ 95% of PO · stale after 30 days without receipt",
    );
  });

  it("copes with a rule that has no weight tolerance at all", () => {
    expect(ruleCaption({ lorry_rule_enabled: true, stale_days: 45, is_default: false })).toBe(
      "Settles when all lorries are received · stale after 45 days without receipt",
    );
    expect(ruleCaption({ lorry_rule_enabled: false, stale_days: 45, is_default: false })).toBe(
      "Settles only by manual close · stale after 45 days without receipt",
    );
  });

  it("is null without a rule", () => {
    expect(ruleCaption(null)).toBeNull();
    expect(ruleCaption(undefined)).toBeNull();
  });
});

describe("result summaries", () => {
  it("summarises a bulk close with and without skips", () => {
    expect(summarizeBulkClose({ closed: [1, 2, 3], skipped: [] })).toBe("Closed 3 POs");
    expect(
      summarizeBulkClose({ closed: [1], skipped: [{ jute_po_id: 7, reason: "not live" }] }),
    ).toBe("Closed 1 PO; skipped 1 (7: not live)");
    expect(summarizeBulkClose(null)).toBe("Closed 0 POs");
  });

  it("summarises a recompute", () => {
    expect(summarizeRecompute({ closed: 2, reopened: 1, unchanged: 40 })).toBe("closed 2, reopened 1");
    expect(summarizeRecompute(undefined)).toBe("closed 0, reopened 0");
  });
});

describe("tabs", () => {
  it("lists PO Detail first and names each tab's export", () => {
    expect(TABS).toEqual(["detail", "supplier", "quality"]);
    expect(tabExportName("detail")).toEqual({ title: "PO-wise", slug: "po-wise" });
    expect(tabExportName("supplier")).toEqual({ title: "Supplier-wise", slug: "supplier-wise" });
    expect(tabExportName("quality")).toEqual({ title: "Quality-wise", slug: "quality-wise" });
  });
});
