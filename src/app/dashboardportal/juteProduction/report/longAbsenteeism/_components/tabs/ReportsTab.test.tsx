/**
 * @vitest-environment jsdom
 *
 * Reports tab: the stage summary renders a totals card + one card per
 * department (bars per stage, live / parked), the exits of the last 90 days,
 * the struck-off register is asked for the last 365 days, and the monthly
 * trend feeds the chart and the numbers table. The service is mocked; the
 * MUI X chart is replaced by a div (jsdom cannot lay out SVG charts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboardportal/juteProduction/report/longAbsenteeism",
}));

vi.mock("@/components/dashboard/sidebarContext", () => ({
  useSidebarContext: () => ({ selectedCompany: { co_id: 9, co_name: "EMPIRE JUTE" } }),
}));

vi.mock("@/utils/reportMenuService", () => ({
  resolveReportMenuId: vi.fn(async () => 77),
}));

vi.mock("@mui/x-charts/LineChart", () => ({
  LineChart: ({ series, xAxis }: { series: { label: string; data: number[] }[]; xAxis: { data: string[] }[] }) => (
    <div data-testid="line-chart">
      {series.map((s) => `${s.label}=${s.data.join("/")}`).join(";")}|{xAxis[0].data.join(",")}
    </div>
  ),
}));

vi.mock("@/utils/longAbsenteeismService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/longAbsenteeismService")>();
  return {
    ...actual,
    fetchLaStageSummary: vi.fn(),
    fetchLaStruckOffRegister: vi.fn(),
    fetchLaMonthlyTrend: vi.fn(),
  };
});

import {
  fetchLaMonthlyTrend,
  fetchLaStageSummary,
  fetchLaStruckOffRegister,
  type LaSetup,
} from "@/utils/longAbsenteeismService";
import ReportsTab from "./ReportsTab";

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

const SETUP = {
  stages: STAGES,
  letter_stages: ["WARNING_1", "WARNING_2", "WARNING_3", "SHOW_CAUSE", "GATE_NOTICE", "STRUCK_OFF"],
  depts: [
    { dept_id: 4, dept_desc: "WEAVING" },
    { dept_id: 5, dept_desc: "SPINNING" },
  ],
  today: "2026-10-11",
  access_level: 1,
} as unknown as LaSetup;

const props = {
  coId: 9,
  branchId: 12 as number | null,
  branches: [{ branch_id: 12, branch_name: "FACTORY" }],
  setup: SETUP,
  canEdit: false,
  onNotify: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchLaStageSummary).mockResolvedValue({
    by_dept: [
      { dept_desc: "SPINNING", counts: { DETECTED: 1, GATE_NOTICE: 2, STRUCK_OFF: 0 }, parked: 0, total_live: 3 },
      { dept_desc: "WEAVING", counts: { VERIFIED: 2, WARNING_1: 4 }, parked: 1, total_live: 6 },
    ],
    exits: [
      { exit_reason: "REJOINED", label: "Rejoined", count: 2 },
      { exit_reason: "STRUCK_OFF", label: "Struck off", count: 1 },
    ],
    as_on: "2026-10-11",
  });
  vi.mocked(fetchLaStruckOffRegister).mockResolvedValue([]);
  vi.mocked(fetchLaMonthlyTrend).mockResolvedValue([
    { month: "2026-09", opened: 4, struck_off: 1, rejoined: 2, other_exits: 0 },
    { month: "2026-10", opened: 3, struck_off: 0, rejoined: 1, other_exits: 1 },
  ]);
});

describe("ReportsTab", () => {
  it("renders the totals card and one card per department", async () => {
    render(<ReportsTab {...props} />);
    await screen.findByText("WEAVING");
    const cards = screen.getAllByTestId("stage-card");
    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByText("All departments")).toBeInTheDocument();
    // Totals: 9 live, 1 parked; the whole live ladder (no zero "Struck off").
    expect(within(cards[0]).getByText(/1 parked/)).toBeInTheDocument();
    expect(within(cards[0]).getByText("9")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Show cause")).toBeInTheDocument();
    expect(within(cards[0]).queryByText("Struck off")).not.toBeInTheDocument();
    // Department cards: only the stages with cases, the count at the right.
    const spinning = cards[1];
    expect(within(spinning).getByText("SPINNING")).toBeInTheDocument();
    expect(within(spinning).getByText("Gate notice")).toBeInTheDocument();
    expect(within(spinning).getByRole("progressbar", { name: "Gate notice: 2" })).toBeInTheDocument();
    expect(within(spinning).queryByText("Verified")).not.toBeInTheDocument();
    const weaving = cards[2];
    expect(within(weaving).getByText("1st warning")).toBeInTheDocument();
    expect(within(weaving).getByText(/1 parked/)).toBeInTheDocument();
    // Exits of the last 90 days.
    expect(screen.getByText("Rejoined: 2")).toBeInTheDocument();
    expect(screen.getByText("Struck off: 1")).toBeInTheDocument();
    expect(fetchLaStageSummary).toHaveBeenCalledWith({ coId: 9, branchId: 12 });
  });

  it("asks for the struck-off register of the last 365 days, every department", async () => {
    render(<ReportsTab {...props} />);
    await waitFor(() =>
      expect(fetchLaStruckOffRegister).toHaveBeenCalledWith({
        coId: 9,
        branchId: 12,
        dateFrom: "2025-10-11",
        dateTo: "2026-10-11",
        deptId: null,
      }),
    );
    expect(screen.getByRole("heading", { name: "Struck-off register" })).toBeInTheDocument();
  });

  it("feeds the 12-month trend to the chart and the table", async () => {
    render(<ReportsTab {...props} />);
    const chart = await screen.findByTestId("line-chart");
    expect(fetchLaMonthlyTrend).toHaveBeenCalledWith({ coId: 9, branchId: 12, months: 12 });
    expect(chart).toHaveTextContent("Opened=4/3;Struck off=1/0;Rejoined=2/1;Other exits=0/1|2026-09,2026-10");
    expect(screen.getByText("Sep 2026")).toBeInTheDocument();
    expect(screen.getByText("Oct 2026")).toBeInTheDocument();
    const totalRow = screen.getByText("Total").closest("tr") as HTMLElement;
    expect(within(totalRow).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Total", "7", "1", "3", "1"]);
  });

  it("shows a load error per section", async () => {
    vi.mocked(fetchLaStageSummary).mockRejectedValueOnce(new Error("Stage summary failed"));
    render(<ReportsTab {...props} />);
    expect(await screen.findByText("Stage summary failed")).toBeInTheDocument();
    // The other sections still load.
    expect(await screen.findByTestId("line-chart")).toBeInTheDocument();
  });

  it("asks for a branch first", () => {
    render(<ReportsTab {...props} branchId={null} />);
    expect(screen.getByText(/Select a branch/)).toBeInTheDocument();
    expect(fetchLaStageSummary).not.toHaveBeenCalled();
  });
});
