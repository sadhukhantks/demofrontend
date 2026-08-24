"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Card,
	CardContent,
	Stack,
	Tab,
	Tabs,
	TextField,
	Typography,
} from "@mui/material";
import { SearchableMultiSelect } from "@/components/ui/SearchableSelect";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { todayISO } from "../spreader/utils/shift";
import { useRollStock } from "../spreader/hooks/useRollStock";
import RollStockTable from "../spreader/_components/RollStockTable";
import { useMaturityReport, useProductionSummary } from "./hooks/useReports";
import MaturityReportTable from "./_components/MaturityReportTable";
import PivotTable from "./_components/PivotTable";

const TABS = ["Maturity Time", "Spreader Production", "Stock As At"] as const;
const SHIFTS = ["A1", "B1", "A2", "B2", "C"] as const;
const SHIFT_OPTIONS: string[] = [...SHIFTS];
// Spell end boundaries (see spreader/utils/shift.ts buckets: A1 06-10, B1 11-13, A2 14-16, B2 17-21, C 22-05).
// Selecting a spell = "stock at end of that spell"; C ends 06:00 the NEXT day.
const SPELL_END: Record<string, { hour: number; nextDay?: boolean }> = {
	A1: { hour: 11 },
	B1: { hour: 14 },
	A2: { hour: 17 },
	B2: { hour: 22 },
	C: { hour: 6, nextDay: true },
};

export default function RollStockReportsPage() {
	const { coId } = useSelectedCompanyCoId();
	const [tab, setTab] = React.useState(0);

	// Tab 1
	const [issueDate, setIssueDate] = React.useState<string>(todayISO());
	const maturity = useMaturityReport(coId, issueDate);

	// Tab 2
	const [reportDate, setReportDate] = React.useState<string>(todayISO());
	const [selSpreaders, setSelSpreaders] = React.useState<number[]>([]);
	const [selItems, setSelItems] = React.useState<number[]>([]);
	const [selShifts, setSelShifts] = React.useState<string[]>([]);
	const summary = useProductionSummary(coId, reportDate, selSpreaders, selItems, selShifts);

	// Tab 3 — branch resolution: 1 sidebar branch → auto-use it; several → user must pick one.
	const { selectedBranches, selectedCompany } = useSidebarContext();
	const sidebarBranchIds = React.useMemo(() => selectedBranches.map(Number), [selectedBranches]);
	const [pageBranchId, setPageBranchId] = React.useState<number | "">("");
	React.useEffect(() => {
		if (sidebarBranchIds.length === 1) {
			setPageBranchId(sidebarBranchIds[0]);
		} else if (sidebarBranchIds.length === 0) {
			setPageBranchId("");
		} else {
			setPageBranchId((prev) =>
				prev !== "" && sidebarBranchIds.includes(prev as number) ? prev : ""
			);
		}
	}, [sidebarBranchIds]);
	const branchId = pageBranchId === "" ? null : (pageBranchId as number);
	const branchOptions = React.useMemo(
		() => (selectedCompany?.branches ?? []).filter((b) => sidebarBranchIds.includes(Number(b.branch_id))),
		[selectedCompany, sidebarBranchIds]
	);
	const [asOfDate, setAsOfDate] = React.useState<string>("");
	const [asOfHour, setAsOfHour] = React.useState<number>(0);
	const [spell, setSpell] = React.useState<string>("");
	// hour-precision cutoff — minutes deliberately not exposed
	const asOfDt = asOfDate ? `${asOfDate}T${String(asOfHour).padStart(2, "0")}:00` : "";
	const applySpell = (sp: string) => {
		setSpell(sp);
		if (!sp || !asOfDate) return;
		const end = SPELL_END[sp];
		if (end.nextDay) {
			const d = new Date(`${asOfDate}T00:00`);
			d.setDate(d.getDate() + 1);
			setAsOfDate(
				`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
			);
		}
		setAsOfHour(end.hour);
	};
	const stockAsAt = useRollStock(tab === 2 ? coId : null, branchId, asOfDt);

	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
		// local "now" (date + current hour) — set after mount so SSR/CSR markup match
		setAsOfDate(todayISO());
		setAsOfHour(new Date().getHours());
	}, []);

	const availableSpreaders = React.useMemo(() => {
		if (!summary.data) return [] as Array<{ id: number; name: string }>;
		const map = new Map<number, string>();
		for (const r of summary.data.rows) map.set(r.machine_id, r.machine_name);
		return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
	}, [summary.data]);

	const availableItems = React.useMemo(() => {
		if (!summary.data) return [] as Array<{ id: number; name: string }>;
		const map = new Map<number, string>();
		for (const r of summary.data.rows) {
			map.set(r.item_id, r.item_name);
			if (r.item_id_2 != null && r.item_name_2) map.set(r.item_id_2, r.item_name_2);
		}
		return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
	}, [summary.data]);

	if (!mounted) {
		return null;
	}

	if (!coId) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select a company to continue.
			</Alert>
		);
	}

	return (
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Typography variant="h5" sx={{ fontWeight: 600 }}>
				Roll Stock Reports
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Maturity time by issue, spreader production summary, and roll stock as at any date &amp; time.
			</Typography>

			<Tabs
				value={tab}
				onChange={(_, v) => setTab(v)}
				variant="scrollable"
				scrollButtons="auto"
				allowScrollButtonsMobile
				sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}
			>
				{TABS.map((label) => (
					<Tab key={label} label={label} sx={{ minHeight: 44 }} />
				))}
			</Tabs>

			{tab === 0 ? (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
					<TextField
						type="date"
						size="small"
						label="Issue Date"
						value={issueDate}
						onChange={(e) => setIssueDate(e.target.value)}
						InputLabelProps={{ shrink: true }}
						sx={{ maxWidth: 220 }}
					/>
					<MaturityReportTable
						rows={maturity.rows}
						loading={maturity.loading}
						error={maturity.error}
					/>
				</Box>
			) : null}

			{tab === 1 ? (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
					<Box
						sx={{
							display: "grid",
							gap: 2,
							gridTemplateColumns: {
								xs: "1fr",
								sm: "repeat(2, minmax(0, 1fr))",
								md: "repeat(4, minmax(0, 1fr))",
							},
						}}
					>
						<TextField
							type="date"
							size="small"
							label="Production Date"
							value={reportDate}
							onChange={(e) => setReportDate(e.target.value)}
							InputLabelProps={{ shrink: true }}
						/>
						<SearchableMultiSelect
							variant="outlined"
							size="small"
							label="Spreaders"
							options={availableSpreaders}
							value={availableSpreaders.filter((s) => selSpreaders.includes(s.id))}
							onChange={(picked) => setSelSpreaders(picked.map((s) => s.id))}
							getOptionLabel={(s) => s.name}
							getOptionKey={(s) => s.id}
							isOptionEqualToValue={(s, selected) => s.id === selected.id}
						/>
						<SearchableMultiSelect
							variant="outlined"
							size="small"
							label="Items"
							options={availableItems}
							value={availableItems.filter((i) => selItems.includes(i.id))}
							onChange={(picked) => setSelItems(picked.map((i) => i.id))}
							getOptionLabel={(i) => i.name}
							getOptionKey={(i) => i.id}
							isOptionEqualToValue={(i, selected) => i.id === selected.id}
						/>
						<SearchableMultiSelect<string>
							variant="outlined"
							size="small"
							label="Shifts"
							options={SHIFT_OPTIONS}
							value={selShifts}
							onChange={(picked) => setSelShifts(picked)}
							getOptionLabel={(shift) => shift}
						/>
					</Box>

					{summary.error ? <Alert severity="error">{summary.error}</Alert> : null}

					{summary.data ? (
						<>
							<Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
								<Card variant="outlined" sx={{ minWidth: 160 }}>
									<CardContent>
										<Typography variant="caption" color="text.secondary">
											Total Rolls
										</Typography>
										<Typography variant="h6">{summary.data.totals.rolls}</Typography>
									</CardContent>
								</Card>
								<Card variant="outlined" sx={{ minWidth: 160 }}>
									<CardContent>
										<Typography variant="caption" color="text.secondary">
											Weight (MT)
										</Typography>
										<Typography variant="h6">{summary.data.totals.weight_mt.toFixed(3)}</Typography>
									</CardContent>
								</Card>
								<Card variant="outlined" sx={{ minWidth: 160 }}>
									<CardContent>
										<Typography variant="caption" color="text.secondary">
											Spreaders
										</Typography>
										<Typography variant="h6">{summary.data.totals.unique_spreaders}</Typography>
									</CardContent>
								</Card>
								<Card variant="outlined" sx={{ minWidth: 160 }}>
									<CardContent>
										<Typography variant="caption" color="text.secondary">
											Qualities
										</Typography>
										<Typography variant="h6">{summary.data.totals.unique_items}</Typography>
									</CardContent>
								</Card>
							</Stack>
							<PivotTable
								title="Spreader-wise Production (Rolls)"
								entityHeader="Spreader"
								rows={summary.data.spreader_pivot}
							/>
							<PivotTable
								title="Quality-wise Production (Rolls)"
								entityHeader="Quality"
								rows={summary.data.quality_pivot}
							/>
						</>
					) : null}
				</Box>
			) : null}

			{tab === 2 ? (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
					<Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
						{branchOptions.length > 1 ? (
							<TextField
								select
								size="small"
								label="Branch"
								value={pageBranchId}
								onChange={(e) => setPageBranchId(e.target.value === "" ? "" : Number(e.target.value))}
								sx={{ minWidth: 240 }}
							>
								{branchOptions.map((b) => (
									<MenuItem key={b.branch_id} value={Number(b.branch_id)}>
										{b.branch_name}
									</MenuItem>
								))}
							</TextField>
						) : null}
						<TextField
							type="date"
							size="small"
							label="As At Date"
							value={asOfDate}
							onChange={(e) => {
								setAsOfDate(e.target.value);
								setSpell("");
							}}
							InputLabelProps={{ shrink: true }}
							sx={{ minWidth: 170 }}
						/>
						<TextField
							select
							size="small"
							label="Spell"
							value={spell}
							onChange={(e) => applySpell(e.target.value)}
							helperText={spell ? "End of spell" + (spell === "C" ? " (next day)" : "") : undefined}
							sx={{ minWidth: 120 }}
						>
							<MenuItem value="">Manual</MenuItem>
							{SHIFTS.map((s) => (
								<MenuItem key={s} value={s}>
									{s}
								</MenuItem>
							))}
						</TextField>
						<TextField
							select
							size="small"
							label="Hour"
							value={asOfHour}
							onChange={(e) => {
								setAsOfHour(Number(e.target.value));
								setSpell("");
							}}
							sx={{ minWidth: 110 }}
						>
							{Array.from({ length: 24 }, (_, h) => (
								<MenuItem key={h} value={h}>
									{String(h).padStart(2, "0")}:00
								</MenuItem>
							))}
						</TextField>
					</Stack>

					{sidebarBranchIds.length === 0 ? (
						<Alert severity="warning">Select at least one branch in the sidebar to continue.</Alert>
					) : branchId == null ? (
						<Alert severity="info">Select a branch to load spreader data.</Alert>
					) : (
						<>
							{stockAsAt.error ? <Alert severity="error">{stockAsAt.error}</Alert> : null}
							<RollStockTable
								rows={stockAsAt.rows}
								summary={stockAsAt.summary}
								loading={stockAsAt.loading}
								summaryFirst
								detailTitle={`Bin-wise Stock as at ${asOfDt ? new Date(asOfDt).toLocaleString() : "-"}`}
							/>
						</>
					)}
				</Box>
			) : null}
		</Box>
	);
}
