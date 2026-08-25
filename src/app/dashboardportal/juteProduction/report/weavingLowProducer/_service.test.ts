import { describe, expect, it } from "vitest";
import { qualitiesOf, type WeavingLowProdBaseRow } from "./_service";

const row = (v: Partial<WeavingLowProdBaseRow>): WeavingLowProdBaseRow =>
  ({
    tran_date: "2026-08-01",
    shift: "A",
    spell_code: "A1",
    machine_id: 1,
    loom: "Loom 1",
    eb_id: 10,
    worker_name: "W",
    quality_id: null,
    quality_name: null,
    loom_group: "1to6",
    act_prod_kg: 0,
    prod_100_kg: 0,
    eff_pct: 0,
    hours: 8,
    ...v,
  }) as WeavingLowProdBaseRow;

describe("qualitiesOf", () => {
  it("dedupes and sorts by name", () => {
    expect(
      qualitiesOf([
        row({ quality_id: 2, quality_name: "Sacking" }),
        row({ quality_id: 1, quality_name: "Hessian" }),
        row({ quality_id: 2, quality_name: "Sacking" }),
      ]),
    ).toEqual([
      { quality_id: 1, quality_name: "Hessian" },
      { quality_id: 2, quality_name: "Sacking" },
    ]);
  });

  it("skips rows with no quality and labels a nameless quality by its id", () => {
    expect(qualitiesOf([row({}), row({ quality_id: 7, quality_name: null })])).toEqual([
      { quality_id: 7, quality_name: "7" },
    ]);
  });
});
