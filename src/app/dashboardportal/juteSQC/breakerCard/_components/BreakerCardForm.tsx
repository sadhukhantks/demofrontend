"use client";

import * as React from "react";
import { Alert, Autocomplete, Box, Button, IconButton, Paper, Snackbar, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography, alpha } from "@mui/material";
import { Plus as AddIcon, Trash2 as DeleteOutlineIcon, Save as SaveIcon } from "lucide-react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import {
	BREAKER_CARD_READINGS,
	breakerCardSaveSchema,
	type BreakerCardSetup,
	type BreakerCardSavePayload,
	type BreakerCardRow,
} from "../types/breakerCardTypes";
import { computeRowPreview, gmsToLbs, SAMPLE_LENGTH_YDS } from "../utils/breakerCardCalc";

import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
type Props = {
	coId: string;
	branchId: number;
	entryDate: string;
	setup: BreakerCardSetup;
	onSaved: () => void;
};

// A single editable row of the entry grid. Numeric inputs are held as strings;
// selects hold the id or "" when unset. Each row gets a stable client key so the
// React list reconciles correctly as rows are added/removed.
type DraftRow = {
	key: string;
	mcId: number | "";
	spellId: number | "";
	groupId: number | "";
	weights: string[];
	mrPcts: string[];
};

let rowSeq = 0;
const nextKey = (): string => `r-${++rowSeq}`;
const blankReadings = (): string[] => Array(BREAKER_CARD_READINGS).fill("");
const makeBlankRow = (): DraftRow => ({
	key: nextKey(),
	mcId: "",
	spellId: "",
	groupId: "",
	weights: blankReadings(),
	mrPcts: blankReadings(),
});

// A draft row is "empty" (skipped on save) when no selects are set and every
// weight/MR cell is blank — i.e. the trailing add-row the user never touched.
function isRowEmpty(r: DraftRow): boolean {
	const noSelects = r.mcId === "" && r.spellId === "" && r.groupId === "";
	const noNumbers = r.weights.every((w) => w === "") && r.mrPcts.every((m) => m === "");
	return noSelects && noNumbers;
}

/**
 * R-08-05/06/07 Breaker Card (Coarse-Side SWT) MULTI-ROW entry form.
 *
 * Renders a table where the inspector adds one row per (machine, spell, yarn group)
 * reading set — each with 4 cut weights + 4 MR%. A yarn group has no single std, so
 * the live preview always uses std 16 with no CV band; per row a live Corr Wt and
 * CV% preview is shown. One submit POSTs the whole array as { rows: [...] }; blank
 * rows are dropped and empty selects map to null. Server values are authoritative;
 * the preview is advisory.
 */
export default function BreakerCardForm({ coId, branchId, entryDate, setup, onSaved }: Props) {
	const [rows, setRows] = React.useState<DraftRow[]>(() => [makeBlankRow()]);
	const [saving, setSaving] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	// Look up a yarn group by item_grp_id (for the selected-value display).
	const groupById = React.useMemo(() => {
		const m = new Map<number, (typeof setup.groups)[number]>();
		for (const b of setup.groups) m.set(b.item_grp_id, b);
		return m;
	}, [setup.groups]);

	const addRow = React.useCallback(() => {
		setRows((prev) => [...prev, makeBlankRow()]);
	}, []);

	const removeRow = React.useCallback((key: string) => {
		setRows((prev) => {
			const next = prev.filter((r) => r.key !== key);
			return next.length === 0 ? [makeBlankRow()] : next;
		});
	}, []);

	const updateRow = React.useCallback((key: string, patch: Partial<DraftRow>) => {
		setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
	}, []);

	const setWeightAt = React.useCallback(
		(key: string, index: number, value: string) => {
			setRows((prev) =>
				prev.map((r) => {
					if (r.key !== key) return r;
					const next = [...r.weights];
					next[index] = value;
					return { ...r, weights: next };
				})
			);
		},
		[]
	);

	const setMrAt = React.useCallback((key: string, index: number, value: string) => {
		setRows((prev) =>
			prev.map((r) => {
				if (r.key !== key) return r;
				const next = [...r.mrPcts];
				next[index] = value;
				return { ...r, mrPcts: next };
			})
		);
	}, []);

	const handleSave = async () => {
		const filledRows = rows.filter((r) => !isRowEmpty(r));
		if (filledRows.length === 0) {
			setError("Add at least one reading row to save.");
			return;
		}

		const payloadRows: BreakerCardRow[] = filledRows.map((r) => ({
			mc_id: r.mcId === "" ? null : Number(r.mcId),
			spell_id: r.spellId === "" ? null : Number(r.spellId),
			item_grp_id: r.groupId === "" ? null : Number(r.groupId),
			weights: r.weights.map((w) => Number(w)),
			mr_pcts: r.mrPcts.map((m) => Number(m)),
		}));

		const candidate = {
			co_id: Number(coId),
			branch_id: Number(branchId),
			entry_date: entryDate,
			card_side: "COARSE",
			rows: payloadRows,
		};

		const parsed = breakerCardSaveSchema.safeParse(candidate);
		if (!parsed.success) {
			setError(parsed.error.issues[0]?.message ?? "Please complete every reading row.");
			return;
		}

		setSaving(true);
		setError(null);
		const body: BreakerCardSavePayload = parsed.data;
		const { error: err } = await fetchWithCookie<{
			data: { message: string; breaker_card_swt_ids: number[]; count: number };
		}>(
			apiRoutesPortalMasters.BREAKER_CARD_SWT_SAVE,
			"POST",
			body
		);
		setSaving(false);
		if (err) {
			setError(err);
			return;
		}
		setSnack(`Saved ${payloadRows.length} breaker-card row${payloadRows.length === 1 ? "" : "s"}`);
		setRows([makeBlankRow()]);
		onSaved();
	};

	// Shared field renderers so the desktop table and mobile card layouts stay in
	// sync — `label` is set only on mobile where there is no column header.
	const renderMachineSelect = (r: DraftRow, label?: string) => (
		<Autocomplete
			options={setup.machines}
			getOptionLabel={(opt) =>
				opt.mech_code ? `${opt.machine_name} (${opt.mech_code})` : opt.machine_name
			}
			renderOption={(props, opt) => (
				<li {...props} key={opt.machine_id}>
					{opt.machine_name} ({opt.mech_code})
				</li>
			)}
			value={
				r.mcId === ""
					? null
					: (setup.machines.find((m) => m.machine_id === Number(r.mcId)) ?? null)
			}
			onChange={(_, newVal) => updateRow(r.key, { mcId: newVal ? newVal.machine_id : "" })}
			isOptionEqualToValue={(opt, val) => opt.machine_id === val.machine_id}
			size="small"
			fullWidth
			renderInput={(params) => <TextField {...params} label={label} placeholder="Machine" />}
		/>
	);

	const renderSpellSelect = (r: DraftRow, label?: string) => (
		<SearchableOptionSelect
			label={label}
			size="small"
			fullWidth
			placeholder="None"
			options={setup.spells.map((s) => ({ value: s.spell_id, label: `${s.spell_name} (${s.spell_code})` }))}
			value={r.spellId}
			onChange={(selectedValue) => updateRow(r.key, {
					spellId: selectedValue === "" ? "" : Number(selectedValue),
				})}
		/>
	);

	// Std MR% is set in the Std Moisture Master (juteSQC/stdMoisture) per yarn group
	// for THIS process, and comes back on setup as std_mr_by_group (string keys).
	// It is READ-ONLY here — the master value is final. With no entry the backend
	// rejects the save (400), so the field warns as soon as the group is picked.
	const stdMrFor = (groupId: number | ""): number | null => {
		if (groupId === "") return null;
		const v = setup.std_mr_by_group?.[String(groupId)];
		return typeof v === "number" ? v : null;
	};

	const stdMrHelper = (groupId: number | ""): string => {
		if (groupId === "") return "Std MR% comes from the Std Moisture Master";
		const std = stdMrFor(groupId);
		return std != null ? `Std MR%: ${std.toFixed(2)}` : "No std MR% set";
	};

	const renderGroupSelect = (r: DraftRow, label?: string) => (
		<Autocomplete
			options={setup.groups}
			getOptionLabel={(opt) => opt.item_grp_name}
			renderOption={(props, opt) => (
				<li {...props} key={opt.item_grp_id}>
					{opt.item_grp_name}
				</li>
			)}
			value={r.groupId === "" ? null : groupById.get(Number(r.groupId)) ?? null}
			onChange={(_, newVal) => updateRow(r.key, { groupId: newVal ? newVal.item_grp_id : "" })}
			size="small"
			fullWidth
			renderInput={(params) => (
				<TextField
					{...params}
					label={label}
					placeholder="Yarn Group"
					error={r.groupId !== "" && stdMrFor(r.groupId) == null}
					helperText={stdMrHelper(r.groupId)}
				/>
			)}
			isOptionEqualToValue={(opt, val) => opt.item_grp_id === val.item_grp_id}
		/>
	);

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					flexWrap: "wrap",
					gap: 1,
				}}
			>
				<Typography variant="subtitle2">
					Reading rows — each row = one Mc / Spell / Yarn Group with {BREAKER_CARD_READINGS} cut
					weights (gms per {SAMPLE_LENGTH_YDS} yds) + {BREAKER_CARD_READINGS} MR% — Obs / Corr Wt
					shown in lbs/100yds
				</Typography>
				<Button
					variant="outlined"
					size="small"
					startIcon={<AddIcon size={16} />}
					onClick={addRow}
					sx={{ minHeight: 40 }}
				>
					Add Row
				</Button>
			</Box>

			{/* Desktop / tablet: wide entry table. Hidden on phones (stacked cards below). */}
			<TableContainer
				component={Paper}
				variant="outlined"
				sx={{ overflowX: "auto", display: { xs: "none", md: "block" } }}
			>
				<Table size="small" sx={{ minWidth: 1360 }}>
					<TableHead>
						<TableRow>
							<TableCell sx={{ minWidth: 230 }}>Machine (Mc)</TableCell>
							<TableCell sx={{ minWidth: 130 }}>Spell</TableCell>
							<TableCell sx={{ minWidth: 200 }}>Yarn Group</TableCell>
							{Array.from({ length: BREAKER_CARD_READINGS }).map((_, i) => (
								<TableCell key={`wt-h-${i}`} align="center" sx={{ minWidth: 92 }}>
									Wt {i + 1} (g)
								</TableCell>
							))}
							{Array.from({ length: BREAKER_CARD_READINGS }).map((_, i) => (
								<TableCell key={`mr-h-${i}`} align="center" sx={{ minWidth: 84 }}>
									MR% {i + 1}
								</TableCell>
							))}
							<TableCell align="right" sx={{ minWidth: 100 }}>
								Obs Wt (lbs)
							</TableCell>
							<TableCell align="right" sx={{ minWidth: 100 }}>
								Corr Wt (lbs)
							</TableCell>
							<TableCell align="right" sx={{ minWidth: 90 }}>
								CV %
							</TableCell>
							<TableCell align="center" sx={{ width: 56 }} />
						</TableRow>
					</TableHead>
					<TableBody>
						{rows.map((r) => {
							// A yarn group has no std → preview uses std 16, no CV band.
							const preview = computeRowPreview(r.weights, r.mrPcts, stdMrFor(r.groupId) ?? undefined);
							const cvPass = preview?.withinBand;
							return (
								<TableRow key={r.key} hover>
									<TableCell>{renderMachineSelect(r)}</TableCell>
									<TableCell>{renderSpellSelect(r)}</TableCell>
									<TableCell sx={{ minWidth: 190 }}>{renderGroupSelect(r)}</TableCell>
									{r.weights.map((w, i) => (
										<TableCell key={`${r.key}-wt-${i}`} align="center">
											<TextField
												type="number"
												size="small"
												value={w}
												onChange={(e) => setWeightAt(r.key, i, e.target.value)}
												inputProps={{ step: "any", min: 0, "aria-label": `Weight ${i + 1}` }}
												sx={{ width: 80 }}
											/>
										</TableCell>
									))}
									{r.mrPcts.map((m, i) => (
										<TableCell key={`${r.key}-mr-${i}`} align="center">
											<TextField
												type="number"
												size="small"
												value={m}
												onChange={(e) => setMrAt(r.key, i, e.target.value)}
												inputProps={{ step: "any", min: 0, "aria-label": `MR% ${i + 1}` }}
												sx={{ width: 72 }}
											/>
										</TableCell>
									))}
									<TableCell align="right">
										<Typography variant="body2">
											{preview?.avgWt != null ? gmsToLbs(preview.avgWt).toFixed(2) : "—"}
										</Typography>
									</TableCell>
									<TableCell align="right">
										<Typography variant="body2" fontWeight={600}>
											{preview?.corrWt != null ? gmsToLbs(preview.corrWt).toFixed(2) : "—"}
										</Typography>
									</TableCell>
									<TableCell
										align="right"
										sx={
											preview?.cvPct == null || cvPass == null
												? undefined
												: cvPass
												? {
														color: "success.main",
														fontWeight: 700,
														bgcolor: (theme) => alpha(theme.palette.success.main, 0.12),
												  }
												: {
														color: "error.main",
														fontWeight: 700,
														bgcolor: (theme) => alpha(theme.palette.error.main, 0.12),
												  }
										}
									>
										{preview?.cvPct != null ? `${preview.cvPct.toFixed(2)}%` : "—"}
									</TableCell>
									<TableCell align="center">
										<Tooltip title="Remove row">
											<IconButton
												size="small"
												color="error"
												onClick={() => removeRow(r.key)}
												sx={{ minWidth: 40, minHeight: 40 }}
											>
												<DeleteOutlineIcon size={16} />
											</IconButton>
										</Tooltip>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</TableContainer>

			{/* Phones: one card per reading row, every input full-width on its own
			    line — no horizontal scrolling. */}
			<Box sx={{ display: { xs: "flex", md: "none" }, flexDirection: "column", gap: 2 }}>
				{rows.map((r, idx) => {
					const preview = computeRowPreview(r.weights, r.mrPcts, stdMrFor(r.groupId) ?? undefined);
					const cvPass = preview?.withinBand;
					return (
						<Paper
							key={r.key}
							variant="outlined"
							sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}
						>
							<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
								<Typography variant="subtitle2">Row {idx + 1}</Typography>
								<Tooltip title="Remove row">
									<IconButton
										size="small"
										color="error"
										onClick={() => removeRow(r.key)}
										sx={{ minWidth: 40, minHeight: 40 }}
									>
										<DeleteOutlineIcon size={16} />
									</IconButton>
								</Tooltip>
							</Box>
							{renderMachineSelect(r, "Machine (Mc)")}
							{renderSpellSelect(r, "Spell")}
							{renderGroupSelect(r, "Yarn Group")}
							{r.weights.map((w, i) => (
								<TextField
									key={`${r.key}-wt-${i}`}
									type="number"
									size="small"
									fullWidth
									label={`Wt ${i + 1} (g)`}
									value={w}
									onChange={(e) => setWeightAt(r.key, i, e.target.value)}
									inputProps={{ step: "any", min: 0, "aria-label": `Weight ${i + 1}` }}
								/>
							))}
							{r.mrPcts.map((m, i) => (
								<TextField
									key={`${r.key}-mr-${i}`}
									type="number"
									size="small"
									fullWidth
									label={`MR% ${i + 1}`}
									value={m}
									onChange={(e) => setMrAt(r.key, i, e.target.value)}
									inputProps={{ step: "any", min: 0, "aria-label": `MR% ${i + 1}` }}
								/>
							))}
							<Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
								<Typography variant="body2">
									Obs Wt: {preview?.avgWt != null ? gmsToLbs(preview.avgWt).toFixed(2) : "—"}
								</Typography>
								<Typography variant="body2" fontWeight={600}>
									Corr Wt: {preview?.corrWt != null ? gmsToLbs(preview.corrWt).toFixed(2) : "—"}
								</Typography>
								<Typography
									variant="body2"
									sx={
										preview?.cvPct == null || cvPass == null
											? undefined
											: { color: cvPass ? "success.main" : "error.main", fontWeight: 700 }
									}
								>
									CV: {preview?.cvPct != null ? `${preview.cvPct.toFixed(2)}%` : "—"}
								</Typography>
							</Box>
						</Paper>
					);
				})}
			</Box>

			{error ? (
				<Alert severity="error" onClose={() => setError(null)}>
					{error}
				</Alert>
			) : null}

			<Box
				sx={{
					position: { xs: "sticky", md: "static" },
					bottom: 0,
					bgcolor: "background.paper",
					py: 1,
					display: "flex",
					justifyContent: { xs: "stretch", md: "flex-end" },
				}}
			>
				<Button
					variant="contained"
					startIcon={<SaveIcon size={18} />}
					onClick={handleSave}
					disabled={saving}
					sx={{ minHeight: 44, width: { xs: "100%", md: "auto" } }}
				>
					{saving ? "Saving…" : "Save All Rows"}
				</Button>
			</Box>

			<Snackbar
				open={!!snack}
				autoHideDuration={3000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</Box>
	);
}
