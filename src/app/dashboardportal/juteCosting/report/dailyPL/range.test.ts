import { describe, expect, it } from "vitest";
import { DEFAULT_RANGE_DAYS, matchingPreset, PRESET_DAYS, RANGE_CAP_DAYS, rangeError, windowEndingOn } from "./range";

describe("rangeError", () => {
  it("caps at 62 days: 62 accepted, 63 rejected", () => {
    expect(RANGE_CAP_DAYS).toBe(62);
    expect(rangeError("2026-07-01", "2026-07-14")).toBeNull();
    expect(rangeError("2026-07-01", "2026-08-31")).toBeNull(); // 62 days
    expect(rangeError("2026-07-01", "2026-09-01")).toMatch(/capped at 62/); // 63 days
    expect(rangeError("2026-07-01", "2026-09-01")).toMatch(/asked for 63/);
  });

  it("rejects missing and reversed ranges", () => {
    expect(rangeError("", "2026-10-14")).toMatch(/both dates/);
    expect(rangeError("2026-10-14", "2026-10-01")).toMatch(/on or before/);
  });
});

describe("windowEndingOn", () => {
  it("counts the To date as day one", () => {
    expect(windowEndingOn("2026-10-07", 14)).toEqual({ from: "2026-09-24", to: "2026-10-07" });
    expect(windowEndingOn("2026-10-07", 1)).toEqual({ from: "2026-10-07", to: "2026-10-07" });
    expect(windowEndingOn("2026-07-14", DEFAULT_RANGE_DAYS)).toEqual({ from: "2026-07-01", to: "2026-07-14" });
  });

  it("crosses a month and a year boundary", () => {
    expect(windowEndingOn("2026-03-02", 7).from).toBe("2026-02-24");
    expect(windowEndingOn("2026-01-03", 7).from).toBe("2025-12-28");
  });

  it("passes an unparseable date through", () => {
    expect(windowEndingOn("", 7)).toEqual({ from: "", to: "" });
  });
});

describe("presets", () => {
  it("are 7 / 14 / 30 days and matchingPreset names the one the range equals", () => {
    expect([...PRESET_DAYS]).toEqual([7, 14, 30]);
    expect(matchingPreset("2026-10-01", "2026-10-07")).toBe(7);
    expect(matchingPreset("2026-09-24", "2026-10-07")).toBe(14);
    expect(matchingPreset("2026-09-08", "2026-10-07")).toBe(30);
    expect(matchingPreset("2026-09-09", "2026-10-07")).toBeNull();
  });
});
