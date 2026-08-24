"use client";

import * as React from "react";
import { Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Tooltip, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Pencil as EditIcon, Plus as AddIcon, Trash2 as DeleteIcon } from "lucide-react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { PROD_LABEL, VALUE_ROLE_LABELS } from "./TargetMapEditor";
import type { ValueRole } from "./TargetGrid";

import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
// One row of target_map_list, normalised. The list endpoint returns ACTIVE rows
// only, so a deleted row simply leaves the table (no status column needed).
export type TargetMapRow = {
	id: number;
	effective_date: string;
	ref_id: number;
	ref_code: string | null;
	ref_name: string | null;
	value_role: string;
	param: string;
	value: number;
	branch_id: number | null;
};

type ApiRow = Partial<TargetMapRow> & {
	winding_target_map_id?: number;
	target_map_id?: number;
};

type RefOption = { ref_id: number; ref_code: string | null; ref_name: string | null };

type Props = {
	coId: number | string;
	branchId: number | null;
	/** Seeds the new-entry dialog (the list itself always shows every role/date). */
	valueRole: ValueRole;
	effectiveDate: string;
	/** Bumped by the page after a grid bulk-save so the history reloads. */
	reloadKey?: number;
};

const blankForm = (valueRole: ValueRole, effectiveDate: string) => ({
	ref_id: "",
	value_role: valueRole as string,
	effective_date: effectiveDate,
	value: "",
});

/**
 * Effective-dated history of every winding standard/target, with create / edit /
 * delete. This is the half of the master that makes LAST-DATE resolution legible:
 * the report reads the row with the greatest effective_date <= the report date, so
 * a new value is a NEW ROW, not an overwrite. Rows are grouped by quality (then
 * newest date first) so that reads as a history rather than one number per quality.
 */
export default function TargetMapList({
	coId,
	branchId,
	valueRole,
	effectiveDate,
	reloadKey = 0,
}: Props) {
	const [rows, setRows] = React.useState<TargetMapRow[]>([]);
	const [refs, setRefs] = React.useState<RefOption[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const [open, setOpen] = React.useState(false);
	const [saving, setSaving] = React.useState(false);
	const [submitted, setSubmitted] = React.useState(false);
	const [editing, setEditing] = React.useState<TargetMapRow | null>(null);
	const [form, setForm] = React.useState(blankForm(valueRole, effectiveDate));

	const refresh = React.useCallback(async () => {
		if (!coId) return;
		setLoading(true);
		setError(null);
		const params = new URLSearchParams({ co_id: String(coId), id_type: "qid", param: "prod" });
		if (branchId != null) params.set("branch_id", String(branchId));
		const { data, error: err } = await fetchWithCookie<{ data: ApiRow[] }>(
			`${apiRoutesPortalMasters.WINDING_TARGET_MAP_LIST}?${params.toString()}`,
			"GET"
		);
		if (err) {
			setError(err);
			setRows([]);
		} else {
			const list = (data?.data ?? []).map((r) => ({
				id: Number(r.winding_target_map_id),
				effective_date: r.effective_date ?? "",
				ref_id: Number(r.ref_id),
				ref_code: r.ref_code ?? null,
				ref_name: r.ref_name ?? null,
				value_role: String(r.value_role ?? ""),
				param: String(r.param ?? "prod"),
				value: Number(r.value ?? 0),
				branch_id: r.branch_id ?? null,
			}));
			// Group by quality, newest effective date first — the point of the tab is
			// seeing a quality's value history, which a flat date sort hides.
			list.sort(
				(a, b) =>
					(a.ref_name ?? "").localeCompare(b.ref_name ?? "") ||
					(b.effective_date ?? "").localeCompare(a.effective_date ?? "")
			);
			setRows(list);
		}
		setLoading(false);
	}, [coId, branchId]);

	React.useEffect(() => {
		void refresh();
	}, [refresh, reloadKey]);

	// Yarn-quality picker options for the dialog (target_map_setup), which returns
	// { qualities: [{ item_id, item_code, item_name, ref_id, ref_code, ref_name }] }.
	React.useEffect(() => {
		if (!coId) return;
		void (async () => {
			const params = new URLSearchParams({ co_id: String(coId) });
			if (branchId != null) params.set("branch_id", String(branchId));
			const { data } = await fetchWithCookie<{ data: Record<string, unknown> }>(
				`${apiRoutesPortalMasters.WINDING_TARGET_MAP_SETUP}?${params.toString()}`,
				"GET"
			);
			const d = data?.data ?? {};
			const raw = (d.qualities ?? []) as Record<string, unknown>[];
			setRefs(
				raw
					.map((o) => ({
						ref_id: Number(o.item_id),
						ref_code: (o.item_code ?? null) as string | null,
						ref_name: (o.item_name ?? null) as string | null,
					}))
					.filter((o) => Number.isFinite(o.ref_id))
			);
		})();
	}, [coId, branchId]);

	const openCreate = () => {
		setError(null);
		setSubmitted(false);
		setEditing(null);
		setForm(blankForm(valueRole, effectiveDate));
		setOpen(true);
	};

	const openEdit = (row: TargetMapRow) => {
		setError(null);
		setSubmitted(false);
		setEditing(row);
		setForm({
			ref_id: String(row.ref_id),
			value_role: row.value_role,
			effective_date: row.effective_date,
			value: String(row.value ?? ""),
		});
		setOpen(true);
	};

	// Client-side gate: a 400 round-trip is a poor entry experience, and the same
	// rules are enforced again by the backend.
	const fieldErrors = {
		ref_id: form.ref_id === "" ? "Select a yarn quality" : "",
		effective_date: form.effective_date === "" ? "Effective date is required" : "",
		value:
			form.value === ""
				? "Enter a target production value"
				: !Number.isFinite(Number(form.value)) || Number(form.value) < 0
					? "Must be a number of 0 or more"
					: "",
	};
	const invalid = Object.values(fieldErrors).some(Boolean);
	const errText = (k: keyof typeof fieldErrors) => (submitted ? fieldErrors[k] : "");

	const handleSave = async () => {
		setSubmitted(true);
		if (invalid || !coId) return;
		setSaving(true);
		setError(null);
		const { error: err } = editing
			? await fetchWithCookie(
					`${apiRoutesPortalMasters.WINDING_TARGET_MAP_EDIT}/${editing.id}?co_id=${coId}`,
					"PUT",
					{ effective_date: form.effective_date, value: Number(form.value) }
				)
			: await fetchWithCookie(apiRoutesPortalMasters.WINDING_TARGET_MAP_CREATE, "POST", {
					co_id: Number(coId),
					branch_id: branchId != null ? Number(branchId) : null,
					effective_date: form.effective_date,
					ref_id: Number(form.ref_id),
					id_type: "qid",
					value_role: form.value_role,
					param: "prod",
					value: Number(form.value),
				});
		setSaving(false);
		if (err) {
			setError(err);
			return;
		}
		setOpen(false);
		setEditing(null);
		await refresh();
	};

	const handleDelete = async (row: TargetMapRow) => {
		const role = VALUE_ROLE_LABELS[row.value_role as ValueRole] ?? row.value_role;
		const label = `${row.ref_name ?? row.ref_id} @ ${row.effective_date}`;
		if (!window.confirm(`Delete ${role} value for ${label}?`)) return;
		setError(null);
		const { error: err } = await fetchWithCookie(
			`${apiRoutesPortalMasters.WINDING_TARGET_MAP_DELETE}/${row.id}?co_id=${coId}`,
			"DELETE"
		);
		if (err) {
			setError(err);
			return;
		}
		await refresh();
	};

	const selectedRef = refs.find((r) => String(r.ref_id) === form.ref_id) ?? null;

	const columns = React.useMemo<GridColDef<TargetMapRow>[]>(
		() => [
			{
				field: "actions",
				headerName: "",
				width: 96,
				sortable: false,
				filterable: false,
				renderCell: (params) => (
					<>
						<Tooltip title="Edit">
							<IconButton size="small" onClick={() => openEdit(params.row)} aria-label="Edit">
								<EditIcon size={16} />
							</IconButton>
						</Tooltip>
						<Tooltip title="Delete">
							<IconButton
								size="small"
								onClick={() => void handleDelete(params.row)}
								aria-label="Delete"
							>
								<DeleteIcon size={16} />
							</IconButton>
						</Tooltip>
					</>
				),
			},
			{ field: "ref_code", headerName: "Code", width: 120 },
			{ field: "ref_name", headerName: "Yarn Quality", flex: 1, minWidth: 200 },
			{ field: "effective_date", headerName: "Effective From", width: 140 },
			{
				field: "value_role",
				headerName: "Role",
				width: 120,
				valueGetter: (value) => VALUE_ROLE_LABELS[value as ValueRole] ?? value,
			},
			{
				field: "value",
				headerName: PROD_LABEL,
				width: 260,
				type: "number",
				valueFormatter: (value) => Number(value ?? 0).toFixed(2),
			},
		],
		// Rebuild when `refresh` changes so the row handlers never close over a stale
		// co_id / branch_id (openEdit only touches state setters, which are stable).
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[refresh]
	);

	return (
		<Box>
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
				<Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 260 }}>
					Every value ever entered, grouped by quality with the newest date first. The report uses
					the latest row dated on or before the report date — adding a value never overwrites an
					older one.
				</Typography>
				<Button variant="contained" startIcon={<AddIcon size={18} />} onClick={openCreate}>
					New Value
				</Button>
			</Box>

			{error ? (
				<Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
					{error}
				</Alert>
			) : null}

			<DataGrid
				autoHeight
				rows={rows}
				getRowId={(r) => r.id}
				columns={columns}
				loading={loading}
				density="comfortable"
				disableRowSelectionOnClick
				pageSizeOptions={[10, 25, 50, 100]}
				initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
				sx={{ width: "100%" }}
			/>

			<Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
				<DialogTitle>
					{editing ? `Edit — ${editing.ref_name ?? editing.ref_id}` : "New Winding Standard / Target"}
				</DialogTitle>
				<DialogContent>
					<Box sx={{ display: "grid", gap: 2, mt: 1 }}>
						<Autocomplete
							options={refs}
							getOptionLabel={(o) => o.ref_name ?? String(o.ref_id)}
							value={selectedRef}
							onChange={(_, next) =>
								setForm((f) => ({ ...f, ref_id: next ? String(next.ref_id) : "" }))
							}
							isOptionEqualToValue={(opt, val) => opt.ref_id === val.ref_id}
							renderOption={(props, o) => (
								<li {...props} key={o.ref_id}>
									{o.ref_code ? `${o.ref_code} — ` : ""}
									{o.ref_name ?? o.ref_id}
								</li>
							)}
							disabled={!!editing}
							size="small"
							fullWidth
							renderInput={(params) => (
								<TextField
									{...params}
									label="Yarn Quality"
									required
									error={!!errText("ref_id")}
									helperText={errText("ref_id")}
								/>
							)}
						/>
						<SearchableOptionSelect
							label="Role"
							size="small"
							fullWidth
							disabled={!!editing}
							options={(Object.keys(VALUE_ROLE_LABELS) as ValueRole[]).map((r) => ({ value: r, label: VALUE_ROLE_LABELS[r] }))}
							value={form.value_role}
							onChange={(selectedValue) => setForm((f) => ({ ...f, value_role: selectedValue }))}
						/>
						<TextField
							label="Effective From"
							type="date"
							value={form.effective_date}
							onChange={(e) => setForm((f) => ({ ...f, effective_date: e.target.value }))}
							size="small"
							fullWidth
							required
							InputLabelProps={{ shrink: true }}
							error={!!errText("effective_date")}
							helperText={errText("effective_date") || "Applies from this date until a newer row"}
						/>
						<TextField
							label={PROD_LABEL}
							value={form.value}
							onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
							type="number"
							size="small"
							fullWidth
							required
							inputProps={{ min: 0, step: "0.001" }}
							error={!!errText("value")}
							helperText={errText("value") || "Kilograms produced per winder over one 8-hour shift"}
						/>
					</Box>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setOpen(false)}>Cancel</Button>
					<Button variant="contained" onClick={() => void handleSave()} disabled={saving}>
						{saving ? "Saving…" : "Save"}
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
}
