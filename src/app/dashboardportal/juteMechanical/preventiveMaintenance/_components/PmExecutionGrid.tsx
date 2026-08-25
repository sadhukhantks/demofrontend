"use client";

import * as React from "react";
import { Box, Button, Chip, CircularProgress, IconButton, Tooltip, Typography } from "@mui/material";
import { DataGrid, type GridColDef, type GridPaginationModel } from "@mui/x-data-grid";
import { Pencil as EditIcon, Trash2 as TrashIcon } from "lucide-react";
import {
	CardStat,
	DESKTOP_ONLY_SX,
	MOBILE_ONLY_SX,
	TOUCH_ICON_BUTTON_SX,
	TOUCH_TARGET,
} from "@/components/ui/responsiveEntry";
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

/** `mech_code — machine_name`, or whichever half exists. */
function machineLabel(row: MechPmExecution): string {
	if (row.mech_code) return `${row.mech_code} — ${row.machine_name ?? ""}`;
	return row.machine_name ?? `#${row.pm_exec_id}`;
}

/**
 * The PM execution log. Server-paginated (the backend caps `limit` at 200 and
 * returns `total`), so the grid drives `page`/`limit` rather than slicing locally.
 *
 * Below `md` the DataGrid gives way to a card list of the SAME `rows` prop. The
 * swap is CSS-only (`DESKTOP_ONLY_SX` / `MOBILE_ONLY_SX`), never `useMediaQuery`,
 * so both trees render and the page's hydration guard is unaffected.
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

	const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;

	return (
		<Box sx={{ width: "100%" }}>
			<Box sx={DESKTOP_ONLY_SX}>
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

			{/* Phone: the same rows as cards, from the same `rows` prop. */}
			<Box sx={MOBILE_ONLY_SX}>
				{loading ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
						<CircularProgress size={24} />
					</Box>
				) : null}

				{!loading && rows.length === 0 ? (
					<Typography variant="body2" color="text.secondary">
						No PM rounds recorded for this filter.
					</Typography>
				) : null}

				{rows.map((row) => (
					<Box
						key={row.pm_exec_id}
						sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 1 }}
					>
						<Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 1 }}>
							<Box sx={{ minWidth: 0, flex: 1 }}>
								<Typography
									variant="subtitle2"
									sx={{ fontWeight: 700, overflowWrap: "anywhere" }}
								>
									{machineLabel(row)}
								</Typography>
								<Typography variant="caption" color="text.secondary" display="block">
									{row.machine_type_name ?? "—"}
								</Typography>
							</Box>
							{row.frequency ? (
								<Chip size="small" variant="outlined" label={row.frequency} />
							) : null}
							<IconButton
								size="small"
								color="primary"
								aria-label="Edit PM execution"
								disabled={busy}
								onClick={() => onEdit(row)}
								sx={TOUCH_ICON_BUTTON_SX}
							>
								<EditIcon size={18} />
							</IconButton>
							<IconButton
								size="small"
								color="error"
								aria-label="Delete PM execution"
								disabled={busy}
								onClick={() => onDelete(row)}
								sx={TOUCH_ICON_BUTTON_SX}
							>
								<TrashIcon size={18} />
							</IconButton>
						</Box>

						<Box
							sx={{
								display: "grid",
								gap: 1,
								gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
							}}
						>
							<CardStat label="PM date" value={row.pm_date || "—"} />
							<CardStat label="Frequency" value={row.frequency ?? "—"} align="right" />
							<CardStat
								label="Downtime (min)"
								value={row.downtime_min === null ? "—" : String(row.downtime_min)}
							/>
							<CardStat label="Next due" value={row.next_due_date ?? "—"} align="right" />
							<CardStat label="Done by" value={row.done_by ?? "—"} />
						</Box>

						{row.remarks ? (
							<Typography
								variant="body2"
								color="text.secondary"
								sx={{ mt: 1, overflowWrap: "anywhere" }}
							>
								{row.remarks}
							</Typography>
						) : null}
					</Box>
				))}

				{/* The DataGrid footer is inside the grid, so the card list carries its own
				    pager onto the same server-side page state. */}
				{total > 0 ? (
					<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
						<Button
							size="small"
							variant="outlined"
							disabled={page <= 1 || loading}
							onClick={() => onPageChange(page - 1)}
							sx={{ minHeight: TOUCH_TARGET, flex: 1 }}
						>
							Previous
						</Button>
						<Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
							{page} / {pageCount}
						</Typography>
						<Button
							size="small"
							variant="outlined"
							disabled={page >= pageCount || loading}
							onClick={() => onPageChange(page + 1)}
							sx={{ minHeight: TOUCH_TARGET, flex: 1 }}
						>
							Next
						</Button>
					</Box>
				) : null}
			</Box>
		</Box>
	);
}
