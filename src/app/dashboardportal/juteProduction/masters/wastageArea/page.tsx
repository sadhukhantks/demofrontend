"use client";

import * as React from "react";
import {
	Alert,
	Autocomplete,
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	IconButton,
	Switch,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import { Pencil as EditIcon, Plus as AddIcon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";

type WastageAreaRow = {
	wastage_area_id: number;
	co_id: number;
	branch_id: number;
	dept_id: number;
	area_name: string;
	active: number;
	dept_name: string | null;
	branch_name: string | null;
};

type DeptOption = { dept_id: number; dept_desc: string; branch_id: number | null };

const BLANK_FORM = { dept_id: "", area_name: "", active: 1 };

/**
 * Wastage Area Master — the areas that the Waste Entry sheet's Area dropdown is
 * fed from. Every area belongs to exactly one department, and the page is
 * branch-scoped the same way Waste Entry is: a single sidebar branch is adopted
 * automatically, several means the operator picks one before anything loads.
 */
export default function WastageAreaMasterPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedBranches, selectedCompany } = useSidebarContext();

	// Branch resolution: 1 sidebar branch → auto-use it; several → user must pick one.
	const sidebarBranchIds = React.useMemo(() => selectedBranches.map(Number), [selectedBranches]);
	const [pageBranchId, setPageBranchId] = React.useState<number | "">("");
	React.useEffect(() => {
		if (sidebarBranchIds.length === 1) {
			setPageBranchId(sidebarBranchIds[0]);
		} else if (sidebarBranchIds.length === 0) {
			setPageBranchId("");
		} else {
			setPageBranchId((prev) =>
				prev !== "" && sidebarBranchIds.includes(prev as number) ? prev : ""
			);
		}
	}, [sidebarBranchIds]);
	const branchId = pageBranchId === "" ? null : (pageBranchId as number);
	const branchOptions = React.useMemo(
		() =>
			(selectedCompany?.branches ?? []).filter((b) =>
				sidebarBranchIds.includes(Number(b.branch_id))
			),
		[selectedCompany, sidebarBranchIds]
	);
	const selectedBranchName = branchOptions.find(
		(b) => Number(b.branch_id) === branchId
	)?.branch_name;

	const [rows, setRows] = React.useState<WastageAreaRow[]>([]);
	const [departments, setDepartments] = React.useState<DeptOption[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const [open, setOpen] = React.useState(false);
	const [saving, setSaving] = React.useState(false);
	const [editing, setEditing] = React.useState<WastageAreaRow | null>(null);
	const [form, setForm] = React.useState(BLANK_FORM);

	const refresh = React.useCallback(async () => {
		if (!coId || branchId == null) return;
		setLoading(true);
		setError(null);
		const url = `${apiRoutesPortalMasters.WASTAGE_AREA_LIST}?co_id=${coId}&branch_id=${branchId}`;
		const { data, error: err } = await fetchWithCookie<{ data: WastageAreaRow[] }>(url, "GET");
		if (err) setError(err);
		else setRows(data?.data ?? []);
		setLoading(false);
	}, [coId, branchId]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	// Departments come from the Waste Entry setup endpoint — same company+branch
	// scoping, so there is no second department list to keep in step.
	React.useEffect(() => {
		if (!coId || branchId == null) return;
		void (async () => {
			const url = `${apiRoutesPortalMasters.JUTE_WASTE_ENTRY_CREATE_SETUP}?co_id=${coId}&branch_id=${branchId}`;
			const { data } = await fetchWithCookie<{ data: { departments: DeptOption[] } }>(url, "GET");
			setDepartments(data?.data?.departments ?? []);
		})();
	}, [coId, branchId]);

	const openCreate = () => {
		setError(null);
		setEditing(null);
		setForm(BLANK_FORM);
		setOpen(true);
	};

	const openEdit = (row: WastageAreaRow) => {
		setError(null);
		setEditing(row);
		setForm({
			dept_id: String(row.dept_id),
			area_name: row.area_name,
			active: row.active,
		});
		setOpen(true);
	};

	const handleSave = async () => {
		if (!coId || branchId == null) return;
		setSaving(true);
		setError(null);
		const payload = {
			co_id: Number(coId),
			branch_id: branchId,
			dept_id: Number(form.dept_id),
			area_name: form.area_name.trim(),
			active: Number(form.active),
		};
		const { error: err } = editing
			? await fetchWithCookie(
					`${apiRoutesPortalMasters.WASTAGE_AREA_EDIT}/${editing.wastage_area_id}?co_id=${coId}`,
					"PUT",
					payload
				)
			: await fetchWithCookie(apiRoutesPortalMasters.WASTAGE_AREA_CREATE, "POST", payload);
		setSaving(false);
		if (err) {
			setError(err);
			return;
		}
		setOpen(false);
		setEditing(null);
		await refresh();
	};

	const selectedDept = departments.find((d) => String(d.dept_id) === form.dept_id) ?? null;

	const columns = React.useMemo<GridColDef<WastageAreaRow>[]>(
		() => [
			{
				field: "actions",
				headerName: "",
				width: 60,
				sortable: false,
				filterable: false,
				renderCell: (params) => (
					<Tooltip title="Edit">
						<IconButton
							size="small"
							onClick={() => openEdit(params.row)}
							sx={{ minWidth: 40, minHeight: 40 }}
						>
							<EditIcon size={16} />
						</IconButton>
					</Tooltip>
				),
			},
			{ field: "area_name", headerName: "Wastage Area", flex: 1, minWidth: 200 },
			{
				field: "dept_name",
				headerName: "Department",
				flex: 1,
				minWidth: 180,
				valueGetter: (value) => value ?? "",
			},
			{ field: "branch_name", headerName: "Branch", width: 160 },
			{
				field: "active",
				headerName: "Active",
				width: 90,
				renderCell: (params) => (params.value ? "Yes" : "No"),
			},
		],
		[]
	);

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
				Select at least one branch in the sidebar to continue.
			</Alert>
		);
	}

	return (
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 2,
					mb: 2,
					flexWrap: "wrap",
				}}
			>
				<Box>
					<Typography variant="h5" sx={{ fontWeight: 600 }}>
						Wastage Area Master
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Waste-collection areas, each one linked to a department.
					</Typography>
				</Box>
				<Button
					variant="contained"
					startIcon={<AddIcon size={18} />}
					onClick={openCreate}
					disabled={branchId == null}
				>
					New Area
				</Button>
			</Box>

			{sidebarBranchIds.length > 1 ? (
				<Autocomplete
					options={branchOptions}
					getOptionLabel={(b) => b.branch_name ?? ""}
					value={branchOptions.find((b) => Number(b.branch_id) === branchId) ?? null}
					onChange={(_, next) => setPageBranchId(next ? Number(next.branch_id) : "")}
					isOptionEqualToValue={(opt, val) => Number(opt.branch_id) === Number(val.branch_id)}
					renderOption={(props, b) => (
						<li {...props} key={b.branch_id}>
							{b.branch_name}
						</li>
					)}
					size="small"
					sx={{ mb: 2, minWidth: 240, maxWidth: 320 }}
					renderInput={(params) => <TextField {...params} label="Branch" />}
				/>
			) : selectedBranchName ? (
				<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
					Branch: {selectedBranchName}
				</Typography>
			) : null}

			{error ? (
				<Alert severity="error" sx={{ mb: 2 }}>
					{error}
				</Alert>
			) : null}

			{branchId == null ? (
				<Alert severity="info">Select a branch to load wastage areas.</Alert>
			) : (
				<Box sx={{ width: "100%" }}>
					<DataGrid
						autoHeight
						rows={rows}
						getRowId={(r) => r.wastage_area_id}
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

			<Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
				<DialogTitle>{editing ? `Edit Area: ${editing.area_name}` : "New Wastage Area"}</DialogTitle>
				<DialogContent>
					<Box sx={{ display: "grid", gap: 2, mt: 1 }}>
						<Autocomplete
							options={departments}
							getOptionLabel={(d) => d.dept_desc}
							value={selectedDept}
							onChange={(_, next) =>
								setForm((f) => ({ ...f, dept_id: next ? String(next.dept_id) : "" }))
							}
							isOptionEqualToValue={(opt, val) => opt.dept_id === val.dept_id}
							renderOption={(props, d) => (
								<li {...props} key={d.dept_id}>
									{d.dept_desc}
								</li>
							)}
							size="small"
							fullWidth
							renderInput={(params) => <TextField {...params} label="Department" required />}
						/>
						<TextField
							label="Area Name"
							value={form.area_name}
							onChange={(e) => setForm((f) => ({ ...f, area_name: e.target.value }))}
							size="small"
							fullWidth
							required
							inputProps={{ maxLength: 100 }}
						/>
						<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
							<Typography variant="body2">Active</Typography>
							<Switch
								checked={!!form.active}
								onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked ? 1 : 0 }))}
							/>
						</Box>
					</Box>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setOpen(false)} disabled={saving}>
						Cancel
					</Button>
					<Button
						variant="contained"
						onClick={() => {
							void handleSave();
						}}
						disabled={saving || !form.dept_id || !form.area_name.trim()}
					>
						{saving ? "Saving…" : "Save"}
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
}
