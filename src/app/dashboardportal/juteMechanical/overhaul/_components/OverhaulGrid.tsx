"use client";

import * as React from "react";
import { Box, Chip, IconButton, Tooltip } from "@mui/material";
import { DataGrid, type GridColDef, type GridPaginationModel } from "@mui/x-data-grid";
import { Pencil as EditIcon, Trash2 as TrashIcon } from "lucide-react";
import type { MechOverhaul } from "@/utils/juteMechanicalService";
import { OVERHAUL_TYPE_MAJOR } from "../types/overhaulTypes";
import { formatAmount } from "../utils/overhaulCalc";

export interface OverhaulGridProps {
	rows: ReadonlyArray<MechOverhaul>;
	total: number;
	loading: boolean;
	page: number;
	pageSize: number;
	onPageChange: (page: number) => void;
	onPageSizeChange: (size: number) => void;
	onEdit: (row: MechOverhaul) => void;
	onDelete: (row: MechOverhaul) => void;
	/** Locks the row actions while a save or delete is in flight. */
	busy?: boolean;
}

/** Numeric column formatter shared by the money columns. */
function moneyFormatter(value: unknown): string {
	return typeof value === "number" ? formatAmount(value) : "—";
}

/**
 * The overhaul register. Server-paginated: the backend caps `limit` at 200 and
 * returns `total`, so the grid drives `page`/`limit` rather than slicing locally.
 */
export default function OverhaulGrid({
	rows,
	total,
	loading,
	page,
	pageSize,
	onPageChange,
	onPageSizeChange,
	onEdit,
	onDelete,
	busy = false,
}: OverhaulGridProps) {
	const paginationModel = React.useMemo<GridPaginationModel>(
		() => ({ page: page - 1, pageSize }),
		[page, pageSize],
	);

	const handlePaginationChange = React.useCallback(
		(model: GridPaginationModel) => {
			if (model.pageSize !== pageSize) onPageSizeChange(model.pageSize);
			if (model.page + 1 !== page) onPageChange(model.page + 1);
		},
		[page, pageSize, onPageChange, onPageSizeChange],
	);

	const columns = React.useMemo<GridColDef<MechOverhaul>[]>(
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
									disabled={busy}
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
									disabled={busy}
									onClick={() => onDelete(params.row)}
									sx={{ minWidth: 40, minHeight: 40 }}
								>
									<TrashIcon size={16} />
								</IconButton>
							</span>
						</Tooltip>
					</Box>
				),
			},
			{
				field: "machine_name",
				headerName: "Machine",
				minWidth: 180,
				flex: 1,
				valueGetter: (_value, row) =>
					row.mech_code ? `${row.mech_code} — ${row.machine_name ?? ""}` : (row.machine_name ?? ""),
			},
			{ field: "machine_type_name", headerName: "Section", width: 140 },
			{
				field: "overhaul_type",
				headerName: "Type",
				width: 110,
				renderCell: (params) => (
					<Chip
						size="small"
						label={params.value === OVERHAUL_TYPE_MAJOR ? "Major" : "Minor"}
						color={params.value === OVERHAUL_TYPE_MAJOR ? "warning" : "default"}
						variant={params.value === OVERHAUL_TYPE_MAJOR ? "filled" : "outlined"}
					/>
				),
			},
			{ field: "from_date", headerName: "From", width: 115 },
			{ field: "to_date", headerName: "To", width: 115 },
			{
				field: "downtime_days",
				headerName: "Days",
				width: 80,
				type: "number",
				valueFormatter: (value) => (typeof value === "number" ? String(value) : "—"),
			},
			{ field: "done_by", headerName: "Done by", width: 110 },
			{ field: "party_name", headerName: "Vendor", width: 160 },
			{
				field: "labour_cost",
				headerName: "Labour",
				width: 120,
				type: "number",
				valueFormatter: moneyFormatter,
			},
			{
				field: "spare_cost",
				headerName: "Spares",
				width: 120,
				type: "number",
				valueFormatter: moneyFormatter,
			},
			{
				field: "total_cost",
				headerName: "Total",
				width: 130,
				type: "number",
				valueFormatter: moneyFormatter,
			},
			{ field: "next_due_date", headerName: "Next due", width: 120 },
			{ field: "work_done", headerName: "Work done", minWidth: 200, flex: 1 },
		],
		[busy, onDelete, onEdit],
	);

	return (
		<Box sx={{ width: "100%" }}>
			<DataGrid
				autoHeight
				rows={[...rows]}
				getRowId={(row) => row.overhaul_id}
				columns={columns}
				loading={loading}
				disableRowSelectionOnClick
				density="comfortable"
				paginationMode="server"
				rowCount={total}
				paginationModel={paginationModel}
				onPaginationModelChange={handlePaginationChange}
				pageSizeOptions={[10, 25, 50, 100]}
				sx={{ width: "100%" }}
			/>
		</Box>
	);
}
