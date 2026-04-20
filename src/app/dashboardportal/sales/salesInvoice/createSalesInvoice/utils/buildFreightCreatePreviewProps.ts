import type {
	InvoicePreviewAdditionalCharge,
	InvoicePreviewHeader,
	InvoicePreviewItem,
	InvoicePreviewTotals,
} from "../components/SalesInvoicePreview";
import type { GovtSackingSourceDetail, InvoiceSetupData } from "../types/salesInvoiceTypes";
import { GOVT_SKG_FREIGHT_INVOICE_TYPE_ID } from "./salesInvoiceConstants";
import { computeFreightTax, FREIGHT_HSN } from "./freightTax";

export type FreightCreatePreviewArgs = {
	setupData: InvoiceSetupData | null;
	branchId: string;
	source: GovtSackingSourceDetail | null;
	invoiceDate: string;
	iwBillNo: string;
	iwBillDate: string;
	containerNo: string;
	vehicleNo: string;
	freightAmount: number;
	balesQty: number;
	footerNote: string;
};

export type FreightCreatePreviewProps = {
	header: InvoicePreviewHeader;
	items: InvoicePreviewItem[];
	additionalCharges: InvoicePreviewAdditionalCharge[];
	totals: InvoicePreviewTotals;
	remarks?: string;
};

const joinAddress = (...parts: Array<string | number | null | undefined>): string | undefined => {
	const pieces = parts
		.map((p) => (p == null ? "" : String(p).trim()))
		.filter(Boolean);
	return pieces.length ? pieces.join(", ") : undefined;
};

/**
 * Builds props for `SalesInvoicePreview` from the freight (type 7) create-mode inputs.
 * Mirrors the shape of `previewHeader`/`previewItems`/`previewTotals` that page.tsx
 * builds for types 1–6 so the tally layout is visually identical to Govt Sacking (type 3).
 */
export function buildFreightCreatePreviewProps(args: FreightCreatePreviewArgs): FreightCreatePreviewProps {
	const { setupData, branchId, source, invoiceDate, iwBillNo, iwBillDate, containerNo, vehicleNo, freightAmount, balesQty, footerNote } = args;

	const header = source?.header;
	const tax = computeFreightTax(freightAmount, header?.intra_inter_state);

	const selectedBranch = setupData?.branches?.find((b) => String(b.branch_id) === branchId);
	const company = setupData?.company;

	const companyAddress = company
		? joinAddress(company.co_address1, company.co_address2, company.co_zipcode, company.state_name)
		: undefined;
	const branchAddress = selectedBranch
		? joinAddress(selectedBranch.branch_address1, selectedBranch.branch_address2, selectedBranch.branch_zipcode, selectedBranch.state_name)
		: undefined;

	const rate = balesQty > 0 ? +(freightAmount / balesQty).toFixed(2) : 0;

	const formattedSalesOrderNo =
		header?.sales_order_no_formatted ??
		(header?.sales_order_no != null ? String(header.sales_order_no) : undefined);

	const billingToAddress = joinAddress(
		header?.billing_address,
		header?.billing_address_additional,
		header?.billing_zip_code,
		header?.billing_state_name,
	);
	const shippingToAddress = joinAddress(
		header?.shipping_address,
		header?.shipping_address_additional,
		header?.shipping_zip_code,
		header?.shipping_state_name,
	);

	const previewHeader: InvoicePreviewHeader = {
		invoiceNo: undefined, // not minted yet in draft
		invoiceDate,
		saleNo: formattedSalesOrderNo,
		deliveryOrderNo: header?.delivery_order_no != null ? String(header.delivery_order_no) : undefined,
		salesOrderNo: formattedSalesOrderNo,
		salesOrderDate: header?.sales_order_date ?? undefined,
		pcsoNo: header?.pcso_no ?? undefined,
		pcsoDate: header?.pcso_date ?? undefined,
		loadingPoint: header?.loading_point ?? undefined,
		invoiceType: GOVT_SKG_FREIGHT_INVOICE_TYPE_ID,
		transactionType: "Freight Invoice",
		status: "Draft",
		companyName: company?.co_name,
		companyAddress,
		companyStateCode: selectedBranch?.state_code ?? company?.state_code,
		companyCinNo: company?.co_cin_no,
		companyGstin: selectedBranch?.gst_no,
		branchAddress,
		branchGstNo: selectedBranch?.gst_no,
		branchStateCode: selectedBranch?.state_code,
		billingToName: header?.billing_party_name ?? header?.party_name,
		billingToAddress,
		billingToState: header?.billing_state_name ?? undefined,
		billingToStateCode: header?.billing_state_code != null ? String(header.billing_state_code) : undefined,
		billingToGstin: header?.billing_gst_no ?? undefined,
		shippingToName: header?.shipping_party_name ?? header?.party_name,
		shippingToAddress,
		shippingToState: header?.shipping_state_name ?? undefined,
		shippingToStateCode: header?.shipping_state_code != null ? String(header.shipping_state_code) : undefined,
		shippingToGstin: header?.shipping_gst_no ?? undefined,
		transporter: header?.transporter_name ?? undefined,
		transporterGstNo: header?.transporter_gst_no ?? undefined,
		transporterDocNo: header?.transporter_doc_no ?? undefined,
		transporterDocDate: header?.transporter_doc_date ?? undefined,
		vehicleNo: vehicleNo || header?.vehicle_no || undefined,
		ewayBillNo: header?.eway_bill_no ?? undefined,
		ewayBillDate: header?.eway_bill_date ?? undefined,
		destination: header?.administrative_office_address ?? undefined,
		modeOfTransport: header?.mode_of_transport ?? undefined,
	};

	const sourceItemName = source?.lines?.[0]?.item_name ?? "Freight Charges";
	const remarksText = source?.lines?.[0]?.item_name && balesQty > 0
		? `${sourceItemName} — ${balesQty} bales`
		: undefined;

	const items: InvoicePreviewItem[] = freightAmount > 0 || balesQty > 0
		? [
			{
				srNo: 1,
				hsnCode: FREIGHT_HSN,
				item: "Freight Charges",
				quantity: balesQty || "-",
				uom: "BALES",
				rate: rate || "-",
				netAmount: freightAmount || "-",
				remarks: remarksText ?? "-",
			},
		]
		: [];

	const totals: InvoicePreviewTotals = {
		grossAmount: freightAmount,
		totalCGST: tax.cgst,
		totalSGST: tax.sgst,
		totalIGST: tax.igst,
		cgstPercent: tax.cgst > 0 ? 9 : 0,
		sgstPercent: tax.sgst > 0 ? 9 : 0,
		igstPercent: tax.igst > 0 ? 18 : 0,
		roundOff: 0,
		netAmount: +(freightAmount + tax.total).toFixed(2),
	};

	// Surface IW Bill + Container in remarks so they visibly appear on the print.
	const iwBillSegment = iwBillNo ? `IW Bill No.${iwBillNo}${iwBillDate ? ` Date:${iwBillDate}` : ""}` : "";
	const containerSegment = containerNo ? `Container No.${containerNo}` : "";
	// Reference to the source Govt Sacking invoice — mirrors view-mode behavior in
	// buildFreightPreviewProps so the freight invoice always visibly cites the source.
	const referenceSegment = header?.invoice_no != null
		? `Ref: Source Govt Sacking Invoice No ${header.invoice_no}${header.invoice_date ? ` dated ${header.invoice_date}` : ""}`
		: "";
	const autoRemarksSegments = [footerNote, referenceSegment, iwBillSegment, containerSegment].filter(Boolean);
	// De-dup — footerNote may already include the IW/container pieces.
	const remarks = autoRemarksSegments.join(" | ");

	return {
		header: previewHeader,
		items,
		additionalCharges: [],
		totals,
		remarks: remarks || undefined,
	};
}
