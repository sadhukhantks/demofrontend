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

/** `mech_code — machine_name`, or whichever half exists. */
function machineLabel(row: MechOverhaul): string {
	if (row.mech_code) return `${row.mech_code} — ${row.machine_name ?? ""}`;
	return row.machine_name ?? `#${row.overhaul_id}`;
}

/**
 * The overhaul register. Server-paginated: the backend caps `limit` at 200 and
 * returns `total`, so the grid drives `page`/`limit` rather than slicing locally.
 *
 * Below `md` the DataGrid is replaced by a card list of the SAME `rows` prop — no
 * second fetch, no `useMediaQuery`. The swap is pure CSS (`DESKTOP_ONLY_SX` /
 * `MOBILE_ONLY_SX`) so the server and first client render emit the identical tree
 * and the page's `mounted` guard keeps its meaning. A 14-column DataGrid does not
 * reflow; on a 360px phone it simply clips, which is unusable for a fitter reading
 * the register at the machine.
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

	const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;

	return (
		<Box sx={{ width: "100%" }}>
			<Box sx={DESKTOP_ONLY_SX}>
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

			{/* Phone: the same rows as cards. Fed from the same `rows` prop — the grid
			    above and this list never fetch separately. */}
			<Box sx={MOBILE_ONLY_SX}>
				{loading ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
						<CircularProgress size={24} />
					</Box>
				) : null}

				{!loading && rows.length === 0 ? (
					<Typography variant="body2" color="text.secondary">
						No overhauls recorded for this filter.
					</Typography>
				) : null}

				{rows.map((row) => {
					const major = row.overhaul_type === OVERHAUL_TYPE_MAJOR;
					return (
						<Box
							key={row.overhaul_id}
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
								<Chip
									size="small"
									label={major ? "Major" : "Minor"}
									color={major ? "warning" : "default"}
									variant={major ? "filled" : "outlined"}
								/>
								<IconButton
									size="small"
									color="primary"
									aria-label="Edit overhaul"
									disabled={busy}
									onClick={() => onEdit(row)}
									sx={TOUCH_ICON_BUTTON_SX}
								>
									<EditIcon size={18} />
								</IconButton>
								<IconButton
									size="small"
									color="error"
									aria-label="Delete overhaul"
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
								<CardStat label="From" value={row.from_date || "—"} />
								<CardStat label="To" value={row.to_date ?? "—"} align="right" />
								<CardStat
									label="Downtime"
									value={
										row.downtime_days === null
											? "—"
											: `${row.downtime_days} day${row.downtime_days === 1 ? "" : "s"}`
									}
								/>
								<CardStat
									label="Total cost"
									value={
										typeof row.total_cost === "number" ? formatAmount(row.total_cost) : "—"
									}
									align="right"
								/>
								<CardStat
									label="Done by"
									value={row.party_name ? `${row.done_by} — ${row.party_name}` : row.done_by}
								/>
								<CardStat label="Next due" value={row.next_due_date ?? "—"} align="right" />
							</Box>

							{row.work_done ? (
								<Typography
									variant="body2"
									color="text.secondary"
									sx={{ mt: 1, overflowWrap: "anywhere" }}
								>
									{row.work_done}
								</Typography>
							) : null}
						</Box>
					);
				})}

				{/* The DataGrid footer lives inside the grid, so the card list carries its
				    own pager. It drives the same server-side page state. */}
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
