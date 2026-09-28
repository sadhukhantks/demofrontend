import { describe, expect, it } from "vitest";
import {
  HANDS_VIEWS,
  isMachineRunRow,
  splitSources,
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
