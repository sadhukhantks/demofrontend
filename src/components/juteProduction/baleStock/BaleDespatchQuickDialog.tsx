"use client";

import * as React from "react";
import {
	Alert,
	Box,
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
import { fetchBaleStockRows, linkBalesToInvoice, type BaleStockRow } from "@/utils/baleStockService";
import BaleRangeSelector from "./BaleRangeSelector";
import BaleStockGrid from "./BaleStockGrid";
import {
	canLink,
	latestPressDate,
	mergeLinkableRows,
	noInvoiceDespatchCount,
	seriesOptionsFromRows,
	todayISO,
	uninspectedSackingCount,
	type DespatchResult,
} from "./baleStockCalc";
import InvoiceLinkFields from "./InvoiceLinkFields";
import { buildLinkPayload, describeLinkErrors, type LinkFormValues } from "./linkSchema";
import { useInvoiceLinkForm } from "./useInvoiceLinkForm";

/** What the dialog hands back after a save — see `DespatchResult`. */
export type BaleDespatchQuickResult = DespatchResult;

/**
 * Prop contract consumed by the Finishing Stock page (it imports this exactly).
 * Do not rename or retype these without changing that page too.
 */
export interface BaleDespatchQuickDialogProps {
	open: boolean;
	onClose: () => void;
	coId: number;
	branchId: number;
	/** The stock day being viewed — bales are loaded as on it and the despatch defaults to it / the invoice date. */
	asOn: string;
	finishingQualityId: number;
	/** Display name of the quality, for the title and the empty state. */
	qualityName: string;
	/** Called after a successful save; the dialog then closes itself. */
	onLinked: (result: BaleDespatchQuickResult) => void;
}

/**
 * @component BaleDespatchQuickDialog
 * @description The "Mark despatched" entry point on a Finishing Stock derived
 * bale line (hessian or sacking): loads that quality's bales in stock as on the
 * day plus the ones already despatched without an invoice (GET
 * /baleStock/bales?status=STOCK and ?status=DESPATCHED, the latter kept only
 * where `despatch.invoice_id` is null), lets the operator tick them
 * (checkboxes or a bale-number range) and either links them to one sales
 * invoice or marks them despatched without one, with the same form as
 * `LinkInvoiceDialog` (`InvoiceLinkFields` over `useInvoiceLinkForm`) — POST
 * /baleStock/despatch. Uninspected sacking is only warned about, not blocked.
 * The body is mounted only while open so each opening reloads and resets.
 */
export default function BaleDespatchQuickDialog(props: BaleDespatchQuickDialogProps) {
	return (
		<Dialog open={props.open} onClose={props.onClose} maxWidth="lg" fullWidth>
			{props.open ? <QuickBody {...props} /> : null}
		</Dialog>
	);
}

function QuickBody({ onClose, coId, branchId, asOn, finishingQualityId, qualityName, onLinked }: BaleDespatchQuickDialogProps) {
	const today = todayISO();
	const [rows, setRows] = React.useState<BaleStockRow[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [loadError, setLoadError] = React.useState<string | null>(null);
	const [saveError, setSaveError] = React.useState<string | null>(null);
	const [selectedIds, setSelectedIds] = React.useState<number[]>([]);

	React.useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setLoadError(null);
		const scope = { coId, branchId, asOn, finishingQualityId };
		Promise.all([
			fetchBaleStockRows({ ...scope, status: "STOCK" }),
			fetchBaleStockRows({ ...scope, status: "DESPATCHED" }),
		])
			.then(([stock, despatched]) => {
				if (cancelled) return;
				setRows(mergeLinkableRows(stock.rows, despatched.rows));
				setSelectedIds([]);
			})
			.catch((err: Error) => {
				if (cancelled) return;
				setLoadError(err.message);
				setRows([]);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [coId, branchId, asOn, finishingQualityId]);

	const series = React.useMemo(() => seriesOptionsFromRows(rows), [rows]);
	const noInvoiceRows = React.useMemo(() => noInvoiceDespatchCount(rows), [rows]);
	const selectedRows = React.useMemo(() => {
		const wanted = new Set(selectedIds);
		return rows.filter((r) => wanted.has(r.bale_entry_id));
	}, [rows, selectedIds]);
	const gate = React.useMemo(() => canLink(selectedRows), [selectedRows]);
	const minDate = React.useMemo(() => latestPressDate(selectedRows), [selectedRows]);
	const uninspectedSacking = React.useMemo(() => uninspectedSackingCount(selectedRows), [selectedRows]);
	const relinkCount = React.useMemo(() => noInvoiceDespatchCount(selectedRows), [selectedRows]);

	const form = useInvoiceLinkForm({ coId, branchId, asOn, noInvoiceDespatched: relinkCount });
	const {
		handleSubmit,
		isSubmitting,
		loading: formLoading,
		loadError: formError,
		mode,
		ready,
		invoiceRef,
	} = form;
	const noInvoice = mode === "NO_INVOICE";

	const addIds = (ids: number[]) =>
		setSelectedIds((prev) => {
			const next = new Set(prev);
			ids.forEach((id) => next.add(id));
			return [...next];
		});

	const submit = async (values: LinkFormValues) => {
		if (!gate.ok) return;
		setSaveError(null);
		const result = await linkBalesToInvoice(buildLinkPayload(values, { coId, branchId, baleEntryIds: selectedIds }));
		if (!result.ok) {
			setSaveError(
				result.error ??
					(values.mode === "NO_INVOICE" ? "Could not mark the bales despatched" : "Could not link the bales to the invoice")
			);
			return;
		}
		onLinked({
			linked: result.linked,
			relinked: result.relinked,
			uninspectedSacking: result.uninspectedSacking,
			invoiceRef: invoiceRef(values),
		});
		onClose();
	};

	const empty = !loading && !loadError && rows.length === 0;
	const busy = isSubmitting || loading || formLoading;
	const n = selectedIds.length;
	const balesWord = n === 1 ? "bale" : "bales";

	return (
		<>
			<DialogTitle>Mark despatched — {qualityName}</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
					<Typography variant="body2" color="text.secondary">
						{qualityName} bales in stock as on {asOn}
						{noInvoiceRows > 0
							? `, plus ${noInvoiceRows} already despatched without an invoice (shown last — tick them to link their invoice)`
							: ""}
						. Tick the bales (or pick a bale-number range), then either choose the sales invoice they went out on or
						mark them despatched without one (delivery challan / DO / transfer / sample, invoice linked later) — they
						leave stock from the despatch date.
					</Typography>
					{loadError ? <Alert severity="error">{loadError}</Alert> : null}
					{formError ? <Alert severity="error">{formError}</Alert> : null}
					{saveError ? <Alert severity="error">{saveError}</Alert> : null}
					{empty ? (
						<Alert severity="info">
							No {qualityName} bales to despatch as on {asOn} — every bale of this quality is already despatched
							against an invoice or repacked.
						</Alert>
					) : (
						<>
							<BaleRangeSelector
								series={series}
								rows={rows}
								selectedCount={n}
								onAddIds={addIds}
								onClearSelection={() => setSelectedIds([])}
								disabled={loading || isSubmitting}
							/>
							<BaleStockGrid
								rows={rows}
								loading={loading}
								selectedIds={selectedIds}
								onSelectionChange={setSelectedIds}
								compact
								emptyText="No bales to despatch"
							/>
							{n > 0 && !gate.ok ? <Alert severity="error">{gate.reason}</Alert> : null}
							{uninspectedSacking > 0 ? (
								<Alert severity="warning">
									{uninspectedSacking} sacking {uninspectedSacking === 1 ? "bale" : "bales"} in the selection{" "}
									{uninspectedSacking === 1 ? "is" : "are"} not inspected —{" "}
									{uninspectedSacking === 1 ? "it" : "they"} will be despatched anyway.
								</Alert>
							) : null}
							<Box>
								<Typography variant="subtitle2" sx={{ mb: 1 }}>
									Despatch
								</Typography>
								<Stack spacing={2}>
									<InvoiceLinkFields
										form={form}
										disabled={isSubmitting || formLoading}
										asOn={asOn}
										maxDate={today}
										minDate={minDate}
									/>
								</Stack>
							</Box>
						</>
					)}
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose} disabled={isSubmitting}>
					{empty ? "Close" : "Cancel"}
				</Button>
				{!empty ? (
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
				) : null}
			</DialogActions>
		</>
	);
}
