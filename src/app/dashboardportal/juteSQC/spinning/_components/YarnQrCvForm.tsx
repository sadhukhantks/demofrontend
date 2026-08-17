"use client";

import * as React from "react";
import { Alert, Autocomplete, Box, Button, Divider, Snackbar, TextField, Typography } from "@mui/material";
import { Save as SaveIcon } from "lucide-react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { populationStdDev } from "@/app/dashboardportal/juteProduction/spinning/utils/spinningCalc";
import type { SqcQrCvSetup, SqcQrCvSavePayloadRow, SqcYarnObs } from "../types/sqcSpinningTypes";

type Props = {
	coId: string;
	branchId: number;
	entryDate: string;
	setup: SqcQrCvSetup;
	onSaved: () => void;
};

// Fixed layout per spec §9.1 / §11: 6 spindles × 5 readings = 30 readings.
const SPINDLE_COUNT = 6;
const READINGS_PER_SPINDLE = 5;

// Each spindle block holds an entered spindle position number + 5 reading strings.
type SpindleBlock = { spindle_no: string; readings: string[] };

const emptySpindle = (): SpindleBlock => ({
	spindle_no: "",
	readings: Array.from({ length: READINGS_PER_SPINDLE }, () => ""),
});

const emptySpindles = (): SpindleBlock[] => Array.from({ length: SPINDLE_COUNT }, emptySpindle);

function round2(x: number): number {
	return Math.round(x * 100) / 100;
}

export default function YarnQrCvForm({ coId, branchId, entryDate, setup, onSaved }: Props) {
	const [spellId, setSpellId] = React.useState<number | "">("");
	const [machineId, setMachineId] = React.useState<number | "">("");
	const [yarnItemId, setYarnItemId] = React.useState<number | "">("");
	const [spindles, setSpindles] = React.useState<SpindleBlock[]>(emptySpindles);
	const [saving, setSaving] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	// Yarn options = the yarns that have R-08-16 readings today (unique by item).
	const yarnOptions = React.useMemo(() => {
		const seen = new Map<number, SqcYarnObs>();
		for (const o of setup.yarn_obs) if (!seen.has(o.item_id)) seen.set(o.item_id, o);
		return Array.from(seen.values());
	}, [setup.yarn_obs]);
	const selectedYarn: SqcYarnObs | undefined = yarnOptions.find((y) => y.item_id === Number(yarnItemId));

	// observed_count + MR% obtained come from the R-08-16 reading of the EXACT
	// (spell, frame, yarn) selection — no date-level average.
	const allKeysPicked = spellId !== "" && machineId !== "" && yarnItemId !== "";
	const selectedObs: SqcYarnObs | undefined = allKeysPicked
		? setup.yarn_obs.find(
				(y) =>
					y.spell_id === Number(spellId) &&
					y.mc_id === Number(machineId) &&
					y.item_id === Number(yarnItemId)
			)
		: undefined;
	const observedCount = selectedObs?.observed_count ?? null;
	const mrObtained = selectedObs?.mr_pct ?? null;
	const noObsForKey = allKeysPicked && !selectedObs;

	const noYarnObs = setup.yarn_obs.length === 0;

	// Live preview (server recomputes on save and is authoritative). Collect every
	// numeric reading across the 6 spindles; ignore blanks (server stores NULL).
	const numericReadings = React.useMemo(
		() =>
			spindles
				.flatMap((s) => s.readings)
				.filter((r) => r !== "")
				.map((r) => Number(r))
				.filter((n) => Number.isFinite(n)),
		[spindles]
	);

	const n = numericReadings.length;
	const avgBs = n > 0 ? numericReadings.reduce((acc, v) => acc + v, 0) / n : null;
	const maxVal = n > 0 ? Math.max(...numericReadings) : null;
	const minVal = n > 0 ? Math.min(...numericReadings) : null;
	// Population SD (÷n) — matches the lab Excel sheet SQRT(SUM((x-mean)^2)/n).
	const stdDev = populationStdDev(numericReadings);
	// QR% = (avg_bs / observed_count) × 100; null when observed_count is 0/null.
	const qrPct =
		avgBs != null && observedCount != null && observedCount !== 0
			? (avgBs / observedCount) * 100
			: null;
	// CV% = (std_dev / avg_bs) × 100 (lab Excel: SD ÷ MV × 100); null when avg is 0/null.
	const cvPct = stdDev != null && avgBs != null && avgBs !== 0 ? (stdDev / avgBs) * 100 : null;

	const setSpindleNo = (i: number, value: string) =>
		setSpindles((prev) => prev.map((s, idx) => (idx === i ? { ...s, spindle_no: value } : s)));

	const setReading = (i: number, j: number, value: string) =>
		setSpindles((prev) =>
			prev.map((s, idx) =>
				idx === i ? { ...s, readings: s.readings.map((r, rIdx) => (rIdx === j ? value : r)) } : s
			)
		);

	const clearReadings = () => setSpindles(emptySpindles());

	// spell + machine + yarn required; all 6 spindle_no must be filled.
	const allSpindleNosFilled = spindles.every((s) => s.spindle_no !== "");
	const formInvalid = !spellId || !machineId || !yarnItemId || !allSpindleNosFilled;

	const handleSave = async () => {
		if (!spellId) {
			setError("Select a spell.");
			return;
		}
		if (!yarnItemId) {
			setError("Select a yarn.");
			return;
		}
		if (!machineId) {
			setError("Select a machine (MC No.).");
			return;
		}
		if (!allSpindleNosFilled) {
			const missing = spindles.map((s, i) => (s.spindle_no === "" ? i + 1 : null)).filter(Boolean);
			setError(`Enter the spindle position number for Spindle #${missing.join(", #")} (first box of each row).`);
			return;
		}
		if (n === 0) {
			setError("Enter at least one B/S reading.");
			return;
		}
		setSaving(true);
		setError(null);
		const row: SqcQrCvSavePayloadRow = {
			spell_id: Number(spellId),
			mc_id: Number(machineId),
			item_id: Number(yarnItemId),
			spindles: spindles.map((s) => ({
				spindle_no: Number(s.spindle_no),
				readings: s.readings.map((r) => (r === "" ? null : Number(r))),
			})),
		};
		const body = {
			co_id: Number(coId),
			branch_id: Number(branchId),
			entry_date: entryDate,
			entries: [row],
		};
		const { error: err } = await fetchWithCookie<{ data: { saved: number } }>(
			apiRoutesPortalMasters.SPINNING_SQC_QR_CV_SAVE,
			"POST",
			body
		);
		setSaving(false);
		if (err) {
			setError(err);
			return;
		}
		const yName = selectedYarn?.item_name ?? yarnItemId;
		setSnack(`Saved QR/CV readings for ${yName}`);
		// Keep machine/yarn so the inspector can punch many groups quickly.
		clearReadings();
		onSaved();
	};

	if (noYarnObs) {
		return (
			<Alert severity="info">
				No R-08-16 count readings for this date — enter them on the R-08-16 tab first.
			</Alert>
		);
	}

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<Box
				sx={{
					display: "grid",
					gap: 2,
					gridTemplateColumns: {
						xs: "1fr",
						sm: "repeat(2, minmax(0, 1fr))",
						md: "repeat(5, minmax(0, 1fr))",
					},
				}}
			>
				<Autocomplete
					options={setup.spells}
					getOptionLabel={(s) => `${s.spell_name} (${s.spell_code})`}
					value={setup.spells.find((s) => s.spell_id === spellId) ?? null}
					onChange={(_, newVal) => setSpellId(newVal ? newVal.spell_id : "")}
					size="small"
					renderInput={(params) => <TextField {...params} label="Spell" />}
					isOptionEqualToValue={(opt, val) => opt.spell_id === val.spell_id}
				/>
				<Autocomplete
					options={yarnOptions}
					getOptionLabel={(y) => `${y.item_name ?? ""} (${y.item_code ?? ""})`}
					value={yarnOptions.find((y) => y.item_id === yarnItemId) ?? null}
					onChange={(_, newVal) => setYarnItemId(newVal ? newVal.item_id : "")}
					size="small"
					renderInput={(params) => <TextField {...params} label="Yarn" />}
					isOptionEqualToValue={(opt, val) => opt.item_id === val.item_id}
				/>
				<Autocomplete
					options={setup.machines}
					getOptionLabel={(m) => `${m.machine_name} (${m.mech_code})`}
					value={setup.machines.find((m) => m.machine_id === machineId) ?? null}
					onChange={(_, newVal) => setMachineId(newVal ? newVal.machine_id : "")}
					size="small"
					clearOnEscape
					renderInput={(params) => <TextField {...params} label="Machine (MC No.)" />}
					isOptionEqualToValue={(opt, val) => opt.machine_id === val.machine_id}
				/>
				<TextField
					label="Observed Count"
					value={observedCount != null ? observedCount.toFixed(2) : ""}
					size="small"
					fullWidth
					error={noObsForKey}
					InputProps={{ readOnly: true }}
					helperText={
						noObsForKey
							? "No R-08-16 reading for this frame + spell + yarn"
							: "R-08-16 count for this frame + spell"
					}
				/>
				<TextField
					label="MR % obtained"
					value={mrObtained != null ? mrObtained.toFixed(2) : ""}
					size="small"
					fullWidth
					error={noObsForKey}
					InputProps={{ readOnly: true }}
					helperText={
						noObsForKey ? "No R-08-16 reading for this key" : "R-08-16 MR% for this frame + spell"
					}
				/>
			</Box>

			<Divider />

			{/* 6 spindle blocks: each = a spindle_no + 5 readings. */}
			<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
				{spindles.map((s, i) => (
					<Box
						key={i}
						sx={{
							display: "grid",
							gap: 1.5,
							alignItems: "start",
							gridTemplateColumns: {
								xs: "1fr",
								sm: "repeat(2, minmax(0, 1fr))",
								md: "repeat(6, minmax(0, 1fr))",
							},
						}}
					>
						<TextField
							type="number"
							label={`Spindle #${i + 1}`}
							value={s.spindle_no}
							onChange={(e) => setSpindleNo(i, e.target.value)}
							size="small"
							fullWidth
							inputProps={{ step: "any", min: 0 }}
						/>
						{s.readings.map((r, j) => (
							<TextField
								key={j}
								type="number"
								label={`Reading ${j + 1}`}
								value={r}
								onChange={(e) => setReading(i, j, e.target.value)}
								size="small"
								fullWidth
								inputProps={{ step: "any", min: 0 }}
							/>
						))}
					</Box>
				))}
			</Box>

			<Divider />

			{/* Live preview — server recomputes on save and is authoritative. */}
			<Box
				sx={{
					display: "grid",
					gap: 2,
					gridTemplateColumns: {
						xs: "repeat(2, minmax(0, 1fr))",
						sm: "repeat(3, minmax(0, 1fr))",
						md: "repeat(6, minmax(0, 1fr))",
					},
				}}
			>
				<TextField
					label="Avg B/S"
					value={avgBs != null ? round2(avgBs).toFixed(2) : ""}
					size="small"
					fullWidth
					InputProps={{ readOnly: true }}
				/>
				<TextField
					label="Max"
					value={maxVal != null ? round2(maxVal).toFixed(2) : ""}
					size="small"
					fullWidth
					InputProps={{ readOnly: true }}
				/>
				<TextField
					label="Min"
					value={minVal != null ? round2(minVal).toFixed(2) : ""}
					size="small"
					fullWidth
					InputProps={{ readOnly: true }}
				/>
				<TextField
					label="Std Dev"
					value={stdDev != null ? round2(stdDev).toFixed(2) : ""}
					size="small"
					fullWidth
					InputProps={{ readOnly: true }}
					helperText="population (÷n)"
				/>
				<TextField
					label="QR %"
					value={qrPct != null ? round2(qrPct).toFixed(2) : ""}
					size="small"
					fullWidth
					InputProps={{ readOnly: true }}
					helperText="avg B/S ÷ obs × 100"
				/>
				<TextField
					label="CV %"
					value={cvPct != null ? round2(cvPct).toFixed(2) : ""}
					size="small"
					fullWidth
					InputProps={{ readOnly: true }}
					helperText="std dev ÷ avg B/S × 100"
				/>
			</Box>

			<Typography variant="caption" color="text.secondary">
				Preview only — the server recomputes max/min/std dev/QR%/CV% on save.
			</Typography>

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
					{saving ? "Saving…" : "Save"}
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
