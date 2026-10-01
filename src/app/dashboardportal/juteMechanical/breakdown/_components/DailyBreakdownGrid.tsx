"use client";

import * as React from "react";
import { Box, Button, Chip, IconButton, Tooltip, Typography } from "@mui/material";
import {
	ClipboardCheck as ConfirmIcon,
	Pencil as EditIcon,
	Trash2 as Trash2Icon,
} from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import type { MechBreakdown } from "@/utils/juteMechanicalService";
import {
	CardStat,
	DESKTOP_ONLY_SX,
	MOBILE_ONLY_SX,
	MobileCard,
	TOUCH_ICON_BUTTON_SX,
	TOUCH_TARGET,
} from "@/components/ui/responsiveEntry";
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
	/** Opens production's reconfirmation dialog — offered on closed incidents only. */
	onConfirmFix: (row: MechBreakdown) => void;
	/** Disables the row actions while a write is in flight. */
	busy?: boolean;
}

/** Production's verdict on the fix, as shown in the grid and on the cards. */
function prodCheck(row: MechBreakdown): {
	label: string;
	color: "success" | "warning" | "default";
	detail: string;
} | null {
	if (row.status !== BREAKDOWN_STATUS.CLOSED) return null;
	const who = row.prod_confirm_by_name ? ` by ${row.prod_confirm_by_name}` : "";
	const when = row.prod_confirm_date_time
		? ` on ${formatDateTimeDisplay(row.prod_confirm_date_time)}`
		: "";
	if (row.prod_confirm_status === "CONFIRMED") {
		const remark = row.prod_confirm_remarks ? ` — ${row.prod_confirm_remarks}` : "";
		return { label: "Confirmed", color: "success", detail: `Confirmed${who}${when}${remark}` };
	}
	if (row.prod_confirm_status === "DISPUTED") {
		const time = row.prod_restart_datetime
			? ` — restarted ${formatDateTimeDisplay(row.prod_restart_datetime)}`
			: "";
		const remark = row.prod_confirm_remarks ? ` — ${row.prod_confirm_remarks}` : "";
		return {
			label: "Differs",
			color: "warning",
			detail: `Production differs${who}${when}${time}${remark}`,
		};
	}
	return { label: "Not checked", color: "default", detail: "Production has not checked this fix" };
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
	onConfirmFix,
	busy = false,
}: DailyBreakdownGridProps) {
	const columns = React.useMemo<GridColDef<MechBreakdown>[]>(
		() => [
			{
				field: "actions",
				headerName: "",
				width: 136,
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
						{params.row.status === BREAKDOWN_STATUS.CLOSED ? (
							<Tooltip title="Production: confirm the fix">
								<span>
									<IconButton
										size="small"
										color="success"
										disabled={busy}
										onClick={() => onConfirmFix(params.row)}
										sx={{ minWidth: 40, minHeight: 40 }}
									>
										<ConfirmIcon size={16} />
									</IconButton>
								</span>
							</Tooltip>
						) : null}
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
			{
				field: "reported_by_user_name",
				headerName: "Reported by",
				width: 150,
				valueGetter: (_value, row) => row.reported_by_user_name ?? row.reported_by ?? "",
			},
			{ field: "fixed_by_user_name", headerName: "Fix entered by", width: 150 },
			{
				field: "prod_confirm_status",
				headerName: "Production check",
				width: 150,
				sortable: false,
				renderCell: (params) => {
					const check = prodCheck(params.row);
					if (!check) return null;
					return (
						<Tooltip title={check.detail}>
							<Chip
								size="small"
								variant={check.color === "default" ? "outlined" : "filled"}
								color={check.color}
								label={check.label}
							/>
						</Tooltip>
					);
				},
			},
			{
				field: "prod_restart_datetime",
				headerName: "Prod. restart",
				width: 150,
				valueFormatter: (value) => formatDateTimeDisplay(value as string | null),
			},
			{ field: "prod_confirm_remarks", headerName: "Prod. remark", width: 200 },
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
		[busy, onConfirmFix, onDelete, onEdit, statusLabels]
	);

	return (
		<Box sx={{ width: "100%" }}>
			{/* Desktop: the full log. */}
			<Box sx={DESKTOP_ONLY_SX}>
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

			{/* Phone: the same `rows`, as cards. A DataGrid does not reflow — at
			    360px it simply clips, and a fitter standing at a stopped machine
			    cannot scroll 17 columns sideways one-handed. Only the fields that
			    identify an incident are carried over; the rest stay on the desktop
			    grid and in the edit form. Both branches render; CSS picks one, so
			    there is no width check and nothing to hydrate-mismatch. */}
			<Box sx={MOBILE_ONLY_SX}>
				{loading ? (
					<Typography variant="body2" color="text.secondary">
						Loading incidents…
					</Typography>
				) : null}

				{!loading && rows.length === 0 ? (
					<Typography variant="body2" color="text.secondary">
						No incidents logged for this date range.
					</Typography>
				) : null}

				{rows.map((row) => {
					const code = String(row.status ?? "");
					const check = prodCheck(row);
					return (
						<MobileCard
							key={row.breakdown_id}
							header={
								<>
									<Box sx={{ flexGrow: 1, minWidth: 0 }}>
										<Typography variant="subtitle2" fontWeight={700}>
											{row.mech_code ? `${row.mech_code} — ` : ""}
											{row.machine_name ?? `Machine #${row.machine_id}`}
										</Typography>
										<Typography
											variant="caption"
											color="text.secondary"
											display="block"
										>
											#{row.breakdown_id} · {row.tran_date}
											{row.machine_type_name ? ` · ${row.machine_type_name}` : ""}
										</Typography>
									</Box>
									<Chip
										size="small"
										color={statusColor(code)}
										label={statusLabels.get(code) ?? statusFallbackLabel(code)}
									/>
									<IconButton
										size="small"
										color="primary"
										aria-label="Edit incident"
										disabled={busy}
										onClick={() => onEdit(row)}
										sx={TOUCH_ICON_BUTTON_SX}
									>
										<EditIcon size={18} />
									</IconButton>
									<IconButton
										size="small"
										color="error"
										aria-label="Delete incident"
										disabled={busy}
										onClick={() => onDelete(row)}
										sx={TOUCH_ICON_BUTTON_SX}
									>
										<Trash2Icon size={18} />
									</IconButton>
								</>
							}
						>
							<CardStat
								label="Stopped"
								value={formatDateTimeDisplay(row.stop_datetime)}
							/>
							<CardStat
								label="Downtime"
								value={
									row.duration_min == null
										? "still down"
										: formatMinutes(Number(row.duration_min))
								}
								align="right"
							/>
							<CardStat
								label="Reason"
								value={
									row.reason_code
										? `${row.reason_code}${row.reason_desc ? ` — ${row.reason_desc}` : ""}`
										: "—"
								}
							/>
							<CardStat label="Spell" value={row.spell_code ?? "—"} align="right" />
							<CardStat
								label="Reported by"
								value={row.reported_by_user_name ?? row.reported_by ?? "—"}
							/>
							<CardStat
								label="Fix entered by"
								value={row.fixed_by_user_name ?? "—"}
								align="right"
							/>
							{check ? (
								<Box sx={{ gridColumn: "1 / -1" }}>
									<Typography variant="caption" color="text.secondary" display="block">
										{check.detail}
									</Typography>
									<Button
										size="small"
										variant="outlined"
										color={check.color === "warning" ? "warning" : "success"}
										startIcon={<ConfirmIcon size={16} />}
										disabled={busy}
										onClick={() => onConfirmFix(row)}
										sx={{ mt: 0.5, minHeight: TOUCH_TARGET, width: "100%" }}
									>
										{row.prod_confirm_status ? "Change production check" : "Confirm fix"}
									</Button>
								</Box>
							) : null}
						</MobileCard>
					);
				})}
			</Box>
		</Box>
	);
}
