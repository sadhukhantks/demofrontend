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
	MenuItem,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import { Pencil as EditIcon, Plus as AddIcon, Trash2 as DeleteIcon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";

// Std Moisture (Std MR%) Master — one standard moisture-regain % per
// (company, jute-yarn item group, process). Plain CRUD: no approval workflow,
// no status lifecycle. Company-scoped only (the row has no branch_id).
//
// SAVE upserts on (co_id, item_grp_id, process), so re-saving an existing
// combination edits it instead of erroring — that is why the edit dialog leaves
// the group + process visible rather than locking the row identity down.

type ProcessOption = { code: string; label: string };

type YarnGroupOption = {
	item_grp_id: number;
	item_grp_name: string;
	co_id: number;
};

// GET std_mr_master/setup -> {data: {processes, item_groups}}.
type StdMrSetup = {
	processes: ProcessOption[];
	item_groups: YarnGroupOption[];
};

// GET std_mr_master/table -> {data: [...]}.
type StdMrRow = {
	std_mr_id: number;
	co_id: number;
	item_grp_id: number;
	item_grp_name: string;
	process: string;
	process_label: string;
	std_mr_pct: number;
	active: number;
};

type FormState = {
	item_grp_id: number | "";
	process: string;
	std_mr_pct: string;
};

const EMPTY_FORM: FormState = { item_grp_id: "", process: "", std_mr_pct: "" };

// std_mr_pct is a moisture-regain percentage: strictly between 0 and 100.
const pctValid = (v: string): boolean => {
	const n = Number(v);
	return v.trim() !== "" && Number.isFinite(n) && n > 0 && n < 100;
};

export default function StdMoistureMasterPage() {
	// HYDRATION RULE: this component reads the selected company from storage-backed
	// context, so defer render until mounted to avoid an SSR hydration mismatch.
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();

	const [setup, setSetup] = React.useState<StdMrSetup | null>(null);
	const [rows, setRows] = React.useState<StdMrRow[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	// Filters
	const [filterGroupId, setFilterGroupId] = React.useState<number | "">("");
	const [filterProcess, setFilterProcess] = React.useState("");
	const [searchInput, setSearchInput] = React.useState("");
	const [search, setSearch] = React.useState("");
	React.useEffect(() => {
		const t = setTimeout(() => setSearch(searchInput.trim()), 400);
		return () => clearTimeout(t);
	}, [searchInput]);

	// Dialog
	const [open, setOpen] = React.useState(false);
	const [editing, setEditing] = React.useState<StdMrRow | null>(null);
	const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
	const [saving, setSaving] = React.useState(false);

	React.useEffect(() => {
		if (!coId) return;
		let cancelled = false;
		void fetchWithCookie<{ data: StdMrSetup }>(
			`${apiRoutesPortalMasters.STD_MR_MASTER_SETUP}?co_id=${coId}`,
			"GET"
		).then(({ data, error: err }) => {
			if (cancelled) return;
			if (err) setError(err);
			setSetup(data?.data ?? null);
		});
		return () => {
			cancelled = true;
		};
	}, [coId]);

	const refresh = React.useCallback(async () => {
		if (!coId) return;
		setLoading(true);
		const params = new URLSearchParams({ co_id: String(coId) });
		if (filterGroupId !== "") params.set("item_grp_id", String(filterGroupId));
		if (filterProcess) params.set("process", filterProcess);
		if (search) params.set("search", search);
		const { data, error: err } = await fetchWithCookie<{ data: StdMrRow[] }>(
			`${apiRoutesPortalMasters.STD_MR_MASTER_TABLE}?${params.toString()}`,
			"GET"
		);
		setError(err);
		setRows(data?.data ?? []);
		setLoading(false);
	}, [coId, filterGroupId, filterProcess, search]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	const groups = setup?.item_groups ?? [];
	const processes = setup?.processes ?? [];

	const openCreate = () => {
		setError(null);
		setEditing(null);
		setForm(EMPTY_FORM);
		setOpen(true);
	};

	const openEdit = (row: StdMrRow) => {
		setError(null);
		setEditing(row);
		setForm({
			item_grp_id: row.item_grp_id,
			process: row.process,
			std_mr_pct: String(row.std_mr_pct),
		});
		setOpen(true);
	};

	const handleSave = async () => {
		if (!coId) return;
		if (form.item_grp_id === "") {
			setError("An item group is required.");
			return;
		}
		if (!form.process) {
			setError("A process is required.");
			return;
		}
		if (!pctValid(form.std_mr_pct)) {
			setError("Std MR % must be greater than 0 and less than 100.");
			return;
		}
		setSaving(true);
		setError(null);
		// The backend upserts on (co_id, item_grp_id, process); std_mr_id only tells
		// it which row the user started from.
		const { error: err } = await fetchWithCookie(apiRoutesPortalMasters.STD_MR_MASTER_SAVE, "POST", {
			co_id: Number(coId),
			item_grp_id: Number(form.item_grp_id),
			process: form.process,
			std_mr_pct: Number(form.std_mr_pct),
			std_mr_id: editing ? editing.std_mr_id : null,
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

	const handleDelete = async (row: StdMrRow) => {
		if (!coId) return;
		if (
			!window.confirm(
				`Delete the standard moisture for "${row.item_grp_name}" / ${row.process_label}?\n\n` +
					`That process's SQC entry page will refuse to save readings for this yarn group until a new standard is set.`
			)
		)
			return;
		setError(null);
		const { error: err } = await fetchWithCookie(apiRoutesPortalMasters.STD_MR_MASTER_DELETE, "POST", {
			co_id: Number(coId),
			std_mr_id: row.std_mr_id,
		});
		if (err) {
			setError(err);
			return;
		}
		await refresh();
	};

	const columns: GridColDef<StdMrRow>[] = [
		{
			field: "actions",
			headerName: "",
			width: 100,
			sortable: false,
			filterable: false,
			renderCell: (params) => (
				<Box>
					<Tooltip title="Edit">
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
		{ field: "item_grp_name", headerName: "Item Group", flex: 1, minWidth: 240 },
		{ field: "process_label", headerName: "Process", flex: 1, minWidth: 220 },
		{
			field: "std_mr_pct",
			headerName: "Std MR %",
			width: 130,
			type: "number",
			valueFormatter: (value) => (value != null ? Number(value).toFixed(2) : "—"),
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

	const saveDisabled = form.item_grp_id === "" || !form.process || !pctValid(form.std_mr_pct);
	const filtered = filterGroupId !== "" || filterProcess !== "" || search !== "";

	return (
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					flexWrap: "wrap",
					gap: 1,
					mb: 2,
				}}
			>
				<Box>
					<Typography variant="h5" sx={{ fontWeight: 600 }}>
						Std Moisture Master
					</Typography>
					<Typography variant="body2" color="text.secondary">
						The standard moisture regain % used to correct sliver weights, set per jute-yarn item
						group and process. Breaker Card, Inter Card, Drawhead and Finisher Drawing all read
						their Std MR% from here.
					</Typography>
				</Box>
				<Button variant="contained" startIcon={<AddIcon size={18} />} onClick={openCreate}>
					New Standard
				</Button>
			</Box>

			<Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
				<TextField
					select
					size="small"
					label="Item Group"
					value={filterGroupId}
					onChange={(e) => setFilterGroupId(e.target.value === "" ? "" : Number(e.target.value))}
					sx={{ minWidth: 240 }}
				>
					<MenuItem value="">
						<em>All</em>
					</MenuItem>
					{groups.map((g) => (
						<MenuItem key={g.item_grp_id} value={g.item_grp_id}>
							{g.item_grp_name}
						</MenuItem>
					))}
				</TextField>
				<TextField
					select
					size="small"
					label="Process"
					value={filterProcess}
					onChange={(e) => setFilterProcess(e.target.value)}
					sx={{ minWidth: 260 }}
				>
					<MenuItem value="">
						<em>All</em>
					</MenuItem>
					{processes.map((p) => (
						<MenuItem key={p.code} value={p.code}>
							{p.label}
						</MenuItem>
					))}
				</TextField>
				<TextField
					size="small"
					label="Search"
					placeholder="Item group name"
					value={searchInput}
					onChange={(e) => setSearchInput(e.target.value)}
					sx={{ minWidth: 240 }}
				/>
			</Box>

			{error ? (
				<Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
					{error}
				</Alert>
			) : null}

			{/* Empty state: spell out the consequence — the four carding/drawing SQC
			    entry pages 400 on save when their yarn group has no standard here. */}
			{!loading && rows.length === 0 ? (
				<Alert severity={filtered ? "info" : "warning"} sx={{ mb: 2 }}>
					{filtered
						? "No standards match these filters."
						: "No standard moisture has been set for this company yet. Until a standard exists for a yarn group, the Breaker Card, Inter Card, Drawhead and Finisher Drawing SQC pages cannot save readings for that group — their save will be rejected."}
				</Alert>
			) : null}

			<Box sx={{ width: "100%" }}>
				<DataGrid
					autoHeight
					rows={rows}
					getRowId={(r) => r.std_mr_id}
					columns={columns}
					loading={loading}
					density="comfortable"
					disableRowSelectionOnClick
					pageSizeOptions={[10, 25, 50]}
					initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
					sx={{ width: "100%" }}
				/>
			</Box>

			<Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
				<DialogTitle>{editing ? "Edit Standard Moisture" : "New Standard Moisture"}</DialogTitle>
				<DialogContent>
					<Box sx={{ display: "grid", gap: 2, mt: 1 }}>
						<Autocomplete
							options={groups}
							getOptionLabel={(opt) => opt.item_grp_name}
							// Display names are not unique across groups in this database —
							// key the option on item_grp_id, never on the label.
							renderOption={(props, opt) => (
								<li {...props} key={opt.item_grp_id}>
									{opt.item_grp_name}
								</li>
							)}
							value={
								form.item_grp_id === ""
									? null
									: (groups.find((g) => g.item_grp_id === form.item_grp_id) ?? null)
							}
							onChange={(_, newVal) =>
								setForm((prev) => ({ ...prev, item_grp_id: newVal ? newVal.item_grp_id : "" }))
							}
							isOptionEqualToValue={(opt, val) => opt.item_grp_id === val.item_grp_id}
							size="small"
							renderInput={(params) => (
								<TextField {...params} label="Item Group" placeholder="Jute yarn group" required />
							)}
						/>
						<TextField
							select
							size="small"
							label="Process"
							value={form.process}
							onChange={(e) => setForm((prev) => ({ ...prev, process: e.target.value }))}
							required
						>
							{processes.map((p) => (
								<MenuItem key={p.code} value={p.code}>
									{p.label}
								</MenuItem>
							))}
						</TextField>
						<TextField
							type="number"
							size="small"
							label="Std MR %"
							value={form.std_mr_pct}
							onChange={(e) => setForm((prev) => ({ ...prev, std_mr_pct: e.target.value }))}
							inputProps={{ step: "any", min: 0, max: 100 }}
							helperText="Greater than 0 and less than 100"
							required
						/>
						{editing ? (
							<Alert severity="info">
								Saving stores one standard per item group + process. Changing either field here
								writes the standard onto that other combination instead of renaming this one.
							</Alert>
						) : null}
					</Box>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setOpen(false)}>Cancel</Button>
					<Button
						variant="contained"
						onClick={() => void handleSave()}
						disabled={saveDisabled || saving}
					>
						{saving ? "Saving…" : "Save"}
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
}
