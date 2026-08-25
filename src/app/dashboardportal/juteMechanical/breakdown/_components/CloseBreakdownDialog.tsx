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
	TextField,
	Typography,
} from "@mui/material";
import { CheckCircle2 as CloseIcon } from "lucide-react";
import {
	DIALOG_ACTIONS_SX,
	MOBILE_FULL_BLEED_PAPER,
} from "@/components/ui/responsiveEntry";
import type { OpenBreakdownRow } from "../hooks/useOpenBreakdowns";
import {
	durationMinutes,
	formatDateTimeDisplay,
	formatMinutes,
	isFutureDateTime,
	nowDateTimeLocal,
	toNumberOrNull,
} from "../utils/breakdownCalc";

export interface CloseBreakdownDialogProps {
	/** The incident being closed, or null when the dialog is shut. */
	entry: OpenBreakdownRow | null;
	/** True while the close request is in flight. */
	closing: boolean;
	/** Server-side failure from the last attempt. */
	error: string | null;
	onCancel: () => void;
	/**
	 * Restart datetime is the `datetime-local` value; action taken and the keyed
	 * duration (whole minutes, blank = let the backend compute it) may be blank.
	 */
	onConfirm: (restartDateTime: string, actionTaken: string, durationMin: string) => void;
}

/**
 * Quick close from the live board: the one thing a supervisor does when a machine
 * comes back up. Only the restart time is required — the backend derives
 * `duration_min` from it and moves the incident to CLOSED.
 *
 * Validation mirrors the backend's 400s (restart not before the stop, not in the
 * future) and previews the downtime the close will record.
 */
export default function CloseBreakdownDialog({
	entry,
	closing,
	error,
	onCancel,
	onConfirm,
}: CloseBreakdownDialogProps) {
	const [restartDateTime, setRestartDateTime] = React.useState<string>("");
	const [actionTaken, setActionTaken] = React.useState<string>("");
	const [durationMin, setDurationMin] = React.useState<string>("");

	// Reset the fields each time a different incident is opened.
	React.useEffect(() => {
		if (!entry) return;
		setRestartDateTime(nowDateTimeLocal());
		setActionTaken("");
		setDurationMin("");
	}, [entry]);

	const computedDowntimeMin = React.useMemo(
		() => (entry ? durationMinutes(entry.stop_datetime, restartDateTime) : null),
		[entry, restartDateTime]
	);

	const keyedDurationMin = React.useMemo(() => toNumberOrNull(durationMin), [durationMin]);

	const restartMessage = React.useMemo(() => {
		if (restartDateTime.trim() === "") return "Restart date & time is required";
		if (isFutureDateTime(restartDateTime)) return "Restart time cannot be in the future";
		if (computedDowntimeMin != null && computedDowntimeMin < 0) {
			return "Restart cannot be before the stop time";
		}
		return null;
	}, [restartDateTime, computedDowntimeMin]);

	const durationMessage = React.useMemo(() => {
		if (durationMin.trim() === "") return null;
		if (keyedDurationMin == null || !Number.isInteger(keyedDurationMin)) {
			return "Duration must be a whole number of minutes";
		}
		if (keyedDurationMin < 1) return "Duration must be at least 1 minute";
		return null;
	}, [durationMin, keyedDurationMin]);

	// A keyed duration WINS over restart − stop, exactly as it does server-side.
	const downtimeMin = durationMessage == null && keyedDurationMin != null
		? keyedDurationMin
		: computedDowntimeMin;

	const handleConfirm = React.useCallback(() => {
		if (restartMessage || durationMessage) return;
		onConfirm(restartDateTime, actionTaken, durationMin);
	}, [actionTaken, durationMessage, durationMin, onConfirm, restartDateTime, restartMessage]);

	return (
		<Dialog
			open={entry != null}
			onClose={closing ? undefined : onCancel}
			fullWidth
			maxWidth="sm"
			PaperProps={MOBILE_FULL_BLEED_PAPER}
		>
			<DialogTitle>Close breakdown</DialogTitle>
			<DialogContent dividers>
				{entry ? (
					<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
						<Box>
							<Typography variant="subtitle2">
								{entry.mech_code ? `${entry.mech_code} — ` : ""}
								{entry.machine_name ?? `Machine #${entry.machine_id}`}
							</Typography>
							<Typography variant="caption" color="text.secondary" component="div">
								{entry.reason_code ? `${entry.reason_code} · ` : ""}
								{entry.reason_desc ?? "No reason recorded"}
							</Typography>
							<Typography variant="caption" color="text.secondary" component="div">
								Stopped {formatDateTimeDisplay(entry.stop_datetime)} · down for{" "}
								{formatMinutes(entry.live_elapsed_min)}
							</Typography>
						</Box>

						<TextField
							type="datetime-local"
							label="Restarted at"
							size="small"
							fullWidth
							required
							value={restartDateTime}
							onChange={(event) => setRestartDateTime(event.target.value)}
							InputLabelProps={{ shrink: true }}
							error={restartMessage != null}
							helperText={restartMessage ?? "Defaults to now"}
						/>

						<TextField
							type="number"
							label="Duration (min)"
							size="small"
							fullWidth
							value={durationMin}
							onChange={(event) => setDurationMin(event.target.value)}
							inputProps={{ step: 1, min: 1 }}
							error={durationMessage != null}
							helperText={
								durationMessage ?? "Optional — overrides the time-based duration"
							}
						/>

						<TextField
							label="Action taken"
							size="small"
							fullWidth
							multiline
							minRows={2}
							value={actionTaken}
							onChange={(event) => setActionTaken(event.target.value)}
							helperText="Optional — what fixed it"
						/>

						<Typography variant="body2" color="text.secondary">
							Downtime to be recorded:{" "}
							<Typography
								component="span"
								variant="body2"
								color="text.primary"
								fontWeight={600}
							>
								{downtimeMin == null || downtimeMin < 0 ? "—" : formatMinutes(downtimeMin)}
							</Typography>
						</Typography>

						{error ? <Alert severity="error">{error}</Alert> : null}
					</Box>
				) : null}
			</DialogContent>
			<DialogActions sx={DIALOG_ACTIONS_SX}>
				<Button type="button" onClick={onCancel} disabled={closing}>
					Cancel
				</Button>
				<Button
					type="button"
					variant="contained"
					startIcon={<CloseIcon size={16} />}
					onClick={handleConfirm}
					disabled={closing || restartMessage != null || durationMessage != null}
				>
					{closing ? "Closing…" : "Close breakdown"}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
