"use client";

import * as React from "react";
import { Alert, Box, IconButton, Snackbar, Tooltip, Typography } from "@mui/material";
import { Trash2 as DeleteIcon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { WindingRow, SpinningQualityOption } from "../types/spinningTypes";
import { useWindingByDate } from "../hooks/useWinding";

type Props = {
	coId: string;
	branchId: number;
	date: string;
	shift: string;
	qualities: SpinningQualityOption[];
	// Bumped by the form after a successful save so the grid reloads.
	refreshSignal: number;
};

export default function WindingGrid({
	coId,
	branchId,
	date,
	shift,
	qualities,
	refreshSignal,
}: Props) {
	const { rows, loading, error, refresh } = useWindingByDate(coId, branchId, date, shift || null);
	const [snack, setSnack] = React.useState<string | null>(null);

	// Reload when the parent form signals a save.
	React.useEffect(() => {
		if (refreshSignal > 0) refresh();
	}, [refreshSignal, refresh]);

	const qualityLabel = React.useCallback(
		(id: number) => {
			const q = qualities.find((x) => x.yarn_quality_id === id);
			return q ? `${q.quality_code} — ${q.quality_name}` : String(id);
		},
		[qualities]
	);

	const handleDelete = React.useCallback(
		async (id: number) => {
			if (!confirm(`Delete winding entry #${id}?`)) return;
			const url = `${apiRoutesPortalMasters.WINDING_DELETE}/${id}?co_id=${coId}`;
			const { error: err } = await fetchWithCookie(url, "DELETE");
			if (err) {
				setSnack(err);
				return;
			}
			setSnack(`Deleted winding #${id}`);
			refresh();
		},
		[coId, refresh]
	);

	const columns = React.useMemo<GridColDef<WindingRow>[]>(
		() => [
			{
				field: "actions",
				headerName: "",
				width: 70,
				sortable: false,
				filterable: false,
				renderCell: (params) => (
					<Tooltip title="Delete">
						<IconButton
							size="small"
							color="error"
							onClick={() => handleDelete(params.row.winding_prod_id)}
							sx={{ minWidth: 40, minHeight: 40 }}
						>
							<DeleteIcon size={16} />
						</IconButton>
					</Tooltip>
				),
			},
			{ field: "winding_prod_id", headerName: "ID", width: 70 },
			{ field: "prod_date", headerName: "Date", width: 120 },
			{ field: "shift", headerName: "Shift", width: 80 },
			{
				field: "yarn_quality_id",
				headerName: "Quality",
				width: 220,
				valueGetter: (_v, row) => qualityLabel(row.yarn_quality_id),
			},
			{ field: "qty_wind", headerName: "Qty Wind", width: 120, type: "number" },
		],
		[handleDelete, qualityLabel]
	);

	return (
		<Box>
			<Typography variant="subtitle2" sx={{ mb: 1 }}>
				Winding entries
			</Typography>
			{error ? (
				<Alert severity="error" sx={{ mb: 1 }}>
					{error}
				</Alert>
			) : null}
			<Box sx={{ width: "100%", overflowX: "auto" }}>
				<DataGrid
					autoHeight
					rows={rows}
					getRowId={(r) => r.winding_prod_id}
					columns={columns}
					loading={loading}
					disableRowSelectionOnClick
					density="comfortable"
					pageSizeOptions={[10, 25, 50]}
					initialState={{
						pagination: { paginationModel: { pageSize: 25, page: 0 } },
					}}
					sx={{ minWidth: 700 }}
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
