"use client";

import * as React from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import type { RollStockRow, QualitySummaryRow } from "../types/spreaderTypes";
import { maturityColorClass } from "../utils/maturityColor";

type Props = {
	rows: RollStockRow[];
	summary: QualitySummaryRow[];
	loading: boolean;
	summaryFirst?: boolean;
	detailTitle?: string;
};

export default function RollStockTable({ rows, summary, loading, summaryFirst, detailTitle }: Props) {
	const [selectedQualities, setSelectedQualities] = React.useState<string[]>([]);
	const availableQualities = React.useMemo(
		() => Array.from(new Map(rows.map((r) => [r.quality_label, r.quality_label])).keys()),
		[rows]
	);

	const filtered = React.useMemo(
		() =>
			selectedQualities.length === 0
				? rows
				: rows.filter((r) => selectedQualities.includes(r.quality_label)),
		[rows, selectedQualities]
	);

	const filteredSummary = React.useMemo(
		() =>
			selectedQualities.length === 0
				? summary
				: summary.filter((s) => selectedQualities.includes(s.quality_label)),
		[summary, selectedQualities]
	);

	const columns = React.useMemo<GridColDef<RollStockRow>[]>(
		() => [
			{ field: "bin_code", headerName: "Bin", width: 100 },
			{ field: "entry_id_grp", headerName: "Group", width: 80 },
			{ field: "quality_label", headerName: "Quality", width: 220 },
			{ field: "current_rolls", headerName: "Rolls", width: 90, type: "number" },
			{
				field: "current_mt",
				headerName: "Qty (MT)",
				width: 100,
				type: "number",
				valueFormatter: (value) => (value != null ? Number(value).toFixed(3) : ""),
			},
			{
				field: "maturity_hrs",
				headerName: "Maturity (hrs)",
				width: 130,
				type: "number",
				renderCell: (params) => {
					const target = params.row.target_maturity_hrs;
					const cls = maturityColorClass(params.row.maturity_hrs, target);
					return (
						<span className={`px-2 py-1 rounded ${cls}`}>{params.row.maturity_hrs}</span>
					);
				},
			},
			{ field: "target_maturity_hrs", headerName: "Target (hrs)", width: 110, type: "number" },
		],
		[]
	);

	const summaryColumns = React.useMemo<GridColDef<QualitySummaryRow>[]>(
		() => [
			{ field: "quality_label", headerName: "Quality", flex: 1, minWidth: 220 },
			{ field: "closing_rolls", headerName: "Rolls", width: 100, type: "number" },
			{
				field: "closing_mt",
				headerName: "Qty (MT)",
				width: 110,
				type: "number",
				valueFormatter: (value) => (value != null ? Number(value).toFixed(3) : ""),
			},
			{ field: "comp1_kg", headerName: "Comp 1 (kg)", width: 110, type: "number" },
			{ field: "comp2_kg", headerName: "Comp 2 (kg)", width: 110, type: "number" },
		],
		[]
	);

	const detailBlock = (
		<Box sx={{ width: "100%" }}>
			<Typography variant="subtitle2" sx={{ mb: 1 }}>
				{detailTitle ?? "Current Roll Stock (Bin × Group × Quality)"}
			</Typography>
			<DataGrid
				autoHeight
				rows={filtered.map((r, i) => ({ ...r, id: `${r.bin_id}-${r.entry_id_grp}-${i}` }))}
				columns={columns}
				loading={loading}
				density="comfortable"
				disableRowSelectionOnClick
				pageSizeOptions={[10, 25, 50]}
				initialState={{
					pagination: { paginationModel: { pageSize: 25, page: 0 } },
				}}
				sx={{ width: "100%" }}
			/>
		</Box>
	);

	const summaryRowsWithTotal = React.useMemo(() => {
		const rows = filteredSummary.map((r) => ({
			...r,
			id: `${r.item_id}-${r.item_id_2 ?? 0}-${r.ratio_1}-${r.ratio_2 ?? 0}`,
		}));
		if (rows.length === 0) return rows;
		const sum = (f: (r: QualitySummaryRow) => number) =>
			filteredSummary.reduce((a, r) => a + (f(r) || 0), 0);
		rows.push({
			id: "__total__",
			quality_label: "TOTAL",
			closing_rolls: sum((r) => r.closing_rolls),
			closing_mt: Math.round(sum((r) => r.closing_mt) * 1000) / 1000,
			comp1_kg: Math.round(sum((r) => r.comp1_kg) * 1000) / 1000,
			comp2_kg: Math.round(sum((r) => r.comp2_kg) * 1000) / 1000,
		} as (typeof rows)[number]);
		return rows;
	}, [filteredSummary]);

	const summaryBlock = (
		<Box sx={{ width: "100%" }}>
			<Typography variant="subtitle2" sx={{ mb: 1 }}>
				Quality-wise Closing Stock
			</Typography>
			<DataGrid
				autoHeight
				rows={summaryRowsWithTotal}
				columns={summaryColumns}
				loading={loading}
				density="comfortable"
				disableRowSelectionOnClick
				hideFooter
				sx={{ width: "100%" }}
			/>
		</Box>
	);

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
				{availableQualities.map((label) => {
					const active = selectedQualities.includes(label);
					return (
						<Chip
							key={label}
							label={label}
							color={active ? "primary" : "default"}
							variant={active ? "filled" : "outlined"}
							onClick={() =>
								setSelectedQualities((prev) =>
									prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]
								)
							}
							sx={{ minHeight: 32 }}
						/>
					);
				})}
				{selectedQualities.length > 0 ? (
					<Chip label="Clear filters" onDelete={() => setSelectedQualities([])} onClick={() => setSelectedQualities([])} />
				) : null}
			</Stack>
			{summaryFirst ? summaryBlock : detailBlock}
			{summaryFirst ? detailBlock : summaryBlock}
		</Box>
	);
}
