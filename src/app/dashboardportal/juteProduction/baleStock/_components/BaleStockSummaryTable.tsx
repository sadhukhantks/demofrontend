"use client";

import * as React from "react";
import {
	Box,
	CircularProgress,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableRow,
	Typography,
} from "@mui/material";
import {
	formatKg,
	formatMt,
	SACKING_QUALITY_TYPE,
	summaryTotals,
	type SummaryGroupTotals,
} from "@/components/juteProduction/baleStock/baleStockCalc";
import type { BaleStockSummary, BaleStockSummaryLine } from "@/utils/baleStockService";

export interface BaleStockSummaryTableProps {
	summary: BaleStockSummary | null;
	loading: boolean;
}

/** Σ total_kg / Σ bales over a group of lines — null when nothing is in stock. */
function perBaleKg(lines: ReadonlyArray<BaleStockSummaryLine>): number | null {
	let kg = 0;
	let bales = 0;
	lines.forEach((l) => {
		kg += Number(l.total_kg) || 0;
		bales += Number(l.bales) || 0;
	});
	return bales > 0 ? kg / bales : null;
}

function LineRow({ line }: { line: BaleStockSummaryLine }) {
	const notInspected = Math.max((Number(line.bales) || 0) - (Number(line.inspected_bales) || 0), 0);
	return (
		<TableRow hover>
			<TableCell sx={{ pl: 3 }}>{line.item_name ?? `#${line.item_id ?? line.finishing_quality_id}`}</TableCell>
			<TableCell align="right">{line.bales}</TableCell>
			<TableCell align="right">{line.quality_type === SACKING_QUALITY_TYPE ? line.inspected_bales : "—"}</TableCell>
			<TableCell align="right">{line.quality_type === SACKING_QUALITY_TYPE ? notInspected : "—"}</TableCell>
			<TableCell align="right">{formatKg(line.per_wt_kg)}</TableCell>
			<TableCell align="right">{formatMt(line.wt_mt)}</TableCell>
		</TableRow>
	);
}

function TotalRow({
	label,
	totals,
	perBale,
	sacking,
	grand = false,
}: {
	label: string;
	totals: SummaryGroupTotals;
	perBale: number | null;
	/** Inspection columns only mean something for sacking (and the grand total). */
	sacking: boolean;
	grand?: boolean;
}) {
	const sx = { fontWeight: grand ? 700 : 600, bgcolor: grand ? "action.hover" : undefined } as const;
	return (
		<TableRow>
			<TableCell sx={sx}>{label}</TableCell>
			<TableCell align="right" sx={sx}>
				{totals.bales}
			</TableCell>
			<TableCell align="right" sx={sx}>
				{sacking ? totals.inspected : "—"}
			</TableCell>
			<TableCell align="right" sx={sx}>
				{sacking ? totals.notInspected : "—"}
			</TableCell>
			<TableCell align="right" sx={sx}>
				{formatKg(perBale)}
			</TableCell>
			<TableCell align="right" sx={sx}>
				{formatMt(totals.mt)}
			</TableCell>
		</TableRow>
	);
}

/**
 * Stock position as on the date, one line per quality, grouped Hessian /
 * Sacking with subtotals and an overall total: In stock · Inspected · Not
 * inspected · Per-bale kg · MT. Inspection columns read "—" on hessian, which
 * is never inspected. Renders from `summary.lines` only; totals are recomputed
 * client-side (`summaryTotals`) so they always agree with the lines shown.
 */
export default function BaleStockSummaryTable({ summary, loading }: BaleStockSummaryTableProps) {
	const lines = React.useMemo(() => summary?.lines ?? [], [summary]);
	const hessianLines = React.useMemo(() => lines.filter((l) => l.quality_type !== SACKING_QUALITY_TYPE), [lines]);
	const sackingLines = React.useMemo(() => lines.filter((l) => l.quality_type === SACKING_QUALITY_TYPE), [lines]);
	const totals = React.useMemo(() => summaryTotals(lines), [lines]);

	if (loading && !summary) {
		return (
			<Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
				<CircularProgress size={24} />
			</Box>
		);
	}

	if (!summary || lines.length === 0) {
		return (
			<Typography variant="body2" color="text.secondary">
				No bales in stock as on {summary?.as_on ?? "this date"}.
			</Typography>
		);
	}

	const group = (title: string, groupLines: BaleStockSummaryLine[], groupTotals: SummaryGroupTotals, sacking: boolean) =>
		groupLines.length === 0 ? null : (
			<>
				<TableRow>
					<TableCell colSpan={6} sx={{ fontWeight: 600, bgcolor: "action.hover" }}>
						{title}
					</TableCell>
				</TableRow>
				{groupLines.map((l) => (
					<LineRow key={l.finishing_quality_id} line={l} />
				))}
				<TotalRow label={`${title} total`} totals={groupTotals} perBale={perBaleKg(groupLines)} sacking={sacking} />
			</>
		);

	return (
		<Box sx={{ width: "100%", overflowX: "auto", opacity: loading ? 0.6 : 1 }}>
			<Table size="small" sx={{ minWidth: 640 }}>
				<TableHead>
					<TableRow>
						<TableCell>Quality</TableCell>
						<TableCell align="right">In stock</TableCell>
						<TableCell align="right">Inspected</TableCell>
						<TableCell align="right">Not inspected</TableCell>
						<TableCell align="right">Per-bale kg</TableCell>
						<TableCell align="right">MT</TableCell>
					</TableRow>
				</TableHead>
				<TableBody>
					{group("Hessian", hessianLines, totals.hessian, false)}
					{group("Sacking", sackingLines, totals.sacking, true)}
					{/* Per-bale kg across hessian AND sacking is a blend of two standards
					    (≈400 vs ≈290 kg) that nobody reads — left blank on the grand total. */}
					<TotalRow label="Total" totals={totals.overall} perBale={null} sacking grand />
				</TableBody>
			</Table>
		</Box>
	);
}
