import { describe, expect, it } from "vitest";
import type { QualityRow, SelectionVsIssueReport } from "./types";
import {
  GRAND_TOTAL_ID,
  GRAND_TOTAL_LABEL,
  SECTION_DAY,
  SECTION_GATE,
  SECTION_QUALITY,
  buildDayGridRows,
  buildGateGridRows,
  buildGrandTotalRow,
  buildQualityGridRows,
  diffPct,
  flattenForExcel,
  fmtSignedPct,
  resolveTotals,
  totalsFromByQuality,
  validateRange,
} from "./selectionVsIssueUtils";

function q(over: Partial<QualityRow>): QualityRow {
  return {
    item_id: 1,
    item_code: "RJ-1",
    item_name: "D TD 5",
    issue_kg: 1000,
    selection_kg: 950,
    trolleys: 5,
    diff_kg: -50,
    diff_pct: -5,
    ...over,
  };
}

const report: SelectionVsIssueReport = {
  date_from: "2026-01-01",
  date_to: "2026-01-31",
  branch_id: 2,
  branch_name: "Factory",
  by_quality: [
    q({ item_id: 1, item_name: "D TD 5", issue_kg: 1000, selection_kg: 950, trolleys: 5, diff_kg: -50, diff_pct: -5 }),
    q({ item_id: 2, item_name: "D TD 6", issue_kg: 0, selection_kg: 120.5, trolleys: 1, diff_kg: 120.5, diff_pct: null }),
    q({ item_id: 3, item_name: "M6", issue_kg: 400.25, selection_kg: 0, trolleys: 0, diff_kg: -400.25, diff_pct: -100 }),
  ],
  by_day: [
    { tran_date: "2026-01-20", item_id: 1, item_name: "D TD 5", issue_kg: 600, selection_kg: 500, trolleys: 3, diff_kg: -100 },
    { tran_date: "2026-01-21", item_id: 1, item_name: "D TD 5", issue_kg: 400, selection_kg: 450, trolleys: 2, diff_kg: 50 },
  ],
  by_gate_entry: [
    { jute_mr_id: 120, gate_entry_no: 36, gate_entry_date: "2026-01-20", item_id: 1, item_name: "D TD 5", issue_kg: 600, selection_kg: 500, trolleys: 3, diff_kg: -100 },
  ],
};

describe("diffPct", () => {
  it("is null when nothing was issued", () => {
    expect(diffPct(120.5, 0)).toBeNull();
  });
  it("is 2dp of diff / issue × 100", () => {
    expect(diffPct(-50, 1000)).toBe(-5);
    expect(diffPct(1, 3)).toBe(33.33);
  });
});

describe("totalsFromByQuality", () => {
  it("sums both sides and trolleys, recomputes diff and pct", () => {
    const t = totalsFromByQuality(report.by_quality);
    expect(t).toEqual({
      issue_kg: 1400.25,
      selection_kg: 1070.5,
      trolleys: 6,
      diff_kg: -329.75,
      diff_pct: -23.55,
    });
  });
  it("gives zeros and a null pct for no rows", () => {
    expect(totalsFromByQuality([])).toEqual({
      issue_kg: 0,
      selection_kg: 0,
      trolleys: 0,
      diff_kg: 0,
      diff_pct: null,
    });
  });
  it("pct is null when only selection exists", () => {
    const t = totalsFromByQuality([q({ issue_kg: 0, selection_kg: 10, diff_kg: 10, diff_pct: null })]);
    expect(t.diff_kg).toBe(10);
    expect(t.diff_pct).toBeNull();
  });
  it("rounds weights to 3dp without float noise", () => {
    const t = totalsFromByQuality([
      q({ issue_kg: 0.1, selection_kg: 0.2 }),
      q({ item_id: 2, issue_kg: 0.2, selection_kg: 0.1 }),
    ]);
    expect(t.issue_kg).toBe(0.3);
    expect(t.selection_kg).toBe(0.3);
    expect(t.diff_kg).toBe(0);
    expect(t.diff_pct).toBe(0);
  });
});

describe("resolveTotals", () => {
  it("prefers the API totals when present", () => {
    const totals = { issue_kg: 1, selection_kg: 2, trolleys: 3, diff_kg: 1, diff_pct: 100 };
    expect(resolveTotals({ ...report, totals })).toBe(totals);
  });
  it("derives from by_quality when the API omits them", () => {
    expect(resolveTotals(report).issue_kg).toBe(1400.25);
  });
});

describe("buildGrandTotalRow / buildQualityGridRows", () => {
  it("appends a Grand Total row the report kit recognises", () => {
    const rows = buildQualityGridRows(report.by_quality);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.id)).toEqual(["q:1", "q:2", "q:3", GRAND_TOTAL_ID]);
    const total = rows[3];
    expect(total.item_name).toBe(GRAND_TOTAL_LABEL);
    expect(total.item_code).toBe("");
    expect(total.issue_kg).toBe(1400.25);
    expect(total.selection_kg).toBe(1070.5);
    expect(total.trolleys).toBe(6);
    expect(total.diff_kg).toBe(-329.75);
    expect(total.diff_pct).toBe(-23.55);
  });
  it("does not emit a lone Grand Total for an empty report", () => {
    expect(buildQualityGridRows([])).toEqual([]);
  });
  it("Grand Total diff_pct is null when nothing was issued", () => {
    const total = buildGrandTotalRow([q({ issue_kg: 0, selection_kg: 5, diff_kg: 5, diff_pct: null })]);
    expect(total.diff_pct).toBeNull();
  });
});

describe("day / gate grid rows", () => {
  it("keys day rows by date + item", () => {
    expect(buildDayGridRows(report.by_day).map((r) => r.id)).toEqual([
      "d:2026-01-20:1",
      "d:2026-01-21:1",
    ]);
  });
  it("keys gate rows by MR + item", () => {
    expect(buildGateGridRows(report.by_gate_entry ?? []).map((r) => r.id)).toEqual(["g:120:1"]);
  });
});

describe("flattenForExcel", () => {
  it("stacks the three sections with the Grand Total and spacer rows", () => {
    const rows = flattenForExcel(report);
    // 3 quality + total, spacer, 2 day, spacer, 1 gate
    expect(rows).toHaveLength(4 + 1 + 2 + 1 + 1);
    expect(rows.filter((r) => r.section === SECTION_QUALITY)).toHaveLength(4);
    expect(rows.filter((r) => r.section === SECTION_DAY)).toHaveLength(2);
    expect(rows.filter((r) => r.section === SECTION_GATE)).toHaveLength(1);
    expect(rows[3].item_name).toBe(GRAND_TOTAL_LABEL);
    expect(rows[4].section).toBe("");
    expect(rows[4].issue_kg).toBeNull();
    const gate = rows[rows.length - 1];
    expect(gate.gate_entry_no).toBe("36");
    expect(gate.gate_entry_date).toBe("2026-01-20");
    expect(gate.diff_pct).toBeNull();
  });
  it("blanks null-able text fields and keeps ids unique", () => {
    const rows = flattenForExcel({
      ...report,
      by_gate_entry: [
        { ...(report.by_gate_entry ?? [])[0], gate_entry_no: null, gate_entry_date: null },
      ],
    });
    const gate = rows[rows.length - 1];
    expect(gate.gate_entry_no).toBe("");
    expect(gate.gate_entry_date).toBe("");
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
  it("omits absent sections without stray spacers", () => {
    const rows = flattenForExcel({ ...report, by_day: [], by_gate_entry: undefined });
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.section === SECTION_QUALITY)).toBe(true);
  });
});

describe("validateRange", () => {
  it("accepts a normal range", () => {
    expect(validateRange("2026-01-01", "2026-01-31")).toBeNull();
  });
  it("rejects To before From", () => {
    expect(validateRange("2026-01-31", "2026-01-01")).toMatch(/on or after/);
  });
  it("rejects more than 366 days", () => {
    expect(validateRange("2025-01-01", "2026-01-02")).toMatch(/366/);
    expect(validateRange("2025-01-01", "2026-01-01")).toBeNull();
  });
  it("rejects missing dates", () => {
    expect(validateRange("", "2026-01-01")).toMatch(/required/);
  });
});

describe("fmtSignedPct", () => {
  it("signs positives, keeps negatives, dashes null", () => {
    expect(fmtSignedPct(2.081)).toBe("+2.08 %");
    expect(fmtSignedPct(-0.594)).toBe("-0.59 %");
    expect(fmtSignedPct(null)).toBe("—");
  });
});
