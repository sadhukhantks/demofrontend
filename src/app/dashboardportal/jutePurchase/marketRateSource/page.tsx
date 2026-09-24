"use client";

import * as React from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Tooltip, Typography } from "@mui/material";
import { Pencil as EditIcon, Plus as AddIcon, Trash2 as DeleteIcon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";

// Market Rate Source Master — where a jute market rate was quoted (e.g. JBA, a broker).
// Company-scoped plain CRUD. The Jute Market Rate page stores one rate set per source per day.

type SourceRow = { source_id: number; source_name: string };

export default function MarketRateSourcePage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => setMounted(true), []);

	const { coId } = useSelectedCompanyCoId();
	const [rows, setRows] = React.useState<SourceRow[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [open, setOpen] = React.useState(false);
	const [editing, setEditing] = React.useState<SourceRow | null>(null);
	const [name, setName] = React.useState("");
	const [saving, setSaving] = React.useState(false);

	const refresh = React.useCallback(async () => {
		if (!coId) return;
		setLoading(true);
		const { data, error: err } = await fetchWithCookie<{ data: { sources: SourceRow[] } }>(
			`${apiRoutesPortalMasters.JUTE_MARKET_RATE_SETUP}?co_id=${coId}`,
			"GET"
		);
		setError(err);
		setRows(data?.data?.sources ?? []);
		setLoading(false);
	}, [coId]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	const openDialog = (row: SourceRow | null) => {
		setError(null);
		setEditing(row);
		setName(row?.source_name ?? "");
		setOpen(true);
	};

	const handleSave = async () => {
		if (!coId || !name.trim()) return;
		setSaving(true);
		const { error: err } = await fetchWithCookie(apiRoutesPortalMasters.JUTE_MARKET_RATE_SOURCE_SAVE, "POST", {
			co_id: Number(coId),
			source_name: name.trim(),
			source_id: editing?.source_id ?? null,
		});
		setSaving(false);
		if (err) {
			setError(err);
			return;
		}
		setOpen(false);
		await refresh();
	};

	const handleDelete = async (row: SourceRow) => {
		if (!coId || !window.confirm(`Delete source "${row.source_name}"?\n\nRates already saved under it are kept.`)) return;
		const { error: err } = await fetchWithCookie(apiRoutesPortalMasters.JUTE_MARKET_RATE_SOURCE_DELETE, "POST", {
			co_id: Number(coId),
			source_id: row.source_id,
		});
		if (err) setError(err);
		await refresh();
	};

	const columns: GridColDef<SourceRow>[] = [
		{
			field: "actions",
			headerName: "",
			width: 100,
			sortable: false,
			filterable: false,
			renderCell: (params) => (
				<Box>
					<Tooltip title="Edit">
						<IconButton size="small" onClick={() => openDialog(params.row)}>
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
		{ field: "source_name", headerName: "Source", flex: 1, minWidth: 240 },
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
						Market Rate Source
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Where jute market rates are quoted from. Each source gets its own optional rate set per day on the Jute Market Rate page.
					</Typography>
				</Box>
				<Button variant="contained" startIcon={<AddIcon size={18} />} onClick={() => openDialog(null)}>
					New Source
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
				getRowId={(r) => r.source_id}
				columns={columns}
				loading={loading}
				disableRowSelectionOnClick
				pageSizeOptions={[10, 25, 50]}
				initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
			/>

			<Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
				<DialogTitle>{editing ? "Edit Source" : "New Source"}</DialogTitle>
				<DialogContent>
					<TextField
						autoFocus
						fullWidth
						size="small"
						label="Source name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						inputProps={{ maxLength: 100 }}
						sx={{ mt: 1 }}
						required
					/>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setOpen(false)}>Cancel</Button>
					<Button variant="contained" onClick={() => void handleSave()} disabled={!name.trim() || saving}>
						{saving ? "Saving…" : "Save"}
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
}
