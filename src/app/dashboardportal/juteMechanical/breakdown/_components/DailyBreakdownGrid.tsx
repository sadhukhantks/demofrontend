"use client";

import * as React from "react";
import { Box, Chip, IconButton, Tooltip } from "@mui/material";
import { Pencil as EditIcon, Trash2 as Trash2Icon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import type { MechBreakdown } from "@/utils/juteMechanicalService";
import {
	BREAKDOWN_STATUS,
	formatDateTimeDisplay,
	formatMinutes,
	statusFallbackLabel,
} from "../utils/breakdownCalc";

export interface DailyBreakdownGridProps {
	rows: ReadonlyArray<MechBreakdown>;
	loading: boolean;
	/** code -> label from the setup enum, so the grid shows the backend's wording. */
	statusLabels: ReadonlyMap<string, string>;
	onEdit: (row: MechBreakdown) => void;
	onDelete: (row: MechBreakdown) => void;
	/** Disables both row actions while a write is in flight. */
	busy?: boolean;
}

/** Status chip colour — theme palette keys, never hardcoded hex. */
function statusColor(status: string): "success" | "warning" | "error" | "default" {
	switch (status) {
		case BREAKDOWN_STATUS.CLOSED:
			return "success";
		case BREAKDOWN_STATUS.UNDER_REPAIR:
			return "warning";
		case BREAKDOWN_STATUS.OPEN:
			return "error";
		default:
			return "default";
	}
}

/**
 * The incident log for the selected date range — every breakdown, open or closed,
 * with edit and delete row actions.
 *
 * Purely presentational: the page owns the data and both mutations.
 */
export default function DailyBreakdownGrid({
	rows,
	loading,
	statusLabels,
	onEdit,
	onDelete,
	busy = false,
}: DailyBreakdownGridProps) {
	const columns = React.useMemo<GridColDef<MechBreakdown>[]>(
		() => [
			{
				field: "actions",
				headerName: "",
				width: 96,
				sortable: false,
				filterable: false,
				disableColumnMenu: true,
				renderCell: (params) => (
					<Box>
						<Tooltip title="Edit incident">
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
						<Tooltip title="Delete incident">
							<span>
								<IconButton
									size="small"
									color="error"
									disabled={busy}
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
				field: "status",
				headerName: "Status",
				width: 130,
				renderCell: (params) => {
					const code = String(params.value ?? "");
					return (
						<Chip
							size="small"
							color={statusColor(code)}
							label={statusLabels.get(code) ?? statusFallbackLabel(code)}
						/>
					);
				},
			},
			{ field: "tran_date", headerName: "Date", width: 110 },
			{
				field: "machine_name",
				headerName: "Machine",
				width: 180,
				valueGetter: (_value, row) =>
					row.mech_code ? `${row.mech_code} — ${row.machine_name ?? ""}` : (row.machine_name ?? ""),
			},
			{ field: "machine_type_name", headerName: "Section", width: 140 },
			{
				field: "stop_datetime",
				headerName: "Stopped",
				width: 150,
				valueFormatter: (value) => formatDateTimeDisplay(value as string | null),
			},
			{
				field: "restart_datetime",
				headerName: "Restarted",
				width: 150,
				valueFormatter: (value) =>
					value == null ? "still down" : formatDateTimeDisplay(value as string | null),
			},
			{
				field: "duration_min",
				headerName: "Downtime",
				width: 120,
				type: "number",
				valueFormatter: (value) =>
					value == null ? "—" : formatMinutes(Number(value)),
			},
			{
				field: "response_min",
				headerName: "Response",
				width: 110,
				type: "number",
				valueFormatter: (value) =>
					value == null ? "—" : formatMinutes(Number(value)),
			},
			{
				field: "reason_code",
				headerName: "Reason",
				width: 160,
				valueGetter: (_value, row) =>
					row.reason_code
						? `${row.reason_code}${row.reason_desc ? ` — ${row.reason_desc}` : ""}`
						: "",
			},
			{ field: "component_name", headerName: "Component", width: 140 },
			{ field: "discipline", headerName: "Discipline", width: 120 },
			{ field: "downtime_type", headerName: "Type", width: 120 },
			{ field: "attended_dept_name", headerName: "Crew", width: 150 },
			{ field: "attended_by", headerName: "Attended by", width: 140 },
			{
				field: "production_loss_qty",
				headerName: "Prod. loss",
				width: 110,
				type: "number",
				valueFormatter: (value) => (value == null ? "" : Number(value).toFixed(3)),
			},
			{ field: "remarks", headerName: "Remarks", flex: 1, minWidth: 180 },
		],
		[busy, onDelete, onEdit, statusLabels]
	);

	return (
		<Box sx={{ width: "100%" }}>
			<DataGrid
				autoHeight
				rows={rows as MechBreakdown[]}
				getRowId={(row) => row.breakdown_id}
				columns={columns}
				loading={loading}
				disableRowSelectionOnClick
				density="comfortable"
				pageSizeOptions={[10, 25, 50, 100]}
				initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
				sx={{ width: "100%" }}
			/>
		</Box>
	);
}
