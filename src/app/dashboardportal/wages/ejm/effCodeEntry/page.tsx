"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Snackbar } from "@mui/material";
import { GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import IndexWrapper from "@/components/ui/IndexWrapper";
import CreateEffCodePage from "./CreateEffCodePage";
import type { EffCodeRow } from "./types";

export default function EffCodeEntryPage() {
	const [rows, setRows] = useState<EffCodeRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [totalRows, setTotalRows] = useState(0);
	const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
		pageSize: 10,
		page: 0,
	});
	const [searchQuery, setSearchQuery] = useState("");
	const [snackbar, setSnackbar] = useState<{
		open: boolean;
		message: string;
		severity: "success" | "error";
	}>({ open: false, message: "", severity: "success" });

	const [dialogOpen, setDialogOpen] = useState(false);
	const [selectedId, setSelectedId] = useState<number | undefined>(undefined);

	// ponytail: no co_id/branch_id here -- ejm_eff_code_type has no company or
	// branch column, it is a tenant-wide lookup. Add sidebar scoping the day the
	// table gains one.
	const fetchEffCodes = useCallback(async () => {
		setLoading(true);
		try {
			const queryParams = new URLSearchParams({
				page: String((paginationModel.page ?? 0) + 1),
				limit: String(paginationModel.pageSize ?? 10),
			});
			if (searchQuery) queryParams.append("search", searchQuery);

			const { data, error } = await fetchWithCookie(
				`${apiRoutesPortalMasters.EJM_EFF_CODE_TYPE_TABLE}?${queryParams}`,
				"GET"
			);
			if (error || !data) throw new Error(error || "Failed to fetch efficiency codes");

			const mapped: EffCodeRow[] = (data.data || []).map(
				(r: Record<string, unknown>) => ({
					id: r.eff_code_type_id as number,
					eff_code_type_id: r.eff_code_type_id as number,
					effocode: (r.effocode as string) ?? "",
					code_details: (r.code_details as string) ?? "",
					eff_pc: r.eff_pc === null || r.eff_pc === undefined ? null : Number(r.eff_pc),
					eff_prod: (r.eff_prod as EffCodeRow["eff_prod"]) ?? null,
				})
			);

			setRows(mapped);
			setTotalRows(data.total || 0);
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : "Error fetching efficiency codes";
			setSnackbar({ open: true, message, severity: "error" });
		} finally {
			setLoading(false);
		}
	}, [paginationModel.page, paginationModel.pageSize, searchQuery]);

	useEffect(() => {
		fetchEffCodes();
	}, [fetchEffCodes]);

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearchQuery(e.target.value);
		setPaginationModel((prev) => ({ ...prev, page: 0 }));
	};

	const handleSnackbarClose = () => setSnackbar((prev) => ({ ...prev, open: false }));

	const handleCreate = useCallback(() => {
		setSelectedId(undefined);
		setDialogOpen(true);
	}, []);

	const handleEdit = useCallback((row: EffCodeRow) => {
		setSelectedId(row.eff_code_type_id);
		setDialogOpen(true);
	}, []);

	const handleDialogClose = useCallback(() => {
		setDialogOpen(false);
		setSelectedId(undefined);
	}, []);

	const columns = useMemo<GridColDef<EffCodeRow>[]>(
		() => [
			{ field: "effocode", headerName: "Efficiency Code", flex: 1, minWidth: 140 },
			{ field: "code_details", headerName: "Code Details", flex: 2.5, minWidth: 240 },
			{
				field: "eff_pc",
				headerName: "Efficiency %",
				flex: 1,
				minWidth: 130,
				type: "number",
				valueFormatter: (value: number | null) =>
					value === null || value === undefined ? "" : value.toFixed(2),
			},
			{ field: "eff_prod", headerName: "Eff / Prod", flex: 0.7, minWidth: 100 },
		],
		[]
	);

	return (
		<IndexWrapper
			title="Efficiency Code Entry (EJM)"
			rows={rows}
			columns={columns}
			rowCount={totalRows}
			paginationModel={paginationModel}
			onPaginationModelChange={setPaginationModel}
			loading={loading}
			showLoadingUntilLoaded
			search={{
				value: searchQuery,
				onChange: handleSearchChange,
				placeholder: "Search by efficiency code or details",
				debounceDelayMs: 500,
			}}
			createAction={{ label: "Create Efficiency Code", onClick: handleCreate }}
			onEdit={handleEdit}
		>
			<CreateEffCodePage
				open={dialogOpen}
				onClose={handleDialogClose}
				onSaved={fetchEffCodes}
				editId={selectedId}
			/>
			<Snackbar
				open={snackbar.open}
				autoHideDuration={4000}
				onClose={handleSnackbarClose}
				anchorOrigin={{ vertical: "top", horizontal: "center" }}
			>
				<Alert
					severity={snackbar.severity}
					onClose={handleSnackbarClose}
					sx={{ width: "100%" }}
				>
					{snackbar.message}
				</Alert>
			</Snackbar>
		</IndexWrapper>
	);
}
