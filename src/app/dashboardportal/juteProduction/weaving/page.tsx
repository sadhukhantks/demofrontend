"use client";

import * as React from "react";
import {
	Alert,
	Box,
	CircularProgress,
	MenuItem,
	Tab,
	Tabs,
	TextField,
	Typography,
} from "@mui/material";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { useWeavingSetup } from "./hooks/useWeavingSetup";
import LoomQualityMapGrid from "./_components/LoomQualityMapGrid";
import WeavingEntryGrid from "./_components/WeavingEntryGrid";
import WeavingBeamChangeGrid from "./_components/WeavingBeamChangeGrid";
import WeavingAdjustmentGrid from "./_components/WeavingAdjustmentGrid";
import WeavingPlanningGrid from "./_components/WeavingPlanningGrid";
import { todayISO } from "./utils/weavingCalc";

export default function WeavingPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedBranches, selectedCompany } = useSidebarContext();

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
		() =>
			(selectedCompany?.branches ?? []).filter((b) =>
				sidebarBranchIds.includes(Number(b.branch_id))
			),
		[selectedCompany, sidebarBranchIds]
	);
	const selectedBranchName = branchOptions.find(
		(b) => Number(b.branch_id) === branchId
	)?.branch_name;

	const [tab, setTab] = React.useState(0);
	const [tranDate, setTranDate] = React.useState<string>(todayISO());
	const [spell, setSpell] = React.useState<string>("");

	const { setup, loading: setupLoading, error: setupError } = useWeavingSetup(coId, branchId);

	// Default the shared spell selector to the first available spell once setup loads.
	React.useEffect(() => {
		if (setup && setup.spells.length > 0 && !spell) {
			setSpell(setup.spells[0].spell_code);
		}
	}, [setup, spell]);

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

	// Date + Spell apply to every tab: Loom → Quality (0), Production Entry (1),
	// Beam Change (2) and the Planning Grid (3).
	const showSpell = true;
	const showDate = true;

	return (
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Typography variant="h5" sx={{ fontWeight: 600 }}>
				Weaving Production
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Loom → quality mapping, per-loom production entry, beam changes and the server-computed
				planning grid.
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
				<Alert severity="info">Select a branch to load weaving data.</Alert>
			) : (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
					{setupError ? <Alert severity="error">{setupError}</Alert> : null}
					{setupLoading || !setup ? (
						<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
							<CircularProgress />
						</Box>
					) : setup.machines.length === 0 ? (
						<Alert severity="info">
							No weaving looms found for this branch. Tag machines to the Weaving machine type,
							then set their standards (full length, jpc, speed, picks, eff) in Weaving Standards /
							Targets.
						</Alert>
					) : (
						<>
							<Box sx={{ borderBottom: 1, borderColor: "divider" }}>
								<Tabs
									value={tab}
									onChange={(_e, v) => setTab(v as number)}
									variant="scrollable"
									scrollButtons="auto"
								>
									<Tab label="Loom → Quality" />
									<Tab label="Production Entry" />
									<Tab label="Beam Change" />
									<Tab label="Production Adjustment" />
									<Tab label="Planning Grid" />
								</Tabs>
							</Box>

							<Box
								sx={{
									display: "flex",
									alignItems: "center",
									gap: 2,
									flexWrap: "wrap",
								}}
							>
								{showDate ? (
									<TextField
										type="date"
										size="small"
										label="Date"
										value={tranDate}
										onChange={(e) => setTranDate(e.target.value)}
										InputLabelProps={{ shrink: true }}
									/>
								) : null}
								{showSpell ? (
									<TextField
										select
										size="small"
										label="Spell"
										value={spell}
										onChange={(e) => setSpell(e.target.value)}
										sx={{ minWidth: 160 }}
									>
										{setup.spells.map((s) => (
											<MenuItem key={s.spell_code} value={s.spell_code}>
												{s.spell_code} ({Number(s.working_hours)} hrs)
											</MenuItem>
										))}
									</TextField>
								) : null}
							</Box>

							{tab === 0 ? (
								<LoomQualityMapGrid
									coId={coId}
									branchId={branchId}
									setup={setup}
									date={tranDate}
									spell={spell}
								/>
							) : null}

							{tab === 1 ? (
								<WeavingEntryGrid
									coId={coId}
									branchId={branchId}
									setup={setup}
									date={tranDate}
									spell={spell}
								/>
							) : null}

							{tab === 2 ? (
								<WeavingBeamChangeGrid
									coId={coId}
									branchId={branchId}
									date={tranDate}
									spell={spell}
								/>
							) : null}

							{tab === 3 ? (
								<WeavingAdjustmentGrid
									coId={coId}
									branchId={branchId}
									date={tranDate}
									spell={spell}
								/>
							) : null}

							{tab === 4 ? (
								<WeavingPlanningGrid
									coId={coId}
									branchId={branchId}
									date={tranDate}
									spell={spell}
								/>
							) : null}
						</>
					)}
				</Box>
			)}
		</Box>
	);
}
