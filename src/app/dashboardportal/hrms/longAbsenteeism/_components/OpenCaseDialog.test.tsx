/**
 * @vitest-environment jsdom
 *
 * Open case dialog, "Detected on" (owner 2026-10-12, back-dated entries): it
 * defaults to today (sent as null = the server's today), a case entered late
 * sends the real detection day, and a day before the last working date or in
 * the future is stopped before the call. The service is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("@/utils/longAbsenteeismService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/longAbsenteeismService")>();
  return { ...actual, openLaCase: vi.fn() };
});
vi.mock("@/components/lowPerformerFollowup/workerLookup", () => ({ lookupWorkerByEbNo: vi.fn() }));

import { openLaCase, type LaCandidate, type LaCase } from "@/utils/longAbsenteeismService";
import OpenCaseDialog from "./OpenCaseDialog";

const CANDIDATE: LaCandidate = {
  eb_id: 7001,
  emp_code: "1234",
  emp_name: "RAM KUMAR",
  dept_id: 4,
  dept_desc: "WEAVING",
  sub_dept_desc: null,
  designation: "WEAVER",
  category: null,
  last_seen: "2026-09-20",
  absent_days: 21,
  closed_cases: 0,
  pending_leave_since: null,
  leave_transaction_id: null,
  leave_type_id: null,
  leave_type_name: null,
  leave_from: null,
  leave_to: null,
};

const onOpened = vi.fn();
const renderDialog = () =>
  render(
    <OpenCaseDialog
      open
      coId={9}
      branchId={12}
      candidate={CANDIDATE}
      today="2026-10-11"
      onClose={vi.fn()}
      onOpened={onOpened}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(openLaCase).mockResolvedValue({ case_id: 41 } as LaCase);
});

describe("OpenCaseDialog — Detected on", () => {
  it("defaults to today and sends null (the server's default)", async () => {
    renderDialog();
    expect(screen.getByLabelText("Detected on")).toHaveValue("2026-10-11");
    fireEvent.click(screen.getByRole("button", { name: "Open case" }));
    await waitFor(() =>
      expect(openLaCase).toHaveBeenCalledWith({
        co_id: 9,
        branch_id: 12,
        eb_id: 7001,
        last_working_date: "2026-09-20",
        detected_date: null,
        remarks: null,
      }),
    );
    expect(onOpened).toHaveBeenCalled();
  });

  it("sends the real detection day of a case entered late", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("Detected on"), { target: { value: "2026-09-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Open case" }));
    await waitFor(() => expect(openLaCase).toHaveBeenCalledWith(expect.objectContaining({ detected_date: "2026-09-30" })));
  });

  it("stops a day before the last working date or in the future", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("Detected on"), { target: { value: "2026-09-19" } });
    fireEvent.click(screen.getByRole("button", { name: "Open case" }));
    expect(
      await screen.findByText("Detected on cannot be before the last working date (20-09-2026)"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Detected on"), { target: { value: "2026-10-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Open case" }));
    expect(await screen.findByText("Detected on cannot be in the future")).toBeInTheDocument();
    expect(openLaCase).not.toHaveBeenCalled();
  });
});
