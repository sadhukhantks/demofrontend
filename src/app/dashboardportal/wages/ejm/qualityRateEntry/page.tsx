"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Snackbar } from "@mui/material";
import { GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import IndexWrapper from "@/components/ui/IndexWrapper";
import { BranchScopePicker } from "@/components/reports/BranchScopePicker";
import { useReportBranches } from "@/components/reports/useReportBranches";
import CreateQualityRatePage from "./CreateQualityRatePage";
import type { DepartmentOption, QualityRateRow, WagesQualityOption } from "./types";

function QualityRateEntry() {
	// Branch scope comes from the sidebar; the picker only appears when the user
	// actually has more than one branch in scope (standing norm in CLAUDE.md).
	const { branches, coId, initialBranchId } = useReportBranches();
	const [branchId, setBranchId] = useState<number | null>(initialBranchId);

	const [rows, setRows] = useState<QualityRateRow[]>([]);
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

	// ponytail: the two pickers are the ones the EJM fortnightly quality-target
	// page already serves — same masters, same scoping, so no new endpoints.
	useEffect(() => {
		if (branchId === null || coId === null) return;
		(async () => {
			const [deptRes, qualRes] = await Promise.all([
				fetchWithCookie(
					`${apiRoutesPortalMasters.EJM_FNE_QUAL_TARGET_DEPARTMENTS}?branch_id=${branchId}`,
					"GET"
				),
				fetchWithCookie(
					`${apiRoutesPortalMasters.EJM_FNE_QUAL_TARGET_QUALITIES}?co_id=${coId}&branch_id=${branchId}`,
					"GET"
				),
			]);
			if (deptRes.error || !deptRes.data) {
				notify(deptRes.error || "Failed to load departments", "error");
			} else {
				setDepartments(deptRes.data.data || []);
			}
			if (qualRes.error || !qualRes.data) {
				notify(qualRes.error || "Failed to load wages qualities", "error");
			} else {
				setQualities(qualRes.data.data || []);
			}
		})();
	}, [branchId, coId, notify]);

	const fetchRates = useCallback(async () => {
		if (branchId === null) return;
		setLoading(true);
		try {
			const queryParams = new URLSearchParams({
				page: String((paginationModel.page ?? 0) + 1),
				limit: String(paginationModel.pageSize ?? 10),
				branch_id: String(branchId),
			});
			if (searchQuery) queryParams.append("search", searchQuery);

			const { data, error } = await fetchWithCookie(
				`${apiRoutesPortalMasters.EJM_WAGES_QUALITY_RATE_TABLE}?${queryParams}`,
				"GET"
			);
			if (error || !data) throw new Error(error || "Failed to fetch quality rates");

			setRows(
				(data.data || []).map((r: Record<string, unknown>) => ({
					id: r.wages_quality_rate_id as number,
					wages_quality_rate_id: r.wages_quality_rate_id as number,
					dept_id: (r.dept_id as number) ?? null,
					dept_desc: (r.dept_desc as string) ?? "",
					quality_id: (r.quality_id as number) ?? null,
					q_code: (r.q_code as string) ?? "",
					quality: (r.quality as string) ?? "",
					quality_rate: r.quality_rate === null ? null : Number(r.quality_rate),
				}))
			);
			setTotalRows(data.total || 0);
		} catch (err: unknown) {
			notify(err instanceof Error ? err.message : "Error fetching quality rates", "error");
		} finally {
			setLoading(false);
		}
	}, [branchId, paginationModel.page, paginationModel.pageSize, searchQuery, notify]);

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

	const handleEdit = useCallback((row: QualityRateRow) => {
		setSelectedId(row.wages_quality_rate_id);
		setDialogOpen(true);
	}, []);

	const handleDialogClose = useCallback(() => {
		setDialogOpen(false);
		setSelectedId(undefined);
	}, []);

	const columns = useMemo<GridColDef<QualityRateRow>[]>(
		() => [
			{ field: "dept_desc", headerName: "Department", flex: 1.4, minWidth: 180 },
			{ field: "q_code", headerName: "Quality Code", width: 130 },
			{ field: "quality", headerName: "Quality", flex: 1.6, minWidth: 200 },
			{
				field: "quality_rate",
				headerName: "Quality Rate",
				width: 150,
				type: "number",
				valueFormatter: (value: number | null) =>
					value === null || value === undefined ? "" : value.toFixed(6),
			},
		],
		[]
	);

	return (
		<IndexWrapper
			title="Quality Rate Entry (EJM)"
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
			createAction={{ label: "Create Quality Rate", onClick: handleCreate }}
			onEdit={handleEdit}
			headerContent={
				<BranchScopePicker branches={branches} value={branchId} onChange={setBranchId} />
			}
		>
			<CreateQualityRatePage
				open={dialogOpen}
				onClose={handleDialogClose}
				onSaved={fetchRates}
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

export default function QualityRateEntryPage() {
	// useReportBranches reads useSearchParams, so it needs a Suspense boundary.
	return (
		<Suspense fallback={null}>
			<QualityRateEntry />
		</Suspense>
	);
}
