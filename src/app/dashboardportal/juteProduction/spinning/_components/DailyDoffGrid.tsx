"use client";

import * as React from "react";
import { Alert, Box, Button, IconButton, Snackbar, Tooltip, Typography } from "@mui/material";
import { Pencil as EditIcon, Trash2 as DeleteIcon, Layers as DedupIcon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { DoffEntryRow } from "../types/spinningTypes";
import { useDoffEntriesByDate } from "../hooks/useDoffEntriesByDate";

type Props = {
	coId: string;
	branchId: number;
	date: string;
	spell: string;
	onEdit: (row: DoffEntryRow) => void;
};

export default function DailyDoffGrid({ coId, branchId, date, spell, onEdit }: Props) {
	const { rows, loading, error, refresh } = useDoffEntriesByDate(coId, date, branchId, spell);
	const [snack, setSnack] = React.useState<string | null>(null);
	const [busy, setBusy] = React.useState(false);

	const handleDelete = React.useCallback(
		async (id: number) => {
			if (!confirm(`Delete doff entry #${id}?`)) return;
			const url = `${apiRoutesPortalMasters.SPINNING_DOFF_DELETE}/${id}?co_id=${coId}`;
			const { error: err } = await fetchWithCookie(url, "DELETE");
			if (err) {
				setSnack(err);
				return;
			}
			setSnack(`Deleted doff #${id}`);
			refresh();
		},
		[coId, refresh]
	);

	const handleDedup = React.useCallback(async () => {
		if (!spell) {
			setSnack("Select a spell to dedup.");
			return;
		}
		setBusy(true);
		const body = { co_id: Number(coId), tran_date: date, spell };
		const { error: err } = await fetchWithCookie(
			apiRoutesPortalMasters.SPINNING_DOFF_DEDUP,
			"POST",
			body
		);
		setBusy(false);
		if (err) {
			setSnack(err);
			return;
		}
		setSnack("Dedup complete.");
		refresh();
	}, [coId, date, spell, refresh]);

	const columns = React.useMemo<GridColDef<DoffEntryRow>[]>(
		() => [
			{
				field: "actions",
				headerName: "",
				width: 100,
				sortable: false,
				filterable: false,
				renderCell: (params) => (
					<>
						<Tooltip title="Edit">
							<IconButton
								size="small"
								onClick={() => onEdit(params.row)}
								sx={{ minWidth: 40, minHeight: 40 }}
							>
								<EditIcon size={16} />
							</IconButton>
						</Tooltip>
						<Tooltip title="Delete">
							<IconButton
								size="small"
								color="error"
								onClick={() => handleDelete(params.row.daily_doff_tbl_id)}
								sx={{ minWidth: 40, minHeight: 40 }}
							>
								<DeleteIcon size={16} />
							</IconButton>
						</Tooltip>
					</>
				),
			},
			{ field: "daily_doff_tbl_id", headerName: "ID", width: 70 },
			{ field: "doff_date", headerName: "Date", width: 110 },
			{ field: "spell_code", headerName: "Spell", width: 70 },
			{ field: "mech_code", headerName: "Mc Code", width: 100 },
			{ field: "machine_name", headerName: "Machine", width: 170 },
			{ field: "trolly_name", headerName: "Trolly", width: 130 },
			{ field: "item_code", headerName: "Yarn", width: 110 },
			{ field: "gross_weight", headerName: "Gross", width: 90, type: "number" },
			{ field: "tare_weight", headerName: "Tare", width: 90, type: "number" },
			{ field: "net_weight", headerName: "Net", width: 90, type: "number" },
		],
		[handleDelete, onEdit]
	);

	return (
		<Box>
			<Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1, flexWrap: "wrap" }}>
				<Typography variant="subtitle2">Doff entries</Typography>
				<Button
					variant="outlined"
					size="small"
					startIcon={<DedupIcon size={16} />}
					onClick={handleDedup}
					disabled={busy || !spell}
				>
					Dedup
				</Button>
			</Box>
			{error ? (
				<Alert severity="error" sx={{ mb: 1 }}>
					{error}
				</Alert>
			) : null}
			<Box sx={{ width: "100%", overflowX: "auto" }}>
				<DataGrid
					autoHeight
					rows={rows}
					getRowId={(r) => r.daily_doff_tbl_id}
					columns={columns}
					loading={loading}
					disableRowSelectionOnClick
					density="comfortable"
					pageSizeOptions={[10, 25, 50]}
					initialState={{
						pagination: { paginationModel: { pageSize: 25, page: 0 } },
					}}
					sx={{ minWidth: 1100 }}
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
