"use client";

import * as React from "react";
import { Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Tooltip, Typography } from "@mui/material";
import { Pencil as EditIcon, Plus as AddIcon, Trash2 as DeleteIcon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";

// Jute Rate Difference Master — a fixed rate difference of a raw-jute item vs a base item:
//   rate(item) = rate(base item) + difference   (e.g. SN TD-6 = SN TD-5 − 200)
// Effective-dated: a new difference from a later date is a NEW row, so older market rates
// keep the difference that applied then. The Jute Market Rate page auto-fills from it.

type JuteItem = { item_id: number; item_name: string; item_grp_id: number; item_grp_name: string };

type DiffRow = {
	rate_diff_id: number;
	item_id: number;
	item_name: string;
	item_grp_name: string;
	base_item_id: number;
	base_item_name: string;
	diff_amount: number;
	effective_from: string;
	in_force: number;
};

type FormState = { item: JuteItem | null; base: JuteItem | null; diff: string; effective_from: string };

const todayLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function JuteRateDiffPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => setMounted(true), []);

	const { coId } = useSelectedCompanyCoId();
	const [items, setItems] = React.useState<JuteItem[]>([]);
	const [rows, setRows] = React.useState<DiffRow[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [open, setOpen] = React.useState(false);
	const [editingId, setEditingId] = React.useState<number | null>(null);
	const [form, setForm] = React.useState<FormState>({ item: null, base: null, diff: "", effective_from: todayLocal() });
	const [saving, setSaving] = React.useState(false);

	React.useEffect(() => {
		if (!coId) return;
		void fetchWithCookie<{ data: { items: JuteItem[] } }>(`${apiRoutesPortalMasters.JUTE_MARKET_RATE_SETUP}?co_id=${coId}`, "GET").then(
			({ data, error: err }) => {
				if (err) setError(err);
				setItems(data?.data?.items ?? []);
			}
		);
	}, [coId]);

	const refresh = React.useCallback(async () => {
		if (!coId) return;
		setLoading(true);
		const { data, error: err } = await fetchWithCookie<{ data: DiffRow[] }>(
			`${apiRoutesPortalMasters.JUTE_RATE_DIFF_TABLE}?co_id=${coId}`,
			"GET"
		);
		setError(err);
		setRows(data?.data ?? []);
		setLoading(false);
	}, [coId]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	const byId = (id: number) => items.find((i) => i.item_id === id) ?? null;

	const openCreate = () => {
		setError(null);
		setEditingId(null);
		setForm({ item: null, base: null, diff: "", effective_from: todayLocal() });
		setOpen(true);
	};

	// "Change from a date" = new row: prefill from the current row but default the date to today.
	const openChange = (row: DiffRow) => {
		setError(null);
		setEditingId(null);
		setForm({ item: byId(row.item_id), base: byId(row.base_item_id), diff: String(row.diff_amount), effective_from: todayLocal() });
		setOpen(true);
	};

	const openEdit = (row: DiffRow) => {
		setError(null);
		setEditingId(row.rate_diff_id);
		setForm({ item: byId(row.item_id), base: byId(row.base_item_id), diff: String(row.diff_amount), effective_from: row.effective_from });
		setOpen(true);
	};

	const diffValid = form.diff.trim() !== "" && Number.isFinite(Number(form.diff));
	const saveDisabled = !form.item || !form.base || form.item.item_id === form.base.item_id || !diffValid || !form.effective_from;

	const handleSave = async () => {
		if (!coId || saveDisabled || !form.item || !form.base) return;
		setSaving(true);
		const { error: err } = await fetchWithCookie(apiRoutesPortalMasters.JUTE_RATE_DIFF_SAVE, "POST", {
			co_id: Number(coId),
			item_id: form.item.item_id,
			base_item_id: form.base.item_id,
			diff_amount: Number(form.diff),
			effective_from: form.effective_from,
			rate_diff_id: editingId,
		});
		setSaving(false);
		if (err) {
			setError(err);
			return;
		}
		setOpen(false);
		await refresh();
	};

	const handleDelete = async (row: DiffRow) => {
		if (!coId || !window.confirm(`Delete the difference for "${row.item_name}" from ${row.effective_from}?\n\nThe previous difference (if any) applies again.`)) return;
		const { error: err } = await fetchWithCookie(apiRoutesPortalMasters.JUTE_RATE_DIFF_DELETE, "POST", {
			co_id: Number(coId),
			rate_diff_id: row.rate_diff_id,
		});
		if (err) setError(err);
		await refresh();
	};

	const columns: GridColDef<DiffRow>[] = [
		{
			field: "actions",
			headerName: "",
			width: 130,
			sortable: false,
			filterable: false,
			renderCell: (params) => (
				<Box>
					<Tooltip title="Change from a date (keeps history)">
						<IconButton size="small" onClick={() => openChange(params.row)}>
							<AddIcon size={16} />
						</IconButton>
					</Tooltip>
					<Tooltip title="Correct this row">
						<IconButton size="small" onClick={() => openEdit(params.row)}>
							<EditIcon size={16} />
						</IconButton>
					</Tooltip>
					<Tooltip title="Delete">
						<IconButton size="small" color="error" onClick={() => void handleDelete(params.row)}>
							<DeleteIcon size={16} />
						</IconButton>
					</Tooltip>
				</Box>
			),
		},
		{ field: "item_grp_name", headerName: "Jute Type", flex: 1, minWidth: 150 },
		{ field: "item_name", headerName: "Item", flex: 1, minWidth: 150 },
		{ field: "base_item_name", headerName: "Base Item", flex: 1, minWidth: 150 },
		{
			field: "diff_amount",
			headerName: "Difference",
			width: 120,
			type: "number",
			valueFormatter: (v) => (v != null ? `${Number(v) > 0 ? "+" : ""}${Number(v)}` : "—"),
		},
		{ field: "effective_from", headerName: "Effective From", width: 140 },
		{
			field: "in_force",
			headerName: "Status",
			width: 120,
			renderCell: (p) => (p.value ? <Chip size="small" color="success" label="In force" /> : <Chip size="small" label="History" />),
		},
	];

	if (!mounted) return null;
	if (!coId) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select a company to continue.
			</Alert>
		);
	}

	const itemPicker = (label: string, value: JuteItem | null, onChange: (v: JuteItem | null) => void) => (
		<Autocomplete
			options={items}
			groupBy={(o) => o.item_grp_name}
			getOptionLabel={(o) => o.item_name}
			renderOption={(props, o) => (
				<li {...props} key={o.item_id}>
					{o.item_name}
				</li>
			)}
			value={value}
			onChange={(_, v) => onChange(v)}
			isOptionEqualToValue={(a, b) => a.item_id === b.item_id}
			size="small"
			renderInput={(params) => <TextField {...params} label={label} required />}
		/>
	);

	return (
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1, mb: 2 }}>
				<Box>
					<Typography variant="h5" sx={{ fontWeight: 600 }}>
						Jute Rate Difference
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Fixed rate difference of an item vs a base item (Item rate = Base rate + Difference). When the difference changes, add
						it from the new date — earlier dates keep the old difference.
					</Typography>
				</Box>
				<Button variant="contained" startIcon={<AddIcon size={18} />} onClick={openCreate}>
					New Difference
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
				getRowId={(r) => r.rate_diff_id}
				columns={columns}
				loading={loading}
				disableRowSelectionOnClick
				showToolbar
				pageSizeOptions={[25, 50, 100]}
				initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
			/>

			<Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
				<DialogTitle>{editingId ? "Correct Difference" : "New Difference"}</DialogTitle>
				<DialogContent>
					<Box sx={{ display: "grid", gap: 2, mt: 1 }}>
						{itemPicker("Item", form.item, (v) => setForm((p) => ({ ...p, item: v })))}
						{itemPicker("Base Item", form.base, (v) => setForm((p) => ({ ...p, base: v })))}
						<TextField
							type="number"
							size="small"
							label="Difference (+ / −)"
							value={form.diff}
							onChange={(e) => setForm((p) => ({ ...p, diff: e.target.value }))}
							inputProps={{ step: "any" }}
							helperText={
								form.item && form.base && diffValid
									? `${form.item.item_name} = ${form.base.item_name} ${Number(form.diff) >= 0 ? "+" : "−"} ${Math.abs(Number(form.diff))}`
									: "Negative when the item is cheaper than the base item"
							}
							required
						/>
						<TextField
							type="date"
							size="small"
							label="Effective From"
							value={form.effective_from}
							onChange={(e) => setForm((p) => ({ ...p, effective_from: e.target.value }))}
							InputLabelProps={{ shrink: true }}
							required
						/>
						{form.item && form.base && form.item.item_id === form.base.item_id ? (
							<Alert severity="warning">Item and base item must be different.</Alert>
						) : null}
					</Box>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setOpen(false)}>Cancel</Button>
					<Button variant="contained" onClick={() => void handleSave()} disabled={saveDisabled || saving}>
						{saving ? "Saving…" : "Save"}
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
}
