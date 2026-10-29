import { describe, expect, it } from "vitest";
import { fmtShort, monthsBetween } from "./ModuleDashboard";

describe("ModuleDashboard helpers", () => {
  it("fills every month across a year boundary", () => {
    expect(monthsBetween("2025-11-01", "2026-02-28")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthsBetween("2026-03-15", "2026-03-20")).toEqual(["2026-03"]);
  });

  it("formats on the Indian short scale", () => {
    expect(fmtShort(225326385.07, "₹")).toBe("₹ 22.53 Cr");
    expect(fmtShort(430000, "kg")).toBe("4.3 L kg");
    expect(fmtShort(12500, null)).toBe("12,500");
  });
});
