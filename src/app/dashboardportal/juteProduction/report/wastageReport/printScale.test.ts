import { describe, expect, it } from "vitest";
import { A4_LANDSCAPE_PRINTABLE_PX, printScaleFor } from "./printScale";

describe("printScaleFor (TKT-000183 fit-to-width print)", () => {
  it("shrinks a table wider than the page to exactly the printable width", () => {
    expect(printScaleFor(2124, 1062)).toBe(0.5);
  });
  it("never enlarges a table that already fits", () => {
    expect(printScaleFor(800, 1062)).toBe(1);
    expect(printScaleFor(1062, 1062)).toBe(1);
  });
  it("defaults to the A4 landscape printable width", () => {
    expect(A4_LANDSCAPE_PRINTABLE_PX).toBe(1062);
    expect(printScaleFor(A4_LANDSCAPE_PRINTABLE_PX * 2)).toBe(0.5);
  });
  it("falls back to 1 on an unmeasurable width", () => {
    expect(printScaleFor(0)).toBe(1);
    expect(printScaleFor(Number.NaN)).toBe(1);
  });
});
