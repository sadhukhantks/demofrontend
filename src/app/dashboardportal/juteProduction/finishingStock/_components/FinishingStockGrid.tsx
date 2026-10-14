"use client";

import * as React from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import {
	ClipboardCheck as InspectIcon,
	Pencil as EditIcon,
	Trash2 as Trash2Icon,
	Truck as DespatchIcon,
} from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import type {
	BaleStockSeriesLine,
	BaleStockSource,
	BaleStockSummaryLine,
} from "@/utils/baleStockService";
import type { FinishingStockRow } from "@/utils/finishingStockService";
import { buildDisplayRows, isSubtotalRow, type DisplayRow } from "../utils/displayRows";
import { formatMt } from "../utils/stockCalc";
import StockTotalsFooter from "./StockTotalsFooter";

const SUPERSEDED_TOOLTIP =
	"Own-company bales now come from Bale Production — this manual line is not counted; delete it";
const NO_LINES: ReadonlyArray<BaleStockSummaryLine> = Object.freeze([]);
const NO_SERIES: ReadonlyArray<BaleStockSeriesLine> = Object.freeze([]);

export interface FinishingStockGridProps {
	/** Active finishing-stock lines for the selected date, ordered by the backend. */
	rows: FinishingStockRow[];
	/** Own-company bale stock derived from Bale Production for the date, one
	 * line per quality — empty in MANUAL mode. */
	derivedBales: BaleStockSummaryLine[];
	/** The sacking part of `derivedBales` split by bale series — one child row
	 * ("↳ PUNJAB") per series under each sacking quality. Empty in MANUAL mode. */
	derivedSeries: BaleStockSeriesLine[];
	/** Where the own-company bale block comes from for this date. */
	baleSource: BaleStockSource;
	loading: boolean;
	/** Lift a row into the entry form for editing. */
	onEdit: (row: FinishingStockRow) => void;
	/** Ask the page to soft-delete the row (the page owns the API call). */
	onDelete: (row: FinishingStockRow) => void;
	/** Open the Mark-inspected dialog for a derived sacking line. */
	onMarkInspected: (line: BaleStockSummaryLine) => void;
	/** Open the Mark-despatched (link to invoice) dialog for a derived line — hessian or sacking. */
	onMarkDespatched: (line: BaleStockSummaryLine) => void;
	/** Disables the row actions while a mutation is in flight. */
	actionsDisabled: boolean;
}

/**
 * Day grid for Finishing Stock — every counted lot for the selected date,
 * grouped the way the mill's stock sheet reads, with a subtotal line per group
 * and the day's MT split in the footer. Derived sacking qualities carry their
 * series breakup as indented secondary-text child rows that no subtotal
 * counts (row model: `../utils/displayRows.ts`). Presentational only.
 */
export default function FinishingStockGrid({
	rows,
	derivedBales,
	derivedSeries,
	baleSource,
	loading,
	onEdit,
	onDelete,
	onMarkInspected,
	onMarkDespatched,
	actionsDisabled,
}: FinishingStockGridProps) {
	const derived = baleSource === "BALE_PROD" ? derivedBales : NO_LINES;
	const series = baleSource === "BALE_PROD" ? derivedSeries : NO_SERIES;
	const displayRows = React.useMemo(
		() => buildDisplayRows(rows, derived, series, baleSource),
		[rows, derived, series, baleSource]
	);

	const columns = React.useMemo<GridColDef<DisplayRow>[]>(
		() => [
			{
				field: "actions",
				headerName: "",
				width: 110,
				sortable: false,
				filterable: false,
				renderCell: (params) => {
					const { source, derived: line, superseded } = params.row;
					if (line) {
						const empty = line.bales === 0;
						return (
							<Box sx={{ display: "flex", alignItems: "center" }}>
								{/* Only sacking is inspected (hessian lines carry no inspect action). */}
								{line.quality_type === 2 ? (
									<Tooltip title={empty ? "No bales in stock to inspect" : "Mark inspected"}>
										<span>
											<IconButton
												size="small"
												color="primary"
												aria-label="Mark inspected"
												disabled={actionsDisabled || empty}
												onClick={() => onMarkInspected(line)}
												sx={{ minWidth: 40, minHeight: 40 }}
											>
												<InspectIcon size={16} />
											</IconButton>
										</span>
									</Tooltip>
								) : null}
								{/* Despatch applies to hessian and sacking alike. */}
								<Tooltip
									title={empty ? "No bales in stock to despatch" : "Mark despatched (link to invoice)"}
								>
									<span>
										<IconButton
											size="small"
											color="primary"
											aria-label="Mark despatched (link to invoice)"
											disabled={actionsDisabled || empty}
											onClick={() => onMarkDespatched(line)}
											sx={{ minWidth: 40, minHeight: 40 }}
										>
											<DespatchIcon size={16} />
										</IconButton>
									</span>
								</Tooltip>
							</Box>
						);
					}
					if (!source) return null;
					return (
						<Box>
							{superseded || (baleSource === "BALE_PROD" && source.bucket === "BALE") ? null : (
								<Tooltip title="Edit">
									<span>
										<IconButton
											size="small"
											color="primary"
											disabled={actionsDisabled}
											onClick={() => onEdit(source)}
											sx={{ minWidth: 40, minHeight: 40 }}
										>
											<EditIcon size={16} />
										</IconButton>
									</span>
								</Tooltip>
							)}
							<Tooltip title="Delete">
								<span>
									<IconButton
										size="small"
										color="error"
										disabled={actionsDisabled}
										onClick={() => onDelete(source)}
										sx={{ minWidth: 40, minHeight: 40 }}
									>
										<Trash2Icon size={16} />
									</IconButton>
								</span>
							</Tooltip>
						</Box>
					);
				},
			},
			{ field: "group", headerName: "Block", width: 260 },
			{
				field: "item_name",
				headerName: "Quality",
				flex: 1,
				minWidth: 220,
				renderCell: (params) =>
					params.row.superseded ? (
						<Tooltip title={SUPERSEDED_TOOLTIP}>
							<span>{params.row.item_name}</span>
						</Tooltip>
					) : params.row.series ? (
						<Box component="span" sx={{ pl: 2 }}>
							{params.row.item_name}
						</Box>
					) : (
						params.row.item_name
					),
			},
			{ field: "stage_label", headerName: "Stage", width: 170 },
			{ field: "work_by_label", headerName: "Work By", width: 100 },
			{
				field: "qty",
				headerName: "Qty",
				width: 100,
				type: "number",
				valueFormatter: (value: number | null) => (value == null ? "" : String(value)),
			},
			{ field: "qty_uom", headerName: "UoM", width: 80 },
			{
				field: "wt_per_unit_kg",
				headerName: "Kg / Bale",
				width: 110,
				type: "number",
				valueFormatter: (value: number | null) => (value == null ? "" : value.toFixed(3)),
			},
			{
				field: "inspected",
				headerName: "Inspected",
				width: 100,
				align: "right",
				headerAlign: "right",
			},
			{
				field: "mt",
				headerName: "MT",
				width: 110,
				type: "number",
				valueFormatter: (value: number | null) => formatMt(value),
			},
			{ field: "remarks", headerName: "Remarks", width: 180 },
		],
		[actionsDisabled, baleSource, onDelete, onEdit, onMarkDespatched, onMarkInspected]
	);

	return (
		<Box sx={{ width: "100%" }}>
			<DataGrid
				autoHeight
				rows={displayRows}
				columns={columns}
				loading={loading}
				disableRowSelectionOnClick
				density="comfortable"
				// Client sorting would break the sheet ordering the subtotal rows
				// sit inside — the grid is a printed block list, not a sortable table.
				disableColumnSorting
				pageSizeOptions={[25, 50, 100]}
				initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
				getRowClassName={(params) =>
					params.row.superseded
						? "finishing-stock-superseded-row"
						: params.row.series
							? "finishing-stock-series-row"
							: isSubtotalRow(params.row)
								? "finishing-stock-subtotal-row"
								: ""
				}
				sx={{
					width: "100%",
					"& .finishing-stock-subtotal-row": {
						fontWeight: 700,
						bgcolor: "action.hover",
					},
					"& .finishing-stock-superseded-row": {
						opacity: 0.6,
					},
					// Series breakup under a sacking quality: secondary, smaller text.
					"& .finishing-stock-series-row": {
						color: "text.secondary",
						"& .MuiDataGrid-cell": { fontSize: "0.8125rem" },
					},
				}}
			/>
			<StockTotalsFooter rows={rows} derived={derived} />
		</Box>
	);
}
