"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Snackbar, Typography } from "@mui/material";
import { DataGrid, GridColDef, GridRowModel } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type { ApprovalStatusId } from "@/components/ui/transaction";
import {
	STATUS_LABELS,
	fneSavePayloadSchema,
	isEditableStatus,
	type FneEffCodeRow,
	type ForthnightPeriod,
} from "./types";

const formatPeriod = (p: ForthnightPeriod) =>
	`${p.start_date} → ${p.end_date}${p.type_of_period === 1 ? " (1st half)" : " (2nd half)"}`;

export default function EffFneCodeEntryPage() {
	const [periods, setPeriods] = useState<ForthnightPeriod[]>([]);
	const [period, setPeriod] = useState<ForthnightPeriod | null>(null);
	const [rows, setRows] = useState<FneEffCodeRow[]>([]);
	const [statusId, setStatusId] = useState<ApprovalStatusId>(21);
	const [loading, setLoading] = useState(false);
	const [busy, setBusy] = useState(false);
	const [snackbar, setSnackbar] = useState<{
		open: boolean;
		message: string;
		severity: "success" | "error";
	}>({ open: false, message: "", severity: "success" });

	const notify = useCallback(
		(message: string, severity: "success" | "error" = "success") =>
			setSnackbar({ open: true, message, severity }),
		[]
	);

	// ponytail: no co_id/branch_id -- ejm_fne_eff_code_type and the fortnight
	// master are tenant-wide, with no company or branch column to scope by.
	useEffect(() => {
		(async () => {
			const { data, error } = await fetchWithCookie(
				apiRoutesPortalMasters.FORTHNIGHT_PERIODS,
				"GET"
			);
			if (error || !data) {
				notify(error || "Failed to load fortnight periods", "error");
				return;
			}
			const list: ForthnightPeriod[] = data.data || [];
			setPeriods(list);
			setPeriod((current) => current ?? list[0] ?? null);
		})();
	}, [notify]);

	const loadRows = useCallback(
		async (forthnightId: number) => {
			setLoading(true);
			try {
				const { data, error } = await fetchWithCookie(
					`${apiRoutesPortalMasters.EJM_FNE_EFF_CODE_TABLE}?forthnig_id=${forthnightId}`,
					"GET"
				);
				if (error || !data) throw new Error(error || "Failed to load efficiency codes");

				setRows(
					(data.data || []).map((r: Record<string, unknown>) => ({
						id: r.eff_code_type_id as number,
						eff_code_type_id: r.eff_code_type_id as number,
						eff_code: Number(r.effocode),
						effocode: (r.effocode as string) ?? "",
						code_details: (r.code_details as string) ?? "",
						default_eff_pc:
							r.default_eff_pc === null || r.default_eff_pc === undefined
								? null
								: Number(r.default_eff_pc),
						eff_pc: r.eff_pc === null || r.eff_pc === undefined ? null : Number(r.eff_pc),
					}))
				);
				setStatusId((data.status_id as ApprovalStatusId) ?? 21);
			} catch (err: unknown) {
				notify(err instanceof Error ? err.message : "Error loading rows", "error");
			} finally {
				setLoading(false);
			}
		},
		[notify]
	);

	useEffect(() => {
		if (period) loadRows(period.forthnight_id);
	}, [period, loadRows]);

	const editable = isEditableStatus(statusId);

	const handleRowUpdate = useCallback((updated: GridRowModel) => {
		const raw = updated.eff_pc;
		const eff_pc = raw === "" || raw === null || raw === undefined ? null : Number(raw);
		const next = { ...updated, eff_pc: Number.isNaN(eff_pc) ? null : eff_pc } as FneEffCodeRow;
		setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)));
		return next;
	}, []);

	/** Persists the grid; throws on failure. Blank % lines are not sent. */
	const saveRows = useCallback(
		async (forthnightId: number) => {
			const lines = rows
				.filter((r) => r.eff_pc !== null)
				.map((r) => ({ eff_code: r.eff_code, eff_pc: r.eff_pc as number }));
			const parsed = fneSavePayloadSchema.safeParse({ forthnig_id: forthnightId, lines });
			if (!parsed.success) throw new Error(parsed.error.issues[0].message);

			const { error } = await fetchWithCookie(
				apiRoutesPortalMasters.EJM_FNE_EFF_CODE_SAVE,
				"POST",
				parsed.data
			);
			if (error) throw new Error(error);
		},
		[rows]
	);

	const handleSave = useCallback(async () => {
		if (!period) return notify("Select a fortnight period first", "error");
		setBusy(true);
		try {
			await saveRows(period.forthnight_id);
			notify("Efficiency codes saved");
			await loadRows(period.forthnight_id);
		} catch (err: unknown) {
			notify(err instanceof Error ? err.message : "Save failed", "error");
		} finally {
			setBusy(false);
		}
	}, [period, saveRows, notify, loadRows]);

	/** Saves unsaved grid edits first, then locks the fortnight as Approved. */
	const handleApprove = useCallback(async () => {
		if (!period) return notify("Select a fortnight period first", "error");
		setBusy(true);
		try {
			await saveRows(period.forthnight_id);
			const { data, error } = await fetchWithCookie(
				apiRoutesPortalMasters.EJM_FNE_EFF_CODE_STATUS,
				"POST",
				{ forthnig_id: period.forthnight_id, action: "approve" }
			);
			if (error) throw new Error(error);

			notify((data?.message as string) || "Fortnight approved");
			await loadRows(period.forthnight_id);
		} catch (err: unknown) {
			notify(err instanceof Error ? err.message : "Approve failed", "error");
		} finally {
			setBusy(false);
		}
	}, [period, saveRows, notify, loadRows]);

	const columns = useMemo<GridColDef<FneEffCodeRow>[]>(
		() => [
			{ field: "effocode", headerName: "Efficiency Code", width: 150 },
			{ field: "code_details", headerName: "Code Details", flex: 1, minWidth: 240 },
			{
				field: "default_eff_pc",
				headerName: "Standing %",
				width: 130,
				type: "number",
				valueFormatter: (value: number | null) =>
					value === null || value === undefined ? "" : value.toFixed(2),
			},
			{
				field: "eff_pc",
				headerName: "Fortnight %",
				width: 150,
				type: "number",
				editable,
				valueFormatter: (value: number | null) =>
					value === null || value === undefined ? "" : value.toFixed(2),
			},
		],
		[editable]
	);

	return (
		<Box className="flex flex-col gap-4 p-4">
			<Typography variant="h5">Efficiency Code for Fortnight (EJM)</Typography>

			<Card>
				<CardContent className="flex flex-col gap-3 md:flex-row md:items-center">
					<Box className="w-full md:max-w-sm">
						<SearchableSelect
							variant="outlined"
							label="Fortnight Period"
							options={periods}
							value={period}
							onChange={setPeriod}
							getOptionLabel={formatPeriod}
							isOptionEqualToValue={(o, v) => o.forthnight_id === v.forthnight_id}
							clearable={false}
							disabled={busy}
						/>
					</Box>
					{!editable && (
						<Typography variant="body2" color="text.secondary">
							{STATUS_LABELS[statusId]} — the grid is read-only at this stage.
						</Typography>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardContent>
					<DataGrid
						rows={rows}
						columns={columns}
						loading={loading}
						autoHeight
						disableRowSelectionOnClick
						processRowUpdate={handleRowUpdate}
						onProcessRowUpdateError={(err: unknown) =>
							notify(err instanceof Error ? err.message : "Could not update the row", "error")
						}
						initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
						pageSizeOptions={[25, 50, 100]}
					/>
				</CardContent>
			</Card>

			<Box className="flex flex-wrap items-center gap-3">
				<Chip
					label={STATUS_LABELS[statusId] ?? "Drafted"}
					color={editable ? "default" : "success"}
					size="small"
				/>
				{editable && (
					<>
						<Button variant="contained" onClick={handleSave} disabled={busy || loading || !period}>
							Save
						</Button>
						<Button
							variant="contained"
							color="success"
							onClick={handleApprove}
							disabled={busy || loading || !period}
						>
							Approve
						</Button>
					</>
				)}
			</Box>

			<Snackbar
				open={snackbar.open}
				autoHideDuration={4000}
				onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
				anchorOrigin={{ vertical: "top", horizontal: "center" }}
			>
				<Alert
					severity={snackbar.severity}
					onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
					sx={{ width: "100%" }}
				>
					{snackbar.message}
				</Alert>
			</Snackbar>
		</Box>
	);
}
