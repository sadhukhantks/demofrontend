"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Snackbar } from "@mui/material";
import { GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import IndexWrapper from "@/components/ui/IndexWrapper";
import { BranchScopePicker } from "@/components/reports/BranchScopePicker";
import { useReportBranches } from "@/components/reports/useReportBranches";
import CreateFneQualTargetPage from "./CreateFneQualTargetPage";
import type {
	DepartmentOption,
	FneQualTargetRow,
	WagesQualityOption,
} from "./types";

function FneWagesEntry() {
	// Branch scope comes from the sidebar; the picker only appears when more than
	// one branch is in scope (standing norm in CLAUDE.md).
	const { branches, coId, initialBranchId } = useReportBranches();
	const [branchId, setBranchId] = useState<number | null>(initialBranchId);

	const [rows, setRows] = useState<FneQualTargetRow[]>([]);
	const [departments, setDepartments] = useState<DepartmentOption[]>([]);
	const [qualities, setQualities] = useState<WagesQualityOption[]>([]);
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

	useEffect(() => {
		if (branchId === null) return;
		(async () => {
			const { data, error } = await fetchWithCookie(
				`${apiRoutesPortalMasters.EJM_FNE_QUAL_TARGET_DEPARTMENTS}?branch_id=${branchId}`,
				"GET"
			);
			if (error || !data) {
				notify(error || "Failed to load departments", "error");
				return;
			}
			setDepartments(data.data || []);
		})();
	}, [branchId, notify]);

	useEffect(() => {
		if (branchId === null || coId === null) return;
		(async () => {
			const { data, error } = await fetchWithCookie(
				`${apiRoutesPortalMasters.EJM_FNE_QUAL_TARGET_QUALITIES}?co_id=${coId}&branch_id=${branchId}`,
				"GET"
			);
			if (error || !data) {
				notify(error || "Failed to load wages qualities", "error");
				return;
			}
			setQualities(data.data || []);
		})();
	}, [branchId, coId, notify]);

	const fetchTargets = useCallback(async () => {
		if (branchId === null) return;
		setLoading(true);
		try {
			const queryParams = new URLSearchParams({
				branch_id: String(branchId),
				page: String((paginationModel.page ?? 0) + 1),
				limit: String(paginationModel.pageSize ?? 10),
			});
			if (searchQuery) queryParams.append("search", searchQuery);

			const { data, error } = await fetchWithCookie(
				`${apiRoutesPortalMasters.EJM_FNE_QUAL_TARGET_TABLE}?${queryParams}`,
				"GET"
			);
			if (error || !data) throw new Error(error || "Failed to fetch quality targets");

			setRows(
				(data.data || []).map((r: Record<string, unknown>) => ({
					id: r.fne_qual_traget_id as number,
					fne_qual_traget_id: r.fne_qual_traget_id as number,
					dept_id: (r.dept_id as number) ?? null,
					dept_desc: (r.dept_desc as string) ?? "",
					quality_it: (r.quality_it as number) ?? null,
					q_code: (r.q_code as string) ?? "",
					quality: (r.quality as string) ?? "",
					eff_pc: r.eff_pc === null || r.eff_pc === undefined ? null : Number(r.eff_pc),
				}))
			);
			setTotalRows(data.total || 0);
		} catch (err: unknown) {
			notify(err instanceof Error ? err.message : "Error fetching quality targets", "error");
		} finally {
			setLoading(false);
		}
	}, [branchId, paginationModel.page, paginationModel.pageSize, searchQuery, notify]);

	useEffect(() => {
		fetchTargets();
	}, [fetchTargets]);

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearchQuery(e.target.value);
		setPaginationModel((prev) => ({ ...prev, page: 0 }));
	};

	const handleCreate = useCallback(() => {
		setSelectedId(undefined);
		setDialogOpen(true);
	}, []);

	const handleEdit = useCallback((row: FneQualTargetRow) => {
		setSelectedId(row.fne_qual_traget_id);
		setDialogOpen(true);
	}, []);

	const handleDialogClose = useCallback(() => {
		setDialogOpen(false);
		setSelectedId(undefined);
	}, []);

	const columns = useMemo<GridColDef<FneQualTargetRow>[]>(
		() => [
			{ field: "dept_desc", headerName: "Department", flex: 1.4, minWidth: 180 },
			{ field: "q_code", headerName: "Quality Code", width: 140 },
			{ field: "quality", headerName: "Wages Quality", flex: 1.6, minWidth: 220 },
			{
				field: "eff_pc",
				headerName: "Target Eff %",
				width: 150,
				type: "number",
				valueFormatter: (value: number | null) =>
					value === null || value === undefined ? "" : value.toFixed(2),
			},
		],
		[]
	);

	return (
		<IndexWrapper
			title="Fortnightly Wages Quality Target (EJM)"
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
				placeholder: "Search by department or quality",
				debounceDelayMs: 500,
			}}
			createAction={{ label: "Create Quality Target", onClick: handleCreate }}
			onEdit={handleEdit}
			headerContent={
				<BranchScopePicker branches={branches} value={branchId} onChange={setBranchId} />
			}
		>
			<CreateFneQualTargetPage
				open={dialogOpen}
				onClose={handleDialogClose}
				onSaved={fetchTargets}
				editId={selectedId}
				departments={departments}
				qualities={qualities}
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

export default function FneWagesEntryPage() {
	// useReportBranches reads useSearchParams, so it needs a Suspense boundary.
	return (
		<Suspense fallback={null}>
			<FneWagesEntry />
		</Suspense>
	);
}
