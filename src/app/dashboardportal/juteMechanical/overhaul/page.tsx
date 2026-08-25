"use client";

import * as React from "react";
import { Alert, Box, CircularProgress, Divider, Snackbar, TextField, Typography } from "@mui/material";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import {
	createOverhaul,
	fetchOverhaulById,
	updateOverhaul,
	type MechOverhaul,
	type MechOverhaulDetail,
} from "@/utils/juteMechanicalService";
import OverhaulEntryForm from "./_components/OverhaulEntryForm";
import OverhaulGrid from "./_components/OverhaulGrid";
import { useOverhaulSetup } from "./hooks/useOverhaulSetup";
import { useOverhaulTable, type OverhaulTableFilters } from "./hooks/useOverhaulTable";
import type { EditableOverhaulSpare, OverhaulFormValues } from "./types/overhaulTypes";
import {
	EMPTY_SPARES,
	FALLBACK_OVERHAUL_TYPES,
	buildOverhaulPayload,
	toEditableSpare,
	toOverhaulFormValues,
} from "./types/overhaulTypes";

/**
 * Overhaul Register — smart container.
 *
 * Owns company/branch resolution, the setup + register data, and every API call;
 * the form and the grid below it are presentational. There is no approval workflow
 * on this module: an overhaul is saved directly, and the save is what feeds
 * `jute_mech_machine_attr.last_overhaul_date` / `next_overhaul_due`, which is what
 * the maintenance-due report reads.
 */
export default function OverhaulRegisterPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedBranches, selectedCompany } = useSidebarContext();

	// Branch resolution: one sidebar branch -> use it; several -> the user picks one.
	// An overhaul is a transactional record and must be booked against exactly one branch.
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
	const [filterMachineId, setFilterMachineId] = React.useState<number | "">("");
	const [filterType, setFilterType] = React.useState("");

	const filters = React.useMemo<OverhaulTableFilters>(
		() => ({
			dateFrom,
			dateTo,
			machineId: filterMachineId,
			overhaulType: filterType,
		}),
		[dateFrom, dateTo, filterMachineId, filterType],
	);

	// ---- Data -----------------------------------------------------------------
	const { setup, attrByMachine, loading: setupLoading, error: setupError } = useOverhaulSetup(
		coId,
		branchId,
	);
	const table = useOverhaulTable(coId, branchId, filters);
	// Pulled out so the callbacks below depend on stable functions rather than on the
	// hook's result object, which is a fresh literal on every render.
	const { refresh: refreshTable, remove: removeOverhaul } = table;

	// ---- Entry form state -----------------------------------------------------
	const [editingDetail, setEditingDetail] = React.useState<MechOverhaulDetail | null>(null);
	const [resetToken, setResetToken] = React.useState(0);
	const [submitting, setSubmitting] = React.useState(false);
	const [submitError, setSubmitError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	const initialValues = React.useMemo<OverhaulFormValues | null>(
		() => (editingDetail ? toOverhaulFormValues(editingDetail) : null),
		[editingDetail],
	);

	const initialSpares = React.useMemo<ReadonlyArray<EditableOverhaulSpare>>(
		() => (editingDetail ? editingDetail.spares.map(toEditableSpare) : EMPTY_SPARES),
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

	const typeFilterOptions = React.useMemo(() => {
		const source =
			setup && setup.overhaul_types.length > 0 ? setup.overhaul_types : FALLBACK_OVERHAUL_TYPES;
		return source.map((option) => ({ value: option.code, label: option.label }));
	}, [setup]);

	const handleCancelEdit = React.useCallback(() => {
		setEditingDetail(null);
		setSubmitError(null);
		setResetToken((token) => token + 1);
	}, []);

	const handleSubmit = React.useCallback(
		async (values: OverhaulFormValues, spares: EditableOverhaulSpare[]) => {
			if (!coId || branchId == null) {
				setSubmitError("Select a company and a branch first.");
				return;
			}
			setSubmitting(true);
			setSubmitError(null);
			const payload = buildOverhaulPayload(values, spares, Number(coId), branchId);
			try {
				if (editingDetail) {
					await updateOverhaul(editingDetail.overhaul_id, payload);
					setSnack(`Updated overhaul #${editingDetail.overhaul_id}`);
				} else {
					const result = await createOverhaul(payload);
					setSnack(
						result.overhaul_id
							? `Saved overhaul #${result.overhaul_id}`
							: "Overhaul saved",
					);
				}
				setEditingDetail(null);
				setResetToken((token) => token + 1);
				await refreshTable();
			} catch (err) {
				setSubmitError(err instanceof Error ? err.message : "Failed to save the overhaul");
			} finally {
				setSubmitting(false);
			}
		},
		[branchId, coId, editingDetail, refreshTable],
	);

	const handleEdit = React.useCallback(
		async (row: MechOverhaul) => {
			if (!coId) return;
			setSubmitting(true);
			setSubmitError(null);
			try {
				const detail = await fetchOverhaulById(row.overhaul_id, Number(coId));
				setEditingDetail(detail);
				setResetToken((token) => token + 1);
				if (typeof window !== "undefined") {
					window.scrollTo({ top: 0, behavior: "smooth" });
				}
			} catch (err) {
				setSubmitError(err instanceof Error ? err.message : "Failed to load the overhaul");
			} finally {
				setSubmitting(false);
			}
		},
		[coId],
	);

	const handleDelete = React.useCallback(
		async (row: MechOverhaul) => {
			if (typeof window !== "undefined") {
				const confirmed = window.confirm(
					`Delete overhaul #${row.overhaul_id} on ${row.machine_name ?? "this machine"}?`,
				);
				if (!confirmed) return;
			}
			setSubmitting(true);
			const failure = await removeOverhaul(row.overhaul_id);
			setSubmitting(false);
			if (failure) {
				setSubmitError(failure);
				return;
			}
			if (editingDetail?.overhaul_id === row.overhaul_id) handleCancelEdit();
			setSnack(`Deleted overhaul #${row.overhaul_id}`);
		},
		[editingDetail, handleCancelEdit, removeOverhaul],
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
				Overhaul Register
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Record major and minor overhauls with their labour and spare costs. Every save updates the
				machine&apos;s last-overhaul date and next-due date.
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
				<Alert severity="info">Select a branch to load the overhaul register.</Alert>
			) : (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
					{setupError ? <Alert severity="error">{setupError}</Alert> : null}

					{setupLoading || !setup ? (
						<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
							<CircularProgress />
						</Box>
					) : (
						<OverhaulEntryForm
							coId={coId}
							setup={setup}
							attrByMachine={attrByMachine}
							initialValues={initialValues}
							initialSpares={initialSpares}
							editing={editingDetail !== null}
							resetToken={resetToken}
							submitting={submitting}
							submitError={submitError}
							onSubmit={handleSubmit}
							onCancelEdit={handleCancelEdit}
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
									md: "repeat(4, minmax(0, 1fr))",
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
							<SearchableOptionSelect
								label="Overhaul type"
								size="small"
								fullWidth
								placeholder="All types"
								options={typeFilterOptions}
								value={filterType}
								onChange={(next) => setFilterType(next === "" ? "" : String(next))}
							/>
						</Box>

						{table.error ? (
							<Alert severity="error" sx={{ mb: 2 }}>
								{table.error}
							</Alert>
						) : null}

						<OverhaulGrid
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
