import { describe, expect, it } from "vitest";
import type { GridColDef } from "@mui/x-data-grid";
import { pdfCellText } from "./exportPdf";

type Row = { id: number; state: string; eb_no: string | null; eb_id: number | null; qty: number | null };

const row: Row = { id: 1, state: "not_synced", eb_no: null, eb_id: 42, qty: 12.5 };

describe("pdfCellText", () => {
  it("takes the raw field when the column has no getter/formatter", () => {
    expect(pdfCellText({ field: "state" } as GridColDef<Row>, row)).toBe("not_synced");
  });

  it("applies valueGetter (the State / EB No columns depend on it)", () => {
    const col: GridColDef<Row> = {
      field: "eb_no",
      valueGetter: (_, r) => r.eb_no ?? (r.eb_id != null ? String(r.eb_id) : ""),
    };
    expect(pdfCellText(col, row)).toBe("42");
  });

  it("applies valueFormatter so numbers print like the grid (numCol's shape)", () => {
    const col: GridColDef<Row> = {
      field: "qty",
      type: "number",
      valueFormatter: (v: unknown) => (v == null ? "" : Number(v).toFixed(2)),
    };
    expect(pdfCellText(col, row)).toBe("12.50");
    expect(pdfCellText(col, { ...row, qty: null })).toBe("");
  });
});
