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
	Snackbar,
	TextField,
	Tooltip,
	Typography,
	useMediaQuery,
	useTheme,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Pencil as EditIcon, Plus as AddIcon, Trash2 as DeleteIcon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DIALOG_ACTIONS_SX, FORM_GRID_2_SX, PAGE_PADDING_SX } from "@/components/ui/responsiveEntry";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import {
	createLoomGroup,
	deleteLoomGroup,
	fetchLoomGroupDetail,
	fetchLoomGroupList,
	fetchLoomModificationSetup,
	updateLoomGroup,
	type LoomGroup,
	type LoomGroupDetail,
	type ModificationSetup,
} from "@/utils/loomModificationService";
import LoomChecklist from "../../loomModification/_components/LoomChecklist";
import type { ChecklistRow } from "../../loomModification/types/modificationTypes";
import { buildChecklistRows, EMPTY_ROWS } from "../../loomModification/types/modificationTypes";
import type { LoomGroupFormValues } from "./types/loomGroupTypes";
import {
	GROUP_PURPOSE_OPTIONS,
	buildDefaultLoomGroupFormValues,
	buildLoomGroupCreatePayload,
	buildLoomGroupEditPayload,
	deleteConfirmText,
	idsToMembers,
	loomGroupSchema,
	membersToIds,
	purposeLabel,
	toLoomGroupFormValues,
} from "./types/loomGroupTypes";

/**
 * Loom Groups master (§6.1): a weaver's set of looms, declared once and reused
 * by the modification register (STUDY) or saved as a control set (CONTROL).
 *
 * DataGrid list + a dialog that is full-screen under `sm`, because a 40-row
 * tick-list is unusable in a boxed dialog on a phone. Branch follows the sidebar
 * norm: one branch in scope -> auto, several -> a picker on the page.
 */
export default function LoomGroupMasterPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const theme = useTheme();
	const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

	const { coId } = useSelectedCompanyCoId();
	const { selectedBranches, selectedCompany } = useSidebarContext();

	// Branch resolution: one sidebar branch -> use it; several -> the user picks one.
	const sidebarBranchIds = React.useMemo(() => selectedBranches.map(Number), [selectedBranches]);
	const [pageBranchId, setPageBranchId] = React.useState<number | "">("");
	React.useEffect(() => {
		if (sidebarBranchIds.length === 1) {
			setPageBranchId(sidebarBranchIds[0]);
		} else if (sidebarBranchIds.length === 0) {
			setPageBranchId("");
		} else {
			setPageBranchId((prev) =>
				prev !== "" && sidebarBranchIds.includes(prev as number) ? prev : "",
			);
		}
	}, [sidebarBranchIds]);
	const branchId = pageBranchId === "" ? null : (pageBranchId as number);

	const branchOptions = React.useMemo(
		() =>
			(selectedCompany?.branches ?? []).filter((branch) =>
				sidebarBranchIds.includes(Number(branch.branch_id)),
			),
		[selectedCompany, sidebarBranchIds],
	);
	const selectedBranchName = branchOptions.find(
		(branch) => Number(branch.branch_id) === branchId,
	)?.branch_name;

	// ---- Data -----------------------------------------------------------------
	const [rows, setRows] = React.useState<LoomGroup[]>([]);
	const [setup, setSetup] = React.useState<ModificationSetup | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	const refresh = React.useCallback(async () => {
		if (!coId || branchId == null) {
			setRows([]);
			return;
		}
		setLoading(true);
		try {
			const list = await fetchLoomGroupList({ coId: Number(coId), branchId });
			setRows(list);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load loom groups");
			setRows([]);
		} finally {
			setLoading(false);
		}
	}, [coId, branchId]);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	// The branch's looms and lines for the tick-list (one setup call).
	React.useEffect(() => {
		if (!coId || branchId == null) {
			setSetup(null);
			return;
		}
		let cancelled = false;
		void fetchLoomModificationSetup({ coId: Number(coId), branchId })
			.then((data) => {
				if (!cancelled) setSetup(data);
			})
			.catch((err: unknown) => {
				if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load looms");
			});
		return () => {
			cancelled = true;
		};
	}, [coId, branchId]);

	// ---- Dialog ---------------------------------------------------------------
	const [open, setOpen] = React.useState(false);
	const [editing, setEditing] = React.useState<LoomGroupDetail | null>(null);
	const [saving, setSaving] = React.useState(false);
	const [saveError, setSaveError] = React.useState<string | null>(null);

	const {
		control,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<LoomGroupFormValues>({
		resolver: zodResolver(loomGroupSchema),
		defaultValues: buildDefaultLoomGroupFormValues(),
		mode: "onBlur",
	});

	// Tick-list rows: the branch's active looms plus the group's retired members
	// (shown "inactive", kept so an edit never 400s because a loom was scrapped).
	const checklistRows = React.useMemo<ReadonlyArray<ChecklistRow>>(() => {
		if (!setup) return EMPTY_ROWS;
		return buildChecklistRows({
			looms: setup.looms,
			snapshot: null,
			groupMembers: editing?.members ?? null,
			snapshotIsParent: false,
		});
	}, [editing, setup]);

	const openCreate = () => {
		setEditing(null);
		setSaveError(null);
		reset(buildDefaultLoomGroupFormValues());
		setOpen(true);
	};

	const openEdit = async (row: LoomGroup) => {
		if (!coId) return;
		setError(null);
		setLoading(true);
		try {
			const detail = await fetchLoomGroupDetail(row.loom_group_id, Number(coId));
			setEditing(detail);
			setSaveError(null);
			reset(toLoomGroupFormValues(detail));
			setOpen(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load the group");
		} finally {
			setLoading(false);
		}
	};

	const closeDialog = () => {
		if (saving) return;
		setOpen(false);
		setEditing(null);
	};

	const onSave = handleSubmit(async (values) => {
		if (!coId) return;
		setSaving(true);
		setSaveError(null);
		try {
			if (editing) {
				await updateLoomGroup(editing.loom_group_id, Number(coId), buildLoomGroupEditPayload(values, branchId));
				setSnack(`Updated group ${values.group_code.trim()}`);
			} else {
				await createLoomGroup(buildLoomGroupCreatePayload(values, Number(coId), branchId));
				setSnack(`Saved group ${values.group_code.trim()}`);
			}
			setOpen(false);
			setEditing(null);
			await refresh();
		} catch (err) {
			setSaveError(err instanceof Error ? err.message : "Failed to save the group");
		} finally {
			setSaving(false);
		}
	});

	const handleDelete = async (row: LoomGroup) => {
		if (!coId) return;
		if (typeof window !== "undefined" && !window.confirm(deleteConfirmText(row))) return;
		setError(null);
		try {
			await deleteLoomGroup(row.loom_group_id, Number(coId));
			setSnack(`Deleted group ${row.group_code}`);
			await refresh();
		} catch (err) {
			// The backend refuses with a plain message while an active event references the group.
			setError(err instanceof Error ? err.message : "Failed to delete the group");
		}
	};

	const columns: GridColDef<LoomGroup>[] = [
		{
			field: "actions",
			headerName: "",
			width: 100,
			sortable: false,
			renderCell: (params) => (
				<Box>
					<Tooltip title="Edit">
						<IconButton size="small" onClick={() => void openEdit(params.row)}>
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
		{ field: "group_code", headerName: "Code", width: 140 },
		{ field: "group_name", headerName: "Name", flex: 1, minWidth: 200 },
		{
			field: "group_purpose",
			headerName: "Purpose",
			width: 120,
			renderCell: (params) => (
				<Chip
					size="small"
					label={purposeLabel(String(params.value))}
					color={params.value === "STUDY" ? "primary" : "default"}
					variant="outlined"
				/>
			),
		},
		{ field: "member_count", headerName: "Looms", width: 100, type: "number" },
		{ field: "remarks", headerName: "Remarks", flex: 1, minWidth: 160 },
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
		<Box sx={PAGE_PADDING_SX}>
			<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: 2, flexWrap: "wrap" }}>
				<Box>
					<Typography variant="h5" sx={{ fontWeight: 600 }}>
						Loom Groups
					</Typography>
					<Typography variant="body2" color="text.secondary">
						A weaver&apos;s set of looms, declared once: Study groups are what modifications are
						entered against, Control groups are saved comparison sets.
					</Typography>
				</Box>
				<Button
					variant="contained"
					startIcon={<AddIcon size={18} />}
					onClick={openCreate}
					disabled={branchId == null || !setup}
				>
					New Group
				</Button>
			</Box>

			{sidebarBranchIds.length > 1 ? (
				<SearchableOptionSelect
					label="Branch"
					size="small"
					options={branchOptions.map((branch) => ({
						value: Number(branch.branch_id),
						label: branch.branch_name,
					}))}
					value={pageBranchId}
					onChange={(next) => setPageBranchId(next === "" ? "" : Number(next))}
					sx={{ mb: 2, minWidth: 240 }}
				/>
			) : selectedBranchName ? (
				<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
					Branch: {selectedBranchName}
				</Typography>
			) : null}

			{error ? (
				<Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
					{error}
				</Alert>
			) : null}

			{branchId == null ? (
				<Alert severity="info">Select a branch to list its loom groups.</Alert>
			) : (
				<Box sx={{ width: "100%" }}>
					<DataGrid
						autoHeight
						rows={rows}
						getRowId={(row) => row.loom_group_id}
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

			<Dialog open={open} onClose={closeDialog} fullScreen={fullScreen} fullWidth maxWidth="md">
				<Box component="form" onSubmit={onSave} sx={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
					<DialogTitle>{editing ? "Edit Loom Group" : "New Loom Group"}</DialogTitle>
					<DialogContent dividers>
						<Box sx={{ display: "grid", gap: 2, mt: 1 }}>
							{selectedBranchName ? (
								<Typography variant="body2" color="text.secondary">
									Branch: {selectedBranchName}
								</Typography>
							) : null}
							<Box sx={FORM_GRID_2_SX}>
								<Controller
									control={control}
									name="group_code"
									render={({ field }) => (
										<TextField
											{...field}
											label="Group code"
											required
											size="small"
											fullWidth
											disabled={saving}
											inputProps={{ maxLength: 50 }}
											error={Boolean(errors.group_code)}
											helperText={errors.group_code?.message}
										/>
									)}
								/>
								<Controller
									control={control}
									name="group_name"
									render={({ field }) => (
										<TextField
											{...field}
											label="Group name"
											required
											size="small"
											fullWidth
											disabled={saving}
											inputProps={{ maxLength: 100 }}
											error={Boolean(errors.group_name)}
											helperText={errors.group_name?.message}
										/>
									)}
								/>
								<Controller
									control={control}
									name="group_purpose"
									render={({ field }) => (
										<SearchableOptionSelect
											label="Purpose"
											required
											size="small"
											fullWidth
											clearable={false}
											disabled={saving}
											options={GROUP_PURPOSE_OPTIONS.map((option) => ({
												value: option.code,
												label: option.label,
											}))}
											value={field.value}
											onChange={(next) => field.onChange(next === "" ? "" : String(next))}
											error={Boolean(errors.group_purpose)}
											helperText={errors.group_purpose?.message}
										/>
									)}
								/>
								<Controller
									control={control}
									name="remarks"
									render={({ field }) => (
										<TextField
											{...field}
											label="Remarks"
											size="small"
											fullWidth
											disabled={saving}
											inputProps={{ maxLength: 500 }}
											error={Boolean(errors.remarks)}
											helperText={errors.remarks?.message}
										/>
									)}
								/>
							</Box>

							<Typography variant="subtitle2">Members</Typography>
							<Controller
								control={control}
								name="machine_ids"
								render={({ field }) => (
									<LoomChecklist
										rows={checklistRows}
										lines={setup?.lines ?? []}
										value={idsToMembers(field.value)}
										onChange={(next) => field.onChange(membersToIds(next))}
										disabled={saving || !setup}
										error={errors.machine_ids?.message ?? null}
									/>
								)}
							/>
							{saveError ? <Alert severity="error">{saveError}</Alert> : null}
						</Box>
					</DialogContent>
					<DialogActions sx={DIALOG_ACTIONS_SX}>
						<Button onClick={closeDialog} disabled={saving}>
							Cancel
						</Button>
						<Button type="submit" variant="contained" disabled={saving}>
							{saving ? "Saving…" : "Save"}
						</Button>
					</DialogActions>
				</Box>
			</Dialog>

			<Snackbar
				open={Boolean(snack)}
				autoHideDuration={3000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</Box>
	);
}
