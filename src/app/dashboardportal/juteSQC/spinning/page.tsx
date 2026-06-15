"use client";

import * as React from "react";
import { Alert, Box, CircularProgress, MenuItem, Tab, Tabs, TextField, Typography } from "@mui/material";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { todayISO } from "@/app/dashboardportal/juteProduction/spinning/utils/spinningCalc";
import { useSqcEntrySetup } from "./hooks/useSqcEntrySetup";
import { useSqcEntryByDate } from "./hooks/useSqcEntryByDate";
import { useSqcCountSetup } from "./hooks/useSqcCountSetup";
import { useSqcCountByDate } from "./hooks/useSqcCountByDate";
import SpeedTpiForm from "./_components/SpeedTpiForm";
import SpeedTpiGrid from "./_components/SpeedTpiGrid";
import CountForm from "./_components/CountForm";
import CountGrid from "./_components/CountGrid";

const TABS = ["Speed / TPI Entry", "Count Observations"] as const;

export default function SpinningSqcPage() {
	// HYDRATION RULE: this component reads sidebar context and seeds a date,
	// so defer render until mounted to avoid SSR hydration mismatch.
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedBranches, selectedCompany } = useSidebarContext();
	const [tab, setTab] = React.useState(0);

	// Branch resolution: 1 sidebar branch → auto-use it; several → user must pick one.
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
	const selectedBranchName = branchOptions.find((b) => Number(b.branch_id) === branchId)?.branch_name;

	// Tab 1 — Speed/TPI Entry
	const [entryDate, setEntryDate] = React.useState<string>(todayISO());
	const {
		setup: entrySetup,
		loading: entrySetupLoading,
		error: entrySetupError,
		refresh: refreshEntrySetup,
	} = useSqcEntrySetup(coId, branchId, entryDate);
	const {
		rows: entryRows,
		loading: entryRowsLoading,
		refresh: refreshEntryRows,
	} = useSqcEntryByDate(coId, entryDate, branchId);

	const onEntrySaved = React.useCallback(() => {
		refreshEntrySetup();
		refreshEntryRows();
	}, [refreshEntrySetup, refreshEntryRows]);

	// Tab 2 — Count Observations
	const [countDate, setCountDate] = React.useState<string>(todayISO());
	const {
		setup: countSetup,
		loading: countSetupLoading,
		error: countSetupError,
	} = useSqcCountSetup(coId, countDate, branchId);
	const {
		readings: countReadings,
		averages: countAverages,
		loading: countLoading,
		refresh: refreshCount,
	} = useSqcCountByDate(coId, countDate, branchId);

	const onCountSaved = React.useCallback(() => {
		refreshCount();
	}, [refreshCount]);

	if (!mounted) return null;

	if (!coId) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select a company to continue.
			</Alert>
		);
	}

	if (sidebarBranchIds.length === 0) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select at least one branch in the sidebar to continue.
			</Alert>
		);
	}

	return (
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Typography variant="h5" sx={{ fontWeight: 600 }}>
				Spinning SQC
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Daily yarn speed/TPI entry and count observations.
			</Typography>

			{sidebarBranchIds.length > 1 ? (
				<TextField
					select
					size="small"
					label="Branch"
					value={pageBranchId}
					onChange={(e) => setPageBranchId(e.target.value === "" ? "" : Number(e.target.value))}
					sx={{ mb: 2, minWidth: 240 }}
				>
					{branchOptions.map((b) => (
						<MenuItem key={b.branch_id} value={Number(b.branch_id)}>
							{b.branch_name}
						</MenuItem>
					))}
				</TextField>
			) : selectedBranchName ? (
				<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
					Branch: {selectedBranchName}
				</Typography>
			) : null}

			{branchId == null ? (
				<Alert severity="info">Select a branch to load Spinning SQC data.</Alert>
			) : (
				<>
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

					{/* Tab 1 — Speed / TPI Entry */}
					{tab === 0 ? (
						<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
							<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
								<Typography variant="subtitle2">Entry date</Typography>
								<TextField
									type="date"
									size="small"
									value={entryDate}
									onChange={(e) => setEntryDate(e.target.value)}
									InputLabelProps={{ shrink: true }}
								/>
							</Box>
							{entrySetupError ? <Alert severity="error">{entrySetupError}</Alert> : null}
							{entrySetupLoading || !entrySetup ? (
								<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
									<CircularProgress />
								</Box>
							) : (
								<SpeedTpiForm
									coId={coId}
									branchId={branchId}
									entryDate={entryDate}
									setup={entrySetup}
									onSaved={onEntrySaved}
								/>
							)}
							<Box>
								<Typography variant="subtitle2" sx={{ mb: 1 }}>
									Speed / TPI for {entryDate}
								</Typography>
								<SpeedTpiGrid rows={entryRows} loading={entryRowsLoading} />
							</Box>
						</Box>
					) : null}

					{/* Tab 2 — Count Observations */}
					{tab === 1 ? (
						<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
							<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
								<Typography variant="subtitle2">Observation date</Typography>
								<TextField
									type="date"
									size="small"
									value={countDate}
									onChange={(e) => setCountDate(e.target.value)}
									InputLabelProps={{ shrink: true }}
								/>
							</Box>
							{countSetupError ? <Alert severity="error">{countSetupError}</Alert> : null}
							{countSetupLoading || !countSetup ? (
								<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
									<CircularProgress />
								</Box>
							) : (
								<CountForm
									coId={coId}
									branchId={branchId}
									entryDate={countDate}
									setup={countSetup}
									onSaved={onCountSaved}
								/>
							)}
							<CountGrid
								coId={coId}
								readings={countReadings}
								averages={countAverages}
								loading={countLoading}
								onDeleted={onCountSaved}
							/>
						</Box>
					) : null}
				</>
			)}
		</Box>
	);
}
