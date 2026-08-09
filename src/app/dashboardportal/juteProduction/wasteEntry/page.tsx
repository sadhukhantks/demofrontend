"use client";

import * as React from "react";
import {
	Alert,
	Box,
	CircularProgress,
	MenuItem,
	Snackbar,
	TextField,
	Typography,
} from "@mui/material";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { useWasteSetup } from "./hooks/useWasteSetup";
import { useWasteEntriesByDate } from "./hooks/useWasteEntriesByDate";
import { useWasteMutations } from "./hooks/useWasteMutations";
import WasteEntryForm from "./_components/WasteEntryForm";
import DailyWasteGrid from "./_components/DailyWasteGrid";
import { sumWasteQty, roundQty, todayISO, totalsByWasteItem } from "./utils/wasteCalc";
import { buildCreatePayload, buildEditPayload, type WasteEntryFormValues } from "./utils/wasteSchema";
import type { WasteEntryRow } from "./types/wasteTypes";

/**
 * Jute Waste Entry (SPEC §3) — records process waste per department, spell and
 * date, optionally attributed to a machine. Container component: it owns all
 * state, every API call and the company/branch scope; the components under
 * `_components/` render from props only.
 */
export default function WasteEntryPage() {
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

	const [tranDate, setTranDate] = React.useState<string>(todayISO());
	const [editingEntry, setEditingEntry] = React.useState<WasteEntryRow | null>(null);
	const [submitError, setSubmitError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);
	// Bumped after every successful save / on leaving edit mode; the form watches
	// it to clear itself (see WasteEntryForm's formResetToken prop).
	const [formResetToken, setFormResetToken] = React.useState(0);

	const { setup, loading: setupLoading, error: setupError } = useWasteSetup(coId, branchId);
	const {
		rows: entries,
		loading: entriesLoading,
		error: entriesError,
		refresh: refreshEntries,
	} = useWasteEntriesByDate(coId, tranDate, branchId);
	const { createEntry, editEntry, deleteEntry, saving, deleting } = useWasteMutations();

	// Footer aggregates for the day grid (SPEC §3.1) — declared before the JSX
	// that consumes them; block-scoped consts are not hoisted.
	const totals = React.useMemo(() => totalsByWasteItem(entries), [entries]);
	const grandTotal = React.useMemo(() => roundQty(sumWasteQty(entries)), [entries]);

	const onEdit = React.useCallback((row: WasteEntryRow) => {
		setSubmitError(null);
		setEditingEntry(row);
	}, []);

	const onCancelEdit = React.useCallback(() => {
		setSubmitError(null);
		setEditingEntry(null);
		setFormResetToken((t) => t + 1);
	}, []);

	const onDelete = React.useCallback(
		async (row: WasteEntryRow) => {
			if (!coId || branchId == null) return;
			if (!window.confirm(`Delete waste entry #${row.waste_entry_id}?`)) return;
			// co_id is the company-scoping guard on the by-id route (SPEC §6.1).
			const result = await deleteEntry(row.waste_entry_id, Number(coId));
			if (!result.ok) {
				setSubmitError(result.error);
				return;
			}
			if (editingEntry?.waste_entry_id === row.waste_entry_id) setEditingEntry(null);
			setSnack(`Deleted entry #${row.waste_entry_id}`);
			refreshEntries();
		},
		[coId, branchId, deleteEntry, editingEntry, refreshEntries]
	);

	const onSubmit = React.useCallback(
		async (values: WasteEntryFormValues) => {
			if (!coId || branchId == null) return;
			setSubmitError(null);

			if (editingEntry) {
				const result = await editEntry(
					editingEntry.waste_entry_id,
					Number(coId),
					buildEditPayload(values)
				);
				if (!result.ok) {
					setSubmitError(result.error);
					return;
				}
				setSnack(`Updated entry #${editingEntry.waste_entry_id}`);
				setEditingEntry(null);
				setFormResetToken((t) => t + 1);
				refreshEntries();
				return;
			}

			const result = await createEntry(buildCreatePayload(values, Number(coId), branchId));
			if (!result.ok) {
				setSubmitError(result.error);
				return;
			}
			setSnack(
				result.wasteEntryId != null ? `Saved entry #${result.wasteEntryId}` : "Waste entry saved"
			);
			// Keep the grid on the date that was just written to, then clear the
			// form for the next row.
			setTranDate(values.tran_date);
			setFormResetToken((t) => t + 1);
			refreshEntries();
		},
		[coId, branchId, editingEntry, editEntry, createEntry, refreshEntries]
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
				Waste Entry
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Record process waste by department and type, per date and spell.
			</Typography>

			{sidebarBranchIds.length > 1 ? (
				<TextField
					select
					size="small"
					label="Branch"
					value={pageBranchId}
					onChange={(e) => setPageBranchId(e.target.value === "" ? "" : Number(e.target.value))}
					sx={{ mb: 2, minWidth: 240 }}
				>
					{branchOptions.map((b) => (
						<MenuItem key={b.branch_id} value={Number(b.branch_id)}>
							{b.branch_name}
						</MenuItem>
					))}
				</TextField>
			) : selectedBranchName ? (
				<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
					Branch: {selectedBranchName}
				</Typography>
			) : null}

			{branchId == null ? (
				<Alert severity="info">Select a branch to load waste data.</Alert>
			) : (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
					{setupError ? <Alert severity="error">{setupError}</Alert> : null}
					{setupLoading || !setup ? (
						<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
							<CircularProgress />
						</Box>
					) : (
						<WasteEntryForm
							setup={setup}
							tranDate={tranDate}
							editingEntry={editingEntry}
							formResetToken={formResetToken}
							submitting={saving}
							submitError={submitError}
							onSubmit={(values) => {
								void onSubmit(values);
							}}
							onCancelEdit={onCancelEdit}
						/>
					)}
					<Box>
						<Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1, flexWrap: "wrap" }}>
							<Typography variant="subtitle2">Waste for date</Typography>
							<TextField
								type="date"
								size="small"
								value={tranDate}
								onChange={(e) => setTranDate(e.target.value)}
								InputLabelProps={{ shrink: true }}
							/>
						</Box>
						{entriesError ? (
							<Alert severity="error" sx={{ mb: 1 }}>
								{entriesError}
							</Alert>
						) : null}
						<DailyWasteGrid
							rows={entries}
							loading={entriesLoading}
							totals={totals}
							grandTotal={grandTotal}
							onEdit={onEdit}
							onDelete={(row) => {
								void onDelete(row);
							}}
							actionsDisabled={saving || deleting}
						/>
					</Box>
				</Box>
			)}

			<Snackbar
				open={!!snack}
				autoHideDuration={3000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</Box>
	);
}
