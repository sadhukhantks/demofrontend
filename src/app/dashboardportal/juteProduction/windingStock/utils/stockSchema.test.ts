import { describe, expect, it } from "vitest";
import {
  buildCreatePayload,
  buildDefaultFormValues,
  buildEditPayload,
  windingStockSchema,
  type WindingStockFormInput,
  type WindingStockFormValues,
} from "./stockSchema";
import { todayISO } from "./stockCalc";

/** A complete, valid floor line as the form would submit it. */
const floorValues: WindingStockFormValues = {
  ...buildDefaultFormValues(todayISO()),
  item_id: "12",
  package_label: " Cone ",
  wastage_area_id: "3",
  no_of_samples: "185",
  wt_per_sample: "14",
  remarks: "",
};

describe("windingStockSchema — location / department", () => {
  it("defaults a new line to FLOOR with no department", () => {
    const defaults = buildDefaultFormValues(todayISO());
    expect(defaults.stock_loc).toBe("FLOOR");
    expect(defaults.dept_id).toBeNull();
  });

  it("fills stock_loc = FLOOR and dept_id = null when the form omits them", () => {
    // stock_loc / dept_id are optional on the input side (z.input) so a form
    // state that never touched them still parses to the server's own defaults.
    const { stock_loc: _loc, dept_id: _dept, ...withoutLocation } = floorValues;
    const input: WindingStockFormInput = withoutLocation;
    const parsed = windingStockSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.stock_loc).toBe("FLOOR");
      expect(parsed.data.dept_id).toBeNull();
    }
  });

  it("accepts a FLOOR line without a department", () => {
    expect(windingStockSchema.safeParse({ ...floorValues, stock_loc: "FLOOR", dept_id: null }).success).toBe(true);
  });

  it("accepts a FLOOR line with a department", () => {
    expect(windingStockSchema.safeParse({ ...floorValues, stock_loc: "FLOOR", dept_id: 7 }).success).toBe(true);
  });

  it("accepts a GODOWN line with no department", () => {
    expect(windingStockSchema.safeParse({ ...floorValues, stock_loc: "GODOWN", dept_id: null }).success).toBe(true);
  });

  it("rejects a GODOWN line that carries a department, on the dept_id field", () => {
    const parsed = windingStockSchema.safeParse({ ...floorValues, stock_loc: "GODOWN", dept_id: 7 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((i) => i.path.join("."))).toContain("dept_id");
    }
  });

  it("rejects an unknown location", () => {
    expect(windingStockSchema.safeParse({ ...floorValues, stock_loc: "SHED" }).success).toBe(false);
  });

  it("rejects a non-integer department id", () => {
    expect(windingStockSchema.safeParse({ ...floorValues, dept_id: 7.5 }).success).toBe(false);
    expect(windingStockSchema.safeParse({ ...floorValues, dept_id: "7" }).success).toBe(false);
  });
});

describe("buildCreatePayload / buildEditPayload — location / department", () => {
  it("sends stock_loc and dept_id for a floor line", () => {
    const payload = buildCreatePayload({ ...floorValues, dept_id: 7 }, 1, 2);
    expect(payload.stock_loc).toBe("FLOOR");
    expect(payload.dept_id).toBe(7);
    expect(buildEditPayload({ ...floorValues, dept_id: 7 })).toMatchObject({ stock_loc: "FLOOR", dept_id: 7 });
  });

  it("sends dept_id = null for a floor line with no department", () => {
    expect(buildCreatePayload(floorValues, 1, 2).dept_id).toBeNull();
    expect(buildEditPayload(floorValues).dept_id).toBeNull();
  });

  it("normalises dept_id to null for a godown line even if the form still held one", () => {
    const godown: WindingStockFormValues = { ...floorValues, stock_loc: "GODOWN", dept_id: 7 };
    expect(buildCreatePayload(godown, 1, 2)).toMatchObject({ stock_loc: "GODOWN", dept_id: null });
    expect(buildEditPayload(godown)).toMatchObject({ stock_loc: "GODOWN", dept_id: null });
  });

  it("keeps every pre-existing payload field unchanged", () => {
    expect(buildCreatePayload(floorValues, 1, 2)).toEqual({
      co_id: 1,
      branch_id: 2,
      tran_date: todayISO(),
      bucket: "MILL_USE",
      item_id: 12,
      package_label: "Cone",
      wastage_area_id: 3,
      stock_loc: "FLOOR",
      dept_id: null,
      no_of_samples: 185,
      wt_per_sample: 14,
      remarks: null,
    });
  });
});
