/**
 * @vitest-environment jsdom
 *
 * TKT-000182 layout rules for the Winding & Weaving Difference report:
 *   1. the mill-use CONSOLIDATED table renders ABOVE the mill-use detail table;
 *   2. the mill-use detail table starts MINIMIZED and expands when pressed;
 *   3. minimizing must NOT unmount the detail rows — they are hidden with CSS
 *      only, because the printed sheet has to keep every counted line whatever
 *      the screen state (print forces the block visible again via displayPrint);
 *   4. only mill use is collapsible and only mill use gets a consolidated table.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("@/components/reports/useReportBranches", () => ({
  useReportBranches: () => ({
    branches: [{ branch_id: 29, branch_name: "FACTORY" }],
    coId: 2,
    companyName: "SLS",
    initialBranchId: 29,
    dateParam: "2026-09-18",
  }),
}));

vi.mock("@/utils/juteProductionReportService", () => ({
  fetchWindingWeavingDifference: vi.fn(),
}));

import { fetchWindingWeavingDifference } from "@/utils/juteProductionReportService";
import Page from "./page";

const RECON = {
  opening_mt: 0.5,
  spinning_mt: 20.138,
  winding_mt: 1.2,
  twisting_mt: 0,
  weaving_mt: 0,
  purchase_mt: 0,
  sale_mt: 0,
  should_be_closing_mt: 1.7,
  actual_closing_mt: 1.581,
  difference_mt: -0.119,
  difference_pct: -9.92,
  jute_issue_mt: 19.274,
};

/** Mill use holds one quality over two lines (1.000 + 0.567); ball holds 0.014
 *  of the SAME quality, which the consolidated table must NOT absorb. */
const DATA = {
  report_date: "2026-09-18",
  date_from: "2026-09-01",
  stock: {
    MILL_USE: {
      rows: [
        {
          bucket: "MILL_USE",
          item_code: null,
          item_name: "13 LBS SKWP",
          quality_name: "SKWP",
          yarn_count: null,
          package_label: "SKG",
          area_name: "Winding Floor",
          no_of_samples: 100,
          wt_per_sample: 10,
          prvs_stock_mt: 0.527,
          stock_mt: 1.0,
        },
        {
          bucket: "MILL_USE",
          item_code: null,
          item_name: "13 LBS SKWP",
          quality_name: "SKWP",
          yarn_count: null,
          package_label: "PW SPOOL",
          area_name: "Besides PW",
          no_of_samples: 567,
          wt_per_sample: 1,
          prvs_stock_mt: 0,
          stock_mt: 0.567,
        },
      ],
      subtotal_mt: 1.567,
    },
    PURCHASE: { rows: [], subtotal_mt: 0 },
    SALE_YARN: { rows: [], subtotal_mt: 0 },
    BALL: {
      rows: [
        {
          bucket: "BALL",
          item_code: null,
          item_name: "13 LBS SKWP",
          quality_name: "SKWP",
          yarn_count: null,
          package_label: "bleach ball",
          area_name: "godown 1B",
          no_of_samples: 14,
          wt_per_sample: 1,
          prvs_stock_mt: 0,
          stock_mt: 0.014,
        },
      ],
      subtotal_mt: 0.014,
    },
    WASTE: { rows: [], subtotal_mt: 0 },
    grand_total_mt: 1.581,
  },
  stock_summary: {
    bucket: "MILL_USE",
    rows: [
      {
        item_id: 335556,
        item_code: null,
        item_name: "13 LBS SKWP",
        quality_name: "SKWP",
        yarn_count: null,
        total_mt: 1.567,
        prvs_stock_mt: 0.527,
        line_count: 2,
      },
    ],
    total_mt: 1.567,
    prvs_total_mt: 0.527,
  },
  production: { day: RECON, mtd: RECON },
  cloth_split: {
    day: { HESSIAN: 0, SACKING: 0, OTHER: 0 },
    mtd: { HESSIAN: 0, SACKING: 0, OTHER: 0 },
  },
  chain: { ok: true, prev_entry_date: "2026-09-17", month_opening_date: "2026-08-31" },
  warnings: {
    purchase_unknown_uoms: [],
    weaving_unresolved_day: 0,
    weaving_unresolved_mtd: 0,
  },
  note: "note",
};

describe("Winding & Weaving Difference — mill-use consolidated block", () => {
  beforeEach(() => {
    vi.mocked(fetchWindingWeavingDifference).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      DATA as any,
    );
  });

  it("puts the consolidated table above the mill-use detail table", async () => {
    const { container } = render(<Page />);
    await waitFor(() =>
      expect(
        screen.getByText(/Yarn for Mill Use — Consolidated Position/),
      ).toBeInTheDocument(),
    );
    const html = container.innerHTML;
    expect(html.indexOf("Consolidated Position")).toBeGreaterThan(-1);
    expect(html.indexOf("Consolidated Position")).toBeLessThan(html.indexOf("Details"));
  });

  it("states the mill-use total, not the grand total", async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByText("Total (Mill Use)")).toBeInTheDocument());
    const row = screen.getByText("Total (Mill Use)").closest("tr");
    expect(row).toHaveTextContent("1.567"); // MILL_USE subtotal
    expect(row).toHaveTextContent("0.527"); // yesterday's mill-use position
    expect(row).not.toHaveTextContent("1.581"); // the grand total must not appear here
  });

  it("keeps every detail row mounted while minimized, so print loses nothing", async () => {
    render(<Page />);
    await waitFor(() =>
      expect(screen.getByText(/tap to show the full table/)).toBeInTheDocument(),
    );
    // Cells that exist ONLY in the collapsed detail table.
    expect(screen.getByText("PW SPOOL")).toBeInTheDocument();
    expect(screen.getByText("Winding Floor")).toBeInTheDocument();
  });

  it("expands and re-minimizes when the header is pressed", async () => {
    render(<Page />);
    await waitFor(() =>
      expect(screen.getByText(/tap to show the full table/)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText(/Yarn for Mill Use — Details/));
    expect(screen.getByText(/tap to minimize/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Yarn for Mill Use — Details/));
    expect(screen.getByText(/tap to show the full table/)).toBeInTheDocument();
  });

  it("shows Spinning Production directly above Winding Production", async () => {
    const { container } = render(<Page />);
    await waitFor(() =>
      expect(screen.getByText("Spinning Production (MT)")).toBeInTheDocument(),
    );
    const row = screen.getByText("Spinning Production (MT)").closest("tr");
    expect(row).toHaveTextContent("20.138"); // day and MTD both from the fixture
    const html = container.innerHTML;
    expect(html.indexOf("Spinning Production")).toBeLessThan(
      html.indexOf("Winding Production"),
    );
    // Context only: it must not disturb the difference row.
    const diff = screen.getByText("Difference (MT)").closest("tr");
    expect(diff).toHaveTextContent("-0.119");
  });

  it("leaves the other blocks plain — no consolidated table, no collapsing", async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByText("Ball Stock")).toBeInTheDocument());
    expect(screen.getByText("bleach ball")).toBeInTheDocument();
    // Exactly one collapsible section on the page.
    expect(screen.queryAllByText(/tap to (show the full table|minimize)/)).toHaveLength(1);
    expect(screen.queryAllByText(/Consolidated Position/)).toHaveLength(1);
  });
});
