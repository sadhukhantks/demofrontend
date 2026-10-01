"use client";

import * as React from "react";
import {
	Alert,
	Box,
	CircularProgress,
	Divider,
	Paper,
	Snackbar,
	TextField,
	Typography,
} from "@mui/material";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { PAGE_PADDING_SX } from "@/components/ui/responsiveEntry";
import type { MechBreakdown } from "@/utils/juteMechanicalService";
import BreakdownEntryForm from "./_components/BreakdownEntryForm";
import DailyBreakdownGrid from "./_components/DailyBreakdownGrid";
import OpenBreakdownBoard from "./_components/OpenBreakdownBoard";
import CloseBreakdownDialog from "./_components/CloseBreakdownDialog";
import ConfirmFixDialog from "./_components/ConfirmFixDialog";
import { useBreakdownSetup } from "./hooks/useBreakdownSetup";
import { useBreakdownEntries } from "./hooks/useBreakdownEntries";
import { useReasonsByMachine } from "./hooks/useReasonsByMachine";
import { useOpenBreakdowns, type OpenBreakdownRow } from "./hooks/useOpenBreakdowns";
import {
	buildBreakdownPayload,
	type BreakdownCloseBody,
	type BreakdownFormValues,
	type EditingBreakdown,
} from "./types/breakdownTypes";
import { toApiDateTime, toNumberOrNull, todayISO } from "./utils/breakdownCalc";

/**
 * Breakdown Entry — the daily log of mill machine downtime.
 *
 * Smart container: it owns the company/branch scope, every hook, and all state;
 * the components under `_components/` render from props only.
 *
 * There is NO approval workflow on this module (spec: "Approval workflow — None
 * — direct save. Downtime logging must be fast."). A breakdown's `status`
 * tracks the repair (OPEN / UNDER_REPAIR / CLOSED), not a document lifecycle,
 * and is derived by the backend from the incident's datetimes.
 */
export default function BreakdownEntryPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedBranches, selectedCompany } = useSidebarContext();

	// Branch resolution: 1 sidebar branch → auto-use it; several → user must pick one.
	const sidebarBranchIds = React.useMemo(() => selectedBranches.map(Number), [selectedBranches]);
	const [pageBranchId, setPageBranchId] = React.useState<number | "">("");
	React.useEffect(() => {
		if (sidebarBranchIds.length === 1) {
			setPageBranchId(sidebarBranchIds[0]);
		} else if (sidebarBranchIds.length === 0) {
			setPageBranchId("");
		} else {
			setPageBranchId((prev) =>
				prev !== "" && sidebarBranchIds.includes(prev as number) ? prev : ""
			);
		}
	}, [sidebarBranchIds]);
	const branchId = pageBranchId === "" ? null : (pageBranchId as number);
	const branchOptions = React.useMemo(
		() =>
			(selectedCompany?.branches ?? []).filter((b) =>
				sidebarBranchIds.includes(Number(b.branch_id))
			),
		[selectedCompany, sidebarBranchIds]
	);
	const selectedBranchName = branchOptions.find(
		(b) => Number(b.branch_id) === branchId
	)?.branch_name;

	// ------------------------------------------------------------- page state
	const [dateFrom, setDateFrom] = React.useState<string>(todayISO());
	const [dateTo, setDateTo] = React.useState<string>(todayISO());
	const [filterMachineId, setFilterMachineId] = React.useState<number | "">("");
	const [filterStatus, setFilterStatus] = React.useState<string>("");
	const [filterDiscipline, setFilterDiscipline] = React.useState<string>("");

	const [editingEntry, setEditingEntry] = React.useState<EditingBreakdown | null>(null);
	const [formMachineId, setFormMachineId] = React.useState<number | null>(null);
	const [formResetToken, setFormResetToken] = React.useState(0);
	const [submitError, setSubmitError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	const [closingEntry, setClosingEntry] = React.useState<OpenBreakdownRow | null>(null);
	const [closeError, setCloseError] = React.useState<string | null>(null);

	const [confirmingEntry, setConfirmingEntry] = React.useState<MechBreakdown | null>(null);
	const [confirmError, setConfirmError] = React.useState<string | null>(null);

	// ------------------------------------------------------------------ data
	const {
		setup,
		spareItems,
		uoms,
		loading: setupLoading,
		error: setupError,
		itemsError,
	} = useBreakdownSetup(coId, branchId);

	const {
		reasons,
		loading: reasonsLoading,
		error: reasonsError,
	} = useReasonsByMachine(coId, formMachineId);

	const {
		rows: entries,
		total: entriesTotal,
		loading: entriesLoading,
		error: entriesError,
		refresh: refreshEntries,
		loadEntry,
		saveEntry,
		removeEntry,
		confirmEntry,
		saving,
		deleting,
		confirming,
	} = useBreakdownEntries({
		coId,
		branchId,
		dateFrom,
		dateTo,
		machineId: filterMachineId === "" ? null : filterMachineId,
		status: filterStatus === "" ? null : filterStatus,
		discipline: filterDiscipline === "" ? null : filterDiscipline,
	});

	const {
		rows: openRows,
		loading: openLoading,
		error: openError,
		refresh: refreshOpen,
		closeEntry,
		closing,
	} = useOpenBreakdowns(coId, branchId);

	// --------------------------------------------------------------- derived
	const statusLabels = React.useMemo(() => {
		const map = new Map<string, string>();
		(setup?.statuses ?? []).forEach((status) => map.set(status.code, status.label));
		return map;
	}, [setup]);

	const machineFilterOptions = React.useMemo(
		() =>
			(setup?.machines ?? []).map((machine) => ({
				value: machine.machine_id,
				label: machine.mech_code
					? `${machine.mech_code} — ${machine.machine_name}`
					: machine.machine_name,
			})),
		[setup]
	);

	const statusFilterOptions = React.useMemo(
		() => (setup?.statuses ?? []).map((status) => ({ value: status.code, label: status.label })),
		[setup]
	);

	const disciplineFilterOptions = React.useMemo(
		() =>
			(setup?.disciplines ?? []).map((discipline) => ({
				value: discipline.code,
				label: discipline.label,
			})),
		[setup]
	);

	// -------------------------------------------------------------- handlers
	const handleMachineChange = React.useCallback((machineId: number | null) => {
		setFormMachineId(machineId);
	}, []);

	const handleCancelEdit = React.useCallback(() => {
		setEditingEntry(null);
		setSubmitError(null);
		setFormResetToken((token) => token + 1);
	}, []);

	const handleEdit = React.useCallback(
		async (row: MechBreakdown) => {
			setSubmitError(null);
			const detail = await loadEntry(row.breakdown_id);
			if (!detail) return;
			setEditingEntry(detail);
			if (typeof window !== "undefined") {
				window.scrollTo({ top: 0, behavior: "smooth" });
			}
		},
		[loadEntry]
	);

	const handleDelete = React.useCallback(
		async (row: MechBreakdown) => {
			if (typeof window !== "undefined") {
				const confirmed = window.confirm(
					`Delete breakdown #${row.breakdown_id} on ${row.machine_name ?? "this machine"}?`
				);
				if (!confirmed) return;
			}
			const result = await removeEntry(row.breakdown_id);
			if (!result.ok) {
				setSubmitError(result.error);
				return;
			}
			if (editingEntry?.breakdown_id === row.breakdown_id) handleCancelEdit();
			setSnack(`Deleted breakdown #${row.breakdown_id}`);
			refreshEntries();
			refreshOpen();
		},
		[editingEntry, handleCancelEdit, refreshEntries, refreshOpen, removeEntry]
	);

	const handleSubmit = React.useCallback(
		async (values: BreakdownFormValues) => {
			if (!coId || branchId == null) return;
			setSubmitError(null);

			const payload = buildBreakdownPayload(values, Number(coId), branchId);
			const result = await saveEntry(payload, editingEntry?.breakdown_id ?? null);
			if (!result.ok) {
				setSubmitError(result.error);
				return;
			}

			setSnack(
				editingEntry
					? `Updated breakdown #${editingEntry.breakdown_id}`
					: `Saved breakdown${result.breakdownId ? ` #${result.breakdownId}` : ""}`
			);
			setEditingEntry(null);
			setFormResetToken((token) => token + 1);
			refreshEntries();
			refreshOpen();
		},
		[branchId, coId, editingEntry, refreshEntries, refreshOpen, saveEntry]
	);

	const handleOpenClose = React.useCallback((row: OpenBreakdownRow) => {
		setCloseError(null);
		setClosingEntry(row);
	}, []);

	const handleConfirmClose = React.useCallback(
		async (restartDateTime: string, actionTaken: string, durationMin: string) => {
			if (!closingEntry || !coId) return;
			setCloseError(null);

			// `co_id` travels in the BODY: the backend's BreakdownClose reads it from
			// the body or the co_id query param, and the service sends no query string.
			const body: BreakdownCloseBody = {
				co_id: Number(coId),
				restart_datetime: toApiDateTime(restartDateTime) ?? restartDateTime,
				action_taken: actionTaken.trim() === "" ? null : actionTaken.trim(),
				// Blank stays null — the backend then derives restart − stop itself.
				duration_min: toNumberOrNull(durationMin),
			};

			const result = await closeEntry(closingEntry.breakdown_id, body);
			if (!result.ok) {
				setCloseError(result.error);
				return;
			}
			setSnack(`Closed breakdown #${closingEntry.breakdown_id}`);
			setClosingEntry(null);
			refreshOpen();
			refreshEntries();
		},
		[closeEntry, closingEntry, coId, refreshEntries, refreshOpen]
	);

	const handleCancelClose = React.useCallback(() => {
		setClosingEntry(null);
		setCloseError(null);
	}, []);

	const handleOpenConfirm = React.useCallback((row: MechBreakdown) => {
		setConfirmError(null);
		setConfirmingEntry(row);
	}, []);

	const handleConfirmFix = React.useCallback(
		async (agreed: boolean, restartDateTime: string, remarks: string) => {
			if (!confirmingEntry || !coId) return;
			setConfirmError(null);

			const result = await confirmEntry(confirmingEntry.breakdown_id, {
				co_id: Number(coId),
				agreed,
				restart_datetime: agreed ? null : toApiDateTime(restartDateTime),
				remarks: remarks.trim() === "" ? null : remarks.trim(),
			});
			if (!result.ok) {
				setConfirmError(result.error);
				return;
			}
			setSnack(
				agreed
					? `Fix confirmed for breakdown #${confirmingEntry.breakdown_id}`
					: `Difference recorded for breakdown #${confirmingEntry.breakdown_id}`
			);
			setConfirmingEntry(null);
			refreshEntries();
		},
		[confirmEntry, confirmingEntry, coId, refreshEntries]
	);

	const handleCancelConfirm = React.useCallback(() => {
		setConfirmingEntry(null);
		setConfirmError(null);
	}, []);

	// ------------------------------------------------------------- rendering
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
				Breakdown Entry
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Production logs the breakdown as it happens — machine, stop time and reason are all
				that is needed to save. Mechanical then enters the restart, and production can confirm
				the fix from the incident log. Each step records the user who entered it.
			</Typography>

			{sidebarBranchIds.length > 1 ? (
				<SearchableOptionSelect
					label="Branch"
					size="small"
					options={branchOptions.map((b) => ({
						value: Number(b.branch_id),
						label: b.branch_name,
					}))}
					value={pageBranchId}
					onChange={(selectedValue) =>
						setPageBranchId(selectedValue === "" ? "" : Number(selectedValue))
					}
					sx={{ mb: 2, minWidth: 240 }}
				/>
			) : selectedBranchName ? (
				<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
					Branch: {selectedBranchName}
				</Typography>
			) : null}

			{branchId == null ? (
				<Alert severity="info">Select a branch to load breakdown data.</Alert>
			) : (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
					<OpenBreakdownBoard
						rows={openRows}
						loading={openLoading}
						error={openError}
						statusLabels={statusLabels}
						onRefresh={refreshOpen}
						onClose={handleOpenClose}
						closing={closing}
					/>

					{setupError ? <Alert severity="error">{setupError}</Alert> : null}

					<Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 } }}>
						{setupLoading || !setup ? (
							<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
								<CircularProgress />
							</Box>
						) : (
							<BreakdownEntryForm
								setup={setup}
								reasons={reasons}
								reasonsLoading={reasonsLoading}
								reasonsError={reasonsError}
								spareItems={spareItems}
								uoms={uoms}
								itemsError={itemsError}
								editingEntry={editingEntry}
								formResetToken={formResetToken}
								submitting={saving}
								submitError={submitError}
								onSubmit={handleSubmit}
								onCancelEdit={handleCancelEdit}
								onMachineChange={handleMachineChange}
							/>
						)}
					</Paper>

					<Box>
						<Box
							sx={{
								display: "flex",
								alignItems: "center",
								gap: 2,
								mb: 1.5,
								flexWrap: "wrap",
							}}
						>
							<Typography variant="subtitle2">Incident log</Typography>
							<TextField
								type="date"
								label="From"
								size="small"
								value={dateFrom}
								onChange={(event) => setDateFrom(event.target.value)}
								InputLabelProps={{ shrink: true }}
							/>
							<TextField
								type="date"
								label="To"
								size="small"
								value={dateTo}
								onChange={(event) => setDateTo(event.target.value)}
								InputLabelProps={{ shrink: true }}
							/>
							<SearchableOptionSelect
								label="Machine"
								size="small"
								placeholder="All machines"
								options={machineFilterOptions}
								value={filterMachineId}
								onChange={(selectedValue) =>
									setFilterMachineId(selectedValue === "" ? "" : Number(selectedValue))
								}
								sx={{ minWidth: 220 }}
							/>
							<SearchableOptionSelect
								label="Status"
								size="small"
								placeholder="All"
								options={statusFilterOptions}
								value={filterStatus}
								onChange={(selectedValue) => setFilterStatus(selectedValue)}
								sx={{ minWidth: 170 }}
							/>
							<SearchableOptionSelect
								label="Discipline"
								size="small"
								placeholder="All"
								options={disciplineFilterOptions}
								value={filterDiscipline}
								onChange={(selectedValue) => setFilterDiscipline(selectedValue)}
								sx={{ minWidth: 170 }}
							/>
							<Box sx={{ flexGrow: 1 }} />
							<Typography variant="caption" color="text.secondary">
								{entriesTotal} incident{entriesTotal === 1 ? "" : "s"}
							</Typography>
						</Box>

						{entriesError ? (
							<Alert severity="error" sx={{ mb: 1.5 }}>
								{entriesError}
							</Alert>
						) : null}

						<Divider sx={{ mb: 1.5 }} />

						<DailyBreakdownGrid
							rows={entries}
							loading={entriesLoading}
							statusLabels={statusLabels}
							onEdit={handleEdit}
							onDelete={handleDelete}
							onConfirmFix={handleOpenConfirm}
							busy={deleting || saving || confirming}
						/>
					</Box>
				</Box>
			)}

			<CloseBreakdownDialog
				entry={closingEntry}
				closing={closing}
				error={closeError}
				onCancel={handleCancelClose}
				onConfirm={handleConfirmClose}
			/>

			<ConfirmFixDialog
				entry={confirmingEntry}
				saving={confirming}
				error={confirmError}
				onCancel={handleCancelConfirm}
				onConfirm={handleConfirmFix}
			/>

			<Snackbar
				open={!!snack}
				autoHideDuration={3000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</Box>
	);
}
