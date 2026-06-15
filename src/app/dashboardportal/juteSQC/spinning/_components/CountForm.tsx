"use client";

import * as React from "react";
import { Alert, Box, Button, MenuItem, Snackbar, TextField } from "@mui/material";
import { Plus as AddIcon } from "lucide-react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { SqcCountSetup, SqcCountSavePayloadRow } from "../types/sqcSpinningTypes";

type Props = {
	coId: string;
	branchId: number;
	entryDate: string;
	setup: SqcCountSetup;
	onSaved: () => void;
};

export default function CountForm({ coId, branchId, entryDate, setup, onSaved }: Props) {
	const [spellId, setSpellId] = React.useState<number | "">(""); // optional
	const [machineId, setMachineId] = React.useState<number | "">(""); // optional
	const [yarnQualityId, setYarnQualityId] = React.useState<number | "">("");
	const [observedCount, setObservedCount] = React.useState<string>("");
	const [saving, setSaving] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	// Quality + observed count are required; spell and machine are optional.
	const formInvalid = !yarnQualityId || observedCount === "" || Number(observedCount) <= 0;

	// "Add reading" appends a new observation row (multi-observation, NOT upsert).
	const handleAddReading = async () => {
		if (formInvalid) {
			setError("Select a quality and enter an observed count > 0.");
			return;
		}
		setSaving(true);
		setError(null);
		const reading: SqcCountSavePayloadRow = {
			spell_id: spellId === "" ? null : Number(spellId),
			mc_id: machineId === "" ? null : Number(machineId),
			yarn_quality_id: Number(yarnQualityId),
			observed_count: Number(observedCount),
		};
		const body = {
			co_id: Number(coId),
			branch_id: Number(branchId),
			entry_date: entryDate,
			entries: [reading],
		};
		const { error: err } = await fetchWithCookie<{ data: { saved: number } }>(
			apiRoutesPortalMasters.SPINNING_SQC_COUNT_SAVE,
			"POST",
			body
		);
		setSaving(false);
		if (err) {
			setError(err);
			return;
		}
		const qName =
			setup.qualities.find((q) => q.yarn_quality_id === Number(yarnQualityId))?.quality_name ?? yarnQualityId;
		setSnack(`Added reading ${observedCount} for ${qName}`);
		// Keep spell/machine/quality so the inspector can punch many readings quickly.
		setObservedCount("");
		onSaved();
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
				<TextField
					select
					label="Spell (optional)"
					value={spellId}
					onChange={(e) => setSpellId(e.target.value === "" ? "" : Number(e.target.value))}
					size="small"
					fullWidth
				>
					<MenuItem value="">
						<em>None</em>
					</MenuItem>
					{setup.spells.map((s) => (
						<MenuItem key={s.spell_id} value={s.spell_id}>
							{s.spell_name} ({s.spell_code})
						</MenuItem>
					))}
				</TextField>
				<TextField
					select
					label="Machine (optional)"
					value={machineId}
					onChange={(e) => setMachineId(e.target.value === "" ? "" : Number(e.target.value))}
					size="small"
					fullWidth
				>
					<MenuItem value="">
						<em>None</em>
					</MenuItem>
					{setup.machines.map((m) => (
						<MenuItem key={m.machine_id} value={m.machine_id}>
							{m.machine_name} ({m.mech_code})
						</MenuItem>
					))}
				</TextField>
				<TextField
					select
					label="Yarn Quality"
					value={yarnQualityId}
					onChange={(e) => setYarnQualityId(e.target.value === "" ? "" : Number(e.target.value))}
					size="small"
					fullWidth
				>
					{setup.qualities.map((q) => (
						<MenuItem key={q.yarn_quality_id} value={q.yarn_quality_id}>
							{q.quality_name} ({q.quality_code})
						</MenuItem>
					))}
				</TextField>
				<TextField
					type="number"
					label="Observed Count"
					value={observedCount}
					onChange={(e) => setObservedCount(e.target.value)}
					size="small"
					fullWidth
				/>
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
					startIcon={<AddIcon size={18} />}
					onClick={handleAddReading}
					disabled={formInvalid || saving}
					sx={{ minHeight: 44, width: { xs: "100%", md: "auto" } }}
				>
					{saving ? "Adding…" : "Add Reading"}
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
