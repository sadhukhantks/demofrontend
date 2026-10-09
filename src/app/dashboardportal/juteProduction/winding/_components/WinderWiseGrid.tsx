"use client";

import * as React from "react";
import {
	Alert,
	Box,
	ToggleButton,
	ToggleButtonGroup,
	Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useWindingSpellReport } from "../hooks/useWindingSpellReport";
import {
	winderWiseRows,
	winderWiseShiftTotals,
	winderWiseTotal,
	type WinderWiseRow,
} from "../utils/windingCalc";

type Props = {
	coId: string;
	branchId: number;
	date: string;
	spellId: number | null;
	refreshSignal: number;
};

// "all"   = every winder of the day, shifts A, B and C together (default —
//           TKT-000169: the tab used to show only the spell picked above, so the
//           other shifts' production was never visible here).
// "spell" = only the spell picked in the shared Spell selector (the old view).
type Scope = "all" | "spell";

// Reads the server reconciliation (WINDING_SPELL_REPORT) rather than re-summing
// the doff grid: Production and Total must carry the jugar adjustment
// (doff - opening + closing), which only the backend computes.
export default function WinderWiseGrid({ coId, branchId, date, spellId, refreshSignal }: Props) {
	const { rows, loading, error, refresh } = useWindingSpellReport(coId, date, branchId);
	const [scope, setScope] = React.useState<Scope>("all");

	React.useEffect(() => {
		refresh();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [refreshSignal]);

	const gridRows = React.useMemo(
		() => winderWiseRows(rows, scope === "spell" ? spellId : null),
		[rows, scope, spellId],
	);
	const shiftTotals = React.useMemo(() => winderWiseShiftTotals(gridRows), [gridRows]);

	const columns = React.useMemo<GridColDef<WinderWiseRow>[]>(
		() => [
			// Small minWidths + flex so the columns fit a phone without horizontal
			// scroll; text wraps instead (see getRowHeight/sx below).
			{ field: "spell_code", headerName: "Spell", flex: 0.4, minWidth: 60 },
			{ field: "winder", headerName: "Winder (EB No)", flex: 1.2, minWidth: 110 },
			{ field: "machine", headerName: "Machine", flex: 0.6, minWidth: 80 },
			{ field: "item_code", headerName: "Yarn Quality", flex: 0.6, minWidth: 80 },
			{
				field: "target_kg",
				headerName: "Target (kg)",
				type: "number",
				flex: 0.6,
				minWidth: 85,
				valueFormatter: (value) => (value == null ? "—" : Number(value).toFixed(3)),
			},
			{
				field: "sum_production",
				headerName: "Doff (kg)",
				type: "number",
				flex: 0.6,
				minWidth: 90,
			},
			{
				field: "opening_jugar",
				headerName: "Op. Jugar (kg)",
				type: "number",
				flex: 0.6,
				minWidth: 90,
			},
			{
				field: "closing_jugar",
				headerName: "Cl. Jugar (kg)",
				type: "number",
				flex: 0.6,
				minWidth: 90,
			},
			{
				field: "production_kg",
				headerName: "Production (kg)",
				type: "number",
				flex: 0.7,
				minWidth: 100,
			},
		],
		[],
	);

	const total = winderWiseTotal(gridRows);

	return (
		<Box>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 1,
					flexWrap: "wrap",
					mb: 0.5,
				}}
			>
				<Typography variant="subtitle2">
					Winder wise production — total {total} kg
				</Typography>
				<ToggleButtonGroup
					size="small"
					exclusive
					value={scope}
					onChange={(_e, v: Scope | null) => {
						if (v) setScope(v);
					}}
					aria-label="Winder wise scope"
				>
					<ToggleButton value="all">All shifts</ToggleButton>
					<ToggleButton value="spell">Selected spell</ToggleButton>
				</ToggleButtonGroup>
			</Box>
			{scope === "all" ? (
				<Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 0.5 }}>
					{shiftTotals.map((t) => (
						<Typography key={t.shift} variant="body2">
							<strong>
								{t.shift === "Other" ? "Other" : `Shift ${t.shift}`}
							</strong>
							: {t.production_kg} kg
							{t.target_kg != null ? ` (target ${t.target_kg})` : ""} — {t.winders}{" "}
							{t.winders === 1 ? "winder" : "winders"}
						</Typography>
					))}
				</Box>
			) : null}
			<Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
				Production = doff weight − opening jugar + closing jugar. Machine = the machine
				mapped to the winder on the Quality tab for that spell. Target = the winding
				standard (KG per winder per 8-hour shift) scaled to the spell&apos;s hours;
				blank when the yarn quality has no standard set in Winding Standards.
			</Typography>
			{error ? (
				<Alert severity="error" sx={{ mb: 1 }}>
					{error}
				</Alert>
			) : null}
			<DataGrid
				autoHeight
				rows={gridRows}
				columns={columns}
				columnVisibilityModel={{ spell_code: scope === "all" }}
				loading={loading}
				disableRowSelectionOnClick
				density="comfortable"
				getRowHeight={() => "auto"}
				pageSizeOptions={[10, 25, 50, 100]}
				initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
				sx={{
					width: "100%",
					// Wrap instead of truncating/scrolling — rows auto-size to fit.
					"& .MuiDataGrid-cell": {
						whiteSpace: "normal",
						wordBreak: "break-word",
						lineHeight: 1.4,
						alignItems: "flex-start",
						py: 1,
					},
					"& .MuiDataGrid-columnHeaderTitle": {
						whiteSpace: "normal",
						lineHeight: 1.2,
					},
				}}
			/>
		</Box>
	);
}
