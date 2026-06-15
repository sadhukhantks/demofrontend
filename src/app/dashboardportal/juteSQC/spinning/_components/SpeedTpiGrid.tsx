"use client";

import * as React from "react";
import { Box } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import type { SqcEntryRow } from "../types/sqcSpinningTypes";

type Props = {
	rows: SqcEntryRow[];
	loading: boolean;
};

export default function SpeedTpiGrid({ rows, loading }: Props) {
	// Backend may not always send a stable PK; fall back to a composite key.
	const getRowId = React.useCallback(
		(r: SqcEntryRow) =>
			r.jute_sqc_spinning_entry_id ?? `${r.mc_id}-${r.yarn_quality_id}-${r.entry_date}`,
		[]
	);

	const columns = React.useMemo<GridColDef<SqcEntryRow>[]>(
		() => [
			{
				field: "machine_name",
				headerName: "Machine",
				width: 180,
				valueGetter: (_value, row) => row.machine_name ?? `MC #${row.mc_id}`,
			},
			{ field: "mech_code", headerName: "Code", width: 110 },
			{
				field: "quality_name",
				headerName: "Quality",
				width: 180,
				valueGetter: (_value, row) => row.quality_name ?? `Q #${row.yarn_quality_id}`,
			},
			{ field: "quality_code", headerName: "Q.Code", width: 110 },
			{
				field: "actual_speed",
				headerName: "Actual Speed",
				width: 130,
				type: "number",
				valueFormatter: (value) => (value != null ? Number(value).toFixed(2) : ""),
			},
			{
				field: "actual_tpi",
				headerName: "Actual TPI",
				width: 120,
				type: "number",
				valueFormatter: (value) => (value != null ? Number(value).toFixed(2) : ""),
			},
		],
		[]
	);

	return (
		<Box sx={{ width: "100%", overflowX: "auto" }}>
			<DataGrid
				autoHeight
				rows={rows}
				getRowId={getRowId}
				columns={columns}
				loading={loading}
				disableRowSelectionOnClick
				density="comfortable"
				pageSizeOptions={[10, 25, 50]}
				initialState={{
					pagination: { paginationModel: { pageSize: 25, page: 0 } },
				}}
				sx={{ minWidth: 900 }}
			/>
		</Box>
	);
}
