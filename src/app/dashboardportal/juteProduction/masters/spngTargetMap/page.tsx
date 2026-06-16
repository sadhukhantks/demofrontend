"use client";

import * as React from "react";
import {
	Alert,
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
import { Pencil as EditOutlinedIcon, Plus as AddIcon, Trash2 as DeleteIcon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { todayISO } from "../../spinning/utils/spinningCalc";

// --- Types -----------------------------------------------------------------

type IdType = "mcid" | "qid";
type ValueRole = "standard" | "target" | "actual";
type Param = "speed" | "tpi" | "eff" | "spindles" | "dc" | "tc";

type SetupMachine = { machine_id: number; machine_name: string | null; mech_code: string | null };
type SetupYarnItem = {
	item_id: number;
	item_code: string | null;
	item_name: string | null;
	std_count: number | null;
	std_mr_pct: number | null;
};

type SetupData = {
	machines: SetupMachine[];
	yarn_items: SetupYarnItem[];
	id_types: IdType[];
	value_roles: ValueRole[];
	params: Param[];
};

// One configured standard/target/actual value row.
type TargetMapRow = {
	spng_target_map_id: number;
	effective_date: string | null;
	ref_id: number | null;
	ref_code: string | null;
	ref_name: string | null;
	id_type: IdType;
	value_role: ValueRole;
	param: Param;
	value: number | null;
};

type FilterState = {
	id_type: IdType | "";
	ref_id: string;
	value_role: ValueRole | "";
	param: Param | "";
};

type FormState = {
	effective_date: string;
	id_type: IdType | "";
	ref_id: string;
	value_role: ValueRole | "";
	param: Param | "";
	value: string;
};

// --- Helpers ---------------------------------------------------------------

const ID_TYPE_LABELS: Record<IdType, string> = { mcid: "Machine", qid: "Yarn" };
const VALUE_ROLE_LABELS: Record<ValueRole, string> = {
	standard: "Standard",
	target: "Target",
	actual: "Actual",
};
const PARAM_LABELS: Record<Param, string> = {
	speed: "Speed",
	tpi: "TPI",
	eff: "Efficiency",
	spindles: "Spindles",
	dc: "DC",
	tc: "TC",
};

// Which params apply per type: Yarn (qid) → TPI / Eff; Machine (mcid) → Speed / Spindles / DC / TC.
const PARAMS_BY_ID_TYPE: Record<IdType, Param[]> = {
	mcid: ["speed", "spindles", "dc", "tc"],
	qid: ["tpi", "eff"],
};
const ALL_PARAMS: Param[] = ["speed", "tpi", "eff", "spindles", "dc", "tc"];

// Param options for a given type ("" = no type chosen yet, e.g. the "All" filter → show every param).
const paramsFor = (idType: IdType | ""): Param[] => (idType ? PARAMS_BY_ID_TYPE[idType] : ALL_PARAMS);

export default function SpngTargetMapPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedCompany, selectedBranches } = useSidebarContext();

	// Only branches the sidebar currently has selected, in company order.
	const branchOptions = React.useMemo(
		() => (selectedCompany?.branches ?? []).filter((b) => selectedBranches.includes(b.branch_id)),
		[selectedCompany, selectedBranches]
	);
	const singleBranchId = branchOptions.length === 1 ? branchOptions[0].branch_id : null;

	const [setup, setSetup] = React.useState<SetupData | null>(null);
	const [rows, setRows] = React.useState<TargetMapRow[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const [filters, setFilters] = React.useState<FilterState>({
		id_type: "",
		ref_id: "",
		value_role: "",
		param: "",
	});

	const [open, setOpen] = React.useState(false);
	const [editing, setEditing] = React.useState<TargetMapRow | null>(null);
	const [form, setForm] = React.useState<FormState>({
		effective_date: todayISO(),
		id_type: "",
		ref_id: "",
		value_role: "",
		param: "",
		value: "",
	});

	const branchQS = React.useMemo(
		() => (singleBranchId != null ? `&branch_id=${singleBranchId}` : ""),
		[singleBranchId]
	);

	// Load dialog dropdown options (machines, yarn items, enums) once per company/branch.
	const loadSetup = React.useCallback(async () => {
		if (!coId) return;
		const { data, error: err } = await fetchWithCookie<{ data: SetupData }>(
			`${apiRoutesPortalMasters.SPNG_TARGET_MAP_SETUP}?co_id=${coId}${branchQS}`,
			"GET"
		);
		if (err) {
			setError(err);
			return;
		}
		setSetup(data?.data ?? null);
	}, [coId, branchQS]);

	const refresh = React.useCallback(async () => {
		if (!coId) return;
		setLoading(true);
		const params = new URLSearchParams({ co_id: String(coId) });
		if (singleBranchId != null) params.set("branch_id", String(singleBranchId));
		if (filters.id_type) params.set("id_type", filters.id_type);
		if (filters.ref_id) params.set("ref_id", filters.ref_id);
		if (filters.value_role) params.set("value_role", filters.value_role);
		if (filters.param) params.set("param", filters.param);
		const { data, error: err } = await fetchWithCookie<{ data: TargetMapRow[] }>(
			`${apiRoutesPortalMasters.SPNG_TARGET_MAP_LIST}?${params.toString()}`,
			"GET"
		);
		if (err) setError(err);
		setRows(data?.data ?? []);
		setLoading(false);
	}, [coId, singleBranchId, filters]);

	React.useEffect(() => {
		void loadSetup();
	}, [loadSetup]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	// Ref options for the dialog/filter, switched by id_type.
	const refOptionsFor = React.useCallback(
		(idType: IdType | ""): { id: number; label: string }[] => {
			if (!setup || !idType) return [];
			if (idType === "mcid") {
				return setup.machines.map((m) => ({
					id: m.machine_id,
					label: `${m.mech_code ?? ""}${m.mech_code ? " — " : ""}${m.machine_name ?? m.machine_id}`,
				}));
			}
			return setup.yarn_items.map((y) => ({
				id: y.item_id,
				label: `${y.item_code ?? ""}${y.item_code ? " — " : ""}${y.item_name ?? y.item_id}`,
			}));
		},
		[setup]
	);

	const idTypeOptions = setup?.id_types ?? (["mcid", "qid"] as IdType[]);
	const valueRoleOptions = setup?.value_roles ?? (["standard", "target", "actual"] as ValueRole[]);

	const handleSave = async () => {
		if (!coId) return;
		setError(null);
		if (editing) {
			// Edit endpoint accepts effective_date/value/active only.
			const url = `${apiRoutesPortalMasters.SPNG_TARGET_MAP_EDIT}/${editing.spng_target_map_id}`;
			const { error: err } = await fetchWithCookie(url, "PUT", {
				effective_date: form.effective_date,
				value: Number(form.value),
			});
			if (err) {
				setError(err);
				return;
			}
		} else {
			const { error: err } = await fetchWithCookie(
				apiRoutesPortalMasters.SPNG_TARGET_MAP_CREATE,
				"POST",
				{
					co_id: Number(coId),
					branch_id: singleBranchId != null ? Number(singleBranchId) : null,
					effective_date: form.effective_date,
					ref_id: Number(form.ref_id),
					id_type: form.id_type,
					value_role: form.value_role,
					param: form.param,
					value: Number(form.value),
				}
			);
			if (err) {
				setError(err);
				return;
			}
		}
		setOpen(false);
		setEditing(null);
		await refresh();
	};

	const handleDelete = async (r: TargetMapRow) => {
		if (!coId) return;
		const label = r.ref_name ?? r.ref_code ?? r.ref_id ?? r.spng_target_map_id;
		if (!window.confirm(`Delete ${VALUE_ROLE_LABELS[r.value_role]} ${PARAM_LABELS[r.param]} for "${label}"?`))
			return;
		setError(null);
		const { error: err } = await fetchWithCookie(
			`${apiRoutesPortalMasters.SPNG_TARGET_MAP_DELETE}/${r.spng_target_map_id}`,
			"DELETE"
		);
		if (err) {
			setError(err);
			return;
		}
		await refresh();
	};

	const openCreate = () => {
		setEditing(null);
		setForm({
			effective_date: todayISO(),
			id_type: "",
			ref_id: "",
			value_role: "",
			param: "",
			value: "",
		});
		setOpen(true);
	};
	const openEdit = (r: TargetMapRow) => {
		setEditing(r);
		setForm({
			effective_date: r.effective_date ?? todayISO(),
			id_type: r.id_type,
			ref_id: r.ref_id != null ? String(r.ref_id) : "",
			value_role: r.value_role,
			param: r.param,
			value: r.value != null ? String(r.value) : "",
		});
		setOpen(true);
	};

	const columns: GridColDef<TargetMapRow>[] = [
		{
			field: "actions",
			headerName: "",
			width: 100,
			sortable: false,
			renderCell: (params) => (
				<Box>
					<Tooltip title="Edit">
						<IconButton size="small" onClick={() => openEdit(params.row)}>
							<EditOutlinedIcon size={16} />
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
		{
			field: "effective_date",
			headerName: "Effective Date",
			width: 130,
			valueFormatter: (value) => (value ? String(value) : "—"),
		},
		{
			field: "id_type",
			headerName: "Type",
			width: 110,
			valueFormatter: (value) => (value ? ID_TYPE_LABELS[value as IdType] ?? value : "—"),
		},
		{ field: "ref_code", headerName: "Code", width: 120, valueFormatter: (value) => value ?? "—" },
		{ field: "ref_name", headerName: "Machine / Yarn", flex: 1, minWidth: 200 },
		{
			field: "value_role",
			headerName: "Role",
			width: 120,
			valueFormatter: (value) => (value ? VALUE_ROLE_LABELS[value as ValueRole] ?? value : "—"),
		},
		{
			field: "param",
			headerName: "Parameter",
			width: 120,
			valueFormatter: (value) => (value ? PARAM_LABELS[value as Param] ?? value : "—"),
		},
		{
			field: "value",
			headerName: "Value",
			width: 120,
			type: "number",
			valueFormatter: (value) => (value != null ? Number(value).toFixed(3) : "—"),
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

	const filterRefOptions = refOptionsFor(filters.id_type);
	const formRefOptions = refOptionsFor(form.id_type);

	return (
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
				<Box>
					<Typography variant="h5" sx={{ fontWeight: 600 }}>
						Spinning Standards / Targets
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Standard, target and actual values (speed / TPI / efficiency) per machine or yarn,
						effective-dated.
					</Typography>
				</Box>
				<Button variant="contained" startIcon={<AddIcon size={18} />} onClick={openCreate}>
					New
				</Button>
			</Box>

			{error ? (
				<Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
					{error}
				</Alert>
			) : null}

			{/* Filters */}
			<Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2 }}>
				<TextField
					select
					label="Type"
					size="small"
					value={filters.id_type}
					onChange={(e) =>
						setFilters({ ...filters, id_type: e.target.value as IdType | "", ref_id: "", param: "" })
					}
					sx={{ minWidth: 150 }}
				>
					<MenuItem value="">
						<em>All</em>
					</MenuItem>
					{idTypeOptions.map((t) => (
						<MenuItem key={t} value={t}>
							{ID_TYPE_LABELS[t] ?? t}
						</MenuItem>
					))}
				</TextField>
				<TextField
					select
					label="Machine / Yarn"
					size="small"
					value={filters.ref_id}
					onChange={(e) => setFilters({ ...filters, ref_id: e.target.value })}
					disabled={!filters.id_type}
					sx={{ minWidth: 220 }}
				>
					<MenuItem value="">
						<em>All</em>
					</MenuItem>
					{filterRefOptions.map((o) => (
						<MenuItem key={o.id} value={String(o.id)}>
							{o.label}
						</MenuItem>
					))}
				</TextField>
				<TextField
					select
					label="Role"
					size="small"
					value={filters.value_role}
					onChange={(e) => setFilters({ ...filters, value_role: e.target.value as ValueRole | "" })}
					sx={{ minWidth: 150 }}
				>
					<MenuItem value="">
						<em>All</em>
					</MenuItem>
					{valueRoleOptions.map((r) => (
						<MenuItem key={r} value={r}>
							{VALUE_ROLE_LABELS[r] ?? r}
						</MenuItem>
					))}
				</TextField>
				<TextField
					select
					label="Parameter"
					size="small"
					value={filters.param}
					onChange={(e) => setFilters({ ...filters, param: e.target.value as Param | "" })}
					sx={{ minWidth: 150 }}
				>
					<MenuItem value="">
						<em>All</em>
					</MenuItem>
					{paramsFor(filters.id_type).map((p) => (
						<MenuItem key={p} value={p}>
							{PARAM_LABELS[p] ?? p}
						</MenuItem>
					))}
				</TextField>
			</Box>

			<Box sx={{ width: "100%", overflowX: "auto" }}>
				<DataGrid
					autoHeight
					rows={rows}
					getRowId={(r) => r.spng_target_map_id}
					columns={columns}
					loading={loading}
					density="comfortable"
					disableRowSelectionOnClick
					pageSizeOptions={[10, 25, 50]}
					initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
					sx={{ minWidth: 1000 }}
				/>
			</Box>

			<Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
				<DialogTitle>{editing ? "Edit Standard / Target" : "New Standard / Target"}</DialogTitle>
				<DialogContent>
					<Box sx={{ display: "grid", gap: 2, mt: 1 }}>
						<TextField
							type="date"
							label="Effective Date"
							value={form.effective_date}
							onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
							size="small"
							InputLabelProps={{ shrink: true }}
						/>
						<TextField
							select
							label="Type"
							value={form.id_type}
							onChange={(e) =>
								setForm({ ...form, id_type: e.target.value as IdType | "", ref_id: "", param: "" })
							}
							size="small"
							disabled={!!editing}
						>
							{idTypeOptions.map((t) => (
								<MenuItem key={t} value={t}>
									{ID_TYPE_LABELS[t] ?? t}
								</MenuItem>
							))}
						</TextField>
						<TextField
							select
							label={form.id_type === "qid" ? "Yarn" : "Machine"}
							value={form.ref_id}
							onChange={(e) => setForm({ ...form, ref_id: e.target.value })}
							size="small"
							disabled={!!editing || !form.id_type}
							helperText={!form.id_type ? "Select a type first" : undefined}
						>
							{formRefOptions.map((o) => (
								<MenuItem key={o.id} value={String(o.id)}>
									{o.label}
								</MenuItem>
							))}
						</TextField>
						<TextField
							select
							label="Role"
							value={form.value_role}
							onChange={(e) => setForm({ ...form, value_role: e.target.value as ValueRole | "" })}
							size="small"
							disabled={!!editing}
						>
							{valueRoleOptions.map((r) => (
								<MenuItem key={r} value={r}>
									{VALUE_ROLE_LABELS[r] ?? r}
								</MenuItem>
							))}
						</TextField>
						<TextField
							select
							label="Parameter"
							value={form.param}
							onChange={(e) => setForm({ ...form, param: e.target.value as Param | "" })}
							size="small"
							disabled={!!editing}
						>
							{paramsFor(form.id_type).map((p) => (
								<MenuItem key={p} value={p}>
									{PARAM_LABELS[p] ?? p}
								</MenuItem>
							))}
						</TextField>
						<TextField
							type="number"
							label="Value"
							inputProps={{ step: 0.001 }}
							value={form.value}
							onChange={(e) => setForm({ ...form, value: e.target.value })}
							size="small"
						/>
					</Box>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setOpen(false)}>Cancel</Button>
					<Button
						variant="contained"
						onClick={handleSave}
						disabled={
							!form.effective_date ||
							form.value === "" ||
							(!editing && (!form.id_type || !form.ref_id || !form.value_role || !form.param))
						}
					>
						Save
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
}
