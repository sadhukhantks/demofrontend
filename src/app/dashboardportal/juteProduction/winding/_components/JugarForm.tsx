"use client";

import * as React from "react";
import { Alert, Box, Button, MenuItem, Snackbar, TextField } from "@mui/material";
import { Save as SaveIcon } from "lucide-react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { WindingJugarSetup } from "../types/windingTypes";
import { useJugarPrevState } from "../hooks/useJugarPrevState";
import { JUGAR_MIN, JUGAR_MAX } from "../utils/windingCalc";

type Props = {
	coId: string;
	branchId: number;
	setup: WindingJugarSetup;
	date: string;
	spell: string;
	onSaved: () => void;
};

// Spindle leftover weight at the shift boundary, per machine, Opening ('O') or
// Closing ('C'). The carry-forward lookup pre-fills the weight and, when a row
// already exists for the date/spell/machine/open-close, returns its id so the
// form switches Save -> Update.
export default function JugarForm({ coId, branchId, setup, date, spell, onSaved }: Props) {
	const [machineId, setMachineId] = React.useState<number | "">("");
	const [openClose, setOpenClose] = React.useState<"O" | "C">("O");
	const [weight, setWeight] = React.useState<string>("");
	const [weightDirty, setWeightDirty] = React.useState(false);
	const [saving, setSaving] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	const { state: prevState } = useJugarPrevState(
		coId,
		machineId === "" ? null : Number(machineId),
		date,
		openClose,
		spell || null,
	);

	const existingId = prevState?.winding_jugar_id ?? null;
	const editing = existingId != null;

	// Pre-fill weight from the carry-forward value until the user types.
	React.useEffect(() => {
		if (!weightDirty && prevState) {
			setWeight(prevState.weight ? String(prevState.weight) : "");
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [prevState?.weight, prevState?.open_close, prevState?.winding_jugar_id]);

	// Reset the dirty flag when the key inputs change (new lookup context).
	React.useEffect(() => {
		setWeightDirty(false);
	}, [machineId, openClose, date, spell]);

	const weightNum = weight === "" ? 0 : Number(weight);
	const weightInRange = weightNum > JUGAR_MIN && weightNum <= JUGAR_MAX;

	const formInvalid =
		!date || !spell || machineId === "" || weight === "" || !weightInRange || saving;

	const handleSubmit = async () => {
		if (formInvalid) {
			setError(`Weight must be greater than ${JUGAR_MIN} and at most ${JUGAR_MAX} kg.`);
			return;
		}
		setSaving(true);
		setError(null);

		if (editing) {
			const url = `${apiRoutesPortalMasters.WINDING_JUGAR_UPDATE}/${existingId}?co_id=${coId}`;
			const { error: err } = await fetchWithCookie(url, "PUT", { weight: weightNum });
			setSaving(false);
			if (err) {
				setError(err);
				return;
			}
			setSnack(`Updated jugar #${existingId}`);
			onSaved();
			return;
		}

		const body = {
			co_id: Number(coId),
			branch_id: Number(branchId),
			tran_date: date,
			spell,
			machine_id: Number(machineId),
			open_close: openClose,
			weight: weightNum,
		};
		const { data, error: err } = await fetchWithCookie<{
			data: { winding_jugar_id: number };
		}>(apiRoutesPortalMasters.WINDING_JUGAR_SAVE, "POST", body);
		setSaving(false);
		if (err) {
			setError(err);
			return;
		}
		setSnack(`Saved jugar #${data?.data?.winding_jugar_id}`);
		setWeight("");
		setWeightDirty(false);
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
						md: "repeat(3, minmax(0, 1fr))",
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
							{m.mech_code} — {m.machine_name}
						</MenuItem>
					))}
				</TextField>
				<TextField
					select
					label="Open / Close"
					value={openClose}
					onChange={(e) => setOpenClose(e.target.value as "O" | "C")}
					size="small"
					fullWidth
				>
					<MenuItem value="O">Opening</MenuItem>
					<MenuItem value="C">Closing</MenuItem>
				</TextField>
				<TextField
					type="number"
					label="Jugar Weight"
					value={weight}
					onChange={(e) => {
						setWeight(e.target.value);
						setWeightDirty(true);
					}}
					size="small"
					fullWidth
					error={weight !== "" && !weightInRange}
					helperText={
						weight !== "" && !weightInRange ? `Must be > ${JUGAR_MIN} and ≤ ${JUGAR_MAX}` : ""
					}
				/>
			</Box>

			{editing ? (
				<Alert severity="info">
					An entry already exists for this machine / spell / {openClose === "O" ? "opening" : "closing"} —
					saving will update it.
				</Alert>
			) : null}

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
					disabled={formInvalid}
					sx={{ minHeight: 44, width: { xs: "100%", md: "auto" } }}
				>
					{saving ? "Saving…" : editing ? "Update" : "Save Jugar"}
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
