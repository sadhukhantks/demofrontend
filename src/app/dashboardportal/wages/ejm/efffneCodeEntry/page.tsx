"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Card, CardContent, Snackbar, Typography } from "@mui/material";
import { DataGrid, GridColDef, GridRowModel } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
	ApprovalActionsBar,
	type ApprovalActionPermissions,
	type ApprovalInfo,
	type ApprovalStatusId,
} from "@/components/ui/transaction";
import {
	EDITABLE_STATUSES,
	STATUS_LABELS,
	fneSavePayloadSchema,
	type FneEffCodeRow,
	type FneStatusAction,
	type ForthnightPeriod,
} from "./types";

const formatPeriod = (p: ForthnightPeriod) =>
	`${p.start_date} → ${p.end_date}${p.type_of_period === 1 ? " (1st half)" : " (2nd half)"}`;

/** Only the six actions the backend accepts; permissions follow the status. */
const permissionsFor = (statusId: ApprovalStatusId): ApprovalActionPermissions => {
	switch (statusId) {
		case 21:
			return { canSave: true, canOpen: true, canCancelDraft: true };
		case 1:
			return { canSave: true, canSendForApproval: true };
		case 20:
			return { canApprove: true, canReject: true };
		case 4:
		case 6:
			return { canReopen: true };
		default:
			return {};
	}
};

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

	const editable = EDITABLE_STATUSES.includes(statusId);

	const handleRowUpdate = useCallback((updated: GridRowModel) => {
		const raw = updated.eff_pc;
		const eff_pc = raw === "" || raw === null || raw === undefined ? null : Number(raw);
		const next = { ...updated, eff_pc: Number.isNaN(eff_pc) ? null : eff_pc } as FneEffCodeRow;
		setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)));
		return next;
	}, []);

	const handleSave = useCallback(async () => {
		if (!period) return notify("Select a fortnight period first", "error");
		setBusy(true);
		try {
			const parsed = fneSavePayloadSchema.safeParse({
				forthnig_id: period.forthnight_id,
				lines: rows
					.filter((r) => r.eff_pc !== null)
					.map((r) => ({ eff_code: r.eff_code, eff_pc: r.eff_pc as number })),
			});
			if (!parsed.success) throw new Error(parsed.error.issues[0].message);

			const { error } = await fetchWithCookie(
				apiRoutesPortalMasters.EJM_FNE_EFF_CODE_SAVE,
				"POST",
				parsed.data
			);
			if (error) throw new Error(error);

			notify("Efficiency codes saved");
			await loadRows(period.forthnight_id);
		} catch (err: unknown) {
			notify(err instanceof Error ? err.message : "Save failed", "error");
		} finally {
			setBusy(false);
		}
	}, [period, rows, notify, loadRows]);

	const runAction = useCallback(
		async (action: FneStatusAction) => {
			if (!period) return;
			setBusy(true);
			try {
				const { data, error } = await fetchWithCookie(
					apiRoutesPortalMasters.EJM_FNE_EFF_CODE_STATUS,
					"POST",
					{ forthnig_id: period.forthnight_id, action }
				);
				if (error) throw new Error(error);

				notify((data?.message as string) || "Status updated");
				await loadRows(period.forthnight_id);
			} catch (err: unknown) {
				notify(err instanceof Error ? err.message : "Action failed", "error");
			} finally {
				setBusy(false);
			}
		},
		[period, notify, loadRows]
	);

	const permissions = useMemo(() => permissionsFor(statusId), [statusId]);

	const approvalInfo: ApprovalInfo = useMemo(
		() => ({
			statusId,
			statusLabel: STATUS_LABELS[statusId] ?? "Drafted",
			// Single level: ejm_fne_eff_code_type has no approval_level column.
			approvalLevel: statusId === 20 ? 1 : null,
			maxApprovalLevel: 1,
			isFinalLevel: true,
		}),
		[statusId]
	);

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

			{/* The bar collects a reject reason, but ejm_fne_eff_code_type has nowhere
			    to store it — add a column before persisting it. */}
			<ApprovalActionsBar
				approvalInfo={approvalInfo}
				permissions={permissions}
				menuCode="EJM_FNE_EFF_CODE"
				onSave={permissions.canSave ? handleSave : undefined}
				onOpen={permissions.canOpen ? () => runAction("open") : undefined}
				onCancelDraft={permissions.canCancelDraft ? () => runAction("cancel") : undefined}
				onReopen={permissions.canReopen ? () => runAction("reopen") : undefined}
				onSendForApproval={
					permissions.canSendForApproval ? () => runAction("send-for-approval") : undefined
				}
				onApprove={permissions.canApprove ? () => runAction("approve") : undefined}
				onReject={permissions.canReject ? () => runAction("reject") : undefined}
				loading={busy}
				disabled={loading || !period}
			/>

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
