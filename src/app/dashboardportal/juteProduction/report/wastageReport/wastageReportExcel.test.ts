import { describe, expect, it } from "vitest";
import type { Worksheet } from "@/components/reports/exportExcel";
import type { WastageGroupColumn, WastageReport } from "@/utils/wastageReportService";
import { buildWastageSheetLayout, writeWastageSheet } from "./wastageReportExcel";

const GROUPS: WastageGroupColumn[] = [
  {
    group_code: "SPIN",
    group_name: "SPINNING WASTE",
    day_denom: "SPINNING",
    total_denom: "SPINNING",
    display_order: 1,
    components: [
      { key: "1:2", label: "SLIVER", group_code: "SPIN", order: 1 },
      { key: "3:2", label: "THREAD", group_code: "SPIN", order: 2 },
    ],
  },
  {
    group_code: "OTHER",
    group_name: "OTHER",
    day_denom: "NONE",
    total_denom: "NONE",
    display_order: 99,
    components: [{ key: "9:9", label: "MISC", group_code: "OTHER", order: 1 }],
  },
];

const DATA: WastageReport = {
  month: "2026-08",
  columns: GROUPS,
  days: [
    {
      date: "2026-08-01",
      hessian_looms: 10,
      sacking_looms: 20,
      frames_run: 30,
      weaving_kg: 1000,
      spinning_kg: 2000,
      breaker_feed_kg: 3000,
      selection_wt: 4000,
      cells: { "1:2": 50, "3:2": 25 },
      groups: { SPIN: { total: 75, pct: 3.75 }, OTHER: { total: 0, pct: null } },
    },
  ],
  totals: {
    hessian_looms: 10,
    sacking_looms: 20,
    frames_run: 30,
    weaving_kg: 1000,
    spinning_kg: 2000,
    breaker_feed_kg: 3000,
    selection_wt: 4000,
    cells: { "1:2": 50, "3:2": 25, "9:9": 5 },
    groups: { SPIN: { total: 75, pct: 3.75 }, OTHER: { total: 5, pct: null } },
  },
};

const label = (d: string) => d.slice(8);

describe("buildWastageSheetLayout", () => {
  it("lays out DATE + production + one band per group with merges over the top row", () => {
    const l = buildWastageSheetLayout(DATA, GROUPS, label);
    // 1 + 7 + (2+2) + (1+2) = 15 columns
    expect(l.width).toBe(15);
    expect(l.top.length).toBe(15);
    expect(l.sub.length).toBe(15);
    expect(l.top.slice(0, 2)).toEqual(["DATE", "PRODUCTION"]);
    expect(l.top[8]).toBe("SPINNING WASTE");
    expect(l.top[12]).toBe("OTHER");
    expect(l.sub.slice(0, 3)).toEqual(["", "HESS LOOMS", "SACK (S4) LOOMS"]);
    expect(l.sub.slice(8)).toEqual(["SLIVER", "THREAD", "TOTAL", "%", "MISC", "TOTAL", "%"]);
    expect(l.merges).toEqual([
      [2, 8],
      [9, 12],
      [13, 15],
    ]);
  });

  it("fills day rows and the TOTAL row; missing cells are 0 and missing % blank", () => {
    const l = buildWastageSheetLayout(DATA, GROUPS, label);
    expect(l.rows).toHaveLength(1);
    expect(l.rows[0]).toEqual([
      "01", 10, 20, 30, 1000, 2000, 3000, 4000, 50, 25, 75, 3.75, 0, 0, null,
    ]);
    expect(l.total).toEqual([
      "TOTAL", 10, 20, 30, 1000, 2000, 3000, 4000, 50, 25, 75, 3.75, 5, 5, null,
    ]);
  });

  it("has no TOTAL row when the report carries none", () => {
    const l = buildWastageSheetLayout({ ...DATA, totals: null }, GROUPS, label);
    expect(l.total).toBeNull();
  });
});

describe("writeWastageSheet", () => {
  it("writes header block, two header rows, day rows and the emphasised total", () => {
    const added: unknown[][] = [];
    const merges: number[][] = [];
    const emphasised: number[] = [];
    const ws = {
      addRow(values: unknown[]) {
        added.push(values);
        const number = added.length;
        return {
          number,
          getCell: () => ({}),
          eachCell(optsOrCb: unknown, cb?: (cell: Record<string, unknown>) => void) {
            const fn = (typeof optsOrCb === "function" ? optsOrCb : cb) as (
              c: Record<string, unknown>,
            ) => void;
            const cell: Record<string, unknown> = {};
            fn(cell);
            const fill = cell.fill as { fgColor?: { argb?: string } } | undefined;
            if (fill?.fgColor?.argb === "FF3EA6DA") emphasised.push(number);
          },
        };
      },
      mergeCells: (...a: number[]) => {
        merges.push(a);
      },
      getColumn: () => ({}),
      views: [] as unknown[],
    } as unknown as Worksheet;

    writeWastageSheet(ws, buildWastageSheetLayout(DATA, GROUPS, label), {
      companyName: "ACME",
      reportName: "Wastage Report",
    });
    // ACME, report line, spacer, top, sub, 1 day, TOTAL
    expect(added).toHaveLength(7);
    expect(added[3][0]).toBe("DATE");
    expect(added[6][0]).toBe("TOTAL");
    // header band on both header rows and the total row (not the day row)
    expect(emphasised).toEqual([4, 5, 7]);
    expect(merges).toContainEqual([4, 1, 5, 1]); // DATE spans both header rows
    expect(merges).toContainEqual([4, 2, 4, 8]); // PRODUCTION
    expect(merges).toContainEqual([4, 9, 4, 12]); // SPINNING WASTE
  });
});
