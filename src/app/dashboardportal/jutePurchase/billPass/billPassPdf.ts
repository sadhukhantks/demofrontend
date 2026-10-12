/**
 * Jute Bill Pass as a printable A4 document (TKT-000195: "need a print /
 * download option ... for accounting purposes"). Shared by the edit and view
 * pages: the same header block, line-item table and financial summary the
 * screen shows, built from the SAVED bill pass, laid out by the shared
 * tables-PDF renderer.
 *
 * Amounts follow the pages' own rules (weight is kg, rates are per quintal):
 *   line amount  = (accepted weight, else actual weight) / 100 × rate
 *   claim amount = Σ weight / 100 × claim rate
 *   net total    = total − claim + round off − TDS
 */
import type { PdfTableSection, TablesPdfSpec } from "@/components/reports/tablesPdf";
import { pdfFileSlug } from "@/components/reports/tablesPdf";

/** The header fields the document prints (subset of the page's header row). */
export interface BillPassPdfHeader {
  jute_mr_id: number;
  bill_pass_no: number | null;
  bill_pass_num: string | null;
  bill_pass_date: string | null;
  bill_pass_complete: number | null;
  mr_no: number | null;
  mr_num: string | null;
  mr_date: string | null;
  gate_entry_no: string | null;
  branch_name: string;
  supplier_name: string | null;
  party_name: string | null;
  po_no: number | null;
  po_date: string | null;
  challan_no: string | null;
  challan_date: string | null;
  vehicle_no: string | null;
  freight_charges: number | null;
  invoice_no: string | null;
  invoice_date: string | null;
  invoice_amount: number | null;
  invoice_received_date: string | null;
  total_amount: number | null;
  claim_amount: number | null;
  roundoff: number | null;
  tds_amount: number | null;
  payment_due_date: string | null;
  remarks: string | null;
}

/** One line item as the pages load it. */
export interface BillPassPdfLine {
  jute_mr_li_id: number;
  actual_group_name: string | null;
  actual_quality_name: string | null;
  actual_qty: number | null;
  claim_rate: number | null;
  actual_weight: number | null;
  uom: string | null;
  rate: number | null;
  accepted_weight: number | null;
  premium_amount: number | null;
  water_damage_amount: number | null;
}

/** Weight used for billing: accepted, else actual (kg). */
export function billPassLineWeightKg(line: BillPassPdfLine): number {
  return line.accepted_weight ?? line.actual_weight ?? 0;
}

/** (weight kg / 100) × rate per quintal. */
export function billPassLineAmount(line: BillPassPdfLine): number {
  return (billPassLineWeightKg(line) / 100) * (line.rate ?? 0);
}

export interface BillPassFinancials {
  totalAmount: number;
  claimAmount: number;
  roundoff: number;
  tdsAmount: number;
  netTotal: number;
}

/**
 * Same figures the view page shows (and the edit page computes on load):
 * totals from the line items when there are any, else the stored header values.
 */
export function billPassFinancials(header: BillPassPdfHeader, lines: BillPassPdfLine[]): BillPassFinancials {
  const totalAmount =
    lines.length > 0 ? lines.reduce((s, l) => s + billPassLineAmount(l), 0) : (header.total_amount ?? 0);
  const claimAmount =
    lines.length > 0
      ? lines.reduce((s, l) => s + (billPassLineWeightKg(l) / 100) * (l.claim_rate ?? 0), 0)
      : (header.claim_amount ?? 0);
  const roundoff = header.roundoff ?? 0;
  const tdsAmount = header.tds_amount ?? 0;
  return { totalAmount, claimAmount, roundoff, tdsAmount, netTotal: totalAmount - claimAmount + roundoff - tdsAmount };
}

/** 2-dp Indian grouping, "0.00" for null — the pages' formatAmount. */
export function billPassAmount(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value ?? 0);
}

/** YYYY-MM-DD… → DD/MM/YYYY (the edit page's format); "-" when empty. */
export function billPassDate(value: string | null | undefined): string {
  if (!value) return "-";
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value.trim();
}

function text(v: string | number | null | undefined): string {
  return v == null || v === "" ? "-" : String(v);
}

/** Label/value pairs → a 4-column key/value grid (two pairs per row). */
function pairGrid(title: string, pairs: [string, string][]): PdfTableSection {
  const body: string[][] = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const [l1, v1] = pairs[i];
    const [l2, v2] = pairs[i + 1] ?? ["", ""];
    body.push([l1, v1, l2, v2]);
  }
  return { title, body, boldCols: [0, 2] };
}

export function billPassDocNo(header: BillPassPdfHeader): string {
  return header.bill_pass_num ?? (header.bill_pass_no != null ? String(header.bill_pass_no) : String(header.jute_mr_id));
}

/** Saved bill pass → PDF spec. Pure; tested. */
export function buildBillPassPdfSpec(
  header: BillPassPdfHeader,
  lines: BillPassPdfLine[],
  companyName?: string | null,
): TablesPdfSpec {
  const fin = billPassFinancials(header, lines);
  const docNo = billPassDocNo(header);
  const complete = header.bill_pass_complete === 1;

  const details = pairGrid("Bill Pass Details", [
    ["Bill Pass No", docNo],
    ["Bill Pass Date", billPassDate(header.bill_pass_date)],
    ["MR No", `${text(header.mr_num ?? header.mr_no)} (${billPassDate(header.mr_date)})`],
    ["Gate Entry No", text(header.gate_entry_no)],
    ["Supplier", text(header.supplier_name)],
    ["Party", text(header.party_name)],
    ["PO No", text(header.po_no)],
    ["PO Date", billPassDate(header.po_date)],
    ["Challan No", text(header.challan_no)],
    ["Challan Date", billPassDate(header.challan_date)],
    ["Vehicle No", text(header.vehicle_no)],
    ["Branch", text(header.branch_name)],
  ]);

  const lineBody = lines.map((l) => [
    text(l.actual_group_name),
    text(l.actual_quality_name),
    text(l.actual_qty),
    text(l.uom),
    billPassAmount(l.accepted_weight ?? l.actual_weight),
    billPassAmount(l.rate),
    billPassAmount(l.claim_rate),
    billPassAmount(billPassLineAmount(l)),
    billPassAmount(l.premium_amount),
    billPassAmount(l.water_damage_amount),
  ]);
  const sum = (f: (l: BillPassPdfLine) => number) => lines.reduce((s, l) => s + f(l), 0);
  if (lines.length > 0) {
    lineBody.push([
      "Total",
      "",
      String(sum((l) => l.actual_qty ?? 0)),
      "",
      billPassAmount(sum(billPassLineWeightKg)),
      "",
      "",
      billPassAmount(fin.totalAmount),
      billPassAmount(sum((l) => l.premium_amount ?? 0)),
      billPassAmount(sum((l) => l.water_damage_amount ?? 0)),
    ]);
  }
  const lineSection: PdfTableSection = {
    title: "Line Items",
    head: [
      "Item",
      "Quality",
      "Qty",
      "UOM",
      "Weight (Kg)",
      "Rate (Rs/Qntl)",
      "Claim Rate",
      "Amount",
      "Prem Amt",
      "Water Dmg",
    ],
    body: lineBody,
    aligns: ["left", "left", "right", "left", "right", "right", "right", "right", "right", "right"],
    totalRows: lines.length > 0 ? [lineBody.length - 1] : [],
    notes: lines.length === 0 ? ["No line items."] : [],
  };

  const invoice = pairGrid("Vendor Invoice Details", [
    ["Invoice No", text(header.invoice_no)],
    ["Invoice Date", billPassDate(header.invoice_date)],
    ["Invoice Amount", header.invoice_amount == null ? "-" : billPassAmount(header.invoice_amount)],
    ["Invoice Received Date", billPassDate(header.invoice_received_date)],
    ["Payment Due Date", billPassDate(header.payment_due_date)],
    ["Remarks", text(header.remarks)],
  ]);

  const financial: PdfTableSection = {
    title: "Financial Summary (Rs.)",
    body: [
      ["Total Amount (Accepted Weight x Rate)", billPassAmount(fin.totalAmount)],
      ["Less: Claim Amount (Weight x Claim Rate)", billPassAmount(fin.claimAmount)],
      ["Add: Round Off", billPassAmount(fin.roundoff)],
      ["Less: TDS Amount", billPassAmount(fin.tdsAmount)],
      ["Net Total", billPassAmount(fin.netTotal)],
      ["Freight Charges", header.freight_charges == null ? "-" : billPassAmount(header.freight_charges)],
    ],
    aligns: ["left", "right"],
    boldCols: [0],
    totalRows: [4],
  };

  return {
    fileName: pdfFileSlug(`Jute-Bill-Pass-${docNo}`),
    orientation: "portrait",
    companyName,
    title: "JUTE BILL PASS",
    subtitleLines: [
      [`Bill Pass No: ${docNo}`, `Date: ${billPassDate(header.bill_pass_date)}`, `Branch: ${text(header.branch_name)}`, `Status: ${complete ? "Completed" : "Pending"}`].join(
        "    ",
      ),
    ],
    sections: [details, lineSection, invoice, financial],
  };
}
