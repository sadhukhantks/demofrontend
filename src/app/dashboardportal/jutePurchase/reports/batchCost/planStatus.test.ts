import { describe, expect, it } from "vitest";
import { parseBatchPlanStatus, planMessages } from "./planStatus";

const sample = {
  day_has_issue: true,
  day_has_plan: false,
  day_unplanned_yarns: [
    { yarn_type_id: 26, yarn_type_name: "9.5-HSWT", weight: 1600, assignment: "none" },
  ],
  mtd_unplanned_days: ["2026-10-01"],
  messages: [
    { severity: "warning", text: "Batch plan is not assigned for 01-10-2026, so planned weight is not shown." },
    { severity: "info", text: "MTD planned weight leaves out 1 earlier day ..." },
  ],
};

describe("parseBatchPlanStatus (TKT-000206)", () => {
  it("parses the backend payload", () => {
    const status = parseBatchPlanStatus(sample);
    expect(status?.day_has_plan).toBe(false);
    expect(planMessages(status).map((m) => m.severity)).toEqual(["warning", "info"]);
  });

  it("returns null for a missing or malformed plan_status", () => {
    expect(parseBatchPlanStatus(undefined)).toBeNull();
    expect(parseBatchPlanStatus({ ...sample, messages: [{ severity: "error", text: "x" }] })).toBeNull();
    expect(planMessages(null)).toEqual([]);
  });

  it("accepts a yarn quality without a name", () => {
    const status = parseBatchPlanStatus({
      ...sample,
      day_unplanned_yarns: [{ yarn_type_id: 7, yarn_type_name: null, weight: 5, assignment: "draft" }],
    });
    expect(status?.day_unplanned_yarns[0].assignment).toBe("draft");
  });
});
