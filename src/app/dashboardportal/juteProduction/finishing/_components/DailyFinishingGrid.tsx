"use client";

import * as React from "react";
import { Alert, Box, IconButton, Snackbar, Tooltip, Typography } from "@mui/material";
import { Pencil as EditIcon, Trash2 as DeleteIcon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { FinishingEntryRow } from "../types/finishingTypes";
import { useFinishingEntriesByDate } from "../hooks/useFinishingEntriesByDate";
import { paramLabel, type FinishingProcessConfig } from "../_shared/finishingConfig";

type Props = {
	coId: string;
	branchId: number | null;
	process: string;
	config: FinishingProcessConfig;
	date: string;
	spellId: number | null;
	// Captured-param tokens for this process — extra read-only columns.
	paramTokens: string[];
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
	paramTokens,
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

	const columns = React.useMemo<GridColDef<FinishingEntryRow>[]>(() => {
		const base: GridColDef<FinishingEntryRow>[] = [
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
			{ field: "mech_code", headerName: "Mc Code", width: 100 },
			{ field: "machine_name", headerName: "Machine", width: 150 },
			{ field: "fin_quality_code", headerName: "Quality", width: 120 },
			{ field: "fin_quality_name", headerName: "Quality Name", width: 150 },
			{
				field: "input_qty",
				headerName: `Input (${config.inputUom})`,
				width: 110,
				type: "number",
			},
			{
				field: "prod_qty",
				headerName: `Output (${config.prodUom})`,
				width: 110,
				type: "number",
			},
			{ field: "prod_wt_kg", headerName: "Prod Wt (kg)", width: 110, type: "number" },
			{ field: "wastage_kg", headerName: "Wastage (kg)", width: 110, type: "number" },
		];

		const computed: GridColDef<FinishingEntryRow>[] = [
			{ field: "std_speed", headerName: "Std Spd", width: 90, type: "number" },
			{ field: "target_speed", headerName: "Tgt Spd", width: 90, type: "number" },
			{ field: "act_speed", headerName: "Act Spd", width: 90, type: "number" },
			{ field: "p100prod", headerName: "P100 Prod", width: 110, type: "number" },
			{ field: "std_prod", headerName: "Std Prod", width: 100, type: "number" },
			{ field: "target_prod", headerName: "Tgt Prod", width: 100, type: "number" },
			{ field: "act_eff", headerName: "Act Eff %", width: 100, type: "number" },
			{ field: "working_hours", headerName: "Work Hrs", width: 90, type: "number" },
		];

		// One read-only column per captured param (value pulled from the EAV list).
		const paramCols: GridColDef<FinishingEntryRow>[] = paramTokens.map((token) => ({
			field: `param_${token}`,
			headerName: paramLabel(token),
			width: 130,
			type: "number",
			sortable: false,
			valueGetter: (_value, row) => {
				const found = row.params?.find((p) => p.param === token);
				return found?.value ?? null;
			},
		}));

		return [...base, ...computed, ...paramCols];
	}, [handleDelete, onEdit, paramTokens, config.inputUom, config.prodUom]);

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
