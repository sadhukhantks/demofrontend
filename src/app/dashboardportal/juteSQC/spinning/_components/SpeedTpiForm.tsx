"use client";

import * as React from "react";
import { Alert, Box, Button, MenuItem, Snackbar, TextField } from "@mui/material";
import { Save as SaveIcon } from "lucide-react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { SqcEntrySetup, SqcEntrySavePayloadRow } from "../types/sqcSpinningTypes";

type Props = {
	coId: string;
	branchId: number;
	entryDate: string;
	setup: SqcEntrySetup;
	onSaved: () => void;
};

export default function SpeedTpiForm({ coId, branchId, entryDate, setup, onSaved }: Props) {
	const [machineId, setMachineId] = React.useState<number | "">("");
	const [yarnItemId, setYarnItemId] = React.useState<number | "">("");
	const [actualSpeed, setActualSpeed] = React.useState<string>("");
	const [actualTpi, setActualTpi] = React.useState<string>("");
	const [saving, setSaving] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	// One active row per mc + quality + date. Disallow save with neither metric.
	const formInvalid =
		!machineId ||
		!yarnItemId ||
		(actualSpeed === "" && actualTpi === "");

	const handleSubmit = async () => {
		if (formInvalid) {
			setError("Select machine + yarn and enter speed and/or TPI.");
			return;
		}
		setSaving(true);
		setError(null);
		const entry: SqcEntrySavePayloadRow = {
			mc_id: Number(machineId),
			item_id: Number(yarnItemId),
			actual_speed: actualSpeed === "" ? null : Number(actualSpeed),
			actual_tpi: actualTpi === "" ? null : Number(actualTpi),
		};
		const body = {
			co_id: Number(coId),
			branch_id: Number(branchId),
			entry_date: entryDate,
			entries: [entry],
		};
		const { error: err } = await fetchWithCookie<{ data: { saved: number } }>(
			apiRoutesPortalMasters.SPINNING_SQC_ENTRY_SAVE,
			"POST",
			body
		);
		setSaving(false);
		if (err) {
			setError(err);
			return;
		}
		const mcName = setup.machines.find((m) => m.machine_id === Number(machineId))?.machine_name ?? machineId;
		setSnack(`Saved Speed/TPI for ${mcName}`);
		setActualSpeed("");
		setActualTpi("");
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
					label="Machine"
					value={machineId}
					onChange={(e) => setMachineId(e.target.value === "" ? "" : Number(e.target.value))}
					size="small"
					fullWidth
				>
					{setup.machines.map((m) => (
						<MenuItem key={m.machine_id} value={m.machine_id}>
							{m.machine_name} ({m.mech_code})
						</MenuItem>
					))}
				</TextField>
				<TextField
					select
					label="Yarn"
					value={yarnItemId}
					onChange={(e) => setYarnItemId(e.target.value === "" ? "" : Number(e.target.value))}
					size="small"
					fullWidth
				>
					{setup.yarn_items.map((y) => (
						<MenuItem key={y.item_id} value={y.item_id}>
							{y.item_name} ({y.item_code})
						</MenuItem>
					))}
				</TextField>
				<TextField
					type="number"
					label="Actual Speed"
					value={actualSpeed}
					onChange={(e) => setActualSpeed(e.target.value)}
					size="small"
					fullWidth
				/>
				<TextField
					type="number"
					label="Actual TPI"
					value={actualTpi}
					onChange={(e) => setActualTpi(e.target.value)}
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
					startIcon={<SaveIcon size={18} />}
					onClick={handleSubmit}
					disabled={formInvalid || saving}
					sx={{ minHeight: 44, width: { xs: "100%", md: "auto" } }}
				>
					{saving ? "Saving…" : "Save Speed/TPI"}
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
