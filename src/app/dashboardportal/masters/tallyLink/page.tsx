"use client";

import * as React from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Switch, TextField, Tooltip, Typography } from "@mui/material";
import { Pencil as EditIcon, Plus as AddIcon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
	createTallyLink,
	fetchTallyLinks,
	fetchTallyLinkSetup,
	updateTallyLink,
	type TallyErpOption,
	type TallyLinkRow,
	type TallyLinkSetup,
	type TallyLinkType,
} from "@/utils/tallyLinkService";

// Tally Link Master — the exact Tally name for an ERP party (ledger), raw-jute item (stock item),
// the company default godown or one of the company's export ledgers. Tally rejects imports whose
// names differ from its books; the Tally exports fall back to the ERP name (ledgers: the backend's
// ledger_defaults) when no active link exists.

const TYPE_LABELS: Record<TallyLinkType, string> = {
	PARTY: "Party (ledger)",
	ITEM: "Item (stock item)",
	GODOWN: "Godown (company default)",
	PURCHASE_LEDGER: "Ledger: Purchase",
	PURCHASE_CLAIM: "Ledger: Purchase claim",
	TDS_194Q: "Ledger: TDS 194Q",
	SALES_LEDGER: "Ledger: Sales",
	SALES_CLAIM: "Ledger: Sales claim",
	ROUND_OFF: "Ledger: Round off",
};

/** PARTY / ITEM map one ERP record; every other type is once per company (ref_id 0). */
const needsRecord = (t: TallyLinkType | null) => t === "PARTY" || t === "ITEM";

type FormState = { type: TallyLinkType | null; erp: TallyErpOption | null; tally_name: string; active: boolean };

const EMPTY_FORM: FormState = { type: null, erp: null, tally_name: "", active: true };

export default function TallyLinkMasterPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => setMounted(true), []);

	const { coId } = useSelectedCompanyCoId();
	const [setup, setSetup] = React.useState<TallyLinkSetup | null>(null);
	const [rows, setRows] = React.useState<TallyLinkRow[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [open, setOpen] = React.useState(false);
	const [editing, setEditing] = React.useState<TallyLinkRow | null>(null);
	const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
	const [saving, setSaving] = React.useState(false);

	React.useEffect(() => {
		if (!coId) return;
		void fetchTallyLinkSetup(coId).then(({ data, error: err }) => {
			if (err) setError(err);
			setSetup(data);
		});
	}, [coId]);

	const refresh = React.useCallback(async () => {
		if (!coId) return;
		setLoading(true);
		const { data, error: err } = await fetchTallyLinks(coId);
		setError(err);
		setRows(data);
		setLoading(false);
	}, [coId]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	const erpOptions = form.type === "PARTY" ? setup?.parties ?? [] : form.type === "ITEM" ? setup?.items ?? [] : [];

	const openCreate = () => {
		setError(null);
		setEditing(null);
		setForm(EMPTY_FORM);
		setOpen(true);
	};

	const openEdit = (row: TallyLinkRow) => {
		setError(null);
		setEditing(row);
		setForm({
			type: row.link_type,
			erp: { ref_id: row.ref_id, erp_name: row.erp_name ?? `#${row.ref_id}` },
			tally_name: row.tally_name,
			active: row.active === 1,
		});
		setOpen(true);
	};

	const nameValid = form.tally_name.trim() !== "" && form.tally_name.trim().length <= 255;
	const saveDisabled = !form.type || (needsRecord(form.type) && !form.erp) || !nameValid;

	const handleSave = async () => {
		if (!coId || saveDisabled || !form.type) return;
		setSaving(true);
		const { error: err } = editing
			? await updateTallyLink({ co_id: Number(coId), tally_link_id: editing.tally_link_id, tally_name: form.tally_name.trim(), active: form.active ? 1 : 0 })
			: await createTallyLink({
					co_id: Number(coId),
					link_type: form.type,
					ref_id: needsRecord(form.type) ? form.erp?.ref_id ?? null : 0,
					tally_name: form.tally_name.trim(),
				});
		setSaving(false);
		if (err) {
			setError(err);
			return;
		}
		setOpen(false);
		await refresh();
	};

	const columns: GridColDef<TallyLinkRow>[] = [
		{
			field: "actions",
			headerName: "",
			width: 60,
			sortable: false,
			filterable: false,
			renderCell: (params) => (
				<Tooltip title="Edit">
					<IconButton size="small" onClick={() => openEdit(params.row)}>
						<EditIcon size={16} />
					</IconButton>
				</Tooltip>
			),
		},
		{ field: "link_type", headerName: "Type", width: 190, valueFormatter: (v: TallyLinkType) => TYPE_LABELS[v] ?? v },
		{ field: "erp_name", headerName: "ERP Name", flex: 1, minWidth: 200 },
		{ field: "tally_name", headerName: "Tally Name", flex: 1, minWidth: 200 },
		{
			field: "active",
			headerName: "Active",
			width: 110,
			renderCell: (p) => (p.value === 1 ? <Chip size="small" color="success" label="Active" /> : <Chip size="small" label="Inactive" />),
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

	return (
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1, mb: 2 }}>
				<Box>
					<Typography variant="h5" sx={{ fontWeight: 600 }}>
						Tally Link Master
					</Typography>
					<Typography variant="body2" color="text.secondary">
						The exact name of each party ledger, stock item, the default godown and the purchase / sales / claim / TDS / round-off
						ledgers in this company&apos;s Tally books. Unmapped records go to Tally under their ERP name (ledgers under the
						standard wording).
					</Typography>
				</Box>
				<Button variant="contained" startIcon={<AddIcon size={18} />} onClick={openCreate}>
					New Link
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
				getRowId={(r) => r.tally_link_id}
				columns={columns}
				loading={loading}
				disableRowSelectionOnClick
				showToolbar
				pageSizeOptions={[25, 50, 100]}
				initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
			/>

			<Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
				<DialogTitle>{editing ? "Edit Tally Link" : "New Tally Link"}</DialogTitle>
				<DialogContent>
					<Box sx={{ display: "grid", gap: 2, mt: 1 }}>
						{error ? <Alert severity="error">{error}</Alert> : null}
						<SearchableSelect<TallyLinkType>
							variant="outlined"
							size="small"
							label="Type"
							required
							disabled={!!editing}
							options={setup?.link_types ?? []}
							value={form.type}
							onChange={(v) =>
								setForm((p) => {
									// a name still equal to the previous type's default follows the type switch
									const prevDefault = (p.type && setup?.ledger_defaults?.[p.type]) || "";
									const keep = p.tally_name && p.tally_name !== prevDefault;
									return { ...p, type: v, erp: null, tally_name: keep ? p.tally_name : (v && setup?.ledger_defaults?.[v]) || "" };
								})
							}
							getOptionLabel={(o) => TYPE_LABELS[o] ?? o}
						/>
						{needsRecord(form.type) ? (
							<SearchableSelect<TallyErpOption>
								variant="outlined"
								size="small"
								label={form.type === "PARTY" ? "Party" : "Raw-jute Item"}
								required
								disabled={!!editing}
								options={erpOptions}
								value={form.erp}
								// ponytail: prefill Tally name from the ERP name only when it is still blank
								onChange={(v) => setForm((p) => ({ ...p, erp: v, tally_name: p.tally_name || v?.erp_name || "" }))}
								getOptionLabel={(o) => (o.item_grp_name ? `${o.erp_name} (${o.item_grp_name})` : o.erp_name)}
								getOptionKey={(o) => o.ref_id}
								isOptionEqualToValue={(a, b) => a.ref_id === b.ref_id}
							/>
						) : null}
						<TextField
							size="small"
							label="Tally Name"
							value={form.tally_name}
							onChange={(e) => setForm((p) => ({ ...p, tally_name: e.target.value }))}
							inputProps={{ maxLength: 255 }}
							helperText={
								form.type && setup?.ledger_defaults?.[form.type]
									? `Exactly as in Tally. Without a link the export uses "${setup.ledger_defaults[form.type]}".`
									: "Exactly as it appears in Tally (spelling, punctuation, case)"
							}
							required
						/>
						{editing ? (
							<FormControlLabel
								control={<Switch checked={form.active} onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))} />}
								label="Active"
							/>
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
