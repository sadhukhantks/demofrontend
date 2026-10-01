"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	Chip,
	FormControlLabel,
	IconButton,
	Switch,
	Tab,
	Tabs,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import { CopyPlus as RevisionIcon, Pencil as EditOutlinedIcon, Plus as AddIcon } from "lucide-react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { usePathname } from "next/navigation";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { todayISO } from "../../spinning/utils/spinningCalc";
import {
	createHandsNorm,
	createMachineGroup,
	fetchHandsNorms,
	fetchHandsNormsSetup,
	fetchMachineGroup,
	fetchMachineGroups,
	updateHandsNorm,
	updateMachineGroup,
	type HandsNormRow,
	type MachineGroupRow,
	type NormDepartment,
	type NormDesignation,
	type NormMachine,
	type NormMachineType,
} from "./_service";
import {
	NORM_KIND_LABELS,
	describePerHand,
	describeTarget,
	emptyForm,
	formFromRow,
	rowKind,
	toPayload,
	validateHandsNormForm,
	type HandsNormForm,
} from "./_schema";
import {
	emptyGroupForm,
	groupFormFromDetail,
	toGroupCreatePayload,
	toGroupEditPayload,
	type MachineGroupForm,
} from "./_groupSchema";
import HandsNormDialog, { type HandsNormDialogMode } from "./_components/HandsNormDialog";
import MachineGroupDialog, { type MachineGroupDialogMode } from "./_components/MachineGroupDialog";

const EMPTY_DESIGNATIONS: ReadonlyArray<NormDesignation> = Object.freeze([]);
const EMPTY_MACHINE_TYPES: ReadonlyArray<NormMachineType> = Object.freeze([]);
const EMPTY_GROUPS: ReadonlyArray<MachineGroupRow> = Object.freeze([]);
const EMPTY_MACHINES: ReadonlyArray<NormMachine> = Object.freeze([]);
const EMPTY_DEPARTMENTS: ReadonlyArray<NormDepartment> = Object.freeze([]);

type PageTab = "norms" | "groups";
type RowStatus = "in_force" | "future" | "superseded" | "retired";

function rowStatus(r: HandsNormRow, today: string): RowStatus {
	if (!r.active) return "retired";
	if (r.in_force) return "in_force";
	return r.effective_date > today ? "future" : "superseded";
}

const STATUS_CHIP: Record<RowStatus, { label: string; color: "success" | "info" | "default" }> = {
	in_force: { label: "In force", color: "success" },
	future: { label: "Future", color: "info" },
	superseded: { label: "Superseded", color: "default" },
	retired: { label: "Retired", color: "default" },
};

const fmtUnits = (n: number | null | undefined) => (n == null ? "" : String(Number(Number(n).toFixed(3))));

/**
 * Hands Norms master (TKT-000202, v2 2026-09-30): the man-machine norms the
 * Hands Report compares actual attendance hands against — per designation a
 * fixed number of hands per shift, units of machines that ran ÷ units per
 * hand, production ÷ qty per hand, no norm, or as actual. Machine-based and
 * production norms are scoped to a machine group (second tab), a machine type
 * or a department. Effective-dated: "New revision" starts a changed norm from
 * a date without rewriting the one earlier reports used.
 */
export default function HandsNormsPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedBranches, selectedCompany, hasMenuAccess } = useSidebarContext();
	const pathname = usePathname();
	const canCreate = hasMenuAccess(pathname, "create");
	const canEdit = hasMenuAccess(pathname, "edit");
	const viewOnly = !canCreate && !canEdit;

	// Branch resolution (sidebar norm): 1 branch -> use it; several -> pick one.
	const sidebarBranchIds = React.useMemo(() => selectedBranches.map(Number), [selectedBranches]);
	const [pageBranchId, setPageBranchId] = React.useState<number | "">("");
	React.useEffect(() => {
		if (sidebarBranchIds.length === 1) {
			setPageBranchId(sidebarBranchIds[0]);
		} else if (sidebarBranchIds.length === 0) {
			setPageBranchId("");
		} else {
			setPageBranchId((prev) => (prev !== "" && sidebarBranchIds.includes(prev) ? prev : ""));
		}
	}, [sidebarBranchIds]);
	const branchId = pageBranchId === "" ? null : pageBranchId;
	const branchOptions = React.useMemo(
		() => (selectedCompany?.branches ?? []).filter((b) => sidebarBranchIds.includes(Number(b.branch_id))),
		[selectedCompany, sidebarBranchIds]
	);
	const selectedBranchName = branchOptions.find((b) => Number(b.branch_id) === branchId)?.branch_name;

	const [tab, setTab] = React.useState<PageTab>("norms");

	// ---- setup shared by both tabs ----
	const [designations, setDesignations] = React.useState<ReadonlyArray<NormDesignation>>(EMPTY_DESIGNATIONS);
	const [machineTypes, setMachineTypes] = React.useState<ReadonlyArray<NormMachineType>>(EMPTY_MACHINE_TYPES);
	const [setupGroups, setSetupGroups] = React.useState<ReadonlyArray<MachineGroupRow>>(EMPTY_GROUPS);
	const [machines, setMachines] = React.useState<ReadonlyArray<NormMachine>>(EMPTY_MACHINES);
	const [departments, setDepartments] = React.useState<ReadonlyArray<NormDepartment>>(EMPTY_DEPARTMENTS);

	const refreshSetup = React.useCallback(async (): Promise<string | null> => {
		if (!coId || branchId == null) {
			setDesignations(EMPTY_DESIGNATIONS);
			setMachineTypes(EMPTY_MACHINE_TYPES);
			setSetupGroups(EMPTY_GROUPS);
			setMachines(EMPTY_MACHINES);
			setDepartments(EMPTY_DEPARTMENTS);
			return null;
		}
		const setup = await fetchHandsNormsSetup(coId, branchId);
		// A pre-v2 backend sends no groups / machines / departments: treat as empty.
		setDesignations(setup.data?.designations ?? EMPTY_DESIGNATIONS);
		setMachineTypes(setup.data?.machine_types ?? EMPTY_MACHINE_TYPES);
		setSetupGroups(setup.data?.machine_groups ?? EMPTY_GROUPS);
		setMachines(setup.data?.machines ?? EMPTY_MACHINES);
		setDepartments(setup.data?.departments ?? EMPTY_DEPARTMENTS);
		return setup.error;
	}, [coId, branchId]);

	// ---- norms tab ----
	const [rows, setRows] = React.useState<HandsNormRow[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [loadError, setLoadError] = React.useState<string | null>(null);
	const [includeInactive, setIncludeInactive] = React.useState(false);
	const [search, setSearch] = React.useState("");
	const [onlyUnlinked, setOnlyUnlinked] = React.useState(false);

	const [dialogOpen, setDialogOpen] = React.useState(false);
	const [mode, setMode] = React.useState<HandsNormDialogMode>("create");
	const [editing, setEditing] = React.useState<HandsNormRow | null>(null);
	const [form, setForm] = React.useState<HandsNormForm>(() => emptyForm(todayISO()));
	const [submitted, setSubmitted] = React.useState(false);
	const [saving, setSaving] = React.useState(false);
	const [saveError, setSaveError] = React.useState<string | null>(null);

	const refresh = React.useCallback(async () => {
		if (!coId || branchId == null) {
			setRows([]);
			await refreshSetup();
			return;
		}
		setLoading(true);
		const [list, setupError] = await Promise.all([fetchHandsNorms(coId, branchId, includeInactive), refreshSetup()]);
		setLoadError(list.error ?? setupError);
		setRows(list.data ?? []);
		setLoading(false);
	}, [coId, branchId, includeInactive, refreshSetup]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	const today = todayISO();
	const unlinkedCount = React.useMemo(() => rows.filter((r) => r.active && !r.computable).length, [rows]);
	const duplicateCount = React.useMemo(
		() => new Set(rows.filter((r) => r.duplicate).map((r) => r.designation_id)).size,
		[rows]
	);

	const visibleRows = React.useMemo(() => {
		const q = search.trim().toLowerCase();
		return rows.filter((r) => {
			if (onlyUnlinked && (r.computable || !r.active)) return false;
			if (!q) return true;
			return [r.designation, r.dept, r.norms_text, r.machine_type_name, r.machine_group, r.scope_dept, NORM_KIND_LABELS[rowKind(r)]]
				.filter(Boolean)
				.some((s) => String(s).toLowerCase().includes(q));
		});
	}, [rows, search, onlyUnlinked]);

	const errors = React.useMemo(() => (submitted ? validateHandsNormForm(form) : {}), [submitted, form]);

	const openDialog = (nextMode: HandsNormDialogMode, row: HandsNormRow | null) => {
		setMode(nextMode);
		setEditing(row);
		setForm(row == null ? emptyForm(today) : formFromRow(row, nextMode === "revision" ? today : undefined));
		setSubmitted(false);
		setSaveError(null);
		setDialogOpen(true);
	};

	const handleSave = async () => {
		if (!coId || branchId == null) return;
		setSubmitted(true);
		if (Object.keys(validateHandsNormForm(form)).length > 0) return;
		setSaving(true);
		setSaveError(null);
		const payload = toPayload(form);
		const { error } =
			mode === "edit" && editing
				? await updateHandsNorm(coId, editing.hands_norm_id, { ...payload, active: form.active })
				: await createHandsNorm({
						...payload,
						co_id: Number(coId),
						branch_id: branchId,
						designation_id: Number(form.designation_id),
					});
		setSaving(false);
		if (error) {
			setSaveError(error);
			return;
		}
		setDialogOpen(false);
		await refresh();
	};

	// ---- machine groups tab ----
	const [groups, setGroups] = React.useState<MachineGroupRow[]>([]);
	const [groupsLoading, setGroupsLoading] = React.useState(false);
	const [groupsError, setGroupsError] = React.useState<string | null>(null);
	const [groupsIncludeInactive, setGroupsIncludeInactive] = React.useState(false);
	const [groupSearch, setGroupSearch] = React.useState("");

	const [groupDialogOpen, setGroupDialogOpen] = React.useState(false);
	const [groupMode, setGroupMode] = React.useState<MachineGroupDialogMode>("create");
	const [groupEditing, setGroupEditing] = React.useState<MachineGroupRow | null>(null);
	const [groupInitial, setGroupInitial] = React.useState<MachineGroupForm>(() => emptyGroupForm());
	const [groupLoading, setGroupLoading] = React.useState(false);
	const [groupSaving, setGroupSaving] = React.useState(false);
	const [groupError, setGroupError] = React.useState<string | null>(null);

	const refreshGroups = React.useCallback(async () => {
		if (!coId || branchId == null) {
			setGroups([]);
			return;
		}
		setGroupsLoading(true);
		const list = await fetchMachineGroups(coId, branchId, groupsIncludeInactive);
		setGroupsError(list.error);
		setGroups(list.data ?? []);
		setGroupsLoading(false);
	}, [coId, branchId, groupsIncludeInactive]);

	React.useEffect(() => {
		if (tab === "groups") void refreshGroups();
	}, [tab, refreshGroups]);

	const visibleGroups = React.useMemo(() => {
		const q = groupSearch.trim().toLowerCase();
		if (!q) return groups;
		return groups.filter((g) =>
			[g.group_code, g.group_name, g.unit_label, g.remarks].filter(Boolean).some((s) => String(s).toLowerCase().includes(q))
		);
	}, [groups, groupSearch]);

	const openGroupDialog = async (nextMode: MachineGroupDialogMode, row: MachineGroupRow | null) => {
		setGroupMode(nextMode);
		setGroupEditing(row);
		setGroupError(null);
		setGroupInitial(emptyGroupForm());
		setGroupDialogOpen(true);
		if (nextMode === "edit" && row && coId) {
			setGroupLoading(true);
			const detail = await fetchMachineGroup(coId, row.machine_group_id);
			setGroupLoading(false);
			if (detail.error || !detail.data) {
				setGroupError(detail.error ?? "Could not load the group");
				return;
			}
			setGroupInitial(groupFormFromDetail(detail.data));
		}
	};

	const handleGroupSave = async (groupForm: MachineGroupForm) => {
		if (!coId || branchId == null) return;
		setGroupSaving(true);
		setGroupError(null);
		const { error } =
			groupMode === "edit" && groupEditing
				? await updateMachineGroup(coId, groupEditing.machine_group_id, toGroupEditPayload(groupForm))
				: await createMachineGroup(toGroupCreatePayload(groupForm, Number(coId), branchId));
		setGroupSaving(false);
		if (error) {
			setGroupError(error);
			return;
		}
		setGroupDialogOpen(false);
		// Member counts / unit totals feed the norm dialog's group labels too.
		await Promise.all([refreshGroups(), refreshSetup()]);
	};

	// ---- columns ----
	const actionCol: GridColDef<HandsNormRow> = {
		field: "actions",
		headerName: "",
		width: 96,
		sortable: false,
		filterable: false,
		renderCell: (params) => (
			<Box sx={{ display: "flex" }}>
				<Tooltip title="Edit">
					<IconButton size="small" onClick={() => openDialog("edit", params.row)} sx={{ minWidth: 40, minHeight: 40 }}>
						<EditOutlinedIcon size={16} />
					</IconButton>
				</Tooltip>
				<Tooltip title="New revision from a date">
					<IconButton size="small" onClick={() => openDialog("revision", params.row)} sx={{ minWidth: 40, minHeight: 40 }}>
						<RevisionIcon size={16} />
					</IconButton>
				</Tooltip>
			</Box>
		),
	};

	const columns: GridColDef<HandsNormRow>[] = [
		...(canEdit ? [actionCol] : []),
		{ field: "dept", headerName: "Department", width: 150 },
		{ field: "designation", headerName: "Designation", flex: 1, minWidth: 200 },
		{ field: "direct_indirect", headerName: "D/I", width: 60 },
		{
			field: "norm_kind",
			headerName: "Kind",
			width: 110,
			valueGetter: (_value, row) => NORM_KIND_LABELS[rowKind(row)],
		},
		{
			field: "target",
			headerName: "Target",
			width: 260,
			sortable: false,
			valueGetter: (_value, row) => describeTarget(row),
			renderCell: (params) =>
				!params.row.computable ? (
					<Typography variant="body2" color="warning.main">
						{params.value}
					</Typography>
				) : (
					params.value
				),
		},
		{
			field: "per_hand",
			headerName: "Per hand",
			width: 150,
			sortable: false,
			valueGetter: (_value, row) => describePerHand(row),
		},
		{ field: "norms_text", headerName: "Norms text", width: 180 },
		{ field: "effective_date", headerName: "Effective from", width: 120 },
		{
			field: "status",
			headerName: "Status",
			width: 150,
			sortable: false,
			valueGetter: (_value, row) => rowStatus(row, today),
			renderCell: (params) => {
				const s = STATUS_CHIP[params.value as RowStatus];
				return (
					<Box sx={{ display: "flex", gap: 0.5, alignItems: "center", height: "100%" }}>
						<Chip size="small" label={s.label} color={s.color} variant={params.value === "retired" ? "outlined" : "filled"} />
						{params.row.duplicate ? (
							<Tooltip title="Another active row has the same designation and effective date — the report uses the newest. Retire one.">
								<Chip size="small" label="Duplicate" color="warning" variant="outlined" />
							</Tooltip>
						) : null}
					</Box>
				);
			},
		},
	];

	const groupActionCol: GridColDef<MachineGroupRow> = {
		field: "actions",
		headerName: "",
		width: 56,
		sortable: false,
		filterable: false,
		renderCell: (params) => (
			<Tooltip title="Edit group and members">
				<IconButton size="small" onClick={() => void openGroupDialog("edit", params.row)} sx={{ minWidth: 40, minHeight: 40 }}>
					<EditOutlinedIcon size={16} />
				</IconButton>
			</Tooltip>
		),
	};

	const groupColumns: GridColDef<MachineGroupRow>[] = [
		...(canEdit ? [groupActionCol] : []),
		{ field: "group_code", headerName: "Code", width: 120 },
		{ field: "group_name", headerName: "Name", flex: 1, minWidth: 180 },
		{ field: "unit_label", headerName: "Unit", width: 100 },
		{ field: "member_count", headerName: "Members", width: 100, type: "number" },
		{
			field: "total_units",
			headerName: "Total units",
			width: 110,
			type: "number",
			valueFormatter: (value: number | null) => fmtUnits(value),
		},
		{ field: "norms_using", headerName: "Norms using", width: 110, type: "number" },
		{
			field: "active",
			headerName: "Status",
			width: 100,
			renderCell: (params) =>
				params.row.active ? (
					<Chip size="small" label="Active" color="success" />
				) : (
					<Chip size="small" label="Retired" variant="outlined" />
				),
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
	if (sidebarBranchIds.length === 0) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select at least one branch in the sidebar to continue.
			</Alert>
		);
	}

	return (
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2, mb: 2, flexWrap: "wrap" }}>
				<Box sx={{ minWidth: 0, flex: "1 1 320px" }}>
					<Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
						<Typography variant="h5" sx={{ fontWeight: 600 }}>
							Hands Norms (Man-Machine)
						</Typography>
						{viewOnly ? <Chip size="small" label="View only" variant="outlined" /> : null}
					</Box>
					<Typography variant="body2" color="text.secondary">
						Target hands per designation used by the Hands Report — fixed per shift, units of machines that ran ÷ units
						per hand, production ÷ qty per hand, no norm, or as actual.
					</Typography>
				</Box>
				{canCreate ? (
					tab === "norms" ? (
						<Button
							variant="contained"
							startIcon={<AddIcon size={18} />}
							onClick={() => openDialog("create", null)}
							disabled={branchId == null}
						>
							New
						</Button>
					) : (
						<Button
							variant="contained"
							startIcon={<AddIcon size={18} />}
							onClick={() => void openGroupDialog("create", null)}
							disabled={branchId == null}
						>
							New group
						</Button>
					)
				) : null}
			</Box>

			{sidebarBranchIds.length > 1 ? (
				<SearchableOptionSelect
					label="Branch"
					size="small"
					options={branchOptions.map((b) => ({ value: Number(b.branch_id), label: b.branch_name }))}
					value={pageBranchId}
					onChange={(v) => setPageBranchId(v === "" ? "" : Number(v))}
					sx={{ mb: 2, minWidth: 240 }}
				/>
			) : selectedBranchName ? (
				<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
					Branch: {selectedBranchName}
				</Typography>
			) : null}

			<Tabs
				value={tab}
				onChange={(_e, v: PageTab) => setTab(v)}
				variant="scrollable"
				allowScrollButtonsMobile
				sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
			>
				<Tab value="norms" label="Norms" />
				<Tab value="groups" label={`Machine groups${setupGroups.length ? ` (${setupGroups.length})` : ""}`} />
			</Tabs>

			{branchId == null ? (
				<Alert severity="info" sx={{ mb: 2 }}>
					Select a branch to load its hands norms.
				</Alert>
			) : null}

			{tab === "norms" ? (
				<>
					{loadError ? (
						<Alert severity="error" sx={{ mb: 2 }}>
							{loadError}
						</Alert>
					) : null}
					{unlinkedCount > 0 ? (
						<Alert
							severity="warning"
							sx={{ mb: 2 }}
							action={
								<Button color="inherit" size="small" onClick={() => setOnlyUnlinked((v) => !v)}>
									{onlyUnlinked ? "Show all" : "Show them"}
								</Button>
							}
						>
							{unlinkedCount === 1
								? "1 machine / production norm has no scope or rate, so the Hands Report cannot compute its target."
								: `${unlinkedCount} machine / production norms have no scope or rate, so the Hands Report cannot compute their targets.`}{" "}
							Edit each to pick a machine group, machine type or department and the rate, or switch it to Fixed / No norm.
						</Alert>
					) : null}
					{duplicateCount > 0 ? (
						<Alert severity="warning" sx={{ mb: 2 }}>
							{duplicateCount} designation{duplicateCount === 1 ? " has" : "s have"} two active rows with the same effective
							date (marked Duplicate). The report uses the newest one; retire the other.
						</Alert>
					) : null}

					<Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
						<TextField
							size="small"
							label="Search"
							placeholder="Designation, department, group, machine type, kind, norms text"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							sx={{ flex: "1 1 260px", maxWidth: 420 }}
						/>
						<FormControlLabel
							control={<Switch checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />}
							label="Show retired"
						/>
					</Box>

					<Box sx={{ width: "100%", overflowX: "auto" }}>
						<DataGrid
							autoHeight
							rows={visibleRows}
							getRowId={(r) => r.hands_norm_id}
							columns={columns}
							loading={loading}
							density="compact"
							disableRowSelectionOnClick
							pageSizeOptions={[25, 50, 100]}
							initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
							sx={{ width: "100%" }}
						/>
					</Box>

					<HandsNormDialog
						open={dialogOpen}
						mode={mode}
						form={form}
						onChange={setForm}
						errors={errors}
						designations={designations}
						machineTypes={machineTypes}
						machineGroups={setupGroups}
						departments={departments}
						branchId={branchId}
						saving={saving}
						error={saveError}
						onClose={() => setDialogOpen(false)}
						onSave={() => void handleSave()}
					/>
				</>
			) : (
				<>
					{groupsError ? (
						<Alert severity="error" sx={{ mb: 2 }}>
							{groupsError}
						</Alert>
					) : null}
					<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
						A group is a set of this branch&apos;s machines with a unit weight each (a loom 1, a drawing frame 10 points, a
						heavy spinning frame 2). A machine may be in several groups. Machine-based norms divide the units of the
						members that ran in the shift by units per hand.
					</Typography>
					<Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
						<TextField
							size="small"
							label="Search"
							placeholder="Code, name, unit label"
							value={groupSearch}
							onChange={(e) => setGroupSearch(e.target.value)}
							sx={{ flex: "1 1 260px", maxWidth: 420 }}
						/>
						<FormControlLabel
							control={
								<Switch checked={groupsIncludeInactive} onChange={(e) => setGroupsIncludeInactive(e.target.checked)} />
							}
							label="Show retired"
						/>
					</Box>
					<Box sx={{ width: "100%", overflowX: "auto" }}>
						<DataGrid
							autoHeight
							rows={visibleGroups}
							getRowId={(r) => r.machine_group_id}
							columns={groupColumns}
							loading={groupsLoading}
							density="compact"
							disableRowSelectionOnClick
							pageSizeOptions={[25, 50, 100]}
							initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
							localeText={{ noRowsLabel: canCreate ? "No machine groups yet — use New group" : "No machine groups yet" }}
							sx={{ width: "100%" }}
						/>
					</Box>

					<MachineGroupDialog
						open={groupDialogOpen}
						mode={groupMode}
						initial={groupInitial}
						loading={groupLoading}
						machines={machines}
						machineTypes={machineTypes}
						saving={groupSaving}
						error={groupError}
						onClose={() => setGroupDialogOpen(false)}
						onSave={(f) => void handleGroupSave(f)}
					/>
				</>
			)}
		</Box>
	);
}
