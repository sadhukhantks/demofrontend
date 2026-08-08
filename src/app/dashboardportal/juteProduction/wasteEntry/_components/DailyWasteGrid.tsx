"use client";

import * as React from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import { Pencil as EditIcon, Trash2 as Trash2Icon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import type { WasteEntryRow, WasteTypeTotal } from "../types/wasteTypes";
import { wasteTypeLabel } from "../types/wasteTypes";
import { formatQty } from "../utils/wasteCalc";
import WasteTotalsFooter from "./WasteTotalsFooter";

export interface DailyWasteGridProps {
	/** Active waste rows for the selected date. */
	rows: WasteEntryRow[];
	loading: boolean;
	/** Per-waste-type subtotals rendered beneath the grid. */
	totals: WasteTypeTotal[];
	grandTotal: number;
	/** Lift a row into the entry form for editing. */
	onEdit: (row: WasteEntryRow) => void;
	/** Ask the page to soft-delete the row (the page owns the API call). */
	onDelete: (row: WasteEntryRow) => void;
	/** Disables the row actions while a mutation is in flight. */
	actionsDisabled: boolean;
}

/**
 * Day grid for Waste Entry (SPEC §3.1) — all active rows for the selected
 * date with edit + delete row actions and a footer total grouped by waste type.
 * Presentational only: it renders from props and delegates both actions upward.
 */
export default function DailyWasteGrid({
	rows,
	loading,
	totals,
	grandTotal,
	onEdit,
	onDelete,
	actionsDisabled,
}: DailyWasteGridProps) {
	const columns = React.useMemo<GridColDef<WasteEntryRow>[]>(
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
			{ field: "tran_date", headerName: "Date", width: 120 },
			{
				field: "spell_code",
				headerName: "Spell",
				width: 100,
				valueGetter: (_value, row) => row.spell_code ?? row.spell_name ?? "",
			},
			{
				field: "dept_desc",
				headerName: "Department",
				width: 160,
				valueGetter: (value) => value ?? "",
			},
			{
				field: "machine_name",
				headerName: "Machine",
				width: 160,
				// Blank machine = department-level waste (SPEC §3.1) — say so
				// rather than showing an empty cell that reads like missing data.
				valueGetter: (value) => value ?? "— Dept level —",
			},
			{
				field: "waste_type_code",
				headerName: "Waste Type",
				width: 150,
				valueFormatter: (value) => wasteTypeLabel(value),
			},
			{
				field: "waste_qty",
				headerName: "Qty (kg)",
				width: 120,
				type: "number",
				valueFormatter: (value) => formatQty(value as number | null | undefined),
			},
			{ field: "remarks", headerName: "Remarks", flex: 1, minWidth: 160 },
		],
		[actionsDisabled, onDelete, onEdit]
	);

	return (
		<Box sx={{ width: "100%" }}>
			<DataGrid
				autoHeight
				rows={rows}
				getRowId={(r) => r.waste_entry_id}
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
			<WasteTotalsFooter totals={totals} grandTotal={grandTotal} />
		</Box>
	);
}
