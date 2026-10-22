"use client";

import * as React from "react";
import {
	Alert,
	Autocomplete,
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	IconButton,
	List,
	ListItem,
	ListItemText,
	Paper,
	Snackbar,
	TextField,
	Typography,
} from "@mui/material";
import {
	Plus as AddIcon,
	Save as SaveIcon,
	Trash2 as DeleteOutlineIcon,
} from "lucide-react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { dmToPpi, equalsStandard, findRowsEqualToStandard, stdHint } from "../pickUnits";
import { EMPTY_STANDARDS, type WeavingPickStandardsMap } from "../hooks/useWeavingPickStandards";

// ---- Shared-contract option shapes (see weaving SQC backend contract) ----
export type WeavingQualityOption = {
	weaving_quality_id: number;
	item_id: number;
	item_code: string | null;
	item_name: string | null;
	weaving_quality_code: string | null;
	weaving_quality_name: string | null;
};

export type WeavingLoomOption = {
	machine_id: number;
	machine_name: string | null;
	mech_code: string | null;
	line_no: number | null;
	branch_id: number | null;
};

export type WeavingPickSetup = {
	qualities: WeavingQualityOption[];
	looms: WeavingLoomOption[];
	readings: unknown[];
	summary: unknown[];
};

// One staged (not-yet-saved) observation row. picks_dm is the as-typed value;
// the server converts to PPI (picks = picks_dm × 0.254) on save. Width and
// picks/dm are each optional — every row carries at least one of them.
type StagedRow = {
	weaving_quality_id: number;
	machine_id: number;
	width: number | null;
	picks_dm: number | null;
	// display labels captured at stage time
	qualityLabel: string;
	loomLabel: string;
};

type Props = {
	coId: string;
	branchId: number;
	entryDate: string;
	setup: WeavingPickSetup;
	onSaved: () => void;
	/** ITM-013: per-quality standard picks (hint + equals-standard confirm).
	 * Never used to prefill — the Picks / dm input always starts empty. */
	standards?: WeavingPickStandardsMap;
};

function qualityLabel(q: WeavingQualityOption): string {
	return `${q.weaving_quality_code ?? ""} — ${q.weaving_quality_name ?? ""}`.trim();
}

function loomLabel(l: WeavingLoomOption): string {
	return `${l.mech_code ?? ""} ${l.machine_name ?? ""}`.trim();
}

export default function PickForm({
	coId,
	branchId,
	entryDate,
	setup,
	onSaved,
	standards = EMPTY_STANDARDS,
}: Props) {
	const [qualityId, setQualityId] = React.useState<number | "">("");
	const [machineId, setMachineId] = React.useState<number | "">("");
	// NO prefill: width and picks/dm start empty and are cleared after Add Row;
	// a standard is never assigned to the input value (ITM-013).
	const [width, setWidth] = React.useState<string>("");
	const [picksDm, setPicksDm] = React.useState<string>("");
	const [rows, setRows] = React.useState<StagedRow[]>([]);
	const [saving, setSaving] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);
	// Equals-standard confirm step: indices of the staged rows that equal their
	// quality's standard at 2 dp PPI, shown before the POST.
	const [confirmOpen, setConfirmOpen] = React.useState(false);
	const [confirmRows, setConfirmRows] = React.useState<number[]>([]);

	const selectedQuality = setup.qualities.find((q) => q.weaving_quality_id === Number(qualityId)) ?? null;
	const selectedLoom = setup.looms.find((l) => l.machine_id === Number(machineId)) ?? null;

	// Quality + loom required; Width and Picks/dm each optional, but every
	// reading needs at least one of them (> 0). Both together are fine too.
	const widthNum = width === "" ? null : Number(width);
	const picksDmNum = picksDm === "" ? null : Number(picksDm);
	const formInvalid =
		!qualityId ||
		!machineId ||
		(widthNum == null && picksDmNum == null) ||
		(widthNum != null && widthNum <= 0) ||
		(picksDmNum != null && picksDmNum <= 0);

	// Live PPI preview of the as-typed picks/dm value.
	const livePpi = picksDm !== "" && Number(picksDm) > 0 ? dmToPpi(Number(picksDm)) : null;

	// The standard for the selected quality — a hint beside the input, and the
	// value the typed reading is compared with (2 dp PPI, same rule as the server).
	const std = selectedQuality ? standards[selectedQuality.weaving_quality_id] : undefined;
	const typedEqualsStd = equalsStandard(picksDmNum, std?.std_picks_ppi);
	const picksHelper =
		`= ${livePpi != null ? livePpi.toFixed(2) : "—"} PPI · ${stdHint(std, !!selectedQuality)}` +
		(typedEqualsStd ? " — equals standard" : "");

	const rowEqualsStd = (r: StagedRow): boolean =>
		equalsStandard(r.picks_dm, standards[r.weaving_quality_id]?.std_picks_ppi);
	const rowStdDm = (r: StagedRow): string => {
		const s = standards[r.weaving_quality_id];
		return s ? s.std_picks_dm.toFixed(2) : "—";
	};

	// Stage a row locally (multi-observation — POST all on save).
	const handleAddRow = () => {
		if (formInvalid || !selectedQuality || !selectedLoom) {
			setError("Select a quality and loom and enter Width (> 0) and/or Picks / dm (> 0) — at least one.");
			return;
		}
		setError(null);
		setRows((prev) => [
			...prev,
			{
				weaving_quality_id: selectedQuality.weaving_quality_id,
				machine_id: selectedLoom.machine_id,
				width: widthNum,
				picks_dm: picksDmNum,
				qualityLabel: qualityLabel(selectedQuality),
				loomLabel: loomLabel(selectedLoom),
			},
		]);
		// Keep quality + loom selected so the inspector can punch many readings quickly.
		setWidth("");
		setPicksDm("");
	};

	const handleRemoveRow = (idx: number) => {
		setRows((prev) => prev.filter((_, i) => i !== idx));
	};

	// POST all staged rows to the save endpoint — exactly what was typed; the
	// server stores it as-is and never substitutes a standard.
	const doSave = async () => {
		setSaving(true);
		setError(null);
		const body = {
			co_id: Number(coId),
			branch_id: Number(branchId),
			entry_date: entryDate,
			// Send picks_dm only — the server converts and stores picks (PPI).
			entries: rows.map((r) => ({
				weaving_quality_id: r.weaving_quality_id,
				machine_id: r.machine_id,
				width: r.width,
				picks_dm: r.picks_dm,
			})),
		};
		const { error: err } = await fetchWithCookie<{ data: { saved: number } }>(
			apiRoutesPortalMasters.WEAVING_SQC_PICK_SAVE,
			"POST",
			body
		);
		setSaving(false);
		if (err) {
			setError(err);
			return;
		}
		setSnack(`Saved ${rows.length} reading${rows.length === 1 ? "" : "s"}`);
		setRows([]);
		onSaved();
	};

	// Save: rows equal to the standard need an explicit "yes, measured" first.
	const handleSaveAll = () => {
		if (rows.length === 0) {
			setError("Add at least one observation row before saving.");
			return;
		}
		const equalIdx = findRowsEqualToStandard(rows, standards);
		if (equalIdx.length > 0) {
			setConfirmRows(equalIdx);
			setConfirmOpen(true);
			return;
		}
		void doSave();
	};

	const handleConfirmCancel = () => {
		// Rows stay staged; nothing is posted.
		setConfirmOpen(false);
	};

	const handleConfirmSave = () => {
		setConfirmOpen(false);
		void doSave();
	};

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<Box
				sx={{
					display: "grid",
					gap: 2,
					gridTemplateColumns: {
						xs: "1fr",
						sm: "repeat(2, minmax(0, 1fr))",
						md: "repeat(4, minmax(0, 1fr))",
					},
				}}
			>
				<Autocomplete
					options={setup.qualities}
					getOptionLabel={qualityLabel}
					value={selectedQuality}
					onChange={(_, newVal) => setQualityId(newVal ? newVal.weaving_quality_id : "")}
					size="small"
					autoHighlight
					renderInput={(params) => <TextField {...params} label="Quality" />}
					isOptionEqualToValue={(opt, val) => opt.weaving_quality_id === val.weaving_quality_id}
				/>
				<Autocomplete
					options={setup.looms}
					getOptionLabel={loomLabel}
					value={selectedLoom}
					onChange={(_, newVal) => setMachineId(newVal ? newVal.machine_id : "")}
					size="small"
					autoHighlight
					renderInput={(params) => <TextField {...params} label="Loom No" />}
					isOptionEqualToValue={(opt, val) => opt.machine_id === val.machine_id}
				/>
				<TextField
					type="number"
					label="Width"
					value={width}
					onChange={(e) => setWidth(e.target.value)}
					size="small"
					fullWidth
					inputProps={{ step: "any", min: 0 }}
					helperText="Width and/or Picks / dm"
				/>
				<TextField
					type="number"
					label="Picks / dm"
					value={picksDm}
					onChange={(e) => setPicksDm(e.target.value)}
					size="small"
					fullWidth
					inputProps={{ step: "any", min: 0 }}
					helperText={picksHelper}
					color={typedEqualsStd ? "warning" : undefined}
					slotProps={{
						formHelperText: { sx: typedEqualsStd ? { color: "warning.main" } : undefined },
					}}
				/>
			</Box>

			{error ? (
				<Alert severity="error" onClose={() => setError(null)}>
					{error}
				</Alert>
			) : null}

			<Box
				sx={{
					display: "flex",
					gap: 1.5,
					flexWrap: "wrap",
					justifyContent: { xs: "stretch", md: "flex-end" },
				}}
			>
				<Button
					variant="outlined"
					startIcon={<AddIcon size={18} />}
					onClick={handleAddRow}
					disabled={formInvalid}
					sx={{ minHeight: 44, width: { xs: "100%", md: "auto" } }}
				>
					Add Row
				</Button>
				<Button
					variant="contained"
					startIcon={<SaveIcon size={18} />}
					onClick={handleSaveAll}
					disabled={rows.length === 0 || saving}
					sx={{ minHeight: 44, width: { xs: "100%", md: "auto" } }}
				>
					{saving ? "Saving…" : `Save ${rows.length || ""} Reading${rows.length === 1 ? "" : "s"}`.trim()}
				</Button>
			</Box>

			{/* Staged rows (not yet persisted) — wide table on desktop/tablet, hidden on phones. */}
			{rows.length > 0 ? (
				<Box
					component="table"
					sx={{
						display: { xs: "none", md: "table" },
						width: "100%",
						borderCollapse: "collapse",
						"& th, & td": {
							borderBottom: "1px solid",
							borderColor: "divider",
							px: 1,
							py: 0.75,
							textAlign: "left",
							fontSize: 14,
						},
						"& th": { color: "text.secondary", fontWeight: 600 },
					}}
				>
					<Box component="thead">
						<Box component="tr">
							<Box component="th">Quality</Box>
							<Box component="th">Loom</Box>
							<Box component="th" sx={{ textAlign: "right!important" }}>
								Width
							</Box>
							<Box component="th" sx={{ textAlign: "right!important" }}>
								Picks / dm
							</Box>
							<Box component="th" sx={{ textAlign: "right!important" }}>
								Std picks/dm
							</Box>
							<Box component="th" sx={{ textAlign: "right!important" }}>
								PPI
							</Box>
							<Box component="th" sx={{ width: 56 }} />
						</Box>
					</Box>
					<Box component="tbody">
						{rows.map((r, i) => (
							<Box component="tr" key={`${r.weaving_quality_id}-${r.machine_id}-${i}`}>
								<Box component="td">{r.qualityLabel}</Box>
								<Box component="td">{r.loomLabel}</Box>
								<Box component="td" sx={{ textAlign: "right!important" }}>
									{r.width != null ? r.width.toFixed(2) : "—"}
								</Box>
								<Box component="td" sx={{ textAlign: "right!important" }}>
									{r.picks_dm != null ? r.picks_dm.toFixed(2) : "—"}
								</Box>
								<Box component="td" sx={{ textAlign: "right!important", color: "text.secondary" }}>
									{rowStdDm(r)}
								</Box>
								<Box
									component="td"
									sx={{ textAlign: "right!important", color: rowEqualsStd(r) ? "warning.main" : "inherit" }}
								>
									{r.picks_dm != null ? dmToPpi(r.picks_dm).toFixed(2) : "—"}
									{rowEqualsStd(r) ? " (= std)" : ""}
								</Box>
								<Box component="td">
									<Button
										size="small"
										color="error"
										onClick={() => handleRemoveRow(i)}
										sx={{ minWidth: 0, p: 0.5 }}
									>
										<DeleteOutlineIcon size={16} />
									</Button>
								</Box>
							</Box>
						))}
					</Box>
				</Box>
			) : null}

			{/* Phones: one card per staged row — no horizontal scrolling. */}
			{rows.length > 0 ? (
				<Box sx={{ display: { xs: "flex", md: "none" }, flexDirection: "column", gap: 2 }}>
					{rows.map((r, i) => (
						<Paper
							key={`${r.weaving_quality_id}-${r.machine_id}-${i}`}
							variant="outlined"
							sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}
						>
							<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
								<Typography variant="subtitle2">Row {i + 1}</Typography>
								<IconButton
									size="small"
									color="error"
									onClick={() => handleRemoveRow(i)}
									sx={{ minWidth: 40, minHeight: 40 }}
								>
									<DeleteOutlineIcon size={16} />
								</IconButton>
							</Box>
							<Typography variant="body2">Quality: {r.qualityLabel}</Typography>
							<Typography variant="body2">Loom: {r.loomLabel}</Typography>
							<Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
								<Typography variant="body2">
									Width: {r.width != null ? r.width.toFixed(2) : "—"}
								</Typography>
								<Typography
									variant="body2"
									fontWeight={600}
									sx={{ color: rowEqualsStd(r) ? "warning.main" : undefined }}
								>
									Picks/dm:{" "}
									{r.picks_dm != null
										? `${r.picks_dm.toFixed(2)} (= ${dmToPpi(r.picks_dm).toFixed(2)} PPI)`
										: "—"}
									{rowEqualsStd(r) ? " · = std" : ""}
								</Typography>
							</Box>
							<Typography variant="caption" color="text.secondary">
								Std picks/dm: {rowStdDm(r)}
							</Typography>
						</Paper>
					))}
				</Box>
			) : null}

			{/* ITM-013: equals-standard confirm — once per Save batch, listing every
			    equal row. Cancel keeps the rows staged and posts nothing. */}
			<Dialog open={confirmOpen} onClose={handleConfirmCancel} fullWidth maxWidth="sm">
				<DialogTitle>Equals standard — is this a measured value?</DialogTitle>
				<DialogContent dividers>
					<Alert severity="warning" sx={{ mb: 1.5 }}>
						{confirmRows.length} reading{confirmRows.length === 1 ? "" : "s"} equal the quality standard to
						two decimals. Save only if these were actually measured on the loom.
					</Alert>
					<List dense disablePadding>
						{confirmRows.map((idx) => {
							const r = rows[idx];
							if (!r || r.picks_dm == null) return null;
							const s = standards[r.weaving_quality_id];
							return (
								<ListItem key={`${idx}-${r.weaving_quality_id}-${r.machine_id}`} disableGutters>
									<ListItemText
										primary={`${r.qualityLabel} · ${r.loomLabel}`}
										secondary={`${r.picks_dm.toFixed(2)} picks/dm (= ${dmToPpi(r.picks_dm).toFixed(2)} PPI) — std ${
											s ? s.std_picks_dm.toFixed(2) : "—"
										} picks/dm`}
									/>
								</ListItem>
							);
						})}
					</List>
				</DialogContent>
				<DialogActions
					sx={{
						flexDirection: { xs: "column", sm: "row" },
						gap: 1,
						"& > *": { width: { xs: "100%", sm: "auto" }, minHeight: 44 },
					}}
				>
					<Button variant="outlined" onClick={handleConfirmCancel}>
						Cancel
					</Button>
					<Button variant="contained" onClick={handleConfirmSave} disabled={saving}>
						Yes — these are measured
					</Button>
				</DialogActions>
			</Dialog>

			<Snackbar
				open={!!snack}
				autoHideDuration={3000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</Box>
	);
}
