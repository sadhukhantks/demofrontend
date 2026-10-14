import { describe, expect, it } from "vitest";
import {
  buildCreatePayload,
  buildDefaultFormValues,
  buildEditPayload,
  buildFinishingStockSchema,
  finishingStockSchema,
  type FinishingStockFormValues,
} from "./stockSchema";
import { todayISO } from "./stockCalc";

const baleValues: FinishingStockFormValues = {
  ...buildDefaultFormValues(todayISO(), "BALE"),
  finishing_quality_id: "7",
  owner_co_id: "1",
  qty: "70",
  wt_per_unit_kg: "228.6",
  remarks: "  bale block A  ",
};

const looseValues: FinishingStockFormValues = {
  ...buildDefaultFormValues(todayISO(), "LOOSE"),
  finishing_quality_id: "9",
  stage: "HEMMING",
  work_by: "1",
  qty: "130",
  qty_uom: "CUTS",
  wt_kg: "1885.5",
  remarks: "",
};

describe("buildCreatePayload", () => {
  it("nulls every loose-only field on a BALE line and stores the own company as NULL", () => {
    expect(buildCreatePayload(baleValues, { coId: 1, branchId: 2 })).toEqual({
      co_id: 1,
      branch_id: 2,
      tran_date: todayISO(),
      bucket: "BALE",
      finishing_quality_id: 7,
      stage: null,
      work_by: 0,
      owner_co_id: null,
      qty: 70,
      qty_uom: "BALE",
      wt_per_unit_kg: 228.6,
      wt_kg: null,
      remarks: "bale block A",
    });
  });

  it("keeps a foreign owner as-is", () => {
    const payload = buildCreatePayload(
      { ...baleValues, owner_co_id: "9" },
      { coId: 1, branchId: 2 },
    );
    expect(payload.owner_co_id).toBe(9);
  });

  it("nulls every bale-only field on a LOOSE line", () => {
    expect(buildCreatePayload(looseValues, { coId: 1, branchId: 2 })).toEqual({
      co_id: 1,
      branch_id: 2,
      tran_date: todayISO(),
      bucket: "LOOSE",
      finishing_quality_id: 9,
      stage: "HEMMING",
      work_by: 1,
      owner_co_id: null,
      qty: 130,
      qty_uom: "CUTS",
      wt_per_unit_kg: null,
      wt_kg: 1885.5,
      remarks: null,
    });
  });

  it("sends a blank stage as NULL", () => {
    expect(buildCreatePayload({ ...looseValues, stage: "" }, { coId: 1, branchId: 2 }).stage).toBe(
      null,
    );
  });
});

describe("buildEditPayload", () => {
  it("drops the identity fields the edit endpoint reads from the row", () => {
    const payload = buildEditPayload(baleValues);
    expect(Object.keys(payload).sort()).toEqual(
      [
        "bucket",
        "finishing_quality_id",
        "owner_co_id",
        "qty",
        "qty_uom",
        "remarks",
        "stage",
        "work_by",
        "wt_kg",
        "wt_per_unit_kg",
      ].sort(),
    );
  });
});

describe("finishingStockSchema", () => {
  const messages = (values: FinishingStockFormValues) => {
    const parsed = finishingStockSchema.safeParse(values);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };

  it("accepts a complete bale and a complete loose line", () => {
    expect(messages(baleValues)).toEqual([]);
    expect(messages(looseValues)).toEqual([]);
  });

  it("names the missing per-bale weight so the operator can act on it", () => {
    expect(messages({ ...baleValues, wt_per_unit_kg: "" })).toContain("Per-bale weight required");
  });

  it("allows a zero count on a loose line but still demands the weight", () => {
    expect(messages({ ...looseValues, qty: "0" })).toEqual([]);
    expect(messages({ ...looseValues, wt_kg: "" })).toContain("Weight (kg) is required");
  });

  it("rejects a future date", () => {
    expect(messages({ ...baleValues, tran_date: "2099-01-01" })).toContain(
      "Date cannot be in the future",
    );
  });

  it("rejects zero bales", () => {
    expect(messages({ ...baleValues, qty: "0" })).toContain("Must be greater than 0");
  });

  // Regression: react-hook-form drops the values of Controllers that are not
  // mounted at submit time, so the half of the form the current bucket does not
  // render arrives undefined. Those fields have no error UI (they are off
  // screen), so a strict z.string() there killed Save Line silently.
  it("parses a line whose inactive-bucket fields were never registered", () => {
    const { owner_co_id, wt_per_unit_kg, ...looseWithoutBaleFields } = looseValues;
    const { stage, work_by, qty_uom, wt_kg, ...baleWithoutLooseFields } = baleValues;
    expect(finishingStockSchema.safeParse(looseWithoutBaleFields).success).toBe(true);
    expect(finishingStockSchema.safeParse(baleWithoutLooseFields).success).toBe(true);
  });

  it("accepts a blank owner (= own company) in MANUAL mode", () => {
    expect(messages({ ...baleValues, owner_co_id: "" })).toEqual([]);
  });
});

describe("buildFinishingStockSchema({ ownerRequired })", () => {
  const schema = buildFinishingStockSchema({ ownerRequired: true });
  const messages = (values: FinishingStockFormValues) => {
    const parsed = schema.safeParse(values);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };

  it("demands an owner on a BALE line — own-company bales are derived", () => {
    expect(messages({ ...baleValues, owner_co_id: "" })).toContain("Owner company is required");
    expect(messages({ ...baleValues, owner_co_id: "9" })).toEqual([]);
  });

  it("does not care about the owner on a LOOSE line", () => {
    expect(messages({ ...looseValues, owner_co_id: "" })).toEqual([]);
  });

  it("is the plain schema when the option is off", () => {
    const off = buildFinishingStockSchema({ ownerRequired: false });
    expect(off.safeParse({ ...baleValues, owner_co_id: "" }).success).toBe(true);
    expect(buildFinishingStockSchema().safeParse({ ...baleValues, owner_co_id: "" }).success).toBe(
      true,
    );
  });
});
