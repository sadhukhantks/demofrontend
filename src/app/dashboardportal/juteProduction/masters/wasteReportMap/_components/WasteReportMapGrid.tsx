"use client";

import * as React from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Ban as DeactivateIcon, Pencil as EditIcon } from "lucide-react";
import type { WasteReportMapRow } from "@/utils/wasteReportMapService";
import { departmentLabel } from "../utils/wasteReportMapSchema";

export interface WasteReportMapGridProps {
	rows: WasteReportMapRow[];
	loading: boolean;
	/** code -> label from the setup's denominator options (fallback: the row's own label). */
	denomLabels: Record<string, string>;
	onEdit: (row: WasteReportMapRow) => void;
	onDeactivate: (row: WasteReportMapRow) => void;
}

/**
 * Active mapping rows, in the backend's order (display order, group, item).
 * Presentational: rows and handlers come from the page.
 */
export default function WasteReportMapGrid({
	rows,
	loading,
	denomLabels,
	onEdit,
	onDeactivate,
}: WasteReportMapGridProps) {
	const columns = React.useMemo<GridColDef<WasteReportMapRow>[]>(
		() => [
			{
				field: "group_name",
				headerName: "Group",
				flex: 1,
				minWidth: 200,
				valueGetter: (_value, row) => `${row.group_name} ${row.group_code}`,
				renderCell: (params) => (
					<Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", lineHeight: 1.3 }}>
						<Typography variant="body2" sx={{ fontWeight: 500 }}>
							{params.row.group_name}
						</Typography>
						<Typography variant="caption" color="text.secondary">
							{params.row.group_code}
						</Typography>
					</Box>
				),
			},
			{
				field: "item_name",
				headerName: "Waste item",
				flex: 1,
				minWidth: 180,
				valueGetter: (value, row) => value ?? `Item ${row.item_id}`,
			},
			{
				field: "dept_desc",
				headerName: "Department",
				flex: 1,
				minWidth: 180,
				valueGetter: (_value, row) => departmentLabel(row),
			},
			{
				field: "col_label",
				headerName: "Column label",
				flex: 1,
				minWidth: 150,
				valueGetter: (value) => value ?? "",
			},
			{ field: "display_order", headerName: "Order", width: 90, type: "number" },
			{
				field: "day_denom",
				headerName: "Daily % on",
				width: 170,
				valueGetter: (value, row) => denomLabels[String(value)] ?? row.day_denom_label ?? value,
			},
			{
				field: "total_denom",
				headerName: "Monthly % on",
				width: 170,
				valueGetter: (value, row) => denomLabels[String(value)] ?? row.total_denom_label ?? value,
			},
			{
				field: "actions",
				headerName: "Actions",
				width: 110,
				sortable: false,
				filterable: false,
				renderCell: (params) => (
					<>
						<Tooltip title="Edit">
							<IconButton
								size="small"
								aria-label="Edit"
								onClick={() => onEdit(params.row)}
								sx={{ minWidth: 40, minHeight: 40 }}
							>
								<EditIcon size={16} />
							</IconButton>
						</Tooltip>
						<Tooltip title="Deactivate">
							<IconButton
								size="small"
								aria-label="Deactivate"
								color="error"
								onClick={() => onDeactivate(params.row)}
								sx={{ minWidth: 40, minHeight: 40 }}
							>
								<DeactivateIcon size={16} />
							</IconButton>
						</Tooltip>
					</>
				),
			},
		],
		[denomLabels, onEdit, onDeactivate],
	);

	return (
		<DataGrid
			autoHeight
			rows={rows}
			getRowId={(r) => r.waste_report_map_id}
			columns={columns}
			loading={loading}
			density="comfortable"
			getRowHeight={() => 56}
			disableRowSelectionOnClick
			pageSizeOptions={[25, 50, 100]}
			initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
			localeText={{ noRowsLabel: "No mappings yet — every waste item shows under Other / Unmapped" }}
			sx={{ width: "100%" }}
		/>
	);
}
