import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/apiClient2", () => ({ fetchWithCookie: vi.fn() }));

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";
import {
  branchMachineDepartmentOptions,
  branchMachineFilterOptions,
  branchMachineLabel,
  buildOverridePayload,
  buildUndoPayload,
  canEditMachinesWorked,
  COUNT_SUGGESTED_REASON,
  countMachineStatuses,
  defaultOverrideReason,
  designationCaptions,
  effectiveMachineFilters,
  fetchBranchMachines,
  filterBranchMachines,
  filterMachineRows,
  HANDS_VIEWS,
  isCountedStatus,
  isMachineRunRow,
  MACHINE_STATUSES,
  MACHINES_VIEW,
  machineFilterOptions,
  machineGroupNames,
  machineInScope,
  machineOverrideSchema,
  machineRowAction,
  machineScopesOf,
  machineStatusChipVariant,
  machineStatusCounts,
  machineStatusLabel,
  machineStatusOf,
  machineStatusTone,
  manualActionOf,
  manualAtLabel,
  manualInfoOf,
  manualText,
  manualTooltipLines,
  MANNING_VIEWS,
  NO_DEPARTMENT,
  NO_MACHINE_FILTERS,
  NORM_KIND_NAMES,
  normKindLabel,
  normKindOf,
  overrideDateBounds,
  saveMachineOverride,
  scopeCaption,
  splitSources,
  suggestedMachines,
  syncedTimeLabel,
  toBranchMachine,
  toMachineWorkedRow,
  undoMachineOverride,
  uniqueMachineIds,
  validateMachineOverride,
  withDetailedTotals,
  type BranchMachine,
  type HandsRow,
  type MachineFilters,
  type MachineOverrideInput,
  type MachineRunRow,
  type MachineScope,
  type MachineWorkedRow,
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
  it("keeps machines_run as the API value and calls it Machines Worked", () => {
    expect(HANDS_VIEWS.map((v) => v.value)).toEqual([
      "detailed",
      "by_date",
      "by_occupation",
      "by_department",
      "machines_run",
    ]);
    expect(MACHINES_VIEW).toBe("machines_run");
    expect(HANDS_VIEWS.find((v) => v.value === MACHINES_VIEW)?.label).toBe("Machines Worked");
    expect(HANDS_VIEWS.some((v) => /machines run/i.test(v.label))).toBe(false);
  });

  it("offers only the four manning views in the Manning tab's selector", () => {
    expect(MANNING_VIEWS.map((v) => v.value)).toEqual([
      "detailed",
      "by_date",
      "by_occupation",
      "by_department",
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

// ---------------------------------------------------------------------------
// Machines Worked tab (spec §11.4 / §11.5)
// ---------------------------------------------------------------------------

/** A machine-shift as today's backend sends it — none of the 2026-10-01 fields. */
const legacyMachine = (over: Partial<MachineRunRow> = {}): MachineRunRow => ({
  ...machineRow,
  dept_id: 2,
  dept: "WEAVING",
  machine_type_id: 7,
  machine_type: "Loom",
  ...over,
});

/** A machine-shift as the new contract sends it, already normalised. */
const worked = (over: Partial<MachineRunRow> = {}): MachineWorkedRow =>
  toMachineWorkedRow({
    ...legacyMachine(),
    workers: 1,
    shift_hours: 8,
    status: "WORKED",
    group_ids: [],
    groups: "",
    ...over,
  });

const HESSIAN = 11; // machine group "Hessian looms"
const ALL_LOOMS = 12; // machine group "All looms"
const SPINNING_TYPE = 9;
const WINDING_DEPT = 5;

const scope = (over: Partial<MachineScope>): MachineScope => ({
  designation_id: 100,
  designation: "WEAVER(H)",
  norm_kind: "M",
  scope: "group",
  scope_id: HESSIAN,
  scope_name: "Hessian looms",
  units_per_hand: 2,
  qty_per_hand: null,
  ...over,
});

const scopes: MachineScope[] = [
  scope({}),
  scope({
    designation_id: 200,
    designation: "SPINNER",
    scope: "type",
    scope_id: SPINNING_TYPE,
    scope_name: "Spinning Frame",
    units_per_hand: 2,
  }),
  scope({
    designation_id: 300,
    designation: "WINDER",
    norm_kind: "P",
    scope: "dept",
    scope_id: WINDING_DEPT,
    scope_name: "WINDING",
    units_per_hand: null,
    qty_per_hand: 315,
  }),
];

/** Looms in two groups, spinning frames by type, winding machines by dept. */
const sheet: MachineWorkedRow[] = [
  worked({ machine_id: 1, machine: "Hessian Loom - 1", shift: "A", group_ids: [HESSIAN, ALL_LOOMS], groups: "Hessian looms, All looms" }),
  worked({ machine_id: 2, machine: "Hessian Loom - 2", shift: "A", group_ids: [HESSIAN, ALL_LOOMS], groups: "Hessian looms, All looms" }),
  worked({ machine_id: 1, machine: "Hessian Loom - 1", shift: "B", group_ids: [HESSIAN, ALL_LOOMS], groups: "Hessian looms, All looms" }),
  worked({ machine_id: 3, machine: "Hessian Loom - 3", shift: "B", status: "STOPPED_ALL_SHIFT", counted: false, group_ids: [HESSIAN, ALL_LOOMS], groups: "Hessian looms, All looms" }),
  worked({ machine_id: 20, machine: "S4 Loom - 1", shift: "A", group_ids: [ALL_LOOMS], groups: "All looms" }),
  worked({ machine_id: 30, machine: "Frame 1", shift: "A", dept_id: 3, dept: "SPINNING", machine_type_id: SPINNING_TYPE, machine_type: "Spinning Frame" }),
  worked({ machine_id: 31, machine: "Frame 2", shift: "A", dept_id: 3, dept: "SPINNING", machine_type_id: SPINNING_TYPE, machine_type: "Spinning Frame" }),
  worked({ machine_id: 32, machine: "Frame 3", shift: "A", dept_id: 3, dept: "SPINNING", machine_type_id: SPINNING_TYPE, machine_type: "Spinning Frame" }),
  worked({ machine_id: 31, machine: "Frame 2", shift: "C", dept_id: 3, dept: "SPINNING", machine_type_id: SPINNING_TYPE, machine_type: "Spinning Frame", status: "NO_WORKER_MARKED", counted: false, workers: 0 }),
  worked({ machine_id: 40, machine: "Winder 1", shift: "B", dept_id: WINDING_DEPT, dept: "WINDING", machine_type_id: 15, machine_type: "Winding" }),
];

const only = (over: Partial<MachineFilters>): MachineFilters => ({ ...NO_MACHINE_FILTERS, ...over });
const ids = (rows: MachineWorkedRow[]) => rows.map((r) => `${r.machine_id}${r.shift}`);

describe("machine status (older backend fallback)", () => {
  it("reads the status the backend sends, whatever its case", () => {
    expect(machineStatusOf({ status: "STOPPED_ALL_SHIFT", counted: false })).toBe("STOPPED_ALL_SHIFT");
    expect(machineStatusOf({ status: " no_worker_marked ", counted: false })).toBe("NO_WORKER_MARKED");
    // The status wins over the legacy flag when the two disagree.
    expect(machineStatusOf({ status: "WORKED", counted: false })).toBe("WORKED");
  });

  it("derives it from `counted` when the status is missing or unknown", () => {
    expect(machineStatusOf({ counted: true })).toBe("WORKED");
    expect(machineStatusOf({ counted: false })).toBe("NO_WORKER_MARKED");
    expect(machineStatusOf({ status: null, counted: true })).toBe("WORKED");
    expect(machineStatusOf({ status: "RUNNING", counted: false })).toBe("NO_WORKER_MARKED");
  });

  it("fills workers, groups and status on a row from today's backend", () => {
    const row = toMachineWorkedRow(legacyMachine({ hands: 2, counted: true }));
    expect(row).toMatchObject({
      status: "WORKED",
      status_label: "Worked",
      workers: 2,
      group_ids: [],
      groups: "",
      shift_hours: null,
    });
    const stopped = toMachineWorkedRow(legacyMachine({ hands: null, counted: false }));
    expect(stopped).toMatchObject({ status: "NO_WORKER_MARKED", status_label: "No worker marked", workers: 0 });
  });

  it("prefers the new fields when they are sent", () => {
    const row = toMachineWorkedRow(
      legacyMachine({
        hands: 5,
        workers: 1,
        shift_hours: 8,
        status: "STOPPED_ALL_SHIFT",
        counted: false,
        group_ids: [HESSIAN],
        groups: "Hessian looms",
      }),
    );
    expect(row).toMatchObject({
      status: "STOPPED_ALL_SHIFT",
      status_label: "Stopped all shift",
      workers: 1,
      shift_hours: 8,
      group_ids: [HESSIAN],
      groups: "Hessian looms",
    });
    // A null `workers` / `group_ids` is as good as a missing one.
    expect(toMachineWorkedRow(legacyMachine({ hands: 3, workers: null, group_ids: null }))).toMatchObject({
      workers: 3,
      group_ids: [],
    });
  });

  it("treats a response without scopes as having none", () => {
    expect(machineScopesOf({})).toEqual([]);
    expect(machineScopesOf(null)).toEqual([]);
    expect(machineScopesOf({ scopes })).toBe(scopes);
  });
});

describe("machine status label and tone", () => {
  it("names the five statuses — the counted ones first", () => {
    expect(MACHINE_STATUSES.map(machineStatusLabel)).toEqual([
      "Worked",
      "Added manually",
      "Stopped all shift",
      "No worker marked",
      "Excluded manually",
    ]);
  });

  it("maps them to MUI chip colours: success, warning, default", () => {
    expect(machineStatusTone("WORKED")).toBe("success");
    expect(machineStatusTone("STOPPED_ALL_SHIFT")).toBe("warning");
    expect(machineStatusTone("NO_WORKER_MARKED")).toBe("default");
  });

  it("draws the manual statuses apart: added = info, excluded = error and outlined", () => {
    expect(machineStatusTone("ADDED_MANUALLY")).toBe("info");
    expect(machineStatusTone("EXCLUDED_MANUALLY")).toBe("error");
    expect(machineStatusChipVariant("EXCLUDED_MANUALLY")).toBe("outlined");
    expect(
      MACHINE_STATUSES.filter((s) => s !== "EXCLUDED_MANUALLY").map(machineStatusChipVariant),
    ).toEqual(["filled", "filled", "filled", "filled"]);
  });
});

describe("machine filters", () => {
  it("returns every row when nothing is picked", () => {
    expect(filterMachineRows(sheet, NO_MACHINE_FILTERS, scopes)).toEqual(sheet);
  });

  it("filters by shift", () => {
    expect(ids(filterMachineRows(sheet, only({ shift: "B" }), scopes))).toEqual(["1B", "3B", "40B"]);
  });

  it("filters by status", () => {
    expect(ids(filterMachineRows(sheet, only({ status: "STOPPED_ALL_SHIFT" }), scopes))).toEqual(["3B"]);
    expect(ids(filterMachineRows(sheet, only({ status: "NO_WORKER_MARKED" }), scopes))).toEqual(["31C"]);
    expect(filterMachineRows(sheet, only({ status: "WORKED" }), scopes)).toHaveLength(8);
  });

  it("filters by machine type", () => {
    expect(ids(filterMachineRows(sheet, only({ machineTypeId: SPINNING_TYPE }), scopes))).toEqual([
      "30A",
      "31A",
      "32A",
      "31C",
    ]);
  });

  it("filters by group — a machine in two groups shows under both", () => {
    expect(ids(filterMachineRows(sheet, only({ groupId: HESSIAN }), scopes))).toEqual(["1A", "2A", "1B", "3B"]);
    expect(ids(filterMachineRows(sheet, only({ groupId: ALL_LOOMS }), scopes))).toEqual([
      "1A",
      "2A",
      "1B",
      "3B",
      "20A",
    ]);
  });

  it("filters by designation through its norm scope: group, type or department", () => {
    // WEAVER(H) is targeted off the Hessian looms group — the S4 loom is out.
    expect(ids(filterMachineRows(sheet, only({ designationId: 100 }), scopes))).toEqual(["1A", "2A", "1B", "3B"]);
    // SPINNER off the machine type.
    expect(ids(filterMachineRows(sheet, only({ designationId: 200 }), scopes))).toEqual(["30A", "31A", "32A", "31C"]);
    // WINDER off the department.
    expect(ids(filterMachineRows(sheet, only({ designationId: 300 }), scopes))).toEqual(["40B"]);
    // No norm scope for the designation: nothing to show.
    expect(filterMachineRows(sheet, only({ designationId: 999 }), scopes)).toEqual([]);
  });

  it("keeps a machine that is in any scope of a designation with several", () => {
    const two = [...scopes, scope({ scope: "type", scope_id: SPINNING_TYPE, scope_name: "Spinning Frame" })];
    expect(filterMachineRows(sheet, only({ designationId: 100 }), two)).toHaveLength(8);
  });

  it("combines filters as AND", () => {
    expect(
      ids(filterMachineRows(sheet, only({ designationId: 100, shift: "B", status: "WORKED" }), scopes)),
    ).toEqual(["1B"]);
  });

  it("matches a scope on the right key only", () => {
    const row = worked({ group_ids: [7], machine_type_id: 7, dept_id: 7 });
    expect(machineInScope(row, { scope: "group", scope_id: 7 })).toBe(true);
    expect(machineInScope(row, { scope: "type", scope_id: 7 })).toBe(true);
    expect(machineInScope(row, { scope: "dept", scope_id: 7 })).toBe(true);
    const other = worked({ group_ids: [], machine_type_id: 8, dept_id: 9 });
    expect(machineInScope(other, { scope: "group", scope_id: 8 })).toBe(false);
    expect(machineInScope(other, { scope: "type", scope_id: 9 })).toBe(false);
    expect(machineInScope(other, { scope: "dept", scope_id: 8 })).toBe(false);
  });

  it("does not crash on rows from today's backend — no groups, no scopes", () => {
    const rows = [legacyMachine(), legacyMachine({ machine_id: 8, counted: false })].map(toMachineWorkedRow);
    expect(filterMachineRows(rows, only({ status: "WORKED" }), [])).toHaveLength(1);
    expect(filterMachineRows(rows, only({ groupId: HESSIAN }), [])).toEqual([]);
    const options = machineFilterOptions(rows, []);
    expect(options.groups).toEqual([]);
    expect(options.designations).toEqual([]);
    expect(options.machineTypes).toEqual([{ value: 7, label: "Loom" }]);
  });
});

describe("machine filter options", () => {
  it("lists what the rows carry: shifts in A-B-C-G order, types and groups by name", () => {
    const options = machineFilterOptions(sheet, scopes);
    expect(options.shifts.map((o) => o.value)).toEqual(["A", "B", "C"]);
    expect(options.statuses.map((o) => o.label)).toEqual([
      "Worked",
      "Added manually",
      "Stopped all shift",
      "No worker marked",
      "Excluded manually",
    ]);
    expect(options.machineTypes).toEqual([
      { value: 7, label: "Loom" },
      { value: SPINNING_TYPE, label: "Spinning Frame" },
      { value: 15, label: "Winding" },
    ]);
    expect(options.groups).toEqual([
      { value: ALL_LOOMS, label: "All looms" },
      { value: HESSIAN, label: "Hessian looms" },
    ]);
    expect(options.designations.map((o) => o.label)).toEqual(["SPINNER", "WEAVER(H)", "WINDER"]);
  });

  it("names a group from a norm scope, else from the row's own text, else by id", () => {
    const rows = [
      worked({ group_ids: [HESSIAN, ALL_LOOMS], groups: "Hessian (row text), All looms" }),
      // Names and ids do not line up — the text cannot be trusted by position.
      worked({ group_ids: [21, 22], groups: "Only one name" }),
    ];
    const names = machineGroupNames(rows, scopes);
    expect(names.get(HESSIAN)).toBe("Hessian looms");
    expect(names.get(ALL_LOOMS)).toBe("All looms");
    expect(names.get(21)).toBe("Group 21");
    expect(names.get(22)).toBe("Group 22");
  });

  it("lists each designation once even with several norm scopes", () => {
    const two = [...scopes, scope({ scope: "type", scope_id: SPINNING_TYPE })];
    expect(machineFilterOptions(sheet, two).designations.filter((o) => o.value === 100)).toHaveLength(1);
  });

  it("drops a pick that the reloaded rows no longer offer", () => {
    const options = machineFilterOptions(sheet, scopes);
    const stale: MachineFilters = {
      shift: "G",
      status: "WORKED",
      machineTypeId: 99,
      groupId: HESSIAN,
      designationId: 999,
    };
    expect(effectiveMachineFilters(stale, options)).toEqual({
      shift: "",
      status: "WORKED",
      machineTypeId: "",
      groupId: HESSIAN,
      designationId: "",
    });
    expect(effectiveMachineFilters(NO_MACHINE_FILTERS, options)).toEqual(NO_MACHINE_FILTERS);
  });
});

describe("machine status chips", () => {
  const NO_MANUAL = { addedManually: 0, excludedManually: 0 };

  it("counts the rows by status", () => {
    expect(countMachineStatuses(sheet)).toEqual({ worked: 8, stoppedAllShift: 1, noWorkerMarked: 1, ...NO_MANUAL });
    expect(countMachineStatuses([])).toEqual({ worked: 0, stoppedAllShift: 0, noWorkerMarked: 0, ...NO_MANUAL });
  });

  it("counts the manually added and excluded machine-shifts on their own", () => {
    const rows = [
      ...sheet,
      worked({ machine_id: 50, status: "ADDED_MANUALLY", manual_action: "ADD", override_id: 1 }),
      worked({ machine_id: 51, status: "ADDED_MANUALLY", manual_action: "ADD", override_id: 2 }),
      worked({ machine_id: 52, status: "EXCLUDED_MANUALLY", manual_action: "EXCLUDE", override_id: 3, counted: false }),
    ];
    expect(countMachineStatuses(rows)).toEqual({
      worked: 8,
      addedManually: 2,
      stoppedAllShift: 1,
      noWorkerMarked: 1,
      excludedManually: 1,
    });
  });

  it("uses the endpoint's counts when meta carries them", () => {
    expect(
      machineStatusCounts(sheet, { machine_shifts_run: 480, stopped_all_shift: 12, no_worker_marked: 31 }),
    ).toEqual({ worked: 480, stoppedAllShift: 12, noWorkerMarked: 31, ...NO_MANUAL });
    // A zero is a count, not a missing field.
    expect(
      machineStatusCounts(sheet, { machine_shifts_run: 0, stopped_all_shift: 0, no_worker_marked: 0 }),
    ).toEqual({ worked: 0, stoppedAllShift: 0, noWorkerMarked: 0, ...NO_MANUAL });
  });

  it("takes the manual counts from meta, and the added ones off the counted total", () => {
    // machine_shifts_run is every counted machine-shift — 475 worked + 5 added.
    expect(
      machineStatusCounts(sheet, {
        machine_shifts_run: 480,
        stopped_all_shift: 12,
        no_worker_marked: 31,
        added_manually: 5,
        excluded_manually: 2,
      }),
    ).toEqual({ worked: 475, addedManually: 5, stoppedAllShift: 12, noWorkerMarked: 31, excludedManually: 2 });
  });

  it("falls back to counting rows when meta lacks the new counts", () => {
    const fromRows = { worked: 8, stoppedAllShift: 1, noWorkerMarked: 1, ...NO_MANUAL };
    // Today's backend: machine_shifts_run only.
    expect(machineStatusCounts(sheet, { machine_shifts_run: 480 })).toEqual(fromRows);
    expect(machineStatusCounts(sheet, { stopped_all_shift: 12, no_worker_marked: null })).toEqual(fromRows);
    expect(machineStatusCounts(sheet, null)).toEqual(fromRows);
    expect(machineStatusCounts(sheet)).toEqual(fromRows);
  });

  it("shows the synced time as the server wrote it", () => {
    expect(syncedTimeLabel("2026-10-01T14:32:10")).toBe("14:32");
    expect(syncedTimeLabel("2026-10-01 09:05:59")).toBe("09:05");
    expect(syncedTimeLabel("2026-10-01")).toBeNull();
    expect(syncedTimeLabel(null)).toBeNull();
    expect(syncedTimeLabel(undefined)).toBeNull();
  });
});

describe("designation caption", () => {
  it("divides for a machine norm on a machine type — one machine is one unit", () => {
    expect(scopeCaption(scopes[1], sheet)).toBe(
      "SPINNER: Spinning Frame machine type, 2 per hand → A: 3 worked ÷ 2 = 1.5 hands",
    );
  });

  it("stops at the machines counted for a group — member units are not on the row", () => {
    expect(scopeCaption(scopes[0], sheet)).toBe(
      "WEAVER(H): Hessian looms group, 2 units per hand → A: 2 worked · B: 1 worked",
    );
    // No rate: no "units" wording at all.
    expect(scopeCaption(scope({ units_per_hand: null }), sheet)).toBe(
      "WEAVER(H): Hessian looms group → A: 2 worked · B: 1 worked",
    );
  });

  it("counts machines only for a production norm", () => {
    expect(scopeCaption(scopes[2], sheet)).toBe(
      "WINDER: WINDING department, production norm (315 per hand per shift) → B: 1 worked",
    );
  });

  it("counts only WORKED rows, per shift, and says so when there are none", () => {
    const stoppedOnly = sheet.filter((r) => r.status !== "WORKED");
    expect(scopeCaption(scopes[0], stoppedOnly)).toBe(
      "WEAVER(H): Hessian looms group, 2 units per hand → no machines worked in the rows shown",
    );
  });

  it("counts a manually added machine as worked, and leaves an excluded one out", () => {
    const rows = [
      ...sheet,
      worked({ machine_id: 33, machine: "Frame 4", shift: "A", dept_id: 3, machine_type_id: SPINNING_TYPE, status: "ADDED_MANUALLY", manual_action: "ADD", override_id: 1 }),
      worked({ machine_id: 34, machine: "Frame 5", shift: "A", dept_id: 3, machine_type_id: SPINNING_TYPE, status: "EXCLUDED_MANUALLY", manual_action: "EXCLUDE", override_id: 2, counted: false }),
    ];
    expect(scopeCaption(scopes[1], rows)).toBe(
      "SPINNER: Spinning Frame machine type, 2 per hand → A: 4 worked ÷ 2 = 2 hands",
    );
    expect(isCountedStatus("ADDED_MANUALLY")).toBe(true);
    expect(MACHINE_STATUSES.filter(isCountedStatus)).toEqual(["WORKED", "ADDED_MANUALLY"]);
  });

  it("flags a window of several dates — the counts are machine-shifts", () => {
    const twoDays = [
      worked({ machine_id: 30, machine_type_id: SPINNING_TYPE, date: "2026-10-01" }),
      worked({ machine_id: 30, machine_type_id: SPINNING_TYPE, date: "2026-10-02" }),
    ];
    expect(scopeCaption(scopes[1], twoDays)).toBe(
      "SPINNER: Spinning Frame machine type, 2 per hand → A: 2 worked ÷ 2 = 1 hand (machine-shifts over 2 dates)",
    );
  });

  it("gives one line per distinct scope of the picked designation, none when nothing is picked", () => {
    expect(designationCaptions("", scopes, sheet)).toEqual([]);
    expect(designationCaptions(100, scopes, sheet)).toHaveLength(1);
    // The same norm listed twice (two effective-dated rows) is one line.
    expect(designationCaptions(100, [...scopes, scope({})], sheet)).toHaveLength(1);
    const two = [...scopes, scope({ scope: "type", scope_id: SPINNING_TYPE, scope_name: "Spinning Frame" })];
    expect(designationCaptions(100, two, sheet)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Manual additions and exclusions of worked machines (spec §12)
// ---------------------------------------------------------------------------

describe("manual override fields (backend without them)", () => {
  it("reads a row from today's backend as: no manual change, not suggested", () => {
    expect(manualInfoOf(legacyMachine())).toEqual({
      manual_action: null,
      override_id: null,
      manual_reason: null,
      manual_by: null,
      manual_at: null,
      suggested: false,
    });
    const row = toMachineWorkedRow(legacyMachine());
    expect(row).toMatchObject({
      manual_action: null,
      override_id: null,
      manual_reason: null,
      manual_by: null,
      manual_at: null,
      suggested: false,
      manual: "",
    });
  });

  it("treats nulls, blanks and unknown actions like missing fields", () => {
    expect(
      manualInfoOf({
        manual_action: "REMOVE",
        override_id: null,
        manual_reason: "  ",
        manual_by: null,
        manual_at: "",
        suggested: null,
      }),
    ).toEqual({
      manual_action: null,
      override_id: null,
      manual_reason: null,
      manual_by: null,
      manual_at: null,
      suggested: false,
    });
    expect(manualActionOf(undefined)).toBeNull();
    expect(manualActionOf(" add ")).toBe("ADD");
    expect(manualActionOf("EXCLUDE")).toBe("EXCLUDE");
  });

  it("reads the fields when they are sent", () => {
    const row = toMachineWorkedRow(
      legacyMachine({
        status: "ADDED_MANUALLY",
        manual_action: "ADD",
        override_id: 41,
        manual_reason: "Loom ran, operator not marked",
        manual_by: "A. Kumar",
        manual_at: "2026-10-01T14:32:10",
        suggested: false,
      }),
    );
    expect(row).toMatchObject({
      status: "ADDED_MANUALLY",
      status_label: "Added manually",
      manual_action: "ADD",
      override_id: 41,
      manual_reason: "Loom ran, operator not marked",
      manual_by: "A. Kumar",
      manual_at: "2026-10-01T14:32:10",
      manual: "Added: Loom ran, operator not marked (A. Kumar, 2026-10-01 14:32)",
    });
    expect(toMachineWorkedRow(legacyMachine({ suggested: true })).suggested).toBe(true);
  });

  it("keeps a manually added machine-shift that has no entry behind it", () => {
    // §12.2: such a row is upserted with sources = NULL.
    const added = { ...legacyMachine({ status: "ADDED_MANUALLY", manual_action: "ADD", override_id: 7 }), sources: null };
    expect(isMachineRunRow(added)).toBe(true);
    expect(toMachineWorkedRow(added).sources).toBe("");
    const withoutSources: Partial<MachineRunRow> = { ...added };
    delete withoutSources.sources;
    expect(isMachineRunRow(withoutSources as MachineRunRow)).toBe(true);
    expect(toMachineWorkedRow(withoutSources as MachineRunRow).sources).toBe("");
    // A manning row is still not one.
    expect(isMachineRunRow(handsRow)).toBe(false);
  });

  it("lets an active override decide the status when none is sent", () => {
    expect(machineStatusOf({ counted: true, manual_action: "ADD" })).toBe("ADDED_MANUALLY");
    expect(machineStatusOf({ counted: false, manual_action: "EXCLUDE" })).toBe("EXCLUDED_MANUALLY");
    // A status that is sent wins.
    expect(machineStatusOf({ status: "EXCLUDED_MANUALLY", counted: false })).toBe("EXCLUDED_MANUALLY");
    expect(machineStatusOf({ status: "WORKED", counted: true, manual_action: null })).toBe("WORKED");
  });

  it("offers no edit actions until the backend says the caller may edit", () => {
    // Today's meta has no can_edit at all.
    expect(canEditMachinesWorked({}, true)).toBe(false);
    expect(canEditMachinesWorked(null, true)).toBe(false);
    expect(canEditMachinesWorked(undefined, true)).toBe(false);
    expect(canEditMachinesWorked({ can_edit: null }, true)).toBe(false);
    expect(canEditMachinesWorked({ can_edit: false }, true)).toBe(false);
    // ...and needs the sidebar menu's edit access as well.
    expect(canEditMachinesWorked({ can_edit: true }, false)).toBe(false);
    expect(canEditMachinesWorked({ can_edit: true }, true)).toBe(true);
  });
});

describe("manual change text (Excel column and Status tooltip)", () => {
  const added = {
    manual_action: "ADD" as const,
    manual_reason: "Loom ran, operator not marked",
    manual_by: "A. Kumar",
    manual_at: "2026-10-01T14:32:10",
  };

  it("writes the Excel cell as 'Added: reason (name, time)'", () => {
    expect(manualText(added)).toBe("Added: Loom ran, operator not marked (A. Kumar, 2026-10-01 14:32)");
    expect(manualText({ ...added, manual_action: "EXCLUDE", manual_reason: "Wrong loom marked" })).toBe(
      "Excluded: Wrong loom marked (A. Kumar, 2026-10-01 14:32)",
    );
  });

  it("leaves out whatever was not sent, and writes nothing without a manual change", () => {
    expect(manualText({ ...added, manual_by: null })).toBe(
      "Added: Loom ran, operator not marked (2026-10-01 14:32)",
    );
    expect(manualText({ manual_action: "ADD", manual_reason: null, manual_by: null, manual_at: null })).toBe("Added");
    expect(manualText({ ...added, manual_action: null })).toBe("");
  });

  it("lists what was done, the reason, and who did it when", () => {
    expect(manualTooltipLines(added)).toEqual([
      "Added manually",
      "Reason: Loom ran, operator not marked",
      "By A. Kumar · 2026-10-01 14:32",
    ]);
    expect(
      manualTooltipLines({ manual_action: "EXCLUDE", manual_reason: null, manual_by: null, manual_at: null }),
    ).toEqual(["Excluded manually"]);
    expect(manualTooltipLines({ ...added, manual_action: null })).toEqual([]);
  });

  it("shows the time as the server wrote it", () => {
    expect(manualAtLabel("2026-10-01T14:32:10")).toBe("2026-10-01 14:32");
    expect(manualAtLabel("2026-10-01 09:05:59")).toBe("2026-10-01 09:05");
    expect(manualAtLabel("2026-10-01")).toBe("2026-10-01");
    expect(manualAtLabel("")).toBeNull();
    expect(manualAtLabel(null)).toBeNull();
  });
});

describe("suggested machines of a date and shift", () => {
  const rows: MachineWorkedRow[] = [
    worked({ machine_id: 12, machine: "Hemming 12", date: "2026-10-01", shift: "A", status: "NO_WORKER_MARKED", counted: false, suggested: true }),
    worked({ machine_id: 2, machine: "Hemming 2", date: "2026-10-01", shift: "A", status: "NO_WORKER_MARKED", counted: false, suggested: true }),
    // Same machine, other shift / other date.
    worked({ machine_id: 2, machine: "Hemming 2", date: "2026-10-01", shift: "B", status: "NO_WORKER_MARKED", counted: false, suggested: true }),
    worked({ machine_id: 3, machine: "Hemming 3", date: "2026-10-02", shift: "A", status: "NO_WORKER_MARKED", counted: false, suggested: true }),
    // No worker marked but not suggested (a stoppage entry only), and a worked one.
    worked({ machine_id: 4, machine: "Hemming 4", date: "2026-10-01", shift: "A", status: "NO_WORKER_MARKED", counted: false }),
    worked({ machine_id: 5, machine: "Hemming 5", date: "2026-10-01", shift: "A" }),
  ];

  it("lists only the suggested rows of that date and shift, by machine name", () => {
    expect(suggestedMachines(rows, "2026-10-01", "A").map((r) => r.machine)).toEqual(["Hemming 2", "Hemming 12"]);
    expect(suggestedMachines(rows, "2026-10-01", "B").map((r) => r.machine_id)).toEqual([2]);
    expect(suggestedMachines(rows, "2026-10-02", "A").map((r) => r.machine_id)).toEqual([3]);
  });

  it("is empty for a date or shift with none, and on a backend that sends no `suggested`", () => {
    expect(suggestedMachines(rows, "2026-10-01", "C")).toEqual([]);
    expect(suggestedMachines(rows, "2026-10-03", "A")).toEqual([]);
    expect(suggestedMachines(rows, "2026-10-01", "")).toEqual([]);
    expect(suggestedMachines(sheet, "2026-08-01", "A")).toEqual([]);
  });

  it("lists a machine once even if the rows repeat it", () => {
    expect(suggestedMachines([rows[0], rows[0]], "2026-10-01", "A")).toHaveLength(1);
  });
});

describe("row actions", () => {
  const row = (status: MachineWorkedRow["status"], override_id: number | null = null) => ({ status, override_id });

  it("offers nothing without edit access", () => {
    for (const status of MACHINE_STATUSES) {
      expect(machineRowAction(row(status, 9), false)).toBeNull();
    }
  });

  it("offers Count on no-worker rows, Exclude on worked rows, Undo on manual rows", () => {
    expect(machineRowAction(row("NO_WORKER_MARKED"), true)).toBe("count");
    expect(machineRowAction(row("WORKED"), true)).toBe("exclude");
    expect(machineRowAction(row("ADDED_MANUALLY", 9), true)).toBe("undo");
    expect(machineRowAction(row("EXCLUDED_MANUALLY", 10), true)).toBe("undo");
    expect(machineRowAction(row("STOPPED_ALL_SHIFT"), true)).toBeNull();
  });

  it("cannot undo a manual row that carries no override id", () => {
    expect(machineRowAction(row("ADDED_MANUALLY"), true)).toBeNull();
  });

  it("pre-fills the reason only when counting a suggested machine", () => {
    expect(defaultOverrideReason("count", { suggested: true })).toBe(COUNT_SUGGESTED_REASON);
    expect(COUNT_SUGGESTED_REASON).toBe("Production entered, no worker marked");
    expect(defaultOverrideReason("count", { suggested: false })).toBe("");
    expect(defaultOverrideReason("exclude", { suggested: true })).toBe("");
    expect(defaultOverrideReason("undo", { suggested: true })).toBe("");
  });
});

describe("override form schema", () => {
  const valid: MachineOverrideInput = {
    tran_date: "2026-10-01",
    shift: "A",
    machine_ids: [7, 8],
    action: "ADD",
    reason: "  Loom ran, operator not marked  ",
  };
  const messageFor = (input: MachineOverrideInput, field: keyof MachineOverrideInput) => {
    const result = validateMachineOverride(input);
    return result.ok ? null : (result.errors[field] ?? null);
  };

  it("accepts a complete form and trims the reason", () => {
    const parsed = machineOverrideSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.reason).toBe("Loom ran, operator not marked");
    expect(validateMachineOverride(valid)).toEqual({
      ok: true,
      data: { ...valid, reason: "Loom ran, operator not marked" },
    });
    for (const shift of ["A", "B", "C", "G"]) {
      expect(machineOverrideSchema.safeParse({ ...valid, shift }).success).toBe(true);
    }
    expect(machineOverrideSchema.safeParse({ ...valid, action: "EXCLUDE" }).success).toBe(true);
  });

  it("needs a date, one of the four shift letters and a known action", () => {
    expect(messageFor({ ...valid, tran_date: "" }, "tran_date")).toBe("Pick a date");
    expect(messageFor({ ...valid, tran_date: "01-10-2026" }, "tran_date")).toBe("Pick a date");
    expect(messageFor({ ...valid, shift: "" }, "shift")).toBe("Pick a shift");
    expect(messageFor({ ...valid, shift: "D" }, "shift")).toBe("Pick a shift");
    expect(machineOverrideSchema.safeParse({ ...valid, action: "REMOVE" }).success).toBe(false);
  });

  it("needs at least one machine and at most 500", () => {
    expect(messageFor({ ...valid, machine_ids: [] }, "machine_ids")).toBe("Pick at least one machine");
    const many = Array.from({ length: 501 }, (_, i) => i + 1);
    expect(messageFor({ ...valid, machine_ids: many }, "machine_ids")).toBe("At most 500 machines at a time");
    expect(validateMachineOverride({ ...valid, machine_ids: many.slice(0, 500) }).ok).toBe(true);
    expect(machineOverrideSchema.safeParse({ ...valid, machine_ids: [0] }).success).toBe(false);
  });

  it("needs a reason of 3 to 255 characters, counted after trimming", () => {
    expect(messageFor({ ...valid, reason: "" }, "reason")).toBe("Give a reason (at least 3 characters)");
    expect(messageFor({ ...valid, reason: "  ab  " }, "reason")).toBe("Give a reason (at least 3 characters)");
    expect(validateMachineOverride({ ...valid, reason: "abc" }).ok).toBe(true);
    expect(validateMachineOverride({ ...valid, reason: "x".repeat(255) }).ok).toBe(true);
    expect(messageFor({ ...valid, reason: "x".repeat(256) }, "reason")).toBe(
      "Keep the reason within 255 characters",
    );
  });

  it("reports every faulty field at once", () => {
    const result = validateMachineOverride({ ...valid, shift: "", machine_ids: [], reason: "" });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : Object.keys(result.errors).sort()).toEqual(["machine_ids", "reason", "shift"]);
  });

  it("keeps the date inside the loaded window and out of the future", () => {
    const window = { from: "2026-10-01", to: "2026-10-05", today: "2026-10-03" };
    expect(validateMachineOverride({ ...valid, tran_date: "2026-10-03" }, window).ok).toBe(true);
    const before = validateMachineOverride({ ...valid, tran_date: "2026-09-30" }, window);
    expect(before.ok ? null : before.errors.tran_date).toMatch(/between 2026-10-01 and 2026-10-05/);
    const after = validateMachineOverride({ ...valid, tran_date: "2026-10-06" }, window);
    expect(after.ok ? null : after.errors.tran_date).toMatch(/between 2026-10-01 and 2026-10-05/);
    const future = validateMachineOverride({ ...valid, tran_date: "2026-10-04" }, window);
    expect(future.ok ? null : future.errors.tran_date).toBe("The date cannot be in the future");
  });

  it("bounds the date input by the window, capped at today", () => {
    expect(overrideDateBounds({ from: "2026-10-01", to: "2026-10-31", today: "2026-10-03" })).toEqual({
      min: "2026-10-01",
      max: "2026-10-03",
    });
    expect(overrideDateBounds({ from: "2026-09-01", to: "2026-09-30", today: "2026-10-03" })).toEqual({
      min: "2026-09-01",
      max: "2026-09-30",
    });
    expect(overrideDateBounds({ from: "2026-10-01", to: "2026-10-31" })).toEqual({
      min: "2026-10-01",
      max: "2026-10-31",
    });
  });
});

describe("override payloads", () => {
  it("sends a machine picked in both lists once", () => {
    expect(uniqueMachineIds([7, 8, 9], [9, 7, 12])).toEqual([7, 8, 9, 12]);
    expect(uniqueMachineIds([], [])).toEqual([]);
  });

  it("builds the POST body with the ids deduped and the reason trimmed", () => {
    expect(
      buildOverridePayload(9, 29, {
        tran_date: "2026-10-01",
        shift: "B",
        machine_ids: [7, 8, 7, 12, 8],
        action: "ADD",
        reason: " Loom ran ",
      }),
    ).toEqual({
      co_id: 9,
      branch_id: 29,
      tran_date: "2026-10-01",
      shift: "B",
      machine_ids: [7, 8, 12],
      action: "ADD",
      reason: "Loom ran",
    });
  });

  it("builds the undo body", () => {
    expect(buildUndoPayload(9, 29, [41])).toEqual({ co_id: 9, branch_id: 29, override_ids: [41] });
    expect(buildUndoPayload(9, 29, [41, 41, 42]).override_ids).toEqual([41, 42]);
  });
});

describe("branch machines (Add machines picker)", () => {
  const machine = (over: Partial<BranchMachine>): BranchMachine => ({
    machine_id: 1,
    machine: "Hessian Loom - 1",
    mech_code: "H1",
    machine_type_id: 7,
    machine_type: "Loom",
    dept_id: 2,
    dept: "WEAVING",
    group_ids: [HESSIAN],
    groups: "Hessian looms",
    ...over,
  });
  const machines: BranchMachine[] = [
    machine({}),
    machine({ machine_id: 2, machine: "Hessian Loom - 2", mech_code: null, group_ids: [HESSIAN, ALL_LOOMS], groups: "Hessian looms, All looms" }),
    machine({ machine_id: 20, machine: "S4 Loom - 1", mech_code: null, group_ids: [ALL_LOOMS], groups: "All looms" }),
    machine({ machine_id: 30, machine: "Frame 1", mech_code: "F1", machine_type_id: SPINNING_TYPE, machine_type: "Spinning Frame", dept_id: 3, dept: "SPINNING", group_ids: [], groups: "" }),
  ];

  it("fills the optional fields of a machine and drops an entry without an id", () => {
    expect(toBranchMachine({ machine_id: 5, machine: "Winder 1" })).toEqual({
      machine_id: 5,
      machine: "Winder 1",
      mech_code: null,
      machine_type_id: null,
      machine_type: null,
      dept_id: null,
      dept: null,
      group_ids: [],
      groups: "",
    });
    expect(toBranchMachine({ machine_id: 5 })?.machine).toBe("Machine 5");
    expect(toBranchMachine({ machine: "No id" })).toBeNull();
    expect(toBranchMachine(null)).toBeNull();
  });

  it("labels a machine with its mech code and type", () => {
    expect(branchMachineLabel(machines[0])).toBe("Hessian Loom - 1 (H1) — Loom");
    expect(branchMachineLabel(machines[1])).toBe("Hessian Loom - 2 — Loom");
    expect(branchMachineLabel({ machine: "Winder 1", mech_code: null, machine_type: null })).toBe("Winder 1");
  });

  it("narrows the options by machine type and group", () => {
    const idsOf = (list: BranchMachine[]) => list.map((m) => m.machine_id);
    expect(idsOf(filterBranchMachines(machines, { machineTypeId: "", groupId: "" }))).toEqual([1, 2, 20, 30]);
    expect(idsOf(filterBranchMachines(machines, { machineTypeId: SPINNING_TYPE, groupId: "" }))).toEqual([30]);
    expect(idsOf(filterBranchMachines(machines, { machineTypeId: "", groupId: HESSIAN }))).toEqual([1, 2]);
    expect(idsOf(filterBranchMachines(machines, { machineTypeId: 7, groupId: ALL_LOOMS }))).toEqual([2, 20]);
    // A machine already picked stays listed whatever the filters say.
    expect(
      idsOf(filterBranchMachines(machines, { machineTypeId: SPINNING_TYPE, groupId: "" }, new Set([1]))),
    ).toEqual([1, 30]);
  });

  it("narrows the options by department, alone and with the other filters", () => {
    const idsOf = (list: BranchMachine[]) => list.map((m) => m.machine_id);
    const depts = [...new Set(machines.map((m) => m.dept_id))];
    for (const dept of depts) {
      if (dept == null) continue;
      const expected = machines.filter((m) => m.dept_id === dept).map((m) => m.machine_id);
      expect(idsOf(filterBranchMachines(machines, { machineTypeId: "", groupId: "", deptId: dept }))).toEqual(expected);
    }
    // No department picked (omitted or "") leaves the list alone.
    expect(idsOf(filterBranchMachines(machines, { machineTypeId: "", groupId: "", deptId: "" }))).toEqual([1, 2, 20, 30]);
    // A department no machine belongs to shows nothing — except machines already picked.
    expect(filterBranchMachines(machines, { machineTypeId: "", groupId: "", deptId: -1 })).toEqual([]);
    expect(
      idsOf(filterBranchMachines(machines, { machineTypeId: "", groupId: "", deptId: -1 }, new Set([20]))),
    ).toEqual([20]);
  });

  it("offers the departments of the branch machines and of the loaded rows, by name", () => {
    expect(
      branchMachineDepartmentOptions(
        [
          { dept_id: 21, dept: "WEAVING" },
          { dept_id: 21, dept: "WEAVING" },
          { dept_id: 9, dept: "SPINNING" },
          { dept_id: null, dept: null },
        ],
        [
          { dept_id: 30, dept: "FINISHING" },
          { dept_id: 9, dept: "SPINNING" },
          { dept_id: 44, dept: null },
        ],
      ),
    ).toEqual([
      { value: 44, label: "Department 44" },
      { value: 30, label: "FINISHING" },
      { value: 9, label: "SPINNING" },
      { value: 21, label: "WEAVING" },
    ]);
    expect(branchMachineDepartmentOptions([])).toEqual([]);
  });

  it("offers the machine types and groups the branch machines carry", () => {
    expect(branchMachineFilterOptions(machines)).toEqual({
      machineTypes: [
        { value: 7, label: "Loom" },
        { value: SPINNING_TYPE, label: "Spinning Frame" },
      ],
      groups: [
        { value: ALL_LOOMS, label: "All looms" },
        { value: HESSIAN, label: "Hessian looms" },
      ],
    });
    expect(branchMachineFilterOptions([])).toEqual({ machineTypes: [], groups: [] });
  });
});

describe("override API calls", () => {
  const payload = {
    co_id: 9,
    branch_id: 29,
    tran_date: "2026-10-01",
    shift: "A" as const,
    machine_ids: [7, 8],
    action: "ADD" as const,
    reason: "Loom ran",
  };

  beforeEach(() => {
    vi.mocked(fetchWithCookie).mockReset();
  });

  it("POSTs the override and returns how many were saved", async () => {
    vi.mocked(fetchWithCookie).mockResolvedValue({ data: { data: { saved: 2 } }, error: null, status: 200 });
    await expect(saveMachineOverride(payload)).resolves.toBe(2);
    expect(fetchWithCookie).toHaveBeenCalledWith(
      apiRoutesPortalMasters.JP_HANDS_REPORT_MACHINE_OVERRIDE,
      "POST",
      payload,
    );
    expect(apiRoutesPortalMasters.JP_HANDS_REPORT_MACHINE_OVERRIDE).toMatch(
      /\/juteProductionReports\/hands_report_machine_override$/,
    );
  });

  it("rejects with the server's plain-language detail", async () => {
    const detail = "This role can view the hands report but not change the machines worked";
    vi.mocked(fetchWithCookie).mockResolvedValue({ data: null, error: detail, status: 403 });
    await expect(saveMachineOverride(payload)).rejects.toThrow(detail);
    await expect(undoMachineOverride({ co_id: 9, branch_id: 29, override_ids: [41] })).rejects.toThrow(detail);
  });

  it("POSTs the undo and returns how many were undone", async () => {
    vi.mocked(fetchWithCookie).mockResolvedValue({ data: { data: { undone: 1 } }, error: null, status: 200 });
    const body = { co_id: 9, branch_id: 29, override_ids: [41] };
    await expect(undoMachineOverride(body)).resolves.toBe(1);
    expect(fetchWithCookie).toHaveBeenCalledWith(
      apiRoutesPortalMasters.JP_HANDS_REPORT_MACHINE_OVERRIDE_UNDO,
      "POST",
      body,
    );
    expect(apiRoutesPortalMasters.JP_HANDS_REPORT_MACHINE_OVERRIDE_UNDO).toMatch(
      /\/juteProductionReports\/hands_report_machine_override_undo$/,
    );
  });

  it("GETs the branch machines, normalised and by name", async () => {
    vi.mocked(fetchWithCookie).mockResolvedValue({
      data: {
        data: [
          { machine_id: 12, machine: "Loom 12", machine_type_id: 7, machine_type: "Loom", group_ids: [HESSIAN], groups: "Hessian looms" },
          { machine_id: 2, machine: "Loom 2" },
          { machine: "no id" },
        ],
      },
      error: null,
      status: 200,
    });
    const list = await fetchBranchMachines(9, 29);
    expect(vi.mocked(fetchWithCookie).mock.calls[0][0]).toBe(
      `${apiRoutesPortalMasters.JP_HANDS_REPORT_MACHINES}?co_id=9&branch_id=29`,
    );
    expect(apiRoutesPortalMasters.JP_HANDS_REPORT_MACHINES).toMatch(
      /\/juteProductionReports\/hands_report_machines$/,
    );
    expect(list.map((m) => m.machine)).toEqual(["Loom 2", "Loom 12"]);
    expect(list[0]).toMatchObject({ group_ids: [], groups: "", mech_code: null });
  });

  it("rejects when the branch machines cannot be loaded", async () => {
    vi.mocked(fetchWithCookie).mockResolvedValue({ data: null, error: "Request failed with status 404", status: 404 });
    await expect(fetchBranchMachines(9, 29)).rejects.toThrow("Request failed with status 404");
  });
});
