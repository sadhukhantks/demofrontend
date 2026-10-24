import { describe, expect, it } from "vitest";
import { daysInMonth, formatDmy, previewLine, previousMonth, slotRange, validateSlots } from "./periodPreview";
import { presetSlots } from "./types";

describe("periodPreview", () => {
  it("handles month length incl. leap years", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 10)).toBe(31);
  });

  it("wraps January to previous December", () => {
    expect(previousMonth(2026, 1)).toEqual({ year: 2025, month: 12 });
    expect(previousMonth(2026, 3)).toEqual({ year: 2026, month: 2 });
  });

  it("resolves fortnight slots with month end", () => {
    const [f1, f2] = presetSlots("FORTNIGHTLY");
    expect(slotRange(f1, 2026, 2)).toEqual({ from: "2026-02-01", to: "2026-02-15" });
    expect(slotRange(f2, 2026, 2)).toEqual({ from: "2026-02-16", to: "2026-02-28" });
  });

  it("resolves a slot starting in the previous month", () => {
    const s = { from_day: 26, from_prev_month: 1, to_day: 25 };
    expect(slotRange(s, 2026, 1)).toEqual({ from: "2025-12-26", to: "2026-01-25" });
    expect(slotRange(s, 2026, 3)).toEqual({ from: "2026-02-26", to: "2026-03-25" });
  });

  it("clamps from_day to the month length", () => {
    expect(slotRange({ from_day: 31, from_prev_month: 1, to_day: 30 }, 2026, 3).from).toBe("2026-02-28");
  });

  it("formats DD-MM-YYYY and the preview line", () => {
    expect(formatDmy("2026-10-05")).toBe("05-10-2026");
    expect(previewLine(presetSlots("FORTNIGHTLY"), 2026, 10)).toBe(
      "Oct-2026: F1 01-10 → 15-10, F2 16-10 → 31-10",
    );
  });

  it("validates contiguity", () => {
    expect(validateSlots(presetSlots("FORTNIGHTLY"))).toBeNull();
    expect(validateSlots(presetSlots("MONTHLY"))).toBeNull();
    expect(validateSlots([{ slot_no: 1, slot_name: "M", slot_code: "M", from_day: 26, from_prev_month: 1, to_day: 25 }])).toBeNull();
    const gap = presetSlots("FORTNIGHTLY");
    gap[1].from_day = 18;
    expect(validateSlots(gap)).toMatch(/must start on day 16/);
    const noEnd = presetSlots("FORTNIGHTLY");
    noEnd[1].to_day = 30;
    expect(validateSlots(noEnd)).toMatch(/month end/);
    const late = presetSlots("FORTNIGHTLY");
    late[0].to_day = 28;
    late[1].from_day = 29;
    expect(validateSlots(late)).toMatch(/27/);
  });
});
