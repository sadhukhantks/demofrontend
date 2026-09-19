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
	DialogContentText,
	DialogTitle,
	Snackbar,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Typography,
} from "@mui/material";
import { Search as SearchIcon } from "lucide-react";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { useBaleSetup } from "./hooks/useBaleSetup";
import { useBaleEntriesByDate } from "./hooks/useBaleEntriesByDate";
import { useNextBaleNo } from "./hooks/useNextBaleNo";
import { useBaleMutations } from "./hooks/useBaleMutations";
import BaleEntryForm from "./_components/BaleEntryForm";
import DailyBaleGrid from "./_components/DailyBaleGrid";
import BaleTotalsFooter from "./_components/BaleTotalsFooter";
import SeriesCounterStrip from "./_components/SeriesCounterStrip";
import FindBaleDialog from "./_components/FindBaleDialog";
import { buildBaleEntryPayload, type BaleEntryFormValues } from "./utils/baleSchema";
import { nextBaleNo as calcNextBaleNo, todayISO } from "./utils/baleCalc";
import {
	BALE_ENTRY_TYPES,
	HTTP_CONFLICT,
	type BaleEntryPayload,
	type BaleEntryType,
	type BaleRow,
} from "./types/baleTypes";

/** A 409 waiting for the operator's "Save anyway" (SPEC Q5). */
type DuplicateConfirm = {
	payload: BaleEntryPayload;
	editingId: number | null;
	message: string;
};

/**
 * Bale Production (SPEC §8.1) — one row per bale leaving the bale press, PROD
 * or REPACK. Container component: owns the company/branch scope, the
 * once-per-session header (date, spell, machine, entry type), every API call
 * and the 409 confirm flow; the `_components/` render from props only.
 */
export default function BaleProductionPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedBranches, selectedCompany } = useSidebarContext();

	// Branch resolution: 1 sidebar branch → auto-use it; several → user picks one.
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

	// Header — set once per weighing session (SPEC §3).
	const [tranDate, setTranDate] = React.useState<string>(todayISO());
	const [spellId, setSpellId] = React.useState<number | "">("");
	const [machineId, setMachineId] = React.useState<number | "">("");
	const [entryType, setEntryType] = React.useState<BaleEntryType>(BALE_ENTRY_TYPES.PROD);

	const [editingEntry, setEditingEntry] = React.useState<BaleRow | null>(null);
	const [submitError, setSubmitError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);
	const [savedToken, setSavedToken] = React.useState(0);
	const [duplicateConfirm, setDuplicateConfirm] = React.useState<DuplicateConfirm | null>(null);
	const [findOpen, setFindOpen] = React.useState(false);
	// Series counters advanced by saves on this page (series id → last_bale_no
	// from the save echo) — keeps the strip and the pre-fill current without
	// re-fetching setup after every bale.
	const [liveCounters, setLiveCounters] = React.useState<Record<number, number>>({});
	// Series the form currently holds — drives next_bale_no.
	const [formSeriesId, setFormSeriesId] = React.useState<number | null>(null);

	const { setup, loading: setupLoading, error: setupError } = useBaleSetup(coId, branchId);
	const {
		rows: entries,
		totals,
		loading: entriesLoading,
		error: entriesError,
		refresh: refreshEntries,
	} = useBaleEntriesByDate(coId, branchId, tranDate);
	const { state: nextState, loading: nextLoading, refresh: refreshNext } = useNextBaleNo(coId, formSeriesId);
	const { createEntry, editEntry, deleteEntry, saving, deleting } = useBaleMutations();

	// Default spell → first; machine → auto when the branch has exactly one Bale Press.
	React.useEffect(() => {
		if (!setup) return;
		if (spellId === "" && setup.spells.length > 0) setSpellId(setup.spells[0].spell_id);
		if (setup.machines.length === 1) setMachineId(setup.machines[0].machine_id);
	}, [setup, spellId]);

	// Pre-fill source: the server's next_bale_no, advanced by any save made here
	// since (F9), falling back to the setup counter while the fetch is in flight.
	const nextBaleNo = React.useMemo(() => {
		if (formSeriesId == null) return null;
		const fromHook = nextState?.bale_series_id === formSeriesId ? nextState.next_bale_no : null;
		const fromLive = liveCounters[formSeriesId] != null ? calcNextBaleNo(liveCounters[formSeriesId]) : null;
		const fromSetup = setup?.series.find((s) => s.bale_series_id === formSeriesId)?.last_bale_no;
		const candidates = [fromHook, fromLive, fromSetup != null ? calcNextBaleNo(fromSetup) : null].filter(
			(n): n is number => n != null
		);
		return candidates.length ? Math.max(...candidates) : null;
	}, [formSeriesId, nextState, liveCounters, setup]);

	const headerIncomplete = spellId === "";

	const performSave = React.useCallback(
		async (payload: BaleEntryPayload, editingId: number | null) => {
			setSubmitError(null);
			const result = editingId != null ? await editEntry(editingId, payload) : await createEntry(payload);
			if (!result.ok) {
				if (result.status === HTTP_CONFLICT) {
					setDuplicateConfirm({ payload, editingId, message: result.error ?? "This bale number already exists." });
					return;
				}
				setSubmitError(result.error);
				return;
			}
			if (result.lastBaleNo != null) {
				setLiveCounters((prev) => ({ ...prev, [payload.bale_series_id]: result.lastBaleNo as number }));
			}
			const row = result.row;
			setSnack(
				editingId != null
					? `Updated bale #${row?.bale_no ?? payload.bale_no}`
					: `Saved ${payload.entry_type === BALE_ENTRY_TYPES.REPACK ? "repack" : "bale"} #${row?.bale_no ?? payload.bale_no}${
							row ? ` — net ${row.net_wt} kg` : ""
						}`
			);
			if (editingId != null) setEditingEntry(null);
			setSavedToken((t) => t + 1);
			refreshEntries();
			refreshNext();
		},
		[createEntry, editEntry, refreshEntries, refreshNext]
	);

	const onSubmit = React.useCallback(
		(values: BaleEntryFormValues) => {
			if (!coId || branchId == null || spellId === "") return;
			const payload = buildBaleEntryPayload(values, {
				coId: Number(coId),
				branchId,
				// An existing row keeps its own date; a new one takes the grid's date.
				tranDate: editingEntry?.tran_date ?? tranDate,
				spellId,
				machineId: machineId === "" ? null : machineId,
			});
			void performSave(payload, editingEntry?.bale_entry_id ?? null);
		},
		[coId, branchId, spellId, machineId, tranDate, editingEntry, performSave]
	);

	const onConfirmDuplicate = React.useCallback(() => {
		if (!duplicateConfirm) return;
		const { payload, editingId } = duplicateConfirm;
		setDuplicateConfirm(null);
		void performSave({ ...payload, allow_duplicate: true }, editingId);
	}, [duplicateConfirm, performSave]);

	const onEdit = React.useCallback((row: BaleRow) => {
		setSubmitError(null);
		setEditingEntry(row);
		// The header follows the row so the edit body carries its own spell /
		// machine / type rather than whatever the operator is weighing now.
		setSpellId(row.spell_id);
		setMachineId(row.machine_id ?? "");
		setEntryType(row.entry_type);
	}, []);

	const onCancelEdit = React.useCallback(() => {
		setSubmitError(null);
		setEditingEntry(null);
	}, []);

	const onDelete = React.useCallback(
		async (row: BaleRow) => {
			if (!coId) return;
			if (!window.confirm(`Delete ${row.entry_type === BALE_ENTRY_TYPES.REPACK ? "repack" : "bale"} #${row.bale_no} (${row.series_name ?? "series"}, ${row.gross_wt} kg gross)?`)) return;
			const result = await deleteEntry(row.bale_entry_id, Number(coId));
			if (!result.ok) {
				setSubmitError(result.error);
				return;
			}
			if (editingEntry?.bale_entry_id === row.bale_entry_id) setEditingEntry(null);
			setSnack(`Deleted bale #${row.bale_no}`);
			refreshEntries();
			refreshNext();
		},
		[coId, deleteEntry, editingEntry, refreshEntries, refreshNext]
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

	return (
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
				<Box>
					<Typography variant="h5" sx={{ fontWeight: 600 }}>
						Bale Production
					</Typography>
					<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
						One row per bale off the bale press — quality, series number, gross weight, trolley. Repacks are
						flagged and keep the original bale number.
					</Typography>
				</Box>
				{branchId != null && setup ? (
					<Button size="small" variant="outlined" startIcon={<SearchIcon size={16} />} onClick={() => setFindOpen(true)}>
						Find bale
					</Button>
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

			{branchId == null ? (
				<Alert severity="info">Select a branch to load bale production.</Alert>
			) : (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
					{setupError ? <Alert severity="error">{setupError}</Alert> : null}
					{setupLoading || !setup ? (
						<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
							<CircularProgress />
						</Box>
					) : setup.qualities.length === 0 ? (
						<Alert severity="info">
							No finishing qualities for this company — add them in Finishing Quality Master before weighing bales.
						</Alert>
					) : (
						<>
							{/* Header: date, spell, machine, entry type */}
							<Box sx={{ display: "flex", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
								<TextField
									type="date"
									size="small"
									label="Date"
									value={tranDate}
									onChange={(e) => {
										const v = e.target.value;
										setTranDate(v && v > todayISO() ? todayISO() : v);
									}}
									disabled={editing}
									inputProps={{ max: todayISO() }}
									InputLabelProps={{ shrink: true }}
								/>
								<SearchableOptionSelect
									label="Spell"
									size="small"
									required
									clearable={false}
									options={setup.spells.map((s) => ({
										value: s.spell_id,
										label: s.working_hours != null ? `${s.spell_code} (${Number(s.working_hours)} hrs)` : s.spell_code,
									}))}
									value={spellId}
									onChange={(v) => setSpellId(v === "" ? "" : Number(v))}
									disabled={editing}
									sx={{ minWidth: 160 }}
									helperText={setup.spells.length === 0 ? "No spells for this branch" : undefined}
									error={setup.spells.length === 0}
								/>
								{setup.machines.length === 1 ? (
									<TextField
										label="Bale Press"
										size="small"
										value={`${setup.machines[0].mech_code ? `${setup.machines[0].mech_code} — ` : ""}${setup.machines[0].machine_name}`}
										InputProps={{ readOnly: true }}
										sx={{ minWidth: 200 }}
									/>
								) : setup.machines.length > 1 ? (
									<SearchableOptionSelect
										label="Bale Press"
										size="small"
										options={setup.machines.map((m) => ({
											value: m.machine_id,
											label: m.mech_code ? `${m.mech_code} — ${m.machine_name}` : m.machine_name,
										}))}
										value={machineId}
										onChange={(v) => setMachineId(v === "" ? "" : Number(v))}
										disabled={editing}
										sx={{ minWidth: 220 }}
									/>
								) : (
									<Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
										No Bale Press machine in this branch — rows save without a machine.
									</Typography>
								)}
								<ToggleButtonGroup
									size="small"
									exclusive
									value={entryType}
									onChange={(_, v: BaleEntryType | null) => {
										if (v) setEntryType(v);
									}}
									disabled={editing}
									aria-label="Entry type"
								>
									<ToggleButton value={BALE_ENTRY_TYPES.PROD} sx={{ px: 2 }}>
										Production
									</ToggleButton>
									<ToggleButton value={BALE_ENTRY_TYPES.REPACK} sx={{ px: 2 }}>
										Repack
									</ToggleButton>
								</ToggleButtonGroup>
							</Box>

							<SeriesCounterStrip series={setup.series} liveCounters={liveCounters} selectedSeriesId={formSeriesId} />

							<BaleEntryForm
								setup={setup}
								entryType={entryType}
								editingEntry={editingEntry}
								nextBaleNo={nextBaleNo}
								nextBaleNoLoading={nextLoading}
								savedToken={savedToken}
								headerIncomplete={headerIncomplete}
								submitting={saving}
								submitError={submitError}
								onSeriesChange={setFormSeriesId}
								onSubmit={onSubmit}
								onCancelEdit={onCancelEdit}
							/>

							<Box>
								<Typography variant="subtitle2" sx={{ mb: 1 }}>
									Bales on {tranDate} ({entries.length})
								</Typography>
								{entriesError ? (
									<Alert severity="error" sx={{ mb: 1 }}>
										{entriesError}
									</Alert>
								) : null}
								<DailyBaleGrid
									rows={entries}
									loading={entriesLoading}
									onEdit={onEdit}
									onDelete={(row) => {
										void onDelete(row);
									}}
									actionsDisabled={saving || deleting}
									editingId={editingEntry?.bale_entry_id ?? null}
								/>
								<BaleTotalsFooter totals={totals} />
							</Box>

							<FindBaleDialog
								open={findOpen}
								onClose={() => setFindOpen(false)}
								coId={coId}
								branchId={branchId}
								series={setup.series}
								defaultSeriesId={formSeriesId}
							/>
						</>
					)}
				</Box>
			)}

			{/* 409 — duplicate bale no / unknown original: confirm, then resend with allow_duplicate */}
			<Dialog open={duplicateConfirm != null} onClose={() => setDuplicateConfirm(null)} maxWidth="xs" fullWidth>
				<DialogTitle>Save anyway?</DialogTitle>
				<DialogContent>
					<DialogContentText>{duplicateConfirm?.message}</DialogContentText>
					{duplicateConfirm ? (
						<DialogContentText sx={{ mt: 1.5 }} variant="body2">
							Bale #{duplicateConfirm.payload.bale_no}
							{duplicateConfirm.payload.original_bale_no != null
								? ` (repack of #${duplicateConfirm.payload.original_bale_no})`
								: ""}{" "}
							· {duplicateConfirm.payload.gross_wt} kg gross · {duplicateConfirm.payload.tran_date}
						</DialogContentText>
					) : null}
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setDuplicateConfirm(null)}>Go back</Button>
					<Button variant="contained" color="warning" onClick={onConfirmDuplicate} disabled={saving}>
						Save anyway
					</Button>
				</DialogActions>
			</Dialog>

			<Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)} message={snack ?? ""} />
		</Box>
	);
}
