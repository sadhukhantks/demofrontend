/**
 * @vitest-environment jsdom
 *
 * Dispatch tab (phone layout, so the rows render as cards in jsdom): loads
 * the last 30 days, groups the cards by batch, "Record dispatch" saves the
 * sent date / A.D. no through the shared dialog and updates the card, "Print
 * register" prints one section per batch, and a bad range is stopped before
 * the call. The service and the print window are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboardportal/juteProduction/report/longAbsenteeism",
}));
vi.mock("@/components/dashboard/sidebarContext", () => ({
  useSidebarContext: () => ({ selectedCompany: { co_id: 9, co_name: "EMPIRE JUTE" } }),
}));
vi.mock("@/utils/reportMenuService", () => ({ resolveReportMenuId: vi.fn(async () => 77) }));
vi.mock("@/components/reports/printReport", () => ({ printReportSections: vi.fn(() => true) }));
vi.mock("../../_hooks/useIsMobile", () => ({ useIsMobile: () => true }));
vi.mock("@/utils/longAbsenteeismService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/longAbsenteeismService")>();
  return { ...actual, fetchLaDispatch: vi.fn(), updateLaLetter: vi.fn() };
});

import { printReportSections } from "@/components/reports/printReport";
import {
  fetchLaDispatch,
  updateLaLetter,
  type LaDispatchRow,
  type LaSetup,
} from "@/utils/longAbsenteeismService";
import DispatchTab from "./DispatchTab";

const SETUP = {
  stages: [
    { code: "WARNING_1", label: "1st warning", order: 2 },
    { code: "WARNING_2", label: "2nd warning", order: 3 },
  ],
  letter_stages: ["WARNING_1", "WARNING_2"],
  dispatch_modes: [{ code: "REG_POST_AD", label: "Registered post with AD" }],
  delivery_statuses: [{ code: "DELIVERED", label: "Delivered" }],
  today: "2026-10-11",
} as unknown as LaSetup;

const letter = (v: Partial<LaDispatchRow>): LaDispatchRow =>
  ({
    letter_id: 301,
    case_id: 41,
    case_no: "LA/12/26/0001",
    emp_code: "1234",
    emp_name: "RAM KUMAR",
    dept_desc: "WEAVING",
    address: "Vill. X",
    stage_code: "WARNING_1",
    stage_label: "1st warning",
    letter_no: 1,
    issue_date: "2026-10-10",
    sent_date: null,
    dispatch_mode: "REG_POST_AD",
    dispatch_mode_label: "Registered post with AD",
    ad_no: null,
    delivery_status: null,
    delivery_status_label: null,
    delivery_date: null,
    gate_display_date: null,
    dept_display_date: null,
    batch_ref: "B20261010-1030-5",
    body: "",
    subject: null,
    receipts: [],
    attachments: {},
    ...v,
  }) as LaDispatchRow;

const onNotify = vi.fn();
const onOpenCase = vi.fn();
const renderTab = () =>
  render(
    <DispatchTab
      coId={9}
      branchId={12}
      branches={[{ branch_id: 12, branch_name: "FACTORY" }]}
      setup={SETUP}
      canEdit
      onNotify={onNotify}
      onOpenCase={onOpenCase}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchLaDispatch).mockResolvedValue([
    letter({}),
    letter({ letter_id: 302, case_id: 42, emp_code: "5555", emp_name: "SITA DEVI", batch_ref: null }),
  ]);
});

describe("DispatchTab", () => {
  it("loads the last 30 days and groups the letters by batch", async () => {
    renderTab();
    expect(await screen.findByText("RAM KUMAR")).toBeInTheDocument();
    expect(fetchLaDispatch).toHaveBeenCalledWith({
      coId: 9,
      branchId: 12,
      dateFrom: "2026-09-11",
      dateTo: "2026-10-11",
      batchRef: null,
      stageCode: null,
    });
    expect(screen.getByText("Batch B20261010-1030-5 · 1")).toBeInTheDocument();
    expect(screen.getByText("Issued one by one · 1")).toBeInTheDocument();
    expect(screen.getByText(/2 letters issued .* 2 without a sent date/)).toBeInTheDocument();
  });

  it("records the dispatch and updates the card", async () => {
    vi.mocked(updateLaLetter).mockResolvedValue({
      letter: letter({ sent_date: "2026-10-11", ad_no: "RA123" }),
      case: null,
    });
    renderTab();
    await screen.findByText("RAM KUMAR");
    fireEvent.click(screen.getAllByRole("button", { name: /Record dispatch/ })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Sent date")).toHaveValue("2026-10-11");
    fireEvent.change(within(dialog).getByLabelText("A.D. / registered post no"), { target: { value: "RA123" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateLaLetter).toHaveBeenCalledWith({
        co_id: 9,
        letter_id: 301,
        sent_date: "2026-10-11",
        ad_no: "RA123",
      }),
    );
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith(expect.stringMatching(/Dispatch saved/), "success"));
    expect(screen.getByText("RA123")).toBeInTheDocument();
    expect(screen.getByText(/1 without a sent date/)).toBeInTheDocument();
  });

  it("prints the register one section per batch", async () => {
    renderTab();
    await screen.findByText("RAM KUMAR");
    fireEvent.click(screen.getByRole("button", { name: /Print register/ }));
    expect(printReportSections).toHaveBeenCalledTimes(1);
    const [opts, sections] = vi.mocked(printReportSections).mock.calls[0];
    expect(opts.headerLines).toEqual(expect.arrayContaining(["EMPIRE JUTE", "FACTORY (Branch)"]));
    expect(sections.map((s) => s.title)).toEqual(["Batch B20261010-1030-5", "Issued one by one"]);
    expect(sections[0].rows[0]).toEqual([1, "B20261010-1030-5", "1234", "RAM KUMAR", "Vill. X", "1st warning", "10-10-2026", ""]);
  });

  it("stops a reversed range before the call", async () => {
    renderTab();
    await screen.findByText("RAM KUMAR");
    fireEvent.change(screen.getByLabelText("Issued from"), { target: { value: "2026-10-20" } });
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    expect(await screen.findByText("From date cannot be after the to date")).toBeInTheDocument();
    expect(fetchLaDispatch).toHaveBeenCalledTimes(1);
  });

  it("opens the case from a card", async () => {
    renderTab();
    await screen.findByText("SITA DEVI");
    fireEvent.click(screen.getAllByRole("button", { name: "Open case" })[1]);
    expect(onOpenCase).toHaveBeenCalledWith(42, 12);
  });
});
