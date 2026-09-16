"use client";

import * as React from "react";
import { Alert, Box, Button, Chip, IconButton, Snackbar, Tooltip, Typography } from "@mui/material";
import { Pencil as EditIcon, Plus as AddIcon, Trash2 as DeleteIcon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import {
	BALE_QUALITY_TYPE_LABELS,
	BALE_QUALITY_TYPE_SACKING,
	type BaleQualityType,
	type BaleSeriesListResponse,
	type BaleSeriesPayload,
	type BaleSeriesRow,
	type BaleSeriesSetup,
} from "../../baleProduction/types/baleTypes";
import BaleSeriesDialog from "./_components/BaleSeriesDialog";

/**
 * Bale Series Master (SPEC §4.1, §8.2) — the sheet's "Last Bale No" tab as
 * data: one row = one running bale-number counter (PUNJAB, FCI, a hessian
 * quality…), scoped to company + branch. Series are per branch, so a branch
 * must be resolved before anything loads.
 */
export default function BaleSeriesMasterPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedBranches, selectedCompany } = useSidebarContext();

	// Branch resolution: 1 sidebar branch → auto-use it; several → user picks one.
	const sidebarBranchIds = React.useMemo(() => selectedBranches.map(Number), [selectedBranches]);
	const [pageBranchId, setPageBranchId] = React.useState<number | "">("");
	React.useEffect(() => {
		if (sidebarBranchIds.length === 1) {
			setPageBranchId(sidebarBranchIds[0]);
		} else if (sidebarBranchIds.length === 0) {
			setPageBranchId("");
		} else {
			setPageBranchId((prev) => (prev !== "" && sidebarBranchIds.includes(prev as number) ? prev : ""));
		}
	}, [sidebarBranchIds]);
	const branchId = pageBranchId === "" ? null : (pageBranchId as number);
	const branchOptions = React.useMemo(
		() => (selectedCompany?.branches ?? []).filter((b) => sidebarBranchIds.includes(Number(b.branch_id))),
		[selectedCompany, sidebarBranchIds]
	);
	const selectedBranchName = branchOptions.find((b) => Number(b.branch_id) === branchId)?.branch_name;

	const [rows, setRows] = React.useState<BaleSeriesRow[]>([]);
	const [setup, setSetup] = React.useState<BaleSeriesSetup | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [dialogError, setDialogError] = React.useState<string | null>(null);
	const [submitting, setSubmitting] = React.useState(false);
	const [snack, setSnack] = React.useState<string | null>(null);
	const [typeFilter, setTypeFilter] = React.useState<BaleQualityType | "all">("all");

	const [open, setOpen] = React.useState(false);
	const [editingRow, setEditingRow] = React.useState<BaleSeriesRow | null>(null);

	const refresh = React.useCallback(async () => {
		if (!coId || branchId == null) {
			setRows([]);
			return;
		}
		setLoading(true);
		const { data, error: err } = await fetchWithCookie<{ data: BaleSeriesListResponse }>(
			`${apiRoutesPortalMasters.BALE_SERIES_LIST}?co_id=${coId}&branch_id=${branchId}`,
			"GET"
		);
		if (err) setError(err);
		else setError(null);
		setRows(data?.data?.rows ?? []);
		setLoading(false);
	}, [coId, branchId]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	// Dropdown sources for the dialog (cloth items, states, parties).
	React.useEffect(() => {
		if (!coId || branchId == null) {
			setSetup(null);
			return;
		}
		let cancelled = false;
		void fetchWithCookie<{ data: BaleSeriesSetup }>(
			`${apiRoutesPortalMasters.BALE_SERIES_SETUP}?co_id=${coId}&branch_id=${branchId}`,
			"GET"
		).then(({ data, error: err }) => {
			if (cancelled) return;
			if (err) {
				setError(err);
				return;
			}
			const d = data?.data;
			setSetup(d ? { items: d.items ?? [], states: d.states ?? [], parties: d.parties ?? [] } : null);
		});
		return () => {
			cancelled = true;
		};
	}, [coId, branchId]);

	const filteredRows = React.useMemo(
		() => (typeFilter === "all" ? rows : rows.filter((r) => Number(r.quality_type) === typeFilter)),
		[rows, typeFilter]
	);

	const openCreate = () => {
		setEditingRow(null);
		setDialogError(null);
		setOpen(true);
	};

	const openEdit = (row: BaleSeriesRow) => {
		setEditingRow(row);
		setDialogError(null);
		setOpen(true);
	};

	const onSubmit = async (payload: BaleSeriesPayload) => {
		if (!coId) return;
		setSubmitting(true);
		setDialogError(null);
		const { error: err } = editingRow
			? await fetchWithCookie(
					`${apiRoutesPortalMasters.BALE_SERIES_EDIT}/${editingRow.bale_series_id}?co_id=${coId}`,
					"PUT",
					payload
				)
			: await fetchWithCookie(apiRoutesPortalMasters.BALE_SERIES_CREATE, "POST", payload);
		setSubmitting(false);
		if (err) {
			setDialogError(err);
			return;
		}
		setSnack(editingRow ? `Updated series "${payload.series_name}"` : `Created series "${payload.series_name}"`);
		setOpen(false);
		setEditingRow(null);
		await refresh();
	};

	const handleDelete = async (row: BaleSeriesRow) => {
		if (!coId) return;
		const warn = row.bales_total > 0 ? `\n\n${row.bales_total} bale row(s) reference it — the server will refuse while they are active.` : "";
		if (!window.confirm(`Delete series "${row.series_name}" (last bale no ${row.last_bale_no.toLocaleString()})?${warn}`)) return;
		setError(null);
		const { error: err } = await fetchWithCookie(
			`${apiRoutesPortalMasters.BALE_SERIES_DELETE}/${row.bale_series_id}?co_id=${coId}`,
			"DELETE"
		);
		if (err) {
			setError(err);
			return;
		}
		setSnack(`Deleted series "${row.series_name}"`);
		await refresh();
	};

	// Plain array (no memo): handlers close over coId / branchId / refresh, which
	// change with the sidebar — memoising would pin a stale `refresh`.
	const columns: GridColDef<BaleSeriesRow>[] = [
		{
			field: "actions",
			headerName: "",
			width: 96,
			sortable: false,
			filterable: false,
			renderCell: (params) => (
				<Box>
					<Tooltip title="Edit">
						<IconButton size="small" onClick={() => openEdit(params.row)} sx={{ minWidth: 40, minHeight: 40 }}>
							<EditIcon size={16} />
						</IconButton>
					</Tooltip>
					<Tooltip title="Delete">
						<IconButton size="small" color="error" onClick={() => void handleDelete(params.row)} sx={{ minWidth: 40, minHeight: 40 }}>
							<DeleteIcon size={16} />
						</IconButton>
					</Tooltip>
				</Box>
			),
		},
		{ field: "series_name", headerName: "Series", flex: 1, minWidth: 160 },
		{
			field: "quality_type",
			headerName: "Type",
			width: 110,
			renderCell: (params) =>
				Number(params.value) === BALE_QUALITY_TYPE_SACKING ? (
					<Chip label="Sacking" size="small" color="secondary" variant="outlined" />
				) : (
					<Chip label="Hessian" size="small" variant="outlined" />
				),
		},
		{
			field: "item_name",
			headerName: "Bound Item",
			flex: 1,
			minWidth: 200,
			valueGetter: (value, row) => value ?? (row.item_id != null ? String(row.item_id) : "— any of type —"),
		},
		{ field: "state", headerName: "State", width: 140, valueGetter: (value) => value ?? "" },
		{ field: "party_name", headerName: "Party", width: 160, valueGetter: (value) => value ?? "" },
		{
			field: "last_bale_no",
			headerName: "Last Bale No",
			width: 130,
			type: "number",
			valueFormatter: (value) => (value == null ? "" : Number(value).toLocaleString()),
		},
		{ field: "bales_total", headerName: "Bales", width: 100, type: "number" },
		{ field: "branch_name", headerName: "Branch", width: 150, valueGetter: (value) => value ?? "" },
	];

	if (!mounted) return null;

	if (!coId) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select a company to continue.
			</Alert>
		);
	}

	if (sidebarBranchIds.length === 0) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select at least one branch in the sidebar — bale series are kept per branch.
			</Alert>
		);
	}

	return (
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, gap: 2, flexWrap: "wrap" }}>
				<Box>
					<Typography variant="h5" sx={{ fontWeight: 600 }}>
						Bale Series Master
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Running bale-number counters — one per consignee / state for sacking, one per quality for hessian.
						Editing the last bale no resets the counter.
					</Typography>
				</Box>
				<Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
					{sidebarBranchIds.length > 1 ? (
						<SearchableOptionSelect
							label="Branch"
							size="small"
							options={branchOptions.map((b) => ({ value: Number(b.branch_id), label: b.branch_name }))}
							value={pageBranchId}
							onChange={(v) => setPageBranchId(v === "" ? "" : Number(v))}
							sx={{ minWidth: 220 }}
						/>
					) : selectedBranchName ? (
						<Typography variant="body2" color="text.secondary">
							Branch: {selectedBranchName}
						</Typography>
					) : null}
					<SearchableOptionSelect
						label="Type"
						size="small"
						options={[
							{ value: "all", label: "All" },
							...(Object.entries(BALE_QUALITY_TYPE_LABELS) as [string, string][]).map(([v, l]) => ({ value: v, label: l })),
						]}
						value={typeFilter === "all" ? "all" : String(typeFilter)}
						onChange={(v) => setTypeFilter(v === "all" || v === "" ? "all" : (Number(v) as BaleQualityType))}
						sx={{ minWidth: 140 }}
					/>
					<Button variant="contained" startIcon={<AddIcon size={18} />} onClick={openCreate} disabled={branchId == null}>
						New Series
					</Button>
				</Box>
			</Box>

			{error ? (
				<Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
					{error}
				</Alert>
			) : null}

			{branchId == null ? (
				<Alert severity="info">Select a branch to list its bale series.</Alert>
			) : (
				<Box sx={{ width: "100%" }}>
					<DataGrid
						autoHeight
						rows={filteredRows}
						getRowId={(r) => r.bale_series_id}
						columns={columns}
						loading={loading}
						density="comfortable"
						disableRowSelectionOnClick
						pageSizeOptions={[10, 25, 50]}
						initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
						sx={{ width: "100%" }}
					/>
				</Box>
			)}

			{branchId != null ? (
				<BaleSeriesDialog
					open={open}
					row={editingRow}
					setup={setup}
					coId={Number(coId)}
					branchId={branchId}
					branchName={selectedBranchName}
					submitting={submitting}
					error={dialogError}
					onClose={() => setOpen(false)}
					onSubmit={(payload) => {
						void onSubmit(payload);
					}}
				/>
			) : null}

			<Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)} message={snack ?? ""} />
		</Box>
	);
}
