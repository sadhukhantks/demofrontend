"use client";

import * as React from "react";
import { Box, Chip, IconButton, Paper, Snackbar, Tooltip, Typography } from "@mui/material";
import { Trash2 as DeleteOutlineIcon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { SqcCountReadingRow, SqcCountAverageRow } from "../types/sqcSpinningTypes";

type Props = {
	coId: string;
	readings: SqcCountReadingRow[];
	averages: SqcCountAverageRow[];
	loading: boolean;
	onDeleted: () => void;
};

// Each reading is a distinct observation; resolve whichever id field the backend sends.
function rowKey(r: SqcCountReadingRow): number | string {
	return (
		r.jute_sqc_spinning_count_id ??
		r.sqc_spinning_count_id ??
		r.id ??
		`${r.entry_date}-${r.yarn_quality_id}-${r.mc_id ?? "x"}-${r.spell_id ?? "x"}-${r.observed_count}`
	);
}

export default function CountGrid({ coId, readings, averages, loading, onDeleted }: Props) {
	const [snack, setSnack] = React.useState<string | null>(null);

	const handleDelete = React.useCallback(
		async (id: number | string) => {
			if (typeof id !== "number") {
				setSnack("This reading cannot be deleted (no server id).");
				return;
			}
			if (!confirm(`Delete count reading #${id}?`)) return;
			const url = `${apiRoutesPortalMasters.SPINNING_SQC_COUNT_DELETE}/${id}?co_id=${coId}`;
			const { error } = await fetchWithCookie(url, "DELETE");
			if (error) {
				setSnack(error);
				return;
			}
			setSnack(`Deleted count reading #${id}`);
			onDeleted();
		},
		[coId, onDeleted]
	);

	const columns = React.useMemo<GridColDef<SqcCountReadingRow>[]>(
		() => [
			{
				field: "actions",
				headerName: "",
				width: 60,
				sortable: false,
				filterable: false,
				renderCell: (params) => (
					<Tooltip title="Delete reading">
						<IconButton
							size="small"
							color="error"
							onClick={() => handleDelete(rowKey(params.row))}
							sx={{ minWidth: 40, minHeight: 40 }}
						>
							<DeleteOutlineIcon size={16} />
						</IconButton>
					</Tooltip>
				),
			},
			{
				field: "spell_code",
				headerName: "Spell",
				width: 120,
				valueGetter: (_value, row) =>
					row.spell_code ?? row.spell_name ?? (row.spell_id != null ? `Spell #${row.spell_id}` : "—"),
			},
			{
				field: "machine_name",
				headerName: "Machine",
				width: 170,
				valueGetter: (_value, row) =>
					row.machine_name ?? (row.mc_id != null ? `MC #${row.mc_id}` : "—"),
			},
			{
				field: "quality_name",
				headerName: "Quality",
				width: 180,
				valueGetter: (_value, row) =>
					row.quality_name ?? row.quality_code ?? `Q #${row.yarn_quality_id}`,
			},
			{
				field: "dp",
				headerName: "DP",
				width: 90,
				type: "number",
				valueFormatter: (value) => (value != null ? Number(value).toFixed(2) : ""),
			},
			{
				field: "tp",
				headerName: "TP",
				width: 90,
				type: "number",
				valueFormatter: (value) => (value != null ? Number(value).toFixed(2) : ""),
			},
			{
				field: "wt_450_gms",
				headerName: "WT/450 (gms)",
				width: 130,
				type: "number",
				valueFormatter: (value) => (value != null ? Number(value).toFixed(3) : ""),
			},
			{
				field: "mr_pct",
				headerName: "MR %",
				width: 90,
				type: "number",
				valueFormatter: (value) => (value != null ? Number(value).toFixed(2) : ""),
			},
			{
				field: "observed_count",
				headerName: "Observed Count",
				width: 140,
				type: "number",
				valueFormatter: (value) => (value != null ? Number(value).toFixed(2) : ""),
			},
			{
				field: "corrected_count",
				headerName: "Corrected Count",
				width: 140,
				type: "number",
				valueFormatter: (value) => (value != null ? Number(value).toFixed(2) : ""),
			},
		],
		[handleDelete]
	);

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			{/* Per-quality average panel */}
			<Paper variant="outlined" sx={{ p: 2 }}>
				<Typography variant="subtitle2" sx={{ mb: 1, color: "text.secondary" }}>
					Average Count by Quality (observed / corrected)
				</Typography>
				{averages.length === 0 ? (
					<Typography variant="body2" color="text.secondary">
						No readings yet for this date.
					</Typography>
				) : (
					<Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
						{averages.map((a) => (
							<Chip
								key={a.yarn_quality_id}
								color="primary"
								variant="outlined"
								label={`${a.quality_name ?? a.quality_code ?? `Q #${a.yarn_quality_id}`}: ${
									a.avg_count != null ? Number(a.avg_count).toFixed(2) : "—"
								} / ${a.avg_corrected != null ? Number(a.avg_corrected).toFixed(2) : "—"}`}
							/>
						))}
					</Box>
				)}
			</Paper>

			{/* Readings grid */}
			<Box sx={{ width: "100%", overflowX: "auto" }}>
				<DataGrid
					autoHeight
					rows={readings}
					getRowId={rowKey}
					columns={columns}
					loading={loading}
					disableRowSelectionOnClick
					density="comfortable"
					pageSizeOptions={[10, 25, 50]}
					initialState={{
						pagination: { paginationModel: { pageSize: 25, page: 0 } },
					}}
					sx={{ minWidth: 900 }}
				/>
			</Box>

			<Snackbar
				open={!!snack}
				autoHideDuration={3000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</Box>
	);
}
