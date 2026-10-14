/**
 * @vitest-environment jsdom
 *
 * Department summary strip: title with view + total, an "All" chip and one
 * chip per department ("WEAVING 14"), the selected department highlighted,
 * clicks reported (the selected chip again clears), the "No department" chip
 * filters on the local sentinel, and nothing renders without rows.
 */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import DeptSummary from "./DeptSummary";
import { NO_DEPT_FILTER, type DeptCount } from "../_utils";

const ITEMS: DeptCount[] = [
  { dept_id: 4, dept_desc: "WEAVING", count: 14 },
  { dept_id: 7, dept_desc: "SPINNING", count: 5 },
  { dept_id: null, dept_desc: "No department", count: 2 },
];

const renderStrip = (selectedDeptId: number | null = null, onSelectDept = vi.fn()) => {
  render(<DeptSummary items={ITEMS} total={21} selectedDeptId={selectedDeptId} onSelectDept={onSelectDept} viewLabel="Due today" />);
  return onSelectDept;
};

describe("DeptSummary", () => {
  it("shows the title and a chip per department with its count", () => {
    renderStrip();
    expect(screen.getByText("By department · Due today · 21")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All 21" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "WEAVING 14" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SPINNING 5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No department 2" })).toBeInTheDocument();
  });

  it("highlights All when no department is selected", () => {
    renderStrip(null);
    expect(screen.getByRole("button", { name: "All 21" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All 21" })).toHaveClass("MuiChip-colorPrimary");
    expect(screen.getByRole("button", { name: "WEAVING 14" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "WEAVING 14" })).not.toHaveClass("MuiChip-colorPrimary");
  });

  it("highlights the selected department", () => {
    renderStrip(7);
    expect(screen.getByRole("button", { name: "SPINNING 5" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "SPINNING 5" })).toHaveClass("MuiChip-colorPrimary");
    expect(screen.getByRole("button", { name: "WEAVING 14" })).not.toHaveClass("MuiChip-colorPrimary");
    expect(screen.getByRole("button", { name: "All 21" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "All 21" })).not.toHaveClass("MuiChip-colorPrimary");
  });

  it("reports the clicked department, All clears, and the selected one again clears", () => {
    const onSelect = renderStrip(null);
    fireEvent.click(screen.getByRole("button", { name: "WEAVING 14" }));
    expect(onSelect).toHaveBeenLastCalledWith(4);
    fireEvent.click(screen.getByRole("button", { name: "All 21" }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("the No department chip selects the local sentinel and is highlighted when it is the filter", () => {
    const onSelect = renderStrip(null);
    fireEvent.click(screen.getByRole("button", { name: "No department 2" }));
    expect(onSelect).toHaveBeenLastCalledWith(NO_DEPT_FILTER);
    cleanup();
    const again = renderStrip(NO_DEPT_FILTER);
    const chip = screen.getByRole("button", { name: "No department 2" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip).toHaveClass("MuiChip-colorPrimary");
    // Every department stays listed while one is selected.
    expect(screen.getByRole("button", { name: "WEAVING 14" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SPINNING 5" })).toBeInTheDocument();
    fireEvent.click(chip);
    expect(again).toHaveBeenLastCalledWith(null);
  });

  it("clicking the selected department clears the filter", () => {
    const onSelect = renderStrip(4);
    fireEvent.click(screen.getByRole("button", { name: "WEAVING 14" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("renders nothing without rows", () => {
    const { container } = render(
      <DeptSummary items={[]} total={0} selectedDeptId={null} onSelectDept={vi.fn()} viewLabel="Open" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
