"use client";

import * as React from "react";
import { Alert, Snackbar } from "@mui/material";
import {
	bulkSaveNorms,
	fetchNormsGrid,
	fetchPlanningSetup,
	type NormsBulkSaveEntry,
	type NormsGridResponse,
	type PlanningNormIdType,
	type YarnItemOption,
} from "@/utils/juteProductionPlanningService";
import NormHistoryDialog from "./NormHistoryDialog";
import NormsGrid from "./NormsGrid";

const emptyGrid = (idType: PlanningNormIdType): NormsGridResponse => ({
	id_type: idType,
	params: [],
	rows: [],
});

export type NormsGridEditorProps = {
	coId: number | string;
	branchId: number | null;
	idType: PlanningNormIdType;
	effectiveDate: string;
};

/**
 * Self-contained data layer for one id_type tab: owns the norms_grid fetch,
 * the yarn-item lookup for the warp/weft dropdowns (Cloth Qualities tab —
 * norms_grid itself does not carry the yarn list, so it comes from
 * planning_setup), the bulk-save call, and the per-row history dialog.
 * Mirrors spngTargetMap's TargetMapEditor container/presentational split.
 */
export default function NormsGridEditor({ coId, branchId, idType, effectiveDate }: NormsGridEditorProps) {
	const [grid, setGrid] = React.useState<NormsGridResponse>(() => emptyGrid(idType));
	const [yarnOptions, setYarnOptions] = React.useState<YarnItemOption[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [saving, setSaving] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);
	const [historyTarget, setHistoryTarget] = React.useState<{ refId: number; refLabel: string } | null>(
		null
	);

	const refresh = React.useCallback(async () => {
		if (!coId || !idType || !effectiveDate) {
			setGrid(emptyGrid(idType));
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const data = await fetchNormsGrid({ coId, branchId, onDate: effectiveDate, idType });
			setGrid(data);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load norms grid");
			setGrid(emptyGrid(idType));
		} finally {
			setLoading(false);
		}
	}, [coId, branchId, idType, effectiveDate]);

	// Yarn options only matter for the Cloth Qualities tab (warp/weft yarn
	// dropdowns); norms_grid doesn't return the yarn list, so pull it from
	// planning_setup instead.
	const loadYarnOptions = React.useCallback(async () => {
		if (!coId || idType !== "qid") {
			setYarnOptions([]);
			return;
		}
		try {
			const setup = await fetchPlanningSetup({ coId, branchId, planDate: effectiveDate });
			setYarnOptions(setup.yarn_items ?? []);
		} catch {
			// Non-fatal: dropdowns just render with no options; numeric cells still work.
			setYarnOptions([]);
		}
	}, [coId, branchId, idType, effectiveDate]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	React.useEffect(() => {
		void loadYarnOptions();
	}, [loadYarnOptions]);

	const handleSave = async (entries: NormsBulkSaveEntry[]) => {
		if (!coId || entries.length === 0) return;
		setSaving(true);
		setError(null);
		try {
			const res = await bulkSaveNorms({
				co_id: Number(coId),
				branch_id: branchId != null ? Number(branchId) : null,
				effective_date: effectiveDate,
				entries,
			});
			setSnack(
				res.message ??
					`Saved — ${res.inserted ?? entries.length} value${entries.length === 1 ? "" : "s"} set for ${effectiveDate}.`
			);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to save norms");
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

			<NormsGrid
				idType={idType}
				grid={grid}
				yarnOptions={yarnOptions}
				loading={loading}
				saving={saving}
				effectiveDate={effectiveDate}
				onSave={(entries) => void handleSave(entries)}
				onViewHistory={(refId, refLabel) => setHistoryTarget({ refId, refLabel })}
			/>

			<NormHistoryDialog
				open={!!historyTarget}
				coId={coId}
				idType={idType}
				refId={historyTarget?.refId ?? null}
				refLabel={historyTarget?.refLabel ?? ""}
				onClose={() => setHistoryTarget(null)}
				onChanged={() => void refresh()}
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
