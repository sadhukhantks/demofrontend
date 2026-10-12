"use client";

import * as React from "react";
import {
	Alert,
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Stack,
	Typography,
} from "@mui/material";
import { Link2 as LinkIcon, Truck as DespatchIcon } from "lucide-react";
import { linkBalesToInvoice, type BaleStockRow } from "@/utils/baleStockService";
import {
	canLink,
	latestPressDate,
	noInvoiceDespatchCount,
	selectionSummary,
	todayISO,
	uninspectedSackingCount,
	type DespatchResult,
} from "./baleStockCalc";
import InvoiceLinkFields from "./InvoiceLinkFields";
import { buildLinkPayload, describeLinkErrors, type LinkFormValues } from "./linkSchema";
import { useInvoiceLinkForm } from "./useInvoiceLinkForm";

/** What the dialog hands back after a save — see `DespatchResult`. */
export type LinkInvoiceDialogResult = DespatchResult;

export interface LinkInvoiceDialogProps {
	open: boolean;
	onClose: () => void;
	coId: number;
	branchId: number;
	/** Stock date of the page — the invoice window ends here and the no-invoice despatch defaults to it. */
	asOn: string;
	/** The selected bales — in stock, or already despatched without invoice (see `canLink`). */
	rows: ReadonlyArray<BaleStockRow>;
	/** Called after a successful save; the dialog then closes itself. */
	onDone: (result: LinkInvoiceDialogResult) => void;
}

/**
 * @component LinkInvoiceDialog
 * @description Marks the selected bales despatched — POST /baleStock/despatch.
 * Either against one sales invoice of the branch (Regular / Hessian / Govt
 * Sacking, not rejected or cancelled; the bales leave stock from the despatch
 * date, which defaults to the invoice date) or without an invoice on a
 * delivery challan / DO / transfer / sample, to be linked later (spec §7b).
 * Bales already despatched without invoice in the selection are relinked to
 * the chosen invoice, and the form is locked to that mode. Despatch without
 * inspection is allowed (the mill ships uninspected sacking against non-govt
 * orders) so the dialog only warns about it. The form comes from
 * `useInvoiceLinkForm` / `InvoiceLinkFields`, shared with
 * `BaleDespatchQuickDialog`; the body is mounted only while open so each
 * opening reloads and resets.
 */
export default function LinkInvoiceDialog(props: LinkInvoiceDialogProps) {
	return (
		<Dialog open={props.open} onClose={props.onClose} maxWidth="md" fullWidth>
			{props.open ? <LinkInvoiceForm {...props} /> : null}
		</Dialog>
	);
}

function LinkInvoiceForm({ onClose, coId, branchId, asOn, rows, onDone }: LinkInvoiceDialogProps) {
	const today = todayISO();
	const gate = React.useMemo(() => canLink(rows), [rows]);
	const minDate = React.useMemo(() => latestPressDate(rows), [rows]);
	const uninspectedSacking = React.useMemo(() => uninspectedSackingCount(rows), [rows]);
	const relinkCount = React.useMemo(() => noInvoiceDespatchCount(rows), [rows]);
	const [saveError, setSaveError] = React.useState<string | null>(null);

	const form = useInvoiceLinkForm({ coId, branchId, asOn, noInvoiceDespatched: relinkCount });
	const { handleSubmit, isSubmitting, loading, loadError, mode, ready, invoiceRef } = form;
	const noInvoice = mode === "NO_INVOICE";

	const submit = async (values: LinkFormValues) => {
		if (!gate.ok) return;
		setSaveError(null);
		const result = await linkBalesToInvoice(
			buildLinkPayload(values, { coId, branchId, baleEntryIds: rows.map((r) => r.bale_entry_id) })
		);
		if (!result.ok) {
			setSaveError(
				result.error ??
					(values.mode === "NO_INVOICE" ? "Could not mark the bales despatched" : "Could not link the bales to the invoice")
			);
			return;
		}
		onDone({
			linked: result.linked,
			relinked: result.relinked,
			uninspectedSacking: result.uninspectedSacking,
			invoiceRef: invoiceRef(values),
		});
		onClose();
	};

	const busy = isSubmitting || loading;
	const n = rows.length;
	const balesWord = n === 1 ? "bale" : "bales";

	return (
		<>
			<DialogTitle>Mark despatched / Link to invoice</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
					<Typography variant="body2" sx={{ fontWeight: 600 }}>
						{selectionSummary(rows)}
					</Typography>
					{!gate.ok ? <Alert severity="error">{gate.reason}</Alert> : null}
					{uninspectedSacking > 0 ? (
						<Alert severity="warning">
							{uninspectedSacking} sacking {uninspectedSacking === 1 ? "bale" : "bales"} in the selection{" "}
							{uninspectedSacking === 1 ? "is" : "are"} not inspected — {uninspectedSacking === 1 ? "it" : "they"}{" "}
							will be despatched anyway.
						</Alert>
					) : null}
					{loadError ? <Alert severity="error">{loadError}</Alert> : null}
					{saveError ? <Alert severity="error">{saveError}</Alert> : null}
					<InvoiceLinkFields
						form={form}
						disabled={busy || !gate.ok}
						asOn={asOn}
						maxDate={today}
						minDate={minDate}
					/>
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose} disabled={isSubmitting}>
					Cancel
				</Button>
				<Button
					variant="contained"
					startIcon={
						isSubmitting ? (
							<CircularProgress size={16} color="inherit" />
						) : noInvoice ? (
							<DespatchIcon size={16} />
						) : (
							<LinkIcon size={16} />
						)
					}
					onClick={() => {
						void handleSubmit(submit, (errs) => setSaveError(describeLinkErrors(errs)))();
					}}
					disabled={!gate.ok || busy || !ready}
					sx={{ minHeight: 40 }}
				>
					{isSubmitting
						? "Saving…"
						: noInvoice
							? `Mark ${n} ${balesWord} despatched`
							: `Link ${n} ${balesWord} to invoice`}
				</Button>
			</DialogActions>
		</>
	);
}
