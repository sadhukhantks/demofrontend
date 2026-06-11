"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	CircularProgress,
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

type QualityOption = {
	yarn_quality_id: number;
	quality_code: string | null;
	quality_name: string | null;
};

type ParamRow = {
	param_id: number;
	yarn_quality_id: number;
	set_name: string | null;
	speed: number | null;
	tpi: number | null;
	std_count: number | null;
	spindle: number | null;
	frame_type: string | null;
	jbo_rbo: string | null;
	subgroup_type: string | null;
	target_eff: number | null;
	active: number | null;
};

const emptyForm = {
	set_name: "",
	speed: "",
	tpi: "",
	std_count: "",
	spindle: "",
	frame_type: "",
	jbo_rbo: "",
	subgroup_type: "",
	target_eff: "",
};

export default function YarnQualityParamPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedBranches } = useSidebarContext();

	// Branch resolution: 1 sidebar branch → auto-use it; several → first selected.
	const sidebarBranchIds = React.useMemo(() => selectedBranches.map(Number), [selectedBranches]);
	const branchId = sidebarBranchIds.length > 0 ? sidebarBranchIds[0] : null;

	const [qualities, setQualities] = React.useState<QualityOption[]>([]);
	const [qualityId, setQualityId] = React.useState<number | "">("");
	const [setupLoading, setSetupLoading] = React.useState(false);

	const [rows, setRows] = React.useState<ParamRow[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const [open, setOpen] = React.useState(false);
	const [editing, setEditing] = React.useState<ParamRow | null>(null);
	const [form, setForm] = React.useState({ ...emptyForm });

	// Reuse the doff setup endpoint to populate the quality dropdown.
	React.useEffect(() => {
		if (!coId || branchId == null) return;
		let active = true;
		setSetupLoading(true);
		void (async () => {
			const { data, error: err } = await fetchWithCookie<{ data: { qualities: QualityOption[] } }>(
				`${apiRoutesPortalMasters.SPINNING_DOFF_SETUP}?co_id=${coId}&branch_id=${branchId}`,
				"GET"
			);
			if (!active) return;
			if (err) setError(err);
			setQualities(data?.data?.qualities ?? []);
			setSetupLoading(false);
		})();
		return () => {
			active = false;
		};
	}, [coId, branchId]);

	const refresh = React.useCallback(async () => {
		if (!coId || qualityId === "") {
			setRows([]);
			return;
		}
		setLoading(true);
		const { data, error: err } = await fetchWithCookie<{ data: ParamRow[] }>(
			`${apiRoutesPortalMasters.YARN_QUALITY_PARAM_LIST}?co_id=${coId}&yarn_quality_id=${qualityId}`,
			"GET"
		);
		if (err) setError(err);
		setRows(data?.data ?? []);
		setLoading(false);
	}, [coId, qualityId]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	const handleSave = async () => {
		if (!coId || qualityId === "") return;
		setError(null);
		const numOrNull = (v: string) => (v !== "" ? Number(v) : null);
		const payload = {
			set_name: form.set_name || null,
			speed: numOrNull(form.speed),
			tpi: numOrNull(form.tpi),
			std_count: numOrNull(form.std_count),
			spindle: numOrNull(form.spindle),
			frame_type: form.frame_type || null,
			jbo_rbo: form.jbo_rbo || null,
			subgroup_type: form.subgroup_type || null,
			target_eff: numOrNull(form.target_eff),
		};
		if (editing) {
			const url = `${apiRoutesPortalMasters.YARN_QUALITY_PARAM_EDIT}/${editing.param_id}?co_id=${coId}`;
			const { error: err } = await fetchWithCookie(url, "PUT", payload);
			if (err) {
				setError(err);
				return;
			}
		} else {
			const { error: err } = await fetchWithCookie(
				apiRoutesPortalMasters.YARN_QUALITY_PARAM_CREATE,
				"POST",
				{ co_id: Number(coId), yarn_quality_id: Number(qualityId), ...payload }
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

	const handleDelete = async (r: ParamRow) => {
		if (!coId) return;
		if (!window.confirm(`Delete operating-point set "${r.set_name ?? r.param_id}"?`)) return;
		setError(null);
		const { error: err } = await fetchWithCookie(
			`${apiRoutesPortalMasters.YARN_QUALITY_PARAM_DELETE}/${r.param_id}?co_id=${coId}`,
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
		setForm({ ...emptyForm });
		setOpen(true);
	};
	const openEdit = (r: ParamRow) => {
		setEditing(r);
		setForm({
			set_name: r.set_name ?? "",
			speed: r.speed != null ? String(r.speed) : "",
			tpi: r.tpi != null ? String(r.tpi) : "",
			std_count: r.std_count != null ? String(r.std_count) : "",
			spindle: r.spindle != null ? String(r.spindle) : "",
			frame_type: r.frame_type ?? "",
			jbo_rbo: r.jbo_rbo ?? "",
			subgroup_type: r.subgroup_type ?? "",
			target_eff: r.target_eff != null ? String(r.target_eff) : "",
		});
		setOpen(true);
	};

	const columns: GridColDef<ParamRow>[] = [
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
		{ field: "set_name", headerName: "Set Name", flex: 1, minWidth: 160 },
		{ field: "speed", headerName: "Speed", width: 100, type: "number" },
		{ field: "tpi", headerName: "TPI", width: 90, type: "number" },
		{ field: "std_count", headerName: "Std Count", width: 110, type: "number" },
		{ field: "spindle", headerName: "Spindle", width: 100, type: "number" },
		{ field: "frame_type", headerName: "Frame Type", width: 120 },
		{ field: "jbo_rbo", headerName: "JBO/RBO", width: 110 },
		{ field: "subgroup_type", headerName: "Subgroup", width: 120 },
		{ field: "target_eff", headerName: "Target Eff %", width: 120, type: "number" },
	];

	if (!mounted) return null;

	if (!coId) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select a company to continue.
			</Alert>
		);
	}

	if (branchId == null) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select at least one branch in the sidebar to continue.
			</Alert>
		);
	}

	return (
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
				<Box>
					<Typography variant="h5" sx={{ fontWeight: 600 }}>
						Yarn Quality Operating Parameters
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Multiple operating-point sets (speed, TPI, count, target efficiency) per yarn quality.
					</Typography>
				</Box>
				<Button
					variant="contained"
					startIcon={<AddIcon size={18} />}
					onClick={openCreate}
					disabled={qualityId === ""}
				>
					New Set
				</Button>
			</Box>

			{error ? (
				<Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
					{error}
				</Alert>
			) : null}

			<Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 2 }}>
				<TextField
					select
					size="small"
					label="Yarn Quality"
					value={qualityId}
					onChange={(e) => setQualityId(e.target.value === "" ? "" : Number(e.target.value))}
					sx={{ minWidth: 280 }}
					disabled={setupLoading}
				>
					{qualities.map((q) => (
						<MenuItem key={q.yarn_quality_id} value={q.yarn_quality_id}>
							{q.quality_code} — {q.quality_name}
						</MenuItem>
					))}
				</TextField>
				{setupLoading ? <CircularProgress size={20} /> : null}
			</Box>

			{qualityId === "" ? (
				<Alert severity="info">Select a yarn quality to view its operating-point sets.</Alert>
			) : (
				<Box sx={{ width: "100%", overflowX: "auto" }}>
					<DataGrid
						autoHeight
						rows={rows}
						getRowId={(r) => r.param_id}
						columns={columns}
						loading={loading}
						density="comfortable"
						disableRowSelectionOnClick
						pageSizeOptions={[10, 25, 50]}
						initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
						sx={{ minWidth: 1000 }}
					/>
				</Box>
			)}

			<Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
				<DialogTitle>{editing ? "Edit Operating-Point Set" : "New Operating-Point Set"}</DialogTitle>
				<DialogContent>
					<Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, mt: 1 }}>
						<TextField
							label="Set Name"
							value={form.set_name}
							onChange={(e) => setForm({ ...form, set_name: e.target.value })}
							size="small"
							sx={{ gridColumn: { sm: "1 / -1" } }}
							inputProps={{ maxLength: 100 }}
						/>
						<TextField
							type="number"
							label="Speed"
							inputProps={{ step: "any", min: 0 }}
							value={form.speed}
							onChange={(e) => setForm({ ...form, speed: e.target.value })}
							size="small"
						/>
						<TextField
							type="number"
							label="TPI"
							inputProps={{ step: "any", min: 0 }}
							value={form.tpi}
							onChange={(e) => setForm({ ...form, tpi: e.target.value })}
							size="small"
						/>
						<TextField
							type="number"
							label="Std Count"
							inputProps={{ step: "any", min: 0 }}
							value={form.std_count}
							onChange={(e) => setForm({ ...form, std_count: e.target.value })}
							size="small"
						/>
						<TextField
							type="number"
							label="Spindle"
							inputProps={{ step: 1, min: 0 }}
							value={form.spindle}
							onChange={(e) => setForm({ ...form, spindle: e.target.value })}
							size="small"
						/>
						<TextField
							label="Frame Type"
							value={form.frame_type}
							onChange={(e) => setForm({ ...form, frame_type: e.target.value })}
							size="small"
							inputProps={{ maxLength: 50 }}
						/>
						<TextField
							label="JBO / RBO"
							value={form.jbo_rbo}
							onChange={(e) => setForm({ ...form, jbo_rbo: e.target.value })}
							size="small"
							inputProps={{ maxLength: 50 }}
						/>
						<TextField
							label="Subgroup Type"
							value={form.subgroup_type}
							onChange={(e) => setForm({ ...form, subgroup_type: e.target.value })}
							size="small"
							inputProps={{ maxLength: 50 }}
						/>
						<TextField
							type="number"
							label="Target Eff %"
							inputProps={{ step: "any", min: 0 }}
							value={form.target_eff}
							onChange={(e) => setForm({ ...form, target_eff: e.target.value })}
							size="small"
						/>
					</Box>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setOpen(false)}>Cancel</Button>
					<Button variant="contained" onClick={handleSave} disabled={!form.set_name}>
						Save
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
}
