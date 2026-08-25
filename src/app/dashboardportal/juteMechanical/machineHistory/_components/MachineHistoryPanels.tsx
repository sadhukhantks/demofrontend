"use client";

import * as React from "react";
import { alpha } from "@mui/material/styles";
import { Alert, Box, Chip, Divider, Paper, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import type {
	MachineHistoryBreakdown,
	MachineHistoryOverhaul,
	MachineHistoryPayload,
	MachineHistoryPmExecution,
	MachineHistorySpare,
	MachineHistorySummary,
} from "../types/machineHistoryTypes";
import { formatAmount, formatMinutes } from "../types/machineHistoryTypes";

export interface MachineHistoryPanelsProps {
	payload: MachineHistoryPayload;
	summary: MachineHistorySummary;
	loading: boolean;
}

/** One cell of the summary strip. */
function SummaryTile({
	label,
	value,
	hint,
	emphasis = "normal",
}: {
	label: string;
	value: string;
	hint?: string;
	/** `alert` tints the tile with the theme's warning token — never a hardcoded color. */
	emphasis?: "normal" | "alert";
}) {
	return (
		<Paper
			variant="outlined"
			sx={{
				p: 1.5,
				minWidth: 150,
				flex: "1 1 150px",
				bgcolor:
					emphasis === "alert"
						? (theme) => alpha(theme.palette.warning.main, 0.12)
						: "background.paper",
			}}
		>
			<Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
				{label}
			</Typography>
			<Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
				{value}
			</Typography>
			{hint ? (
				<Typography variant="caption" color="text.secondary">
					{hint}
				</Typography>
			) : null}
		</Paper>
	);
}

/** A titled panel wrapping one DataGrid. */
function Panel({
	title,
	count,
	children,
}: {
	title: string;
	count: number;
	children: React.ReactNode;
}) {
	return (
		<Box>
			<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
				<Typography variant="subtitle2">{title}</Typography>
				<Chip size="small" variant="outlined" label={count} />
			</Box>
			{children}
		</Box>
	);
}

const GRID_SX = { width: "100%" } as const;

function numberOrDash(value: unknown): string {
	return typeof value === "number" ? String(value) : "—";
}

function moneyOrDash(value: unknown): string {
	return typeof value === "number" ? formatAmount(value) : "—";
}

function minutesOrDash(value: unknown): string {
	return typeof value === "number" ? formatMinutes(value) : "—";
}

/**
 * Everything known about one machine: a summary strip that answers "is this machine
 * worth overhauling?" at a glance, then the four event collections the report
 * returns — breakdowns, PM executions, overhauls and spares — each as its own grid.
 *
 * The strip's breakdown count and downtime are FAILURE-only (downtime_type =
 * BREAKDOWN), matching every other report in the module, while the breakdown panel
 * below lists every downtime type. The `Type` column makes the difference visible.
 */
export default function MachineHistoryPanels({
	payload,
	summary,
	loading,
}: MachineHistoryPanelsProps) {
	const breakdownColumns = React.useMemo<GridColDef<MachineHistoryBreakdown>[]>(
		() => [
			{ field: "tran_date", headerName: "Date", width: 110 },
			{ field: "spell_code", headerName: "Spell", width: 80 },
			{ field: "reason_code", headerName: "Reason", width: 100 },
			{ field: "reason_desc", headerName: "Description", minWidth: 180, flex: 1 },
			{ field: "component_name", headerName: "Component", width: 140 },
			{ field: "discipline", headerName: "Discipline", width: 130 },
			{ field: "downtime_type", headerName: "Type", width: 140 },
			{
				field: "duration_min",
				headerName: "Downtime",
				width: 110,
				type: "number",
				valueFormatter: minutesOrDash,
			},
			{
				field: "response_min",
				headerName: "Response",
				width: 110,
				type: "number",
				valueFormatter: minutesOrDash,
			},
			{ field: "status", headerName: "Status", width: 120 },
			{ field: "root_cause", headerName: "Root cause", minWidth: 160, flex: 1 },
			{ field: "action_taken", headerName: "Action taken", minWidth: 160, flex: 1 },
		],
		[],
	);

	const pmColumns = React.useMemo<GridColDef<MachineHistoryPmExecution>[]>(
		() => [
			{ field: "pm_date", headerName: "Date", width: 110 },
			{ field: "frequency", headerName: "Frequency", width: 130 },
			{ field: "done_by", headerName: "Done by", width: 150 },
			{
				field: "task_count",
				headerName: "Tasks",
				width: 90,
				type: "number",
				valueFormatter: numberOrDash,
			},
			{
				field: "not_ok_count",
				headerName: "Not OK",
				width: 100,
				type: "number",
				renderCell: (params) =>
					typeof params.value === "number" && params.value > 0 ? (
						<Chip size="small" color="error" label={params.value} />
					) : (
						<span>0</span>
					),
			},
			{
				field: "downtime_min",
				headerName: "Downtime",
				width: 110,
				type: "number",
				valueFormatter: minutesOrDash,
			},
			{ field: "next_due_date", headerName: "Next due", width: 120 },
			{ field: "remarks", headerName: "Remarks", minWidth: 180, flex: 1 },
		],
		[],
	);

	const overhaulColumns = React.useMemo<GridColDef<MachineHistoryOverhaul>[]>(
		() => [
			{ field: "from_date", headerName: "From", width: 110 },
			{ field: "to_date", headerName: "To", width: 110 },
			{ field: "overhaul_type", headerName: "Type", width: 100 },
			{
				field: "downtime_days",
				headerName: "Days",
				width: 80,
				type: "number",
				valueFormatter: numberOrDash,
			},
			{ field: "done_by", headerName: "Done by", width: 110 },
			{ field: "party_name", headerName: "Vendor", width: 160 },
			{
				field: "labour_cost",
				headerName: "Labour",
				width: 110,
				type: "number",
				valueFormatter: moneyOrDash,
			},
			{
				field: "spare_cost",
				headerName: "Spares",
				width: 110,
				type: "number",
				valueFormatter: moneyOrDash,
			},
			{
				field: "total_cost",
				headerName: "Total",
				width: 120,
				type: "number",
				valueFormatter: moneyOrDash,
			},
			{ field: "next_due_date", headerName: "Next due", width: 120 },
			{ field: "work_done", headerName: "Work done", minWidth: 200, flex: 1 },
		],
		[],
	);

	const spareColumns = React.useMemo<GridColDef<MachineHistorySpare>[]>(
		() => [
			{ field: "document_date", headerName: "Date", width: 110 },
			{ field: "source", headerName: "Booked on", width: 130 },
			{
				field: "document_id",
				headerName: "Doc #",
				width: 90,
				type: "number",
				valueFormatter: numberOrDash,
			},
			{ field: "item_code", headerName: "Item code", width: 150 },
			{ field: "item_name", headerName: "Item", minWidth: 180, flex: 1 },
			{ field: "uom_name", headerName: "UOM", width: 90 },
			{
				field: "qty",
				headerName: "Qty",
				width: 100,
				type: "number",
				valueFormatter: numberOrDash,
			},
			{
				field: "rate",
				headerName: "Rate",
				width: 110,
				type: "number",
				valueFormatter: moneyOrDash,
			},
			{
				field: "amount",
				headerName: "Amount",
				width: 120,
				type: "number",
				valueFormatter: moneyOrDash,
			},
			{ field: "remarks", headerName: "Remarks", minWidth: 160, flex: 1 },
		],
		[],
	);

	const machine = payload.machine;

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
			{machine ? (
				<Box>
					<Typography variant="h6" sx={{ fontWeight: 600 }}>
						{machine.mech_code ? `${machine.mech_code} — ` : ""}
						{machine.machine_name ?? "Machine"}
					</Typography>
					<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 0.5 }}>
						{machine.machine_type_name ? (
							<Chip size="small" variant="outlined" label={machine.machine_type_name} />
						) : null}
						{machine.dept_name ? (
							<Chip size="small" variant="outlined" label={machine.dept_name} />
						) : null}
						{machine.criticality ? (
							<Chip
								size="small"
								color={machine.criticality === "A" ? "error" : "default"}
								variant={machine.criticality === "A" ? "filled" : "outlined"}
								label={`Criticality ${machine.criticality}`}
							/>
						) : null}
						{machine.make || machine.model ? (
							<Chip
								size="small"
								variant="outlined"
								label={[machine.make, machine.model].filter(Boolean).join(" ")}
							/>
						) : null}
						{machine.serial_no ? (
							<Chip size="small" variant="outlined" label={`S/N ${machine.serial_no}`} />
						) : null}
					</Box>
				</Box>
			) : null}

			{/* Lead with the decision numbers, not the raw event log. */}
			<Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
				<SummaryTile
					label="Breakdowns"
					value={String(summary.breakdownCount)}
					hint="Failures in range"
					emphasis={summary.breakdownCount > 0 ? "alert" : "normal"}
				/>
				<SummaryTile
					label="Total downtime"
					value={formatMinutes(summary.totalDowntimeMin)}
					hint={summary.mttrMin === null ? "No failures" : `MTTR ${formatMinutes(summary.mttrMin)}`}
				/>
				<SummaryTile
					label="Last PM"
					value={summary.lastPmDate ?? "Never"}
					hint={
						summary.failedChecksLastPm && summary.failedChecksLastPm > 0
							? `${summary.failedChecksLastPm} check(s) not OK`
							: summary.nextPmDue
								? `Next due ${summary.nextPmDue}`
								: "No next-due date"
					}
					emphasis={
						summary.failedChecksLastPm && summary.failedChecksLastPm > 0 ? "alert" : "normal"
					}
				/>
				<SummaryTile
					label="Last overhaul"
					value={summary.lastOverhaulDate ?? "Never"}
					hint={`${summary.overhaulCount} on record`}
				/>
				<SummaryTile
					label="Next overhaul due"
					value={summary.nextOverhaulDue ?? "Not set"}
					hint={
						summary.overhaulIntervalMissing
							? "No interval configured"
							: `Every ${machine?.overhaul_freq_months ?? "?"} months`
					}
					emphasis={summary.overhaulIntervalMissing ? "alert" : "normal"}
				/>
				<SummaryTile
					label="Maintenance cost"
					value={formatAmount(summary.overhaulCost + summary.spareValue)}
					hint={`Overhauls ${formatAmount(summary.overhaulCost)} · spares ${formatAmount(summary.spareValue)}`}
				/>
			</Box>

			{summary.openBreakdownCount > 0 ? (
				<Alert severity="warning">
					{summary.openBreakdownCount} incident
					{summary.openBreakdownCount === 1 ? " has" : "s have"} no restart time recorded — this
					machine may still be down.
				</Alert>
			) : null}

			{summary.overhaulIntervalMissing ? (
				<Alert severity="info">
					No overhaul interval is set for this machine, so it can never show up on the
					maintenance-due report. Set <strong>overhaul frequency (months)</strong> in Maintenance
					Masters &gt; Machine Attributes.
				</Alert>
			) : null}

			<Divider />

			<Panel title="Breakdowns" count={payload.breakdowns.length}>
				<Box sx={{ width: "100%", overflowX: "auto" }}>
					<DataGrid
						autoHeight
						rows={payload.breakdowns}
						getRowId={(row) => row.breakdown_id}
						columns={breakdownColumns}
						loading={loading}
						disableRowSelectionOnClick
						density="compact"
						pageSizeOptions={[10, 25, 50]}
						initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
						sx={GRID_SX}
					/>
				</Box>
			</Panel>

			<Panel title="Preventive maintenance" count={payload.pm_executions.length}>
				<Box sx={{ width: "100%", overflowX: "auto" }}>
					<DataGrid
						autoHeight
						rows={payload.pm_executions}
						getRowId={(row) => row.pm_exec_id}
						columns={pmColumns}
						loading={loading}
						disableRowSelectionOnClick
						density="compact"
						pageSizeOptions={[10, 25, 50]}
						initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
						sx={GRID_SX}
					/>
				</Box>
			</Panel>

			<Panel title="Overhauls" count={payload.overhauls.length}>
				<Box sx={{ width: "100%", overflowX: "auto" }}>
					<DataGrid
						autoHeight
						rows={payload.overhauls}
						getRowId={(row) => row.overhaul_id}
						columns={overhaulColumns}
						loading={loading}
						disableRowSelectionOnClick
						density="compact"
						pageSizeOptions={[10, 25, 50]}
						initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
						sx={GRID_SX}
					/>
				</Box>
			</Panel>

			<Panel title="Spares consumed" count={payload.spares.length}>
				<Box sx={{ width: "100%", overflowX: "auto" }}>
					<DataGrid
						autoHeight
						rows={payload.spares}
						getRowId={(row) => row.row_id}
						columns={spareColumns}
						loading={loading}
						disableRowSelectionOnClick
						density="compact"
						pageSizeOptions={[10, 25, 50]}
						initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
						sx={GRID_SX}
					/>
				</Box>
			</Panel>
		</Box>
	);
}
