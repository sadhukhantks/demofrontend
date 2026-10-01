"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	IconButton,
	LinearProgress,
	Switch,
	TextField,
	Tooltip,
	Typography,
	useMediaQuery,
	useTheme,
} from "@mui/material";
import { DataGrid, type GridColDef, type GridRowSelectionModel } from "@mui/x-data-grid";
import { Trash2 as RemoveIcon } from "lucide-react";
import { DIALOG_ACTIONS_SX } from "@/components/ui/responsiveEntry";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import type { NormMachine, NormMachineType } from "../_service";
import { pluralUnits } from "../_schema";
import {
	GROUP_CODE_MAX,
	GROUP_NAME_MAX,
	GROUP_REMARKS_MAX,
	UNIT_LABEL_MAX,
	UNIT_LABEL_SUGGESTIONS,
	addMembers,
	applyUnitsToSelection,
	filterCandidates,
	removeMembers,
	totalUnits,
	unitsValid,
	validateGroupForm,
	type GroupFormErrors,
	type GroupMemberForm,
	type MachineGroupForm,
} from "../_groupSchema";

export type MachineGroupDialogMode = "create" | "edit";

/**
 * Create / edit form for one machine group: header fields plus the member
 * picker (machine type + "name contains" filter, add all matching / add one,
 * units for the selection) over a members grid with checkbox selection.
 * Owns its form state (seeded from `initial` each time it opens) and hands the
 * validated form back through `onSave`; the page does the API call.
 */
export interface MachineGroupDialogProps {
	open: boolean;
	mode: MachineGroupDialogMode;
	initial: MachineGroupForm;
	/** True while the group's members are being fetched for editing. */
	loading: boolean;
	/** Every active machine of the branch (candidates). */
	machines: ReadonlyArray<NormMachine>;
	machineTypes: ReadonlyArray<NormMachineType>;
	saving: boolean;
	error: string | null;
	onClose: () => void;
	onSave: (form: MachineGroupForm) => void;
}

const EMPTY_SELECTION: GridRowSelectionModel = { type: "include", ids: new Set() };

/** Selected member ids as numbers, whichever way the grid expresses the model. */
function selectedIds(model: GridRowSelectionModel, members: ReadonlyArray<GroupMemberForm>): Set<number> {
	const ids = new Set<number>();
	for (const id of model.ids) ids.add(Number(id));
	if (model.type === "include") return ids;
	return new Set(members.map((m) => m.machine_id).filter((id) => !ids.has(id)));
}

const fmtUnits = (n: number) => String(Number(n.toFixed(3)));

export default function MachineGroupDialog({
	open,
	mode,
	initial,
	loading,
	machines,
	machineTypes,
	saving,
	error,
	onClose,
	onSave,
}: MachineGroupDialogProps) {
	const theme = useTheme();
	const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

	const [form, setForm] = React.useState<MachineGroupForm>(initial);
	const [submitted, setSubmitted] = React.useState(false);
	const [selection, setSelection] = React.useState<GridRowSelectionModel>(EMPTY_SELECTION);
	// Picker state.
	const [pickType, setPickType] = React.useState<number | "">("");
	const [pickName, setPickName] = React.useState("");
	const [pickUnits, setPickUnits] = React.useState("1");

	React.useEffect(() => {
		if (open) {
			setForm(initial);
			setSubmitted(false);
			setSelection(EMPTY_SELECTION);
			setPickType("");
			setPickName("");
			setPickUnits("1");
		}
	}, [open, initial]);

	const set = (patch: Partial<MachineGroupForm>) => setForm((f) => ({ ...f, ...patch }));
	const setMembers = (members: GroupMemberForm[]) => setForm((f) => ({ ...f, members }));

	const errors: GroupFormErrors = React.useMemo(() => (submitted ? validateGroupForm(form) : {}), [submitted, form]);

	const memberIds = React.useMemo(() => new Set(form.members.map((m) => m.machine_id)), [form.members]);
	const candidates = React.useMemo(
		() => filterCandidates(machines, { machineTypeId: pickType, nameContains: pickName, excludeIds: memberIds }),
		[machines, pickType, pickName, memberIds]
	);
	const candidateOptions = React.useMemo(
		() =>
			candidates.map((m) => ({
				value: m.machine_id,
				label: `${m.machine_name ?? `#${m.machine_id}`}${m.mech_code ? ` (${m.mech_code})` : ""}${m.machine_type_name ? ` — ${m.machine_type_name}` : ""}`,
			})),
		[candidates]
	);
	const machineTypeOptions = React.useMemo(
		() =>
			machineTypes.map((t) => ({
				value: t.machine_type_id,
				label: `${t.machine_type_name ?? `Type ${t.machine_type_id}`} (${t.machine_count})`,
			})),
		[machineTypes]
	);

	const selected = React.useMemo(() => selectedIds(selection, form.members), [selection, form.members]);
	const unitsForAdd = unitsValid(pickUnits) ? pickUnits : "1";
	const total = totalUnits(form.members);

	const addAll = () => setMembers(addMembers(form.members, candidates, unitsForAdd));
	const addOne = (id: number) => {
		const m = candidates.find((c) => c.machine_id === id);
		if (m) setMembers(addMembers(form.members, [m], unitsForAdd));
	};
	const applyUnits = () => {
		if (!unitsValid(pickUnits) || selected.size === 0) return;
		setMembers(applyUnitsToSelection(form.members, selected, pickUnits));
	};
	const removeSelected = () => {
		setMembers(removeMembers(form.members, selected));
		setSelection(EMPTY_SELECTION);
	};
	const setUnits = (machineId: number, units: string) =>
		setMembers(form.members.map((m) => (m.machine_id === machineId ? { ...m, units } : m)));

	const handleSave = () => {
		setSubmitted(true);
		if (Object.keys(validateGroupForm(form)).length > 0) return;
		onSave(form);
	};

	const columns: GridColDef<GroupMemberForm>[] = [
		{
			field: "machine_name",
			headerName: "Machine",
			flex: 1,
			minWidth: 170,
			valueGetter: (_v, row) => `${row.machine_name}${row.mech_code ? ` (${row.mech_code})` : ""}`,
		},
		{ field: "machine_type_name", headerName: "Type", width: 120 },
		{ field: "dept", headerName: "Department", width: 130 },
		{
			field: "units",
			headerName: "Units",
			width: 110,
			sortable: false,
			renderCell: (params) => (
				<TextField
					type="number"
					size="small"
					variant="standard"
					value={params.row.units}
					onChange={(e) => setUnits(params.row.machine_id, e.target.value)}
					error={submitted && !unitsValid(params.row.units)}
					inputProps={{ step: 0.5, min: 0, "aria-label": `Units for ${params.row.machine_name}` }}
					sx={{ width: 80 }}
				/>
			),
		},
		{
			field: "remove",
			headerName: "",
			width: 56,
			sortable: false,
			filterable: false,
			renderCell: (params) => (
				<Tooltip title="Remove">
					<IconButton
						size="small"
						onClick={() => setMembers(removeMembers(form.members, [params.row.machine_id]))}
						sx={{ minWidth: 40, minHeight: 40 }}
					>
						<RemoveIcon size={16} />
					</IconButton>
				</Tooltip>
			),
		},
	];

	return (
		<Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="md" fullWidth fullScreen={fullScreen}>
			<DialogTitle>{mode === "edit" ? "Edit machine group" : "New machine group"}</DialogTitle>
			<DialogContent dividers>
				{loading ? <LinearProgress sx={{ mb: 2 }} /> : null}
				<Box sx={{ display: "grid", gap: 2 }}>
					<Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 2fr" } }}>
						<TextField
							label="Group code"
							size="small"
							required
							disabled={mode === "edit"}
							value={form.group_code}
							onChange={(e) => set({ group_code: e.target.value })}
							inputProps={{ maxLength: GROUP_CODE_MAX }}
							error={!!errors.group_code}
							helperText={errors.group_code ?? (mode === "edit" ? "Fixed once created" : "e.g. HESS-LOOMS")}
						/>
						<TextField
							label="Group name"
							size="small"
							required
							value={form.group_name}
							onChange={(e) => set({ group_name: e.target.value })}
							inputProps={{ maxLength: GROUP_NAME_MAX }}
							error={!!errors.group_name}
							helperText={errors.group_name ?? "e.g. Hessian looms"}
						/>
					</Box>
					<Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 2fr" } }}>
						<Box>
							<TextField
								label="Unit label"
								size="small"
								required
								fullWidth
								value={form.unit_label}
								onChange={(e) => set({ unit_label: e.target.value })}
								inputProps={{ maxLength: UNIT_LABEL_MAX }}
								error={!!errors.unit_label}
								helperText={errors.unit_label ?? "What one unit is — a machine, a point, a spindle"}
							/>
							<Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
								{UNIT_LABEL_SUGGESTIONS.map((s) => (
									<Chip
										key={s}
										label={s}
										size="small"
										variant={form.unit_label.trim() === s ? "filled" : "outlined"}
										onClick={() => set({ unit_label: s })}
									/>
								))}
							</Box>
						</Box>
						<TextField
							label="Remarks"
							size="small"
							value={form.remarks}
							onChange={(e) => set({ remarks: e.target.value })}
							inputProps={{ maxLength: GROUP_REMARKS_MAX }}
							error={!!errors.remarks}
							helperText={errors.remarks}
						/>
					</Box>

					<Box sx={{ borderTop: 1, borderColor: "divider", pt: 2 }}>
						<Typography variant="subtitle2" sx={{ mb: 1 }}>
							Add members
						</Typography>
						<Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
							<SearchableOptionSelect
								label="Machine type"
								size="small"
								fullWidth
								placeholder="All types"
								options={machineTypeOptions}
								value={pickType}
								onChange={(v) => setPickType(v === "" ? "" : Number(v))}
							/>
							<TextField
								label="Name contains"
								size="small"
								placeholder="e.g. Hessian"
								value={pickName}
								onChange={(e) => setPickName(e.target.value)}
							/>
						</Box>
						<Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", mt: 2 }}>
							<TextField
								type="number"
								label="Units for selection"
								size="small"
								value={pickUnits}
								onChange={(e) => setPickUnits(e.target.value)}
								inputProps={{ step: 0.5, min: 0 }}
								error={!unitsValid(pickUnits)}
								helperText={unitsValid(pickUnits) ? undefined : "Greater than 0"}
								sx={{ width: 160 }}
							/>
							<Button variant="outlined" size="small" onClick={addAll} disabled={candidates.length === 0} sx={{ minHeight: 40 }}>
								Add all matching ({candidates.length})
							</Button>
							<Button
								variant="outlined"
								size="small"
								onClick={applyUnits}
								disabled={selected.size === 0 || !unitsValid(pickUnits)}
								sx={{ minHeight: 40 }}
							>
								Apply to selected ({selected.size})
							</Button>
							<Button
								variant="outlined"
								color="error"
								size="small"
								onClick={removeSelected}
								disabled={selected.size === 0}
								sx={{ minHeight: 40 }}
							>
								Remove selected
							</Button>
						</Box>
						<SearchableOptionSelect
							label="Add one machine"
							size="small"
							fullWidth
							placeholder="Type to find a machine"
							options={candidateOptions}
							value=""
							onChange={(v) => {
								if (v !== "") addOne(Number(v));
							}}
							noOptionsText={machines.length === 0 ? "No machines in this branch (or the backend is not on v2 yet)" : "No matching machine"}
							sx={{ mt: 2 }}
						/>
					</Box>

					{errors.members ? <Alert severity="error">{errors.members}</Alert> : null}
					<Box sx={{ width: "100%", overflowX: "auto" }}>
						<DataGrid
							autoHeight
							rows={form.members}
							getRowId={(r) => r.machine_id}
							columns={columns}
							density="compact"
							checkboxSelection
							disableRowSelectionOnClick
							rowSelectionModel={selection}
							onRowSelectionModelChange={(m) => setSelection(m)}
							hideFooterPagination={form.members.length <= 100}
							pageSizeOptions={[100]}
							initialState={{ pagination: { paginationModel: { pageSize: 100, page: 0 } } }}
							localeText={{ noRowsLabel: "No members yet — add machines above" }}
							sx={{ minWidth: 560 }}
						/>
					</Box>
					<Typography variant="body2" color="text.secondary">
						{form.members.length} member{form.members.length === 1 ? "" : "s"} · total units {fmtUnits(total)}{" "}
						{pluralUnits(total, form.unit_label)}
					</Typography>

					{mode === "edit" ? (
						<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
							<Typography variant="body2">Active</Typography>
							<Switch checked={form.active === 1} onChange={(e) => set({ active: e.target.checked ? 1 : 0 })} />
							{form.active !== 1 ? (
								<Typography variant="caption" color="text.secondary">
									Refused while an active norm uses this group.
								</Typography>
							) : null}
						</Box>
					) : null}
					{error ? <Alert severity="error">{error}</Alert> : null}
				</Box>
			</DialogContent>
			<DialogActions sx={DIALOG_ACTIONS_SX}>
				<Button onClick={onClose} disabled={saving}>
					Cancel
				</Button>
				<Button variant="contained" onClick={handleSave} disabled={saving || loading}>
					{saving ? "Saving..." : "Save"}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
