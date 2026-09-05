import { describe, expect, it } from "vitest";
import { parseAbsentRange } from "./hrmsReportService";

describe("parseAbsentRange", () => {
  it("parses a closed window", () => {
    expect(parseAbsentRange("7-30")).toEqual([7, 30]);
  });

  it("leaves an open upper bound uncapped", () => {
    expect(parseAbsentRange("90-")).toEqual([90, undefined]);
  });

  it("falls back to 1 day when the minimum is missing", () => {
    expect(parseAbsentRange("")).toEqual([1, undefined]);
  });

  it("drops a maximum below the minimum rather than returning no rows", () => {
    expect(parseAbsentRange("30-7")).toEqual([30, undefined]);
  });
});
