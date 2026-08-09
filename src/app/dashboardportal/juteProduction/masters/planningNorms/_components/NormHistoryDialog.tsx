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
	IconButton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableRow,
	Typography,
} from "@mui/material";
import { X as CloseIcon, Trash2 as DeleteIcon } from "lucide-react";
import {
	deleteNorm,
	fetchNormsList,
	type NormHistoryRow,
	type PlanningNormIdType,
} from "@/utils/juteProductionPlanningService";
import { PARAM_LABELS } from "./planningNormsConstants";

export type NormHistoryDialogProps = {
	open: boolean;
	coId: number | string;
	idType: PlanningNormIdType;
	refId: number | null;
	refLabel: string;
	onClose: () => void;
	/** Fired after a row is deactivated so the caller can refresh the grid. */
	onChanged: () => void;
};

/**
 * Read-only audit trail for one (id_type, ref_id): every effective-dated norm
 * row ever entered (all params), newest first, with a soft-delete action per
 * active row (norms_delete). Backs the "History" affordance per grid row.
 */
export default function NormHistoryDialog({
	open,
	coId,
	idType,
	refId,
	refLabel,
	onClose,
	onChanged,
}: NormHistoryDialogProps) {
	const [rows, setRows] = React.useState<NormHistoryRow[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [busyId, setBusyId] = React.useState<number | null>(null);

	const refresh = React.useCallback(async () => {
		if (!open || refId == null || !coId) return;
		setLoading(true);
		setError(null);
		try {
			const data = await fetchNormsList({ coId, idType, refId });
			const sorted = [...data].sort((a, b) => {
				if (a.effective_date !== b.effective_date) {
					return a.effective_date < b.effective_date ? 1 : -1;
				}
				return a.param.localeCompare(b.param);
			});
			setRows(sorted);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load history");
		} finally {
			setLoading(false);
		}
	}, [open, coId, idType, refId]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	const handleDeactivate = async (row: NormHistoryRow) => {
		setBusyId(row.planning_norm_id);
		setError(null);
		try {
			await deleteNorm({ planningNormId: row.planning_norm_id, coId });
			await refresh();
			onChanged();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to deactivate row");
		} finally {
			setBusyId(null);
		}
	};

	return (
		<Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
			<DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
				<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
					History — {refLabel}
				</Typography>
				<IconButton size="small" onClick={onClose} aria-label="Close">
					<CloseIcon size={18} />
				</IconButton>
			</DialogTitle>
			<DialogContent dividers>
				{error ? (
					<Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
						{error}
					</Alert>
				) : null}
				{loading ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
						<CircularProgress size={28} />
					</Box>
				) : rows.length === 0 ? (
					<Alert severity="info">No history for this row yet.</Alert>
				) : (
					<Table size="small">
						<TableHead>
							<TableRow>
								<TableCell>Effective</TableCell>
								<TableCell>Param</TableCell>
								<TableCell align="right">Value</TableCell>
								<TableCell>Status</TableCell>
								<TableCell align="right">Action</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{rows.map((r) => (
								<TableRow key={r.planning_norm_id}>
									<TableCell>{r.effective_date}</TableCell>
									<TableCell>{PARAM_LABELS[r.param] ?? r.param}</TableCell>
									<TableCell align="right">{r.value}</TableCell>
									<TableCell>
										<Typography variant="caption" color={r.active ? "text.secondary" : "error"}>
											{r.active ? "Active" : "Inactive"}
										</Typography>
									</TableCell>
									<TableCell align="right">
										{r.active ? (
											<IconButton
												size="small"
												onClick={() => void handleDeactivate(r)}
												disabled={busyId === r.planning_norm_id}
												aria-label="Deactivate"
											>
												<DeleteIcon size={16} />
											</IconButton>
										) : null}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>Close</Button>
			</DialogActions>
		</Dialog>
	);
}
