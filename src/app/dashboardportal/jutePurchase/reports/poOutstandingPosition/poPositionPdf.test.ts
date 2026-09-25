import { describe, expect, it } from "vitest";
import type { GridColDef } from "@mui/x-data-grid";
import { numCol } from "@/components/reports/ReportGrid";
import {
  PDF_EXCLUDED_FIELDS,
  pdfDataColumns,
  pdfSubtitle,
  pdfTableFromSection,
} from "./poPositionPdf";

type Row = { id: string; name: string; balance_mt: number | null; bal_lw: string; returned_lorries: number | null };

const rows: Row[] = [
  { id: "a", name: "SUKUMAR SAHA", balance_mt: 1533, bal_lw: "12 (1,533)", returned_lorries: 0 },
  { id: "grand-total", name: "Grand Total", balance_mt: 2000, bal_lw: "20 (2,000)", returned_lorries: 1 },
];

const columns: GridColDef<Row>[] = [
  { field: "__select", headerName: "", renderCell: () => null },
  { field: "name", headerName: "Supplier" },
  numCol<Row>("balance_mt", "Bal Wt (MT)", 110, 0),
  { field: "bal_lw", headerName: "Bal Lorry (Wt)", align: "right" },
  { field: "__close", headerName: "", renderCell: () => null },
];

describe("pdfDataColumns", () => {
  it("drops widget-only columns (checkbox / Close) and keeps data columns", () => {
    expect(pdfDataColumns(columns, rows[0]).map((c) => c.field)).toEqual([
      "name",
      "balance_mt",
      "bal_lw",
    ]);
  });

  it("drops Bal Value, Stale and Settle? from the print but nothing else", () => {
    type R = Row & { balance_value: number; stale_label: string; settle_label: string };
    const cols: GridColDef<R>[] = [
      { field: "name", headerName: "Supplier" },
      numCol<R>("balance_value", "Bal Value", 120, 0),
      { field: "stale_label", headerName: "Stale" },
      { field: "settle_label", headerName: "Settle?" },
      numCol<R>("balance_mt", "Bal Wt (MT)", 110, 0),
    ];
    const sample: R = { ...rows[0], balance_value: 1, stale_label: "Yes", settle_label: "" };
    expect(pdfDataColumns(cols, sample).map((c) => c.field)).toEqual(["name", "balance_mt"]);
    expect([...PDF_EXCLUDED_FIELDS]).toEqual(["balance_value", "stale_label", "settle_label"]);
    // An explicit exclusion list overrides the default.
    expect(pdfDataColumns(cols, sample, new Set()).map((c) => c.field)).toHaveLength(5);
  });
});

describe("pdfTableFromSection", () => {
  it("renders cells as the grid displays them and marks the total row", () => {
    const t = pdfTableFromSection({
      title: "Supplier-wise",
      columns,
      rows,
      isTotalRow: (r) => r.id === "grand-total",
    });
    expect(t.title).toBe("Supplier-wise");
    expect(t.head).toEqual(["Supplier", "Bal Wt (MT)", "Bal Lorry (Wt)"]);
    expect(t.body).toEqual([
      ["SUKUMAR SAHA", "1533", "12 (1,533)"],
      ["Grand Total", "2000", "20 (2,000)"],
    ]);
    expect(t.totalRows).toEqual([1]);
    expect(t.aligns).toEqual(["left", "right", "left"]);
  });

  it("copes with an empty section", () => {
    const t = pdfTableFromSection({ title: "PO-wise", columns, rows: [] });
    expect(t.body).toEqual([]);
    expect(t.totalRows).toEqual([]);
    expect(t.head.length).toBeGreaterThan(0);
  });
});

describe("pdfSubtitle", () => {
  it("joins branch, period, report number and generated time", () => {
    const now = new Date(2026, 8, 25, 10, 30);
    const s = pdfSubtitle(
      { branchName: "Factory", reportFor: "As on 2026-09-25 · Supplier: X", reportNo: 87 },
      now,
    );
    expect(s).toContain("Branch: Factory");
    expect(s).toContain("Period: As on 2026-09-25 · Supplier: X");
    expect(s).toContain("Report No: 87");
    expect(s).toContain(`Generated: ${now.toLocaleString()}`);
  });

  it("omits what is missing", () => {
    const s = pdfSubtitle({ reportNo: null }, new Date(2026, 0, 1));
    expect(s.startsWith("Generated:")).toBe(true);
  });
});
