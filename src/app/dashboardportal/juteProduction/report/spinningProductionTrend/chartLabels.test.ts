import { describe, expect, it } from "vitest";
import { estimateLabelWidth, LABEL_FONT_PX, labelledIndices, labelStep, outsideLabelRoom } from "./chartLabels";

describe("estimateLabelWidth", () => {
  it("budgets about 0.6 em per character, rounded up", () => {
    expect(estimateLabelWidth("12,345")).toBe(36); // 6 chars x 10px x 0.6
    expect(estimateLabelWidth("123.4", 11)).toBe(33); // 5 x 11 x 0.6, exact
    expect(estimateLabelWidth("1,234.5", 11)).toBe(47); // 46.2 -> ceil
    expect(estimateLabelWidth("")).toBe(0);
    expect(LABEL_FONT_PX).toBe(10);
  });
});

describe("labelStep", () => {
  it("labels every point when there is room", () => {
    expect(labelStep(100, 36)).toBe(1);
    expect(labelStep(42, 36)).toBe(1); // exactly label + gap
  });

  it("thins to every k-th point on dense charts", () => {
    expect(labelStep(29, 36)).toBe(2); // desktop, 31 days of "12,345"
    expect(labelStep(10.6, 36)).toBe(4); // phone, 31 days
    expect(labelStep(3.6, 36)).toBe(12); // phone, 93 days
  });

  it("falls back to every point when the slot is unknown", () => {
    expect(labelStep(0, 36)).toBe(1);
    expect(labelStep(-5, 36)).toBe(1);
    expect(labelStep(Number.NaN, 36)).toBe(1);
  });
});

describe("labelledIndices", () => {
  it("counts back from the last point so the latest is always labelled", () => {
    expect(labelledIndices([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([0, 3, 6]);
    expect(labelledIndices([1, 2, 3, 4, 5, 6, 7, 8], 3)).toEqual([1, 4, 7]);
    expect(labelledIndices([1, 2, 3], 1)).toEqual([0, 1, 2]);
  });

  it("anchors on the last non-null value and skips nulls", () => {
    expect(labelledIndices([1, 2, null], 1)).toEqual([0, 1]);
    expect(labelledIndices([1, null, 3, 4], 1)).toEqual([0, 2, 3]);
    expect(labelledIndices([1, null, 3, 4], 2)).toEqual([3]); // index 1 is null, dropped
  });

  it("handles empty and all-null series", () => {
    expect(labelledIndices([], 1)).toEqual([]);
    expect(labelledIndices([null, null], 2)).toEqual([]);
  });

  it("never steps by less than one", () => {
    expect(labelledIndices([1, 2, 3], 0)).toEqual([0, 1, 2]);
    expect(labelledIndices([1, 2, 3], 0.4)).toEqual([0, 1, 2]);
  });
});

describe("outsideLabelRoom", () => {
  it("is the widest label at the label font size plus a gap", () => {
    expect(outsideLabelRoom(["1,234.5", "99"])).toBe(42 + 10); // 7 x 10 x 0.6 = 42
    expect(outsideLabelRoom(["74.0"], 11)).toBe(27 + 10); // 26.4 -> 27 at 11px
    expect(outsideLabelRoom([])).toBe(10);
  });
});
