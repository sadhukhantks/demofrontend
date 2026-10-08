import { describe, expect, it } from "vitest";
import { matchingPreset, RANGE_CAP_DAYS, rangeError, windowEndingOn } from "./range";

describe("rangeError", () => {
  it("accepts a range up to the cap", () => {
    expect(rangeError("2026-10-01", "2026-10-14")).toBeNull();
    expect(rangeError("2026-07-07", "2026-10-07")).toBeNull(); // 93 days
  });

  it("rejects missing, reversed and oversized ranges", () => {
    expect(rangeError("", "2026-10-14")).toMatch(/both dates/);
    expect(rangeError("2026-10-14", "2026-10-01")).toMatch(/on or before/);
    expect(rangeError("2026-07-06", "2026-10-07")).toMatch(new RegExp(`capped at ${RANGE_CAP_DAYS}`));
  });
});

describe("windowEndingOn", () => {
  it("counts the To date as day one", () => {
    expect(windowEndingOn("2026-10-07", 14)).toEqual({ from: "2026-09-24", to: "2026-10-07" });
    expect(windowEndingOn("2026-10-07", 1)).toEqual({ from: "2026-10-07", to: "2026-10-07" });
  });

  it("crosses a month and a year boundary", () => {
    expect(windowEndingOn("2026-03-02", 7).from).toBe("2026-02-24");
    expect(windowEndingOn("2026-01-03", 7).from).toBe("2025-12-28");
  });

  it("passes an unparseable date through", () => {
    expect(windowEndingOn("", 7)).toEqual({ from: "", to: "" });
  });
});

describe("matchingPreset", () => {
  it("names the preset the range equals, else null", () => {
    expect(matchingPreset("2026-10-01", "2026-10-07")).toBe(7);
    expect(matchingPreset("2026-09-24", "2026-10-07")).toBe(14);
    expect(matchingPreset("2026-09-08", "2026-10-07")).toBe(30);
    expect(matchingPreset("2026-09-09", "2026-10-07")).toBeNull();
  });
});
