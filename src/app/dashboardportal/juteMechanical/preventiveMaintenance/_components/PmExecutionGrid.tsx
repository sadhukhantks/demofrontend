"use client";

import * as React from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import { DataGrid, type GridColDef, type GridPaginationModel } from "@mui/x-data-grid";
import { Pencil as EditIcon, Trash2 as TrashIcon } from "lucide-react";
import type { MechPmExecution } from "@/utils/juteMechanicalService";

export interface PmExecutionGridProps {
	rows: ReadonlyArray<MechPmExecution>;
	total: number;
	loading: boolean;
	page: number;
	pageSize: number;
	onPageChange: (page: number) => void;
	onPageSizeChange: (size: number) => void;
	onEdit: (row: MechPmExecution) => void;
	onDelete: (row: MechPmExecution) => void;
	busy?: boolean;
}

/**
 * The PM execution log. Server-paginated (the backend caps `limit` at 200 and
 * returns `total`), so the grid drives `page`/`limit` rather than slicing locally.
 */
export default function PmExecutionGrid({
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
}: PmExecutionGridProps) {
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

	const columns = React.useMemo<GridColDef<MechPmExecution>[]>(
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
			{ field: "pm_date", headerName: "Date", width: 115 },
			{
				field: "machine_name",
				headerName: "Machine",
				minWidth: 180,
				flex: 1,
				valueGetter: (_value, row) =>
					row.mech_code ? `${row.mech_code} — ${row.machine_name ?? ""}` : (row.machine_name ?? ""),
			},
			{ field: "machine_type_name", headerName: "Section", width: 140 },
			{ field: "frequency", headerName: "Frequency", width: 130 },
			{ field: "done_by", headerName: "Done by", width: 150 },
			{
				field: "downtime_min",
				headerName: "Downtime (min)",
				width: 140,
				type: "number",
				valueFormatter: (value) => (typeof value === "number" ? String(value) : "—"),
			},
			{ field: "next_due_date", headerName: "Next due", width: 120 },
			{ field: "remarks", headerName: "Remarks", minWidth: 180, flex: 1 },
		],
		[busy, onDelete, onEdit],
	);

	return (
		<Box sx={{ width: "100%" }}>
			<DataGrid
				autoHeight
				rows={[...rows]}
				getRowId={(row) => row.pm_exec_id}
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
