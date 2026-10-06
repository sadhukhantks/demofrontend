/**
 * @vitest-environment jsdom
 *
 * Jute Issue — Yarn Quality Wise page (TKT-000214): loads for the branch and
 * date handed over by the reports hub, lists one row per yarn quality with a
 * Grand Total, shows the day and month-to-date totals in both units, and
 * switches kg <-> MT without another request.
 *
 * Wastage filter (owner: "give filter button to exclude wastage"): the default
 * is raw jute + wastage; "Excl. wastage" shows raw jute only on the rows, the
 * Grand Total and the cards, drops a wastage-only quality, says so in the
 * heading and in the Excel / PDF title block — all without a request.
 * The service and the two export writers are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";

const hookState = vi.hoisted(() => ({
  value: {
    branches: [{ branch_id: 29, branch_name: "FACTORY" }],
    coId: 2 as number | null,
    companyName: "SLS" as string | null,
    initialBranchId: 29 as number | null,
    dateParam: "2026-10-04" as string | null,
  },
}));

vi.mock("@/components/reports/useReportBranches", () => ({
  useReportBranches: () => hookState.value,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/dashboardportal/jutePurchase/reports/issueYarnWise",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/dashboard/sidebarContext", () => ({
  useSidebarContext: () => ({
    selectedCompany: { co_id: 2, co_name: "SLS" },
    selectedBranches: [29],
  }),
}));

vi.mock("@/utils/reportMenuService", () => ({
  resolveReportMenuId: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/utils/juteReportService", () => ({
  fetchJuteIssueYarnWise: vi.fn(),
}));

vi.mock("@/components/reports/exportExcel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/reports/exportExcel")>()),
  exportRowsToExcel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/reports/exportPdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/reports/exportPdf")>()),
  exportRowsToPdf: vi.fn().mockResolvedValue(undefined),
}));

/** DataGrid virtualises on a measured viewport and renders no rows in jsdom;
 *  a plain table with the same column contract lets the tests read the cells. */
vi.mock("@/components/reports/ReportGrid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/reports/ReportGrid")>();
  const React = await import("react");
  type Props = {
    rows: GridValidRowModel[];
    columns: GridColDef[];
    getRowId: (r: GridValidRowModel) => string | number;
    error: string | null;
  };
  const cell = (c: GridColDef, r: GridValidRowModel): string => {
    let v: unknown = r[c.field];
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
  const Grid = ({ rows, columns, getRowId, error }: Props) =>
    React.createElement(
      "div",
      null,
      error ? React.createElement("div", { role: "alert" }, error) : null,
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
              {
                key: getRowId(r),
                className: actual.isReportTotalRow(r) ? "report-total-row" : "",
              },
              columns.map((c) => React.createElement("td", { key: c.field }, cell(c, r))),
            ),
          ),
        ),
      ),
    );
  return { ...actual, default: Grid };
});

import { fetchJuteIssueYarnWise } from "@/utils/juteReportService";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { exportRowsToPdf } from "@/components/reports/exportPdf";
import Page from "./page";

const fetchMock = vi.mocked(fetchJuteIssueYarnWise);
const excelMock = vi.mocked(exportRowsToExcel);
const pdfMock = vi.mocked(exportRowsToPdf);

const NO_WASTE = { day_waste_kg: 0, mtd_waste_kg: 0 };

/** sls branch 29 on 2026-10-04, as the endpoint returned it — no wastage. */
const SLS_BR29_4_OCT = [
  { yarn_type_id: 28, yarn_type_name: "13-SKWP", day_issue_kg: 7869, mtd_issue_kg: 23657, ...NO_WASTE },
  { yarn_type_id: 24, yarn_type_name: "16-HSWP", day_issue_kg: 1360, mtd_issue_kg: 1360, ...NO_WASTE },
  { yarn_type_id: 29, yarn_type_name: "16-SKWP", day_issue_kg: 6976, mtd_issue_kg: 26227, ...NO_WASTE },
  { yarn_type_id: 53, yarn_type_name: "7.5 LBS-HSWP", day_issue_kg: 2163, mtd_issue_kg: 6964, ...NO_WASTE },
  { yarn_type_id: 26, yarn_type_name: "9.5-HSWT", day_issue_kg: 972, mtd_issue_kg: 3466, ...NO_WASTE },
];

/** A day with wastage on one quality and a quality issued wastage only. */
const WITH_WASTAGE = [
  { yarn_type_id: 28, yarn_type_name: "13-SKWP", day_issue_kg: 6643, mtd_issue_kg: 151775, day_waste_kg: 0, mtd_waste_kg: 4742 },
  { yarn_type_id: 29, yarn_type_name: "16-SKWP", day_issue_kg: 7653, mtd_issue_kg: 218138, day_waste_kg: 300, mtd_waste_kg: 7317 },
  { yarn_type_id: 99, yarn_type_name: "WASTE BLEND", day_issue_kg: 250, mtd_issue_kg: 250, day_waste_kg: 250, mtd_waste_kg: 250 },
];

const HEADING_ALL = "Jute Issue — Yarn Quality Wise (raw jute + wastage)";
const HEADING_RAW = "Jute Issue — Yarn Quality Wise (raw jute only, wastage excluded)";

const bodyRows = () =>
  within(screen.getByTestId("grid"))
    .getAllByRole("row")
    .slice(1) // header
    .map((tr) => within(tr).getAllByRole("cell").map((td) => td.textContent));

const headers = () =>
  within(screen.getByTestId("grid"))
    .getAllByRole("columnheader")
    .map((th) => th.textContent);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(SLS_BR29_4_OCT);
  excelMock.mockClear();
  pdfMock.mockClear();
});

describe("Jute Issue — Yarn Quality Wise page", () => {
  it("loads the hub's branch and date and lists each yarn quality with a Grand Total, in kg", async () => {
    render(<Page />);

    await waitFor(() => expect(bodyRows()).toHaveLength(6));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(29, "2026-10-04");

    expect(headers()).toEqual([
      "Yarn Quality",
      "Day Raw (kg)", "Day Waste (kg)", "Day Total (kg)",
      "MTD Raw (kg)", "MTD Waste (kg)", "MTD Total (kg)",
    ]);
    expect(bodyRows()).toEqual([
      ["13-SKWP", "7869", "0", "7869", "23657", "0", "23657"],
      ["16-HSWP", "1360", "0", "1360", "1360", "0", "1360"],
      ["16-SKWP", "6976", "0", "6976", "26227", "0", "26227"],
      ["7.5 LBS-HSWP", "2163", "0", "2163", "6964", "0", "6964"],
      ["9.5-HSWT", "972", "0", "972", "3466", "0", "3466"],
      ["Grand Total", "19340", "0", "19340", "61674", "0", "61674"],
    ]);
    const rows = within(screen.getByTestId("grid")).getAllByRole("row");
    expect(rows[rows.length - 1]).toHaveClass("report-total-row");
  });

  it("shows the day and month-to-date totals in both units, with their periods", async () => {
    render(<Page />);
    await waitFor(() => expect(bodyRows()).toHaveLength(6));

    const day = screen.getByText("Total jute issue — day").parentElement as HTMLElement;
    expect(within(day).getByText("19,340 kg")).toBeInTheDocument();
    expect(within(day).getByText("19.340 MT")).toBeInTheDocument();
    expect(within(day).getByText("04 Oct 2026")).toBeInTheDocument();

    const mtd = screen.getByText("Total jute issue — month to date").parentElement as HTMLElement;
    expect(within(mtd).getByText("61,674 kg")).toBeInTheDocument();
    expect(within(mtd).getByText("61.674 MT")).toBeInTheDocument();
    expect(within(mtd).getByText("01 Oct 2026 to 04 Oct 2026")).toBeInTheDocument();
  });

  it("switches to MT without fetching again", async () => {
    render(<Page />);
    await waitFor(() => expect(bodyRows()).toHaveLength(6));

    fireEvent.click(screen.getByRole("button", { name: "MT" }));

    expect(headers()).toEqual([
      "Yarn Quality",
      "Day Raw (MT)", "Day Waste (MT)", "Day Total (MT)",
      "MTD Raw (MT)", "MTD Waste (MT)", "MTD Total (MT)",
    ]);
    expect(bodyRows()).toEqual([
      ["13-SKWP", "7.869", "0.000", "7.869", "23.657", "0.000", "23.657"],
      ["16-HSWP", "1.360", "0.000", "1.360", "1.360", "0.000", "1.360"],
      ["16-SKWP", "6.976", "0.000", "6.976", "26.227", "0.000", "26.227"],
      ["7.5 LBS-HSWP", "2.163", "0.000", "2.163", "6.964", "0.000", "6.964"],
      ["9.5-HSWT", "0.972", "0.000", "0.972", "3.466", "0.000", "3.466"],
      ["Grand Total", "19.340", "0.000", "19.340", "61.674", "0.000", "61.674"],
    ]);
    // The card leads with the chosen unit and keeps the other beneath it.
    const day = screen.getByText("Total jute issue — day").parentElement as HTMLElement;
    expect(within(day).getByRole("heading")).toHaveTextContent("19.340 MT");
    expect(within(day).getByText("19,340 kg")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Kg" }));
    expect(headers()[1]).toBe("Day Raw (kg)");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-runs for the edited date only on Submit", async () => {
    render(<Page />);
    await waitFor(() => expect(bodyRows()).toHaveLength(6));

    fetchMock.mockResolvedValue([
      { yarn_type_id: 28, yarn_type_name: "13-SKWP", day_issue_kg: 0, mtd_issue_kg: 3000, ...NO_WASTE },
    ]);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-02" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(29, "2026-10-02"));
    await waitFor(() =>
      expect(bodyRows()).toEqual([
        ["13-SKWP", "0", "0", "0", "3000", "0", "3000"],
        ["Grand Total", "0", "0", "0", "3000", "0", "3000"],
      ]),
    );
    expect(screen.getByText("01 Oct 2026 to 02 Oct 2026")).toBeInTheDocument();
  });

  it("shows no totals and no unit switch when nothing was issued", async () => {
    fetchMock.mockResolvedValue([]);
    render(<Page />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("grid")).toBeInTheDocument());
    expect(bodyRows()).toEqual([]);
    expect(screen.queryByText("Total jute issue — day")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "MT" })).not.toBeInTheDocument();
  });

  it("surfaces a failed load", async () => {
    fetchMock.mockRejectedValue(new Error("Error fetching jute issue yarn wise report"));
    render(<Page />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Error fetching jute issue yarn wise report",
    );
    expect(bodyRows()).toEqual([]);
  });
});

describe("Jute Issue — Yarn Quality Wise page: wastage filter", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(WITH_WASTAGE);
  });

  it("starts with raw jute + wastage, and says so", async () => {
    render(<Page />);
    await waitFor(() => expect(bodyRows()).toHaveLength(4));

    expect(screen.getByRole("heading", { level: 5 })).toHaveTextContent(HEADING_ALL);
    expect(screen.getByRole("button", { name: "Incl. wastage" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Excl. wastage" })).toHaveAttribute("aria-pressed", "false");
    expect(bodyRows()).toEqual([
      ["13-SKWP", "6643", "0", "6643", "147033", "4742", "151775"],
      ["16-SKWP", "7353", "300", "7653", "210821", "7317", "218138"],
      ["WASTE BLEND", "0", "250", "250", "0", "250", "250"],
      ["Grand Total", "13996", "550", "14546", "357854", "12309", "370163"],
    ]);
    // Raw + Waste = Total on every row, as printed.
    for (const r of bodyRows()) {
      expect(Number(r[1]) + Number(r[2])).toBe(Number(r[3]));
      expect(Number(r[4]) + Number(r[5])).toBe(Number(r[6]));
    }

    const day = screen.getByText("Total jute issue — day").parentElement as HTMLElement;
    expect(within(day).getByRole("heading")).toHaveTextContent("14,546 kg");
    expect(within(day).getByText("Raw jute 13,996 kg · Wastage 550 kg")).toBeInTheDocument();
    const mtd = screen.getByText("Total jute issue — month to date").parentElement as HTMLElement;
    expect(within(mtd).getByRole("heading")).toHaveTextContent("3,70,163 kg");
    expect(within(mtd).getByText("Raw jute 3,57,854 kg · Wastage 12,309 kg")).toBeInTheDocument();
  });

  it("excludes wastage from the rows, the Grand Total and the cards without fetching", async () => {
    render(<Page />);
    await waitFor(() => expect(bodyRows()).toHaveLength(4));

    fireEvent.click(screen.getByRole("button", { name: "Excl. wastage" }));

    expect(screen.getByRole("heading", { level: 5 })).toHaveTextContent(HEADING_RAW);
    expect(screen.getByRole("button", { name: "Excl. wastage" })).toHaveAttribute("aria-pressed", "true");
    // Two raw-only columns; WASTE BLEND was issued wastage only, so it drops
    // out instead of printing 0 / 0.
    expect(headers()).toEqual(["Yarn Quality", "Day Raw (kg)", "MTD Raw (kg)"]);
    expect(bodyRows()).toEqual([
      ["13-SKWP", "6643", "147033"],
      ["16-SKWP", "7353", "210821"],
      ["Grand Total", "13996", "357854"],
    ]);

    const day = screen.getByText("Raw jute issue — day").parentElement as HTMLElement;
    expect(within(day).getByRole("heading")).toHaveTextContent("13,996 kg");
    expect(within(day).getByText("Wastage excluded: 550 kg")).toBeInTheDocument();
    const mtd = screen.getByText("Raw jute issue — month to date").parentElement as HTMLElement;
    expect(within(mtd).getByRole("heading")).toHaveTextContent("3,57,854 kg");
    expect(within(mtd).getByText("Wastage excluded: 12,309 kg")).toBeInTheDocument();
    expect(screen.queryByText("Total jute issue — day")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // ...and back: the six columns and the dropped quality return, still
    // without a request.
    fireEvent.click(screen.getByRole("button", { name: "Incl. wastage" }));
    expect(headers()).toHaveLength(7);
    expect(bodyRows()).toHaveLength(4);
    expect(bodyRows()[2]).toEqual(["WASTE BLEND", "0", "250", "250", "0", "250", "250"]);
    expect(screen.getByRole("heading", { level: 5 })).toHaveTextContent(HEADING_ALL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("works together with the MT switch", async () => {
    render(<Page />);
    await waitFor(() => expect(bodyRows()).toHaveLength(4));

    fireEvent.click(screen.getByRole("button", { name: "Excl. wastage" }));
    fireEvent.click(screen.getByRole("button", { name: "MT" }));

    expect(headers()).toEqual(["Yarn Quality", "Day Raw (MT)", "MTD Raw (MT)"]);
    expect(bodyRows()).toEqual([
      ["13-SKWP", "6.643", "147.033"],
      ["16-SKWP", "7.353", "210.821"],
      ["Grand Total", "13.996", "357.854"],
    ]);
    const day = screen.getByText("Raw jute issue — day").parentElement as HTMLElement;
    expect(within(day).getByText("Wastage excluded: 0.550 MT")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Back to all: six MT columns, parts agreeing with the total at 3 decimals.
    fireEvent.click(screen.getByRole("button", { name: "Incl. wastage" }));
    expect(headers()).toEqual([
      "Yarn Quality",
      "Day Raw (MT)", "Day Waste (MT)", "Day Total (MT)",
      "MTD Raw (MT)", "MTD Waste (MT)", "MTD Total (MT)",
    ]);
    expect(bodyRows()[1]).toEqual(["16-SKWP", "7.353", "0.300", "7.653", "210.821", "7.317", "218.138"]);
    expect(bodyRows()[3]).toEqual(["Grand Total", "13.996", "0.550", "14.546", "357.854", "12.309", "370.163"]);
    for (const r of bodyRows()) {
      expect((Number(r[1]) + Number(r[2])).toFixed(3)).toBe(Number(r[3]).toFixed(3));
      expect((Number(r[4]) + Number(r[5])).toFixed(3)).toBe(Number(r[6]).toFixed(3));
    }
  });

  it("writes the state into the Excel and PDF title and exports the rows on screen", async () => {
    render(<Page />);
    await waitFor(() => expect(bodyRows()).toHaveLength(4));

    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    await waitFor(() => expect(excelMock).toHaveBeenCalledTimes(1));
    let [columns, rows, fileName, header] = excelMock.mock.calls[0];
    expect(header?.reportName).toBe(HEADING_ALL);
    expect(fileName).toBe("jute-issue-yarn-wise-incl-wastage-kg");
    expect(columns.map((c) => c.headerName)).toEqual([
      "Yarn Quality",
      "Day Raw (kg)", "Day Waste (kg)", "Day Total (kg)",
      "MTD Raw (kg)", "MTD Waste (kg)", "MTD Total (kg)",
    ]);
    expect(rows.map((r) => [r.yarn_type_name, r.mtd_raw_kg, r.mtd_waste_kg, r.mtd_total_kg])).toEqual([
      ["13-SKWP", 147033, 4742, 151775],
      ["16-SKWP", 210821, 7317, 218138],
      ["WASTE BLEND", 0, 250, 250],
      ["Grand Total", 357854, 12309, 370163],
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Excl. wastage" }));
    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    await waitFor(() => expect(excelMock).toHaveBeenCalledTimes(2));
    [columns, rows, fileName, header] = excelMock.mock.calls[1];
    expect(header?.reportName).toBe(HEADING_RAW);
    expect(header?.reportFor).toBe("2026-10-04");
    expect(fileName).toBe("jute-issue-yarn-wise-excl-wastage-kg");
    expect(columns.map((c) => c.headerName)).toEqual(["Yarn Quality", "Day Raw (kg)", "MTD Raw (kg)"]);
    expect(rows.map((r) => [r.yarn_type_name, r.mtd_issue_kg])).toEqual([
      ["13-SKWP", 147033],
      ["16-SKWP", 210821],
      ["Grand Total", 357854],
    ]);

    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(pdfMock).toHaveBeenCalledTimes(1));
    const [pdfCols, pdfRows, pdfFile, pdfHeader] = pdfMock.mock.calls[0];
    expect(pdfHeader?.reportName).toBe(HEADING_RAW);
    expect(pdfFile).toBe("jute-issue-yarn-wise-excl-wastage-kg");
    expect(pdfCols).toHaveLength(3);
    expect(pdfRows).toHaveLength(3);
  });

  it("keeps the filter reachable when excluding wastage leaves no quality", async () => {
    fetchMock.mockResolvedValue([WITH_WASTAGE[2]]); // wastage only
    render(<Page />);
    await waitFor(() => expect(bodyRows()).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: "Excl. wastage" }));
    expect(bodyRows()).toEqual([["Grand Total", "0", "0"]]);
    // Both cards (day and month to date) still say what was left out.
    expect(screen.getAllByText("Wastage excluded: 250 kg")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Incl. wastage" }));
    expect(bodyRows()).toEqual([
      ["WASTE BLEND", "0", "250", "250", "0", "250", "250"],
      ["Grand Total", "0", "250", "250", "0", "250", "250"],
    ]);
  });

  it("changes no figure when the day has no wastage (sls br 29, 4 Oct 2026)", async () => {
    fetchMock.mockResolvedValue(SLS_BR29_4_OCT);
    render(<Page />);
    await waitFor(() => expect(bodyRows()).toHaveLength(6));
    const before = bodyRows();

    fireEvent.click(screen.getByRole("button", { name: "Excl. wastage" }));
    // Same figures, now as the two raw-only columns.
    expect(bodyRows().map((r) => [r[0], r[1], r[2]])).toEqual(before.map((r) => [r[0], r[1], r[4]]));
    expect(bodyRows()[5]).toEqual(["Grand Total", "19340", "61674"]);
    const day = screen.getByText("Raw jute issue — day").parentElement as HTMLElement;
    expect(within(day).getByText("Wastage excluded: 0 kg")).toBeInTheDocument();
  });
});
