import { describe, expect, it } from "vitest";
import type { GridColDef } from "@mui/x-data-grid";
import { gridCellText, materializeGridRows } from "./gridExportRows";

type Row = {
  id: number;
  frame: string;
  perf: "low" | "ok";
  per_date: Record<string, number | null>;
  avg: number | null;
  rows?: number;
  target_rows?: number;
};

const COLS: GridColDef<Row>[] = [
  {
    field: "perf",
    headerName: "Status",
    valueFormatter: (v: string) => (v === "low" ? "LOW" : ""),
  },
  { field: "frame", headerName: "Frame" },
  {
    field: "date_2026-09-01",
    headerName: "09-01",
    type: "number",
    valueGetter: (_, row) => row.per_date?.["2026-09-01"] ?? null,
    valueFormatter: (v: unknown) => (v == null ? "" : Number(v).toFixed(2)),
  },
  {
    field: "avg",
    headerName: "Avg",
    type: "number",
    valueFormatter: (v: unknown) => (v == null ? "" : Number(v).toFixed(2)),
  },
  {
    field: "target_rows",
    headerName: "Frames with target",
    valueGetter: (_, row) => `${row.target_rows ?? 0} of ${row.rows ?? 0}`,
  },
  { field: "actions", headerName: "" },
];

const ROWS: Row[] = [
  { id: 1, frame: "F1", perf: "low", per_date: { "2026-09-01": 12.345 }, avg: 12.345, rows: 4, target_rows: 2 },
  { id: 2, frame: "F2", perf: "ok", per_date: {}, avg: null },
];

describe("materializeGridRows", () => {
  it("resolves valueGetter columns and keeps numeric columns numeric", () => {
    const { columns, rows } = materializeGridRows(COLS, ROWS);
    expect(columns.map((c) => c.field)).toEqual([
      "perf",
      "frame",
      "date_2026-09-01",
      "avg",
      "target_rows",
    ]); // the widget-only "actions" column is dropped
    expect(rows[0]["date_2026-09-01"]).toBe(12.345);
    expect(rows[0].avg).toBe(12.345);
    expect(rows[1]["date_2026-09-01"]).toBeNull();
    expect(rows[1].avg).toBeNull();
  });

  it("uses the formatter text for non-numeric columns", () => {
    const { rows } = materializeGridRows(COLS, ROWS);
    expect(rows[0].perf).toBe("LOW");
    expect(rows[1].perf).toBe("");
    expect(rows[0].target_rows).toBe("2 of 4");
    expect(rows[1].target_rows).toBe("0 of 0");
  });

  it("returns plain column defs without callbacks", () => {
    const { columns } = materializeGridRows(COLS, ROWS);
    for (const c of columns) {
      expect(c.valueGetter).toBeUndefined();
      expect(c.valueFormatter).toBeUndefined();
    }
    expect(columns[2].headerName).toBe("09-01");
  });
});

describe("gridCellText", () => {
  it("formats numbers through the column formatter and blanks nulls", () => {
    expect(gridCellText(COLS[3], ROWS[0])).toBe("12.35");
    expect(gridCellText(COLS[3], ROWS[1])).toBe("");
    expect(gridCellText(COLS[1], ROWS[0])).toBe("F1");
  });
});
