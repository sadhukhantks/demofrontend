"use client";

import * as React from "react";
import { Alert, Box, Tab, Tabs, TextField, Typography } from "@mui/material";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { todayISO } from "../../spinning/utils/spinningCalc";
import type { PlanningNormIdType } from "@/utils/juteProductionPlanningService";
import NormsGridEditor from "./_components/NormsGridEditor";
import { ID_TYPE_TABS } from "./_components/planningNormsConstants";

/**
 * Planning Norms master (SPEC §2.5 / §4.3): the standard rates consumed by
 * Production Planning — kg/loom, kg/frame, kg/machine, warp/weft split and
 * efficiency — effective-dated per Cloth Quality, Yarn Count or Stage.
 * value_role is fixed to 'standard' in v1 (no role selector). Cloned from the
 * spngTargetMap master's layout and bulk-save interaction, adapted to the
 * norms EAV shape with three id_type tabs instead of a Type/Role picker.
 */
export default function PlanningNormsPage() {
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

	const [tabIndex, setTabIndex] = React.useState(0);
	const [effectiveDate, setEffectiveDate] = React.useState<string>(todayISO());

	const idType: PlanningNormIdType = ID_TYPE_TABS[tabIndex]?.idType ?? "qid";

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
					Production Planning Norms
				</Typography>
				<Typography variant="body2" color="text.secondary">
					Standard rates used by Production Planning — kg/loom, kg/frame, kg/machine, warp/weft
					split and efficiency — effective-dated per Cloth Quality, Yarn Count or Stage.
				</Typography>
			</Box>

			<Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2, mb: 2 }}>
				<Tabs
					value={tabIndex}
					onChange={(_, v) => setTabIndex(v)}
					variant="scrollable"
					scrollButtons="auto"
					allowScrollButtonsMobile
					sx={{ borderBottom: 1, borderColor: "divider", flexGrow: 1, minWidth: 260 }}
				>
					{ID_TYPE_TABS.map((t) => (
						<Tab key={t.idType} label={t.label} sx={{ minHeight: 44 }} />
					))}
				</Tabs>
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

			{!effectiveDate ? (
				<Alert severity="info">Select an effective date to load the grid.</Alert>
			) : (
				<NormsGridEditor
					coId={coId}
					branchId={singleBranchId}
					idType={idType}
					effectiveDate={effectiveDate}
				/>
			)}
		</Box>
	);
}
