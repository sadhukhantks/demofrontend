"use client";

import * as React from "react";
import { Alert, Box, MenuItem, Snackbar, TextField, Typography } from "@mui/material";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { todayISO } from "../../spinning/utils/spinningCalc";
import TargetGrid, {
	type DirtyCell,
	type IdType,
	type TargetGridData,
	type ValueRole,
} from "./_components/TargetGrid";

// --- Labels ---------------------------------------------------------------

const ID_TYPE_LABELS: Record<IdType, string> = { mcid: "Machine", qid: "Yarn" };
const VALUE_ROLE_LABELS: Record<ValueRole, string> = {
	standard: "Standard",
	target: "Target",
	actual: "Actual",
};
const PARAM_LABELS: Record<string, string> = {
	speed: "Speed",
	tpi: "TPI",
	eff: "Efficiency",
	spindles: "Spindles",
	dc: "DC",
	tc: "TC",
	bobbin_wt: "Bobbin Wt",
};

const ID_TYPE_OPTIONS: IdType[] = ["mcid", "qid"];
const VALUE_ROLE_OPTIONS: ValueRole[] = ["standard", "target", "actual"];

const EMPTY_GRID: TargetGridData = { params: [], rows: [] };

export default function SpngTargetMapPage() {
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

	// Header bar state.
	const [idType, setIdType] = React.useState<IdType | "">("");
	const [valueRole, setValueRole] = React.useState<ValueRole | "">("");
	const [effectiveDate, setEffectiveDate] = React.useState<string>(todayISO());

	const [grid, setGrid] = React.useState<TargetGridData>(EMPTY_GRID);
	const [loading, setLoading] = React.useState(false);
	const [saving, setSaving] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	const ready = !!coId && !!idType && !!valueRole && !!effectiveDate;

	const refresh = React.useCallback(async () => {
		if (!coId || !idType || !valueRole || !effectiveDate) {
			setGrid(EMPTY_GRID);
			return;
		}
		setLoading(true);
		setError(null);
		const params = new URLSearchParams({
			co_id: String(coId),
			id_type: idType,
			value_role: valueRole,
			effective_date: effectiveDate,
		});
		if (singleBranchId != null) params.set("branch_id", String(singleBranchId));
		const { data, error: err } = await fetchWithCookie<{ data: TargetGridData }>(
			`${apiRoutesPortalMasters.SPNG_TARGET_MAP_GRID}?${params.toString()}`,
			"GET"
		);
		if (err) {
			setError(err);
			setGrid(EMPTY_GRID);
		} else {
			setGrid(data?.data ?? EMPTY_GRID);
		}
		setLoading(false);
	}, [coId, idType, valueRole, effectiveDate, singleBranchId]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	const handleSave = async (cells: DirtyCell[]) => {
		if (!coId || !idType || !valueRole || cells.length === 0) return;
		setSaving(true);
		setError(null);
		try {
			const { data, error: err } = await fetchWithCookie<{
				data: { inserted: number; updated: number; cleared: number };
			}>(apiRoutesPortalMasters.SPNG_TARGET_MAP_BULK_SAVE, "POST", {
				co_id: Number(coId),
				branch_id: singleBranchId != null ? Number(singleBranchId) : null,
				effective_date: effectiveDate,
				id_type: idType,
				value_role: valueRole,
				cells,
			});
			if (err) {
				setError(err);
				return;
			}
			const d = data?.data;
			setSnack(
				`Saved — inserted ${d?.inserted ?? 0}, updated ${d?.updated ?? 0}, cleared ${d?.cleared ?? 0}.`
			);
			await refresh();
		} finally {
			setSaving(false);
		}
	};

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
					Spinning Standards / Targets
				</Typography>
				<Typography variant="body2" color="text.secondary">
					Standard, target and actual values per machine or yarn, effective-dated. Pick a Type,
					Role and Effective Date, then edit values inline and Save.
				</Typography>
			</Box>

			{error ? (
				<Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
					{error}
				</Alert>
			) : null}

			{/* Header bar (always visible) */}
			<Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 3 }}>
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
					select
					label="Role"
					size="small"
					value={valueRole}
					onChange={(e) => setValueRole(e.target.value as ValueRole | "")}
					sx={{ minWidth: 160 }}
				>
					<MenuItem value="">
						<em>Select…</em>
					</MenuItem>
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

			{!ready ? (
				<Alert severity="info">Select Type, Role and Effective Date to load the grid.</Alert>
			) : (
				<TargetGrid
					grid={grid}
					loading={loading}
					saving={saving}
					effectiveDate={effectiveDate}
					paramLabels={PARAM_LABELS}
					onSave={(cells) => void handleSave(cells)}
				/>
			)}

			<Snackbar
				open={!!snack}
				autoHideDuration={4000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</Box>
	);
}
