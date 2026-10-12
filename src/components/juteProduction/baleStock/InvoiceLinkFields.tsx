"use client";

import {
	Alert,
	Box,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableRow,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography,
} from "@mui/material";
import { Controller } from "react-hook-form";
import { BACKDATE_DAYS_MAX, laterOf, minBackdateISO } from "@/utils/backdate";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { formatKg } from "./baleStockCalc";
import { DESPATCH_REF_MAX, INVOICE_WINDOW_DAYS, LINK_REMARKS_MAX, type DespatchMode } from "./linkSchema";
import type { InvoiceLinkForm } from "./useInvoiceLinkForm";

export interface InvoiceLinkFieldsProps {
	/** From `useInvoiceLinkForm` — the invoice list, the reasons, the form control and the handlers. */
	form: InvoiceLinkForm;
	disabled: boolean;
	/** Stock date — the invoice window ends here (helper text only). */
	asOn: string;
	/** Latest allowed despatch date (today). */
	maxDate: string;
	/** Earliest sensible date — the latest press date among the selected bales; null when unknown. */
	minDate: string | null;
}

const FIELD_GRID_SX = {
	display: "grid",
	gap: 2,
	gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
} as const;

/**
 * @component InvoiceLinkFields
 * @description The "Mark despatched / Link to invoice" inputs, wired to the
 * form from `useInvoiceLinkForm` and shared by `LinkInvoiceDialog` and
 * `BaleDespatchQuickDialog` so the two entry points cannot drift. A mode
 * toggle at the top picks **Against invoice** (invoice picker with the chosen
 * invoice's cloth lines and already-linked count, despatch date defaulting to
 * the invoice date, reference no, remarks) or **Without invoice** (reason,
 * reference no — challan / DO, despatch date, remarks; the invoice is linked
 * later). When the selection already holds bales despatched without invoice
 * the toggle is locked to Against invoice and a notice says they will be
 * linked to the chosen invoice (spec §7b).
 */
export default function InvoiceLinkFields({ form, disabled, asOn, maxDate, minDate }: InvoiceLinkFieldsProps) {
	const {
		control,
		errors,
		mode,
		onModeChange,
		modeLocked,
		relinkCount,
		invoices,
		invoiceOptions,
		chosen,
		reasons,
		reasonOptions,
		loading,
		onInvoiceChange,
		onReasonChange,
	} = form;
	const noInvoice = mode === "NO_INVOICE";
	const lockHint = modeLocked
		? `${relinkCount} ${relinkCount === 1 ? "bale is" : "bales are"} already despatched without invoice — ${
				relinkCount === 1 ? "it" : "they"
			} can only be linked to an invoice`
		: "";

	return (
		<>
			<Box>
				<ToggleButtonGroup
					value={mode}
					exclusive
					size="small"
					color="primary"
					disabled={disabled}
					onChange={(_e, next: DespatchMode | null) => {
						if (next) onModeChange(next);
					}}
					aria-label="Despatch mode"
				>
					<ToggleButton value="INVOICE">Against invoice</ToggleButton>
					{/* A disabled button fires no events, so the tooltip hangs on a wrapper. */}
					<Tooltip title={lockHint} arrow>
						<span>
							<ToggleButton value="NO_INVOICE" disabled={disabled || modeLocked}>
								Without invoice
							</ToggleButton>
						</span>
					</Tooltip>
				</ToggleButtonGroup>
				<Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
					{noInvoice
						? "Delivery challan / delivery order / transfer / sample — link the invoice later from Bale Stock."
						: "The bales leave stock on the despatch date, which defaults to the invoice date."}
				</Typography>
			</Box>

			{relinkCount > 0 ? (
				<Alert severity="info">
					{relinkCount} {relinkCount === 1 ? "bale" : "bales"} already despatched without invoice will be linked
					to this invoice.
				</Alert>
			) : null}

			{noInvoice ? (
				<Controller
					name="despatch_reason"
					control={control}
					render={({ field }) => (
						<SearchableOptionSelect<string>
							label="Reason"
							required
							fullWidth
							options={reasonOptions}
							value={field.value}
							onChange={(v) => onReasonChange(String(v))}
							loading={loading}
							disabled={disabled}
							error={!!errors.despatch_reason}
							helperText={
								errors.despatch_reason?.message ??
								(loading
									? "Loading reasons…"
									: reasons.length === 0
										? "No despatch reasons configured"
										: "Why the bales left without an invoice")
							}
							noOptionsText="No matching reason"
						/>
					)}
				/>
			) : (
				<Controller
					name="invoice_id"
					control={control}
					render={({ field }) => (
						<SearchableOptionSelect<string>
							label="Invoice"
							required
							fullWidth
							options={invoiceOptions}
							value={field.value}
							onChange={(v) => onInvoiceChange(String(v))}
							loading={loading}
							disabled={disabled}
							error={!!errors.invoice_id}
							helperText={
								errors.invoice_id?.message ??
								(loading
									? "Loading invoices…"
									: invoices.length === 0
										? `No open Regular / Hessian / Govt Sacking invoices for this branch in the ${INVOICE_WINDOW_DAYS} days up to ${asOn}`
										: `${invoices.length} invoices in the ${INVOICE_WINDOW_DAYS} days up to ${asOn} — type to search`)
							}
							noOptionsText="No matching invoice"
						/>
					)}
				/>
			)}

			{!noInvoice && chosen ? (
				<Box>
					<Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 0.5 }}>
						<Typography variant="subtitle2">Invoice lines</Typography>
						<Typography variant="caption" color={chosen.linked_bales > 0 ? "warning.main" : "text.secondary"}>
							already linked: {chosen.linked_bales}
						</Typography>
					</Box>
					{chosen.lines.length === 0 ? (
						<Typography variant="body2" color="text.secondary">
							No cloth lines on this invoice.
						</Typography>
					) : (
						<Table size="small">
							<TableHead>
								<TableRow>
									<TableCell>Item</TableCell>
									<TableCell align="right">Quantity</TableCell>
									<TableCell>UoM</TableCell>
									<TableCell align="right">Bales</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{chosen.lines.map((l) => (
									<TableRow key={l.invoice_line_item_id}>
										<TableCell>{l.item_name ?? (l.item_id != null ? `#${l.item_id}` : "")}</TableCell>
										<TableCell align="right">{formatKg(l.quantity)}</TableCell>
										<TableCell>{l.uom_name ?? ""}</TableCell>
										<TableCell align="right">{l.qty_bales ?? ""}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</Box>
			) : null}

			<Box sx={FIELD_GRID_SX}>
				<Controller
					name="despatch_date"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							type="date"
							label="Despatch date"
							size="small"
							required
							fullWidth
							disabled={disabled}
							error={!!errors.despatch_date}
							helperText={
								errors.despatch_date?.message ??
								(noInvoice
									? minDate
										? `Not before the last press date (${minDate})`
										: "The day the bales left"
									: minDate
										? `Defaults to the invoice date; not before the last press date (${minDate})`
										: "Defaults to the invoice date")
							}
							slotProps={{
								inputLabel: { shrink: true },
								htmlInput: { min: laterOf(minDate, minBackdateISO()), max: maxDate },
							}}
						/>
					)}
				/>
				<Controller
					name="despatch_ref"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							label="Reference no (challan / DO)"
							size="small"
							fullWidth
							disabled={disabled}
							error={!!errors.despatch_ref}
							helperText={errors.despatch_ref?.message}
							slotProps={{ htmlInput: { maxLength: DESPATCH_REF_MAX } }}
						/>
					)}
				/>
				<Controller
					name="remarks"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							label="Remarks"
							size="small"
							fullWidth
							disabled={disabled}
							error={!!errors.remarks}
							helperText={errors.remarks?.message}
							slotProps={{ htmlInput: { maxLength: LINK_REMARKS_MAX } }}
							sx={{ gridColumn: { sm: "1 / -1" } }}
						/>
					)}
				/>
			</Box>
		</>
	);
}
