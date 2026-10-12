import { describe, expect, it } from "vitest";
import {
  billPassDate,
  billPassFinancials,
  buildBillPassPdfSpec,
  type BillPassPdfHeader,
  type BillPassPdfLine,
} from "./billPassPdf";

const HEADER: BillPassPdfHeader = {
  jute_mr_id: 501,
  bill_pass_no: 12,
  bill_pass_num: "BP/26-27/0012",
  bill_pass_date: "2026-09-20",
  bill_pass_complete: 1,
  mr_no: 88,
  mr_num: "MR/26-27/0088",
  mr_date: "2026-09-18",
  gate_entry_no: "GE-77",
  branch_name: "FACTORY",
  supplier_name: "ABC Jute",
  party_name: "ABC Jute Traders",
  po_no: 345,
  po_date: "2026-09-01",
  challan_no: "CH-1",
  challan_date: "2026-09-17",
  vehicle_no: "WB 01 1234",
  freight_charges: 1500,
  invoice_no: "INV-9",
  invoice_date: "2026-09-19",
  invoice_amount: 118000,
  invoice_received_date: null,
  total_amount: 999,
  claim_amount: 999,
  roundoff: 0.4,
  tds_amount: 100,
  payment_due_date: "2026-10-19",
  remarks: null,
};

const line = (over: Partial<BillPassPdfLine>): BillPassPdfLine => ({
  jute_mr_li_id: 1,
  actual_group_name: "TOSSA",
  actual_quality_name: "TD4",
  actual_qty: 10,
  claim_rate: 0,
  actual_weight: 5000,
  uom: "BALE",
  rate: 6000,
  accepted_weight: null,
  premium_amount: 0,
  water_damage_amount: 0,
  ...over,
});

const LINES = [
  line({ jute_mr_li_id: 1, accepted_weight: 4800, claim_rate: 50 }), // 48 qtl × 6000 = 288000; claim 2400
  line({ jute_mr_li_id: 2, actual_qty: 5, actual_weight: 2000, rate: 5500, premium_amount: 100 }), // 20 × 5500 = 110000
];

describe("billPassFinancials", () => {
  it("computes the page's figures from the lines (accepted weight wins over actual)", () => {
    const f = billPassFinancials(HEADER, LINES);
    expect(f.totalAmount).toBe(398000);
    expect(f.claimAmount).toBe(2400);
    expect(f.netTotal).toBeCloseTo(398000 - 2400 + 0.4 - 100, 6);
  });

  it("falls back to the stored header totals when there are no lines", () => {
    const f = billPassFinancials(HEADER, []);
    expect(f.totalAmount).toBe(999);
    expect(f.claimAmount).toBe(999);
  });
});

describe("billPassDate", () => {
  it("prints DD/MM/YYYY and '-' for empty", () => {
    expect(billPassDate("2026-09-20T00:00:00")).toBe("20/09/2026");
    expect(billPassDate(null)).toBe("-");
  });
});

describe("buildBillPassPdfSpec", () => {
  const spec = buildBillPassPdfSpec(HEADER, LINES, "SLS");

  it("names the file and letterhead after the bill pass", () => {
    expect(spec.fileName).toBe("Jute-Bill-Pass-BP-26-27-0012");
    expect(spec.companyName).toBe("SLS");
    expect(spec.title).toBe("JUTE BILL PASS");
    expect(spec.subtitleLines?.[0]).toContain("Bill Pass No: BP/26-27/0012");
    expect(spec.subtitleLines?.[0]).toContain("Status: Completed");
  });

  it("prints the header block, line items, invoice details and financial summary", () => {
    expect(spec.sections.map((s) => s.title)).toEqual([
      "Bill Pass Details",
      "Line Items",
      "Vendor Invoice Details",
      "Financial Summary (Rs.)",
    ]);
    expect(spec.sections[0].body[1]).toEqual(["MR No", "MR/26-27/0088 (18/09/2026)", "Gate Entry No", "GE-77"]);
  });

  it("adds a total line under the line items", () => {
    const items = spec.sections[1];
    expect(items.body[0][7]).toBe("2,88,000.00");
    expect(items.body[2]).toEqual([
      "Total",
      "",
      "15",
      "",
      "6,800.00",
      "",
      "",
      "3,98,000.00",
      "100.00",
      "0.00",
    ]);
    expect(items.totalRows).toEqual([2]);
  });

  it("shades Net Total in the financial summary", () => {
    const fin = spec.sections[3];
    expect(fin.body[4]).toEqual(["Net Total", "3,95,500.40"]);
    expect(fin.totalRows).toEqual([4]);
  });
});
