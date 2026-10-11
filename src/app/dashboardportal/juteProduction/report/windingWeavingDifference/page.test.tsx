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

vi.mock("@/components/reports/tablesPdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/reports/tablesPdf")>()),
  downloadTablesPdf: vi.fn().mockResolvedValue(undefined),
}));

import {
  fetchWindingWeavingDifference,
  type WindingWeavingDifference,
  type WwdPurchaseDetailRow,
  type WwdReconciliation,
} from "@/utils/juteProductionReportService";
import { downloadTablesPdf } from "@/components/reports/tablesPdf";
import Page from "./page";

const RECON: WwdReconciliation = {
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
const DATA: WindingWeavingDifference = {
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
    vi.mocked(fetchWindingWeavingDifference).mockResolvedValue(DATA);
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

/** Purchased-yarn additions (yarn purchase / issue / consumption feature):
 *  the Yarn Purchase documents behind Purchase Yarn (MTD) and the legacy
 *  Stores-receipt transition warning. */
const PURCHASE_LINES: WwdPurchaseDetailRow[] = [
  {
    yarn_purchase_id: 11,
    purchase_no: "YP/26-27/0007",
    tran_date: "2026-09-03",
    item_id: 335556,
    item_name: "13 LBS SKWP",
    yarn_count: 13,
    kg: 1250,
  },
  {
    yarn_purchase_id: 12,
    purchase_no: "YP/26-27/0009",
    tran_date: "2026-09-11",
    item_id: 335557,
    item_name: "8 LBS HESSIAN",
    yarn_count: 8,
    kg: 3401,
  },
];

const PURCHASE_DATA: WindingWeavingDifference = {
  ...DATA,
  production: {
    day: { ...RECON, purchase_mt: 1.25 },
    mtd: { ...RECON, purchase_mt: 4.651 },
  },
  purchase_detail: PURCHASE_LINES,
  warnings: {
    ...DATA.warnings,
    legacy_stores_yarn_mt: 0.42,
    legacy_stores_yarn_warning:
      "Stores receipts of the legacy purchased-yarn item exist this month but no Yarn Purchase document does.",
  },
};

describe("Winding & Weaving Difference — purchase documents and legacy warning", () => {
  beforeEach(() => {
    vi.mocked(fetchWindingWeavingDifference).mockResolvedValue(PURCHASE_DATA);
  });

  it("lists the documents under the production block, minimized, with an MT total equal to Purchase Yarn (MTD)", async () => {
    const { container } = render(<Page />);
    await waitFor(() =>
      expect(screen.getByText("Purchase yarn (documents)")).toBeInTheDocument(),
    );
    const html = container.innerHTML;
    expect(html.indexOf("Production Reconciliation")).toBeLessThan(
      html.indexOf("Purchase yarn (documents)"),
    );
    expect(html.indexOf("Purchase yarn (documents)")).toBeLessThan(
      html.indexOf("Weaving Cloth Split"),
    );
    // Minimized but mounted — print must keep every document line.
    expect(screen.getByText(/tap to show the documents/)).toBeInTheDocument();
    expect(screen.getByText("YP/26-27/0007")).toBeInTheDocument();
    expect(screen.getByText("YP/26-27/0009")).toBeInTheDocument();
    // 1250 + 3401 kg = 4.651 MT = mtd.purchase_mt, and no mismatch note.
    expect(screen.getByText("Total (4.651 MT)")).toBeInTheDocument();
    expect(screen.queryByText(/were not built from the same/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Purchase yarn (documents)"));
    expect(screen.getByText(/tap to minimize/)).toBeInTheDocument();
  });

  it("calls out a documents total that disagrees with Purchase Yarn (MTD)", async () => {
    vi.mocked(fetchWindingWeavingDifference).mockResolvedValue({
      ...PURCHASE_DATA,
      production: { day: RECON, mtd: { ...RECON, purchase_mt: 3.4 } },
    });
    render(<Page />);
    await waitFor(() =>
      expect(screen.getByText(/were not built from the same/)).toBeInTheDocument(),
    );
    // The block starts minimized, so the header caption must carry it too.
    expect(screen.getByText(/does not match Purchase Yarn \(MTD\)/)).toBeInTheDocument();
  });

  it("does not flag a kg total the backend rounds half-even (4062.5 kg -> 4.062)", async () => {
    vi.mocked(fetchWindingWeavingDifference).mockResolvedValue({
      ...PURCHASE_DATA,
      production: { day: RECON, mtd: { ...RECON, purchase_mt: 4.062 } },
      purchase_detail: [
        { ...PURCHASE_LINES[0], kg: 4000 },
        { ...PURCHASE_LINES[1], kg: 62.5 },
      ],
    });
    render(<Page />);
    await waitFor(() =>
      expect(screen.getByText("Purchase yarn (documents)")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/were not built from the same/)).not.toBeInTheDocument();
    expect(screen.queryByText(/does not match Purchase Yarn/)).not.toBeInTheDocument();
  });

  it("shows the legacy Stores warning as an amber alert carrying the MT figure", async () => {
    render(<Page />);
    await waitFor(() =>
      expect(screen.getByText(/legacy purchased-yarn item exist/)).toBeInTheDocument(),
    );
    const alert = screen.getByText(/legacy purchased-yarn item exist/).closest(".MuiAlert-root");
    expect(alert).toHaveClass("MuiAlert-colorWarning");
    expect(alert).toHaveTextContent("0.420 MT");
  });

  it("renders neither block on a backend without the new keys", async () => {
    vi.mocked(fetchWindingWeavingDifference).mockResolvedValue(DATA);
    render(<Page />);
    await waitFor(() => expect(screen.getByText("Ball Stock")).toBeInTheDocument());
    expect(screen.queryByText("Purchase yarn (documents)")).not.toBeInTheDocument();
    expect(screen.queryByText(/legacy purchased-yarn item/)).not.toBeInTheDocument();
  });
});

describe("Winding & Weaving Difference — Download PDF", () => {
  beforeEach(() => {
    vi.mocked(fetchWindingWeavingDifference).mockResolvedValue(DATA);
    vi.mocked(downloadTablesPdf).mockClear();
  });

  it("downloads the loaded sheet with the company / branch letterhead", async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByText("Ball Stock")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Download PDF/ }));
    await waitFor(() => expect(downloadTablesPdf).toHaveBeenCalledTimes(1));
    const spec = vi.mocked(downloadTablesPdf).mock.calls[0][0];
    expect(spec.companyName).toBe("SLS");
    expect(spec.subtitleLines?.[0]).toContain("Branch: FACTORY");
    expect(spec.sections.map((s) => s.title)).toContain("Yarn for Mill Use — Details");
  });
});
