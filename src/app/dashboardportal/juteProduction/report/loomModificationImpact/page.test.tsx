/**
 * @vitest-environment jsdom
 *
 * Loom Modification Impact page: loads the options for the seeded branch,
 * runs a report (auto from ?modification_id=, or on Submit), shows the
 * efficiency verdict strip, the comparison block and the stage ladder, greys excluded day-wise
 * rows, lists the mechanical context and surfaces the backend's 400 message.
 * The service is mocked — the backend is trimmed in parallel against the
 * same (efficiency-only) contract.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import "@testing-library/jest-dom";
import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";

const BRANCHES = [
  { branch_id: 12, branch_name: "FACTORY" },
  { branch_id: 13, branch_name: "GODOWN" },
];

/** Mutable so a test can vary the sidebar / URL context (vi.mock is hoisted). */
const hookState = vi.hoisted(() => ({
  value: {
    branches: [] as { branch_id: number; branch_name: string }[],
    coId: 9 as number | null,
    companyName: "DEV3" as string | null,
    initialBranchId: 12 as number | null,
    dateParam: null as string | null,
  },
  search: "",
}));

vi.mock("@/components/reports/useReportBranches", () => ({
  useReportBranches: () => hookState.value,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(hookState.search),
  usePathname: () => "/dashboardportal/juteProduction/report/loomModificationImpact",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock("./_service", () => ({
  fetchLoomModificationImpact: vi.fn(),
  fetchLoomModificationImpactOptions: vi.fn(),
}));

/** DataGrid virtualises on a measured viewport and renders no rows in jsdom;
 *  a plain table with the same column contract lets the tests read the rows. */
vi.mock("@/components/reports/ReportGrid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/reports/ReportGrid")>();
  const React = await import("react");
  type Props = {
    rows: GridValidRowModel[];
    columns: GridColDef[];
    getRowId: (r: GridValidRowModel) => string | number;
    getRowClass?: (r: GridValidRowModel) => string;
    isTotalRow?: (r: GridValidRowModel) => boolean;
  };
  const cell = (c: GridColDef, r: GridValidRowModel): string => {
    let v: unknown = r[c.field];
    if (c.valueGetter) {
      v = (c.valueGetter as (value: unknown, row: GridValidRowModel, col: GridColDef, api: unknown) => unknown)(
        v,
        r,
        c,
        {},
      );
    }
    if (c.valueFormatter) {
      v = (c.valueFormatter as (value: unknown, row: GridValidRowModel, col: GridColDef, api: unknown) => unknown)(
        v,
        r,
        c,
        {},
      );
    }
    return v == null ? "" : String(v);
  };
  const Grid = ({ rows, columns, getRowId, getRowClass, isTotalRow }: Props) =>
    React.createElement(
      "table",
      { "data-testid": "grid" },
      React.createElement(
        "tbody",
        null,
        rows.map((r) =>
          React.createElement(
            "tr",
            {
              key: getRowId(r),
              className: isTotalRow?.(r) ? "report-total-row" : (getRowClass?.(r) ?? ""),
            },
            columns.map((c) => React.createElement("td", { key: c.field }, cell(c, r))),
          ),
        ),
      ),
    );
  return { ...actual, default: Grid };
});

import {
  fetchLoomModificationImpact,
  fetchLoomModificationImpactOptions,
  type LoomModificationImpactOptions,
  type LoomModificationImpactReport,
  type ImpactSegment,
} from "./_service";
import Page from "./page";

const OPTIONS: LoomModificationImpactOptions = {
  modifications: [
    { modification_id: 5, label: "20-08-26 · Shuttle guard · Group EJM-1 / 6 looms", mod_date: "2026-08-20", title: "Shuttle guard", loom_group_name: "EJM-1", loom_count: 6, stage_count: 2 },
    { modification_id: 9, label: "01-09-26 · Beam brake · 3 looms", mod_date: "2026-09-01", title: "Beam brake", loom_group_name: null, loom_count: 3, stage_count: 1 },
  ],
  control_groups: [{ loom_group_id: 3, group_name: "EJM-C1" }],
  window_presets: [30, 60, 90, 180],
  default_window_days: 60,
};

const seg = (v: Partial<ImpactSegment>): ImpactSegment => ({
  seq: 1,
  label: "After-1 (Initial)",
  stage_seq: 1,
  kind: "INITIAL",
  date_from: "2026-09-05",
  date_to: "2026-09-25",
  days: 21,
  looms_n: 6,
  looms_total: 6,
  loom_days: 120,
  days_run: 118,
  producing_days: 20,
  eff_days: 18,
  hours_run: 1500,
  std_coverage_pct: 92,
  hours_coverage_pct: 88,
  efficiency_pct: 58.2,
  efficiency_at_baseline_std_pct: 58.2,
  delta_vs_baseline_pts: 2.1,
  delta_vs_baseline_pct: 3.7,
  delta_vs_previous_pts: null,
  delta_vs_previous_pct: null,
  net_vs_control_pct: 2.9,
  se: 0.8,
  verdict: "IMPROVED",
  is_control: false,
  ...v,
});

const REPORT: LoomModificationImpactReport = {
  chain: {
    root_modification_id: 5,
    title: "Shuttle guard",
    loom_group: { loom_group_id: 1, group_code: "EJM-1", group_name: "EJM line 1" },
    stages: [
      { modification_id: 5, seq: 1, mod_kind: "INITIAL", mod_kind_label: "Initial", mod_date: "2026-08-30", mod_to_date: null, settle_days: 3, title: "Shuttle guard", mod_category: "MECHANICAL", mod_category_label: "Mechanical", done_by: "INHOUSE", done_by_label: "In-house", loom_count: 6, root_loom_count: 6, control_description: "43 un-modified Hessian looms" },
    ],
  },
  windows: {
    window_days: 60,
    settle_days: 3,
    last_data_date: "2026-09-25",
    before: { date_from: "2026-07-01", date_to: "2026-08-29", days: 60, extended: false },
    excluded: [{ stage_seq: 1, date_from: "2026-08-30", date_to: "2026-09-04" }],
    after: [{ stage_seq: 1, date_from: "2026-09-05", date_to: "2026-09-25", days: 21, cut_reason: "last_data_date" }],
  },
  verdict: {
    verdict: "IMPROVED",
    stage_seq: 1,
    since_date: "2026-08-30",
    stage_label: "After-1",
    efficiency: { before: 56.1, after: 58.2, delta_pts: 2.1, delta_pct: 3.7, net_delta_pct: 2.9, se: 0.8, within_noise: false },
    efficiency_at_baseline_std: { before: 56.1, after: 57.9, delta_pts: 1.8, delta_pct: 3.2 },
    looms_improved: 5,
    looms_total: 6,
    eff_days_before: 300,
    eff_days_after: 100,
    coverage_before_pct: 91,
    coverage_after_pct: 88,
    reason: null,
    other_stage_note: null,
    comparison: {
      basis: "efficiency",
      stage_seq: 1,
      description: "43 un-modified Hessian looms in the 150 rpm band",
      study: { looms_n: 6, before: 56.1, after: 58.2, delta_pts: 2.1, delta_pct: 3.7 },
      control: { looms_n: 43, before: 55.5, after: 55.9, delta_pts: 0.4, delta_pct: 0.8 },
      net_delta_pts: 1.7,
      net_delta_pct: 2.9,
    },
  },
  segments: [
    seg({ seq: 0, label: "Before", stage_seq: null, kind: null, date_from: "2026-07-01", date_to: "2026-08-29", days: 60, efficiency_pct: 56.1, delta_vs_baseline_pts: null, delta_vs_baseline_pct: null, net_vs_control_pct: null, se: null, verdict: null }),
    seg({}),
    seg({ label: "After-1", is_control: true, looms_n: 43, looms_total: 43, efficiency_pct: 55.9, delta_vs_baseline_pts: 0.4, delta_vs_baseline_pct: 0.8, verdict: null }),
  ],
  per_loom: [
    { machine_id: 102, loom: "S294", line_no: 1, speed_band: "150±10%", since_date: "2026-08-30", producing_days_before: 50, producing_days_after: 18, eff_days_before: 50, eff_days_after: 16, eff_before: 58, eff_after: 55, delta_pts: -3, delta_pct: -5.2, eff_baseline_std_before: 58, eff_baseline_std_after: 54.5, std_speed_baseline: 150, std_speed_latest: 160, flags: ["W", "S"], in_stage: true, row_kind: "loom" },
    { machine_id: 101, loom: "S293", line_no: 1, speed_band: "150±10%", since_date: "2026-08-30", producing_days_before: 50, producing_days_after: 18, eff_days_before: 50, eff_days_after: 18, eff_before: 55, eff_after: 60, delta_pts: 5, delta_pct: 9.1, eff_baseline_std_before: 55, eff_baseline_std_after: 60, std_speed_baseline: 150, std_speed_latest: 150, flags: ["W"], in_stage: true, row_kind: "loom" },
    { machine_id: null, loom: null, line_no: null, speed_band: null, since_date: null, producing_days_before: 300, producing_days_after: 108, eff_days_before: 300, eff_days_after: 100, eff_before: 56.1, eff_after: 58.2, delta_pts: 2.1, delta_pct: 3.7, eff_baseline_std_before: 56.1, eff_baseline_std_after: 57.9, std_speed_baseline: null, std_speed_latest: null, flags: [], in_stage: true, row_kind: "study_total" },
  ],
  daywise: [
    { tran_date: "2026-08-29", phase: "BEFORE", study_looms_run: 6, study_eff: 56, study_rolling7: 56.1, control_eff: 55.8, control_rolling7: 55.9, gap: 0.2, markers: [] },
    { tran_date: "2026-08-30", phase: "EXCLUDED", study_looms_run: 4, study_eff: 40, study_rolling7: null, control_eff: 55.7, control_rolling7: 55.9, gap: null, markers: ["Event: Shuttle guard"] },
    { tran_date: "2026-09-05", phase: "AFTER-1", study_looms_run: 6, study_eff: 58.5, study_rolling7: 58.2, control_eff: 55.9, control_rolling7: 55.9, gap: 2.6, markers: ["STD SPEED 150 → 160 on 1 looms"] },
  ],
  mechanical: [
    { machine_id: 101, loom: "S293", side: "BEFORE", mech_stoppage_hours: 4.5, breakdown_count: 1, breakdown_minutes: 30, row_kind: "loom" },
    { machine_id: 101, loom: "S293", side: "AFTER", mech_stoppage_hours: 1.25, breakdown_count: 0, breakdown_minutes: 0, row_kind: "loom" },
    { machine_id: null, loom: null, side: "BEFORE", mech_stoppage_hours: 4.5, breakdown_count: 1, breakdown_minutes: 30, row_kind: "total" },
    { machine_id: null, loom: null, side: "AFTER", mech_stoppage_hours: 1.25, breakdown_count: 0, breakdown_minutes: 0, row_kind: "total" },
  ],
  evidence: [{ label: "n1 / n2 eff days", value: "300 / 100" }],
  meta: {
    source: "Recomputed live from jute_prod_weaving_daily; may differ from the locked DPR.",
    thresholds: { VERDICT_THRESHOLD_PCT: 3, SE_MULTIPLIER: 2, n1: 300, n2: 100, s_p: 3.1, se: 0.8 },
    notes: ["Efficiency: std coverage 92 %, hours coverage 88 %.", "Weaver changed on 1 loom."],
    server_ms: 412,
    control: { mode: "speed_band", looms_n: 43, description: "43 un-modified Hessian looms in the 150 rpm band" },
    flags_legend: null,
  },
};

/** Opens a searchable dropdown the way a click on the field does. */
function openPicker(name: RegExp): HTMLElement {
  const input = screen.getByRole("combobox", { name });
  fireEvent.mouseDown(input);
  fireEvent.focus(input);
  return input;
}

describe("Loom Modification Impact page", () => {
  beforeEach(() => {
    hookState.value = {
      branches: BRANCHES,
      coId: 9,
      companyName: "DEV3",
      initialBranchId: 12,
      dateParam: null,
    };
    hookState.search = "";
    vi.mocked(fetchLoomModificationImpactOptions).mockReset();
    vi.mocked(fetchLoomModificationImpactOptions).mockResolvedValue(OPTIONS);
    vi.mocked(fetchLoomModificationImpact).mockReset();
    vi.mocked(fetchLoomModificationImpact).mockResolvedValue(REPORT);
  });

  it("loads the options for the seeded branch and waits for a chain before running", async () => {
    render(<Page />);
    expect(screen.getByText("Loom Modification Impact")).toBeInTheDocument();
    await waitFor(() => expect(fetchLoomModificationImpactOptions).toHaveBeenCalledTimes(1));
    expect(fetchLoomModificationImpactOptions).toHaveBeenCalledWith({ coId: 9, branchId: 12 });
    expect(fetchLoomModificationImpact).not.toHaveBeenCalled();
    expect(screen.getByText(/Pick a modification chain and press Submit/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
    // Branch picker shown because two branches are in scope.
    expect(screen.getByLabelText("Branch")).toBeInTheDocument();
  });

  it("runs automatically for ?modification_id= and shows the verdict strip and ladder", async () => {
    hookState.search = "modification_id=5";
    render(<Page />);
    await waitFor(() => expect(fetchLoomModificationImpact).toHaveBeenCalledTimes(1));
    expect(fetchLoomModificationImpact).toHaveBeenCalledWith(
      expect.objectContaining({
        coId: 9,
        branchId: 12,
        modificationId: 5,
        windowDays: 60,
        settleDays: "",
        control: "speed_band",
        controlGroupId: "",
      }),
    );
    const call = vi.mocked(fetchLoomModificationImpact).mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(call).not.toHaveProperty("metric");
    expect(call).not.toHaveProperty("sameQualityOnly");
    expect(call).not.toHaveProperty("weavingQualityId");
    const strip = await screen.findByTestId("verdict-strip");
    expect(within(strip).getByTestId("verdict-chip")).toHaveTextContent("IMPROVED");
    expect(strip).toHaveTextContent("since 30-Aug-26 · Initial: Shuttle guard (stage 1 of 1, 6 of 6 looms)");
    const tiles = within(strip).getByTestId("efficiency-tiles");
    expect(tiles).toHaveTextContent("Efficiency — Before56.10 %");
    expect(tiles).toHaveTextContent("Efficiency — After (After-1)58.20 %");
    expect(tiles).toHaveTextContent("+2.10 pts (+3.7%)");
    expect(tiles).toHaveTextContent("SE 0.80");
    expect(tiles).toHaveTextContent("+2.9%");
    // The baseline-standard pair is shown because the server sent it.
    const base = within(strip).getByTestId("baseline-std-tiles");
    expect(base).toHaveTextContent("Eff at baseline std — Before56.10 %");
    expect(base).toHaveTextContent("57.90 %");
    expect(base).toHaveTextContent("+1.80 pts (+3.2%)");
    expect(strip).toHaveTextContent("5 of 6 looms improved");
    // Nothing of the old headline / output / cost tiles survives.
    expect(strip).not.toHaveTextContent(/kg|yds|cost|Headline/i);
    expect(screen.queryByText(/within day-to-day variation/)).toBeNull();

    // Coverage (with eff days) sits in the meta strip, not the verdict strip.
    expect(screen.getByTestId("coverage-line")).toHaveTextContent(
      "Coverage: before 91 % (300 eff days) · after 88 % (100 eff days)",
    );
    expect(screen.getByTestId("meta-strip")).toHaveTextContent("43 un-modified Hessian looms in the 150 rpm band");

    // Chain header and window line.
    const head = screen.getByTestId("chain-header");
    expect(head).toHaveTextContent("1. Initial 30-Aug-26 · Shuttle guard · 6 of 6 looms · Mechanical · In-house");
    expect(head).not.toHaveTextContent(/cost/);
    expect(screen.getByTestId("window-line")).toHaveTextContent(
      "Before 01-Jul-26..29-Aug-26 (60 d) | Excluded-1 30-Aug-26..04-Sep-26 | After-1 05-Sep-26..25-Sep-26 (21 d, cut by last data date)",
    );

    // Ladder: Before, After-1 and the shaded control row.
    const ladder = screen.getByTestId("stage-ladder");
    const rows = within(ladder).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Before");
    expect(rows[1]).toHaveTextContent("After-1 (Initial)");
    expect(rows[1]).toHaveTextContent("58.20");
    expect(rows[1]).toHaveTextContent("+2.10 pts (+3.7%)");
    expect(rows[1]).toHaveTextContent("IMPROVED");
    expect(rows[2]).toHaveTextContent("Control · After-1");
    expect(rows[2]).toHaveClass("lmi-row-control");
    // Efficiency columns only — no kg / yds / cuts / picks cells.
    expect(ladder).not.toHaveTextContent(/50000|20000|8000|210\.5/);
    expect(within(ladder).getAllByRole("cell")).toHaveLength(3 * 16);

    // Notes are always visible.
    expect(screen.getAllByTestId("notes-alert")[0]).toHaveTextContent("Weaver changed on 1 loom.");
  });

  it("shows this loom set vs the un-modified looms under the verdict strip, or why there is no set", async () => {
    hookState.search = "modification_id=5";
    const { unmount } = render(<Page />);
    const strip = await screen.findByTestId("verdict-strip");
    const block = screen.getByTestId("comparison-block");
    // Directly under the verdict strip, before the ladder.
    expect(strip.nextElementSibling).toBe(block);
    expect(block.nextElementSibling).toBe(screen.getByTestId("stage-ladder"));
    expect(block).toHaveTextContent("This loom set vs looms not modified");
    const rows = within(block).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("LoomsEfficiency beforeEfficiency afterChange");
    expect(within(block).getByTestId("comparison-row-study")).toHaveTextContent(
      "This loom set (modified)656.10 %58.20 %+2.10 pts (+3.7%)",
    );
    expect(within(block).getByTestId("comparison-row-control")).toHaveTextContent(
      "Other looms (not modified)4355.50 %55.90 %+0.40 pts (+0.8%)",
    );
    expect(within(block).getByTestId("comparison-row-net")).toHaveTextContent("Difference (net effect)+1.70 pts (+2.9%)");
    expect(within(block).getByTestId("comparison-description")).toHaveTextContent(
      "43 un-modified Hessian looms in the 150 rpm band",
    );
    expect(within(block).queryByTestId("comparison-none")).toBeNull();
    expect(within(block).queryByTestId("comparison-basis")).toBeNull();
    unmount();

    // No eligible control: one line with the server's reason, the baseline-std note when that is the basis.
    vi.mocked(fetchLoomModificationImpact).mockResolvedValue({
      ...REPORT,
      verdict: {
        ...REPORT.verdict,
        comparison: { ...REPORT.verdict.comparison!, basis: "efficiency_at_baseline_std", control: null, net_delta_pts: null, net_delta_pct: null },
      },
      meta: {
        ...REPORT.meta,
        notes: ["No eligible controls (no other active looms in the study looms' departments)."],
        control: { mode: "speed_band", looms_n: 0, description: "0 un-modified looms" },
      },
    });
    render(<Page />);
    const block2 = await screen.findByTestId("comparison-block");
    expect(within(block2).getAllByRole("row")).toHaveLength(2);
    expect(within(block2).queryByTestId("comparison-row-control")).toBeNull();
    expect(within(block2).queryByTestId("comparison-row-net")).toBeNull();
    expect(within(block2).getByTestId("comparison-none")).toHaveTextContent(
      "No comparison set: No eligible controls (no other active looms in the study looms' departments)",
    );
    expect(within(block2).getByTestId("comparison-basis")).toHaveTextContent(/at the baseline standard speed/);
  });

  it("runs on Submit with the picked chain and the 30-day preset", async () => {
    render(<Page />);
    await waitFor(() => expect(fetchLoomModificationImpactOptions).toHaveBeenCalledTimes(1));
    openPicker(/modification/i);
    fireEvent.click(await screen.findByText(/Beam brake/));
    fireEvent.click(screen.getByRole("button", { name: "30 d" }));
    const submit = screen.getByRole("button", { name: /submit/i });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    await waitFor(() => expect(fetchLoomModificationImpact).toHaveBeenCalledTimes(1));
    expect(fetchLoomModificationImpact).toHaveBeenLastCalledWith(
      expect.objectContaining({ modificationId: 9, windowDays: 30 }),
    );
    await screen.findByTestId("verdict-strip");
  });

  it("shows the control group picker only in control_group mode and no metric / quality filters", async () => {
    render(<Page />);
    await waitFor(() => expect(fetchLoomModificationImpactOptions).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("Control group")).toBeNull();
    expect(screen.queryByLabelText(/headline metric/i)).toBeNull();
    expect(screen.queryByLabelText(/^quality$/i)).toBeNull();
    expect(screen.queryByLabelText(/same quality only/i)).toBeNull();
    expect(screen.getByLabelText("Settling days")).toBeInTheDocument();
    openPicker(/^control$/i);
    fireEvent.click(await screen.findByText("A CONTROL group"));
    expect(screen.getByLabelText("Control group")).toBeInTheDocument();
  });

  it("surfaces the backend's 400 message", async () => {
    hookState.search = "modification_id=5";
    vi.mocked(fetchLoomModificationImpact).mockRejectedValue(new Error("window_days must be 180 or less"));
    render(<Page />);
    const alert = await screen.findByTestId("report-error");
    expect(alert).toHaveTextContent("window_days must be 180 or less");
    expect(screen.queryByTestId("verdict-strip")).toBeNull();
  });

  it("greys excluded day-wise rows and lists per-loom flags worst first", async () => {
    hookState.search = "modification_id=5";
    render(<Page />);
    await screen.findByTestId("verdict-strip");
    // Per loom tab is the default: flags and totals.
    const perLoomRows = screen.getAllByRole("row").filter((r) => /S29\d|STUDY TOTAL/.test(r.textContent ?? ""));
    expect(perLoomRows).toHaveLength(3);
    // Server order is kept: the worst loom comes first.
    expect(perLoomRows[0]).toHaveTextContent("S294");
    expect(perLoomRows[0]).toHaveTextContent("-3.00");
    expect(perLoomRows[0]).toHaveTextContent("-5.2%");
    expect(perLoomRows[0]).toHaveTextContent("S W");
    expect(perLoomRows[0]).toHaveClass("report-perf-low");
    expect(perLoomRows[0]).not.toHaveTextContent(/Hessian|Sacking/);
    expect(perLoomRows[2]).toHaveTextContent("STUDY TOTAL");
    expect(perLoomRows[2]).toHaveClass("report-total-row");

    fireEvent.click(screen.getByRole("tab", { name: "Day-wise" }));
    const excluded = await screen.findByText("2026-08-30");
    expect(excluded.closest("tr")).toHaveClass("lmi-row-excluded");
    expect(excluded.closest("tr")).toHaveTextContent("Event: Shuttle guard");
    expect(screen.getByText("2026-09-05").closest("tr")).not.toHaveClass("lmi-row-excluded");
    expect(screen.getByText("2026-09-05").closest("tr")).toHaveTextContent("STD SPEED 150 → 160 on 1 looms");
    expect(screen.getByText("2026-09-05").closest("tr")).toHaveTextContent("58.50");
  });

  it("has a Breakdown & mechanical tab with a total row and no quality mix / downtime tab", async () => {
    hookState.search = "modification_id=5";
    render(<Page />);
    await screen.findByTestId("verdict-strip");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Per loom",
      "Day-wise",
      "Breakdown & mechanical",
      "Notes",
    ]);
    fireEvent.click(screen.getByRole("tab", { name: "Breakdown & mechanical" }));
    const rows = (await screen.findAllByRole("row")).filter((r) => /S293|TOTAL/.test(r.textContent ?? ""));
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("S293");
    expect(rows[0]).toHaveTextContent("BEFORE");
    expect(rows[0]).toHaveTextContent("4.50");
    expect(rows[0]).toHaveTextContent("30");
    expect(rows[2]).toHaveTextContent("TOTAL");
    expect(rows[2]).toHaveClass("report-total-row");
    expect(rows[0]).not.toHaveTextContent(/Power|Yarn|waste|hands/i);
  });

  it("shows NOT ENOUGH DATA with the server's reason and no baseline pair when it is absent", async () => {
    hookState.search = "modification_id=5";
    vi.mocked(fetchLoomModificationImpact).mockResolvedValue({
      ...REPORT,
      verdict: {
        ...REPORT.verdict,
        verdict: "NOT_ENOUGH_DATA",
        efficiency: { before: 56.1, after: null, delta_pts: null, delta_pct: null, net_delta_pct: null, se: null, within_noise: false },
        efficiency_at_baseline_std: null,
        looms_improved: null,
        looms_total: null,
        reason: "No weaver marks in the after window: efficiency not measurable.",
      },
    });
    render(<Page />);
    const strip = await screen.findByTestId("verdict-strip");
    expect(within(strip).getByTestId("verdict-chip")).toHaveTextContent("NOT ENOUGH DATA");
    expect(strip).toHaveTextContent("No weaver marks in the after window");
    expect(within(strip).queryByTestId("baseline-std-tiles")).toBeNull();
    expect(strip).toHaveTextContent("no control");
    expect(strip).not.toHaveTextContent(/looms improved/);
  });

  it("lists the saved chains under React Strict Mode (double-mounted effects)", async () => {
    // The Next dev server runs Strict Mode: effects mount, unmount and mount again.
    // A "fetched for this key" ref guard once made the second run bail while the
    // first fetch was already cancelled, leaving the picker empty (sls, 2026-09-29).
    render(
      <StrictMode>
        <Page />
      </StrictMode>,
    );
    await waitFor(() => expect(fetchLoomModificationImpactOptions).toHaveBeenCalled());
    openPicker(/modification/i);
    expect(await screen.findByText(/Beam brake/)).toBeInTheDocument();
  });

  it("does not load options for a hub branch outside the company's scope", async () => {
    hookState.value = { ...hookState.value, initialBranchId: 99 };
    render(<Page />);
    await waitFor(() => expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled());
    expect(fetchLoomModificationImpactOptions).not.toHaveBeenCalled();
  });
});
