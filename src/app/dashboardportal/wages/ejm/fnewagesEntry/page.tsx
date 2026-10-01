"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Chip, Snackbar } from "@mui/material";
import { GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import IndexWrapper from "@/components/ui/IndexWrapper";
import { BranchScopePicker } from "@/components/reports/BranchScopePicker";
import { useReportBranches } from "@/components/reports/useReportBranches";
import type { FneQualTargetEntryRow } from "./types";

const CREATE_PATH = "/dashboardportal/wages/ejm/fnewagesEntry/createFneQualTarget";

function FneWagesEntry() {
	const router = useRouter();
	// Branch scope comes from the sidebar; the picker only appears when more than
	// one branch is in scope (standing norm in CLAUDE.md).
	const { branches, initialBranchId } = useReportBranches();
	const [branchId, setBranchId] = useState<number | null>(initialBranchId);

	const [rows, setRows] = useState<FneQualTargetEntryRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [totalRows, setTotalRows] = useState(0);
	const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
		pageSize: 10,
		page: 0,
	});
	const [searchQuery, setSearchQuery] = useState("");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (branchId === null && initialBranchId !== null) setBranchId(initialBranchId);
	}, [initialBranchId, branchId]);

	const fetchEntries = useCallback(async () => {
		if (branchId === null) return;
		setLoading(true);
		try {
			const params = new URLSearchParams({
				branch_id: String(branchId),
				page: String((paginationModel.page ?? 0) + 1),
				limit: String(paginationModel.pageSize ?? 10),
			});
			if (searchQuery) params.append("search", searchQuery);

			const { data, error: err } = await fetchWithCookie(
				`${apiRoutesPortalMasters.EJM_FNE_QUAL_TARGET_TABLE}?${params}`,
				"GET"
			);
			if (err || !data) throw new Error(err || "Failed to fetch quality targets");

			setRows(
				(data.data || []).map((r: Record<string, unknown>) => ({
					id: `${r.period_id}-${r.dept_id}`,
					period_id: r.period_id as number,
					start_date: (r.start_date as string) ?? null,
					end_date: (r.end_date as string) ?? null,
					dept_id: r.dept_id as number,
					dept_desc: (r.dept_desc as string) ?? "",
					quality_count: Number(r.quality_count ?? 0),
					approved_count: Number(r.approved_count ?? 0),
				}))
			);
			setTotalRows(data.total || 0);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Error fetching quality targets");
		} finally {
			setLoading(false);
		}
	}, [branchId, paginationModel.page, paginationModel.pageSize, searchQuery]);

	useEffect(() => {
		fetchEntries();
	}, [fetchEntries]);

	const openEntry = useCallback(
		(row?: FneQualTargetEntryRow) => {
			const params = new URLSearchParams();
			if (branchId !== null) params.set("branch_id", String(branchId));
			if (row) {
				params.set("period_id", String(row.period_id));
				params.set("dept_id", String(row.dept_id));
			}
			router.push(`${CREATE_PATH}?${params}`);
		},
		[branchId, router]
	);

	const columns = useMemo<GridColDef<FneQualTargetEntryRow>[]>(
		() => [
			{
				field: "start_date",
				headerName: "Fortnight",
				flex: 1,
				minWidth: 220,
				valueGetter: (_v, row) =>
					row.start_date ? `${row.start_date} → ${row.end_date ?? ""}` : `Period ${row.period_id}`,
			},
			{ field: "dept_desc", headerName: "Department", flex: 1.2, minWidth: 200 },
			{ field: "quality_count", headerName: "Qualities", width: 110, type: "number" },
			{
				field: "approved_count",
				headerName: "Status",
				width: 170,
				renderCell: ({ row }) => {
					const all = row.approved_count === row.quality_count;
					return (
						<Chip
							size="small"
							color={all ? "success" : "default"}
							label={all ? "Approved" : `${row.approved_count}/${row.quality_count} approved`}
						/>
					);
				},
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
				onChange: (e) => {
					setSearchQuery(e.target.value);
					setPaginationModel((prev) => ({ ...prev, page: 0 }));
				},
				placeholder: "Search by department",
				debounceDelayMs: 500,
			}}
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

export default function FneWagesEntryPage() {
	// useReportBranches reads useSearchParams, so it needs a Suspense boundary.
	return (
		<Suspense fallback={null}>
			<FneWagesEntry />
		</Suspense>
	);
}
