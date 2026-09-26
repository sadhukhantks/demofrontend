"use client";

import * as React from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import { Pencil as EditIcon, Trash2 as Trash2Icon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import type { StockLocation, WindingStockRow } from "@/utils/windingStockService";
import { BUCKET_LABELS, LOCATION_LABELS, formatMt, type LocationTotals } from "../utils/stockCalc";
import StockTotalsFooter from "./StockTotalsFooter";

export interface WindingStockGridProps {
	/** Active winding-stock lines for the selected date, already ordered by the
	 * backend (bucket, then package_label). */
	rows: WindingStockRow[];
	loading: boolean;
	/** MT total per bucket, rendered beneath the grid. */
	bucketTotals: Record<string, number>;
	grandTotal: number;
	/** MT split godown vs floor, rendered beneath the bucket totals. */
	locationTotals: LocationTotals;
	/** Lift a row into the entry form for editing. */
	onEdit: (row: WindingStockRow) => void;
	/** Ask the page to soft-delete the row (the page owns the API call). */
	onDelete: (row: WindingStockRow) => void;
	/** Disables the row actions while a mutation is in flight or the day is locked. */
	actionsDisabled: boolean;
}

/**
 * Day grid for Winding Stock — all active counted lines for the selected
 * date with edit + delete row actions and a footer total grouped by bucket.
 * Presentational only: it renders from props and delegates both actions
 * upward. No client-side grouping/sorting is applied — the backend already
 * returns rows ordered by (bucket, package_label), which is what the mill
 * sheet expects.
 */
export default function WindingStockGrid({
	rows,
	loading,
	bucketTotals,
	grandTotal,
	locationTotals,
	onEdit,
	onDelete,
	actionsDisabled,
}: WindingStockGridProps) {
	const columns = React.useMemo<GridColDef<WindingStockRow>[]>(
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
				field: "bucket",
				headerName: "Bucket",
				width: 170,
				valueGetter: (value: string) => BUCKET_LABELS[value] ?? value,
			},
			{
				field: "yarn_count",
				headerName: "Count (lbs)",
				width: 110,
				type: "number",
				valueGetter: (value) => value ?? "",
			},
			{
				field: "quality_name",
				headerName: "Quality",
				width: 150,
				valueGetter: (value) => value ?? "",
			},
			{ field: "package_label", headerName: "Package", width: 160 },
			{
				field: "area_name",
				headerName: "Place",
				width: 150,
				valueGetter: (value) => value ?? "— Not set —",
			},
			{
				field: "stock_loc",
				headerName: "Location",
				width: 110,
				// A row without stock_loc (older backend) is on the floor — the
				// server's own default — so it never renders as a blank location.
				valueGetter: (value: StockLocation | null | undefined) =>
					LOCATION_LABELS[value === "GODOWN" ? "GODOWN" : "FLOOR"],
			},
			{
				field: "dept_desc",
				headerName: "Dept",
				width: 150,
				// Blank for godown lines and for floor lines counted without one.
				valueGetter: (value) => value ?? "",
			},
			{ field: "no_of_samples", headerName: "Samples", width: 110, type: "number" },
			{ field: "wt_per_sample", headerName: "Kg/Sample", width: 110, type: "number" },
			{
				field: "stock_mt",
				headerName: "MT",
				width: 110,
				type: "number",
				valueFormatter: (value) => formatMt(value as number | null | undefined),
			},
		],
		[actionsDisabled, onDelete, onEdit]
	);

	return (
		<Box sx={{ width: "100%" }}>
			<DataGrid
				autoHeight
				rows={rows}
				getRowId={(r) => r.winding_stock_id}
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
			<StockTotalsFooter
				bucketTotals={bucketTotals}
				grandTotal={grandTotal}
				locationTotals={locationTotals}
			/>
		</Box>
	);
}
