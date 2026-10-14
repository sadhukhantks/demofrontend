"use client";

import * as React from "react";
import { Alert, Box, Button, Chip, Stack, Typography } from "@mui/material";
import type { GridColDef } from "@mui/x-data-grid";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { exportRowsToExcel, type ReportExportHeader } from "@/components/reports/exportExcel";
import type { TargetVsActualResponse } from "../types/reportTypes";
import {
	buildTargetVsActualGridRows,
	describeTargetBasis,
	targetRowClass,
	type TargetVsActualGridRow,
} from "../utils/targetVsActual";

interface TargetVsActualTableProps {
	data: TargetVsActualResponse | null;
	loading: boolean;
	error: string | null;
	/** Company / branch / period block written above the Excel sheet. */
	exportHeader: ReportExportHeader;
}

/**
 * Target (Jute Issue Planner proposal) vs actual roll stock per jute quality
 * at the selected as-at time — TKT-000170. Short rows are tinted red, excess
 * rows amber; the last row is the total.
 */
export default function TargetVsActualTable({ data, loading, error, exportHeader }: TargetVsActualTableProps) {
	const rows = React.useMemo(() => buildTargetVsActualGridRows(data), [data]);

	const columns = React.useMemo<GridColDef<TargetVsActualGridRow>[]>(
		() => [
			{ field: "quality_name", headerName: "Quality", minWidth: 180, flex: 1 },
			{
				field: "maturity_hours",
				headerName: "Maturity (h)",
				type: "number",
				width: 110,
				valueFormatter: (value: unknown, row: TargetVsActualGridRow) =>
					value == null ? "" : `${Number(value)}${row.maturity_source === "default" ? "*" : ""}`,
			},
			numCol<TargetVsActualGridRow>("target_mt", "Target (MT)", 110, 3),
			numCol<TargetVsActualGridRow>("actual_mt", "Actual (MT)", 110, 3),
			numCol<TargetVsActualGridRow>("diff_mt", "Difference (MT)", 130, 3),
			numCol<TargetVsActualGridRow>("diff_pct", "Difference %", 110, 1),
			{
				field: "status_label",
				headerName: "Status",
				width: 110,
				cellClassName: (params) => (params.row.status === "on_target" ? "report-cell-good" : ""),
			},
		],
		[]
	);

	const handleExport = React.useCallback(() => {
		void exportRowsToExcel(columns, rows, "roll-stock-target-vs-actual", exportHeader);
	}, [columns, rows, exportHeader]);

	const totals = data?.totals;
	const anyDefaultMaturity = data?.rows.some((r) => r.maturity_source === "default") ?? false;
	const anyClamped = data?.rows.some((r) => r.target_date_clamped) ?? false;

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
			<Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
				<Typography variant="subtitle2" sx={{ mr: 1 }}>
					Target vs Actual Roll Stock
				</Typography>
				{totals ? (
					<>
						<Chip size="small" color="error" variant="outlined" label={`Short: ${totals.short_count}`} />
						<Chip size="small" color="warning" variant="outlined" label={`Excess: ${totals.excess_count}`} />
					</>
				) : null}
				<Box sx={{ flexGrow: 1 }} />
				<Button size="small" variant="outlined" onClick={handleExport} disabled={rows.length === 0}>
					Export Excel
				</Button>
			</Stack>
			{data ? (
				<Typography variant="caption" color="text.secondary">
					{describeTargetBasis(data)}
					{totals && totals.excluded_waste_count > 0
						? ` Jute waste qualities with no rolls (${totals.excluded_waste_count}, target ${totals.excluded_waste_target_mt.toFixed(3)} MT) are not spread into rolls and are left out.`
						: ""}
					{anyDefaultMaturity ? " * maturity not in the maturity master, 48 h default used." : ""}
					{anyClamped ? " Some targets use the last day of the 5-day plan window." : ""}
				</Typography>
			) : null}
			{!loading && !error && data && rows.length === 0 ? (
				<Alert severity="info">No target or roll stock for this date and time.</Alert>
			) : (
				<ReportGrid<TargetVsActualGridRow>
					rows={rows}
					columns={columns}
					getRowId={(r) => r.id}
					loading={loading}
					error={error}
					height={Math.min(640, 140 + rows.length * 40)}
					getRowClass={targetRowClass}
				/>
			)}
		</Box>
	);
}
