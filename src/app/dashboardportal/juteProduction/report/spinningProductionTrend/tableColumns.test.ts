import { describe, expect, it } from "vitest";
import { gridCellText, materializeGridRows } from "@/components/reports/gridExportRows";
import { cellText, phoneColumns, toGridColumns, type Col } from "./tableColumns";

interface Row {
  id: number;
  frame: string;
  kg: number | null;
  shifts: string[];
  status: "low" | "ok" | null;
}

const cols: Col<Row>[] = [
  { field: "frame", header: "Frame", width: 90 },
  { field: "kg", header: "Production (kg)", short: "Kg", num: true, decimals: 0 },
  { field: "shifts_label", header: "Shifts", value: (r) => r.shifts.join(" ") },
  { field: "status", header: "Status", value: (r) => (r.status ? r.status.toUpperCase() : ""), phone: false },
];

const row: Row = { id: 1, frame: "33001", kg: 1234.56, shifts: ["A", "C"], status: "low" };

describe("toGridColumns", () => {
  it("builds number columns with the formatter and derived columns with a getter", () => {
    const grid = toGridColumns(cols);
    expect(grid[0]).toMatchObject({ field: "frame", headerName: "Frame", width: 90 });
    expect(grid[1].type).toBe("number");
    expect(gridCellText(grid[1], row)).toBe("1235");
    expect(gridCellText(grid[2], row)).toBe("A C");
    expect(gridCellText(grid[3], row)).toBe("LOW");
  });

  it("exports the same values the grid shows", () => {
    const out = materializeGridRows(toGridColumns(cols), [row]);
    expect(out.rows[0]).toMatchObject({ frame: "33001", kg: 1234.56, shifts_label: "A C", status: "LOW" });
  });
});

describe("phone view", () => {
  it("drops columns marked phone: false", () => {
    expect(phoneColumns(cols).map((c) => c.field)).toEqual(["frame", "kg", "shifts_label"]);
  });

  it("cellText matches the grid text", () => {
    expect(cellText(cols[1], row)).toBe("1235");
    expect(cellText(cols[2], row)).toBe("A C");
    expect(cellText(cols[1], { ...row, kg: null })).toBe("");
  });
});
