"use client";

import * as React from "react";
import { Box, Chip, Typography } from "@mui/material";
import {
	DataGrid,
	type GridColDef,
	type GridColumnVisibilityModel,
	type GridRowId,
	type GridRowSelectionModel,
} from "@mui/x-data-grid";
import type { BaleStockRow } from "@/utils/baleStockService";
import {
	formatKg,
	inspectionCell,
	invoiceCell,
	isDespatchVoid,
	isNoInvoiceDespatch,
	repackedByCell,
	statusColor,
	statusLabel,
} from "./baleStockCalc";

export interface BaleStockGridProps {
	rows: ReadonlyArray<BaleStockRow>;
	loading: boolean;
	/** Selected `bale_entry_id`s — the grid is fully controlled. */
	selectedIds: ReadonlyArray<number>;
	onSelectionChange: (ids: number[]) => void;
	/** Checkbox column on (default) or a read-only list. */
	selectable?: boolean;
	/** Dense rows and the Invoice / Repacked-by columns hidden — for the quick dialog. */
	compact?: boolean;
	/** Shown when there are no rows. */
	emptyText?: string;
}

/** v8 selection model → the selected ids among `rows` (handles both model types). */
function idsOf(model: GridRowSelectionModel, rows: ReadonlyArray<BaleStockRow>): number[] {
	const all = rows.map((r) => r.bale_entry_id);
	if (model.type === "exclude") return all.filter((id) => !model.ids.has(id));
	return all.filter((id) => model.ids.has(id));
}

const CELL_BOX_SX = { display: "flex", alignItems: "center", gap: 0.5, height: "100%", minWidth: 0 } as const;

const COMPACT_HIDDEN: GridColumnVisibilityModel = { invoice: false, repacked_by: false };
const ALL_VISIBLE: GridColumnVisibilityModel = {};

/**
 * @component BaleStockGrid
 * @description One row per pressed bale (a `jute_prod_bale_entry`) with its
 * as-on status (plus an "invoice cancelled" / "no invoice" marker on the
 * despatch), inspection, invoice link and repack trail. Presentational: the
 * rows arrive from the page / dialog and the checkbox selection is controlled
 * through `selectedIds` + `onSelectionChange`, so a bale-number range picked
 * elsewhere shows up ticked here.
 */
export default function BaleStockGrid({
	rows,
	loading,
	selectedIds,
	onSelectionChange,
	selectable = true,
	compact = false,
	emptyText = "No bales match the filters",
}: BaleStockGridProps) {
	const columns = React.useMemo<GridColDef<BaleStockRow>[]>(
		() => [
			{ field: "tran_date", headerName: "Date", width: 110 },
			{
				field: "series_name",
				headerName: "Series",
				width: 120,
				valueGetter: (_v, row) => row.series_name ?? `#${row.bale_series_id}`,
			},
			{
				field: "bale_no",
				headerName: "Bale No",
				type: "number",
				width: 100,
				align: "right",
				headerAlign: "right",
			},
			{
				field: "item_name",
				headerName: "Quality",
				flex: 1,
				minWidth: 180,
				valueGetter: (_v, row) => row.item_name ?? `#${row.item_id ?? row.finishing_quality_id}`,
			},
			{
				field: "entry_type",
				headerName: "Type",
				width: 150,
				valueGetter: (_v, row) =>
					row.entry_type === "REPACK"
						? `Repack of #${row.original_bale_no ?? ""}`.trim()
						: "Prod",
				renderCell: (p) => (
					<Box sx={CELL_BOX_SX}>
						{p.row.entry_type === "REPACK" ? (
							<>
								<Chip label="Repack" size="small" color="secondary" variant="outlined" />
								{p.row.original_bale_no != null ? (
									<Typography variant="caption" color="text.secondary" noWrap>
										of #{p.row.original_bale_no}
									</Typography>
								) : null}
							</>
						) : (
							<Chip label="Prod" size="small" variant="outlined" />
						)}
					</Box>
				),
			},
			{
				field: "net_wt",
				headerName: "Net kg",
				type: "number",
				width: 100,
				align: "right",
				headerAlign: "right",
				valueFormatter: (value: number | null) => formatKg(value),
			},
			{
				field: "status",
				headerName: "Status",
				width: 210,
				valueGetter: (_v, row) =>
					isDespatchVoid(row)
						? `${statusLabel(row.status)} · invoice cancelled`
						: isNoInvoiceDespatch(row)
							? `${statusLabel(row.status)} · no invoice`
							: statusLabel(row.status),
				renderCell: (p) => (
					<Box sx={CELL_BOX_SX}>
						<Chip label={statusLabel(p.row.status)} size="small" color={statusColor(p.row.status)} />
						{isDespatchVoid(p.row) ? (
							<Chip
								label="invoice cancelled"
								size="small"
								color="warning"
								variant="outlined"
								title="Linked to an invoice that was later rejected or cancelled — unlink or re-link"
							/>
						) : isNoInvoiceDespatch(p.row) ? (
							<Chip
								label="no invoice"
								size="small"
								color="warning"
								variant="outlined"
								title="Despatched on a challan / delivery order without an invoice — select it and use Link to invoice to attach one"
							/>
						) : null}
					</Box>
				),
			},
			{
				field: "inspection",
				headerName: "Inspection",
				width: 230,
				sortable: false,
				valueGetter: (_v, row) => inspectionCell(row),
			},
			{
				field: "invoice",
				headerName: "Invoice",
				width: 260,
				sortable: false,
				valueGetter: (_v, row) => invoiceCell(row),
			},
			{
				field: "repacked_by",
				headerName: "Repacked by",
				width: 150,
				sortable: false,
				valueGetter: (_v, row) => repackedByCell(row),
			},
		],
		[]
	);

	const selection = React.useMemo<GridRowSelectionModel>(
		() => ({ type: "include", ids: new Set<GridRowId>(selectedIds) }),
		[selectedIds]
	);

	return (
		<Box sx={{ width: "100%", overflowX: "auto" }}>
			<DataGrid
				autoHeight
				rows={rows as BaleStockRow[]}
				columns={columns}
				getRowId={(r) => r.bale_entry_id}
				loading={loading}
				density={compact ? "compact" : "standard"}
				checkboxSelection={selectable}
				disableRowSelectionOnClick
				rowSelectionModel={selection}
				onRowSelectionModelChange={(model) => onSelectionChange(idsOf(model, rows))}
				pageSizeOptions={[25, 50, 100]}
				initialState={{
					pagination: { paginationModel: { pageSize: 50, page: 0 } },
					// Uncontrolled so the operator can still show / hide columns from the menu.
					columns: { columnVisibilityModel: compact ? COMPACT_HIDDEN : ALL_VISIBLE },
				}}
				localeText={{ noRowsLabel: emptyText }}
				sx={{ minWidth: 720 }}
			/>
		</Box>
	);
}
