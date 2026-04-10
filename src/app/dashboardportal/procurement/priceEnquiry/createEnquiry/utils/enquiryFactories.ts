import type { EnquiryLineItem } from "../types/enquiryTypes";

let lineIdSeed = 0;

/**
 * Generates a unique stable line identifier for optimistic UI operations.
 */
export const generateEnquiryLineId = () => {
	lineIdSeed += 1;
	return `enq-line-${lineIdSeed}`;
};

/**
 * Creates a blank enquiry line scaffold that the UI can bind to.
 * Used for the trailing blank row pattern in the line items table.
 */
export const createBlankEnquiryLine = (): EnquiryLineItem => ({
	id: generateEnquiryLineId(),
	indentDtlId: undefined,
	indentNo: undefined,
	itemId: undefined,
	itemCode: undefined,
	itemName: undefined,
	itemMakeId: undefined,
	itemMakeName: undefined,
	uomId: undefined,
	uomName: undefined,
	qty: undefined,
	remarks: "",
});

/**
 * Default form values used when creating a new price enquiry.
 */
export const buildDefaultEnquiryFormValues = () => ({
	branch: "",
	date: new Date().toISOString().slice(0, 10),
	enquiryType: "",
	expenseType: "",
	project: "",
	remarks: "",
});
