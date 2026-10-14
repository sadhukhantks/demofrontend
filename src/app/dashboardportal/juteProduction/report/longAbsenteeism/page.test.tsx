/**
 * @vitest-environment jsdom
 *
 * Old address of Long Absenteeism (moved to HRMS, owner 2026-10-12): the page
 * only sends the browser to /dashboardportal/hrms/longAbsenteeism, keeping the
 * query string.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));

import LongAbsenteeismMovedPage from "./page";

describe("old Long Absenteeism address", () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it("redirects to the HRMS page with the query string", async () => {
    search = "case_id=12&branch_id=2&tab=dispatch";
    render(<LongAbsenteeismMovedPage />);
    expect(screen.getByText(/moved to HRMS/)).toBeInTheDocument();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/dashboardportal/hrms/longAbsenteeism?case_id=12&branch_id=2&tab=dispatch"),
    );
  });

  it("redirects without a query string", async () => {
    search = "";
    render(<LongAbsenteeismMovedPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboardportal/hrms/longAbsenteeism"));
  });
});
