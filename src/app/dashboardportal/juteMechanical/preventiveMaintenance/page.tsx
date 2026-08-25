"use client";

import * as React from "react";
import { Alert, Box, CircularProgress, Divider, Snackbar, TextField, Typography } from "@mui/material";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import {
	createPmExecution,
	fetchPmExecutionById,
	updatePmExecution,
	type MechPmExecution,
	type MechPmExecutionDetail,
} from "@/utils/juteMechanicalService";
import PmChecklistGrid from "./_components/PmChecklistGrid";
import PmExecutionForm from "./_components/PmExecutionForm";
import PmExecutionGrid from "./_components/PmExecutionGrid";
import { usePmChecklist } from "./hooks/usePmChecklist";
import { usePmExecutionTable, type PmExecutionTableFilters } from "./hooks/usePmExecutionTable";
import { usePmSetup } from "./hooks/usePmSetup";
import type { PmExecutionFormValues } from "./types/pmTypes";
import {
	buildPmExecutionPayload,
	isPostableTask,
	toEditableTasks,
	toPmFormValues,
} from "./types/pmTypes";

/** The two header fields the checklist is seeded from. */
interface ChecklistSelection {
	machineId: number | null;
	frequency: string;
}

const EMPTY_SELECTION: ChecklistSelection = Object.freeze({ machineId: null, frequency: "" });

/**
 * Preventive Maintenance — smart container.
 *
 * The checklist flow is the point of this screen: pick a machine and a frequency,
 * the machine's schedule template seeds the task grid, the fitter marks each task
 * OK / NOT_OK / NA with an observation, and the save posts the whole set. The
 * backend snapshots each task's wording into the execution detail, so retiring a
 * template row later never rewrites what was signed off today, and it writes
 * `last_pm_date` / `next_pm_due` back onto the machine — which is what clears the
 * machine off the maintenance-due report.
 */
export default function PreventiveMaintenancePage() {
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

	// ---- Log filters ----------------------------------------------------------
	const [dateFrom, setDateFrom] = React.useState("");
	const [dateTo, setDateTo] = React.useState("");
	const [filterMachineId, setFilterMachineId] = React.useState<number | "">("");

	const filters = React.useMemo<PmExecutionTableFilters>(
		() => ({ dateFrom, dateTo, machineId: filterMachineId }),
		[dateFrom, dateTo, filterMachineId],
	);

	// ---- Data -----------------------------------------------------------------
	const { setup, loading: setupLoading, error: setupError } = usePmSetup(coId, branchId);
	const table = usePmExecutionTable(coId, branchId, filters);
	const { refresh: refreshTable, remove: removePmExecution } = table;

	// ---- Entry state ----------------------------------------------------------
	const [editingDetail, setEditingDetail] = React.useState<MechPmExecutionDetail | null>(null);
	const [resetToken, setResetToken] = React.useState(0);
	const [submitting, setSubmitting] = React.useState(false);
	const [submitError, setSubmitError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);
	const [selection, setSelection] = React.useState<ChecklistSelection>(EMPTY_SELECTION);

	const editing = editingDetail !== null;

	// While editing, the rows come from the saved record — never from today's template.
	const checklist = usePmChecklist({
		coId,
		machineId: selection.machineId,
		frequency: selection.frequency,
		seedEnabled: !editing,
	});
	const { replaceTasks, clearTasks, tasks: checklistTasks } = checklist;

	/**
	 * Stable, idempotent: the form reports its machine/frequency on every render, so
	 * this must not create a new state object when nothing actually changed or the
	 * effect that seeds the checklist would loop.
	 */
	const handleValuesChange = React.useCallback((next: ChecklistSelection) => {
		setSelection((prev) =>
			prev.machineId === next.machineId && prev.frequency === next.frequency ? prev : next,
		);
	}, []);

	const initialValues = React.useMemo<PmExecutionFormValues | null>(
		() => (editingDetail ? toPmFormValues(editingDetail) : null),
		[editingDetail],
	);

	const machineFilterOptions = React.useMemo(
		() =>
			(setup?.machines ?? []).map((machine) => ({
				value: machine.machine_id,
				label: machine.mech_code
					? `${machine.mech_code} — ${machine.machine_name}`
					: machine.machine_name,
			})),
		[setup],
	);

	const postableTasks = React.useMemo(
		() => checklistTasks.filter(isPostableTask),
		[checklistTasks],
	);

	const blankAdhocCount = React.useMemo(
		() =>
			checklistTasks.filter((task) => task.source === "ADHOC" && task.task_desc.trim() === "")
				.length,
		[checklistTasks],
	);

	const checklistReady = selection.machineId !== null && selection.frequency !== "";

	/**
	 * The save is blocked (rather than silently dropping rows) when an ad-hoc task
	 * has no wording — the backend rejects those, and a PM with nothing recorded is
	 * not a PM.
	 */
	const blockingMessage = React.useMemo(() => {
		if (!checklistReady) return "Pick a machine and a frequency before saving.";
		if (blankAdhocCount > 0) {
			return `${blankAdhocCount} ad-hoc task${blankAdhocCount === 1 ? " has" : "s have"} no description. Describe or remove them before saving.`;
		}
		if (postableTasks.length === 0) {
			return "Record at least one checklist task before saving.";
		}
		return null;
	}, [blankAdhocCount, checklistReady, postableTasks.length]);

	const handleCancelEdit = React.useCallback(() => {
		setEditingDetail(null);
		setSubmitError(null);
		clearTasks();
		setSelection(EMPTY_SELECTION);
		setResetToken((token) => token + 1);
	}, [clearTasks]);

	const handleSubmit = React.useCallback(
		async (values: PmExecutionFormValues) => {
			if (!coId || branchId == null) {
				setSubmitError("Select a company and a branch first.");
				return;
			}
			setSubmitting(true);
			setSubmitError(null);
			const payload = buildPmExecutionPayload(values, checklistTasks, Number(coId), branchId);
			try {
				if (editingDetail) {
					await updatePmExecution(editingDetail.pm_exec_id, payload);
					setSnack(`Updated PM #${editingDetail.pm_exec_id}`);
				} else {
					const result = await createPmExecution(payload);
					setSnack(result.pm_exec_id ? `Saved PM #${result.pm_exec_id}` : "PM saved");
				}
				setEditingDetail(null);
				clearTasks();
				setSelection(EMPTY_SELECTION);
				setResetToken((token) => token + 1);
				await refreshTable();
			} catch (err) {
				setSubmitError(err instanceof Error ? err.message : "Failed to save the PM execution");
			} finally {
				setSubmitting(false);
			}
		},
		[branchId, checklistTasks, clearTasks, coId, editingDetail, refreshTable],
	);

	const handleEdit = React.useCallback(
		async (row: MechPmExecution) => {
			if (!coId) return;
			setSubmitting(true);
			setSubmitError(null);
			try {
				const detail = await fetchPmExecutionById(row.pm_exec_id, Number(coId));
				setEditingDetail(detail);
				// Saved rows replace the grid; seeding is off while editing.
				replaceTasks(toEditableTasks(detail));
				setSelection({
					machineId: detail.machine_id,
					frequency: detail.frequency ?? "",
				});
				setResetToken((token) => token + 1);
				if (typeof window !== "undefined") {
					window.scrollTo({ top: 0, behavior: "smooth" });
				}
			} catch (err) {
				setSubmitError(err instanceof Error ? err.message : "Failed to load the PM execution");
			} finally {
				setSubmitting(false);
			}
		},
		[coId, replaceTasks],
	);

	const handleDelete = React.useCallback(
		async (row: MechPmExecution) => {
			if (typeof window !== "undefined") {
				const confirmed = window.confirm(
					`Delete PM #${row.pm_exec_id} on ${row.machine_name ?? "this machine"}?`,
				);
				if (!confirmed) return;
			}
			setSubmitting(true);
			const failure = await removePmExecution(row.pm_exec_id);
			setSubmitting(false);
			if (failure) {
				setSubmitError(failure);
				return;
			}
			if (editingDetail?.pm_exec_id === row.pm_exec_id) handleCancelEdit();
			setSnack(`Deleted PM #${row.pm_exec_id}`);
		},
		[editingDetail, handleCancelEdit, removePmExecution],
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
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Typography variant="h5" sx={{ fontWeight: 600 }}>
				Preventive Maintenance
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Run a PM round against the machine&apos;s checklist. Every save updates the machine&apos;s
				last-PM date and next-due date.
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
				<Alert severity="info">Select a branch to load preventive maintenance.</Alert>
			) : (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
					{setupError ? <Alert severity="error">{setupError}</Alert> : null}

					{setupLoading || !setup ? (
						<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
							<CircularProgress />
						</Box>
					) : (
						<PmExecutionForm
							setup={setup}
							initialValues={initialValues}
							editing={editing}
							resetToken={resetToken}
							submitting={submitting}
							submitError={submitError}
							onValuesChange={handleValuesChange}
							onSubmit={handleSubmit}
							onCancelEdit={handleCancelEdit}
							blockingMessage={blockingMessage}
						>
							<PmChecklistGrid
								tasks={checklist.tasks}
								resultOptions={setup.pm_results}
								loading={checklist.loading}
								error={checklist.error}
								templateEmpty={checklist.templateEmpty}
								ready={checklistReady}
								onUpdate={checklist.updateTask}
								onAddAdhoc={checklist.addAdhocTask}
								onRemove={checklist.removeTask}
								onReseed={editing ? undefined : checklist.reseed}
								disabled={submitting}
							/>
						</PmExecutionForm>
					)}

					<Divider />

					<Box>
						<Typography variant="subtitle2" sx={{ mb: 1 }}>
							PM log
						</Typography>
						<Box
							sx={{
								display: "grid",
								gap: 2,
								mb: 2,
								gridTemplateColumns: {
									xs: "1fr",
									sm: "repeat(2, minmax(0, 1fr))",
									md: "repeat(3, minmax(0, 1fr))",
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
								label="Machine"
								size="small"
								fullWidth
								placeholder="All machines"
								options={machineFilterOptions}
								value={filterMachineId}
								onChange={(next) => setFilterMachineId(next === "" ? "" : Number(next))}
							/>
						</Box>

						{table.error ? (
							<Alert severity="error" sx={{ mb: 2 }}>
								{table.error}
							</Alert>
						) : null}

						<PmExecutionGrid
							rows={table.rows}
							total={table.total}
							loading={table.loading}
							page={table.page}
							pageSize={table.pageSize}
							onPageChange={table.setPage}
							onPageSizeChange={table.setPageSize}
							onEdit={handleEdit}
							onDelete={handleDelete}
							busy={submitting}
						/>
					</Box>
				</Box>
			)}

			<Snackbar
				open={Boolean(snack)}
				autoHideDuration={3000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</Box>
	);
}
