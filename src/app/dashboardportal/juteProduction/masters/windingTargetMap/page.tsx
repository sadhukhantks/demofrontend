"use client";

import * as React from "react";
import { Alert, Box, MenuItem, Tab, Tabs, TextField, Typography } from "@mui/material";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { todayISO } from "../../spinning/utils/spinningCalc";
import type { ValueRole } from "./_components/TargetGrid";
import TargetMapEditor, { VALUE_ROLE_LABELS } from "./_components/TargetMapEditor";
import TargetMapList from "./_components/TargetMapList";

// --- Header-bar options -----------------------------------------------------
// Winding standards/targets are QUALITY-ONLY: id_type is always 'qid' (ref_id =
// the yarn item), so there is no Type selector at all — weaving/beaming/spinning
// need one because they also carry a machine ('mcid') dimension. Roles are
// standard | target; winding has no 'actual' role. One param: 'prod'.

const ID_TYPE = "qid" as const;
const VALUE_ROLE_OPTIONS: ValueRole[] = ["standard", "target"];

export default function WindingTargetMapPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedCompany, selectedBranches } = useSidebarContext();

	// Only branches the sidebar currently has selected, in company order.
	const branchOptions = React.useMemo(
		() => (selectedCompany?.branches ?? []).filter((b) => selectedBranches.includes(b.branch_id)),
		[selectedCompany, selectedBranches]
	);
	const singleBranchId = branchOptions.length === 1 ? branchOptions[0].branch_id : null;

	// Target is the value the Winding Quality Wise report reads, so it is the default.
	const [valueRole, setValueRole] = React.useState<ValueRole>("target");
	const [effectiveDate, setEffectiveDate] = React.useState<string>(todayISO());
	const [tabIndex, setTabIndex] = React.useState(0);
	// Bumped after a grid bulk-save so the history tab reloads (both tabs stay
	// mounted — switching tabs must not throw away a half-filled grid).
	const [savedTick, setSavedTick] = React.useState(0);

	if (!mounted) return null;

	if (!coId) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select a company to continue.
			</Alert>
		);
	}

	return (
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Box sx={{ mb: 2 }}>
				<Typography variant="h5" sx={{ fontWeight: 600 }}>
					Winding Standards / Targets
				</Typography>
				<Typography variant="body2" color="text.secondary">
					Target production per yarn quality — kilograms per winder per 8-hour shift —
					effective-dated. The Winding Quality Wise report reads the latest value dated on or
					before the report date, so entering a new value adds a row to the quality&apos;s history
					rather than replacing the old one.
				</Typography>
			</Box>

			{/* Header bar (always visible). Drives the entry grid; seeds the history dialog. */}
			<Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2 }}>
				<TextField
					select
					label="Role"
					size="small"
					value={valueRole}
					onChange={(e) => setValueRole(e.target.value as ValueRole)}
					sx={{ minWidth: 160 }}
				>
					{VALUE_ROLE_OPTIONS.map((r) => (
						<MenuItem key={r} value={r}>
							{VALUE_ROLE_LABELS[r]}
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

			<Tabs
				value={tabIndex}
				onChange={(_, v) => setTabIndex(v)}
				sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}
			>
				<Tab label="Entry Grid" sx={{ minHeight: 44 }} />
				<Tab label="History (all dates and roles)" sx={{ minHeight: 44 }} />
			</Tabs>

			<Box hidden={tabIndex !== 0}>
				{!effectiveDate ? (
					<Alert severity="info">Select an effective date to load the grid.</Alert>
				) : (
					<TargetMapEditor
						coId={coId}
						branchId={singleBranchId}
						idType={ID_TYPE}
						valueRole={valueRole}
						effectiveDate={effectiveDate}
						onSaved={() => setSavedTick((n) => n + 1)}
					/>
				)}
			</Box>

			<Box hidden={tabIndex !== 1}>
				<TargetMapList
					coId={coId}
					branchId={singleBranchId}
					valueRole={valueRole}
					effectiveDate={effectiveDate}
					reloadKey={savedTick}
				/>
			</Box>
		</Box>
	);
}
