"use client";

import * as React from "react";
import { Alert, Box, CircularProgress, MenuItem, Tab, Tabs, TextField, Typography } from "@mui/material";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { todayISO } from "@/app/dashboardportal/juteProduction/spinning/utils/spinningCalc";
import { useWeavingPickSetup } from "./hooks/useWeavingPickSetup";
import { useWeavingPickByDate } from "./hooks/useWeavingPickByDate";
// Shared target-map editor reused across the juteProduction route boundary:
// the "Actual Speed" tab writes actuals into jute_prod_weaving_target_map (the same
// table the weaving planning grid reads, value_role='actual'). The editor reuses
// the existing WEAVING_TARGET_MAP_* endpoints (setup/grid/bulk_save) exactly like
// Weaving Standards / Targets — only the role differs (actual). Weaving is
// QUALITY-ONLY (id_type='qid'); the actual param captured here is 'speed' (loom
// speed, picks/min) per quality. Actual picks (PPI) are now captured per loom on
// the Loom Width & Picks tab (R-08-21).
import TargetMapEditor from "../../juteProduction/masters/weavingTargetMap/_components/TargetMapEditor";
import PickForm from "./_components/PickForm";
import PickGrid from "./_components/PickGrid";

const TABS = ["Loom Width & Picks (R-08-21)", "Actual Speed"] as const;

export default function WeavingSqcPage() {
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

	// Tab 0 — Loom Width & Picks (R-08-21): per-loom actual picks/width observations.
	const [pickDate, setPickDate] = React.useState<string>(todayISO());
	const {
		setup: pickSetup,
		loading: pickSetupLoading,
		error: pickSetupError,
	} = useWeavingPickSetup(coId, pickDate, branchId);
	const {
		readings: pickReadings,
		summary: pickSummary,
		loading: pickLoading,
		refresh: refreshPick,
	} = useWeavingPickByDate(coId, pickDate, branchId);

	const onPickSaved = React.useCallback(() => {
		refreshPick();
	}, [refreshPick]);

	// Tab 1 — Actual Speed (target-map actuals; id_type is fixed 'qid' for weaving).
	const [effectiveDate, setEffectiveDate] = React.useState<string>(todayISO());

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
				Weaving SQC
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Capture per-loom width &amp; actual picks (R-08-21) and the actual loom speed per weaving quality.
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
				<Alert severity="info">Select a branch to load Weaving SQC data.</Alert>
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

					{/* Tab 0 — Loom Width & Picks (R-08-21): per-loom actual picks/width */}
					{tab === 0 ? (
						<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
							<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
								<Typography variant="subtitle2">Effective date</Typography>
								<TextField
									type="date"
									size="small"
									value={pickDate}
									onChange={(e) => setPickDate(e.target.value)}
									InputLabelProps={{ shrink: true }}
								/>
							</Box>
							{pickSetupError ? <Alert severity="error">{pickSetupError}</Alert> : null}
							{pickSetupLoading || !pickSetup ? (
								<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
									<CircularProgress />
								</Box>
							) : (
								<PickForm
									coId={coId}
									branchId={branchId}
									entryDate={pickDate}
									setup={pickSetup}
									onSaved={onPickSaved}
								/>
							)}
							<PickGrid
								readings={pickReadings}
								summary={pickSummary}
								loading={pickLoading}
								onDeleted={onPickSaved}
							/>
						</Box>
					) : null}

					{/* Tab 1 — Actual Speed (writes weaving target-map actuals: speed) */}
					{tab === 1 ? (
						<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
							<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
								<Typography variant="subtitle2">Effective date</Typography>
								<TextField
									type="date"
									size="small"
									value={effectiveDate}
									onChange={(e) => setEffectiveDate(e.target.value)}
									InputLabelProps={{ shrink: true }}
								/>
							</Box>
							<Typography variant="body2" color="text.secondary">
								Enter the actual loom speed (picks/min) per weaving quality and date. Saving here writes
								the actual values into the weaving target map (value_role=&apos;actual&apos;). Actual picks
								(PPI) are now captured per loom on the Loom Width &amp; Picks tab.
							</Typography>
							<Box>
								<Typography variant="subtitle2" sx={{ mb: 1 }}>
									Quality
								</Typography>
								<TargetMapEditor
									coId={coId}
									branchId={branchId}
									idType="qid"
									valueRole="actual"
									effectiveDate={effectiveDate}
									paramLabels={{ speed: "Speed (picks/min)" }}
								/>
							</Box>
						</Box>
					) : null}
				</>
			)}
		</Box>
	);
}
