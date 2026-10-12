/**
 * @vitest-environment jsdom
 *
 * Long Absenteeism page: the Due-today bands (candidates + case bands, letters
 * sub-grouped, the leave-module ON_LEAVE band; no verification step any more),
 * access gating (view only hides actions and the edit tabs), the FE-2 tab mount
 * points, the case view (actions per stage, the Leave panel read from the leave
 * module with "Exit as on leave", struck-off approval bar fed by the
 * permissions endpoint) and the letter preview with Force (the text is
 * read-only: the server renders the template at issue).
 * The service is mocked; DataGrid is replaced by a plain list (it renders no
 * rows in jsdom).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";

const BRANCHES = [{ branch_id: 12, branch_name: "FACTORY" }];

const state = vi.hoisted(() => ({
  search: "",
  access: { create: true, edit: true } as Record<string, boolean>,
  push: vi.fn(),
  replace: vi.fn(),
  mobile: false,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.search),
  usePathname: () => "/dashboardportal/hrms/longAbsenteeism",
  useRouter: () => ({ push: state.push, replace: state.replace, back: vi.fn() }),
}));

vi.mock("@/components/reports/useReportBranches", () => ({
  useReportBranches: () => ({
    branches: BRANCHES,
    coId: 9,
    companyName: "DEV3",
    initialBranchId: 12,
    dateParam: null,
  }),
}));

vi.mock("@/components/dashboard/sidebarContext", () => ({
  useSidebarContext: () => ({
    hasMenuAccess: (_path: string, action = "view") => (action === "view" ? true : Boolean(state.access[action])),
  }),
}));

vi.mock("@/components/AttachmentUploader", () => ({
  default: ({ label }: { label?: string }) => <div data-testid="uploader">{label}</div>,
}));

vi.mock("@/hooks/useCompanyHeader", () => ({
  default: () => ({ coName: "EMPIRE JUTE", address: "Mill Road", gstNo: "", cinNo: "", loading: false }),
  useCompanyHeader: () => ({ coName: "EMPIRE JUTE", address: "Mill Road", gstNo: "", cinNo: "", loading: false }),
}));

vi.mock("@/app/dashboardportal/procurement/_shared/PrintHeader", () => ({
  CompanyHeaderBlock: () => <div>EMPIRE JUTE letterhead</div>,
  default: () => <div>EMPIRE JUTE letterhead</div>,
}));

vi.mock("./_print", () => ({ printLetters: vi.fn(() => true) }));

// Phone layout (cards instead of the grid) on demand.
vi.mock("./_hooks/useIsMobile", () => ({ useIsMobile: () => state.mobile }));

vi.mock("./_components/WatchlistGrid", () => ({
  default: ({ rows, onOpen }: { rows: { case_id: number; emp_name: string }[]; onOpen: (r: unknown) => void }) => (
    <ul data-testid="grid">
      {rows.map((r) => (
        <li key={r.case_id}>
          {r.emp_name} <button onClick={() => onOpen(r)}>open {r.case_id}</button>
        </li>
      ))}
    </ul>
  ),
}));

vi.mock("@/utils/longAbsenteeismService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/longAbsenteeismService")>();
  return {
    ...actual,
    fetchLaSetup: vi.fn(),
    fetchLaList: vi.fn(),
    fetchLaCandidates: vi.fn(),
    fetchLaCase: vi.fn(),
    fetchLaStruckOffPermissions: vi.fn(),
    exitLaCase: vi.fn(),
    previewLaLetter: vi.fn(),
    issueLaLetter: vi.fn(),
    fetchLaDispatch: vi.fn(),
    recordLaLetter: vi.fn(),
    downloadLaLettersPdf: vi.fn(),
  };
});

import {
  downloadLaLettersPdf,
  exitLaCase,
  fetchLaCandidates,
  fetchLaCase,
  fetchLaDispatch,
  fetchLaList,
  fetchLaSetup,
  fetchLaStruckOffPermissions,
  issueLaLetter,
  previewLaLetter,
  recordLaLetter,
  type LaCase,
  type LaLetter,
  type LaListRow,
  type LaSetup,
} from "@/utils/longAbsenteeismService";
import Page from "./page";

const RULE: LaSetup["rule"] = {
  detect_days: 10,
  lookback_days: 90,
  wait_w2_days: 10,
  wait_w3_days: 10,
  wait_sc_days: 15,
  sc_reply_days: 3,
  notice_reply_days: 7,
  dismiss_snooze_days: 30,
  exclude_prefixes: "T,C,R,L",
  clause_text: null,
  signatory: null,
  extra_1_label: null,
  extra_2_label: null,
  extra_3_label: null,
  extra_4_label: null,
  extra_5_label: null,
};

const STAGES = [
  ["DETECTED", "Detected"],
  ["VERIFIED", "Verified"],
  ["WARNING_1", "1st warning"],
  ["WARNING_2", "2nd warning"],
  ["WARNING_3", "3rd & last warning"],
  ["SHOW_CAUSE", "Show cause"],
  ["GATE_NOTICE", "Gate notice"],
  ["STRUCK_OFF", "Struck off"],
].map(([code, label], order) => ({ code, label, order }));

const SETUP: LaSetup = {
  stages: STAGES,
  letter_stages: ["WARNING_1", "WARNING_2", "WARNING_3", "SHOW_CAUSE", "GATE_NOTICE", "STRUCK_OFF"],
  template_codes: [],
  statuses: [],
  exit_reasons: [{ code: "REJOINED", label: "Rejoined" }],
  all_exit_reasons: [],
  esi_stl_results: [{ code: "NONE", label: "Not on ESI / STL" }],
  leave_types: [{ leave_type_id: 24, leave_type_code: "L", leave_type_description: "STL LEAVE", payable: "Y" }],
  leave_options: [{ code: "LEAVE", leave_type_id: 24, label: "STL LEAVE (L)", legacy_code: "STL", source: "master" }],
  exit_options: [
    { code: "REJOINED", leave_type_id: null, label: "Rejoined", legacy_code: null, source: "builtin" },
    { code: "LEAVE", leave_type_id: 24, label: "On leave: STL LEAVE (L)", legacy_code: "STL", source: "master" },
    { code: "RESIGNED", leave_type_id: null, label: "Resigned", legacy_code: null, source: "builtin" },
  ],
  event_types: [],
  user_event_types: ["REMARK", "FEEDBACK", "REPLY"],
  reply_channels: [],
  dispatch_modes: [{ code: "REG_POST_AD", label: "Registered post with AD" }],
  delivery_statuses: [],
  placeholders: [],
  depts: [{ dept_id: 4, dept_desc: "WEAVING" }],
  rule: RULE,
  today: "2026-10-11",
  access_level: 4,
};

const baseCase = (v: Partial<LaCase>): LaCase =>
  ({
    case_id: 41,
    co_id: 9,
    branch_id: 12,
    eb_id: 7001,
    case_no: "LA/12/26/0001",
    emp_code: "1234",
    emp_name: "RAM KUMAR",
    last_working_date: "2026-09-20",
    detected_date: "2026-10-01",
    stage_code: "WARNING_1",
    stage_label: "1st warning",
    stage_order: 2,
    stage_date: "2026-10-01",
    next_due_date: "2026-10-11",
    status: 1,
    status_label: "Open",
    habitual: 0,
    timekeeper_confirmed: 1,
    verified_date: "2026-10-01",
    esi_stl_result: null,
    esi_stl_result_label: null,
    leave_type_id: null,
    leave_type_name: null,
    leave_from: null,
    leave_to: null,
    leave_transaction_id: null,
    leave_parked: 0,
    pending_leave_since: null,
    on_leave_now: false,
    on_leave_label: null,
    status_id: null,
    approval_level: null,
    absent_days: 21,
    exit_reason: null,
    exit_reason_label: null,
    rejoined_seen_date: null,
    ...v,
  }) as LaCase;

/** An approved leave of the leave module (Leave Request page) that covers the server date. */
const MODULE_LEAVE: Partial<LaCase> = {
  leave_transaction_id: 5001,
  leave_type_id: 24,
  leave_type_name: "STL LEAVE (L)",
  leave_from: "2026-10-08",
  leave_to: "2026-10-24",
  on_leave_now: true,
};

/** The same leave, already over on the server date. */
const ENDED_LEAVE: Partial<LaCase> = { ...MODULE_LEAVE, leave_from: "2026-09-28", leave_to: "2026-10-05", on_leave_now: false };

/** The section tabs (the watchlist view chips are a separate tablist). */
const sectionTabs = () =>
  within(screen.getByRole("tablist", { name: "Long absenteeism sections" }))
    .getAllByRole("tab")
    .map((t) => t.textContent);

const listRow = (v: Partial<LaListRow>): LaListRow =>
  ({ ...baseCase({}), due_band: "NONE", next_stage_code: null, next_stage_label: null, ...v }) as LaListRow;

beforeEach(() => {
  vi.clearAllMocks();
  state.search = "";
  state.access = { create: true, edit: true };
  state.mobile = false;
  vi.mocked(fetchLaSetup).mockResolvedValue(SETUP);
  vi.mocked(fetchLaList).mockResolvedValue([
    listRow({ case_id: 1, emp_name: "FIRST DUE", due_band: "LETTER_DUE", next_stage_code: "WARNING_1", next_stage_label: "1st warning" }),
    listRow({ case_id: 2, emp_name: "SECOND DUE", due_band: "LETTER_DUE", next_stage_code: "WARNING_2", next_stage_label: "2nd warning" }),
    listRow({ case_id: 3, emp_name: "AT APPROVAL", due_band: "APPROVAL", status_id: 20 }),
  ]);
  vi.mocked(fetchLaCandidates).mockResolvedValue([
    {
      eb_id: 99,
      emp_code: "5555",
      emp_name: "NEW ABSENTEE",
      dept_id: 4,
      dept_desc: "WEAVING",
      sub_dept_desc: null,
      designation: "WEAVER",
      category: null,
      last_seen: "2026-09-25",
      absent_days: 16,
      closed_cases: 2,
      pending_leave_since: null,
      leave_transaction_id: null,
      leave_type_id: null,
      leave_type_name: null,
      leave_from: null,
      leave_to: null,
    },
  ]);
});

describe("watchlist", () => {
  it("renders the Due-today bands in order with the letters sub-grouped", async () => {
    render(<Page />);
    expect(await screen.findByText("New candidates")).toBeInTheDocument();
    expect(screen.getByText("Letters due")).toBeInTheDocument();
    expect(screen.getByText("Awaiting approval")).toBeInTheDocument();
    expect(screen.queryByText("Marked present")).not.toBeInTheDocument();
    expect(screen.queryByText("On leave (leave module)")).not.toBeInTheDocument();
    // There is no verification step: no band for it, no Verify action.
    expect(screen.queryByText("Verification pending")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /verify/i })).not.toBeInTheDocument();
    expect(await screen.findByText("FIRST DUE")).toBeInTheDocument();
    expect(screen.getByText("SECOND DUE")).toBeInTheDocument();
    // The letters are sub-grouped by the next letter, in ladder order.
    const bodyText = document.body.textContent ?? "";
    expect(bodyText.indexOf("1st warning")).toBeGreaterThan(-1);
    expect(bodyText.indexOf("1st warning")).toBeLessThan(bodyText.indexOf("2nd warning"));
    expect(screen.getByText("1st warning")).toBeInTheDocument();
    expect(screen.getByText("2nd warning")).toBeInTheDocument();
    // Branch shown as text with a single branch; list loaded for it.
    expect(screen.getByText("FACTORY")).toBeInTheDocument();
    expect(vi.mocked(fetchLaList)).toHaveBeenCalledWith(expect.objectContaining({ coId: 9, branchId: 12, view: "due" }));
    // Edit user: the batch button, the export mount point, all five tabs.
    expect(screen.getByRole("button", { name: /Issue due letters/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export/ })).toBeInTheDocument();
    expect(sectionTabs()).toEqual(["Watchlist", "Dispatch", "Reports", "Templates", "Settings"]);
    expect(
      within(screen.getByRole("tablist", { name: "Watchlist view" }))
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["Due today", "Open", "Parked", "Closed", "Candidates"]);
  });

  it("shows the struck-off-due band between letters due and approval", async () => {
    vi.mocked(fetchLaList).mockResolvedValue([
      listRow({ case_id: 2, emp_name: "SECOND DUE", due_band: "LETTER_DUE", next_stage_code: "WARNING_2", next_stage_label: "2nd warning" }),
      listRow({ case_id: 3, emp_name: "AT APPROVAL", due_band: "APPROVAL", status_id: 20 }),
      listRow({
        case_id: 4,
        emp_name: "WINDOW OVER",
        due_band: "STRUCK_OFF_DUE",
        stage_code: "GATE_NOTICE",
        next_stage_code: "STRUCK_OFF",
        next_stage_label: "Struck off",
      }),
    ]);
    render(<Page />);
    expect(await screen.findByText("WINDOW OVER")).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    const at = (s: string) => text.indexOf(s);
    expect(at("Struck off due")).toBeGreaterThan(-1);
    expect(at("Letters due")).toBeLessThan(at("Struck off due"));
    expect(at("Struck off due")).toBeLessThan(at("Awaiting approval"));
    expect(at("Struck off due")).toBeLessThan(at("WINDOW OVER"));
    expect(at("WINDOW OVER")).toBeLessThan(at("Awaiting approval"));
  });

  it("shows the department summary under the filters; a chip narrows the rows on the client and the strip keeps every department", async () => {
    vi.mocked(fetchLaList).mockResolvedValue([
      listRow({ case_id: 1, emp_name: "ON LEAVE ME", due_band: "ON_LEAVE", status: 2, dept_id: 4, dept_desc: "WEAVING" }),
      listRow({ case_id: 2, emp_name: "SECOND DUE", due_band: "LETTER_DUE", dept_id: 7, dept_desc: "SPINNING" }),
      listRow({ case_id: 3, emp_name: "AT APPROVAL", due_band: "APPROVAL", status_id: 20, dept_id: 4, dept_desc: "WEAVING" }),
      // Not in any Due-today band: not counted.
      listRow({ case_id: 5, emp_name: "NO BAND", due_band: "NONE", dept_id: 7, dept_desc: "SPINNING" }),
    ]);
    render(<Page />);
    await screen.findByText("ON LEAVE ME");
    const strip = () => screen.getByRole("group", { name: "Summary by department" });
    // Due today = the banded rows (3, the ON_LEAVE one included) + the "New candidates" band (1 WEAVING candidate).
    expect(within(strip()).getByText("By department · Due today · 4")).toBeInTheDocument();
    expect(within(strip()).getByRole("button", { name: "All 4" })).toHaveAttribute("aria-pressed", "true");
    expect(within(strip()).getByRole("button", { name: "WEAVING 3" })).toBeInTheDocument();
    expect(within(strip()).getByRole("button", { name: "SPINNING 1" })).toBeInTheDocument();
    // The list and the candidates are loaded for every department.
    expect(vi.mocked(fetchLaList)).toHaveBeenLastCalledWith(expect.objectContaining({ view: "due", deptId: null }));
    expect(vi.mocked(fetchLaCandidates)).toHaveBeenLastCalledWith(expect.objectContaining({ deptId: null }));
    const listCalls = vi.mocked(fetchLaList).mock.calls.length;
    const candidateCalls = vi.mocked(fetchLaCandidates).mock.calls.length;

    // SPINNING narrows the bands (and hides the WEAVING candidate) without a reload ...
    fireEvent.click(within(strip()).getByRole("button", { name: "SPINNING 1" }));
    await waitFor(() => expect(screen.queryByText("ON LEAVE ME")).not.toBeInTheDocument());
    expect(screen.getByText("SECOND DUE")).toBeInTheDocument();
    expect(screen.queryByText("AT APPROVAL")).not.toBeInTheDocument();
    expect(screen.queryByText("New candidates")).not.toBeInTheDocument();
    // ... and the strip still counts every department, with SPINNING highlighted.
    expect(within(strip()).getByText("By department · Due today · 4")).toBeInTheDocument();
    expect(within(strip()).getByRole("button", { name: "SPINNING 1" })).toHaveAttribute("aria-pressed", "true");
    expect(within(strip()).getByRole("button", { name: "WEAVING 3" })).toHaveAttribute("aria-pressed", "false");
    expect(within(strip()).getByRole("button", { name: "All 4" })).toHaveAttribute("aria-pressed", "false");
    expect(vi.mocked(fetchLaList)).toHaveBeenCalledTimes(listCalls);
    expect(vi.mocked(fetchLaCandidates)).toHaveBeenCalledTimes(candidateCalls);

    // Another chip switches the filter; the Department select follows it.
    fireEvent.click(within(strip()).getByRole("button", { name: "WEAVING 3" }));
    await screen.findByText("ON LEAVE ME");
    expect(screen.getByText("AT APPROVAL")).toBeInTheDocument();
    expect(screen.queryByText("SECOND DUE")).not.toBeInTheDocument();
    expect(screen.getByText("New candidates")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Department" })).toHaveValue("WEAVING");

    // The selected chip again clears the filter.
    fireEvent.click(within(strip()).getByRole("button", { name: "WEAVING 3" }));
    await screen.findByText("SECOND DUE");
    expect(screen.getByText("ON LEAVE ME")).toBeInTheDocument();
    expect(within(strip()).getByRole("button", { name: "All 4" })).toHaveAttribute("aria-pressed", "true");
    expect(vi.mocked(fetchLaList)).toHaveBeenCalledTimes(listCalls);
  });

  it("the No department chip narrows to the rows without a department", async () => {
    vi.mocked(fetchLaList).mockResolvedValue([
      listRow({ case_id: 1, emp_name: "HAS DEPT", due_band: "LETTER_DUE", next_stage_code: "WARNING_1", next_stage_label: "1st warning", dept_id: 4, dept_desc: "WEAVING" }),
      listRow({ case_id: 2, emp_name: "ORPHAN", due_band: "LETTER_DUE", next_stage_code: "WARNING_1", next_stage_label: "1st warning", dept_id: null, dept_desc: null }),
    ]);
    render(<Page />);
    await screen.findByText("HAS DEPT");
    const strip = () => screen.getByRole("group", { name: "Summary by department" });
    fireEvent.click(within(strip()).getByRole("button", { name: "No department 1" }));
    await waitFor(() => expect(screen.queryByText("HAS DEPT")).not.toBeInTheDocument());
    expect(screen.getByText("ORPHAN")).toBeInTheDocument();
    expect(within(strip()).getByRole("button", { name: "No department 1" })).toHaveAttribute("aria-pressed", "true");
    expect(within(strip()).getByRole("button", { name: "WEAVING 2" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Department" })).toHaveValue("No department");
    // The sentinel is a local filter value, never sent to the server.
    for (const [args] of vi.mocked(fetchLaList).mock.calls) expect(args.deptId ?? null).toBeNull();
    for (const [args] of vi.mocked(fetchLaCandidates).mock.calls) expect(args.deptId ?? null).toBeNull();
  });

  it("counts the list rows on the Open view (no candidates) and hides the strip when empty", async () => {
    state.search = "view=open";
    vi.mocked(fetchLaList).mockResolvedValue([
      listRow({ case_id: 1, emp_name: "ONE", dept_id: 4, dept_desc: "WEAVING" }),
      listRow({ case_id: 2, emp_name: "TWO", dept_id: 4, dept_desc: "WEAVING" }),
    ]);
    const { unmount } = render(<Page />);
    const strip = await screen.findByRole("group", { name: "Summary by department" });
    expect(within(strip).getByText("By department · Open · 2")).toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: "WEAVING 2" })).toBeInTheDocument();
    unmount();

    vi.mocked(fetchLaList).mockResolvedValue([]);
    render(<Page />);
    await screen.findByTestId("grid");
    await waitFor(() => expect(vi.mocked(fetchLaList)).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("group", { name: "Summary by department" })).not.toBeInTheDocument();
  });

  it("counts the candidate rows on the Candidates view", async () => {
    state.search = "view=candidates";
    render(<Page />);
    const strip = await screen.findByRole("group", { name: "Summary by department" });
    expect(within(strip).getByText("By department · Candidates · 1")).toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: "WEAVING 1" })).toBeInTheDocument();
  });

  it("shows an ON_LEAVE row under the 'On leave (leave module)' band, after Marked present and before Replies to review", async () => {
    vi.mocked(fetchLaList).mockResolvedValue([
      listRow({ case_id: 6, emp_name: "REPLY ONE", due_band: "REPLY_REVIEW", status: 2 }),
      listRow({
        case_id: 5,
        emp_name: "ON LEAVE ME",
        due_band: "ON_LEAVE",
        status: 2,
        leave_parked: 1,
        ...MODULE_LEAVE,
      }),
      listRow({ case_id: 4, emp_name: "BACK AT WORK", due_band: "MARKED_PRESENT", rejoined_seen_date: "2026-10-10" }),
    ]);
    render(<Page />);
    expect(await screen.findByText("ON LEAVE ME")).toBeInTheDocument();
    const header = screen.getByText("On leave (leave module)");
    expect(header).toBeInTheDocument();
    expect(screen.getByText(/Approved leave covers today/)).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    const at = (t: string) => text.indexOf(t);
    expect(at("Marked present")).toBeGreaterThan(-1);
    expect(at("Marked present")).toBeLessThan(at("On leave (leave module)"));
    expect(at("On leave (leave module)")).toBeLessThan(at("ON LEAVE ME"));
    expect(at("ON LEAVE ME")).toBeLessThan(at("Replies to review"));
    // The row sits in the band's own list, not in a neighbour's.
    const bands = screen.getAllByTestId("grid");
    const holder = bands.find((g) => within(g).queryByText(/ON LEAVE ME/));
    expect(holder).toBeDefined();
    expect(within(holder as HTMLElement).queryByText(/BACK AT WORK|REPLY ONE/)).not.toBeInTheDocument();
    expect(screen.queryByText("Verification pending")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /verify/i })).not.toBeInTheDocument();
    // An ON_LEAVE case is not "nothing due".
    expect(screen.queryByText("Nothing is due today in this branch.")).not.toBeInTheDocument();
  });

  it("hides the ON_LEAVE band when no case is on leave, and an older server's VERIFY rows are not shown", async () => {
    vi.mocked(fetchLaList).mockResolvedValue([
      listRow({ case_id: 1, emp_name: "OLD VERIFY ROW", due_band: "VERIFY", stage_code: "DETECTED" }),
      listRow({ case_id: 2, emp_name: "SECOND DUE", due_band: "LETTER_DUE", next_stage_code: "WARNING_2", next_stage_label: "2nd warning" }),
    ]);
    render(<Page />);
    expect(await screen.findByText("SECOND DUE")).toBeInTheDocument();
    expect(screen.queryByText("On leave (leave module)")).not.toBeInTheDocument();
    expect(screen.queryByText("OLD VERIFY ROW")).not.toBeInTheDocument();
    expect(screen.queryByText("Verification pending")).not.toBeInTheDocument();
  });

  it("counts an ON_LEAVE case as due today for the empty-state notice", async () => {
    vi.mocked(fetchLaCandidates).mockResolvedValue([]);
    vi.mocked(fetchLaList).mockResolvedValue([]);
    const { unmount } = render(<Page />);
    expect(await screen.findByText("Nothing is due today in this branch.")).toBeInTheDocument();
    unmount();
    vi.mocked(fetchLaList).mockResolvedValue([
      listRow({ case_id: 5, emp_name: "ON LEAVE ME", due_band: "ON_LEAVE", status: 2, ...MODULE_LEAVE }),
    ]);
    render(<Page />);
    expect(await screen.findByText("ON LEAVE ME")).toBeInTheDocument();
    expect(screen.queryByText("Nothing is due today in this branch.")).not.toBeInTheDocument();
  });

  it("on a phone the cards carry the leave chips and the candidates their leave notes", async () => {
    state.mobile = true;
    vi.mocked(fetchLaList).mockResolvedValue([
      listRow({ case_id: 5, emp_name: "ON LEAVE ME", due_band: "ON_LEAVE", status: 2, leave_parked: 1, ...MODULE_LEAVE }),
      listRow({
        case_id: 2,
        emp_name: "LEAVE ENDED",
        due_band: "LETTER_DUE",
        next_stage_code: "WARNING_2",
        next_stage_label: "2nd warning",
        ...ENDED_LEAVE,
      }),
      listRow({
        case_id: 3,
        emp_name: "REQUEST PENDING",
        due_band: "LETTER_DUE",
        next_stage_code: "WARNING_2",
        next_stage_label: "2nd warning",
        pending_leave_since: "2026-10-09",
      }),
    ]);
    vi.mocked(fetchLaCandidates).mockResolvedValue([
      {
        eb_id: 99,
        emp_code: "5555",
        emp_name: "NEW ABSENTEE",
        dept_id: 4,
        dept_desc: "WEAVING",
        sub_dept_desc: null,
        designation: "WEAVER",
        category: null,
        last_seen: "2026-09-25",
        absent_days: 16,
        closed_cases: 0,
        pending_leave_since: "2026-10-09",
        leave_transaction_id: 5002,
        leave_type_id: 24,
        leave_type_name: "STL LEAVE (L)",
        leave_from: "2026-09-20",
        leave_to: "2026-09-25",
      },
    ]);
    render(<Page />);
    expect(await screen.findByText("ON LEAVE ME")).toBeInTheDocument();
    expect(screen.getByText("On leave: STL LEAVE (L) till 24-10-2026")).toBeInTheDocument();
    expect(screen.getByText("Leave STL LEAVE (L) ended 05-10-2026")).toBeInTheDocument();
    expect(screen.getByText("Leave request pending since 09-10-2026", { selector: ".MuiChip-label" })).toBeInTheDocument();
    // An ON_LEAVE case is only to look at: the leave module parks it, so it is not picked for a letter batch.
    expect(screen.getByLabelText("Select LEAVE ENDED")).toBeInTheDocument();
    expect(screen.queryByLabelText("Select ON LEAVE ME")).not.toBeInTheDocument();
    // The candidate: the approved leave that ended on the last seen day, and the pending request.
    expect(await screen.findByText("NEW ABSENTEE")).toBeInTheDocument();
    expect(screen.getByText("Leave STL LEAVE (L) ended 25-09-2026 (leave module)")).toBeInTheDocument();
    expect(screen.getAllByText("Leave request pending since 09-10-2026")).toHaveLength(2);
  });

  it("opens a case on the same route", async () => {
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "open 2" }));
    expect(state.push).toHaveBeenCalledWith(
      "/dashboardportal/hrms/longAbsenteeism?case_id=2&branch_id=12",
    );
  });

  it("view only: no actions, no edit tabs", async () => {
    state.access = { create: false, edit: false };
    vi.mocked(fetchLaSetup).mockResolvedValue({ ...SETUP, access_level: 1 });
    render(<Page />);
    expect(await screen.findByText("View only")).toBeInTheDocument();
    await screen.findByText("FIRST DUE");
    expect(screen.queryByRole("button", { name: /Issue due letters/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open case/ })).not.toBeInTheDocument();
    expect(sectionTabs()).toEqual(["Watchlist", "Reports"]);
  });

  it("the branch access level narrows the menu access", async () => {
    vi.mocked(fetchLaSetup).mockResolvedValue({ ...SETUP, access_level: 3 });
    render(<Page />);
    await screen.findByText("FIRST DUE");
    await waitFor(() => expect(screen.queryByRole("button", { name: /Issue due letters/ })).not.toBeInTheDocument());
    expect(screen.getAllByRole("button", { name: /Open case/ }).length).toBeGreaterThan(0);
  });

  it("renders the Dispatch tab for ?tab=dispatch", async () => {
    state.search = "tab=dispatch";
    vi.mocked(fetchLaDispatch).mockResolvedValue([]);
    render(<Page />);
    expect(await screen.findByRole("button", { name: /Print register/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(vi.mocked(fetchLaDispatch)).toHaveBeenCalledWith(expect.objectContaining({ coId: 9, branchId: 12 })),
    );
  });
});

describe("case view", () => {
  it("shows the case with the next-letter action and opens the preview with Force", async () => {
    state.search = "case_id=41";
    vi.mocked(fetchLaCase).mockResolvedValue({
      case: baseCase({}),
      letters: [
        {
          letter_id: 301,
          case_id: 41,
          stage_code: "WARNING_1",
          letter_no: 1,
          template_code: "WARNING_1",
          issue_date: "2026-10-01",
          subject: "NOTICE",
          body: "Body",
          reply_due_date: "2026-10-08",
          dispatch_mode: "REG_POST_AD",
          sent_date: null,
          ad_no: null,
          delivery_status: null,
          delivery_date: null,
          gate_display_date: null,
          dept_display_date: null,
          batch_ref: null,
          forced: 0,
          recorded: 0,
          stage_label: "1st warning",
          template_label: null,
          dispatch_mode_label: "Registered post with AD",
          delivery_status_label: null,
          receipts: [],
          attachments: {},
        },
      ],
      events: [],
      earlier_cases: [],
    });
    vi.mocked(fetchLaStruckOffPermissions).mockResolvedValue({
      canApprove: false,
      canReject: false,
      canReopen: false,
      canViewApprovalLog: false,
      status_id: null,
      approval_level: null,
      max_approval_level: null,
      hierarchy_exists: false,
      can_send: false,
      send_blocked_reason: "Issue the gate notice first",
    });
    vi.mocked(previewLaLetter).mockResolvedValue({
      case_id: 41,
      case_no: "LA/12/26/0001",
      stage_code: "WARNING_2",
      stage_label: "2nd warning",
      template_code: "WARNING_2",
      template_label: "2nd warning letter",
      letter_no: 2,
      subject: "NOTICE UNDER RULE 14(C)(V)",
      body: "Dear Ram, this is the 2nd notice.",
      editable: false,
      blocked_reason: "Record the sent date of the 1st warning first",
      blocked_code: "NOT_SENT",
      can_force: true,
      issue_date: "2026-10-11",
      due_date: null,
      reply_due_date: "2026-10-18",
      dispatch_mode: "REG_POST_AD",
    });

    render(<Page />);
    expect(await screen.findByText("RAM KUMAR")).toBeInTheDocument();
    expect(screen.getByText("Sent date not recorded")).toBeInTheDocument();
    expect(screen.getAllByTestId("uploader").map((u) => u.textContent)).toEqual(["Signed office copy", "A.D. card"]);
    // No approval panel before the gate notice.
    expect(screen.queryByText("Struck-off approval")).not.toBeInTheDocument();

    // The label comes from /setup of the case's branch (loaded after the case).
    const issue = await screen.findAllByRole("button", { name: /Issue 2nd warning/ });
    fireEvent.click(issue[0]);
    expect(await screen.findByText(/Record the sent date of the 1st warning first/)).toBeInTheDocument();
    expect(vi.mocked(previewLaLetter)).toHaveBeenCalledWith(9, 41, null);
    expect(screen.getByText("EMPIRE JUTE letterhead")).toBeInTheDocument();
    // The merged text is shown read-only (owner 2026-10-11: letters are not edited by hand).
    expect(screen.getByTestId("letter-preview-body")).toHaveTextContent("Dear Ram, this is the 2nd notice.");
    expect(screen.getByTestId("letter-preview-subject")).toHaveTextContent("NOTICE UNDER RULE 14(C)(V)");
    expect(screen.queryByDisplayValue("Dear Ram, this is the 2nd notice.")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Letter")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Subject")).not.toBeInTheDocument();
    expect(screen.getByText(/Merged from the template "2nd warning letter"/)).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Issue & print" });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Force/));
    expect(screen.getByRole("button", { name: "Issue & print" })).not.toBeDisabled();
    expect(screen.getByLabelText(/Reason for forcing/)).toBeInTheDocument();

    // Issue: only timing / dispatch go to the server, never the text.
    vi.mocked(issueLaLetter).mockResolvedValue({
      letter: {
        letter_id: 302,
        case_id: 41,
        stage_code: "WARNING_2",
        letter_no: 2,
        template_code: "WARNING_2",
        issue_date: "2026-10-11",
        subject: "NOTICE UNDER RULE 14(C)(V)",
        body: "Dear Ram, this is the 2nd notice.",
        reply_due_date: "2026-10-18",
        dispatch_mode: "REG_POST_AD",
        sent_date: null,
        ad_no: null,
        delivery_status: null,
        delivery_date: null,
        gate_display_date: null,
        dept_display_date: null,
        batch_ref: null,
        forced: 1,
        recorded: 0,
        stage_label: "2nd warning",
        template_label: "2nd warning letter",
        dispatch_mode_label: "Registered post with AD",
        delivery_status_label: null,
        receipts: [],
        attachments: {},
      },
      case: baseCase({ stage_code: "WARNING_2", stage_label: "2nd warning" }),
    });
    fireEvent.change(screen.getByLabelText(/Reason for forcing/), { target: { value: "AD slip lost" } });
    fireEvent.click(screen.getByRole("button", { name: "Issue & print" }));
    await waitFor(() =>
      expect(vi.mocked(issueLaLetter)).toHaveBeenCalledWith({
        co_id: 9,
        case_id: 41,
        stage_code: "WARNING_2",
        issue_date: "2026-10-11",
        dispatch_mode: "REG_POST_AD",
        force: true,
        force_reason: "AD slip lost",
      }),
    );
    expect(await screen.findByRole("button", { name: "Print again" })).toBeInTheDocument();
  });

  it("at the gate notice shows the struck-off bar with Send for approval", async () => {
    state.search = "case_id=41";
    vi.mocked(fetchLaCase).mockResolvedValue({
      case: baseCase({ stage_code: "GATE_NOTICE", stage_label: "Gate notice" }),
      letters: [],
      events: [],
      earlier_cases: [],
    });
    vi.mocked(fetchLaStruckOffPermissions).mockResolvedValue({
      canApprove: false,
      canReject: false,
      canReopen: false,
      canViewApprovalLog: false,
      status_id: null,
      approval_level: null,
      max_approval_level: null,
      hierarchy_exists: false,
      can_send: true,
      send_blocked_reason: null,
    });
    render(<Page />);
    expect(await screen.findByText("Struck-off approval")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Send for Approval" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    // No further letter after the gate notice.
    expect(screen.queryByRole("button", { name: /^Issue / })).not.toBeInTheDocument();
  });
});

describe("case view: letters issued outside VoWERP and the PDF (owner 2026-10-12)", () => {
  const PERMS = {
    canApprove: false,
    canReject: false,
    canReopen: false,
    canViewApprovalLog: false,
    status_id: null,
    approval_level: null,
    max_approval_level: null,
    hierarchy_exists: false,
    can_send: false,
    send_blocked_reason: null,
  };
  const W1: LaLetter = {
    letter_id: 301,
    case_id: 41,
    stage_code: "WARNING_1",
    letter_no: 1,
    template_code: "WARNING_1",
    issue_date: "2026-10-01",
    subject: "NOTICE",
    body: "Body",
    reply_due_date: "2026-10-08",
    dispatch_mode: "REG_POST_AD",
    sent_date: "2026-10-02",
    ad_no: null,
    delivery_status: null,
    delivery_date: null,
    gate_display_date: null,
    dept_display_date: null,
    batch_ref: null,
    forced: 0,
    recorded: 1,
    stage_label: "1st warning",
    template_label: "1st warning letter",
    dispatch_mode_label: "Registered post with AD",
    delivery_status_label: null,
    receipts: [],
    attachments: {},
  };

  beforeEach(() => {
    state.search = "case_id=41";
    vi.mocked(fetchLaCase).mockResolvedValue({ case: baseCase({}), letters: [W1], events: [], earlier_cases: [] });
    vi.mocked(fetchLaStruckOffPermissions).mockResolvedValue(PERMS);
  });

  it("marks a recorded letter and downloads one letter as a PDF", async () => {
    vi.mocked(downloadLaLettersPdf).mockResolvedValue("long-absenteeism-letters-20261011.pdf");
    render(<Page />);
    expect(await screen.findByText("Recorded")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(vi.mocked(downloadLaLettersPdf)).toHaveBeenCalledWith(9, [301]));
  });

  it("records the next letter with its real dates (the letter is read-only)", async () => {
    vi.mocked(recordLaLetter).mockResolvedValue({
      letter: { ...W1, letter_id: 302, stage_code: "WARNING_2", stage_label: "2nd warning" },
      case: baseCase({ stage_code: "WARNING_2", stage_label: "2nd warning" }),
    });
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Record a letter already issued" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("record-letter-stage")).toHaveValue("2nd warning");
    expect(within(dialog).getByTestId("record-letter-stage")).toBeDisabled();
    // not before the previous letter (01-10-2026)
    fireEvent.change(within(dialog).getByLabelText(/Letter date/), { target: { value: "2026-09-30" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record letter" }));
    expect(
      await within(dialog).findByText("Letter date cannot be before the previous letter's date (01-10-2026)"),
    ).toBeInTheDocument();
    expect(vi.mocked(recordLaLetter)).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText(/Letter date/), { target: { value: "2026-10-05" } });
    fireEvent.change(within(dialog).getByLabelText("Sent date"), { target: { value: "2026-10-06" } });
    fireEvent.change(within(dialog).getByLabelText("A.D. / registered post no"), { target: { value: "RA77" } });
    fireEvent.change(within(dialog).getByLabelText("Note"), { target: { value: "Old register, page 12" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record letter" }));
    await waitFor(() =>
      expect(vi.mocked(recordLaLetter)).toHaveBeenCalledWith({
        co_id: 9,
        case_id: 41,
        stage_code: "WARNING_2",
        issue_date: "2026-10-05",
        sent_date: "2026-10-06",
        dispatch_mode: "REG_POST_AD",
        ad_no: "RA77",
        delivery_status: null,
        delivery_date: null,
        note: "Old register, page 12",
      }),
    );
    expect(await screen.findByText("2nd warning recorded as already issued.")).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(fetchLaCase).mock.calls.length).toBeGreaterThan(1));
  });

  it("offers no record at the gate notice, nor without edit access", async () => {
    vi.mocked(fetchLaCase).mockResolvedValue({
      case: baseCase({ stage_code: "GATE_NOTICE", stage_label: "Gate notice" }),
      letters: [],
      events: [],
      earlier_cases: [],
    });
    const { unmount } = render(<Page />);
    expect(await screen.findByText("RAM KUMAR")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record a letter already issued" })).not.toBeInTheDocument();
    unmount();
    state.access = { create: true, edit: false };
    vi.mocked(fetchLaCase).mockResolvedValue({ case: baseCase({}), letters: [W1], events: [], earlier_cases: [] });
    render(<Page />);
    expect(await screen.findByText("RAM KUMAR")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record a letter already issued" })).not.toBeInTheDocument();
    // a view / create user may still download the PDF
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
    state.access = { create: true, edit: true };
  });
});

describe("case view: leave from the leave module", () => {
  const PERMS = {
    canApprove: false,
    canReject: false,
    canReopen: false,
    canViewApprovalLog: false,
    status_id: null,
    approval_level: null,
    max_approval_level: null,
    hierarchy_exists: false,
    can_send: false,
    send_blocked_reason: null,
  };

  const showCase = (c: LaCase) => {
    state.search = "case_id=41";
    vi.mocked(fetchLaCase).mockResolvedValue({ case: c, letters: [], events: [], earlier_cases: [] });
    vi.mocked(fetchLaStruckOffPermissions).mockResolvedValue(PERMS);
  };

  /** The case after "Exit as on leave" (what the server answers). */
  const closedAsLeave = baseCase({ status: 0, status_label: "Closed", exit_reason: "LEAVE", exit_reason_label: "On leave" });

  it("a case parked by the leave module shows the Leave panel and 'Exit as on leave'; confirming closes it as LEAVE", async () => {
    showCase(baseCase({ status: 2, status_label: "Parked", leave_parked: 1, ...MODULE_LEAVE }));
    vi.mocked(exitLaCase).mockResolvedValue(closedAsLeave);
    render(<Page />);
    expect(await screen.findByText("RAM KUMAR")).toBeInTheDocument();

    // The Leave panel, read from the leave module.
    expect(screen.getByText("Leave (leave module)")).toBeInTheDocument();
    expect(
      screen.getByText("On leave: STL LEAVE (L) 08-10-2026 – 24-10-2026 (leave module) — case parked automatically"),
    ).toBeInTheDocument();
    expect(screen.getByText(/only approved requests count/)).toBeInTheDocument();
    expect(screen.getByText("Parked automatically by the leave module")).toBeInTheDocument();
    expect(screen.getByText("On leave: STL LEAVE (L) till 24-10-2026 (leave module)")).toBeInTheDocument();

    // Edit access: Exit as on leave (after the branch's setup grants it), no Verify anywhere.
    const exit = await screen.findByRole("button", { name: "Exit as on leave" });
    expect(screen.queryByRole("button", { name: /verify/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Verification/)).not.toBeInTheDocument();
    expect(vi.mocked(exitLaCase)).not.toHaveBeenCalled();

    fireEvent.click(exit);
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "Close this case as on leave: STL LEAVE (L) 08-10-2026 – 24-10-2026 (leave module), expected back 24-10-2026?",
      ),
    ).toBeInTheDocument();
    // Cancelling sends nothing.
    expect(vi.mocked(exitLaCase)).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close case" }));
    await waitFor(() =>
      expect(vi.mocked(exitLaCase)).toHaveBeenCalledWith(
        expect.objectContaining({
          co_id: 9,
          case_id: 41,
          exit_reason: "LEAVE",
          leave_type_id: 24,
          exit_date: "2026-10-11",
          expected_return_date: "2026-10-24",
        }),
      ),
    );
    expect(vi.mocked(exitLaCase)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(exitLaCase).mock.calls[0][0].exit_remarks).toBe(
      "Approved leave in the leave module: STL LEAVE (L) 08-10-2026 – 24-10-2026",
    );
    expect(await screen.findByText("Case closed as on leave.")).toBeInTheDocument();
    // The case is reloaded after the exit.
    await waitFor(() => expect(vi.mocked(fetchLaCase).mock.calls.length).toBeGreaterThan(1));
  });

  it("a leave that ended before today: the case resumed, and the exit carries no expected return date", async () => {
    showCase(baseCase({ status: 1, ...ENDED_LEAVE }));
    vi.mocked(exitLaCase).mockResolvedValue(closedAsLeave);
    render(<Page />);
    expect(await screen.findByText("Leave STL LEAVE (L) ended 05-10-2026 — still absent, case resumed")).toBeInTheDocument();
    expect(screen.getByText("Leave STL LEAVE (L) ended 05-10-2026 — not returned")).toBeInTheDocument();
    expect(screen.queryByText("Parked automatically by the leave module")).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Exit as on leave" }));
    const dialog = await screen.findByRole("dialog");
    const message = within(dialog).getByText(/Close this case as on leave/);
    expect(message).toHaveTextContent("Close this case as on leave: STL LEAVE (L) 28-09-2026 – 05-10-2026 (leave module)?");
    expect(message).not.toHaveTextContent("expected back");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close case" }));
    await waitFor(() =>
      expect(vi.mocked(exitLaCase)).toHaveBeenCalledWith(
        expect.objectContaining({
          exit_reason: "LEAVE",
          leave_type_id: 24,
          exit_date: "2026-10-11",
          expected_return_date: null,
        }),
      ),
    );
  });

  it("'Close case' on a case with a module leave opens the exit dialog with the leave preset", async () => {
    showCase(baseCase({ status: 2, status_label: "Parked", leave_parked: 1, ...MODULE_LEAVE }));
    vi.mocked(exitLaCase).mockResolvedValue(closedAsLeave);
    render(<Page />);
    await screen.findByRole("button", { name: "Exit as on leave" });
    fireEvent.click(screen.getByRole("button", { name: "Close case" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Approved leave in the leave module: STL LEAVE (L) 08-10-2026 – 24-10-2026."),
    ).toBeInTheDocument();
    // Reason = the "On leave: <type>" exit option of the leave type; return date = the leave end.
    expect(within(dialog).getByRole("combobox", { name: /Reason/ })).toHaveValue("On leave: STL LEAVE (L)");
    expect(within(dialog).getByLabelText(/Expected return date/)).toHaveValue("2026-10-24");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close case" }));
    await waitFor(() =>
      expect(vi.mocked(exitLaCase)).toHaveBeenCalledWith({
        co_id: 9,
        case_id: 41,
        exit_reason: "LEAVE",
        leave_type_id: 24,
        exit_date: "2026-10-11",
        exit_remarks: null,
        expected_return_date: "2026-10-24",
      }),
    );
  });

  it("view only: the Leave panel is shown, but no Exit as on leave and no Close case", async () => {
    state.access = { create: false, edit: false };
    vi.mocked(fetchLaSetup).mockResolvedValue({ ...SETUP, access_level: 1 });
    showCase(baseCase({ status: 2, status_label: "Parked", leave_parked: 1, ...MODULE_LEAVE }));
    render(<Page />);
    expect(await screen.findByText("Leave (leave module)")).toBeInTheDocument();
    expect(await screen.findByText("View only")).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(fetchLaSetup)).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText(/case parked automatically/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Exit as on leave" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close case" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /verify/i })).not.toBeInTheDocument();
  });

  it("only approved leave counts: a pending request is shown but offers no Exit as on leave", async () => {
    showCase(baseCase({ status: 1, pending_leave_since: "2026-10-09" }));
    render(<Page />);
    expect(await screen.findByText("No approved leave in the leave module after the last working date")).toBeInTheDocument();
    expect(screen.getByText("Leave request pending approval since 09-10-2026")).toBeInTheDocument();
    expect(screen.getByText("Leave request pending since 09-10-2026")).toBeInTheDocument();
    // Edit access is granted once the setup is in (Close case shows), yet no module leave to exit by.
    await screen.findByRole("button", { name: "Close case" });
    expect(screen.queryByRole("button", { name: "Exit as on leave" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /verify/i })).not.toBeInTheDocument();
  });

  it("an old case keeps its recorded verification result as a read-only line, with no way to verify again", async () => {
    showCase(
      baseCase({
        stage_code: "VERIFIED",
        verified_date: "2026-09-30",
        esi_stl_result: "ESI",
        esi_stl_result_label: "On ESI",
      }),
    );
    render(<Page />);
    expect(await screen.findByText("Recorded at verification")).toBeInTheDocument();
    expect(screen.getByText("On ESI")).toBeInTheDocument();
    await screen.findByRole("button", { name: "Close case" });
    expect(screen.queryByRole("button", { name: /verify/i })).not.toBeInTheDocument();
  });

  it("a closed leave exit reads 'Closed as ...' on the panel", async () => {
    showCase(
      baseCase({
        status: 0,
        status_label: "Closed",
        exit_reason: "LEAVE",
        exit_reason_label: "On leave",
        exit_date: "2026-10-11",
        expected_return_date: "2026-10-24",
        ...MODULE_LEAVE,
      }),
    );
    render(<Page />);
    expect(await screen.findByText("Closed as")).toBeInTheDocument();
    expect(screen.getByText("On leave: STL LEAVE (L), expected back 24-10-2026")).toBeInTheDocument();
    // A closed case is reopened, not exited again.
    await screen.findByRole("button", { name: "Reopen" });
    expect(screen.queryByRole("button", { name: "Exit as on leave" })).not.toBeInTheDocument();
  });
});
