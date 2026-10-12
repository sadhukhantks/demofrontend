/**
 * Bale picking on the sales invoice (spec §7e — owner 2026-10-12: the bales
 * that leave on an invoice are picked on the invoice itself, with a suggested
 * default by series + count). Pure helpers shared by the "Bales despatched"
 * card and the submission hook; no React, no fetching.
 */

import { todayISO } from "@/components/juteProduction/baleStock/baleStockCalc";
import { REGULAR_INVOICE_TYPE_ID, isGovtSkgInvoice, isHessianInvoice } from "./salesInvoiceConstants";

/** Bale Stock & Inspection page — where linked bales are changed after saving. */
export const BALE_STOCK_PAGE_HREF = "/dashboardportal/juteProduction/baleStock";

/** Regular (1), Hessian (2) and Govt Sacking (3) invoices carry finished-goods bales. */
export const invoiceTypeUsesBales = (invoiceTypeId?: string | number | null): boolean => {
	if (invoiceTypeId == null || invoiceTypeId === "") return false;
	return (
		String(invoiceTypeId) === REGULAR_INVOICE_TYPE_ID
		|| isHessianInvoice(invoiceTypeId)
		|| isGovtSkgInvoice(invoiceTypeId)
	);
};

/**
 * Despatch / as-on date for the bale link: the invoice date, never in the
 * future (bale stock refuses future dates), today when blank or malformed.
 */
export function capDateToToday(date: string | null | undefined, today: string = todayISO()): string {
	if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return today;
	return date > today ? today : date;
}

export interface BaleLinkCounts {
	/** Bales newly linked to the invoice. */
	linked: number;
	/** Bales already despatched without an invoice that now carry this one. */
	relinked: number;
	/** Sacking bales linked without an inspection marking (spec D9). */
	uninspectedSacking: number;
}

/**
 * Suffix for the "Sales invoice created" toast: " · n bales linked" plus
 * " · m sacking bales were not inspected" when that count is non-zero.
 */
export function baleLinkToastSuffix(counts: BaleLinkCounts): string {
	const total = counts.linked + counts.relinked;
	const parts = [` · ${total} ${total === 1 ? "bale" : "bales"} linked`];
	if (counts.uninspectedSacking > 0) {
		const m = counts.uninspectedSacking;
		parts.push(` · ${m} sacking ${m === 1 ? "bale was" : "bales were"} not inspected`);
	}
	return parts.join("");
}
