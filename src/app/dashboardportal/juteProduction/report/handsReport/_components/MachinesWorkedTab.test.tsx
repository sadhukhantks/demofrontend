/**
 * @vitest-environment jsdom
 *
 * Hands Report tabs: the Machines Worked tab body (chips, caption, filtered
 * grid, Excel export) against both today's response and the 2026-10-01
 * contract, and the page's tab wiring — each tab loads its own view for the
 * shared dates, and a tab whose filters have not changed is not refetched.
 * Also the manual additions / exclusions of spec §12.4: the actions show only
 * with `meta.can_edit` AND the menu's edit access, the Add machines dialog and
 * the Count / Exclude / Undo row actions, and the page's save -> toast ->
 * reload -> Manning-stale wiring.
 * The fetches, the toast and the Excel writer are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { GridColDef, GridRenderCellParams, GridValidRowModel } from "@mui/x-data-grid";

/** What the sidebar menu grants on the page; flipped per test. */
const menuAccess = vi.hoisted(() => ({ edit: false }));

vi.mock("@/components/dashboard/sidebarContext", () => ({
  useSidebarContext: () => ({
    hasMenuAccess: (_path: string, action?: string) => (action === "edit" ? menuAccess.edit : true),
  }),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

/** The override form refuses a future date; pin "today" to the fixtures' date. */
vi.mock("@/components/reports/reportDates", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/reports/reportDates")>()),
  todayIso: () => "2026-10-01",
}));

vi.mock("@/components/reports/useReportBranches", () => ({
  useReportBranches: () => ({
    branches: [{ branch_id: 29, branch_name: "FACTORY" }],
    coId: 9,
    companyName: "DEV3",
    initialBranchId: 29,
    dateParam: null,
  }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/dashboardportal/juteProduction/report/handsReport",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/utils/reportMenuService", () => ({
  resolveReportMenuId: vi.fn().mockResolvedValue(77),
}));

vi.mock("@/components/reports/exportExcel", () => ({
  exportRowsToExcel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../_service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_service")>()),
  fetchHandsReport: vi.fn(),
  fetchBranchMachines: vi.fn(),
  saveMachineOverride: vi.fn(),
  undoMachineOverride: vi.fn(),
}));

/** DataGrid virtualises on a measured viewport and renders no rows in jsdom;
 *  a plain table with the same column contract lets the tests read the rows.
 *  Cells are the row's plain value, except the Status and actions columns,
 *  which are drawn with their own renderCell so the status tooltip can be
 *  hovered and the row buttons clicked. */
vi.mock("@/components/reports/ReportGrid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/reports/ReportGrid")>();
  const React = await import("react");
  type Props = {
    rows: GridValidRowModel[];
    columns: GridColDef[];
    getRowId: (r: GridValidRowModel) => string | number;
  };
  const RENDERED = new Set(["actions", "status_label"]);
  const Grid = ({ rows, columns, getRowId }: Props) =>
    React.createElement(
      "table",
      { "data-testid": "grid" },
      React.createElement(
        "thead",
        null,
        React.createElement(
          "tr",
          null,
          columns.map((c) => React.createElement("th", { key: c.field }, c.headerName)),
        ),
      ),
      React.createElement(
        "tbody",
        null,
        rows.map((r) =>
          React.createElement(
            "tr",
            { key: getRowId(r) },
            columns.map((c) =>
              React.createElement(
                "td",
                { key: c.field },
                RENDERED.has(c.field) && c.renderCell
                  ? c.renderCell({ row: r } as GridRenderCellParams)
                  : r[c.field] == null
                    ? ""
                    : String(r[c.field]),
              ),
            ),
          ),
        ),
      ),
    );
  return { ...actual, default: Grid };
});

import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { toast } from "@/hooks/use-toast";
import {
  fetchBranchMachines,
  fetchHandsReport,
  NO_MACHINE_FILTERS,
  saveMachineOverride,
  undoMachineOverride,
  type BranchMachine,
  type HandsMeta,
  type HandsReport,
  type HandsReportFilters,
  type MachineRunRow,
  type MachineScope,
} from "../_service";
import Page from "../page";
import MachinesWorkedTab, {
  type MachineOverrideControls,
  type MachinesWorkedTabProps,
} from "./MachinesWorkedTab";

const meta = (over: Partial<HandsMeta> = {}): HandsMeta => ({
  co_id: 9,
  branch_id: 29,
  date_from: "2026-10-01",
  date_to: "2026-10-01",
  view: "machines_run",
  row_count: 0,
  total_actual: null,
  total_target: null,
  total_excess: null,
  total_short: null,
  notes: [],
  ...over,
});

/** A machine-shift exactly as today's backend sends it. */
const legacyRow = (over: Partial<MachineRunRow> = {}): MachineRunRow => ({
  date: "2026-10-01",
  shift: "A",
  dept_id: 2,
  dept: "WEAVING",
  machine_type_id: 7,
  machine_type: "Loom",
  machine_id: 1,
  machine: "Hessian Loom - 1",
  mech_code: "H1",
  sources: "Weaving, Attendance",
  hands: 1,
  stoppage_hours: 0,
  breakdown_min: 0,
  prod_kg: null,
  prod_cuts: 4,
  counted: true,
  ...over,
});

const LEGACY: HandsReport = {
  view: "machines_run",
  rows: [
    legacyRow(),
    legacyRow({ machine_id: 2, machine: "Hessian Loom - 2", sources: "Stoppage", hands: null, counted: false }),
  ],
  type_summary: [
    { date: "2026-10-01", machine_type_id: 7, machine_type: "Loom", run_a: 1, run_b: 0, run_c: 0, run_g: 0, machine_shifts: 1, machines: 1 },
  ],
  meta: meta({ machine_shifts_run: 1, machines_run: 1, stopped_only_rows: 1 }),
};

const HESSIAN = 11;
const SCOPES: MachineScope[] = [
  {
    designation_id: 100,
    designation: "WEAVER(H)",
    norm_kind: "M",
    scope: "group",
    scope_id: HESSIAN,
    scope_name: "Hessian looms",
    units_per_hand: 2,
    qty_per_hand: null,
  },
];

const newRow = (over: Partial<MachineRunRow>): MachineRunRow =>
  legacyRow({ workers: 1, shift_hours: 8, status: "WORKED", group_ids: [HESSIAN], groups: "Hessian looms", ...over });

const CURRENT: HandsReport = {
  view: "machines_run",
  rows: [
    newRow({ machine_id: 1, machine: "Hessian Loom - 1" }),
    newRow({ machine_id: 2, machine: "Hessian Loom - 2" }),
    newRow({ machine_id: 3, machine: "Hessian Loom - 3", status: "STOPPED_ALL_SHIFT", counted: false, stoppage_hours: 8 }),
    newRow({ machine_id: 20, machine: "S4 Loom - 1", group_ids: [], groups: "" }),
    newRow({ machine_id: 21, machine: "S4 Loom - 2", group_ids: [], groups: "", status: "NO_WORKER_MARKED", counted: false, workers: 0 }),
  ],
  type_summary: [
    {
      date: "2026-10-01",
      machine_type_id: 7,
      machine_type: "Loom",
      run_a: 3,
      run_b: 0,
      run_c: 0,
      run_g: 0,
      machine_shifts: 3,
      machines: 3,
      stopped_all_shift: 1,
      no_worker_marked: 1,
    },
  ],
  scopes: SCOPES,
  meta: meta({
    machine_shifts_run: 3,
    machines_run: 3,
    stopped_all_shift: 1,
    no_worker_marked: 1,
    synced_at: "2026-10-01T14:32:10",
    notes: ["1 machine-shift(s) have production entered but no worker marked in attendance"],
  }),
};

const tabProps = (over: Partial<MachinesWorkedTabProps> = {}): MachinesWorkedTabProps => ({
  report: CURRENT,
  loading: false,
  error: null,
  branchId: 29,
  filters: NO_MACHINE_FILTERS,
  onFiltersChange: vi.fn(),
  exportHeader: { companyName: "DEV3", branchName: "FACTORY", reportName: "Hands Report — Machines Worked" },
  resolveReportNo: () => Promise.resolve(77),
  countsFromMeta: true,
  ...over,
});

/** The machine-wise grid is the last one; the by-type summary sits above it. */
const detailGrid = () => {
  const grids = screen.getAllByTestId("grid");
  return grids[grids.length - 1];
};
const bodyRows = (grid: HTMLElement) => within(grid).queryAllByRole("row").slice(1);
const headers = (grid: HTMLElement) => within(grid).getAllByRole("columnheader").map((h) => h.textContent);

/** The §12 contract: manual rows, a suggested row, the manual counts and can_edit. */
const EDITABLE: HandsReport = {
  view: "machines_run",
  rows: [
    newRow({ machine_id: 1, machine: "Hessian Loom - 1" }),
    newRow({
      machine_id: 2,
      machine: "Hessian Loom - 2",
      status: "ADDED_MANUALLY",
      workers: 0,
      manual_action: "ADD",
      override_id: 41,
      manual_reason: "Loom ran, operator not marked",
      manual_by: "A. Kumar",
      manual_at: "2026-10-01T14:32:10",
    }),
    newRow({ machine_id: 3, machine: "Hessian Loom - 3", status: "STOPPED_ALL_SHIFT", counted: false, stoppage_hours: 8 }),
    newRow({
      machine_id: 20,
      machine: "S4 Loom - 1",
      group_ids: [],
      groups: "",
      status: "EXCLUDED_MANUALLY",
      counted: false,
      manual_action: "EXCLUDE",
      override_id: 42,
      manual_reason: "Wrong loom marked",
      manual_by: "S. Das",
      manual_at: "2026-10-01T15:01:00",
    }),
    newRow({ machine_id: 21, machine: "S4 Loom - 2", mech_code: "S42", group_ids: [], groups: "", status: "NO_WORKER_MARKED", counted: false, workers: 0, suggested: true }),
    newRow({ machine_id: 22, machine: "S4 Loom - 3", mech_code: "S43", group_ids: [], groups: "", status: "NO_WORKER_MARKED", counted: false, workers: 0, sources: "Stoppage", prod_cuts: null, suggested: false }),
    newRow({ machine_id: 23, machine: "S4 Loom - 4", mech_code: "S44", group_ids: [], groups: "", status: "NO_WORKER_MARKED", counted: false, workers: 0, suggested: true }),
    // A suggestion of another shift — never offered for shift A.
    newRow({ machine_id: 24, machine: "S4 Loom - 5", shift: "B", group_ids: [], groups: "", status: "NO_WORKER_MARKED", counted: false, workers: 0, suggested: true }),
  ],
  type_summary: [],
  scopes: SCOPES,
  meta: meta({
    machine_shifts_run: 2,
    machines_run: 2,
    stopped_all_shift: 1,
    no_worker_marked: 4,
    added_manually: 1,
    excluded_manually: 1,
    can_edit: true,
    synced_at: "2026-10-01T14:32:10",
  }),
};

const BRANCH_MACHINES: BranchMachine[] = [
  { machine_id: 21, machine: "S4 Loom - 2", mech_code: "S42", machine_type_id: 7, machine_type: "Loom", dept_id: 2, dept: "WEAVING", group_ids: [], groups: "" },
  { machine_id: 60, machine: "Winder 1", mech_code: null, machine_type_id: 15, machine_type: "Winding", dept_id: 5, dept: "WINDING", group_ids: [], groups: "" },
];

const controls = (over: Partial<MachineOverrideControls> = {}): MachineOverrideControls => ({
  menuEdit: true,
  machines: BRANCH_MACHINES,
  machinesLoading: false,
  machinesError: null,
  onLoadMachines: vi.fn(),
  onSave: vi.fn().mockResolvedValue(true),
  onUndo: vi.fn().mockResolvedValue(true),
  ...over,
});

const rowButton = (name: RegExp) => screen.getByRole("button", { name });
const reasonField = () => within(screen.getByRole("dialog")).getByRole("textbox", { name: /Reason/ });

beforeEach(() => {
  menuAccess.edit = false;
  vi.mocked(exportRowsToExcel).mockClear();
  vi.mocked(toast).mockClear();
  vi.mocked(fetchHandsReport).mockReset();
  vi.mocked(fetchBranchMachines).mockReset();
  vi.mocked(saveMachineOverride).mockReset();
  vi.mocked(undoMachineOverride).mockReset();
});

describe("MachinesWorkedTab", () => {
  it("renders today's response — no status, groups, scopes or new counts — without crashing", () => {
    render(<MachinesWorkedTab {...tabProps({ report: LEGACY })} />);

    // Chips fall back to counting the rows: counted -> Worked, else No worker marked.
    expect(screen.getByText("Worked 1")).toBeInTheDocument();
    expect(screen.getByText("Stopped all shift 0")).toBeInTheDocument();
    expect(screen.getByText("No worker marked 1")).toBeInTheDocument();
    expect(screen.queryByText(/^Synced/)).not.toBeInTheDocument();

    const rows = bodyRows(detailGrid());
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Worked")).toBeInTheDocument();
    expect(within(rows[1]).getByText("No worker marked")).toBeInTheDocument();
    // The summary keeps its old columns when the rows carry no new counts.
    expect(headers(screen.getAllByTestId("grid")[0])).not.toContain("Stopped All Shift");
  });

  it("shows the endpoint's counts, the synced time, the notes and the extended summary", () => {
    render(<MachinesWorkedTab {...tabProps()} />);

    expect(screen.getByText("Worked 3")).toBeInTheDocument();
    expect(screen.getByText("Stopped all shift 1")).toBeInTheDocument();
    expect(screen.getByText("No worker marked 1")).toBeInTheDocument();
    expect(screen.getByText("Synced 14:32")).toBeInTheDocument();
    expect(screen.getByText(/no worker marked in attendance/)).toBeInTheDocument();

    const [summary, detail] = screen.getAllByTestId("grid");
    expect(headers(summary)).toEqual(expect.arrayContaining(["Stopped All Shift", "No Worker Marked"]));
    expect(headers(detail)).toEqual([
      "Date",
      "Shift",
      "Machine",
      "Type",
      "Department",
      "Group",
      "Workers Marked",
      "Stoppage Hrs",
      "Breakdown Min",
      "Prod Kg",
      "Prod Cuts",
      "Entries",
      "Status",
    ]);
    expect(bodyRows(detail)).toHaveLength(5);
    expect(screen.getByText("5 machine-shifts")).toBeInTheDocument();
  });

  it("counts the loaded rows instead of meta when they are a department-filtered subset", () => {
    render(
      <MachinesWorkedTab
        {...tabProps({
          report: { ...CURRENT, meta: meta({ machine_shifts_run: 480, stopped_all_shift: 12, no_worker_marked: 31 }) },
          countsFromMeta: false,
        })}
      />,
    );
    expect(screen.getByText("Worked 3")).toBeInTheDocument();
    expect(screen.getByText("Stopped all shift 1")).toBeInTheDocument();
    expect(screen.getByText("No worker marked 1")).toBeInTheDocument();
  });

  it("filters by designation through its scope and captions the worked machines", () => {
    render(<MachinesWorkedTab {...tabProps({ filters: { ...NO_MACHINE_FILTERS, designationId: 100 } })} />);

    const rows = bodyRows(detailGrid());
    expect(rows.map((r) => r.children[2].textContent)).toEqual([
      "Hessian Loom - 1",
      "Hessian Loom - 2",
      "Hessian Loom - 3",
    ]);
    expect(screen.getByText("3 of 5 machine-shifts (filtered)")).toBeInTheDocument();
    expect(
      screen.getByText("WEAVER(H): Hessian looms group, 2 units per hand → A: 2 worked"),
    ).toBeInTheDocument();
  });

  it("keeps the caption on the worked machines when the Status filter hides them", () => {
    render(
      <MachinesWorkedTab
        {...tabProps({ filters: { ...NO_MACHINE_FILTERS, designationId: 100, status: "STOPPED_ALL_SHIFT" } })}
      />,
    );
    expect(bodyRows(detailGrid())).toHaveLength(1);
    expect(
      screen.getByText("WEAVER(H): Hessian looms group, 2 units per hand → A: 2 worked"),
    ).toBeInTheDocument();
  });

  it("ignores a stale pick the loaded rows no longer offer", () => {
    render(<MachinesWorkedTab {...tabProps({ filters: { ...NO_MACHINE_FILTERS, shift: "C", groupId: 999 } })} />);
    expect(bodyRows(detailGrid())).toHaveLength(5);
  });

  it("exports exactly the filtered rows as machines-worked", async () => {
    render(<MachinesWorkedTab {...tabProps({ filters: { ...NO_MACHINE_FILTERS, status: "WORKED" } })} />);

    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    await waitFor(() => expect(exportRowsToExcel).toHaveBeenCalledTimes(1));
    const [columns, rows, fileName, header] = vi.mocked(exportRowsToExcel).mock.calls[0];
    expect(fileName).toBe("machines-worked");
    expect(rows.map((r) => r.machine)).toEqual(["Hessian Loom - 1", "Hessian Loom - 2", "S4 Loom - 1"]);
    // The sheet gets the readable status, not the API code.
    expect(columns.map((c) => c.field)).toContain("status_label");
    expect(rows.every((r) => r.status_label === "Worked")).toBe(true);
    expect(header).toMatchObject({ reportName: "Hands Report — Machines Worked", reportNo: 77 });
  });

  it("disables the export when the filters leave nothing", () => {
    render(<MachinesWorkedTab {...tabProps({ report: { ...CURRENT, rows: [], type_summary: [] } })} />);
    expect(screen.getByRole("button", { name: "Export to Excel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export Summary" })).toBeDisabled();
  });
});

describe("MachinesWorkedTab — manual additions and exclusions", () => {
  it("shows the manual chips only when there is something to count", () => {
    const { unmount } = render(<MachinesWorkedTab {...tabProps({ report: EDITABLE })} />);
    // Worked = counted machine-shifts (2) less the one added manually.
    expect(screen.getByText("Worked 1")).toBeInTheDocument();
    expect(screen.getByText("Added manually 1")).toBeInTheDocument();
    expect(screen.getByText("Excluded 1")).toBeInTheDocument();
    unmount();

    render(<MachinesWorkedTab {...tabProps()} />);
    expect(screen.queryByText(/^Added manually/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Excluded/)).not.toBeInTheDocument();
  });

  it("offers the two manual statuses in the Status filter and filters by them", () => {
    render(
      <MachinesWorkedTab
        {...tabProps({ report: EDITABLE, filters: { ...NO_MACHINE_FILTERS, status: "ADDED_MANUALLY" } })}
      />,
    );
    const rows = bodyRows(detailGrid());
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("Hessian Loom - 2")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Added manually")).toBeInTheDocument();
  });

  it("draws the manual statuses as info / outlined-error chips with the reason, who and when on hover", async () => {
    render(<MachinesWorkedTab {...tabProps({ report: EDITABLE })} />);
    const rows = bodyRows(detailGrid());

    const added = within(rows[1]).getByText("Added manually");
    expect(added.closest(".MuiChip-root")).toHaveClass("MuiChip-colorInfo", "MuiChip-filled");
    const excluded = within(rows[3]).getByText("Excluded manually");
    expect(excluded.closest(".MuiChip-root")).toHaveClass("MuiChip-colorError", "MuiChip-outlined");

    fireEvent.mouseOver(added);
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Added manually");
    expect(tip).toHaveTextContent("Reason: Loom ran, operator not marked");
    expect(tip).toHaveTextContent("By A. Kumar · 2026-10-01 14:32");
  });

  it("gives a row without a manual change no status tooltip", () => {
    render(<MachinesWorkedTab {...tabProps({ report: EDITABLE })} />);
    const workedChip = within(bodyRows(detailGrid())[0]).getByText("Worked");
    fireEvent.mouseOver(workedChip);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(workedChip.closest("[aria-label]")).toBeNull();
  });

  it("writes the reason, who and when in the Excel sheet's Manual column", async () => {
    render(<MachinesWorkedTab {...tabProps({ report: EDITABLE, overrides: controls() })} />);

    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    await waitFor(() => expect(exportRowsToExcel).toHaveBeenCalledTimes(1));
    const [columns, rows] = vi.mocked(exportRowsToExcel).mock.calls[0];
    expect(columns[columns.length - 1]).toMatchObject({ field: "manual", headerName: "Manual" });
    // The on-screen action buttons are not a sheet column.
    expect(columns.map((c) => c.field)).not.toContain("actions");
    expect(rows.map((r) => r.manual)).toEqual([
      "",
      "Added: Loom ran, operator not marked (A. Kumar, 2026-10-01 14:32)",
      "",
      "Excluded: Wrong loom marked (S. Das, 2026-10-01 15:01)",
      "",
      "",
      "",
      "",
    ]);
    // The bare reason is left off the sheet rows: a reason of just "Total"
    // would otherwise shade the row as a total line.
    expect(rows.every((r) => r.manual_reason == null)).toBe(true);
  });

  it("shows no edit actions on a response without can_edit, whatever the menu grants", () => {
    render(<MachinesWorkedTab {...tabProps({ overrides: controls() })} />);
    expect(screen.queryByRole("button", { name: "Add machines" })).not.toBeInTheDocument();
    expect(headers(detailGrid())).not.toContain("Action");
    expect(screen.queryByRole("button", { name: /^(Count as worked|Exclude|Undo):/ })).not.toBeInTheDocument();
  });

  it("shows no edit actions when the backend allows it but the menu does not, or no controls are given", () => {
    const { unmount } = render(
      <MachinesWorkedTab {...tabProps({ report: EDITABLE, overrides: controls({ menuEdit: false }) })} />,
    );
    expect(screen.queryByRole("button", { name: "Add machines" })).not.toBeInTheDocument();
    expect(headers(detailGrid())).not.toContain("Action");
    unmount();

    render(<MachinesWorkedTab {...tabProps({ report: EDITABLE })} />);
    expect(screen.queryByRole("button", { name: "Add machines" })).not.toBeInTheDocument();
    expect(headers(detailGrid())).not.toContain("Action");
  });

  it("with edit access: Add machines, and one action per row by its status", () => {
    render(<MachinesWorkedTab {...tabProps({ report: EDITABLE, overrides: controls() })} />);

    expect(screen.getByRole("button", { name: "Add machines" })).toBeInTheDocument();
    expect(headers(detailGrid())[0]).toBe("Action");
    const actions = bodyRows(detailGrid()).map(
      (r) => within(r).queryByRole("button")?.getAttribute("aria-label") ?? null,
    );
    expect(actions).toEqual([
      "Exclude: Hessian Loom - 1, 2026-10-01 shift A",
      "Undo: Hessian Loom - 2, 2026-10-01 shift A",
      null, // stopped all shift
      "Undo: S4 Loom - 1, 2026-10-01 shift A",
      "Count as worked: S4 Loom - 2, 2026-10-01 shift A",
      "Count as worked: S4 Loom - 3, 2026-10-01 shift A",
      "Count as worked: S4 Loom - 4, 2026-10-01 shift A",
      "Count as worked: S4 Loom - 5, 2026-10-01 shift B",
    ]);
  });

  it("Count on a suggested row opens with the reason pre-filled and saves an ADD", async () => {
    const overrides = controls();
    render(<MachinesWorkedTab {...tabProps({ report: EDITABLE, overrides })} />);

    fireEvent.click(rowButton(/^Count as worked: S4 Loom - 2,/));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Count this machine as worked");
    expect(reasonField()).toHaveValue("Production entered, no worker marked");

    // The pre-filled reason is editable.
    fireEvent.change(reasonField(), { target: { value: "Ran all shift, card missing" } });
    fireEvent.click(screen.getByRole("button", { name: "Count" }));
    await waitFor(() => expect(overrides.onSave).toHaveBeenCalledTimes(1));
    expect(overrides.onSave).toHaveBeenCalledWith({
      tran_date: "2026-10-01",
      shift: "A",
      machine_ids: [21],
      action: "ADD",
      reason: "Ran all shift, card missing",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("Count on a row that is not a suggestion opens with an empty reason", async () => {
    render(<MachinesWorkedTab {...tabProps({ report: EDITABLE, overrides: controls() })} />);
    fireEvent.click(rowButton(/^Count as worked: S4 Loom - 3,/));
    await screen.findByRole("dialog");
    expect(reasonField()).toHaveValue("");
  });

  it("Exclude asks for the reason before saving an EXCLUDE", async () => {
    const overrides = controls();
    render(<MachinesWorkedTab {...tabProps({ report: EDITABLE, overrides })} />);

    fireEvent.click(rowButton(/^Exclude: Hessian Loom - 1,/));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Exclude this machine");
    expect(reasonField()).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Exclude" }));
    expect(await screen.findByText("Give a reason (at least 3 characters)")).toBeInTheDocument();
    expect(overrides.onSave).not.toHaveBeenCalled();

    fireEvent.change(reasonField(), { target: { value: "Wrong loom marked" } });
    fireEvent.click(screen.getByRole("button", { name: "Exclude" }));
    await waitFor(() => expect(overrides.onSave).toHaveBeenCalledTimes(1));
    expect(overrides.onSave).toHaveBeenCalledWith({
      tran_date: "2026-10-01",
      shift: "A",
      machine_ids: [1],
      action: "EXCLUDE",
      reason: "Wrong loom marked",
    });
  });

  it("Undo shows what was done, confirms, and sends the override id", async () => {
    const overrides = controls();
    render(<MachinesWorkedTab {...tabProps({ report: EDITABLE, overrides })} />);

    fireEvent.click(rowButton(/^Undo: Hessian Loom - 2,/));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Undo this manual change");
    expect(dialog).toHaveTextContent("Reason: Loom ran, operator not marked");
    expect(dialog).toHaveTextContent("By A. Kumar · 2026-10-01 14:32");
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(overrides.onUndo).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(overrides.onUndo).toHaveBeenCalledWith(41));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(overrides.onSave).not.toHaveBeenCalled();
  });

  it("keeps the dialog open, with what was typed, when the save fails", async () => {
    const overrides = controls({ onSave: vi.fn().mockResolvedValue(false) });
    render(<MachinesWorkedTab {...tabProps({ report: EDITABLE, overrides })} />);

    fireEvent.click(rowButton(/^Exclude: Hessian Loom - 1,/));
    await screen.findByRole("dialog");
    fireEvent.change(reasonField(), { target: { value: "Wrong loom marked" } });
    fireEvent.click(screen.getByRole("button", { name: "Exclude" }));
    await waitFor(() => expect(overrides.onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Exclude" })).toBeEnabled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(reasonField()).toHaveValue("Wrong loom marked");
  });
});

describe("Add machines dialog", () => {
  const openDialog = async (overrides: MachineOverrideControls, shift = "A") => {
    render(
      <MachinesWorkedTab
        {...tabProps({ report: EDITABLE, overrides, filters: { ...NO_MACHINE_FILTERS, shift } })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add machines" }));
    return screen.findByRole("dialog");
  };
  const suggested = (dialog: HTMLElement) =>
    within(within(dialog).getByRole("group", { name: "Suggested machines" })).getAllByRole("checkbox");

  it("asks the page for the branch machines when it opens, on the From date and the tab's shift", async () => {
    const overrides = controls();
    const dialog = await openDialog(overrides);
    expect(overrides.onLoadMachines).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveTextContent("Add machines worked");
    expect(within(dialog).getByLabelText(/^Date/)).toHaveValue("2026-10-01");
    expect(within(dialog).getByLabelText(/^Date/)).toHaveAttribute("min", "2026-10-01");
    expect(within(dialog).getByLabelText(/^Date/)).toHaveAttribute("max", "2026-10-01");
    expect(within(dialog).getByLabelText(/^Shift/)).toHaveValue("A");
  });

  it("lists the suggested machines of that date and shift only", async () => {
    const dialog = await openDialog(controls());
    const group = within(dialog).getByRole("group", { name: "Suggested machines" });
    expect(group).toHaveTextContent("S4 Loom - 2 (S42)");
    expect(group).toHaveTextContent("S4 Loom - 4 (S44)");
    // Not suggested (stoppage only), and a suggestion of shift B.
    expect(group).not.toHaveTextContent("S4 Loom - 3");
    expect(group).not.toHaveTextContent("S4 Loom - 5");
    expect(suggested(dialog)).toHaveLength(2);
    expect(within(dialog).getByText("0 machines selected")).toBeInTheDocument();
  });

  it("has no suggestions until a shift is picked", async () => {
    const dialog = await openDialog(controls(), "");
    expect(within(dialog).queryByRole("group", { name: "Suggested machines" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("Pick a shift to see the machines suggested for it.")).toBeInTheDocument();
  });

  it("needs a machine and a reason before it saves", async () => {
    const overrides = controls();
    const dialog = await openDialog(overrides);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Pick at least one machine")).toBeInTheDocument();
    expect(within(dialog).getByText("Give a reason (at least 3 characters)")).toBeInTheDocument();
    expect(overrides.onSave).not.toHaveBeenCalled();
  });

  it("Select all ticks every suggestion, and a machine picked in both lists is sent once", async () => {
    const overrides = controls();
    const dialog = await openDialog(overrides);

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Select all" }));
    expect(suggested(dialog).every((c) => (c as HTMLInputElement).checked)).toBe(true);
    expect(within(dialog).getByText("2 machines selected")).toBeInTheDocument();

    // "S4 Loom - 2" is suggested AND picked from the branch list; "Winder 1" is new.
    const picker = within(dialog).getByLabelText("Machines");
    for (const name of ["S4 Loom - 2", "Winder 1"]) {
      fireEvent.change(picker, { target: { value: name } });
      fireEvent.click(await screen.findByRole("option", { name: new RegExp(name) }));
    }
    expect(within(dialog).getByText("3 machines selected")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), {
      target: { value: "Cards not punched in B mill" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save (3)" }));
    await waitFor(() => expect(overrides.onSave).toHaveBeenCalledTimes(1));
    expect(overrides.onSave).toHaveBeenCalledWith({
      tran_date: "2026-10-01",
      shift: "A",
      machine_ids: [21, 23, 60],
      action: "ADD",
      reason: "Cards not punched in B mill",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("Hands Report page tabs", () => {
  const MANNING: HandsReport = {
    view: "detailed",
    rows: [],
    meta: meta({ view: "detailed", total_actual: 10, total_target: 12 }),
  };
  const viewsFetched = () => vi.mocked(fetchHandsReport).mock.calls.map(([f]) => f.view);
  const lastFetch = (): HandsReportFilters => {
    const calls = vi.mocked(fetchHandsReport).mock.calls;
    return calls[calls.length - 1][0];
  };

  beforeEach(() => {
    vi.mocked(fetchHandsReport).mockImplementation((f: HandsReportFilters) =>
      Promise.resolve(f.view === "machines_run" ? CURRENT : { ...MANNING, view: f.view }),
    );
  });

  it("opens on Manning, with a single branch shown as text rather than a dropdown", async () => {
    render(<Page />);
    await waitFor(() => expect(fetchHandsReport).toHaveBeenCalledTimes(1));
    expect(viewsFetched()).toEqual(["detailed"]);
    expect(screen.getByRole("tab", { name: "Manning" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Machines Worked" })).toBeInTheDocument();
    expect(screen.getByText("FACTORY")).toBeInTheDocument();
    expect(screen.queryByLabelText("Branch")).not.toBeInTheDocument();
    expect(screen.getByLabelText("View")).toBeInTheDocument();
  });

  it("loads machines_run for the same dates when the Machines Worked tab is opened", async () => {
    render(<Page />);
    await waitFor(() => expect(fetchHandsReport).toHaveBeenCalledTimes(1));
    const manning = lastFetch();

    fireEvent.click(screen.getByRole("tab", { name: "Machines Worked" }));
    await waitFor(() => expect(fetchHandsReport).toHaveBeenCalledTimes(2));
    expect(lastFetch()).toMatchObject({
      view: "machines_run",
      coId: 9,
      branchId: 29,
      dateFrom: manning.dateFrom,
      dateTo: manning.dateTo,
    });
    expect(await screen.findByText("Worked 3")).toBeInTheDocument();
    // The manning-only controls leave with the tab.
    expect(screen.queryByLabelText("View")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Direct / Indirect")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Designation")).toBeInTheDocument();
  });

  it("does not refetch a tab whose filters are unchanged, and does once the dates change", async () => {
    render(<Page />);
    await waitFor(() => expect(fetchHandsReport).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("tab", { name: "Machines Worked" }));
    await waitFor(() => expect(fetchHandsReport).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("tab", { name: "Manning" }));
    fireEvent.click(screen.getByRole("tab", { name: "Machines Worked" }));
    expect(await screen.findByText("Worked 3")).toBeInTheDocument();
    expect(fetchHandsReport).toHaveBeenCalledTimes(2);

    // New dates typed on Machines Worked, then back to Manning: its data is for
    // the old dates, so it reloads for the current ones.
    fireEvent.change(screen.getByLabelText("From Date"), { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByRole("tab", { name: "Manning" }));
    await waitFor(() => expect(fetchHandsReport).toHaveBeenCalledTimes(3));
    expect(lastFetch()).toMatchObject({ view: "detailed", dateFrom: "2026-09-01" });
  });

  it("Submit reloads the open tab only", async () => {
    render(<Page />);
    await waitFor(() => expect(fetchHandsReport).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("tab", { name: "Machines Worked" }));
    await waitFor(() => expect(fetchHandsReport).toHaveBeenCalledTimes(2));
    await screen.findByText("Worked 3");

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(fetchHandsReport).toHaveBeenCalledTimes(3));
    expect(viewsFetched()).toEqual(["detailed", "machines_run", "machines_run"]);
  });
});

describe("Hands Report page — saving a manual change", () => {
  const MANNING: HandsReport = {
    view: "detailed",
    rows: [],
    meta: meta({ view: "detailed", total_actual: 10, total_target: 12 }),
  };
  const viewsFetched = () => vi.mocked(fetchHandsReport).mock.calls.map(([f]) => f.view);

  beforeEach(() => {
    menuAccess.edit = true;
    vi.mocked(fetchHandsReport).mockImplementation((f: HandsReportFilters) =>
      Promise.resolve(f.view === "machines_run" ? EDITABLE : { ...MANNING, view: f.view }),
    );
    vi.mocked(fetchBranchMachines).mockResolvedValue(BRANCH_MACHINES);
    vi.mocked(saveMachineOverride).mockResolvedValue(1);
    vi.mocked(undoMachineOverride).mockResolvedValue(1);
  });

  const openMachinesTab = async () => {
    render(<Page />);
    await waitFor(() => expect(fetchHandsReport).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("tab", { name: "Machines Worked" }));
    await waitFor(() => expect(fetchHandsReport).toHaveBeenCalledTimes(2));
    await screen.findByText("Added manually 1");
  };

  it("hides the edit actions when the menu grants no edit", async () => {
    menuAccess.edit = false;
    await openMachinesTab();
    expect(screen.queryByRole("button", { name: "Add machines" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Count as worked:/ })).not.toBeInTheDocument();
  });

  it("saves, toasts, reloads Machines Worked and refetches Manning when it is next opened", async () => {
    await openMachinesTab();

    fireEvent.click(rowButton(/^Count as worked: S4 Loom - 2,/));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Count" }));

    await waitFor(() => expect(saveMachineOverride).toHaveBeenCalledTimes(1));
    expect(saveMachineOverride).toHaveBeenCalledWith({
      co_id: 9,
      branch_id: 29,
      tran_date: "2026-10-01",
      shift: "A",
      machine_ids: [21],
      action: "ADD",
      reason: "Production entered, no worker marked",
    });
    await waitFor(() => expect(fetchHandsReport).toHaveBeenCalledTimes(3));
    expect(viewsFetched()).toEqual(["detailed", "machines_run", "machines_run"]);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast).mock.calls[0][0]).toMatchObject({ title: "Counted as worked" });
    expect(vi.mocked(toast).mock.calls[0][0]).not.toHaveProperty("variant");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Manning was loaded before the change: opening it again refetches.
    fireEvent.click(screen.getByRole("tab", { name: "Manning" }));
    await waitFor(() => expect(fetchHandsReport).toHaveBeenCalledTimes(4));
    expect(viewsFetched()[3]).toBe("detailed");
    // ...once; after that both tabs are current again.
    fireEvent.click(screen.getByRole("tab", { name: "Machines Worked" }));
    fireEvent.click(screen.getByRole("tab", { name: "Manning" }));
    expect(fetchHandsReport).toHaveBeenCalledTimes(4);
  });

  it("undoes by override id, then reloads", async () => {
    await openMachinesTab();

    fireEvent.click(rowButton(/^Undo: S4 Loom - 1,/));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Undo" }));

    await waitFor(() => expect(undoMachineOverride).toHaveBeenCalledTimes(1));
    expect(undoMachineOverride).toHaveBeenCalledWith({ co_id: 9, branch_id: 29, override_ids: [42] });
    await waitFor(() => expect(fetchHandsReport).toHaveBeenCalledTimes(3));
    expect(vi.mocked(toast).mock.calls[0][0]).toMatchObject({ title: "Undone" });
  });

  it("shows the server's message in a destructive toast and keeps the dialog open", async () => {
    const detail = "This role can view the hands report but not change the machines worked";
    vi.mocked(saveMachineOverride).mockRejectedValue(new Error(detail));
    await openMachinesTab();

    fireEvent.click(rowButton(/^Count as worked: S4 Loom - 2,/));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Count" }));

    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast).mock.calls[0][0]).toMatchObject({ variant: "destructive", description: detail });
    await waitFor(() => expect(screen.getByRole("button", { name: "Count" })).toBeEnabled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Nothing changed, so nothing is reloaded.
    expect(fetchHandsReport).toHaveBeenCalledTimes(2);
  });

  it("loads the branch machines the first time Add machines opens, and not again", async () => {
    await openMachinesTab();
    expect(fetchBranchMachines).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Add machines" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(fetchBranchMachines).toHaveBeenCalledTimes(1));
    expect(fetchBranchMachines).toHaveBeenCalledWith(9, 29);

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Add machines" }));
    await screen.findByRole("dialog");
    expect(fetchBranchMachines).toHaveBeenCalledTimes(1);
  });
});
