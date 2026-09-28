"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Snackbar } from "@mui/material";
import { GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import IndexWrapper from "@/components/ui/IndexWrapper";
import { BranchScopePicker } from "@/components/reports/BranchScopePicker";
import { useReportBranches } from "@/components/reports/useReportBranches";
import CreatePieceRatePage from "./CreatePieceRatePage";
import type { DesignationOption, PieceRateRow } from "./types";

function PieceRateOccuEntry() {
	// Branch scope comes from the sidebar; the picker only appears when the user
	// actually has more than one branch in scope (standing norm in CLAUDE.md).
	const { branches, initialBranchId } = useReportBranches();
	const [branchId, setBranchId] = useState<number | null>(initialBranchId);

	const [rows, setRows] = useState<PieceRateRow[]>([]);
	const [designations, setDesignations] = useState<DesignationOption[]>([]);
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

	useEffect(() => {
		if (branchId === null && initialBranchId !== null) setBranchId(initialBranchId);
	}, [initialBranchId, branchId]);

	const notify = useCallback(
		(message: string, severity: "success" | "error" = "success") =>
			setSnackbar({ open: true, message, severity }),
		[]
	);

	// ponytail: ejm_piece_occupation_rate itself has no branch column -- the branch
	// only scopes which designations may be picked.
	useEffect(() => {
		if (branchId === null) return;
		(async () => {
			const { data, error } = await fetchWithCookie(
				`${apiRoutesPortalMasters.EJM_PIECE_OCCU_DESIGNATIONS}?branch_id=${branchId}`,
				"GET"
			);
			if (error || !data) {
				notify(error || "Failed to load designations", "error");
				return;
			}
			setDesignations(data.data || []);
		})();
	}, [branchId, notify]);

	const fetchRates = useCallback(async () => {
		setLoading(true);
		try {
			const queryParams = new URLSearchParams({
				page: String((paginationModel.page ?? 0) + 1),
				limit: String(paginationModel.pageSize ?? 10),
			});
			if (searchQuery) queryParams.append("search", searchQuery);

			const { data, error } = await fetchWithCookie(
				`${apiRoutesPortalMasters.EJM_PIECE_OCCU_RATE_TABLE}?${queryParams}`,
				"GET"
			);
			if (error || !data) throw new Error(error || "Failed to fetch piece rates");

			setRows(
				(data.data || []).map((r: Record<string, unknown>) => ({
					id: r.p_occu_id as number,
					p_occu_id: r.p_occu_id as number,
					dept_code: (r.dept_code as string) ?? "",
					occu_code: (r.occu_code as string) ?? "",
					f_b_rate: Number(r.f_b_rate ?? 0),
					dept_id: (r.dept_id as number) ?? null,
					dept_desc: (r.dept_desc as string) ?? "",
					desig_id: (r.desig_id as number) ?? null,
					desig: (r.desig as string) ?? "",
				}))
			);
			setTotalRows(data.total || 0);
		} catch (err: unknown) {
			notify(err instanceof Error ? err.message : "Error fetching piece rates", "error");
		} finally {
			setLoading(false);
		}
	}, [paginationModel.page, paginationModel.pageSize, searchQuery, notify]);

	useEffect(() => {
		fetchRates();
	}, [fetchRates]);

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearchQuery(e.target.value);
		setPaginationModel((prev) => ({ ...prev, page: 0 }));
	};

	const handleCreate = useCallback(() => {
		setSelectedId(undefined);
		setDialogOpen(true);
	}, []);

	const handleEdit = useCallback((row: PieceRateRow) => {
		setSelectedId(row.p_occu_id);
		setDialogOpen(true);
	}, []);

	const handleDialogClose = useCallback(() => {
		setDialogOpen(false);
		setSelectedId(undefined);
	}, []);

	const columns = useMemo<GridColDef<PieceRateRow>[]>(
		() => [
			{ field: "dept_code", headerName: "Dept Code", width: 110 },
			{ field: "dept_desc", headerName: "Department", flex: 1.4, minWidth: 180 },
			{ field: "occu_code", headerName: "Occu Code", width: 110 },
			{ field: "desig", headerName: "Designation", flex: 1.6, minWidth: 200 },
			{
				field: "f_b_rate",
				headerName: "F/B Rate",
				width: 140,
				type: "number",
				valueFormatter: (value: number | null) =>
					value === null || value === undefined ? "" : value.toFixed(6),
			},
		],
		[]
	);

	return (
		<IndexWrapper
			title="Piece Rate / Occupation Entry (EJM)"
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
				placeholder: "Search by department, designation or code",
				debounceDelayMs: 500,
			}}
			createAction={{ label: "Create Piece Rate", onClick: handleCreate }}
			onEdit={handleEdit}
			headerContent={
				<BranchScopePicker branches={branches} value={branchId} onChange={setBranchId} />
			}
		>
			<CreatePieceRatePage
				open={dialogOpen}
				onClose={handleDialogClose}
				onSaved={fetchRates}
				editId={selectedId}
				designations={designations}
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
		</IndexWrapper>
	);
}

export default function PieceRateOccuEntryPage() {
	// useReportBranches reads useSearchParams, so it needs a Suspense boundary.
	return (
		<Suspense fallback={null}>
			<PieceRateOccuEntry />
		</Suspense>
	);
}
