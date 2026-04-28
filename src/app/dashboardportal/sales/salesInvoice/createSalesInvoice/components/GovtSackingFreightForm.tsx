"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import TextField from "@mui/material/TextField";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
	createInvoice,
	sendInvoiceForApproval,
	type InvoiceDetails,
	type CreateInvoiceRequest,
} from "@/utils/salesInvoiceService";
import type {
	GovtSackingSourceDetail,
	GovtSackingSourceRow,
	InvoiceSetupData,
} from "../types/salesInvoiceTypes";
import { GovtSackingSourcePicker } from "./GovtSackingSourcePicker";
import { GovtSackingSourcePreview } from "./GovtSackingSourcePreview";
import SalesInvoicePreview from "./SalesInvoicePreview";
import { GOVT_SKG_FREIGHT_INVOICE_TYPE_ID } from "../utils/salesInvoiceConstants";
import { computeFreightTax, FREIGHT_GST_PERCENT } from "../utils/freightTax";
import { buildFreightPreviewProps } from "../utils/buildFreightPreviewProps";
import { buildFreightCreatePreviewProps } from "../utils/buildFreightCreatePreviewProps";

const FOOTER_NOTES_MAX = 252;

type Mode = "create" | "view";

type Props = {
	coId: string;
	branchId: string;
	mode: Mode;
	existingInvoice?: InvoiceDetails | null;
	menuId?: string;
	setupData?: InvoiceSetupData | null;
};

type FreightFormState = {
	source: GovtSackingSourceDetail | null;
	sourceRow: GovtSackingSourceRow | null;
	invoiceDate: string;
	iwBillNo: string;
	iwBillDate: string;
	containerNo: string;
	vehicleNo: string;
	freightAmount: string;
	balesQty: string;
};

type Errors = Partial<Record<keyof FreightFormState, string>>;

const todayISO = (): string => {
	const d = new Date();
	const yyyy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
};

const buildFooterNotes = (state: FreightFormState): string => {
	if (!state.source) return "";
	const segments: string[] = [];
	const pcsoNo = state.source.header.pcso_no;
	const pcsoDate = state.source.header.pcso_date;
	if (pcsoNo) segments.push(`PCSO No.${pcsoNo}${pcsoDate ? ` Date:${pcsoDate}` : ""}`);
	if (state.iwBillNo) segments.push(`IW Bill No.${state.iwBillNo}${state.iwBillDate ? ` Date:${state.iwBillDate}` : ""}`);
	if (state.containerNo) segments.push(`Container No.${state.containerNo}`);
	const joined = segments.join(" | ");
	if (joined.length <= FOOTER_NOTES_MAX) return joined;
	return `${joined.slice(0, FOOTER_NOTES_MAX)}...`;
};

function buildViewState(invoice: InvoiceDetails): FreightFormState {
	const freight = invoice.freight ?? null;
	return {
		source: null,
		sourceRow: null,
		invoiceDate: invoice.invoiceDate ?? "",
		iwBillNo: freight?.iwBillNo ?? "",
		iwBillDate: freight?.iwBillDate ?? "",
		containerNo: "",
		vehicleNo: "",
		freightAmount: "",
		balesQty: "",
	};
}

export function GovtSackingFreightForm({ coId, branchId, mode, existingInvoice, menuId, setupData }: Props) {
	const router = useRouter();
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const [state, setState] = React.useState<FreightFormState>(() => {
		if (mode === "view" && existingInvoice) return buildViewState(existingInvoice);
		const today = todayISO();
		return {
			source: null,
			sourceRow: null,
			invoiceDate: today,
			iwBillNo: "",
			iwBillDate: today,
			containerNo: "",
			vehicleNo: "",
			freightAmount: "",
			balesQty: "",
		};
	});

	const [errors, setErrors] = React.useState<Errors>({});
	const [submitting, setSubmitting] = React.useState(false);

	const handleSourceSelect = React.useCallback(
		(detail: GovtSackingSourceDetail | null, row: GovtSackingSourceRow | null) => {
			if (!detail || !row) {
				setState((prev) => ({
					...prev,
					source: null,
					sourceRow: null,
					vehicleNo: "",
					containerNo: "",
					balesQty: "",
				}));
				return;
			}
			setState((prev) => ({
				...prev,
				source: detail,
				sourceRow: row,
				vehicleNo: detail.header.vehicle_no ?? "",
				containerNo: detail.header.container_no ?? "",
				balesQty: detail.lines[0] ? String(detail.lines[0].quantity ?? "") : "",
			}));
			setErrors({});
		},
		[],
	);

	const intraInter = React.useMemo<string | number | null>(() => {
		const src = state.source?.header;
		if (!src) return null;
		const branch = setupData?.branches?.find((b) => b.branch_id === src.branch_id);
		const companyStateCode = branch?.state_code;
		const shippingStateCode = src.shipping_state_code;
		if (companyStateCode == null || shippingStateCode == null) return src.intra_inter_state ?? null;
		return String(companyStateCode) === String(shippingStateCode) ? "0" : "1";
	}, [state.source, setupData?.branches]);
	const freightAmountNum = Number(state.freightAmount) || 0;
	const balesQtyNum = Number(state.balesQty) || 0;

	const tax = React.useMemo(() => computeFreightTax(freightAmountNum, intraInter), [freightAmountNum, intraInter]);
	const footerNotesPreview = React.useMemo(() => buildFooterNotes(state), [state]);
	const grandTotal = +(freightAmountNum + tax.total).toFixed(2);

	const createPreviewProps = React.useMemo(
		() => buildFreightCreatePreviewProps({
			setupData: setupData ?? null,
			branchId,
			source: state.source,
			invoiceDate: state.invoiceDate,
			iwBillNo: state.iwBillNo,
			iwBillDate: state.iwBillDate,
			containerNo: state.containerNo,
			vehicleNo: state.vehicleNo,
			freightAmount: freightAmountNum,
			balesQty: balesQtyNum,
			footerNote: footerNotesPreview,
		}),
		[setupData, branchId, state, freightAmountNum, balesQtyNum, footerNotesPreview],
	);

	const validate = React.useCallback((): Errors => {
		const next: Errors = {};
		if (!state.source) {
			next.source = "Select a source Govt Sacking invoice";
			return next;
		}
		if (!state.invoiceDate) next.invoiceDate = "Required";
		else if (state.invoiceDate > todayISO()) next.invoiceDate = "Invoice date cannot be in the future";
		if (!state.iwBillNo.trim()) next.iwBillNo = "Required";
		else if (state.iwBillNo.length > 100) next.iwBillNo = "Max 100 characters";
		if (!state.iwBillDate) next.iwBillDate = "Required";
		if (!state.containerNo.trim()) next.containerNo = "Required";
		else if (state.containerNo.length > 100) next.containerNo = "Max 100 characters";
		if (!state.vehicleNo.trim()) next.vehicleNo = "Required";
		else if (state.vehicleNo.length > 255) next.vehicleNo = "Max 255 characters";
		if (!state.freightAmount || freightAmountNum <= 0) next.freightAmount = "Must be greater than 0";
		if (!state.balesQty || balesQtyNum <= 0 || !Number.isInteger(balesQtyNum)) next.balesQty = "Must be a positive integer";
		return next;
	}, [state, freightAmountNum, balesQtyNum]);

	const buildPayload = React.useCallback((): CreateInvoiceRequest => {
		if (!state.source) throw new Error("Source not selected");
		return {
			branch: branchId,
			date: state.invoiceDate,
			party: String(state.source.header.party_id),
			invoice_type: GOVT_SKG_FREIGHT_INVOICE_TYPE_ID,
			co_id: Number(coId),
			footer_note: footerNotesPreview || undefined,
			gross_amount: freightAmountNum,
			net_amount: grandTotal,
			freight: {
				source_invoice_id: state.source.header.invoice_id,
				iw_bill_no: state.iwBillNo,
				iw_bill_date: state.iwBillDate,
				container_no: state.containerNo,
				vehicle_no: state.vehicleNo,
				freight_amount: freightAmountNum,
				bales_qty: balesQtyNum,
			},
			items: [],
		};
	}, [state, branchId, coId, footerNotesPreview, freightAmountNum, grandTotal, balesQtyNum]);

	const submit = React.useCallback(
		async (alsoSendForApproval: boolean) => {
			const validation = validate();
			setErrors(validation);
			if (Object.keys(validation).length > 0) {
				toast({ variant: "destructive", title: "Please correct the highlighted fields" });
				return;
			}
			setSubmitting(true);
			try {
				const result = await createInvoice(buildPayload());
				const invoiceId = result?.invoice_id;
				if (!invoiceId) throw new Error("Backend did not return an invoice ID");

				if (alsoSendForApproval) {
					try {
						await sendInvoiceForApproval(String(invoiceId));
					} catch (err) {
						toast({
							variant: "destructive",
							title: "Saved as Draft, but Send for Approval failed",
							description: err instanceof Error ? err.message : "Please retry from the detail page.",
						});
					}
				}

				toast({ title: result?.message ?? "Govt Sacking Freight invoice created" });
				const params = new URLSearchParams();
				params.set("mode", "view");
				params.set("id", String(invoiceId));
				if (branchId) params.set("branch_id", branchId);
				if (menuId) params.set("menu_id", menuId);
				router.replace(`/dashboardportal/sales/salesInvoice/createSalesInvoice?${params.toString()}`);
			} catch (error) {
				toast({
					variant: "destructive",
					title: "Unable to create freight invoice",
					description: error instanceof Error ? error.message : "Please try again.",
				});
			} finally {
				setSubmitting(false);
			}
		},
		[validate, buildPayload, branchId, menuId, router],
	);

	if (!mounted) return null;

	const isView = mode === "view";
	const sourceReady = isView ? Boolean(existingInvoice) : Boolean(state.source);
	const fieldDisabled = isView || submitting || !sourceReady;
	const actionsDisabled = submitting || !sourceReady;

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
			{!isView ? (
				<Box>
					<GovtSackingSourcePicker
						coId={coId}
						branchId={branchId}
						value={state.sourceRow}
						onSelect={handleSourceSelect}
						disabled={submitting}
					/>
					{errors.source ? (
						<Typography variant="caption" color="error" sx={{ display: "block", mt: 0.5 }}>
							{errors.source}
						</Typography>
					) : null}
				</Box>
			) : null}

			{isView && existingInvoice?.freight?.source ? (
				<Paper variant="outlined" sx={{ p: 2, bgcolor: "action.hover" }}>
					<Typography variant="subtitle2">Source Govt Sacking Invoice</Typography>
					<Divider sx={{ my: 1 }} />
					<Typography variant="body2">
						Invoice No <strong>{existingInvoice.freight.source.invoice_no ?? "—"}</strong>
						{existingInvoice.freight.source.invoice_date ? ` (${existingInvoice.freight.source.invoice_date})` : ""}
						{existingInvoice.freight.source.pcso_no ? ` — PCSO ${existingInvoice.freight.source.pcso_no}` : ""}
					</Typography>
				</Paper>
			) : null}

			{state.source ? <GovtSackingSourcePreview source={state.source} /> : null}

			<Paper variant="outlined" sx={{ p: 2 }}>
				<Typography variant="subtitle2" sx={{ mb: 1 }}>
					Freight Details
				</Typography>
				<Divider sx={{ mb: 2 }} />
				{!sourceReady && !isView ? (
					<Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
						Select a source Govt Sacking invoice above to enable these fields.
					</Typography>
				) : null}
				<Grid container spacing={2}>
					<Grid size={{ xs: 12, md: 4 }}>
						<TextField
							label="Invoice Date"
							type="date"
							fullWidth
							required
							value={state.invoiceDate}
							onChange={(e) => setState((prev) => ({ ...prev, invoiceDate: e.target.value }))}
							error={Boolean(errors.invoiceDate)}
							helperText={errors.invoiceDate}
							InputLabelProps={{ shrink: true }}
							disabled={fieldDisabled}
						/>
					</Grid>
					<Grid size={{ xs: 12, md: 4 }}>
						<TextField
							label="IW Bill No"
							fullWidth
							required
							inputProps={{ maxLength: 100 }}
							value={state.iwBillNo}
							onChange={(e) => setState((prev) => ({ ...prev, iwBillNo: e.target.value }))}
							error={Boolean(errors.iwBillNo)}
							helperText={errors.iwBillNo}
							disabled={fieldDisabled}
						/>
					</Grid>
					<Grid size={{ xs: 12, md: 4 }}>
						<TextField
							label="IW Bill Date"
							type="date"
							fullWidth
							required
							value={state.iwBillDate}
							onChange={(e) => setState((prev) => ({ ...prev, iwBillDate: e.target.value }))}
							error={Boolean(errors.iwBillDate)}
							helperText={errors.iwBillDate}
							InputLabelProps={{ shrink: true }}
							disabled={fieldDisabled}
						/>
					</Grid>
					<Grid size={{ xs: 12, md: 4 }}>
						<TextField
							label="Container No"
							fullWidth
							required
							inputProps={{ maxLength: 100 }}
							value={state.containerNo}
							onChange={(e) => setState((prev) => ({ ...prev, containerNo: e.target.value }))}
							error={Boolean(errors.containerNo)}
							helperText={errors.containerNo}
							disabled={fieldDisabled}
						/>
					</Grid>
					<Grid size={{ xs: 12, md: 4 }}>
						<TextField
							label="Vehicle No"
							fullWidth
							required
							inputProps={{ maxLength: 255 }}
							value={state.vehicleNo}
							onChange={(e) => setState((prev) => ({ ...prev, vehicleNo: e.target.value }))}
							error={Boolean(errors.vehicleNo)}
							helperText={errors.vehicleNo}
							disabled={fieldDisabled}
						/>
					</Grid>
					<Grid size={{ xs: 12, md: 4 }}>
						<TextField
							label="Freight Amount (₹)"
							type="number"
							fullWidth
							required
							inputProps={{ min: 0, step: "0.01" }}
							value={state.freightAmount}
							onChange={(e) => setState((prev) => ({ ...prev, freightAmount: e.target.value }))}
							error={Boolean(errors.freightAmount)}
							helperText={errors.freightAmount}
							disabled={fieldDisabled}
						/>
					</Grid>
					<Grid size={{ xs: 12, md: 4 }}>
						<TextField
							label="Bales Qty"
							type="number"
							fullWidth
							required
							inputProps={{ min: 1, step: 1 }}
							value={state.balesQty}
							onChange={(e) => setState((prev) => ({ ...prev, balesQty: e.target.value }))}
							error={Boolean(errors.balesQty)}
							helperText={errors.balesQty}
							disabled={fieldDisabled}
						/>
					</Grid>
				</Grid>
			</Paper>

			{!isView ? (
				<Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, pt: 1 }}>
					<Button
						type="button"
						variant="outline"
						onClick={() => router.push("/dashboardportal/sales/salesInvoice")}
						disabled={submitting}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={() => void submit(false)}
						disabled={actionsDisabled}
					>
						{submitting ? "Saving..." : "Save as Draft"}
					</Button>
					<Button
						type="button"
						onClick={() => void submit(true)}
						disabled={actionsDisabled}
					>
						{submitting ? "Saving..." : "Save + Send for Approval"}
					</Button>
				</Box>
			) : null}

			{!isView && state.source ? (
				<Paper variant="outlined" sx={{ p: 3, mt: 2 }}>
					<Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
						Printable Preview ({String(intraInter ?? "") === "0" ? "Intra-state" : "Inter-state"} @ {FREIGHT_GST_PERCENT}%) — Grand Total: ₹{grandTotal.toFixed(2)}
					</Typography>
					<Divider sx={{ mb: 2 }} />
					<SalesInvoicePreview {...createPreviewProps} />
				</Paper>
			) : null}

			{isView && existingInvoice ? (
				<Paper variant="outlined" sx={{ p: 3 }}>
					<Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
						Printable Preview
					</Typography>
					<Divider sx={{ mb: 2 }} />
					<SalesInvoicePreview {...buildFreightPreviewProps(existingInvoice)} />
				</Paper>
			) : null}
		</Box>
	);
}

export default GovtSackingFreightForm;
