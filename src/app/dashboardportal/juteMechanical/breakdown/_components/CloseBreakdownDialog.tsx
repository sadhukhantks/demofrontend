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
import type { OpenBreakdownRow } from "../hooks/useOpenBreakdowns";
import {
	durationMinutes,
	formatDateTimeDisplay,
	formatMinutes,
	isFutureDateTime,
	nowDateTimeLocal,
} from "../utils/breakdownCalc";

export interface CloseBreakdownDialogProps {
	/** The incident being closed, or null when the dialog is shut. */
	entry: OpenBreakdownRow | null;
	/** True while the close request is in flight. */
	closing: boolean;
	/** Server-side failure from the last attempt. */
	error: string | null;
	onCancel: () => void;
	/** Restart datetime is the `datetime-local` value; action taken may be blank. */
	onConfirm: (restartDateTime: string, actionTaken: string) => void;
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

	// Reset the fields each time a different incident is opened.
	React.useEffect(() => {
		if (!entry) return;
		setRestartDateTime(nowDateTimeLocal());
		setActionTaken("");
	}, [entry]);

	const downtimeMin = React.useMemo(
		() => (entry ? durationMinutes(entry.stop_datetime, restartDateTime) : null),
		[entry, restartDateTime]
	);

	const validationMessage = React.useMemo(() => {
		if (restartDateTime.trim() === "") return "Restart date & time is required";
		if (isFutureDateTime(restartDateTime)) return "Restart time cannot be in the future";
		if (downtimeMin != null && downtimeMin < 0) {
			return "Restart cannot be before the stop time";
		}
		return null;
	}, [restartDateTime, downtimeMin]);

	const handleConfirm = React.useCallback(() => {
		if (validationMessage) return;
		onConfirm(restartDateTime, actionTaken);
	}, [actionTaken, onConfirm, restartDateTime, validationMessage]);

	return (
		<Dialog open={entry != null} onClose={closing ? undefined : onCancel} fullWidth maxWidth="sm">
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
							error={validationMessage != null}
							helperText={validationMessage ?? "Defaults to now"}
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
			<DialogActions>
				<Button type="button" onClick={onCancel} disabled={closing} sx={{ minHeight: 40 }}>
					Cancel
				</Button>
				<Button
					type="button"
					variant="contained"
					startIcon={<CloseIcon size={16} />}
					onClick={handleConfirm}
					disabled={closing || validationMessage != null}
					sx={{ minHeight: 40 }}
				>
					{closing ? "Closing…" : "Close breakdown"}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
