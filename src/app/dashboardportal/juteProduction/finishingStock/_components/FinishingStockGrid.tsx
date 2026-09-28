"use client";

import * as React from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import { Pencil as EditIcon, Trash2 as Trash2Icon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import type { FinishingStockRow } from "@/utils/finishingStockService";
import {
	formatMt,
	groupRows,
	kgToMt,
	lineTotalKg,
	qualityTypeLabel,
	sectionTotals,
	WORK_BY_LABELS,
} from "../utils/stockCalc";
import StockTotalsFooter from "./StockTotalsFooter";

/** A grid line: either a real stock row or the synthetic subtotal closing a group. */
interface DisplayRow {
	id: string;
	group: string;
	/** null on subtotal lines — they carry no row actions. */
	source: FinishingStockRow | null;
	item_name: string;
	stage_label: string;
	work_by_label: string;
	qty: number | null;
	qty_uom: string;
	wt_per_unit_kg: number | null;
	mt: number;
	remarks: string;
}

function toDisplayRow(row: FinishingStockRow, group: string): DisplayRow {
	return {
		id: `row-${row.finishing_stock_id}`,
		group,
		source: row,
		item_name: row.item_name ?? `#${row.item_id}`,
		stage_label: row.bucket === "LOOSE" ? (row.stage_label ?? row.stage ?? "—") : "",
		work_by_label: row.bucket === "LOOSE" ? (WORK_BY_LABELS[row.work_by] ?? "") : "",
		qty: row.qty,
		qty_uom: row.qty_uom,
		wt_per_unit_kg: row.wt_per_unit_kg,
		mt: kgToMt(lineTotalKg(row)),
		remarks: row.remarks ?? "",
	};
}

function subtotalRow(
	id: string,
	group: string,
	rows: ReadonlyArray<FinishingStockRow>,
	showBales: boolean
): DisplayRow {
	const totals = sectionTotals(rows);
	return {
		id,
		group,
		source: null,
		item_name: "Subtotal",
		stage_label: "",
		work_by_label: "",
		qty: showBales ? totals.bales : null,
		qty_uom: showBales ? "BALE" : "",
		wt_per_unit_kg: null,
		mt: totals.mt,
		remarks: "",
	};
}

/**
 * Flatten a day into the sheet's reading order — own bale block (Hessian then
 * Sacking), one block per foreign owner, then loose Hessian / Sacking — with a
 * subtotal line closing every non-empty group.
 */
function buildDisplayRows(rows: ReadonlyArray<FinishingStockRow>): DisplayRow[] {
	const grouped = groupRows(rows);
	const out: DisplayRow[] = [];

	const section = (
		id: string,
		group: string,
		sectionRows: FinishingStockRow[],
		showBales: boolean
	) => {
		if (sectionRows.length === 0) return;
		sectionRows.forEach((r) => out.push(toDisplayRow(r, group)));
		out.push(subtotalRow(id, group, sectionRows, showBales));
	};

	([1, 2] as const).forEach((qualityType) => {
		section(
			`sub-BALE-${qualityType}`,
			`Bales · ${qualityTypeLabel(qualityType)}`,
			grouped.bale.own.filter((r) => r.quality_type === qualityType),
			true
		);
	});

	Object.keys(grouped.bale.others)
		.sort((a, b) => a.localeCompare(b))
		.forEach((owner) => {
			section(
				`sub-BALE-OWNER-${owner}`,
				`Bales · Others (${owner})`,
				grouped.bale.others[owner],
				true
			);
		});

	section("sub-LOOSE-1", "Loose · Hessian", grouped.loose.hessian, false);
	section("sub-LOOSE-2", "Loose · Sacking", grouped.loose.sacking, false);

	return out;
}

export interface FinishingStockGridProps {
	/** Active finishing-stock lines for the selected date, ordered by the backend. */
	rows: FinishingStockRow[];
	loading: boolean;
	/** Lift a row into the entry form for editing. */
	onEdit: (row: FinishingStockRow) => void;
	/** Ask the page to soft-delete the row (the page owns the API call). */
	onDelete: (row: FinishingStockRow) => void;
	/** Disables the row actions while a mutation is in flight. */
	actionsDisabled: boolean;
}

/**
 * Day grid for Finishing Stock — every counted lot for the selected date,
 * grouped the way the mill's stock sheet reads, with a subtotal line per group
 * and the day's MT split in the footer. Presentational only.
 */
export default function FinishingStockGrid({
	rows,
	loading,
	onEdit,
	onDelete,
	actionsDisabled,
}: FinishingStockGridProps) {
	const displayRows = React.useMemo(() => buildDisplayRows(rows), [rows]);

	const columns = React.useMemo<GridColDef<DisplayRow>[]>(
		() => [
			{
				field: "actions",
				headerName: "",
				width: 96,
				sortable: false,
				filterable: false,
				renderCell: (params) => {
					const row = params.row.source;
					if (!row) return null;
					return (
						<Box>
							<Tooltip title="Edit">
								<span>
									<IconButton
										size="small"
										color="primary"
										disabled={actionsDisabled}
										onClick={() => onEdit(row)}
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
										onClick={() => onDelete(row)}
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
			{ field: "group", headerName: "Block", width: 210 },
			{ field: "item_name", headerName: "Quality", flex: 1, minWidth: 220 },
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
				field: "mt",
				headerName: "MT",
				width: 110,
				type: "number",
				valueFormatter: (value: number | null) => formatMt(value),
			},
			{ field: "remarks", headerName: "Remarks", width: 180 },
		],
		[actionsDisabled, onDelete, onEdit]
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
					params.row.source ? "" : "finishing-stock-subtotal-row"
				}
				sx={{
					width: "100%",
					"& .finishing-stock-subtotal-row": {
						fontWeight: 700,
						bgcolor: "action.hover",
					},
				}}
			/>
			<StockTotalsFooter rows={rows} />
		</Box>
	);
}
