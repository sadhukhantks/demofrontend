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
import { ClipboardCheck as InspectIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { markBalesInspected, type BaleStockRow } from "@/utils/baleStockService";
import { canInspect, latestPressDate, selectionSummary, todayISO } from "./baleStockCalc";
import InspectFormFields from "./InspectFormFields";
import { buildInspectPayload, inspectDefaults, inspectSchema, type InspectFormValues } from "./inspectSchema";

export interface MarkInspectedDialogProps {
	open: boolean;
	onClose: () => void;
	coId: number;
	branchId: number;
	/** The selected bales — all must be sacking and IN_STOCK (see `canInspect`). */
	rows: ReadonlyArray<BaleStockRow>;
	/** Called with the server's count after a successful save; the dialog then closes itself. */
	onDone: (marked: number) => void;
}

/**
 * @component MarkInspectedDialog
 * @description Records one inspection (date, certificate / ref no, inspector,
 * remarks) against every selected bale — POST /baleStock/inspect. The header
 * repeats what is selected; when the selection cannot be inspected (a hessian
 * bale, one already inspected or not in stock) the reason is shown and Save is
 * disabled, mirroring the server's own 400 matrix. The form is mounted only
 * while open so every opening starts from today's date and blank fields.
 */
export default function MarkInspectedDialog(props: MarkInspectedDialogProps) {
	return (
		<Dialog open={props.open} onClose={props.onClose} maxWidth="sm" fullWidth>
			{props.open ? <MarkInspectedForm {...props} /> : null}
		</Dialog>
	);
}

function MarkInspectedForm({ onClose, coId, branchId, rows, onDone }: MarkInspectedDialogProps) {
	const gate = React.useMemo(() => canInspect(rows), [rows]);
	const minDate = React.useMemo(() => latestPressDate(rows), [rows]);
	const today = todayISO();
	const [saveError, setSaveError] = React.useState<string | null>(null);

	const {
		control,
		handleSubmit,
		formState: { errors, isSubmitting },
	} = useForm<InspectFormValues>({
		resolver: zodResolver(inspectSchema),
		defaultValues: inspectDefaults(today),
		mode: "onTouched",
	});

	const submit = async (values: InspectFormValues) => {
		if (!gate.ok) return;
		setSaveError(null);
		const result = await markBalesInspected(
			buildInspectPayload(values, { coId, branchId, baleEntryIds: rows.map((r) => r.bale_entry_id) })
		);
		if (!result.ok) {
			setSaveError(result.error ?? "Could not mark the bales inspected");
			return;
		}
		onDone(result.marked);
		onClose();
	};

	return (
		<>
			<DialogTitle>Mark bales inspected</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
					<Typography variant="body2" sx={{ fontWeight: 600 }}>
						{selectionSummary(rows)}
					</Typography>
					{!gate.ok ? <Alert severity="error">{gate.reason}</Alert> : null}
					{saveError ? <Alert severity="error">{saveError}</Alert> : null}
					<InspectFormFields
						control={control}
						errors={errors}
						disabled={isSubmitting || !gate.ok}
						maxDate={today}
						minDate={minDate}
					/>
					<Typography variant="caption" color="text.secondary">
						Sacking bales only. A bale opened later for a repack starts uninspected again.
					</Typography>
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose} disabled={isSubmitting}>
					Cancel
				</Button>
				<Button
					variant="contained"
					startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : <InspectIcon size={16} />}
					onClick={() => {
						void handleSubmit(submit)();
					}}
					disabled={!gate.ok || isSubmitting}
					sx={{ minHeight: 40 }}
				>
					{isSubmitting ? "Saving…" : `Mark ${rows.length} inspected`}
				</Button>
			</DialogActions>
		</>
	);
}
