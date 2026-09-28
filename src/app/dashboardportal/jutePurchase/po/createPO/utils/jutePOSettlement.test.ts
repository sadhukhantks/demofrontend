import { describe, expect, it } from "vitest";
import {
  buildClosedInfo,
  buildStatusHistoryRows,
  canShowClosePO,
  canShowReopenClosed,
  closeTypeLabel,
  formatDateTime,
  formatRecomputeCounts,
  parseCloseType,
  parseOptionalCount,
  priorStatusBeforeClose,
  sourceLabel,
} from "./jutePOSettlement";
import type { JutePODetails, JutePOStatusLogEntry } from "../types/jutePOTypes";

const logRow = (over: Partial<JutePOStatusLogEntry> = {}): JutePOStatusLogEntry => ({
  log_id: 1,
  created_at: "2026-09-25 10:00:00",
  old_status_id: 3,
  old_status_name: "APPROVED",
  new_status_id: 5,
  new_status_name: "CLOSED",
  close_type: "AUTO",
  source: "AUTO",
  trigger_ref: "MR:28268 approve_mr",
  remark: "Auto-settled: lorries 5/5",
  user_id: 7,
  user_name: "Ravi",
  ...over,
});

const details = (over: Partial<JutePODetails> = {}): JutePODetails => ({
  jute_po_id: 1,
  po_num: "PO/1",
  po_date: "2026-09-01",
  branch_id: 2,
  mukam_id: 1,
  jute_unit: "LOOSE",
  supplier_id: 1,
  supp_code: "S1",
  vehicle_type_id: 1,
  vehicle_qty: 1,
  channel_code: "DOMESTIC",
  status_id: 5,
  ...over,
});

describe("parseCloseType / closeTypeLabel", () => {
  it("accepts the four known types case-insensitively and rejects the rest", () => {
    expect(parseCloseType("AUTO")).toBe("AUTO");
    expect(parseCloseType("short")).toBe("SHORT");
    expect(parseCloseType(" bulk ")).toBe("BULK");
    expect(parseCloseType("MIGRATED")).toBe("MIGRATED");
    expect(parseCloseType("WHATEVER")).toBeNull();
    expect(parseCloseType(null)).toBeNull();
    expect(parseCloseType(3)).toBeNull();
  });

  it("labels every type and falls back to Closed", () => {
    expect(closeTypeLabel("AUTO")).toBe("Auto-settled");
    expect(closeTypeLabel("SHORT")).toBe("Short-closed");
    expect(closeTypeLabel("BULK")).toBe("Bulk-closed");
    expect(closeTypeLabel("MIGRATED")).toBe("Migrated");
    expect(closeTypeLabel(null)).toBe("Closed");
  });
});

describe("canShowClosePO", () => {
  it("shows for live POs in view mode with edit access only", () => {
    expect(canShowClosePO({ mode: "view", statusId: 1, canEdit: true })).toBe(true);
    expect(canShowClosePO({ mode: "view", statusId: 3, canEdit: true })).toBe(true);
    expect(canShowClosePO({ mode: "view", statusId: 3, canEdit: false })).toBe(false);
    expect(canShowClosePO({ mode: "view", statusId: 21, canEdit: true })).toBe(false);
    expect(canShowClosePO({ mode: "view", statusId: 5, canEdit: true })).toBe(false);
    expect(canShowClosePO({ mode: "create", statusId: 1, canEdit: true })).toBe(false);
  });

  it("in edit mode shows only for APPROVED (read-only page), not for OPEN", () => {
    expect(canShowClosePO({ mode: "edit", statusId: 3, canEdit: true })).toBe(true);
    expect(canShowClosePO({ mode: "edit", statusId: 1, canEdit: true })).toBe(false);
  });
});

describe("canShowReopenClosed", () => {
  it("only for CLOSED with edit access outside create mode", () => {
    expect(canShowReopenClosed({ mode: "view", statusId: 5, canEdit: true })).toBe(true);
    expect(canShowReopenClosed({ mode: "edit", statusId: 5, canEdit: true })).toBe(true);
    expect(canShowReopenClosed({ mode: "view", statusId: 5, canEdit: false })).toBe(false);
    expect(canShowReopenClosed({ mode: "view", statusId: 4, canEdit: true })).toBe(false);
    expect(canShowReopenClosed({ mode: "create", statusId: 5, canEdit: true })).toBe(false);
  });
});

describe("priorStatusBeforeClose", () => {
  it("uses the newest row that moved the PO into CLOSED", () => {
    const log = [
      logRow({ log_id: 3, new_status_id: 5, old_status_id: 1 }),
      logRow({ log_id: 2, new_status_id: 3, old_status_id: 5 }),
      logRow({ log_id: 1, new_status_id: 5, old_status_id: 3 }),
    ];
    expect(priorStatusBeforeClose(log)).toBe(1);
  });

  it("falls back to APPROVED when the log is empty or has no close row", () => {
    expect(priorStatusBeforeClose([])).toBe(3);
    expect(priorStatusBeforeClose([logRow({ new_status_id: 3, old_status_id: 1 })])).toBe(3);
    expect(priorStatusBeforeClose([logRow({ new_status_id: 5, old_status_id: 999 })])).toBe(3);
  });
});

describe("formatDateTime / sourceLabel", () => {
  it("formats MySQL and ISO datetimes with time, dates without", () => {
    expect(formatDateTime("2026-09-25 14:05:00")).toMatch(/25 Sept? 2026, 14:05/);
    expect(formatDateTime("2026-09-25T14:05:00")).toMatch(/25 Sept? 2026, 14:05/);
    expect(formatDateTime("2026-09-25")).toMatch(/^25 Sept? 2026$/);
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("garbage")).toBe("garbage");
  });

  it("maps sources to labels and echoes unknown ones", () => {
    expect(sourceLabel("AUTO")).toBe("Auto");
    expect(sourceLabel("manual")).toBe("Manual");
    expect(sourceLabel("MIGRATION")).toBe("Migration");
    expect(sourceLabel("odd")).toBe("odd");
    expect(sourceLabel(null)).toBe("—");
  });
});

describe("buildClosedInfo", () => {
  it("returns null for non-closed POs", () => {
    expect(buildClosedInfo(details({ status_id: 3 }))).toBeNull();
    expect(buildClosedInfo(null)).toBeNull();
  });

  it("builds the panel view model, preferring the user name over the id", () => {
    const info = buildClosedInfo(
      details({
        closed_date: "2026-09-25 09:30:00",
        closed_by: 7,
        closed_by_name: "Ravi",
        close_type: "SHORT",
        close_remark: "  Supplier defaulted  ",
      }),
    );
    expect(info).not.toBeNull();
    expect(info?.closedOn).toMatch(/25 Sept? 2026, 09:30/);
    expect(info?.closedBy).toBe("Ravi");
    expect(info?.closeType).toBe("SHORT");
    expect(info?.closeTypeLabel).toBe("Short-closed");
    expect(info?.remark).toBe("Supplier defaulted");
  });

  it("degrades gracefully for a migrated row with no metadata", () => {
    const info = buildClosedInfo(details({ closed_by: 12 }));
    expect(info?.closedOn).toBeNull();
    expect(info?.closedBy).toBe("User #12");
    expect(info?.closeTypeLabel).toBe("Closed");
    expect(info?.remark).toBeNull();
  });

  it("fills missing header columns from the latest close row of the status log", () => {
    const log = [
      logRow({ log_id: 3, new_status_id: 3, old_status_id: 5, close_type: null, source: "MANUAL", remark: "Reopened" }),
      logRow({ log_id: 2, created_at: "2026-09-25T17:23:26", close_type: "AUTO", user_name: "User One", remark: "Auto-settled: lorries 4/2" }),
      logRow({ log_id: 1, created_at: "2026-09-20T10:00:00", close_type: "SHORT", user_name: "Old", remark: "old close" }),
    ];
    const info = buildClosedInfo(details(), log);
    expect(info?.closeType).toBe("AUTO");
    expect(info?.closeTypeLabel).toBe("Auto-settled");
    expect(info?.closedOn).toMatch(/25 Sept? 2026, 17:23/);
    expect(info?.closedBy).toBe("User One");
    expect(info?.remark).toBe("Auto-settled: lorries 4/2");
  });

  it("prefers header columns over the log when both are present", () => {
    const info = buildClosedInfo(
      details({ close_type: "SHORT", closed_by_name: "Header", close_remark: "header remark", closed_date: "2026-09-26 08:00:00" }),
      [logRow({ close_type: "AUTO", user_name: "Log", remark: "log remark" })],
    );
    expect(info?.closeType).toBe("SHORT");
    expect(info?.closedBy).toBe("Header");
    expect(info?.remark).toBe("header remark");
    expect(info?.closedOn).toMatch(/26 Sept? 2026, 08:00/);
  });
});

describe("buildStatusHistoryRows", () => {
  it("orders newest first and annotates closes with their type", () => {
    const rows = buildStatusHistoryRows([
      logRow({ log_id: 1, created_at: "2026-09-20 10:00:00", old_status_id: 1, new_status_id: 3, close_type: null, source: "MANUAL", remark: null, trigger_ref: null }),
      logRow({ log_id: 2, created_at: "2026-09-25 10:00:00" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual([2, 1]);
    expect(rows[0].from).toBe("Approved");
    expect(rows[0].to).toBe("Closed (Auto-settled)");
    expect(rows[0].source).toBe("Auto");
    expect(rows[0].user).toBe("Ravi");
    expect(rows[1].to).toBe("Approved");
    expect(rows[1].remark).toBe("—");
    expect(rows[1].trigger).toBe("—");
  });

  it("falls back to backend status names and user ids", () => {
    const [row] = buildStatusHistoryRows([
      logRow({ old_status_id: 77, old_status_name: "WEIRD", user_name: null, user_id: 9 }),
    ]);
    expect(row.from).toBe("WEIRD");
    expect(row.user).toBe("User #9");
  });
});

describe("formatRecomputeCounts", () => {
  it("renders the owner-facing summary", () => {
    expect(formatRecomputeCounts({ closed: 3, reopened: 1 })).toBe("closed 3, reopened 1");
    expect(formatRecomputeCounts(null)).toBe("");
  });
});

describe("parseOptionalCount", () => {
  it("accepts numbers and numeric strings, rejects the rest", () => {
    expect(parseOptionalCount(2)).toBe(2);
    expect(parseOptionalCount("3")).toBe(3);
    expect(parseOptionalCount(1.9)).toBe(1);
    expect(parseOptionalCount(0)).toBe(0);
    expect(parseOptionalCount(-1)).toBeNull();
    expect(parseOptionalCount(null)).toBeNull();
    expect(parseOptionalCount(undefined)).toBeNull();
    expect(parseOptionalCount("")).toBeNull();
    expect(parseOptionalCount("x")).toBeNull();
  });
});
