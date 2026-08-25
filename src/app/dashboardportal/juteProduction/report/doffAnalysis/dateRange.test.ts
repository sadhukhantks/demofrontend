import { describe, expect, it } from "vitest";
import { RANGE_CAP_DAYS, rangeError } from "./dateRange";

describe("rangeError", () => {
  it("accepts a normal range", () => {
    expect(rangeError("2026-08-01", "2026-08-07")).toBeNull();
  });

  it("accepts exactly the cap (inclusive of both ends)", () => {
    expect(rangeError("2026-08-01", "2026-08-31")).toBeNull();
    expect(RANGE_CAP_DAYS).toBe(31);
  });

  it("rejects one day past the cap", () => {
    expect(rangeError("2026-08-01", "2026-09-01")).toMatch(/capped at 31 days/);
  });

  it("rejects a reversed range", () => {
    expect(rangeError("2026-08-07", "2026-08-01")).toMatch(/on or before/);
  });

  it("rejects a missing date", () => {
    expect(rangeError("", "2026-08-01")).toMatch(/Pick both dates/);
  });

  // A DST boundary makes the elapsed ms 23 or 25 hours — the count must still
  // come out in whole days (India has no DST, but the browser's TZ decides).
  it("counts whole days across a DST-style boundary", () => {
    expect(rangeError("2026-03-01", "2026-03-31")).toBeNull();
  });
});
