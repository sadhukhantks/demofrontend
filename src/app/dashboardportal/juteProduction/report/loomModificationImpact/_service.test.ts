import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.mock("@/utils/apiClient2", () => ({
  fetchWithCookie: (...args: unknown[]) => fetchMock(...args),
}));

import {
  buildImpactQuery,
  fetchLoomModificationImpact,
  fetchLoomModificationImpactOptions,
} from "./_service";

beforeEach(() => {
  fetchMock.mockReset();
});

describe("buildImpactQuery", () => {
  it("sends the defaults the endpoint expects and omits blank optionals", () => {
    const qs = new URLSearchParams(
      buildImpactQuery({ coId: 9, branchId: 12, modificationId: 5, windowDays: 60 }),
    );
    expect(qs.get("co_id")).toBe("9");
    expect(qs.get("branch_id")).toBe("12");
    expect(qs.get("modification_id")).toBe("5");
    expect(qs.get("window_days")).toBe("60");
    expect(qs.get("control")).toBe("speed_band");
    // Blank settle days = the event's own value: the param must be absent.
    expect(qs.has("settle_days")).toBe(false);
    expect(qs.has("control_group_id")).toBe(false);
    // Removed from the contract (2026-09-29): never sent.
    expect(qs.has("metric")).toBe(false);
    expect(qs.has("same_quality_only")).toBe(false);
    expect(qs.has("weaving_quality_id")).toBe(false);
  });

  it("passes every filter in the wire names, settle 0 included", () => {
    const qs = new URLSearchParams(
      buildImpactQuery({
        coId: 2,
        branchId: 29,
        modificationId: 17,
        windowDays: 30,
        settleDays: 0,
        control: "control_group",
        controlGroupId: 4,
      }),
    );
    expect(qs.get("settle_days")).toBe("0");
    expect(qs.get("control")).toBe("control_group");
    expect(qs.get("control_group_id")).toBe("4");
    expect([...qs.keys()].sort()).toEqual([
      "branch_id",
      "co_id",
      "control",
      "control_group_id",
      "modification_id",
      "settle_days",
      "window_days",
    ]);
  });

  it("drops the control group id unless the control mode is control_group", () => {
    const qs = new URLSearchParams(
      buildImpactQuery({
        coId: 2,
        branchId: 29,
        modificationId: 17,
        windowDays: 60,
        control: "same_dept",
        controlGroupId: 4,
      }),
    );
    expect(qs.get("control")).toBe("same_dept");
    expect(qs.has("control_group_id")).toBe(false);
  });
});

describe("fetchLoomModificationImpact", () => {
  it("unwraps the {data} envelope from the impact route", async () => {
    const report = { chain: { root_modification_id: 5 } };
    fetchMock.mockResolvedValue({ data: { data: report }, error: null });
    const res = await fetchLoomModificationImpact({
      coId: 9,
      branchId: 12,
      modificationId: 5,
      windowDays: 60,
    });
    expect(res).toBe(report);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/juteProductionReports/loom_modification_impact?");
    expect(url).toContain("modification_id=5");
  });

  it("throws the backend's 400 message", async () => {
    fetchMock.mockResolvedValue({ data: null, error: "window_days must be 180 or less", status: 400 });
    await expect(
      fetchLoomModificationImpact({ coId: 9, branchId: 12, modificationId: 5, windowDays: 400 }),
    ).rejects.toThrow("window_days must be 180 or less");
  });
});

describe("fetchLoomModificationImpactOptions", () => {
  it("calls the options route with co_id and branch_id", async () => {
    const opts = { modifications: [], control_groups: [], window_presets: [30, 60], default_window_days: 60 };
    fetchMock.mockResolvedValue({ data: { data: opts }, error: null });
    const res = await fetchLoomModificationImpactOptions({ coId: 9, branchId: 12 });
    expect(res).toBe(opts);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/juteProductionReports/loom_modification_impact_options?");
    expect(url).toContain("co_id=9");
    expect(url).toContain("branch_id=12");
  });

  it("throws a plain error when the envelope is empty", async () => {
    fetchMock.mockResolvedValue({ data: null, error: null });
    await expect(fetchLoomModificationImpactOptions({ coId: 9, branchId: 12 })).rejects.toThrow(
      /impact options/,
    );
  });
});
