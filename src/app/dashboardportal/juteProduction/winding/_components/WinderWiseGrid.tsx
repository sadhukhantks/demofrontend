"use client";

import * as React from "react";
import { Alert, Box, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useWindingSpellReport } from "../hooks/useWindingSpellReport";
import { winderWiseRows, winderWiseTotal, type WinderWiseRow } from "../utils/windingCalc";

type Props = {
	coId: string;
	branchId: number;
	date: string;
	spellId: number | null;
	refreshSignal: number;
};

// Reads the server reconciliation (WINDING_SPELL_REPORT) rather than re-summing
// the doff grid: Production and Total must carry the jugar adjustment
// (doff - opening + closing), which only the backend computes.
export default function WinderWiseGrid({ coId, branchId, date, spellId, refreshSignal }: Props) {
	const { rows, loading, error, refresh } = useWindingSpellReport(coId, date, branchId);

	React.useEffect(() => {
		refresh();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [refreshSignal]);

	const gridRows = React.useMemo(() => winderWiseRows(rows, spellId), [rows, spellId]);

	const columns = React.useMemo<GridColDef<WinderWiseRow>[]>(
		() => [
			// Small minWidths + flex so the columns fit a phone without horizontal
			// scroll; text wraps instead (see getRowHeight/sx below).
			{ field: "winder", headerName: "Winder (EB No)", flex: 1.2, minWidth: 110 },
			{ field: "item_code", headerName: "Yarn Quality", flex: 0.6, minWidth: 80 },
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
			<Typography variant="subtitle2" sx={{ mb: 0.5 }}>
				Winder wise production — total {total} kg
			</Typography>
			<Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
				Production = doff weight − opening jugar + closing jugar.
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
				loading={loading}
				disableRowSelectionOnClick
				density="comfortable"
				getRowHeight={() => "auto"}
				pageSizeOptions={[10, 25, 50]}
				initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
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
