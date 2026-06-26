"use client";

import * as React from "react";
import { Alert, Box, CircularProgress, MenuItem, Tab, Tabs, TextField, Typography } from "@mui/material";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { todayISO } from "./utils/spreaderCalc";
import { useSqcRollWtSetup } from "./hooks/useSqcRollWtSetup";
import { useSqcRollWtByDate } from "./hooks/useSqcRollWtByDate";
import RollWtForm from "./_components/RollWtForm";
import RollWtGrid from "./_components/RollWtGrid";

// Single tab for now — R-08-03 Roll Sliver Weight is the immediate follow-up
// (same page, second tab) per the R-08-04 build plan.
const TABS = ["R-08-04 Roll Weight"] as const;

export default function SpreaderSqcPage() {
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

	// Tab 0 — R-08-04 Roll Weight: per-machine/quality bench readings by date.
	const [rollWtDate, setRollWtDate] = React.useState<string>(todayISO());
	const {
		setup: rollWtSetup,
		loading: rollWtSetupLoading,
		error: rollWtSetupError,
	} = useSqcRollWtSetup(coId, rollWtDate, branchId);
	const {
		readings: rollWtReadings,
		loading: rollWtLoading,
		refresh: refreshRollWt,
	} = useSqcRollWtByDate(coId, rollWtDate, branchId);

	const onRollWtSaved = React.useCallback(() => {
		refreshRollWt();
	}, [refreshRollWt]);

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
				Spreader SQC
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Capture spreader roll-weight bench readings (R-08-04) per machine and raw-jute quality.
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
				<Alert severity="info">Select a branch to load Spreader SQC data.</Alert>
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

					{/* Tab 0 — R-08-04 Roll Weight */}
					{tab === 0 ? (
						<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
							<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
								<Typography variant="subtitle2">Entry date</Typography>
								<TextField
									type="date"
									size="small"
									value={rollWtDate}
									onChange={(e) => setRollWtDate(e.target.value)}
									InputLabelProps={{ shrink: true }}
								/>
							</Box>
							{rollWtSetupError ? <Alert severity="error">{rollWtSetupError}</Alert> : null}
							{rollWtSetupLoading || !rollWtSetup ? (
								<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
									<CircularProgress />
								</Box>
							) : (
								<RollWtForm
									coId={coId}
									branchId={branchId}
									entryDate={rollWtDate}
									setup={rollWtSetup}
									onSaved={onRollWtSaved}
								/>
							)}
							<RollWtGrid
								coId={coId}
								readings={rollWtReadings}
								machines={rollWtSetup?.machines ?? []}
								loading={rollWtLoading}
								onDeleted={onRollWtSaved}
							/>
						</Box>
					) : null}
				</>
			)}
		</Box>
	);
}
