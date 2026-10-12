"use client";

import * as React from "react";
import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import {
	formatKg,
	formatMt,
	sackingSeriesLines,
	seriesLineName,
	seriesSummaryTotals,
} from "@/components/juteProduction/baleStock/baleStockCalc";
import type { BaleStockSeriesLine } from "@/utils/baleStockService";

export interface BaleSeriesSummaryTableProps {
	/** `summary.series_lines` as returned — every quality type; sacking is kept here. */
	lines: ReadonlyArray<BaleStockSeriesLine>;
	loading: boolean;
	/** Series currently applied to the grid filter, "" when none — its rows are highlighted. */
	selectedSeriesId: number | "";
	/** Apply this series to the grid filters (the page owns the filter state). */
	onSelectSeries: (baleSeriesId: number) => void;
}

const NUM_SX = { whiteSpace: "nowrap" } as const;

/**
 * "Sacking bales by series" — the per-series breakup of the sacking stock as
 * on the date, one row per (series, quality) line, sorted by series then
 * quality, closed by a "Sacking total" row. Sacking bales are numbered per
 * consignee series (PUNJAB, BIHAR, …) and despatched / inspected that way, so
 * this sits right under the per-quality summary (spec §7a). Clicking a row
 * filters the bale grid to that series. Renders nothing when the date has no
 * sacking series line — the quality table above already says "no bales".
 */
export default function BaleSeriesSummaryTable({
	lines,
	loading,
	selectedSeriesId,
	onSelectSeries,
}: BaleSeriesSummaryTableProps) {
	const sacking = React.useMemo(() => sackingSeriesLines(lines), [lines]);
	const totals = React.useMemo(() => seriesSummaryTotals(sacking), [sacking]);

	if (sacking.length === 0) return null;

	const totalSx = { fontWeight: 700, bgcolor: "action.hover" } as const;

	return (
		<Box sx={{ mt: 2 }}>
			<Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
				Sacking bales by series
			</Typography>
			<Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
				Click a row to show only that series in the bale list below.
			</Typography>
			<Box sx={{ width: "100%", overflowX: "auto", opacity: loading ? 0.6 : 1 }}>
				<Table size="small" sx={{ minWidth: 720 }}>
					<TableHead>
						<TableRow>
							<TableCell>Series</TableCell>
							<TableCell>Quality</TableCell>
							<TableCell align="right">In stock</TableCell>
							<TableCell align="right">Inspected</TableCell>
							<TableCell align="right">Not inspected</TableCell>
							<TableCell align="right">Per-bale kg</TableCell>
							<TableCell align="right">MT</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{sacking.map((l) => {
							const name = seriesLineName(l);
							const bales = Number(l.bales) || 0;
							const inspected = Number(l.inspected_bales) || 0;
							const select = () => onSelectSeries(l.bale_series_id);
							return (
								<TableRow
									key={`${l.bale_series_id}-${l.finishing_quality_id}`}
									hover
									selected={selectedSeriesId === l.bale_series_id}
									role="button"
									tabIndex={0}
									aria-label={`Filter bales by series ${name}`}
									onClick={select}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											select();
										}
									}}
									sx={{ cursor: "pointer" }}
								>
									<TableCell sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>{name}</TableCell>
									<TableCell sx={{ whiteSpace: "normal", minWidth: 200 }}>
										{l.item_name ?? `#${l.item_id ?? l.finishing_quality_id}`}
									</TableCell>
									<TableCell align="right" sx={NUM_SX}>
										{bales}
									</TableCell>
									<TableCell align="right" sx={NUM_SX}>
										{inspected}
									</TableCell>
									<TableCell align="right" sx={NUM_SX}>
										{Math.max(bales - inspected, 0)}
									</TableCell>
									<TableCell align="right" sx={NUM_SX}>
										{formatKg(l.per_wt_kg)}
									</TableCell>
									<TableCell align="right" sx={NUM_SX}>
										{formatMt(l.wt_mt)}
									</TableCell>
								</TableRow>
							);
						})}
						<TableRow>
							<TableCell colSpan={2} sx={totalSx}>
								Sacking total
							</TableCell>
							<TableCell align="right" sx={totalSx}>
								{totals.bales}
							</TableCell>
							<TableCell align="right" sx={totalSx}>
								{totals.inspected}
							</TableCell>
							<TableCell align="right" sx={totalSx}>
								{totals.notInspected}
							</TableCell>
							<TableCell align="right" sx={totalSx}>
								{formatKg(totals.perBaleKg)}
							</TableCell>
							<TableCell align="right" sx={totalSx}>
								{formatMt(totals.mt)}
							</TableCell>
						</TableRow>
					</TableBody>
				</Table>
			</Box>
		</Box>
	);
}
