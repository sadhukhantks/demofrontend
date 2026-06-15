"use client";

import * as React from "react";
import { Alert, Box, Button, Snackbar, Typography } from "@mui/material";
import { Save as SaveIcon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { PlanningGridRow, ShiftRollupRow } from "../types/spinningTypes";
import { usePlanningGrid } from "../hooks/usePlanningGrid";

type Props = {
	coId: string;
	branchId: number;
	date: string;
	spell: string;
};

// Stable composite row id: a frame can appear per spell + quality + param.
function planningRowId(r: PlanningGridRow): string {
	return `${r.machine_id}:${r.spell_id}:${r.yarn_quality_id}:${r.param_id}`;
}

function rollupRowId(r: ShiftRollupRow): string {
	return `${r.machine_id}:${r.yarn_quality_id}:${r.shift}`;
}

const num = { type: "number" as const, width: 90 };

export default function PlanningGrid({ coId, branchId, date, spell }: Props) {
	const { data, loading, error, refresh } = usePlanningGrid(coId, branchId, date, spell);
	const [saving, setSaving] = React.useState(false);
	const [snack, setSnack] = React.useState<string | null>(null);

	const rows = data?.rows ?? [];
	const rollup = data?.shift_rollup ?? [];

	// All numeric columns are computed server-side -> read-only display.
	const columns = React.useMemo<GridColDef<PlanningGridRow>[]>(
		() => [
			{ field: "mech_code", headerName: "Frame", width: 100 },
			{ field: "spell_code", headerName: "Spell", width: 80 },
			{ field: "quality_code", headerName: "Quality", width: 110 },
			{ field: "spindles", headerName: "Spindles", ...num },
			{ field: "minutes", headerName: "Minutes", ...num },
			{ field: "act_count", headerName: "Act Cnt", ...num },
			{ field: "std_count", headerName: "Std Cnt", ...num },
			{ field: "std_speed", headerName: "Std Spd", ...num },
			{ field: "actual_speed", headerName: "Act Spd", ...num },
			{ field: "target_speed", headerName: "Tgt Spd", ...num },
			{ field: "std_tpi", headerName: "Std TPI", ...num },
			{ field: "actual_tpi", headerName: "Act TPI", ...num },
			{ field: "target_tpi", headerName: "Tgt TPI", ...num },
			{ field: "std_eff", headerName: "Std Eff", ...num },
			{ field: "target_eff", headerName: "Tgt Eff", ...num },
			{ field: "p100prod", headerName: "P100 Prod", width: 100, type: "number" },
			{ field: "std_prod", headerName: "Std Prod", width: 100, type: "number" },
			{ field: "target_prod", headerName: "Tgt Prod", width: 100, type: "number" },
			{ field: "act_prod_doff", headerName: "Act Prod (Doff)", width: 130, type: "number" },
			{ field: "winding_total", headerName: "Wind Total", width: 110, type: "number" },
			{ field: "act_prod_wind", headerName: "Act Prod (Wind)", width: 130, type: "number" },
			{ field: "eff_doff", headerName: "Eff Doff %", width: 110, type: "number" },
			{ field: "eff_winding", headerName: "Eff Wind %", width: 110, type: "number" },
		],
		[]
	);

	const rollupColumns = React.useMemo<GridColDef<ShiftRollupRow>[]>(
		() => [
			{ field: "machine_id", headerName: "Machine", width: 100, type: "number" },
			{ field: "yarn_quality_id", headerName: "Quality", width: 100, type: "number" },
			{ field: "shift", headerName: "Shift", width: 80 },
			{ field: "prod_doff", headerName: "Prod (Doff)", width: 120, type: "number" },
			{ field: "prod_wind", headerName: "Prod (Wind)", width: 120, type: "number" },
			{ field: "doff_eff", headerName: "Doff Eff %", width: 110, type: "number" },
			{ field: "wind_eff", headerName: "Wind Eff %", width: 110, type: "number" },
		],
		[]
	);

	const handleSave = async () => {
		setSaving(true);
		try {
			const body = {
				co_id: Number(coId),
				branch_id: Number(branchId),
				tran_date: date,
				rows,
			};
			const { error: err } = await fetchWithCookie(
				apiRoutesPortalMasters.SPINNING_PLANNING_GRID_SAVE,
				"POST",
				body
			);
			if (err) {
				setSnack(err);
				return;
			}
			setSnack(`Saved ${rows.length} planning row(s).`);
			refresh();
		} catch (e) {
			setSnack(e instanceof Error ? e.message : "Failed to save planning grid.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
				<Typography variant="subtitle2">Planning grid (per frame / spell)</Typography>
				<Button
					variant="contained"
					size="small"
					startIcon={<SaveIcon size={16} />}
					onClick={handleSave}
					disabled={saving || loading || rows.length === 0}
				>
					{saving ? "Saving…" : "Save"}
				</Button>
				<Typography variant="caption" color="text.secondary">
					All values are computed server-side and shown read-only.
				</Typography>
			</Box>

			{error ? <Alert severity="error">{error}</Alert> : null}

			<Box sx={{ width: "100%", overflowX: "auto" }}>
				<DataGrid
					autoHeight
					rows={rows}
					getRowId={planningRowId}
					columns={columns}
					loading={loading}
					disableRowSelectionOnClick
					density="compact"
					pageSizeOptions={[10, 25, 50, 100]}
					initialState={{
						pagination: { paginationModel: { pageSize: 25, page: 0 } },
					}}
					sx={{ minWidth: 2200 }}
				/>
			</Box>

			<Box>
				<Typography variant="subtitle2" sx={{ mb: 1 }}>
					Shift rollup (machine / quality / shift)
				</Typography>
				<Box sx={{ width: "100%", overflowX: "auto" }}>
					<DataGrid
						autoHeight
						rows={rollup}
						getRowId={rollupRowId}
						columns={rollupColumns}
						loading={loading}
						disableRowSelectionOnClick
						density="compact"
						pageSizeOptions={[10, 25, 50]}
						initialState={{
							pagination: { paginationModel: { pageSize: 25, page: 0 } },
						}}
						sx={{ minWidth: 760 }}
					/>
				</Box>
			</Box>

			<Snackbar
				open={!!snack}
				autoHideDuration={3000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</Box>
	);
}
