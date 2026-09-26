"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Chip, CircularProgress, TextField, Typography } from "@mui/material";
import type { GridColDef, GridPaginationModel, GridRenderCellParams } from "@mui/x-data-grid";
import IndexWrapper from "@/components/ui/IndexWrapper";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useReportBranches } from "@/components/reports/useReportBranches";
import type { BranchOption } from "@/components/reports/types";
import { fetchYarnIssueList, type YarnIssueListRow, type YarnIssueType } from "@/utils/yarnIssueService";
import {
	YARN_ISSUE_LIST_PATH,
	YARN_ISSUE_STATUS_FILTER_OPTIONS,
	YARN_ISSUE_TYPES,
	getIssueTypeChipColor,
	getIssueTypeLabel,
	getStatusChipColor,
	getStatusLabel,
	isEditableStatus,
} from "./utils/yarnIssueConstants";
import { currentMonthRange, formatDisplayDate, formatNumber } from "./utils/yarnIssueFormat";

/**
 * @component YarnIssueIndexPage
 * @description List of Yarn Issues / Returns (purchased yarn moving between the
 * godown and a department floor, kg) for the sidebar company + one branch in
 * scope, filtered by date range (default: current month), status and type. Rows
 * open the edit page, which is view-only unless the document is Draft/Open and the
 * user may save.
 */

type YarnIssueGridRow = YarnIssueListRow & { id: number };

/** `null` value is the "All statuses" sentinel. */
type StatusFilterOption = { value: number | null; label: string };
/** `null` value is the "All types" sentinel. */
type TypeFilterOption = { value: YarnIssueType | null; label: string };

const STATUS_FILTER_OPTIONS: ReadonlyArray<StatusFilterOption> = [
	{ value: null, label: "All statuses" },
	...YARN_ISSUE_STATUS_FILTER_OPTIONS,
];

const TYPE_FILTER_OPTIONS: ReadonlyArray<TypeFilterOption> = [
	{ value: null, label: "All types" },
	{ value: YARN_ISSUE_TYPES.ISSUE, label: "Issue" },
	{ value: YARN_ISSUE_TYPES.RETURN, label: "Return" },
];

const pickBranch = (prev: number | null, branches: ReadonlyArray<BranchOption>, preferred: number | null): number | null => {
	if (branches.length === 0) return null;
	if (prev != null && branches.some((branch) => branch.branch_id === prev)) return prev;
	if (preferred != null && branches.some((branch) => branch.branch_id === preferred)) return preferred;
	return branches[0].branch_id;
};

function YarnIssueIndexPageContent() {
	const router = useRouter();
	// Sidebar scope: selected branches only (all company branches when none selected).
	const { branches, coId, initialBranchId } = useReportBranches();

	const [branchId, setBranchId] = React.useState<number | null>(null);
	const [fromDate, setFromDate] = React.useState("");
	const [toDate, setToDate] = React.useState("");
	const [statusFilter, setStatusFilter] = React.useState<number | null>(null);
	const [typeFilter, setTypeFilter] = React.useState<YarnIssueType | null>(null);
	const [rows, setRows] = React.useState<YarnIssueGridRow[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
	const [paginationModel, setPaginationModel] = React.useState<GridPaginationModel>({ page: 0, pageSize: 10 });

	// Default range = current month. Set after mount so server and first client
	// render agree (the dates depend on the clock).
	React.useEffect(() => {
		const range = currentMonthRange();
		setFromDate(range.from);
		setToDate(range.to);
	}, []);

	React.useEffect(() => {
		setBranchId((prev) => pickBranch(prev, branches, initialBranchId));
	}, [branches, initialBranchId]);

	const selectedBranch = React.useMemo(
		() => branches.find((branch) => branch.branch_id === branchId) ?? null,
		[branches, branchId],
	);

	const loadRows = React.useCallback(async () => {
		if (coId == null || branchId == null || !fromDate || !toDate) return;
		setLoading(true);
		setErrorMessage(null);
		try {
			const data = await fetchYarnIssueList({ coId, branchId, fromDate, toDate, statusId: statusFilter, issueType: typeFilter });
			setRows(data.map((row) => ({ ...row, id: row.yarn_issue_id })));
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : "Failed to load yarn issues");
			setRows([]);
		} finally {
			setLoading(false);
		}
	}, [coId, branchId, fromDate, toDate, statusFilter, typeFilter]);

	React.useEffect(() => {
		void loadRows();
	}, [loadRows]);

	// The list endpoint returns the whole range; page it client-side.
	const pagedRows = React.useMemo(() => {
		const start = paginationModel.page * paginationModel.pageSize;
		return rows.slice(start, start + paginationModel.pageSize);
	}, [rows, paginationModel]);

	const resetPage = React.useCallback(() => setPaginationModel((prev) => ({ ...prev, page: 0 })), []);

	const columns = React.useMemo<GridColDef<YarnIssueGridRow>[]>(
		() => [
			{
				field: "issue_no",
				headerName: "Issue No",
				flex: 1,
				minWidth: 150,
				renderCell: (params: GridRenderCellParams<YarnIssueGridRow, string | null>) => (
					<Typography component="span" variant="body2" color="primary" sx={{ fontWeight: 600 }}>
						{params.value || `Draft #${params.row.yarn_issue_id}`}
					</Typography>
				),
			},
			{
				field: "tran_date",
				headerName: "Date",
				flex: 0.7,
				minWidth: 110,
				valueFormatter: (value: string) => formatDisplayDate(value),
			},
			{
				field: "issue_type",
				headerName: "Type",
				flex: 0.6,
				minWidth: 100,
				renderCell: (params: GridRenderCellParams<YarnIssueGridRow, YarnIssueType>) => (
					<Chip size="small" variant="outlined" color={getIssueTypeChipColor(params.row.issue_type)} label={getIssueTypeLabel(params.row.issue_type)} />
				),
			},
			{
				field: "dept_desc",
				headerName: "Department",
				flex: 1.3,
				minWidth: 160,
				valueFormatter: (value: string | null) => value || "-",
			},
			{
				field: "line_count",
				headerName: "Lines",
				type: "number",
				flex: 0.5,
				minWidth: 80,
				align: "right",
				headerAlign: "right",
			},
			{
				field: "total_kg",
				headerName: "Total Kg",
				type: "number",
				flex: 0.8,
				minWidth: 110,
				align: "right",
				headerAlign: "right",
				valueFormatter: (value: number | null) => formatNumber(value, 0),
			},
			{
				field: "status_id",
				headerName: "Status",
				flex: 0.9,
				minWidth: 140,
				renderCell: (params: GridRenderCellParams<YarnIssueGridRow, number>) => (
					<Chip
						size="small"
						color={getStatusChipColor(params.row.status_id)}
						label={getStatusLabel(params.row.status_id, params.row.status_name, params.row.approval_level)}
					/>
				),
			},
		],
		[],
	);

	const openRecord = React.useCallback(
		(row: YarnIssueGridRow) => {
			router.push(`${YARN_ISSUE_LIST_PATH}/edit?id=${encodeURIComponent(String(row.yarn_issue_id))}`);
		},
		[router],
	);

	const handleCreate = React.useCallback(() => {
		router.push(`${YARN_ISSUE_LIST_PATH}/edit`);
	}, [router]);

	// Edit icon only for Draft/Open; other rows get the View icon.
	const isRowEditable = React.useCallback((row: YarnIssueGridRow) => isEditableStatus(row.status_id), []);

	const selectedStatusOption = React.useMemo(
		() => STATUS_FILTER_OPTIONS.find((option) => option.value === statusFilter) ?? STATUS_FILTER_OPTIONS[0],
		[statusFilter],
	);
	const selectedTypeOption = React.useMemo(
		() => TYPE_FILTER_OPTIONS.find((option) => option.value === typeFilter) ?? TYPE_FILTER_OPTIONS[0],
		[typeFilter],
	);

	return (
		<IndexWrapper
			title="Yarn Issue / Return"
			subtitle="Purchased yarn issued from the godown to a department floor, or returned (kilograms). Only approved documents move stock."
			rows={pagedRows}
			columns={columns}
			rowCount={rows.length}
			paginationModel={paginationModel}
			onPaginationModelChange={setPaginationModel}
			loading={loading}
			showLoadingUntilLoaded
			autoHeight
			toolbarContent={
				<>
					{branches.length > 1 ? (
						<SearchableSelect<BranchOption>
							variant="outlined"
							label="Branch"
							className="min-w-52"
							fullWidth={false}
							clearable={false}
							options={branches}
							value={selectedBranch}
							onChange={(option) => {
								resetPage();
								setBranchId(option ? option.branch_id : null);
							}}
							getOptionLabel={(option) => option.branch_name}
							getOptionKey={(option) => String(option.branch_id)}
							isOptionEqualToValue={(option, value) => option.branch_id === value.branch_id}
						/>
					) : selectedBranch ? (
						<Typography variant="body2" sx={{ fontWeight: 600 }}>
							Branch: {selectedBranch.branch_name}
						</Typography>
					) : null}
					<TextField
						size="small"
						type="date"
						label="From"
						value={fromDate}
						onChange={(event) => {
							resetPage();
							setFromDate(event.target.value);
						}}
						InputLabelProps={{ shrink: true }}
					/>
					<TextField
						size="small"
						type="date"
						label="To"
						value={toDate}
						onChange={(event) => {
							resetPage();
							setToDate(event.target.value);
						}}
						InputLabelProps={{ shrink: true }}
					/>
					<SearchableSelect<TypeFilterOption>
						variant="outlined"
						label="Type"
						className="min-w-36"
						fullWidth={false}
						clearable={false}
						options={TYPE_FILTER_OPTIONS}
						value={selectedTypeOption}
						onChange={(option) => {
							resetPage();
							setTypeFilter(option?.value ?? null);
						}}
						getOptionLabel={(option) => option.label}
						getOptionKey={(option) => option.value ?? "all"}
						isOptionEqualToValue={(option, value) => option.value === value.value}
					/>
					<SearchableSelect<StatusFilterOption>
						variant="outlined"
						label="Status"
						className="min-w-45"
						fullWidth={false}
						clearable={false}
						options={STATUS_FILTER_OPTIONS}
						value={selectedStatusOption}
						onChange={(option) => {
							resetPage();
							setStatusFilter(option?.value ?? null);
						}}
						getOptionLabel={(option) => option.label}
						getOptionKey={(option) => String(option.value ?? "all")}
						isOptionEqualToValue={(option, value) => option.value === value.value}
					/>
					<Button size="small" variant="outlined" onClick={() => void loadRows()} disabled={loading || branchId == null}>
						Refresh
					</Button>
				</>
			}
			createAction={{ label: "New Yarn Issue / Return", onClick: handleCreate }}
			onView={openRecord}
			onEdit={openRecord}
			onRowClick={openRecord}
			isRowEditable={isRowEditable}
		>
			{coId == null || branchId == null ? (
				<Alert severity="info" sx={{ mt: 2 }}>
					Select a company and branch in the sidebar to see yarn issues.
				</Alert>
			) : null}
			{errorMessage ? (
				<Alert severity="error" sx={{ mt: 2 }} onClose={() => setErrorMessage(null)}>
					{errorMessage}
				</Alert>
			) : null}
		</IndexWrapper>
	);
}

export default function YarnIssueIndexPage() {
	return (
		<Suspense
			fallback={
				<Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
					<CircularProgress />
				</Box>
			}
		>
			<YarnIssueIndexPageContent />
		</Suspense>
	);
}
