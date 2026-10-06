"use client";

import * as React from "react";
import { Alert, Box, CircularProgress, Divider, Snackbar, TextField, Typography } from "@mui/material";
import { PAGE_PADDING_SX } from "@/components/ui/responsiveEntry";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import {
	addModificationMembers,
	createModification,
	fetchLoomGroupDetail,
	fetchModificationById,
	insertEarlierStage,
	updateModification,
	type LoomGroupMember,
	type ModificationDetail,
	type ModificationMember,
	type ModificationRow,
} from "@/utils/loomModificationService";
import AddLoomsDialog from "./_components/AddLoomsDialog";
import ModificationEntryForm, {
	type EventSnapshot,
	type ModificationFormMode,
} from "./_components/ModificationEntryForm";
import ModificationGrid from "./_components/ModificationGrid";
import { useModificationSetup } from "./hooks/useModificationSetup";
import { useModificationTable, type ModificationTableFilters } from "./hooks/useModificationTable";
import type { ChecklistMember, ChecklistRow, ModificationFormValues } from "./types/modificationTypes";
import {
	EMPTY_MEMBERS,
	EMPTY_ROWS,
	FALLBACK_MOD_KINDS,
	buildFollowUpFormValues,
	buildInsertEarlierFormValues,
	buildModificationPayload,
	formatSaveMessage,
	loomLabel,
	rowHasChildren,
	toChecklistMembers,
	toChecklistRows,
	toModificationFormValues,
} from "./types/modificationTypes";

/** What the entry form above the grid is currently seeded with. */
interface FormPrefill {
	mode: ModificationFormMode;
	values: ModificationFormValues | null;
	members: ReadonlyArray<ChecklistMember>;
	snapshot: ReadonlyArray<ModificationMember> | null;
	groupMembers: ReadonlyArray<LoomGroupMember> | null;
	lockChainFields: boolean;
	insertBeforeDate: string | null;
	/** The id being edited, or the old root when inserting an earlier stage. */
	targetId: number | null;
}

const BLANK_PREFILL: FormPrefill = Object.freeze({
	mode: "create",
	values: null,
	members: EMPTY_MEMBERS,
	snapshot: null,
	groupMembers: null,
	lockChainFields: false,
	insertBeforeDate: null,
	targetId: null,
});

function hasChildren(row: ModificationRow): boolean {
	return rowHasChildren(row);
}

/**
 * Loom Modification register — smart container (§6.2).
 *
 * Owns company/branch resolution, the setup + register data and every API call;
 * the entry form and the grid are presentational. The register never writes the
 * weaving standard (D6): a speed change is recorded only as its category.
 */
export default function LoomModificationPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

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

	// ---- Register filters -----------------------------------------------------
	const [dateFrom, setDateFrom] = React.useState("");
	const [dateTo, setDateTo] = React.useState("");
	const [filterGroupId, setFilterGroupId] = React.useState<number | "">("");
	const [filterMachineId, setFilterMachineId] = React.useState<number | "">("");
	const [filterKind, setFilterKind] = React.useState("");

	const filters = React.useMemo<ModificationTableFilters>(
		() => ({
			dateFrom,
			dateTo,
			loomGroupId: filterGroupId,
			machineId: filterMachineId,
			modKind: filterKind,
		}),
		[dateFrom, dateTo, filterGroupId, filterMachineId, filterKind],
	);

	// ---- Data -----------------------------------------------------------------
	const { setup, loading: setupLoading, error: setupError, refresh: refreshSetup } =
		useModificationSetup(coId, branchId);
	const table = useModificationTable(coId, branchId, filters);
	const { refresh: refreshTable, remove: removeModification } = table;

	// ---- Entry form state -----------------------------------------------------
	const [prefill, setPrefill] = React.useState<FormPrefill>(BLANK_PREFILL);
	const [resetToken, setResetToken] = React.useState(0);
	const [submitting, setSubmitting] = React.useState(false);
	const [submitError, setSubmitError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	// ---- Add-looms dialog state ----------------------------------------------
	const [addLoomsRow, setAddLoomsRow] = React.useState<ModificationRow | null>(null);
	const [addLoomsRows, setAddLoomsRows] = React.useState<ReadonlyArray<ChecklistRow>>(EMPTY_ROWS);
	const [addLoomsError, setAddLoomsError] = React.useState<string | null>(null);

	const groupFilterOptions = React.useMemo(
		() =>
			(setup?.groups ?? []).map((group) => ({
				value: group.loom_group_id,
				label: `${group.group_code} — ${group.group_name}`,
			})),
		[setup],
	);

	const loomFilterOptions = React.useMemo(
		() => (setup?.looms ?? []).map((loom) => ({ value: loom.machine_id, label: loomLabel(loom) })),
		[setup],
	);

	const kindFilterOptions = React.useMemo(() => {
		const source = setup && setup.mod_kinds.length > 0 ? setup.mod_kinds : FALLBACK_MOD_KINDS;
		return source.map((option) => ({ value: option.code, label: option.label }));
	}, [setup]);

	// ---- Loaders handed to the form -------------------------------------------
	const loadGroupMembers = React.useCallback(
		async (groupId: number): Promise<LoomGroupMember[]> => {
			if (!coId) return [];
			const detail = await fetchLoomGroupDetail(groupId, Number(coId));
			return detail.members;
		},
		[coId],
	);

	const loadEventSnapshot = React.useCallback(
		async (modificationId: number): Promise<EventSnapshot> => {
			if (!coId) return { members: [], loom_group_id: null };
			const detail = await fetchModificationById(modificationId, Number(coId));
			return { members: detail.members, loom_group_id: detail.loom_group_id };
		},
		[coId],
	);

	const resetForm = React.useCallback(() => {
		setPrefill(BLANK_PREFILL);
		setSubmitError(null);
		setResetToken((token) => token + 1);
	}, []);

	const afterSave = React.useCallback(async () => {
		resetForm();
		await Promise.all([refreshTable(), refreshSetup()]);
	}, [refreshSetup, refreshTable, resetForm]);

	/** Loads a row's detail (and its group's current members when it has one). */
	const loadRowContext = React.useCallback(
		async (row: ModificationRow): Promise<{ detail: ModificationDetail; group: LoomGroupMember[] | null }> => {
			const detail = await fetchModificationById(row.modification_id, Number(coId));
			const group = detail.loom_group_id === null ? null : await loadGroupMembers(detail.loom_group_id);
			return { detail, group };
		},
		[coId, loadGroupMembers],
	);

	const scrollTop = () => {
		if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
	};

	// ---- Submit ---------------------------------------------------------------
	const handleSubmit = React.useCallback(
		async (values: ModificationFormValues, members: ChecklistMember[]) => {
			if (!coId || branchId == null) {
				setSubmitError("Select a company and a branch first.");
				return;
			}
			setSubmitting(true);
			setSubmitError(null);
			const payload = buildModificationPayload(values, members, Number(coId), branchId);
			try {
				if (prefill.mode === "edit" && prefill.targetId !== null) {
					const result = await updateModification(prefill.targetId, payload);
					setSnack(formatSaveMessage(`Updated modification #${prefill.targetId}`, result.data_check));
				} else if (prefill.mode === "insertEarlier" && prefill.targetId !== null) {
					const result = await insertEarlierStage(prefill.targetId, {
						...payload,
						old_root_kind: values.old_root_kind,
					});
					setSnack(
						formatSaveMessage(
							`Inserted stage #${result.modification_id} before #${prefill.targetId}`,
							result.data_check,
						),
					);
				} else {
					const result = await createModification(payload);
					setSnack(formatSaveMessage(`Saved modification #${result.modification_id}`, result.data_check));
				}
				await afterSave();
			} catch (err) {
				setSubmitError(err instanceof Error ? err.message : "Failed to save the modification");
			} finally {
				setSubmitting(false);
			}
		},
		[afterSave, branchId, coId, prefill.mode, prefill.targetId],
	);

	// ---- Row actions ----------------------------------------------------------
	const handleEdit = React.useCallback(
		async (row: ModificationRow) => {
			if (!coId) return;
			setSubmitting(true);
			setSubmitError(null);
			try {
				const { detail, group } = await loadRowContext(row);
				setPrefill({
					mode: "edit",
					values: toModificationFormValues(detail),
					members: toChecklistMembers(detail.members),
					snapshot: detail.members,
					groupMembers: group,
					lockChainFields: detail.children.length > 0 || hasChildren(row),
					insertBeforeDate: null,
					targetId: detail.modification_id,
				});
				setResetToken((token) => token + 1);
				scrollTop();
			} catch (err) {
				setSubmitError(err instanceof Error ? err.message : "Failed to load the modification");
			} finally {
				setSubmitting(false);
			}
		},
		[coId, loadRowContext],
	);

	const handleAddFollowUp = React.useCallback(
		async (row: ModificationRow) => {
			if (!coId) return;
			setSubmitting(true);
			setSubmitError(null);
			try {
				const { detail, group } = await loadRowContext(row);
				// §5: the parent's looms ticked (no dates), group members outside it listed
				// unticked as "not in previous stage".
				setPrefill({
					mode: "followup",
					values: buildFollowUpFormValues(detail),
					members: toChecklistMembers(detail.members, false),
					snapshot: detail.members,
					groupMembers: group,
					lockChainFields: false,
					insertBeforeDate: null,
					targetId: null,
				});
				setResetToken((token) => token + 1);
				scrollTop();
			} catch (err) {
				setSubmitError(err instanceof Error ? err.message : "Failed to load the stage");
			} finally {
				setSubmitting(false);
			}
		},
		[coId, loadRowContext],
	);

	const handleInsertEarlier = React.useCallback(
		async (row: ModificationRow) => {
			if (!coId) return;
			setSubmitting(true);
			setSubmitError(null);
			try {
				const { detail, group } = await loadRowContext(row);
				setPrefill({
					mode: "insertEarlier",
					values: buildInsertEarlierFormValues(detail),
					members: toChecklistMembers(detail.members, false),
					snapshot: null,
					groupMembers: group,
					lockChainFields: false,
					insertBeforeDate: detail.mod_date,
					targetId: detail.modification_id,
				});
				setResetToken((token) => token + 1);
				scrollTop();
			} catch (err) {
				setSubmitError(err instanceof Error ? err.message : "Failed to load the stage");
			} finally {
				setSubmitting(false);
			}
		},
		[coId, loadRowContext],
	);

	const handleAddLooms = React.useCallback(
		async (row: ModificationRow) => {
			if (!coId || !setup) return;
			setSubmitting(true);
			setAddLoomsError(null);
			try {
				const detail = await fetchModificationById(row.modification_id, Number(coId));
				const have = new Set(detail.members.map((member) => member.machine_id));
				setAddLoomsRows(toChecklistRows(setup.looms).filter((loom) => !have.has(loom.machine_id)));
				setAddLoomsRow(row);
			} catch (err) {
				setSubmitError(err instanceof Error ? err.message : "Failed to load the stage");
			} finally {
				setSubmitting(false);
			}
		},
		[coId, setup],
	);

	const handleAddLoomsSubmit = React.useCallback(
		async (members: ChecklistMember[]) => {
			if (!coId || !addLoomsRow) return;
			setSubmitting(true);
			setAddLoomsError(null);
			try {
				await addModificationMembers(addLoomsRow.modification_id, {
					co_id: Number(coId),
					members: members.map((member) => ({
						machine_id: member.machine_id,
						done_date: member.done_date || addLoomsRow.mod_date,
						done_to_date: member.done_to_date || null,
					})),
				});
				setSnack(
					`Added ${members.length} loom${members.length === 1 ? "" : "s"} to #${addLoomsRow.modification_id}`,
				);
				setAddLoomsRow(null);
				await Promise.all([refreshTable(), refreshSetup()]);
			} catch (err) {
				setAddLoomsError(err instanceof Error ? err.message : "Failed to add the looms");
			} finally {
				setSubmitting(false);
			}
		},
		[addLoomsRow, coId, refreshSetup, refreshTable],
	);

	const handleDelete = React.useCallback(
		async (row: ModificationRow) => {
			if (typeof window !== "undefined") {
				const confirmed = window.confirm(
					`Delete modification #${row.modification_id} "${row.title}" (${row.mod_date})?`,
				);
				if (!confirmed) return;
			}
			setSubmitting(true);
			const failure = await removeModification(row.modification_id, false);
			setSubmitting(false);
			if (failure) {
				setSubmitError(failure);
				return;
			}
			if (prefill.targetId === row.modification_id) resetForm();
			setSnack(`Deleted modification #${row.modification_id}`);
			await refreshSetup();
		},
		[prefill.targetId, refreshSetup, removeModification, resetForm],
	);

	const handleDeleteChain = React.useCallback(
		async (row: ModificationRow) => {
			if (!coId) return;
			setSubmitting(true);
			let stagesText = `${row.stage_count} stages`;
			try {
				const detail = await fetchModificationById(row.modification_id, Number(coId));
				const stages = [
					`${detail.mod_date} — ${detail.title}`,
					...detail.children.map((child) => `${child.mod_date} — ${child.title}`),
				];
				stagesText = stages.map((line, index) => `${index + 1}. ${line}`).join("\n");
			} catch {
				// Fall back to the count; the confirm still names the root.
			}
			setSubmitting(false);
			if (typeof window !== "undefined") {
				const confirmed = window.confirm(
					`Delete the whole chain starting at #${row.modification_id}?\n\n${stagesText}`,
				);
				if (!confirmed) return;
			}
			setSubmitting(true);
			const failure = await removeModification(row.modification_id, true);
			setSubmitting(false);
			if (failure) {
				setSubmitError(failure);
				return;
			}
			resetForm();
			setSnack(`Deleted chain #${row.modification_id}`);
			await refreshSetup();
		},
		[coId, refreshSetup, removeModification, resetForm],
	);

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
			<Typography variant="h5" sx={{ fontWeight: 600 }}>
				Loom Modifications
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Record a change done on a group of looms on the day it is done; add follow-ups and
				rectifications from the original row so the impact report can compare before and after
				each stage.
			</Typography>

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

			{branchId == null ? (
				<Alert severity="info">Select a branch to load the register.</Alert>
			) : (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
					{setupError ? <Alert severity="error">{setupError}</Alert> : null}

					{setupLoading || !setup ? (
						<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
							<CircularProgress />
						</Box>
					) : (
						<ModificationEntryForm
							setup={setup}
							mode={prefill.mode}
							initialValues={prefill.values}
							initialMembers={prefill.members}
							initialSnapshot={prefill.snapshot}
							initialGroupMembers={prefill.groupMembers}
							lockChainFields={prefill.lockChainFields}
							insertBeforeDate={prefill.insertBeforeDate}
							editingId={prefill.mode === "edit" ? prefill.targetId : null}
							resetToken={resetToken}
							submitting={submitting}
							submitError={submitError}
							loadGroupMembers={loadGroupMembers}
							loadEventSnapshot={loadEventSnapshot}
							onSubmit={handleSubmit}
							onCancelEdit={resetForm}
						/>
					)}

					<Divider />

					<Box>
						<Typography variant="subtitle2" sx={{ mb: 1 }}>
							Register
						</Typography>
						<Box
							sx={{
								display: "grid",
								gap: 2,
								mb: 2,
								gridTemplateColumns: {
									xs: "1fr",
									sm: "repeat(2, minmax(0, 1fr))",
									md: "repeat(5, minmax(0, 1fr))",
								},
							}}
						>
							<TextField
								type="date"
								label="From"
								size="small"
								fullWidth
								value={dateFrom}
								onChange={(e) => setDateFrom(e.target.value)}
								InputLabelProps={{ shrink: true }}
							/>
							<TextField
								type="date"
								label="To"
								size="small"
								fullWidth
								value={dateTo}
								onChange={(e) => setDateTo(e.target.value)}
								InputLabelProps={{ shrink: true }}
							/>
							<SearchableOptionSelect
								label="Group"
								size="small"
								fullWidth
								placeholder="All groups"
								options={groupFilterOptions}
								value={filterGroupId}
								onChange={(next) => setFilterGroupId(next === "" ? "" : Number(next))}
							/>
							<SearchableOptionSelect
								label="Loom"
								size="small"
								fullWidth
								placeholder="All looms"
								options={loomFilterOptions}
								value={filterMachineId}
								onChange={(next) => setFilterMachineId(next === "" ? "" : Number(next))}
							/>
							<SearchableOptionSelect
								label="Kind"
								size="small"
								fullWidth
								placeholder="All kinds"
								options={kindFilterOptions}
								value={filterKind}
								onChange={(next) => setFilterKind(next === "" ? "" : String(next))}
							/>
						</Box>

						{table.error ? (
							<Alert severity="error" sx={{ mb: 2 }}>
								{table.error}
							</Alert>
						) : null}

						<ModificationGrid
							rows={table.rows}
							total={table.total}
							loading={table.loading}
							page={table.page}
							pageSize={table.pageSize}
							onPageChange={table.setPage}
							onPageSizeChange={table.setPageSize}
							onEdit={handleEdit}
							onDelete={handleDelete}
							onDeleteChain={handleDeleteChain}
							onInsertEarlier={handleInsertEarlier}
							onAddLooms={handleAddLooms}
							onAddFollowUp={handleAddFollowUp}
							busy={submitting}
						/>
					</Box>
				</Box>
			)}

			<AddLoomsDialog
				open={addLoomsRow !== null}
				row={addLoomsRow}
				rows={addLoomsRows}
				lines={setup?.lines ?? []}
				submitting={submitting}
				error={addLoomsError}
				onClose={() => setAddLoomsRow(null)}
				onSubmit={handleAddLoomsSubmit}
			/>

			<Snackbar
				open={Boolean(snack)}
				autoHideDuration={6000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</Box>
	);
}
