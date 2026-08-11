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

type WasteRateRow = {
	waste_rate_id: number;
	co_id: number;
	branch_id: number | null;
	item_id: number;
	rate: number;
	valid_from: string;
	valid_to: string | null;
	active: number;
	item_name: string | null;
	item_code: string | null;
	branch_name: string | null;
};

type WasteItemOption = { item_id: number; item_name: string; item_code: string };

const todayISO = () => new Date().toISOString().slice(0, 10);

const BLANK_FORM = {
	item_id: "",
	rate: "",
	valid_from: todayISO(),
	valid_to: "",
	/** "" = every branch of the company (branch_id NULL on the row). */
	scope_branch: true,
	active: 1,
};

/**
 * Waste Rate Master — the per-quintal valuation rate applied to a WASTE line on
 * the Jute Issue page.
 *
 * Purchased jute carries its own rate from the MR, but process waste is a
 * byproduct with no purchase behind it, so without a rate here a waste line
 * issues at zero value. Rates are effective-dated: the issue picks the rate in
 * force on the issue date, preferring a branch-specific row over a company-wide
 * one, then the latest `valid_from`. Superseding a rate is therefore just
 * adding a newer row — no need to close the old one off.
 *
 * Branch-scoped the same way Waste Entry is: one sidebar branch is adopted
 * automatically, several means the operator picks one first.
 */
export default function WasteRateMasterPage() {
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

	const [rows, setRows] = React.useState<WasteRateRow[]>([]);
	const [items, setItems] = React.useState<WasteItemOption[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const [open, setOpen] = React.useState(false);
	const [saving, setSaving] = React.useState(false);
	const [editing, setEditing] = React.useState<WasteRateRow | null>(null);
	const [form, setForm] = React.useState(BLANK_FORM);

	const refresh = React.useCallback(async () => {
		if (!coId || branchId == null) return;
		setLoading(true);
		setError(null);
		const url = `${apiRoutesPortalMasters.WASTE_RATE_LIST}?co_id=${coId}&branch_id=${branchId}`;
		const { data, error: err } = await fetchWithCookie<{ data: WasteRateRow[] }>(url, "GET");
		if (err) setError(err);
		else setRows(data?.data ?? []);
		setLoading(false);
	}, [coId, branchId]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	// Waste items come from the Waste Entry setup endpoint — the same item-type-3
	// list the entry page books against, so a rate can never be filed against an
	// item that waste is never booked for.
	React.useEffect(() => {
		if (!coId || branchId == null) return;
		void (async () => {
			const url = `${apiRoutesPortalMasters.JUTE_WASTE_ENTRY_CREATE_SETUP}?co_id=${coId}&branch_id=${branchId}`;
			const { data } = await fetchWithCookie<{ data: { waste_items: WasteItemOption[] } }>(
				url,
				"GET"
			);
			setItems(data?.data?.waste_items ?? []);
		})();
	}, [coId, branchId]);

	const openCreate = () => {
		setError(null);
		setEditing(null);
		setForm(BLANK_FORM);
		setOpen(true);
	};

	const openEdit = (row: WasteRateRow) => {
		setError(null);
		setEditing(row);
		setForm({
			item_id: String(row.item_id),
			rate: String(row.rate ?? ""),
			valid_from: row.valid_from ?? todayISO(),
			valid_to: row.valid_to ?? "",
			scope_branch: row.branch_id != null,
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
			// null = the rate applies to every branch of the company
			branch_id: form.scope_branch ? branchId : null,
			item_id: Number(form.item_id),
			rate: Number(form.rate),
			valid_from: form.valid_from,
			valid_to: form.valid_to || null,
			active: Number(form.active),
		};
		const { error: err } = editing
			? await fetchWithCookie(
					`${apiRoutesPortalMasters.WASTE_RATE_EDIT}/${editing.waste_rate_id}?co_id=${coId}`,
					"PUT",
					payload
				)
			: await fetchWithCookie(apiRoutesPortalMasters.WASTE_RATE_CREATE, "POST", payload);
		setSaving(false);
		if (err) {
			setError(err);
			return;
		}
		setOpen(false);
		setEditing(null);
		await refresh();
	};

	const selectedItem = items.find((i) => String(i.item_id) === form.item_id) ?? null;

	const invalidWindow = Boolean(form.valid_to) && form.valid_to < form.valid_from;
	const invalidRate = form.rate === "" || Number(form.rate) < 0 || Number.isNaN(Number(form.rate));

	const columns = React.useMemo<GridColDef<WasteRateRow>[]>(
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
			{
				field: "item_name",
				headerName: "Waste Item",
				flex: 1,
				minWidth: 200,
				valueGetter: (value) => value ?? "",
			},
			{
				field: "rate",
				headerName: "Rate / Qtl",
				width: 130,
				type: "number",
				valueFormatter: (value) => Number(value ?? 0).toFixed(2),
			},
			{ field: "valid_from", headerName: "Valid From", width: 130 },
			{
				field: "valid_to",
				headerName: "Valid To",
				width: 130,
				// Open-ended is the normal case; spell it out rather than showing a blank
				valueGetter: (value) => value ?? "—",
			},
			{
				field: "branch_name",
				headerName: "Scope",
				width: 170,
				valueGetter: (value) => value ?? "All branches",
			},
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
						Waste Rate Master
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Valuation rate per quintal for each waste item, used to price waste on Jute Issue.
					</Typography>
				</Box>
				<Button
					variant="contained"
					startIcon={<AddIcon size={18} />}
					onClick={openCreate}
					disabled={branchId == null}
				>
					New Rate
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
				<Alert severity="info">Select a branch to load waste rates.</Alert>
			) : (
				<Box sx={{ width: "100%" }}>
					<DataGrid
						autoHeight
						rows={rows}
						getRowId={(r) => r.waste_rate_id}
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
				<DialogTitle>
					{editing ? `Edit Rate: ${editing.item_name ?? editing.item_id}` : "New Waste Rate"}
				</DialogTitle>
				<DialogContent>
					<Box sx={{ display: "grid", gap: 2, mt: 1 }}>
						<Autocomplete
							options={items}
							getOptionLabel={(i) => i.item_name}
							value={selectedItem}
							onChange={(_, next) =>
								setForm((f) => ({ ...f, item_id: next ? String(next.item_id) : "" }))
							}
							isOptionEqualToValue={(opt, val) => opt.item_id === val.item_id}
							renderOption={(props, i) => (
								<li {...props} key={i.item_id}>
									{i.item_name}
								</li>
							)}
							size="small"
							fullWidth
							renderInput={(params) => <TextField {...params} label="Waste Item" required />}
						/>
						<TextField
							label="Rate per Quintal (₹)"
							value={form.rate}
							onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
							type="number"
							size="small"
							fullWidth
							required
							inputProps={{ min: 0, step: "0.01" }}
							error={form.rate !== "" && invalidRate}
							helperText="Issue value = weight (kg) ÷ 100 × rate"
						/>
						<Box sx={{ display: "flex", gap: 2 }}>
							<TextField
								label="Valid From"
								type="date"
								value={form.valid_from}
								onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
								size="small"
								fullWidth
								required
								InputLabelProps={{ shrink: true }}
							/>
							<TextField
								label="Valid To"
								type="date"
								value={form.valid_to}
								onChange={(e) => setForm((f) => ({ ...f, valid_to: e.target.value }))}
								size="small"
								fullWidth
								InputLabelProps={{ shrink: true }}
								error={invalidWindow}
								helperText={invalidWindow ? "Must not precede Valid From" : "Blank = open-ended"}
							/>
						</Box>
						<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
							<Switch
								checked={form.scope_branch}
								onChange={(e) => setForm((f) => ({ ...f, scope_branch: e.target.checked }))}
							/>
							<Typography variant="body2">
								{form.scope_branch
									? `Applies to ${selectedBranchName ?? "this branch"} only`
									: "Applies to all branches of the company"}
							</Typography>
						</Box>
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
						disabled={saving || !form.item_id || invalidRate || !form.valid_from || invalidWindow}
					>
						{saving ? "Saving…" : "Save"}
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
}
