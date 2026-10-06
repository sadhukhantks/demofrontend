import { describe, expect, it } from "vitest";
import { MR_LIST_STATUS_OPTIONS, mrListListedDate, mrListStatusLabel } from "./mrListRows";

describe("mrListStatusLabel", () => {
  it("shows the ERP status", () => {
    expect(mrListStatusLabel({ status_name: "Pending", status_id: 13, is_returned: 0 })).toBe("Pending");
  });
  it("adds the Returned mark when the lorry went back", () => {
    expect(mrListStatusLabel({ status_name: "Open", status_id: 1, is_returned: 1 })).toBe("Open · Returned");
    expect(mrListStatusLabel({ status_name: null, status_id: null, is_returned: 1 })).toBe("Returned");
  });
  it("falls back to the status id when the name is missing", () => {
    expect(mrListStatusLabel({ status_name: "  ", status_id: 20, is_returned: null })).toBe("Status 20");
  });
});

describe("mrListListedDate", () => {
  it("prefers the MR date and falls back to the gate-entry date", () => {
    expect(mrListListedDate({ jute_mr_date: "2026-09-03", jute_gate_entry_date: "2026-09-01" })).toBe("2026-09-03");
    expect(mrListListedDate({ jute_mr_date: null, jute_gate_entry_date: "2026-09-01" })).toBe("2026-09-01");
    expect(mrListListedDate({ jute_mr_date: null, jute_gate_entry_date: null })).toBe("");
  });
});

describe("MR_LIST_STATUS_OPTIONS", () => {
  it("offers exactly the two views, approved first", () => {
    expect(MR_LIST_STATUS_OPTIONS.map((o) => o.value)).toEqual(["approved", "all"]);
  });
});
