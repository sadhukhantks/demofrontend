import { describe, it, expect } from "vitest";
import {
	GOVT_SKG_FREIGHT_INVOICE_TYPE_ID,
	isGovtSkgFreightInvoice,
	isGovtSkgInvoice,
	hasTypeSpecificHeader,
	hasTypeSpecificLineItems,
} from "../utils/salesInvoiceConstants";
import { buildFreightCreatePreviewProps } from "../utils/buildFreightCreatePreviewProps";
import { buildFreightPreviewProps } from "../utils/buildFreightPreviewProps";
import type { GovtSackingSourceDetail } from "../types/salesInvoiceTypes";
import type { InvoiceDetails } from "@/utils/salesInvoiceService";

describe("Govt Sacking Freight - constants & predicates", () => {
	it("declares the type id as '7'", () => {
		expect(GOVT_SKG_FREIGHT_INVOICE_TYPE_ID).toBe("7");
	});

	it("isGovtSkgFreightInvoice matches type 7 only", () => {
		expect(isGovtSkgFreightInvoice("7")).toBe(true);
		expect(isGovtSkgFreightInvoice(7)).toBe(true);
		expect(isGovtSkgFreightInvoice("3")).toBe(false);
		expect(isGovtSkgFreightInvoice(undefined)).toBe(false);
		expect(isGovtSkgFreightInvoice(null)).toBe(false);
		expect(isGovtSkgFreightInvoice("")).toBe(false);
	});

	it("does not collide with the existing Govt Sacking (type 3) predicate", () => {
		expect(isGovtSkgInvoice("7")).toBe(false);
		expect(isGovtSkgFreightInvoice("3")).toBe(false);
	});

	it("type 7 is intentionally NOT in hasTypeSpecificHeader / LineItems (freight uses its own form)", () => {
		expect(hasTypeSpecificHeader("7")).toBe(false);
		expect(hasTypeSpecificLineItems("7")).toBe(false);
	});
});

describe("buildFreightCreatePreviewProps — header parity with Govt Sacking (type 3)", () => {
	const makeSource = (overrides: Partial<GovtSackingSourceDetail["header"]> = {}): GovtSackingSourceDetail => ({
		header: {
			invoice_id: 12345,
			invoice_no: 452,
			invoice_date: "2025-12-15",
			invoice_type: 3,
			party_id: 77,
			party_name: "Bihar State Cooperative Marketing Union",
			billing_to_id: 77,
			shipping_to_id: 77,
			billing_state_code: 10,
			shipping_state_code: 10,
			intra_inter_state: 0,
			branch_id: 5,
			co_id: 1,
			sales_order_id: 169,
			sales_order_no: 169,
			sales_delivery_order_id: null,
			delivery_order_no: null,
			transporter_id: 99,
			transporter_name: "XYZ Transporters",
			transporter_address: "Kolkata",
			transporter_state_code: "19",
			transporter_state_name: "West Bengal",
			transporter_branch_id: 42,
			transporter_doc_no: "TD/99/2025",
			transporter_doc_date: "2025-12-14",
			buyer_order_no: "BO/169",
			buyer_order_date: "2025-12-10",
			vehicle_no: "WB19G5455",
			container_no: null,
			pcso_no: "BRFCK/25/7890",
			pcso_date: "2025-12-15",
			administrative_office_address: "Patna",
			destination_rail_head: "Katihar",
			loading_point: "Kolkata",
			mode_of_transport: "Road",
			billing_address: "Gandhi Maidan Road",
			billing_address_additional: "Near Collectorate",
			billing_zip_code: "800001",
			billing_state_name: "Bihar",
			billing_gst_no: "10AAAPB0000A1Z5",
			shipping_address: "Warehouse 12, Industrial Area",
			shipping_address_additional: "Sector 4",
			shipping_zip_code: "800002",
			shipping_state_name: "Bihar",
			shipping_gst_no: "10AAAPB0000A1Z5",
			transporter_gst_no: "19AAACT0000B1Z9",
			eway_bill_no: "EWB1234567890",
			eway_bill_date: "2025-12-15",
			sales_order_no_formatted: "VOW/KOL/SO/25-26/169",
			sales_order_date: "2025-06-10",
			invoice_no_formatted: "VOW/KOL/SI/25-26/452",
			...overrides,
		},
		lines: [
			{
				invoice_line_item_id: 5001,
				invoice_id: 12345,
				item_id: 201,
				item_name: "PRINTED TYPE-A JUTE BAG(580GMS)",
				hsn_code: "63051040",
				quantity: 500,
				uom_id: 17,
				uom_name: "Bale",
				rate: 850,
				amount_without_tax: 425000,
				total_amount: 501500,
				remarks: null,
				pack_sheet: null,
				net_weight: null,
				total_weight: null,
			},
		],
	});

	const baseArgs = {
		setupData: null,
		branchId: "5",
		invoiceDate: "2026-04-20",
		iwBillNo: "IW/2026/77",
		iwBillDate: "2026-04-19",
		containerNo: "CNTR-9999",
		vehicleNo: "",
		freightAmount: 10000,
		balesQty: 500,
		footerNote: "",
	};

	it("joins billing/shipping branch address parts into a single line", () => {
		const result = buildFreightCreatePreviewProps({ ...baseArgs, source: makeSource() });
		expect(result.header.billingToAddress).toBe(
			"Gandhi Maidan Road, Near Collectorate, 800001, Bihar",
		);
		expect(result.header.shippingToAddress).toBe(
			"Warehouse 12, Industrial Area, Sector 4, 800002, Bihar",
		);
		expect(result.header.billingToGstin).toBe("10AAAPB0000A1Z5");
		expect(result.header.shippingToGstin).toBe("10AAAPB0000A1Z5");
	});

	it("uses the FY-formatted sales order number when the backend provides one", () => {
		const result = buildFreightCreatePreviewProps({ ...baseArgs, source: makeSource() });
		expect(result.header.salesOrderNo).toBe("VOW/KOL/SO/25-26/169");
		expect(result.header.saleNo).toBe("VOW/KOL/SO/25-26/169");
	});

	it("falls back to the raw sales_order_no when no formatted value is supplied", () => {
		const result = buildFreightCreatePreviewProps({
			...baseArgs,
			source: makeSource({ sales_order_no_formatted: null }),
		});
		expect(result.header.salesOrderNo).toBe("169");
	});

	it("surfaces mode of transport, transporter GST, and e-way bill on the preview header", () => {
		const result = buildFreightCreatePreviewProps({ ...baseArgs, source: makeSource() });
		expect(result.header.modeOfTransport).toBe("Road");
		expect(result.header.transporterGstNo).toBe("19AAACT0000B1Z9");
		expect(result.header.transporterDocNo).toBe("TD/99/2025");
		expect(result.header.ewayBillNo).toBe("EWB1234567890");
	});

	it("auto-appends a reference to the source Govt Sacking invoice in remarks using the formatted invoice no.", () => {
		const result = buildFreightCreatePreviewProps({ ...baseArgs, source: makeSource() });
		expect(result.remarks).toContain("Ref Invoice- VOW/KOL/SI/25-26/452");
		expect(result.remarks).toContain("dated 2025-12-15");
	});

	it("falls back to the raw invoice_no when no formatted value is supplied", () => {
		const result = buildFreightCreatePreviewProps({
			...baseArgs,
			source: makeSource({ invoice_no_formatted: null }),
		});
		expect(result.remarks).toContain("Ref Invoice- 452");
	});

	it("preserves user footer note alongside auto-appended reference and IW/container segments", () => {
		const result = buildFreightCreatePreviewProps({
			...baseArgs,
			footerNote: "Manual note",
			source: makeSource(),
		});
		expect(result.remarks).toMatch(/Manual note.*Ref Invoice- VOW\/KOL\/SI\/25-26\/452/);
		expect(result.remarks).toContain("IW Bill No.IW/2026/77");
		expect(result.remarks).toContain("Container No.CNTR-9999");
	});
});

describe("buildFreightPreviewProps — view-mode totals normalization", () => {
	const baseInvoice = (overrides: Partial<InvoiceDetails> = {}): InvoiceDetails => ({
		id: "55555",
		invoiceNo: "EJM/F/SO/26-27/46",
		invoiceDate: "2026-05-05",
		branchId: "5",
		party: "MP State Civil Supplies",
		intraInterState: 1, // inter-state → IGST
		lines: [
			{
				invoice_line_item_id: 70001,
				item_id: 9001,
				itemName: "Freight Charges",
				hsnCode: "996519",
				quantity: 48,
				uom: "BALES",
				rate: 1437.98,
				netAmount: 69023,
				totalAmount: 81447.14,
				remarks: "PRINTED TYPE-A JUTE BAG(580GMS) — 48 bales",
				gst: {
					cgstAmount: 0,
					sgstAmount: 0,
					igstAmount: 12424.14,
					cgstPercent: 0,
					sgstPercent: 0,
					igstPercent: 18,
				},
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any,
		],
		...overrides,
	} as unknown as InvoiceDetails);

	it("post-fix BE shape: pre-tax grossAmount renders Total = freight, Grand Total = freight + IGST", () => {
		const invoice = baseInvoice({ grossAmount: 69023 });
		const props = buildFreightPreviewProps(invoice);
		expect(props.totals.grossAmount).toBe(69023);
		expect(props.totals.totalIGST).toBe(12424.14);
		expect(props.totals.netAmount).toBe(81447.14);
	});

	it("legacy post-tax BE shape: defensive normalization strips IGST from grossAmount", () => {
		// Pre-fix BE stored invoice_amount = freight + tax (81447.14). FE must detect
		// and normalize so the printed Total still shows 69023 and Grand Total 81447.14.
		const invoice = baseInvoice({ grossAmount: 81447.14 });
		const props = buildFreightPreviewProps(invoice);
		expect(props.totals.grossAmount).toBe(69023);
		expect(props.totals.totalIGST).toBe(12424.14);
		expect(props.totals.netAmount).toBe(81447.14);
	});

	it("does NOT normalize when grossAmount and lineNet+tax disagree (real edit scenario)", () => {
		// If grossAmount (50000) does not match lineNet (69023) + tax (12424.14) within
		// rounding, leave grossAmount alone — the discrepancy means it is not a legacy
		// post-tax artifact and we should not silently rewrite it.
		const invoice = baseInvoice({ grossAmount: 50000 });
		const props = buildFreightPreviewProps(invoice);
		expect(props.totals.grossAmount).toBe(50000);
	});
});
