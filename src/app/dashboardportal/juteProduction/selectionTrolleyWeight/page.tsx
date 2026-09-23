"use client";

import * as React from "react";
import NextLink from "next/link";
import {
	Alert,
	Box,
	CircularProgress,
	Grid,
	Link as MuiLink,
	Snackbar,
	TextField,
	Typography,
	useMediaQuery,
	useTheme,
} from "@mui/material";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { useSelectionSetup } from "./hooks/useSelectionSetup";
import { useSelectionEntriesByDate } from "./hooks/useSelectionEntriesByDate";
import { useSelectionMutations } from "./hooks/useSelectionMutations";
import SelectionEntryForm from "./_components/SelectionEntryForm";
import SelectionEntryGrid from "./_components/SelectionEntryGrid";
import SelectionEntryCards from "./_components/SelectionEntryCards";
import SelectionTotalsFooter from "./_components/SelectionTotalsFooter";
import { buildSelectionEntryPayload, type SelectionEntryFormValues } from "./utils/selectionSchema";
import { SELECTION_QUALITY_WINDOW_DAYS, formatDateDMY, formatKg, todayISO } from "./utils/selectionCalc";
import type { SelectionRow } from "./types/selectionTypes";

const TROLLY_MASTER_PATH = "/dashboardportal/juteProduction/masters/trollyMaster";

/**
 * Selection Trolley Weight (spec §4.1) — one row per trolley of sorted jute
 * leaving the selection stage: quality, optional gate entry, trolley, gross;
 * net = gross − trolley tare (D2). Container component: owns the company /
 * branch scope, the per-session header (date, spell), every API call and the
 * grid ↔ card switch (D8); the `_components/` render from props only.
 */
export default function SelectionTrolleyWeightPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const theme = useTheme();
	const isMobile = useMediaQuery(theme.breakpoints.down("md"));

	const { coId } = useSelectedCompanyCoId();
	const { selectedBranches, selectedCompany } = useSidebarContext();

	// Branch resolution (sidebar norm): 1 sidebar branch → auto-use it; several → user picks one.
	const sidebarBranchIds = React.useMemo(() => selectedBranches.map(Number), [selectedBranches]);
	const [pageBranchId, setPageBranchId] = React.useState<number | "">("");
	React.useEffect(() => {
		if (sidebarBranchIds.length === 1) {
			setPageBranchId(sidebarBranchIds[0]);
		} else if (sidebarBranchIds.length === 0) {
			setPageBranchId("");
		} else {
			setPageBranchId((prev) => (prev !== "" && sidebarBranchIds.includes(prev as number) ? prev : ""));
		}
	}, [sidebarBranchIds]);
	const branchId = pageBranchId === "" ? null : (pageBranchId as number);
	const branchOptions = React.useMemo(
		() => (selectedCompany?.branches ?? []).filter((b) => sidebarBranchIds.includes(Number(b.branch_id))),
		[selectedCompany, sidebarBranchIds]
	);
	const selectedBranchName = branchOptions.find((b) => Number(b.branch_id) === branchId)?.branch_name;

	// Header — set once per weighing session.
	const [tranDate, setTranDate] = React.useState<string>(todayISO());
	const [spellId, setSpellId] = React.useState<number | "">("");

	const [editingEntry, setEditingEntry] = React.useState<SelectionRow | null>(null);
	const [submitError, setSubmitError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);
	const [savedToken, setSavedToken] = React.useState(0);

	const { setup, loading: setupLoading, error: setupError } = useSelectionSetup(coId, branchId, tranDate);
	const {
		rows: entries,
		totals,
		byQuality,
		loading: entriesLoading,
		error: entriesError,
		refresh: refreshEntries,
	} = useSelectionEntriesByDate(coId, branchId, tranDate);
	const { createEntry, editEntry, deleteEntry, saving, deleting } = useSelectionMutations();

	// A remembered spell that the (re)loaded setup no longer offers is dropped.
	React.useEffect(() => {
		if (!setup || spellId === "") return;
		if (!setup.spells.some((s) => s.spell_id === spellId)) setSpellId("");
	}, [setup, spellId]);

	const onSubmit = React.useCallback(
		async (values: SelectionEntryFormValues) => {
			if (!coId || branchId == null) return;
			setSubmitError(null);
			const editingId = editingEntry?.selection_wt_id ?? null;
			const payload = buildSelectionEntryPayload(values, {
				coId: Number(coId),
				branchId,
				// An existing row keeps its own date and spell; a new one takes the header's.
				tranDate: editingEntry?.tran_date ?? tranDate,
				spellId: editingEntry ? editingEntry.spell_id : spellId === "" ? null : spellId,
			});
			const result = editingId != null ? await editEntry(editingId, payload) : await createEntry(payload);
			if (!result.ok) {
				setSubmitError(result.error ?? "Save failed");
				return;
			}
			const row = result.row;
			setSnack(
				editingId != null
					? `Updated${row ? ` — net ${formatKg(row.net_wt)} kg` : ""}`
					: `Saved${row ? ` — net ${formatKg(row.net_wt)} kg` : ""}`
			);
			if (editingId != null) {
				setEditingEntry(null);
			} else {
				setSavedToken((t) => t + 1);
			}
			refreshEntries();
		},
		[coId, branchId, tranDate, spellId, editingEntry, createEntry, editEntry, refreshEntries]
	);

	const onEdit = React.useCallback((row: SelectionRow) => {
		setSubmitError(null);
		setEditingEntry(row);
		// The header follows the row so the locked date / spell show what the row carries.
		setSpellId(row.spell_id ?? "");
		if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
	}, []);

	const onCancelEdit = React.useCallback(() => {
		setSubmitError(null);
		setEditingEntry(null);
	}, []);

	const onDelete = React.useCallback(
		async (row: SelectionRow) => {
			if (!coId) return;
			if (
				!window.confirm(
					`Delete trolley ${row.trolly_name ?? row.trolly_id} — ${row.item_name ?? row.item_id}, net ${formatKg(row.net_wt)} kg?`
				)
			)
				return;
			setSubmitError(null);
			const result = await deleteEntry(row.selection_wt_id, Number(coId));
			if (!result.ok) {
				setSubmitError(result.error ?? "Delete failed");
				return;
			}
			if (editingEntry?.selection_wt_id === row.selection_wt_id) setEditingEntry(null);
			setSnack("Deleted");
			refreshEntries();
		},
		[coId, deleteEntry, editingEntry, refreshEntries]
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

	const editing = editingEntry != null;
	const noQualities = !!setup && setup.qualities.length === 0;
	const noTrollies = !!setup && setup.trollies.length === 0;
	const windowDays = setup?.quality_window?.days ?? SELECTION_QUALITY_WINDOW_DAYS;

	const listProps = {
		rows: entries,
		loading: entriesLoading,
		onEdit,
		onDelete: (row: SelectionRow) => {
			void onDelete(row);
		},
		actionsDisabled: saving || deleting,
		editingId: editingEntry?.selection_wt_id ?? null,
	};

	return (
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Typography variant="h5" sx={{ fontWeight: 600 }}>
				Selection Trolley Weight
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				One row per trolley of sorted jute off the selection stage — quality, trolley, gross weight. Net is gross minus
				the trolley tare.
			</Typography>

			{sidebarBranchIds.length > 1 ? (
				<SearchableOptionSelect
					label="Branch"
					size="small"
					options={branchOptions.map((b) => ({ value: Number(b.branch_id), label: b.branch_name }))}
					value={pageBranchId}
					onChange={(v) => setPageBranchId(v === "" ? "" : Number(v))}
					disabled={editing}
					fullWidth
					sx={{ mb: 2, maxWidth: { md: 320 } }}
				/>
			) : selectedBranchName ? (
				<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
					Branch: {selectedBranchName}
				</Typography>
			) : null}

			{branchId == null ? (
				<Alert severity="info">Select a branch to load selection entries.</Alert>
			) : (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
					{/* Header: date, spell */}
					<Grid container spacing={2}>
						<Grid size={{ xs: 12, sm: 6, md: 3 }}>
							<TextField
								type="date"
								size="small"
								label="Date"
								fullWidth
								value={tranDate}
								onChange={(e) => {
									const v = e.target.value;
									setTranDate(v && v > todayISO() ? todayISO() : v);
								}}
								disabled={editing}
								inputProps={{ max: todayISO() }}
								InputLabelProps={{ shrink: true }}
								helperText={
									setup?.quality_window
										? `Qualities issued ${formatDateDMY(setup.quality_window.date_from)} – ${formatDateDMY(setup.quality_window.date_to)}`
										: undefined
								}
							/>
						</Grid>
						<Grid size={{ xs: 12, sm: 6, md: 3 }}>
							<SearchableOptionSelect
								label="Spell"
								size="small"
								fullWidth
								clearable
								options={(setup?.spells ?? []).map((s) => ({
									value: s.spell_id,
									label: s.spell_name ? `${s.spell_code} — ${s.spell_name}` : s.spell_code,
								}))}
								value={spellId}
								onChange={(v) => setSpellId(v === "" ? "" : Number(v))}
								disabled={editing || !setup}
								loading={setupLoading}
								helperText="Optional"
							/>
						</Grid>
					</Grid>

					{setupError ? <Alert severity="error">{setupError}</Alert> : null}

					{setupLoading && !setup ? (
						<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
							<CircularProgress />
						</Box>
					) : setup ? (
						<>
							{noQualities ? (
								<Alert severity="info">
									No jute issued to this branch in the {windowDays} days up to {formatDateDMY(tranDate)}.
								</Alert>
							) : null}
							{noTrollies ? (
								<Alert severity="info">
									Tag trolleys to the Selection stage in{" "}
									<MuiLink component={NextLink} href={TROLLY_MASTER_PATH}>
										Trolly Master
									</MuiLink>
									.
								</Alert>
							) : null}
							{!noQualities && !noTrollies ? (
								<SelectionEntryForm
									setup={setup}
									editingEntry={editingEntry}
									savedToken={savedToken}
									submitting={saving}
									submitError={submitError}
									onSubmit={(values) => {
										void onSubmit(values);
									}}
									onCancelEdit={onCancelEdit}
								/>
							) : submitError ? (
								<Alert severity="error">{submitError}</Alert>
							) : null}
						</>
					) : null}

					<Box>
						<Typography variant="subtitle2" sx={{ mb: 1 }}>
							Trolleys on {formatDateDMY(tranDate)} ({entries.length})
						</Typography>
						{entriesError ? (
							<Alert severity="error" sx={{ mb: 1 }}>
								{entriesError}
							</Alert>
						) : null}
						{isMobile ? <SelectionEntryCards {...listProps} /> : <SelectionEntryGrid {...listProps} />}
						<SelectionTotalsFooter totals={totals} byQuality={byQuality} />
					</Box>
				</Box>
			)}

			<Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)} message={snack ?? ""} />
		</Box>
	);
}
