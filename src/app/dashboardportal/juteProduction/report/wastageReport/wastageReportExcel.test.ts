import { describe, expect, it } from "vitest";
import type { Worksheet } from "@/components/reports/exportExcel";
import type {
  WastageDenomOption,
  WastageGroupColumn,
  WastageReport,
} from "@/utils/wastageReportService";
import {
  buildWastageSheetLayout,
  totalPctHeader,
  writeWastageSheet,
} from "./wastageReportExcel";

const SELECTION: WastageDenomOption = { code: "SELECTION", label: "Jute issue (selection)" };
const WINDING: WastageDenomOption = { code: "WINDING", label: "Winding production" };

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
      winding_kg: 1500,
      cells: { "1:2": 50, "3:2": 25 },
      groups: { SPIN: { total: 75, pct: 3.75 }, OTHER: { total: 0, pct: null } },
      total_waste_kg: 75,
      total_pct_by_base: {
        WEAVING: 7.5,
        SPINNING: 3.75,
        BREAKER_FEED: 2.5,
        SELECTION: 1.88,
        WINDING: 5,
      },
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
    winding_kg: 1500,
    cells: { "1:2": 50, "3:2": 25, "9:9": 5 },
    groups: { SPIN: { total: 75, pct: 3.75 }, OTHER: { total: 5, pct: null } },
    total_waste_kg: 80,
    total_pct_by_base: {
      WEAVING: 8,
      SPINNING: 4,
      BREAKER_FEED: 2.67,
      SELECTION: 2,
      WINDING: null,
    },
  },
  denom_options: [SELECTION, WINDING],
  unmapped: [],
};

const label = (d: string) => d.slice(8);

describe("buildWastageSheetLayout", () => {
  it("lays out DATE + production + one band per group + Total Wastage with merges", () => {
    const l = buildWastageSheetLayout(DATA, GROUPS, label, SELECTION);
    // 1 + 8 + (2+2) + (1+2) + 2 = 18 columns
    expect(l.width).toBe(18);
    expect(l.top.length).toBe(18);
    expect(l.sub.length).toBe(18);
    expect(l.top.slice(0, 2)).toEqual(["DATE", "PRODUCTION"]);
    expect(l.top[9]).toBe("SPINNING WASTE");
    expect(l.top[13]).toBe("OTHER");
    expect(l.top[16]).toBe("Total Wastage");
    expect(l.sub.slice(0, 3)).toEqual(["", "HESS LOOMS", "SACK (S4) LOOMS"]);
    expect(l.sub[8]).toBe("WINDING KG");
    expect(l.sub.slice(9)).toEqual([
      "SLIVER", "THREAD", "TOTAL", "%", "MISC", "TOTAL", "%",
      "KG", "% of Jute issue (selection)",
    ]);
    expect(l.merges).toEqual([
      [2, 9],
      [10, 13],
      [14, 16],
      [17, 18],
    ]);
  });

  it("fills day rows and the TOTAL row; missing cells are 0 and missing % blank", () => {
    const l = buildWastageSheetLayout(DATA, GROUPS, label, SELECTION);
    expect(l.rows).toHaveLength(1);
    expect(l.rows[0]).toEqual([
      "01", 10, 20, 30, 1000, 2000, 3000, 4000, 1500, 50, 25, 75, 3.75, 0, 0, null, 75, 1.88,
    ]);
    expect(l.total).toEqual([
      "TOTAL", 10, 20, 30, 1000, 2000, 3000, 4000, 1500, 50, 25, 75, 3.75, 5, 5, null, 80, 2,
    ]);
  });

  it("shows the grand % on the chosen base, blank when that base was 0", () => {
    const l = buildWastageSheetLayout(DATA, GROUPS, label, WINDING);
    expect(l.sub[17]).toBe(totalPctHeader(WINDING));
    expect(l.sub[17]).toBe("% of Winding production");
    expect(l.rows[0][17]).toBe(5);
    expect(l.total?.[17]).toBeNull();
  });

  it("tolerates a server without the TKT-000183 fields (0 kg, blank %)", () => {
    const oldDay = {
      date: "2026-08-01",
      hessian_looms: 10,
      sacking_looms: 20,
      frames_run: 30,
      weaving_kg: 1000,
      spinning_kg: 2000,
      breaker_feed_kg: 3000,
      selection_wt: 4000,
      cells: { "1:2": 50, "3:2": 25 },
      groups: { SPIN: { total: 75, pct: 3.75 } },
    };
    const l = buildWastageSheetLayout(
      { month: DATA.month, columns: GROUPS, days: [oldDay], totals: null },
      GROUPS,
      label,
      SELECTION,
    );
    expect(l.rows[0][8]).toBe(0);
    expect(l.rows[0].slice(16)).toEqual([0, null]);
  });

  it("has no TOTAL row when the report carries none", () => {
    const l = buildWastageSheetLayout({ ...DATA, totals: null }, GROUPS, label, SELECTION);
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

    writeWastageSheet(ws, buildWastageSheetLayout(DATA, GROUPS, label, SELECTION), {
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
    expect(merges).toContainEqual([4, 2, 4, 9]); // PRODUCTION (8 columns)
    expect(merges).toContainEqual([4, 10, 4, 13]); // SPINNING WASTE
    expect(merges).toContainEqual([4, 17, 4, 18]); // Total Wastage
  });
});
