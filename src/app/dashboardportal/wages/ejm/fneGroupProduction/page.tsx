"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Snackbar } from "@mui/material";
import { GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import IndexWrapper from "@/components/ui/IndexWrapper";
import { BranchScopePicker } from "@/components/reports/BranchScopePicker";
import { useReportBranches } from "@/components/reports/useReportBranches";
import type { GroupProductionPeriodRow } from "./types";

const CREATE_PATH = "/dashboardportal/wages/ejm/fneGroupProduction/createGroupProduction";

function GroupProductionIndex() {
	const router = useRouter();
	// Branch scope comes from the sidebar; the picker only appears when more than
	// one branch is in scope (standing norm in CLAUDE.md).
	const { branches, initialBranchId } = useReportBranches();
	const [branchId, setBranchId] = useState<number | null>(initialBranchId);

	const [rows, setRows] = useState<GroupProductionPeriodRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [totalRows, setTotalRows] = useState(0);
	const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
		pageSize: 10,
		page: 0,
	});
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (branchId === null && initialBranchId !== null) setBranchId(initialBranchId);
	}, [initialBranchId, branchId]);

	const fetchPeriods = useCallback(async () => {
		if (branchId === null) return;
		setLoading(true);
		try {
			const params = new URLSearchParams({
				branch_id: String(branchId),
				page: String((paginationModel.page ?? 0) + 1),
				limit: String(paginationModel.pageSize ?? 10),
			});
			const { data, error: err } = await fetchWithCookie(
				`${apiRoutesPortalMasters.EJM_FNE_GROUP_PROD_TABLE}?${params}`,
				"GET"
			);
			if (err || !data) throw new Error(err || "Failed to fetch group production");

			setRows(
				(data.data || []).map((r: Record<string, unknown>) => ({
					id: r.period_id as number,
					period_id: r.period_id as number,
					start_date: (r.start_date as string) ?? null,
					end_date: (r.end_date as string) ?? null,
					row_count: Number(r.row_count ?? 0),
					total_production:
						r.total_production === null || r.total_production === undefined
							? null
							: Number(r.total_production),
				}))
			);
			setTotalRows(data.total || 0);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Error fetching group production");
		} finally {
			setLoading(false);
		}
	}, [branchId, paginationModel.page, paginationModel.pageSize]);

	useEffect(() => {
		fetchPeriods();
	}, [fetchPeriods]);

	const openEntry = useCallback(
		(row?: GroupProductionPeriodRow) => {
			const params = new URLSearchParams();
			if (branchId !== null) params.set("branch_id", String(branchId));
			if (row) params.set("period_id", String(row.period_id));
			router.push(`${CREATE_PATH}?${params}`);
		},
		[branchId, router]
	);

	const columns = useMemo<GridColDef<GroupProductionPeriodRow>[]>(
		() => [
			{
				field: "start_date",
				headerName: "Fortnight",
				flex: 1,
				minWidth: 240,
				valueGetter: (_v, row) =>
					row.start_date ? `${row.start_date} → ${row.end_date ?? ""}` : `Period ${row.period_id}`,
			},
			{ field: "row_count", headerName: "Rows", width: 110, type: "number" },
			{
				field: "total_production",
				headerName: "Total Production",
				width: 170,
				type: "number",
				valueFormatter: (value: number | null) =>
					value === null || value === undefined ? "" : value.toFixed(3),
			},
		],
		[]
	);

	return (
		<IndexWrapper
			title="EJM MC Group Production"
			rows={rows}
			columns={columns}
			rowCount={totalRows}
			paginationModel={paginationModel}
			onPaginationModelChange={setPaginationModel}
			loading={loading}
			showLoadingUntilLoaded
			createAction={{ label: "Create", onClick: () => openEntry() }}
			onEdit={openEntry}
			headerContent={
				<BranchScopePicker branches={branches} value={branchId} onChange={setBranchId} />
			}
		>
			<Snackbar
				open={error !== null}
				autoHideDuration={4000}
				onClose={() => setError(null)}
				anchorOrigin={{ vertical: "top", horizontal: "center" }}
			>
				<Alert severity="error" onClose={() => setError(null)} sx={{ width: "100%" }}>
					{error}
				</Alert>
			</Snackbar>
		</IndexWrapper>
	);
}

export default function GroupProductionPage() {
	// useReportBranches reads useSearchParams, so it needs a Suspense boundary.
	return (
		<Suspense fallback={null}>
			<GroupProductionIndex />
		</Suspense>
	);
}
