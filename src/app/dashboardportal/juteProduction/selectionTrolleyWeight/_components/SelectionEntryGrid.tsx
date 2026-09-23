"use client";

import * as React from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import { Pencil as EditIcon, Trash2 as Trash2Icon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import type { SelectionRow } from "../types/selectionTypes";
import { formatKg, formatTime, gateEntryShort } from "../utils/selectionCalc";

export interface SelectionEntryGridProps {
	/** Active rows for the selected date (all spells). */
	rows: ReadonlyArray<SelectionRow>;
	loading: boolean;
	/** Lift a row into the entry form for editing. */
	onEdit: (row: SelectionRow) => void;
	/** Ask the page to soft-delete the row (the page owns the API call and confirm). */
	onDelete: (row: SelectionRow) => void;
	/** Disables the row actions while a mutation is in flight. */
	actionsDisabled: boolean;
	/** Row being edited — highlighted so the operator sees what the form holds. */
	editingId?: number | null;
}

/**
 * Day grid for Selection Trolley Weight (`md` and up): every trolley weighed
 * on the selected date, newest first. Presentational only — actions go upward.
 */
export default function SelectionEntryGrid({
	rows,
	loading,
	onEdit,
	onDelete,
	actionsDisabled,
	editingId,
}: SelectionEntryGridProps) {
	const columns = React.useMemo<GridColDef<SelectionRow>[]>(
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
									aria-label="Edit"
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
									aria-label="Delete"
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
			{ field: "spell_code", headerName: "Spell", width: 80, valueGetter: (value) => value ?? "" },
			{
				field: "item_name",
				headerName: "Quality",
				flex: 1,
				minWidth: 160,
				// Left-joined — a deactivated item comes back null; show the id
				// rather than an empty cell that reads like a load failure.
				valueGetter: (value, row) => value ?? String(row.item_id),
			},
			{
				field: "gate_entry_no",
				headerName: "Gate Entry",
				width: 110,
				valueGetter: (_value, row) => gateEntryShort(row),
			},
			{
				field: "trolly_name",
				headerName: "Trolley",
				width: 110,
				valueGetter: (value, row) => value ?? String(row.trolly_id),
			},
			{
				field: "trolly_wt",
				headerName: "Tare",
				width: 90,
				type: "number",
				valueFormatter: (value) => formatKg(value as number | null),
			},
			{
				field: "gross_wt",
				headerName: "Gross",
				width: 100,
				type: "number",
				valueFormatter: (value) => formatKg(value as number | null),
			},
			{
				field: "net_wt",
				headerName: "Net",
				width: 100,
				type: "number",
				valueFormatter: (value) => formatKg(value as number | null),
				cellClassName: "sel-net-cell",
			},
			{ field: "remarks", headerName: "Remarks", flex: 1, minWidth: 140, valueGetter: (value) => value ?? "" },
		],
		[actionsDisabled, onDelete, onEdit]
	);

	// Newest weighing first — the operator's eye lands on what they just saved.
	const sorted = React.useMemo(
		() =>
			[...rows].sort(
				(a, b) => (b.weigh_time ?? "").localeCompare(a.weigh_time ?? "") || b.selection_wt_id - a.selection_wt_id
			),
		[rows]
	);

	return (
		<Box sx={{ width: "100%" }}>
			<DataGrid
				autoHeight
				rows={sorted}
				getRowId={(r) => r.selection_wt_id}
				columns={columns}
				loading={loading}
				disableRowSelectionOnClick
				density="compact"
				pageSizeOptions={[25, 50, 100]}
				initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
				getRowClassName={(params) => (params.id === editingId ? "sel-row-editing" : "")}
				sx={{
					width: "100%",
					"& .sel-row-editing": { bgcolor: "action.selected" },
					"& .sel-net-cell": { fontWeight: 600 },
				}}
			/>
		</Box>
	);
}
