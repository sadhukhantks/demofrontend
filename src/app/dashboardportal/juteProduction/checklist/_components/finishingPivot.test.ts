import { describe, expect, it } from "vitest";
import type { FinishingChecklistRow } from "@/utils/juteProductionReportService";
import { buildFinishingPivot } from "./finishingPivot";

function row(p: Partial<FinishingChecklistRow>): FinishingChecklistRow {
  return {
    row_id: `${p.tran_date}|${p.spell_code}|${p.eb_no}|${p.quality}`,
    tran_date: "2026-08-02",
    spell_id: 1,
    spell_code: "A1",
    eb_id: 1,
    eb_no: "E1",
    worker_name: "BALI",
    designation: null,
    quality: "HEMMING-1 - 7801",
    net_hours: 8,
    prod_qty: 0,
    prod_wt_kg: 0,
    remarks: "",
    ...p,
  };
}

describe("buildFinishingPivot", () => {
  it("pivots worker/spell/quality Ã— day with row, day and grand totals", () => {
    const pivot = buildFinishingPivot([
      row({ tran_date: "2026-08-04", prod_qty: 110 }),
      row({ tran_date: "2026-08-02", prod_qty: 100 }),
      // same worker, other quality â†’ separate line
      row({ tran_date: "2026-08-02", quality: "Hemming joints - 7808", prod_qty: 17 }),
      // attendance-only row (no production) â†’ dropped, day 06 never appears
      row({ tran_date: "2026-08-06", eb_no: "E2", worker_name: "ANIL", quality: null }),
      row({ tran_date: "2026-08-04", eb_no: "E2", worker_name: "ANIL", prod_qty: 85 }),
    ]);

    expect(pivot.days).toEqual(["2026-08-02", "2026-08-04"]);
    expect(pivot.dayLabels).toEqual(["2", "4"]);
    // Name, then quality via localeCompare — "Hemming joints" sorts before
    // "HEMMING-1" (space < hyphen, case secondary), same as Excel's pivot order.
    expect(pivot.lines.map((l) => [l.name, l.quality, l.cells, l.total])).toEqual([
      ["ANIL", "HEMMING-1 - 7801", [null, 85], 85],
      ["BALI", "Hemming joints - 7808", [17, null], 17],
      ["BALI", "HEMMING-1 - 7801", [100, 110], 210],
    ]);
    expect(pivot.dayTotals).toEqual([117, 195]);
    expect(pivot.grandTotal).toBe(312);
  });

  it("spans every calendar day of the report period when a range is given", () => {
    const pivot = buildFinishingPivot(
      [
        row({ tran_date: "2026-08-05", prod_qty: 85 }),
        // outside the range → ignored, not a column
        row({ tran_date: "2026-09-01", prod_qty: 999 }),
      ],
      "2026-08-01",
      "2026-08-07",
    );
    expect(pivot.dayLabels).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(pivot.lines[0].cells).toEqual([null, null, null, null, 85, null, null]);
    expect(pivot.lines[0].total).toBe(85);
    expect(pivot.grandTotal).toBe(85);
  });

  it("labels days MM-DD when the range crosses a month", () => {
    const pivot = buildFinishingPivot([
      row({ tran_date: "2026-07-31", prod_qty: 1 }),
      row({ tran_date: "2026-08-01", prod_qty: 1 }),
    ]);
    expect(pivot.dayLabels).toEqual(["07-31", "08-01"]);
  });

  it("handles an empty input", () => {
    expect(buildFinishingPivot([])).toEqual({
      days: [],
      dayLabels: [],
      lines: [],
      dayTotals: [],
      grandTotal: 0,
    });
  });
});
