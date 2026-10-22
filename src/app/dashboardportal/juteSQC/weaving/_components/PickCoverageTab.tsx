"use client";

/**
 * Picks Coverage (ITM-013) — per date × quality, how many of the day's pick
 * readings equal the quality standard at 2 dp PPI and what share was really
 * measured. Coverage, not achievement: the standard PPI sits beside the
 * figures and no "% of standard" is shown anywhere. The page owns branch
 * resolution; this tab owns its own date range and fetch.
 *
 * Shared pieces are imported across the route boundary from
 * juteProduction/report/spinningProductionTrend (the page's TargetMapEditor
 * precedent) and never edited here.
 */

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
	Paper,
	TextField,
	Typography,
	useMediaQuery,
	useTheme,
} from "@mui/material";
import { KpiCard, type KpiState } from "@/app/dashboardportal/juteProduction/report/dailyProductionReport/_components/DprPieces";
import DataTable from "@/app/dashboardportal/juteProduction/report/spinningProductionTrend/_components/DataTable";
import type { RowTone } from "@/app/dashboardportal/juteProduction/report/spinningProductionTrend/_components/CompactTable";
import { toGridColumns, type Col } from "@/app/dashboardportal/juteProduction/report/spinningProductionTrend/tableColumns";
import {
	DEFAULT_RANGE_DAYS,
	matchingPreset,
	PRESET_DAYS,
	RANGE_CAP_DAYS,
	rangeError,
	windowEndingOn,
} from "@/app/dashboardportal/juteProduction/report/spinningProductionTrend/range";
import { todayISO } from "@/app/dashboardportal/juteProduction/spinning/utils/spinningCalc";
import SqcPrintButton from "../../_shared/SqcPrintButton";
import type { PrintCell, PrintColumn, SqcPrintReport } from "../../_shared/printReport";
import { useWeavingPickCoverage, type WeavingPickCoverageRow } from "../hooks/useWeavingPickCoverage";

type Props = {
	coId: string;
	branchId: number;
	branchName?: string;
	companyName?: string;
};

// One column definition serves the desktop grid, the phone table and the
// print/Excel/PDF export (see tableColumns.ts).
const COVERAGE_COLS: Col<WeavingPickCoverageRow>[] = [
	{ field: "date", header: "Date", width: 110 },
	{ field: "quality", header: "Quality", flex: true, minWidth: 180 },
	{ field: "readings", header: "Readings", short: "N", num: true, decimals: 0 },
	{ field: "equal_to_std", header: "= Std", short: "=Std", num: true, decimals: 0 },
	{ field: "measured_share_pct", header: "Measured %", short: "Meas %", num: true, decimals: 1 },
	{ field: "std_picks_ppi", header: "Std PPI", num: true, decimals: 2 },
	{ field: "std_picks_dm", header: "Std picks/dm", num: true, decimals: 2, phone: false },
];
const COVERAGE_GRID_COLS = toGridColumns(COVERAGE_COLS);

// Row tint: the numbers are in the row, colour is never the only signal.
function rowTone(r: WeavingPickCoverageRow): RowTone {
	if (!r.has_std || r.measured_share_pct == null) return undefined;
	if (r.measured_share_pct === 0) return "low";
	if (r.measured_share_pct < 50) return "watch";
	return undefined;
}
const ROW_CLASS: Record<string, string> = { low: "report-perf-low", watch: "report-perf-watch" };
function rowClass(r: WeavingPickCoverageRow): string {
	const tone = rowTone(r);
	return tone ? ROW_CLASS[tone] : "";
}

function shareState(pct: number | null | undefined): KpiState {
	if (pct == null) return undefined;
	if (pct < 50) return "bad";
	if (pct < 80) return "warn";
	return "good";
}

const fmtCell = (v: number | null | undefined, dp: number): PrintCell =>
	v == null ? "—" : Number(v).toFixed(dp);

const rowId = (r: WeavingPickCoverageRow): string => `${r.date}-${r.weaving_quality_id}`;

export default function PickCoverageTab({ coId, branchId, branchName, companyName }: Props) {
	const theme = useTheme();
	// noSsr is safe: page.tsx already gates rendering on mounted.
	const isPhone = useMediaQuery(theme.breakpoints.down("sm"), { noSsr: true });

	const [initial] = React.useState(() => windowEndingOn(todayISO(), DEFAULT_RANGE_DAYS));
	const [dateFrom, setDateFrom] = React.useState<string>(initial.from);
	const [dateTo, setDateTo] = React.useState<string>(initial.to);
	const [rangeMsg, setRangeMsg] = React.useState<string | null>(null);

	const { rows, meta, loading, error, run } = useWeavingPickCoverage();

	// Latest dates for the automatic run (mount / branch change) without
	// re-running on every keystroke in the date fields.
	const datesRef = React.useRef({ from: dateFrom, to: dateTo });
	datesRef.current = { from: dateFrom, to: dateTo };

	const submit = React.useCallback(
		(from: string, to: string) => {
			const bad = rangeError(from, to);
			if (bad) {
				setRangeMsg(bad);
				return;
			}
			setRangeMsg(null);
			void run({ coId, branchId, dateFrom: from, dateTo: to });
		},
		[coId, branchId, run]
	);

	// One automatic run on mount and whenever the branch changes; afterwards
	// only Submit re-queries.
	React.useEffect(() => {
		submit(datesRef.current.from, datesRef.current.to);
	}, [submit]);

	const applyPreset = (days: number) => {
		const w = windowEndingOn(dateTo || todayISO(), days);
		setDateFrom(w.from);
		setDateTo(w.to);
	};
	const activePreset = matchingPreset(dateFrom, dateTo);
	const totals = meta?.totals ?? null;

	const buildReport = React.useCallback((): SqcPrintReport | null => {
		if (loading || !meta) return null;
		const columns: PrintColumn[] = COVERAGE_COLS.map((c) => ({
			key: c.field,
			label: c.header,
			align: c.num ? "right" : "left",
		}));
		const printRows = rows.map((r) => ({
			date: r.date,
			quality: r.quality,
			readings: String(r.readings),
			equal_to_std: String(r.equal_to_std),
			measured_share_pct: fmtCell(r.measured_share_pct, 1),
			std_picks_ppi: fmtCell(r.std_picks_ppi, 2),
			std_picks_dm: fmtCell(r.std_picks_dm, 2),
		}));
		const t = meta.totals;
		return {
			reportTitle: "Weaving Picks Coverage (SQC)",
			reportCode: "R-08-21",
			companyName,
			branchName,
			reportDate: `${meta.date_from} to ${meta.date_to}`,
			headerFields: [
				{ label: "From", value: meta.date_from },
				{ label: "To", value: meta.date_to },
			],
			sections: [
				{
					kind: "meta",
					title: "Totals",
					fields: [
						{ label: "Readings", value: t.readings },
						{ label: "Equal to std", value: `${t.equal_to_std} of ${t.readings_with_std} with a standard` },
						{ label: "Measured share %", value: fmtCell(t.measured_share_pct, 1) },
					],
				},
				{
					kind: "table",
					title: "Measured vs standard by date and quality",
					columns,
					rows: printRows,
					emptyText: "No pick readings in this range.",
				},
			],
		};
	}, [loading, meta, rows, companyName, branchName]);

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 } }}>
				<Box sx={{ display: "flex", gap: { xs: 1, sm: 2 }, flexWrap: "wrap", alignItems: "flex-start" }}>
					{/* From / To share one row on phones so the bar stays short. */}
					<Box sx={{ display: "flex", gap: { xs: 1, sm: 2 }, width: { xs: "100%", sm: "auto" } }}>
						<TextField
							type="date"
							label="From"
							value={dateFrom}
							onChange={(e) => setDateFrom(e.target.value)}
							size="small"
							slotProps={{ inputLabel: { shrink: true } }}
							sx={{ flex: { xs: 1, sm: "0 0 160px" } }}
						/>
						<TextField
							type="date"
							label="To"
							value={dateTo}
							onChange={(e) => setDateTo(e.target.value)}
							size="small"
							slotProps={{ inputLabel: { shrink: true } }}
							sx={{ flex: { xs: 1, sm: "0 0 160px" } }}
							helperText={`Max ${RANGE_CAP_DAYS} days`}
						/>
					</Box>

					{/* Presets: the last N days ending on the To date. */}
					<Box sx={{ display: "flex", gap: 0.75, alignItems: "center", flexWrap: "wrap", minHeight: 40 }}>
						{PRESET_DAYS.map((days) => (
							<Chip
								key={days}
								label={`${days} days`}
								size="small"
								color={activePreset === days ? "primary" : "default"}
								variant={activePreset === days ? "filled" : "outlined"}
								onClick={() => applyPreset(days)}
							/>
						))}
					</Box>

					<Button
						variant="contained"
						disabled={loading}
						onClick={() => submit(dateFrom, dateTo)}
						sx={{ minHeight: 44, width: { xs: "100%", sm: "auto" }, textTransform: "none" }}
					>
						Submit
					</Button>
					<Box sx={{ display: "flex", alignItems: "center", minHeight: 44 }}>
						<SqcPrintButton getReport={buildReport} disabled={loading || !meta} />
					</Box>
				</Box>
			</Paper>

			{rangeMsg ? <Alert severity="warning">{rangeMsg}</Alert> : null}
			{error ? <Alert severity="error">{error}</Alert> : null}

			{loading ? (
				<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
					<CircularProgress />
				</Box>
			) : null}

			{!loading && totals ? (
				<Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
					<KpiCard
						label="Readings"
						value={String(totals.readings)}
						sub={`${totals.days} day${totals.days === 1 ? "" : "s"} · ${totals.qualities} qualit${totals.qualities === 1 ? "y" : "ies"}`}
					/>
					<KpiCard
						label="Equal to std"
						value={String(totals.equal_to_std)}
						sub={`${totals.readings_with_std} with a standard`}
					/>
					<KpiCard
						label="Measured share"
						value={`${totals.measured_share_pct ?? "—"} %`}
						sub="of readings with a standard"
						state={shareState(totals.measured_share_pct)}
					/>
				</Box>
			) : null}

			{!loading && !error && meta && rows.length === 0 ? (
				<Alert severity="info">No pick readings in this range.</Alert>
			) : null}

			{!loading && rows.length > 0 ? (
				<Box>
					<DataTable
						cols={COVERAGE_COLS}
						gridCols={COVERAGE_GRID_COLS}
						rows={rows}
						getRowId={rowId}
						isPhone={isPhone}
						branchId={branchId}
						rowTone={rowTone}
						rowClass={rowClass}
						maxRows={20}
					/>
					<Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
						Standard: {meta?.std_rule}. Readings without a standard show a blank Measured %. Rows tinted LOW
						have no measured reading (every reading equals the standard); WATCH is under 50 % measured.
					</Typography>
				</Box>
			) : null}
		</Box>
	);
}
