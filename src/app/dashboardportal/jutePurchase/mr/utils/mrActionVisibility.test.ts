import { describe, expect, it } from "vitest";
import { MR_STATUS_IDS } from "./mrConstants";
import { canReopenMr, canReturnLorryMr, canUnreturnLorryMr, isQcRollbackOnly } from "./mrActionVisibility";

// TKT-000229 / TKT-000230: the MR list opens Pending / Approved MRs in view
// mode, so these helpers take no `mode` at all — status + edit access decide.

describe("canReopenMr", () => {
	it("shows Reopen for Pending and Approved MRs when the user has edit access", () => {
		expect(canReopenMr(MR_STATUS_IDS.PENDING, true)).toBe(true);
		expect(canReopenMr(MR_STATUS_IDS.APPROVED, true)).toBe(true);
	});

	it("offers the QC rollback on an Open MR only once QC is done (TKT-000229)", () => {
		expect(canReopenMr(MR_STATUS_IDS.OPEN, true, true)).toBe(true);
		expect(canReopenMr(MR_STATUS_IDS.OPEN, true, false)).toBe(false);
		expect(canReopenMr(MR_STATUS_IDS.OPEN, false, true)).toBe(false);
		expect(isQcRollbackOnly(MR_STATUS_IDS.OPEN)).toBe(true);
		expect(isQcRollbackOnly(MR_STATUS_IDS.PENDING)).toBe(false);
		expect(isQcRollbackOnly(MR_STATUS_IDS.APPROVED)).toBe(false);
	});

	it("hides Reopen for every other status", () => {
		for (const s of [
			MR_STATUS_IDS.DRAFT,
			MR_STATUS_IDS.OPEN,
			MR_STATUS_IDS.PENDING_APPROVAL,
			MR_STATUS_IDS.REJECTED,
			MR_STATUS_IDS.CANCELLED,
			MR_STATUS_IDS.CLOSED,
			MR_STATUS_IDS.RETURNED,
			null,
			undefined,
		]) {
			expect(canReopenMr(s, true)).toBe(false);
		}
	});

	it("hides Reopen without edit access on the MR menu", () => {
		expect(canReopenMr(MR_STATUS_IDS.PENDING, false)).toBe(false);
		expect(canReopenMr(MR_STATUS_IDS.APPROVED, false)).toBe(false);
	});
});

describe("canReturnLorryMr / canUnreturnLorryMr", () => {
	it("offers Return lorry on Open and Pending MRs that are not yet returned", () => {
		expect(canReturnLorryMr(MR_STATUS_IDS.OPEN, false, true)).toBe(true);
		expect(canReturnLorryMr(MR_STATUS_IDS.PENDING, false, true)).toBe(true);
		expect(canReturnLorryMr(MR_STATUS_IDS.APPROVED, false, true)).toBe(false);
		expect(canReturnLorryMr(MR_STATUS_IDS.PENDING, true, true)).toBe(false);
		expect(canReturnLorryMr(MR_STATUS_IDS.PENDING, false, false)).toBe(false);
	});

	it("offers Undo return only while the flag is set on an Open / Pending MR", () => {
		expect(canUnreturnLorryMr(MR_STATUS_IDS.OPEN, true, true)).toBe(true);
		expect(canUnreturnLorryMr(MR_STATUS_IDS.PENDING, true, true)).toBe(true);
		expect(canUnreturnLorryMr(MR_STATUS_IDS.PENDING, false, true)).toBe(false);
		expect(canUnreturnLorryMr(MR_STATUS_IDS.APPROVED, true, true)).toBe(false);
		expect(canUnreturnLorryMr(MR_STATUS_IDS.PENDING, true, false)).toBe(false);
	});
});
