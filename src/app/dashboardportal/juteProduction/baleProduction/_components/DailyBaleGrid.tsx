"use client";

import * as React from "react";
import { Box, Chip, IconButton, Tooltip } from "@mui/material";
import { Pencil as EditIcon, Trash2 as Trash2Icon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { BALE_ENTRY_TYPES, type BaleRow } from "../types/baleTypes";
import { deviationPct, deviationSeverity, formatKg, formatPct, formatTime } from "../utils/baleCalc";

export interface DailyBaleGridProps {
	/** Active bale rows for the selected date (both entry types, all spells). */
	rows: ReadonlyArray<BaleRow>;
	loading: boolean;
	/** Lift a row into the entry form for editing. */
	onEdit: (row: BaleRow) => void;
	/** Ask the page to soft-delete the row (the page owns the API call). */
	onDelete: (row: BaleRow) => void;
	/** Disables the row actions while a mutation is in flight. */
	actionsDisabled: boolean;
	/** Row being edited — highlighted so the operator sees what the form holds. */
	editingId?: number | null;
}

/**
 * Day grid for Bale Production (SPEC §8.1): every bale weighed on the selected
 * date, newest first, with a type chip (PROD / REPACK), the F0 weights and the
 * deviation vs the standard snapshot. Presentational only — actions go upward.
 */
export default function DailyBaleGrid({
	rows,
	loading,
	onEdit,
	onDelete,
	actionsDisabled,
	editingId,
}: DailyBaleGridProps) {
	const columns = React.useMemo<GridColDef<BaleRow>[]>(
		() => [
			{
				field: "actions",
				headerName: "",
				width: 96,
				sortable: false,
				filterable: false,
				renderCell: (params) => (
					<Box>
						<Tooltip title="Edit">
							<span>
								<IconButton
									size="small"
									color="primary"
									disabled={actionsDisabled}
									onClick={() => onEdit(params.row)}
									sx={{ minWidth: 40, minHeight: 40 }}
								>
									<EditIcon size={16} />
								</IconButton>
							</span>
						</Tooltip>
						<Tooltip title="Delete">
							<span>
								<IconButton
									size="small"
									color="error"
									disabled={actionsDisabled}
									onClick={() => onDelete(params.row)}
									sx={{ minWidth: 40, minHeight: 40 }}
								>
									<Trash2Icon size={16} />
								</IconButton>
							</span>
						</Tooltip>
					</Box>
				),
			},
			{
				field: "weigh_time",
				headerName: "Time",
				width: 80,
				valueFormatter: (value) => formatTime(value as string | null),
			},
			{
				field: "spell_code",
				headerName: "Spell",
				width: 80,
				valueGetter: (value) => value ?? "",
			},
			{
				field: "entry_type",
				headerName: "Type",
				width: 100,
				renderCell: (params) =>
					params.value === BALE_ENTRY_TYPES.REPACK ? (
						<Chip label="Repack" size="small" color="secondary" variant="outlined" />
					) : (
						<Chip label="Prod" size="small" variant="outlined" />
					),
			},
			{
				field: "item_name",
				headerName: "Quality",
				flex: 1,
				minWidth: 200,
				// Left-joined — a deactivated item comes back null; show the id
				// rather than an empty cell that reads like a load failure.
				valueGetter: (value, row) => value ?? String(row.item_id),
			},
			{
				field: "series_name",
				headerName: "Series",
				width: 130,
				valueGetter: (value, row) => value ?? String(row.bale_series_id),
			},
			{ field: "bale_no", headerName: "Bale No", width: 100, type: "number" },
			{
				field: "original_bale_no",
				headerName: "Original No",
				width: 110,
				type: "number",
				valueFormatter: (value) => (value == null ? "" : String(value)),
			},
			{
				field: "gross_wt",
				headerName: "Gross",
				width: 90,
				type: "number",
				valueFormatter: (value) => formatKg(value as number | null),
			},
			{
				field: "trolly_wt",
				headerName: "Trolley",
				width: 90,
				type: "number",
				valueGetter: (value) => value ?? 0,
				renderCell: (params) => (
					<Tooltip title={params.row.trolly_name ?? "Scale tared"}>
						<span>{formatKg(params.value as number)}</span>
					</Tooltip>
				),
			},
			{
				field: "net_wt",
				headerName: "Net",
				width: 90,
				type: "number",
				valueFormatter: (value) => formatKg(value as number | null),
			},
			{
				field: "std_bale_wt",
				headerName: "Std",
				width: 80,
				type: "number",
				valueFormatter: (value) => (value == null ? "—" : formatKg(value as number)),
			},
			{
				field: "dev_pct",
				headerName: "Dev %",
				width: 100,
				type: "number",
				valueGetter: (_value, row) => deviationPct(Number(row.net_wt), row.std_bale_wt),
				renderCell: (params) => {
					const pct = params.value as number | null;
					if (pct == null) return "—";
					const sev = deviationSeverity(pct);
					return (
						<Box component="span" sx={{ color: sev === "warn" ? "warning.main" : "success.main", fontWeight: 500 }}>
							{formatPct(pct)}
						</Box>
					);
				},
			},
			{ field: "machine_name", headerName: "Machine", width: 130, valueGetter: (value) => value ?? "" },
			{ field: "remarks", headerName: "Remarks", flex: 1, minWidth: 140, valueGetter: (value) => value ?? "" },
		],
		[actionsDisabled, onDelete, onEdit]
	);

	// Newest weighing first — the operator's eye lands on what they just saved.
	const sorted = React.useMemo(
		() => [...rows].sort((a, b) => (b.weigh_time ?? "").localeCompare(a.weigh_time ?? "") || b.bale_entry_id - a.bale_entry_id),
		[rows]
	);

	return (
		<Box sx={{ width: "100%" }}>
			<DataGrid
				autoHeight
				rows={sorted}
				getRowId={(r) => r.bale_entry_id}
				columns={columns}
				loading={loading}
				disableRowSelectionOnClick
				density="compact"
				pageSizeOptions={[25, 50, 100]}
				initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
				getRowClassName={(params) => (params.id === editingId ? "bale-row-editing" : "")}
				sx={{
					width: "100%",
					"& .bale-row-editing": { bgcolor: "action.selected" },
				}}
			/>
		</Box>
	);
}
