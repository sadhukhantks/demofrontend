"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Divider,
	TextField,
	Typography,
} from "@mui/material";
import { CheckCircle2 as AgreeIcon, MessageSquareWarning as DisputeIcon } from "lucide-react";
import {
	DIALOG_ACTIONS_SX,
	MOBILE_FULL_BLEED_PAPER,
} from "@/components/ui/responsiveEntry";
import type { MechBreakdown } from "@/utils/juteMechanicalService";
import {
	durationMinutes,
	formatDateTimeDisplay,
	formatMinutes,
	toDateTimeLocalInput,
} from "../utils/breakdownCalc";

const MAX_REMARKS = 500;

export interface ConfirmFixDialogProps {
	/** The closed incident production is checking, or null when the dialog is shut. */
	entry: MechBreakdown | null;
	/** True while the request is in flight. */
	saving: boolean;
	/** Server-side failure from the last attempt. */
	error: string | null;
	onCancel: () => void;
	/**
	 * `agreed` accepts the fix as mechanical entered it. Otherwise the restart time
	 * (a `datetime-local` value) and/or the remark carry production's version.
	 */
	onConfirm: (agreed: boolean, restartDateTime: string, remarks: string) => void;
}

/**
 * Production's optional check of a fix mechanical has entered.
 *
 * Two outcomes: "Fix is correct", or "Record difference" with a remark and/or the
 * restart time production actually saw. Nothing mechanical entered is changed —
 * both versions stay on the incident.
 */
export default function ConfirmFixDialog({
	entry,
	saving,
	error,
	onCancel,
	onConfirm,
}: ConfirmFixDialogProps) {
	const [restartDateTime, setRestartDateTime] = React.useState<string>("");
	const [remarks, setRemarks] = React.useState<string>("");

	// Reset each time a different incident is opened; a previous answer is shown
	// so production can amend it rather than retype it.
	React.useEffect(() => {
		if (!entry) return;
		setRestartDateTime(toDateTimeLocalInput(entry.prod_restart_datetime));
		setRemarks(entry.prod_confirm_remarks ?? "");
	}, [entry]);

	const sinceStopMin = React.useMemo(
		() => (entry ? durationMinutes(entry.stop_datetime, restartDateTime) : null),
		[entry, restartDateTime]
	);

	const restartMessage =
		sinceStopMin != null && sinceStopMin < 0 ? "Cannot be before the stop time" : null;
	const hasDifference = restartDateTime.trim() !== "" || remarks.trim() !== "";

	return (
		<Dialog
			open={entry != null}
			onClose={saving ? undefined : onCancel}
			fullWidth
			maxWidth="sm"
			PaperProps={MOBILE_FULL_BLEED_PAPER}
		>
			<DialogTitle>Confirm fix (production)</DialogTitle>
			<DialogContent dividers>
				{entry ? (
					<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
						<Box>
							<Typography variant="subtitle2">
								{entry.mech_code ? `${entry.mech_code} — ` : ""}
								{entry.machine_name ?? `Machine #${entry.machine_id}`}
							</Typography>
							<Typography variant="caption" color="text.secondary" component="div">
								Stopped {formatDateTimeDisplay(entry.stop_datetime)}
								{entry.reported_by_user_name
									? ` · reported by ${entry.reported_by_user_name}`
									: ""}
							</Typography>
							<Typography variant="caption" color="text.secondary" component="div">
								Mechanical entered: restarted{" "}
								{entry.restart_datetime
									? formatDateTimeDisplay(entry.restart_datetime)
									: "— (no time keyed)"}
								{entry.duration_min != null
									? ` · downtime ${formatMinutes(Number(entry.duration_min))}`
									: ""}
								{entry.fixed_by_user_name ? ` · by ${entry.fixed_by_user_name}` : ""}
							</Typography>
						</Box>

						<Divider />

						<Typography variant="body2" color="text.secondary">
							If the fix is as entered, press “Fix is correct”. Otherwise give the
							restart time you saw and/or a remark and press “Record difference”.
						</Typography>

						<TextField
							type="datetime-local"
							label="Actual restart time"
							size="small"
							fullWidth
							value={restartDateTime}
							onChange={(event) => setRestartDateTime(event.target.value)}
							InputLabelProps={{ shrink: true }}
							error={restartMessage != null}
							helperText={
								restartMessage ??
								(sinceStopMin != null
									? `Downtime by this time: ${formatMinutes(sinceStopMin)}`
									: "Only if different from the time mechanical entered")
							}
						/>

						<TextField
							label="Production remark"
							size="small"
							fullWidth
							multiline
							minRows={2}
							value={remarks}
							onChange={(event) => setRemarks(event.target.value)}
							inputProps={{ maxLength: MAX_REMARKS }}
						/>

						{error ? <Alert severity="error">{error}</Alert> : null}
					</Box>
				) : null}
			</DialogContent>
			<DialogActions sx={DIALOG_ACTIONS_SX}>
				<Button type="button" onClick={onCancel} disabled={saving}>
					Cancel
				</Button>
				<Button
					type="button"
					variant="outlined"
					color="warning"
					startIcon={<DisputeIcon size={16} />}
					onClick={() => onConfirm(false, restartDateTime, remarks)}
					disabled={saving || !hasDifference || restartMessage != null}
				>
					Record difference
				</Button>
				<Button
					type="button"
					variant="contained"
					color="success"
					startIcon={<AgreeIcon size={16} />}
					onClick={() => onConfirm(true, "", remarks)}
					disabled={saving}
				>
					Fix is correct
				</Button>
			</DialogActions>
		</Dialog>
	);
}
