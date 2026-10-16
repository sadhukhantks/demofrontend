/**
 * @file MRReopenDialog.tsx
 * @description Dialog for reopening a Pending (13) / Approved (3) MR back to
 * Open (1) — decision D2 (2026-09-03). Offers two targets: plain MR edit, or
 * MR edit + redo QC (qc_check reset). Shows the backend's issue warning, if any.
 *
 * `qcOnly` (TKT-000229, 2026-10-16): on an Open MR whose QC is done the only
 * sensible rollback is to QC, so the dialog offers that single target and reads
 * "Roll back to QC"; the MR stays Open.
 */

import React from "react";
import {
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Button,
	Typography,
	Box,
	CircularProgress,
	RadioGroup,
	FormControlLabel,
	Radio,
	Alert,
} from "@mui/material";

export type MRReopenTarget = "open" | "qc";

type MRReopenDialogProps = {
	open: boolean;
	loading: boolean;
	/** Warning surfaced after a successful reopen (e.g. issues already drawn). */
	warning?: string | null;
	/** Open MR with QC done: offer only the QC rollback. */
	qcOnly?: boolean;
	onClose: () => void;
	onConfirm: (target: MRReopenTarget) => void;
};

/**
 * Dialog for choosing the reopen target before rolling the MR back to Open.
 */
export function MRReopenDialog({ open, loading, warning, qcOnly = false, onClose, onConfirm }: MRReopenDialogProps) {
	const [target, setTarget] = React.useState<MRReopenTarget>(qcOnly ? "qc" : "open");

	React.useEffect(() => {
		if (open) {
			setTarget(qcOnly ? "qc" : "open");
		}
	}, [open, qcOnly]);

	const handleConfirm = () => {
		onConfirm(qcOnly ? "qc" : target);
	};

	const busyLabel = qcOnly ? "Rolling back..." : "Reopening...";
	const confirmLabel = qcOnly ? "Roll back to QC" : "Reopen";

	return (
		<Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="xs" fullWidth>
			<DialogTitle>{qcOnly ? "Roll back to Quality Check" : "Reopen Material Receipt"}</DialogTitle>
			<DialogContent>
				<Box sx={{ pt: 1 }}>
					{qcOnly ? (
						<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
							This MR is Open and its quality check is complete. Rolling it back lists it again under
							Jute Quality Check so the inspection (PO, lines, weights) can be redone. The MR stays Open.
						</Typography>
					) : (
						<>
							<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
								This rolls the MR back to Open so it can be edited. Choose what should reopen.
							</Typography>

							<RadioGroup
								value={target}
								onChange={(e) => setTarget(e.target.value as MRReopenTarget)}
							>
								<FormControlLabel value="open" control={<Radio />} label="Reopen for MR edit" disabled={loading} />
								<FormControlLabel
									value="qc"
									control={<Radio />}
									label="Reopen for QC — gate entry and inspection can be redone"
									disabled={loading}
								/>
							</RadioGroup>
						</>
					)}

					{warning ? (
						<Alert severity="warning" sx={{ mt: 2 }}>
							{warning}
						</Alert>
					) : null}
				</Box>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose} disabled={loading} color="inherit">
					Cancel
				</Button>
				<Button
					onClick={handleConfirm}
					disabled={loading}
					variant="contained"
					color="warning"
					startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
				>
					{loading ? busyLabel : confirmLabel}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

export default MRReopenDialog;
