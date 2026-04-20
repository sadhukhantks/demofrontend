import type { InvoiceDetails, InvoiceLine } from "@/utils/salesInvoiceService";
import type {
	InvoicePreviewAdditionalCharge,
	InvoicePreviewHeader,
	InvoicePreviewItem,
	InvoicePreviewTotals,
} from "../components/SalesInvoicePreview";
import { computeFreightTax, FREIGHT_HSN } from "./freightTax";
import { GOVT_SKG_FREIGHT_INVOICE_TYPE_ID } from "./salesInvoiceConstants";

export type FreightPreviewProps = {
	header: InvoicePreviewHeader;
	items: InvoicePreviewItem[];
	additionalCharges: InvoicePreviewAdditionalCharge[];
	totals: InvoicePreviewTotals;
	remarks?: string;
	termsConditions?: string;
};

const joinAddress = (...parts: Array<string | number | null | undefined>): string | undefined => {
	const pieces = parts
		.map((p) => (p == null ? "" : String(p).trim()))
		.filter(Boolean);
	return pieces.length ? pieces.join(", ") : undefined;
};

const lineToItem = (line: InvoiceLine, srNo: number): InvoicePreviewItem => ({
	srNo,
	hsnCode: line.hsnCode || FREIGHT_HSN,
	itemCode: line.fullItemCode || line.itemCode || undefined,
	item: line.itemName || line.item || "Freight Charges",
	netWeight: line.govtskgDtl?.netWeight != null ? line.govtskgDtl.netWeight : undefined,
	quantity: line.quantity ?? "-",
	uom: line.uomName || line.uom || "BALES",
	rate: line.rate,
	netAmount: typeof line.netAmount === "number" ? line.netAmount : (typeof line.totalAmount === "number" ? line.totalAmount : undefined),
	remarks: line.remarks || "-",
});

/**
 * Build props for `SalesInvoicePreview` from a freight (type 7) invoice.
 *
 * Reuses the shared SalesInvoicePreview tally template (same component that renders
 * types 1/2/3/5/6). Type 7 is already recognized as `isGovtSkgLayoutType`, so the HSN
 * summary and Govt Sacking-specific rows all render automatically.
 *
 * The single line item is pulled directly from `invoice.lines[0]` (the backend-built
 * Freight Charges row) — NOT fabricated as an additional charge.
 */
export function buildFreightPreviewProps(invoice: InvoiceDetails): FreightPreviewProps {
	const firstLine = invoice.lines?.[0];
	const grossFallback = Number(invoice.grossAmount ?? 0);
	const fallbackTax = computeFreightTax(grossFallback, invoice.intraInterState);

	const totalCGST = Number(firstLine?.gst?.cgstAmount ?? fallbackTax.cgst);
	const totalSGST = Number(firstLine?.gst?.sgstAmount ?? fallbackTax.sgst);
	const totalIGST = Number(firstLine?.gst?.igstAmount ?? fallbackTax.igst);
	const cgstPercent = Number(firstLine?.gst?.cgstPercent ?? (totalCGST > 0 ? 9 : 0));
	const sgstPercent = Number(firstLine?.gst?.sgstPercent ?? (totalSGST > 0 ? 9 : 0));
	const igstPercent = Number(firstLine?.gst?.igstPercent ?? (totalIGST > 0 ? 18 : 0));

	const referenceNote = invoice.freight?.source?.invoice_no
		? `Ref: Source Govt Sacking Invoice No ${invoice.freight.source.invoice_no}${invoice.freight.source.invoice_date ? ` dated ${invoice.freight.source.invoice_date}` : ""}`
		: "";
	const footerText = [invoice.footerNote, referenceNote].filter(Boolean).join(" | ");

	const header: InvoicePreviewHeader = {
		invoiceNo: invoice.invoiceNo,
		invoiceDate: invoice.invoiceDate,
		saleNo: invoice.saleNo,
		deliveryOrderNo: invoice.deliveryOrderNo,
		salesOrderNo: invoice.salesOrderNo,
		salesOrderDate: invoice.salesOrderDate,
		pcsoNo: invoice.govtskg?.pcsoNo ?? invoice.freight?.source?.pcso_no ?? undefined,
		pcsoDate: invoice.govtskg?.pcsoDate ?? undefined,
		loadingPoint: invoice.govtskg?.loadingPoint ?? undefined,
		invoiceType: GOVT_SKG_FREIGHT_INVOICE_TYPE_ID,
		transactionType: invoice.typeOfSale,
		status: invoice.status,
		companyName: invoice.companyName,
		companyAddress: joinAddress(invoice.companyAddress1, invoice.companyAddress2, invoice.companyZipcode, invoice.companyStateName),
		companyStateCode: invoice.companyStateCode,
		companyCinNo: invoice.companyCinNo,
		companyGstin: invoice.branchGstNo,
		branchAddress: joinAddress(invoice.branchAddress1, invoice.branchAddress2, invoice.branchZipcode, invoice.branchStateName),
		branchGstNo: invoice.branchGstNo,
		branchStateCode: invoice.branchStateCode,
		billingToName: invoice.partyName,
		billingToAddress: invoice.billingAddress,
		billingToState: invoice.billingStateName,
		billingToStateCode: invoice.billingStateCode != null ? String(invoice.billingStateCode) : undefined,
		billingToGstin: invoice.billingGstNo,
		shippingToName: invoice.partyName,
		shippingToAddress: invoice.shippingAddress,
		shippingToState: invoice.shippingStateName,
		shippingToStateCode: invoice.shippingStateCode,
		shippingToGstin: invoice.shippingGstNo,
		transporter: invoice.transporterName ?? invoice.transporter,
		transporterGstNo: invoice.transporterGstNo,
		transporterDocNo: invoice.transporterDocNo,
		transporterDocDate: invoice.transporterDocDate,
		vehicleNo: invoice.vehicleNo,
		ewayBillNo: invoice.ewayBillNo,
		ewayBillDate: invoice.ewayBillDate,
		destination: invoice.govtskg?.administrativeOfficeAddress ?? undefined,
		modeOfTransport: invoice.govtskg?.modeOfTransport ?? undefined,
		bankName: invoice.bankName,
		bankAccNo: invoice.bankAccNo,
		bankIfscCode: invoice.bankIfscCode,
		irn: invoice.irn,
		ackNo: invoice.ackNo,
		ackDate: invoice.ackDate,
		qrCode: invoice.qrCode,
		updatedBy: invoice.updatedBy,
		updatedAt: invoice.updatedAt,
	};

	const items: InvoicePreviewItem[] = firstLine ? [lineToItem(firstLine, 1)] : [];

	const totals: InvoicePreviewTotals = {
		grossAmount: grossFallback,
		totalCGST,
		totalSGST,
		totalIGST,
		cgstPercent,
		sgstPercent,
		igstPercent,
		roundOff: invoice.roundOff,
		netAmount: invoice.netAmount ?? +(grossFallback + totalCGST + totalSGST + totalIGST).toFixed(2),
	};

	return {
		header,
		items,
		additionalCharges: [],
		totals,
		remarks: footerText || undefined,
		termsConditions: invoice.termsConditions,
	};
}
