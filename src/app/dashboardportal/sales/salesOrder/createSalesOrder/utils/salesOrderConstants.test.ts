import { describe, it, expect } from "vitest";

import { SO_STATUS_IDS, isSalesOrderRowEditable, resolveInvoiceTypeCode } from "./salesOrderConstants";

describe("isSalesOrderRowEditable", () => {
	it("keeps every non-approved order editable regardless of invoice type", () => {
		expect(isSalesOrderRowEditable({ status_id: SO_STATUS_IDS.PENDING_APPROVAL })).toBe(true);
		expect(isSalesOrderRowEditable({ status_id: SO_STATUS_IDS.OPEN, invoice_type_name: "Regular" })).toBe(true);
		expect(isSalesOrderRowEditable({ status_id: SO_STATUS_IDS.DRAFT, invoice_type_name: "Hessian" })).toBe(true);
	});

	it("unlocks an approved Govt Sacking order (rates are notified after approval)", () => {
		expect(resolveInvoiceTypeCode("Govt Sacking")).toBe("govt_skg");
		expect(isSalesOrderRowEditable({ status_id: SO_STATUS_IDS.APPROVED, invoice_type_name: "Govt Sacking" })).toBe(true);
		expect(isSalesOrderRowEditable({ status_id: SO_STATUS_IDS.APPROVED, invoice_type_name: "govt skg" })).toBe(true);
	});

	it("keeps every other approved invoice type locked", () => {
		expect(isSalesOrderRowEditable({ status_id: SO_STATUS_IDS.APPROVED, invoice_type_name: "Regular" })).toBe(false);
		expect(isSalesOrderRowEditable({ status_id: SO_STATUS_IDS.APPROVED, invoice_type_name: "Hessian" })).toBe(false);
		expect(isSalesOrderRowEditable({ status_id: SO_STATUS_IDS.APPROVED, invoice_type_name: "Jute Yarn" })).toBe(false);
	});

	it("falls back to locked when the row carries no invoice type name", () => {
		expect(isSalesOrderRowEditable({ status_id: SO_STATUS_IDS.APPROVED })).toBe(false);
		expect(isSalesOrderRowEditable({ status_id: SO_STATUS_IDS.APPROVED, invoice_type_name: "  " })).toBe(false);
		expect(isSalesOrderRowEditable({ status_id: SO_STATUS_IDS.APPROVED, invoice_type_name: null })).toBe(false);
	});
});
