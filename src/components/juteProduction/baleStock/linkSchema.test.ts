import { describe, expect, it } from "vitest";
import { todayISO } from "./baleStockCalc";
import {
  buildLinkPayload,
  DESPATCH_MODES,
  DESPATCH_REF_MAX,
  INVOICE_WINDOW_DAYS,
  LINK_REMARKS_MAX,
  linkDefaults,
  linkSchema,
  type LinkFormValues,
} from "./linkSchema";

function futureISO(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(
    tomorrow.getDate(),
  ).padStart(2, "0")}`;
}

/** Valid INVOICE-mode values dated today unless overridden. */
function withInvoice(over: Partial<LinkFormValues> = {}): LinkFormValues {
  return { ...linkDefaults(), invoice_id: "171", ...over };
}

/** Valid NO_INVOICE-mode values dated today unless overridden. */
function withoutInvoice(over: Partial<LinkFormValues> = {}): LinkFormValues {
  return { ...linkDefaults(todayISO(), "NO_INVOICE"), despatch_reason: "CHALLAN", ...over };
}

function issuePaths(values: LinkFormValues): string[] {
  const res = linkSchema.safeParse(values);
  return res.success ? [] : res.error.issues.map((i) => i.path.join("."));
}

describe("linkSchema — against invoice", () => {
  it("needs an invoice", () => {
    expect(linkSchema.safeParse(linkDefaults()).success).toBe(false);
    expect(issuePaths(linkDefaults())).toEqual(["invoice_id"]);
    expect(linkSchema.safeParse(withInvoice()).success).toBe(true);
  });

  it("does not need a reason", () => {
    expect(linkSchema.safeParse(withInvoice({ despatch_reason: "" })).success).toBe(true);
  });

  it("needs a despatch date not in the future", () => {
    expect(issuePaths(withInvoice({ despatch_date: futureISO() }))).toEqual(["despatch_date"]);
    expect(issuePaths(withInvoice({ despatch_date: "" }))).toEqual(["despatch_date"]);
  });
});

describe("linkSchema — without invoice", () => {
  it("needs a reason, not an invoice", () => {
    expect(issuePaths(linkDefaults(todayISO(), "NO_INVOICE"))).toEqual(["despatch_reason"]);
    expect(linkSchema.safeParse(withoutInvoice()).success).toBe(true);
    expect(linkSchema.safeParse(withoutInvoice({ invoice_id: "" })).success).toBe(true);
  });

  it("needs a despatch date not in the future", () => {
    expect(issuePaths(withoutInvoice({ despatch_date: "" }))).toEqual(["despatch_date"]);
    expect(issuePaths(withoutInvoice({ despatch_date: futureISO() }))).toEqual(["despatch_date"]);
  });

  it("rejects an unknown mode", () => {
    expect(DESPATCH_MODES).toEqual(["INVOICE", "NO_INVOICE"]);
    expect(linkSchema.safeParse({ ...withoutInvoice(), mode: "SOMETHING" }).success).toBe(false);
  });
});

describe("linkSchema — shared limits", () => {
  it("caps remarks at the column width", () => {
    expect(linkSchema.safeParse(withInvoice({ remarks: "x".repeat(LINK_REMARKS_MAX) })).success).toBe(true);
    expect(linkSchema.safeParse(withInvoice({ remarks: "x".repeat(LINK_REMARKS_MAX + 1) })).success).toBe(false);
  });

  it("caps the reference no at 100 in both modes", () => {
    expect(DESPATCH_REF_MAX).toBe(100);
    expect(linkSchema.safeParse(withInvoice({ despatch_ref: "x".repeat(DESPATCH_REF_MAX) })).success).toBe(true);
    expect(issuePaths(withInvoice({ despatch_ref: "x".repeat(DESPATCH_REF_MAX + 1) }))).toEqual(["despatch_ref"]);
    expect(issuePaths(withoutInvoice({ despatch_ref: "x".repeat(DESPATCH_REF_MAX + 1) }))).toEqual(["despatch_ref"]);
  });

  it("defaults to today (or the given day) in INVOICE mode with nothing picked", () => {
    expect(linkDefaults()).toEqual({
      mode: "INVOICE",
      invoice_id: "",
      despatch_reason: "",
      despatch_ref: "",
      despatch_date: todayISO(),
      remarks: "",
    });
    expect(linkDefaults("2026-10-10").despatch_date).toBe("2026-10-10");
    expect(linkDefaults("2026-10-10", "NO_INVOICE").mode).toBe("NO_INVOICE");
    expect(INVOICE_WINDOW_DAYS).toBe(365);
  });
});

describe("buildLinkPayload", () => {
  it("against invoice: numbers the invoice, sends no reason, blanks empty ref / remarks", () => {
    expect(
      buildLinkPayload(withInvoice({ despatch_date: "2026-10-11", despatch_ref: "  ", remarks: "  " }), {
        coId: 1,
        branchId: 2,
        baleEntryIds: [10, 11],
      }),
    ).toEqual({
      co_id: 1,
      branch_id: 2,
      bale_entry_ids: [10, 11],
      invoice_id: 171,
      despatch_date: "2026-10-11",
      despatch_reason: null,
      despatch_ref: null,
      remarks: null,
    });
  });

  it("against invoice: a reason left over from the other mode is dropped", () => {
    const payload = buildLinkPayload(withInvoice({ despatch_reason: "CHALLAN" }), {
      coId: 1,
      branchId: 2,
      baleEntryIds: [1],
    });
    expect(payload.invoice_id).toBe(171);
    expect(payload.despatch_reason).toBeNull();
  });

  it("without invoice: invoice_id null, reason code and reference no sent", () => {
    expect(
      buildLinkPayload(
        withoutInvoice({ despatch_date: "2026-10-11", despatch_ref: " DC/118 ", remarks: "lorry 3", invoice_id: "171" }),
        { coId: 1, branchId: 2, baleEntryIds: [10] },
      ),
    ).toEqual({
      co_id: 1,
      branch_id: 2,
      bale_entry_ids: [10],
      invoice_id: null,
      despatch_date: "2026-10-11",
      despatch_reason: "CHALLAN",
      despatch_ref: "DC/118",
      remarks: "lorry 3",
    });
  });

  it("trims remarks and copies the id list", () => {
    const ids = [5];
    const payload = buildLinkPayload(withInvoice({ invoice_id: "7", despatch_date: "2026-10-11", remarks: " lorry 3 " }), {
      coId: 1,
      branchId: 2,
      baleEntryIds: ids,
    });
    expect(payload.remarks).toBe("lorry 3");
    expect(payload.bale_entry_ids).toEqual([5]);
    expect(payload.bale_entry_ids).not.toBe(ids);
  });
});
