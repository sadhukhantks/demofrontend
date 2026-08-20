"use client";

import * as React from "react";
import { Alert, Snackbar } from "@mui/material";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import TargetGrid, {
	type DirtyCell,
	type IdType,
	type TargetGridData,
	type ValueRole,
} from "./TargetGrid";

// --- Shared labels ---------------------------------------------------------
// Winding is one-dimensional: id_type is always 'qid' (ref_id = the yarn item),
// value_role is standard | target (no 'actual' — winding has no SQC actual tab),
// and there is exactly one param, 'prod'.

export const ID_TYPE_LABELS: Record<IdType, string> = { qid: "Yarn Quality" };
export const VALUE_ROLE_LABELS: Record<ValueRole, string> = {
	standard: "Standard",
	target: "Target",
};
// The unit IS the spec — a bare "Production" header invites kg/hour or kg/machine
// numbers that silently wreck the Winding Quality Wise report's Target columns.
export const PROD_LABEL = "Target Production (KG per winder per 8-hour shift)";
export const PARAM_LABELS: Record<string, string> = { prod: PROD_LABEL };

const EMPTY_GRID: TargetGridData = { params: [], rows: [] };

type Props = {
	coId: number | string;
	branchId: number | null;
	idType: IdType;
	valueRole: ValueRole;
	effectiveDate: string;
	paramLabels?: Record<string, string>;
	/** Label for the ref column in the grid. Defaults to "Yarn Quality" in TargetGrid. */
	refLabel?: string;
	/** Fired after a successful save so a sibling view (the history list) can refresh. */
	onSaved?: () => void;
};

/**
 * Self-contained inline editor for one (idType, valueRole) at a controlled
 * effective date. Owns the grid fetch (WINDING_TARGET_MAP_GRID), bulk-save
 * (WINDING_TARGET_MAP_BULK_SAVE) and error/snack state, and renders the agnostic
 * TargetGrid. Role / date selectors live in the consuming page.
 *
 * Mirrors weavingTargetMap's editor; winding differs only in being quality-only
 * (no 'mcid') with a single param.
 */
export default function TargetMapEditor({
	coId,
	branchId,
	idType,
	valueRole,
	effectiveDate,
	paramLabels = PARAM_LABELS,
	refLabel,
	onSaved,
}: Props) {
	const [grid, setGrid] = React.useState<TargetGridData>(EMPTY_GRID);
	const [loading, setLoading] = React.useState(false);
	const [saving, setSaving] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

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
		if (branchId != null) params.set("branch_id", String(branchId));
		const { data, error: err } = await fetchWithCookie<{ data: TargetGridData }>(
			`${apiRoutesPortalMasters.WINDING_TARGET_MAP_GRID}?${params.toString()}`,
			"GET"
		);
		if (err) {
			setError(err);
			setGrid(EMPTY_GRID);
		} else {
			setGrid(data?.data ?? EMPTY_GRID);
		}
		setLoading(false);
	}, [coId, idType, valueRole, effectiveDate, branchId]);

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
			}>(apiRoutesPortalMasters.WINDING_TARGET_MAP_BULK_SAVE, "POST", {
				co_id: Number(coId),
				branch_id: branchId != null ? Number(branchId) : null,
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
			onSaved?.();
		} finally {
			setSaving(false);
		}
	};

	return (
		<>
			{error ? (
				<Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
					{error}
				</Alert>
			) : null}

			<TargetGrid
				grid={grid}
				loading={loading}
				saving={saving}
				effectiveDate={effectiveDate}
				paramLabels={paramLabels}
				refLabel={refLabel}
				onSave={(cells) => void handleSave(cells)}
			/>

			<Snackbar
				open={!!snack}
				autoHideDuration={4000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</>
	);
}
