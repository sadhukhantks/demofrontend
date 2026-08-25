"use client";

import * as React from "react";
import { Alert, Box, IconButton, Snackbar, Tooltip, Typography } from "@mui/material";
import { Pencil as EditIcon, Trash2 as DeleteIcon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { FinishingEntryRow } from "../types/finishingTypes";
import { useFinishingEntriesByDate } from "../hooks/useFinishingEntriesByDate";
import type { FinishingProcessConfig } from "../_shared/finishingConfig";

type Props = {
	coId: string;
	branchId: number | null;
	process: string;
	config: FinishingProcessConfig;
	date: string;
	spellId: number | null;
	// Bumped by the parent after a save to auto-refresh the grid.
	refreshKey?: number;
	onEdit: (row: FinishingEntryRow) => void;
};

export default function DailyFinishingGrid({
	coId,
	branchId,
	process,
	config,
	date,
	spellId,
	refreshKey,
	onEdit,
}: Props) {
	const { rows, loading, error, refresh } = useFinishingEntriesByDate(
		coId,
		date,
		process,
		branchId,
		spellId,
		undefined,
		refreshKey
	);
	const [snack, setSnack] = React.useState<string | null>(null);

	const handleDelete = React.useCallback(
		async (id: number) => {
			if (!confirm(`Delete ${config.title} entry #${id}?`)) return;
			const url = `${apiRoutesPortalMasters.FINISHING_PROD_ENTRY_DELETE}/${id}?co_id=${coId}`;
			const { error: err } = await fetchWithCookie(url, "DELETE");
			if (err) {
				setSnack(err);
				return;
			}
			setSnack(`Deleted entry #${id}`);
			refresh();
		},
		[coId, config.title, refresh]
	);

	const columns = React.useMemo<GridColDef<FinishingEntryRow>[]>(
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
								onClick={() => handleDelete(params.row.finishing_daily_id)}
								sx={{ minWidth: 40, minHeight: 40 }}
							>
								<DeleteIcon size={16} />
							</IconButton>
						</Tooltip>
					</>
				),
			},
			{ field: "finishing_daily_id", headerName: "ID", width: 70 },
			{ field: "tran_date", headerName: "Date", width: 110 },
			{ field: "spell_code", headerName: "Spell", width: 80 },
			// Machine columns on every process except the labour-only one (sacksewing);
			// worker columns whenever a worker can key the row. Machine-and/or-worker
			// processes show both, dashed where the row has no machine.
			...(config.usesEmployee
				? []
				: [
						{
							field: "mech_code",
							headerName: "Mc Code",
							width: 100,
							valueFormatter: (v: string | null) => v ?? "—",
						},
						{
							field: "machine_name",
							headerName: "Machine",
							width: 150,
							valueFormatter: (v: string | null) => v ?? "—",
						},
					]),
			...(config.usesEmployee || config.allowsEmployee
				? [
						{
							field: "emp_code",
							headerName: "Emp Code",
							width: 110,
							valueFormatter: (v: string | null) => v ?? "—",
						},
						{
							field: "emp_name",
							headerName: "Employee",
							width: 180,
							valueFormatter: (v: string | null) => v ?? "—",
						},
					]
				: []),
			{ field: "fin_quality_code", headerName: "Quality", width: 120 },
			{ field: "fin_quality_name", headerName: "Quality Name", width: 150 },
			{
				field: "prod_qty",
				headerName: `Production (${config.prodUom})`,
				width: 140,
				type: "number",
			},
		],
		[handleDelete, onEdit, config.prodUom, config.usesEmployee, config.allowsEmployee]
	);

	return (
		<Box>
			<Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1, flexWrap: "wrap" }}>
				<Typography variant="subtitle2">Today&apos;s {config.title} entries</Typography>
			</Box>
			{error ? (
				<Alert severity="error" sx={{ mb: 1 }}>
					{error}
				</Alert>
			) : null}
			<Box sx={{ width: "100%" }}>
				<DataGrid
					autoHeight
					rows={rows}
					getRowId={(r) => r.finishing_daily_id}
					columns={columns}
					loading={loading}
					disableRowSelectionOnClick
					density="comfortable"
					pageSizeOptions={[10, 25, 50]}
					initialState={{
						pagination: { paginationModel: { pageSize: 25, page: 0 } },
					}}
					sx={{ width: "100%" }}
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
