import { describe, expect, it } from "vitest";
import {
  HANDS_VIEWS,
  isMachineRunRow,
  NO_DEPARTMENT,
  NORM_KIND_NAMES,
  normKindLabel,
  normKindOf,
  splitSources,
  withDetailedTotals,
  type HandsRow,
  type MachineRunRow,
} from "./_service";

const handsRow: HandsRow = {
  date: "2026-08-01",
  designation_id: 10,
  shift_a: 1,
  shift_b: 0,
  shift_c: 0,
  shift_g: 0,
  target_a: 1,
  target_b: 0,
  target_c: 0,
  target_g: 0,
  total_actual: 1,
  total_target: 1,
  excess: 0,
  short: 0,
};

const machineRow: MachineRunRow = {
  date: "2026-08-01",
  shift: "A",
  machine_id: 7,
  machine: "S4 LOOM - 7",
  sources: "Weaving, Attendance, Stoppage",
  hands: 2,
  stoppage_hours: 1.5,
  breakdown_min: 0,
  counted: true,
};

describe("hands report service helpers", () => {
  it("lists Machines Run as the fifth view", () => {
    expect(HANDS_VIEWS.map((v) => v.value)).toEqual([
      "detailed",
      "by_date",
      "by_occupation",
      "by_department",
      "machines_run",
    ]);
  });

  it("splits the comma-joined sources and drops blanks", () => {
    expect(splitSources("Weaving, Attendance, Stoppage")).toEqual([
      "Weaving",
      "Attendance",
      "Stoppage",
    ]);
    expect(splitSources(" , Doff,, ")).toEqual(["Doff"]);
    expect(splitSources(null)).toEqual([]);
  });

  it("tells a machine-shift row from a manning row", () => {
    expect(isMachineRunRow(machineRow)).toBe(true);
    expect(isMachineRunRow(handsRow)).toBe(false);
    // A manning row carrying machine_type_id (variable norm) is still not a machine row.
    expect(isMachineRunRow({ ...handsRow, machine_type_id: 5 })).toBe(false);
  });
});

describe("withDetailedTotals (TKT-000167)", () => {
  const row = (date: string, deptId: number | null, dept: string | null, designation: string): HandsRow => ({
    ...handsRow,
    date,
    dept_id: deptId,
    dept,
    designation,
  });
  const total = (date: string, deptId?: number | null, dept?: string | null, actual = 9): HandsRow => ({
    ...handsRow,
    date,
    ...(deptId !== undefined ? { dept_id: deptId, dept } : {}),
    total_actual: actual,
  });

  it("closes each department with its subtotal and each date with the day total", () => {
    const rows = [
      row("2026-09-15", 1, "BATCHING", "LEARNER"),
      row("2026-09-15", 1, "BATCHING", "MAZDOOR"),
      row("2026-09-15", 2, "WEAVING", "WEAVER"),
      row("2026-09-16", 2, "WEAVING", "WEAVER"),
    ];
    const out = withDetailedTotals(
      rows,
      [
        total("2026-09-15", 1, "BATCHING", 2),
        total("2026-09-15", 2, "WEAVING", 1),
        total("2026-09-16", 2, "WEAVING", 1),
      ],
      [total("2026-09-15", undefined, undefined, 3), total("2026-09-16", undefined, undefined, 1)],
    );
    expect(out.map((r) => [r.date, r.dept, r.designation, r.total_actual])).toEqual([
      ["2026-09-15", "BATCHING", "LEARNER", 1],
      ["2026-09-15", "BATCHING", "MAZDOOR", 1],
      ["", "BATCHING", "Total", 2],
      ["2026-09-15", "WEAVING", "WEAVER", 1],
      ["", "WEAVING", "Total", 1],
      ["2026-09-15", "Total", "", 3],
      ["2026-09-16", "WEAVING", "WEAVER", 1],
      ["", "WEAVING", "Total", 1],
      ["2026-09-16", "Total", "", 1],
    ]);
  });

  it("labels a department-less subtotal and leaves rows alone when no totals came back", () => {
    const rows = [row("2026-09-15", null, null, "OUTSIDE WORKS")];
    const out = withDetailedTotals(rows, [total("2026-09-15", null, null, 1)], []);
    expect(out[1]).toMatchObject({ date: "", dept: NO_DEPARTMENT, designation: "Total" });
    expect(withDetailedTotals(rows, [], [])).toEqual(rows);
  });
});

describe("norm kind label (Hands Norms v2)", () => {
  it("reads norm_kind when the backend sends it, whatever the legacy flag says", () => {
    expect(normKindOf({ ...handsRow, norm_kind: "P", variable_fixed: "V" })).toBe("P");
    expect(normKindOf({ ...handsRow, norm_kind: "n", variable_fixed: "F" })).toBe("N");
    expect(normKindOf({ ...handsRow, norm_kind: "A" })).toBe("A");
    expect(normKindOf({ ...handsRow, norm_kind: "F", machine_type_id: 7 })).toBe("F");
  });

  it("maps legacy rows: V or a machine link is M, F is F, nothing is blank", () => {
    expect(normKindOf({ ...handsRow, variable_fixed: "V" })).toBe("M");
    expect(normKindOf({ ...handsRow, variable_fixed: "F", machine_type_id: 7 })).toBe("M");
    expect(normKindOf({ ...handsRow, machine_group_id: 3 })).toBe("M");
    expect(normKindOf({ ...handsRow, variable_fixed: "F" })).toBe("F");
    expect(normKindOf(handsRow)).toBeNull();
    expect(normKindOf({ ...handsRow, norm_kind: "", variable_fixed: null })).toBeNull();
  });

  it("labels the cell with the letter and names every kind", () => {
    expect(normKindLabel({ ...handsRow, norm_kind: "M" })).toBe("M");
    const totalRow: HandsRow = { ...handsRow, designation: "Total" };
    expect(normKindLabel(totalRow)).toBe("");
    expect(Object.keys(NORM_KIND_NAMES)).toEqual(["F", "M", "P", "N", "A"]);
    expect(NORM_KIND_NAMES.N).toBe("No norm");
  });
});
