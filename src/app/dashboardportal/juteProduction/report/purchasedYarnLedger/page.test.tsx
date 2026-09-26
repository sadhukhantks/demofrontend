/**
 * @vitest-environment jsdom
 *
 * Purchased Yarn Ledger page: exceptions ordered by severity, meta line,
 * one row per item with a totals line, department breakdown mounted but
 * hidden until expanded (print keeps it), red difference only where the
 * backend flagged GODOWN_DIFF. The service is mocked — the backend is built
 * in parallel against the same contract.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom";

const BRANCHES = [
  { branch_id: 29, branch_name: "FACTORY" },
  { branch_id: 30, branch_name: "GODOWN 2" },
];

/** Mutable so a test can vary the sidebar/hub context (vi.mock is hoisted). */
const hookState = vi.hoisted(() => ({
  value: {
    branches: [] as { branch_id: number; branch_name: string }[],
    coId: 2 as number | null,
    companyName: "SLS" as string | null,
    initialBranchId: 29 as number | null,
    dateParam: "2026-09-18" as string | null,
  },
}));

vi.mock("@/components/reports/useReportBranches", () => ({
  useReportBranches: () => hookState.value,
}));

vi.mock("./_service", () => ({
  fetchPurchasedYarnLedger: vi.fn(),
}));

import { fetchPurchasedYarnLedger, type PurchasedYarnLedger } from "./_service";
import Page from "./page";

const DATA: PurchasedYarnLedger = {
  month: "2026-09",
  from_date: "2026-09-01",
  to_date: "2026-09-30",
  meta: {
    godown_opening_count_date: "2026-08-31",
    godown_closing_count_date: "2026-09-30",
    floor_count_dates: { "4": "2026-09-30", "6": "2026-09-29" },
    opening_basis: "count",
    days_in_window: 30,
  },
  rows: [
    {
      item_id: 335556,
      item_name: "13 LBS SKWP",
      item_code: "Y13",
      yarn_count: 13,
      godown_opening_kg: 1000,
      purchases_kg: 2500,
      issues_kg: 1800,
      returns_kg: 100,
      godown_book_closing_kg: 1800,
      godown_count_closing_kg: 1780,
      godown_diff_kg: -20,
      floor_opening_kg: 200,
      floor_closing_kg: 300,
      consumption_kg: 1600,
      days_of_stock: 5.6,
      depts: [
        {
          dept_id: 4,
          dept_desc: "Weaving",
          floor_opening_kg: 150,
          issues_kg: 1500,
          returns_kg: 100,
          floor_closing_kg: 250,
          consumption_kg: 1300,
        },
        {
          dept_id: 6,
          dept_desc: "Beaming",
          floor_opening_kg: 50,
          issues_kg: 300,
          returns_kg: 0,
          floor_closing_kg: 50,
          consumption_kg: 300,
        },
      ],
    },
    {
      // Counted 30 kg short but NOT flagged: within the backend's tolerance.
      item_id: 335557,
      item_name: "8 LBS HESSIAN",
      item_code: null,
      yarn_count: 8,
      godown_opening_kg: 0,
      purchases_kg: 400,
      issues_kg: 360,
      returns_kg: 0,
      godown_book_closing_kg: 40,
      godown_count_closing_kg: 10,
      godown_diff_kg: -30,
      floor_opening_kg: 0,
      floor_closing_kg: 50,
      consumption_kg: 310,
      days_of_stock: 4.8,
      depts: [],
    },
  ],
  totals: {
    godown_opening_kg: 1000,
    purchases_kg: 2900,
    issues_kg: 2160,
    returns_kg: 100,
    godown_book_closing_kg: 1840,
    godown_count_closing_kg: 1790,
    godown_diff_kg: -50,
    floor_opening_kg: 200,
    floor_closing_kg: 350,
    consumption_kg: 1910,
    days_of_stock: 5.5,
  },
  exceptions: [
    { code: "FLOOR_DAYS_OVER", message: "Weaving floor holds 12.0 days of 13 LBS SKWP.", dept_id: 4 },
    { code: "DEPT_NO_FLOOR_COUNT", message: "Spinning had issues but no floor count.", dept_id: 9 },
    { code: "GODOWN_DIFF", message: "13 LBS SKWP counted 20.000 kg below book.", item_id: 335556, value: -20 },
  ],
};

/** Opens the branch dropdown the way a click on the field does. */
function openBranchPicker(): HTMLElement {
  const input = screen.getByRole("combobox", { name: /branch/i });
  fireEvent.mouseDown(input);
  fireEvent.focus(input);
  return input;
}

describe("Purchased Yarn Ledger page", () => {
  beforeEach(() => {
    hookState.value = {
      branches: BRANCHES,
      coId: 2,
      companyName: "SLS",
      initialBranchId: 29,
      dateParam: "2026-09-18",
    };
    vi.mocked(fetchPurchasedYarnLedger).mockReset();
    vi.mocked(fetchPurchasedYarnLedger).mockResolvedValue(DATA);
  });

  it("loads once for the seeded branch and the hub's month", async () => {
    render(<Page />);
    await waitFor(() => expect(fetchPurchasedYarnLedger).toHaveBeenCalledTimes(1));
    expect(fetchPurchasedYarnLedger).toHaveBeenCalledWith({ coId: 2, branchId: 29, month: "2026-09" });
    await waitFor(() =>
      expect(screen.getByText(/Purchased yarn — September 2026/)).toBeInTheDocument(),
    );
  });

  it("orders the exceptions red, amber, blue — one alert each", async () => {
    render(<Page />);
    const strip = await screen.findByTestId("ledger-exceptions");
    const alerts = within(strip).getAllByRole("alert");
    expect(alerts).toHaveLength(3);
    expect(alerts[0]).toHaveClass("MuiAlert-colorError");
    expect(alerts[0]).toHaveTextContent("Godown count differs from book");
    expect(alerts[1]).toHaveClass("MuiAlert-colorWarning");
    expect(alerts[1]).toHaveTextContent("no floor count");
    expect(alerts[2]).toHaveClass("MuiAlert-colorInfo");
    expect(alerts[2]).toHaveTextContent("12.0 days");
  });

  it("states the opening basis, closing count and per-department floor count dates", async () => {
    render(<Page />);
    await waitFor(() =>
      expect(screen.getByText(/physical count on 2026-08-31/)).toBeInTheDocument(),
    );
    // The label is a <strong> inside the paragraph; assert on the paragraph.
    expect(screen.getByText(/Godown closing count:/).closest("p")).toHaveTextContent("2026-09-30");
    expect(screen.getByText(/Floor counts:/).closest("p")).toHaveTextContent(
      "Beaming 2026-09-29 · Weaving 2026-09-30",
    );
  });

  it("renders one row per item plus totals, all kg at 3 dp", async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByText("13 LBS SKWP")).toBeInTheDocument());
    const first = screen.getByText("13 LBS SKWP").closest("tr");
    expect(first).toHaveTextContent("1,000.000");
    expect(first).toHaveTextContent("2,500.000");
    expect(first).toHaveTextContent("-20.000");
    expect(first).toHaveTextContent("5.6");
    const total = screen.getByText("Total").closest("tr");
    expect(total).toHaveTextContent("2,900.000");
    expect(total).toHaveTextContent("1,790.000");
    expect(total).toHaveTextContent("-50.000");
  });

  it("colours the difference red only on items the backend flagged GODOWN_DIFF", async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByText("13 LBS SKWP")).toBeInTheDocument());
    const bad = screen.getByText("13 LBS SKWP").closest("tr")?.querySelector("[data-diff-bad]");
    expect(bad).not.toBeNull();
    expect(bad).toHaveTextContent("-20.000");
    // A larger shortfall the backend did NOT flag stays plain: the page has no
    // tolerance of its own, so a red cell always has an exception in the strip.
    const ok = screen.getByText("8 LBS HESSIAN").closest("tr")?.querySelector("[data-diff-bad]");
    expect(ok).toBeNull();
    expect(screen.getByText("Total").closest("tr")?.querySelector("[data-diff-bad]")).toBeNull();
  });

  it("drops the loaded figures when the branch changes, until Submit reloads them", async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByText("13 LBS SKWP")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /print/i })).toBeEnabled();
    openBranchPicker();
    fireEvent.click(await screen.findByText("GODOWN 2"));
    // Old branch's figures must not stay on screen (or print) under the new name.
    expect(screen.queryByText("13 LBS SKWP")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /print/i })).toBeDisabled();
    expect(screen.getByText(/press Submit to build the ledger/)).toBeInTheDocument();
    expect(fetchPurchasedYarnLedger).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(fetchPurchasedYarnLedger).toHaveBeenCalledTimes(2));
    expect(fetchPurchasedYarnLedger).toHaveBeenLastCalledWith({ coId: 2, branchId: 30, month: "2026-09" });
    await waitFor(() => expect(screen.getByText("13 LBS SKWP")).toBeInTheDocument());
  });

  it("does not auto-load a hub branch that is not one of the company's branches", async () => {
    // After a sidebar company switch the hub URL still names the old company's
    // branch; the backend rejects that pairing, so the page must wait for a pick.
    hookState.value = { ...hookState.value, initialBranchId: 99 };
    render(<Page />);
    await waitFor(() =>
      expect(screen.getByText(/press Submit to build the ledger/)).toBeInTheDocument(),
    );
    expect(fetchPurchasedYarnLedger).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
  });

  it("keeps the department breakdown mounted while collapsed and expands on request", async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByText("13 LBS SKWP")).toBeInTheDocument());
    // Mounted (print keeps it) but hidden on screen.
    const detail = screen.getByTestId("dept-breakdown-335556");
    expect(within(detail).getByText("Weaving")).toBeInTheDocument();
    expect(within(detail).getByText("Beaming")).toBeInTheDocument();
    expect(detail).toHaveStyle({ display: "none" });
    fireEvent.click(screen.getByLabelText("Show departments"));
    expect(detail).not.toHaveStyle({ display: "none" });
    expect(screen.getByLabelText("Hide departments")).toBeInTheDocument();
    // An item with no department movement gets no toggle and no breakdown.
    expect(screen.queryByTestId("dept-breakdown-335557")).toBeNull();
    expect(screen.getAllByLabelText(/departments$/)).toHaveLength(1);
  });

  it("shows the branch picker because more than one branch is in scope", async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByLabelText("Branch")).toBeInTheDocument());
    expect(screen.getByLabelText("Month")).toHaveValue("2026-09");
  });
});
