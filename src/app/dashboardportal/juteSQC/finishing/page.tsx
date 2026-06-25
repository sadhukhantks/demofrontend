"use client";

import * as React from "react";
import { Alert, Box, MenuItem, TextField, Typography } from "@mui/material";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { todayISO } from "@/app/dashboardportal/juteProduction/spinning/utils/spinningCalc";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { IdType } from "@/app/dashboardportal/juteProduction/masters/finishingSpecSheet/_components/TargetGrid";
// The Finishing SQC page captures ACTUAL operating parameters into the SAME
// spec-sheet table the standards/targets live in (value_role='actual'). It reuses
// the finishingSpecSheet TargetMapEditor pointed at the SQC actual endpoints —
// no SQL or grid logic is duplicated (BE: src/juteSQC/finishing_sqc.py).
import TargetMapEditor, {
	ID_TYPE_LABELS,
} from "@/app/dashboardportal/juteProduction/masters/finishingSpecSheet/_components/TargetMapEditor";

const PROCESS_OPTIONS = [
	"damping",
	"calendering",
	"lapping",
	"cutting",
	"hemming",
	"balepress",
] as const;

const PROCESS_LABELS: Record<(typeof PROCESS_OPTIONS)[number], string> = {
	damping: "Damping",
	calendering: "Calendering",
	lapping: "Lapping",
	cutting: "Cutting",
	hemming: "Hemming",
	balepress: "Bale Press",
};

const ID_TYPE_OPTIONS: IdType[] = ["mcid", "qid"];

export default function FinishingSqcPage() {
	// HYDRATION RULE: this component reads sidebar context and seeds a date,
	// so defer render until mounted to avoid SSR hydration mismatch.
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
		() => (selectedCompany?.branches ?? []).filter((b) => sidebarBranchIds.includes(Number(b.branch_id))),
		[selectedCompany, sidebarBranchIds]
	);
	const selectedBranchName = branchOptions.find((b) => Number(b.branch_id) === branchId)?.branch_name;

	// Header bar state — value_role is fixed to 'actual' on this page.
	const [process, setProcess] = React.useState<string>("");
	const [idType, setIdType] = React.useState<IdType | "">("");
	const [effectiveDate, setEffectiveDate] = React.useState<string>(todayISO());

	const ready = !!coId && !!process && !!idType && !!effectiveDate;

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
				Finishing SQC
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Capture the actual finishing operating parameters per process and machine / quality. Saving here
				writes the actual values into the finishing spec sheet (value_role=&apos;actual&apos;); finishing
				production then resolves act_speed and act_eff from these once an actual exists on its transaction
				date.
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
				<Alert severity="info">Select a branch to load Finishing SQC data.</Alert>
			) : (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
					<Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
						<TextField
							select
							label="Process"
							size="small"
							value={process}
							onChange={(e) => setProcess(e.target.value)}
							sx={{ minWidth: 180 }}
						>
							<MenuItem value="">
								<em>Select…</em>
							</MenuItem>
							{PROCESS_OPTIONS.map((p) => (
								<MenuItem key={p} value={p}>
									{PROCESS_LABELS[p]}
								</MenuItem>
							))}
						</TextField>
						<TextField
							select
							label="Type"
							size="small"
							value={idType}
							onChange={(e) => setIdType(e.target.value as IdType | "")}
							sx={{ minWidth: 160 }}
						>
							<MenuItem value="">
								<em>Select…</em>
							</MenuItem>
							{ID_TYPE_OPTIONS.map((t) => (
								<MenuItem key={t} value={t}>
									{ID_TYPE_LABELS[t]}
								</MenuItem>
							))}
						</TextField>
						<TextField
							type="date"
							label="Effective Date"
							size="small"
							value={effectiveDate}
							onChange={(e) => setEffectiveDate(e.target.value)}
							InputLabelProps={{ shrink: true }}
							sx={{ minWidth: 180 }}
						/>
					</Box>

					{!ready ? (
						<Alert severity="info">Select Process, Type and Effective Date to load the actuals grid.</Alert>
					) : (
						<TargetMapEditor
							coId={coId}
							branchId={branchId}
							process={process}
							idType={idType as IdType}
							valueRole="actual"
							effectiveDate={effectiveDate}
							gridUrl={apiRoutesPortalMasters.FINISHING_SQC_ACTUAL_GRID}
							bulkSaveUrl={apiRoutesPortalMasters.FINISHING_SQC_ACTUAL_SAVE}
						/>
					)}
				</Box>
			)}
		</Box>
	);
}
