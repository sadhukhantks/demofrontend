import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import MobileTopBar from "./MobileTopBar";

const logoutMock = vi.fn();
vi.mock("@/utils/auth", () => ({ logout: () => logoutMock() }));

describe("MobileTopBar", () => {
  beforeEach(() => {
    logoutMock.mockReset();
  });

  it("toggles the drawer from the hamburger", () => {
    const onMenuToggle = vi.fn();
    render(<MobileTopBar onMenuToggle={onMenuToggle} />);
    fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
    expect(onMenuToggle).toHaveBeenCalledTimes(1);
  });

  it("logs out after confirmation without opening the drawer", () => {
    const onMenuToggle = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MobileTopBar onMenuToggle={onMenuToggle} />);
    fireEvent.click(screen.getByRole("button", { name: /logout/i }));
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(onMenuToggle).not.toHaveBeenCalled();
  });

  it("does nothing when the confirmation is dismissed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<MobileTopBar onMenuToggle={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /logout/i }));
    expect(logoutMock).not.toHaveBeenCalled();
  });
});
