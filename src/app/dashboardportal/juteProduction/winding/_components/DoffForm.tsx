"use client";

import * as React from "react";
import { Alert, Box, Button, MenuItem, Snackbar, TextField } from "@mui/material";
import { Save as SaveIcon } from "lucide-react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { WindingDoffSetup } from "../types/windingTypes";
import { useWindingDoffPrevState } from "../hooks/useWindingDoffPrevState";
import {
	computeWindingNet,
	computeWindingNetPerMc,
	validateWindingNet,
	WINDING_NET_MIN,
	WINDING_NET_MAX,
} from "../utils/windingCalc";

type Props = {
	coId: string;
	branchId: number;
	setup: WindingDoffSetup;
	date: string;
	spell: string;
	onSaved: () => void;
};

// A combined doff is one weighing shared across 1..3 machines (same trolly +
// spool). The net is split EQUALLY (integer per mc) and one row is written per
// machine. The Save gate mirrors the backend: net > 0 and 1 <= net/mc <= 500.
export default function DoffForm({ coId, branchId, setup, date, spell, onSaved }: Props) {
	const [noOfMachines, setNoOfMachines] = React.useState<number>(1);
	const [mc1, setMc1] = React.useState<number | "">("");
	const [mc2, setMc2] = React.useState<number | "">("");
	const [mc3, setMc3] = React.useState<number | "">("");
	const [trollyId, setTrollyId] = React.useState<number | "">("");
	const [spoolId, setSpoolId] = React.useState<number | "">("");
	const [qualityId, setQualityId] = React.useState<number | "">("");
	const [grossWeight, setGrossWeight] = React.useState<string>("");
	const [saving, setSaving] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	const trolly = React.useMemo(
		() => setup.trollies.find((t) => t.trolly_id === Number(trollyId)) ?? null,
		[trollyId, setup.trollies],
	);
	const spool = React.useMemo(
		() => setup.spools.find((s) => s.trolly_id === Number(spoolId)) ?? null,
		[spoolId, setup.spools],
	);

	const trollyWt = trolly?.trolly_weight ?? 0;
	const spoolWt = spool?.trolly_weight ?? 0;

	// Prefill from MC#1's last active doff (trolly/spool/quality).
	const { state: prevState } = useWindingDoffPrevState(
		coId,
		mc1 === "" ? null : Number(mc1),
		branchId,
	);

	React.useEffect(() => {
		if (prevState) {
			if (prevState.trolly_id != null) setTrollyId(prevState.trolly_id);
			if (prevState.spool_id != null) setSpoolId(prevState.spool_id);
			if (prevState.yarn_quality_id != null) setQualityId(prevState.yarn_quality_id);
		}
		// Only re-run when a new prev state arrives.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [prevState?.winding_doff_id]);

	const machineIds = React.useMemo<number[]>(() => {
		const out: number[] = [];
		if (mc1 !== "") out.push(Number(mc1));
		if (noOfMachines >= 2 && mc2 !== "") out.push(Number(mc2));
		if (noOfMachines >= 3 && mc3 !== "") out.push(Number(mc3));
		return out;
	}, [mc1, mc2, mc3, noOfMachines]);

	const grossNum = grossWeight === "" ? 0 : Number(grossWeight);
	const net = grossWeight === "" ? 0 : computeWindingNet(grossNum, trollyWt, noOfMachines, spoolWt);
	const netPerMc =
		grossWeight === "" ? 0 : computeWindingNetPerMc(grossNum, trollyWt, noOfMachines, spoolWt);
	const netPositive = net > 0;
	const netPerMcInRange = validateWindingNet(netPerMc);

	const machinesComplete = machineIds.length === noOfMachines;
	const noDuplicateMachines = new Set(machineIds).size === machineIds.length;

	const formInvalid =
		!date ||
		!spell ||
		!machinesComplete ||
		!noDuplicateMachines ||
		trollyId === "" ||
		spoolId === "" ||
		qualityId === "" ||
		grossWeight === "" ||
		grossNum <= 0 ||
		!netPositive ||
		!netPerMcInRange ||
		saving;

	const machineSelect = (
		label: string,
		value: number | "",
		setValue: (v: number | "") => void,
	) => (
		<TextField
			select
			label={label}
			value={value}
			onChange={(e) => setValue(e.target.value === "" ? "" : Number(e.target.value))}
			size="small"
			fullWidth
		>
			{setup.machines.map((m) => (
				<MenuItem key={m.machine_id} value={m.machine_id}>
					{m.mech_code} — {m.machine_name}
				</MenuItem>
			))}
		</TextField>
	);

	const handleSubmit = async () => {
		if (formInvalid) {
			if (!noDuplicateMachines) {
				setError("Each machine can only be selected once.");
			} else if (!netPositive) {
				setError("Net weight must be greater than 0.");
			} else if (!netPerMcInRange) {
				setError(`Per-machine net must be between ${WINDING_NET_MIN} and ${WINDING_NET_MAX} kg.`);
			} else {
				setError("Please complete all required fields.");
			}
			return;
		}
		setSaving(true);
		setError(null);

		const body = {
			co_id: Number(coId),
			branch_id: Number(branchId),
			tran_date: date,
			spell,
			no_of_machines: noOfMachines,
			machine_ids: machineIds,
			trolly_id: Number(trollyId),
			spool_id: Number(spoolId),
			quality_id: Number(qualityId),
			gross_weight: grossNum,
		};
		const { data, error: err } = await fetchWithCookie<{
			data: { winding_doff_ids: number[]; net: number; net_per_mc: number };
		}>(apiRoutesPortalMasters.WINDING_DOFF_CREATE, "POST", body);
		setSaving(false);
		if (err) {
			setError(err);
			return;
		}
		const ids = data?.data?.winding_doff_ids ?? [];
		setSnack(`Saved ${ids.length} doff row(s) (net/mc ${data?.data?.net_per_mc}).`);
		setGrossWeight(""); // Keep machines/trolly/spool/quality for rapid sequential entry.
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
					label="No. of Machines"
					value={noOfMachines}
					onChange={(e) => setNoOfMachines(Number(e.target.value))}
					size="small"
					fullWidth
				>
					{[1, 2, 3].map((n) => (
						<MenuItem key={n} value={n}>
							{n}
						</MenuItem>
					))}
				</TextField>
				{machineSelect("Machine #1", mc1, setMc1)}
				{noOfMachines >= 2 ? machineSelect("Machine #2", mc2, setMc2) : <Box />}
				{noOfMachines >= 3 ? machineSelect("Machine #3", mc3, setMc3) : null}
				<TextField
					select
					label="Trolly"
					value={trollyId}
					onChange={(e) => setTrollyId(e.target.value === "" ? "" : Number(e.target.value))}
					size="small"
					fullWidth
				>
					{setup.trollies.map((t) => (
						<MenuItem key={t.trolly_id} value={t.trolly_id}>
							{t.trolly_name}
						</MenuItem>
					))}
				</TextField>
				<TextField
					select
					label="Spool"
					value={spoolId}
					onChange={(e) => setSpoolId(e.target.value === "" ? "" : Number(e.target.value))}
					size="small"
					fullWidth
				>
					{setup.spools.map((s) => (
						<MenuItem key={s.trolly_id} value={s.trolly_id}>
							{s.trolly_name}
						</MenuItem>
					))}
				</TextField>
				<TextField
					select
					label="Yarn Quality"
					value={qualityId}
					onChange={(e) => setQualityId(e.target.value === "" ? "" : Number(e.target.value))}
					size="small"
					fullWidth
				>
					{setup.qualities.map((q) => (
						<MenuItem key={q.yarn_quality_id} value={q.yarn_quality_id}>
							{q.quality_code} — {q.quality_name ?? ""}
						</MenuItem>
					))}
				</TextField>
				<TextField
					type="number"
					label="Gross Weight"
					value={grossWeight}
					onChange={(e) => setGrossWeight(e.target.value)}
					size="small"
					fullWidth
				/>
				<TextField
					label="Trolly Wt"
					value={trollyId === "" ? "" : trollyWt}
					InputProps={{ readOnly: true }}
					size="small"
					fullWidth
				/>
				<TextField
					label="Spool Wt"
					value={spoolId === "" ? "" : spoolWt}
					InputProps={{ readOnly: true }}
					size="small"
					fullWidth
				/>
				<TextField
					label="Net (total)"
					value={grossWeight === "" ? "" : net}
					InputProps={{ readOnly: true }}
					size="small"
					fullWidth
					error={grossWeight !== "" && !netPositive}
					helperText={grossWeight !== "" && !netPositive ? "Net must be > 0" : ""}
				/>
				<TextField
					label="Net / Machine"
					value={grossWeight === "" ? "" : netPerMc}
					InputProps={{ readOnly: true }}
					size="small"
					fullWidth
					error={grossWeight !== "" && netPositive && !netPerMcInRange}
					helperText={
						grossWeight !== "" && netPositive && !netPerMcInRange
							? `Must be ${WINDING_NET_MIN}–${WINDING_NET_MAX}`
							: "Same value written to each machine"
					}
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
					disabled={formInvalid}
					sx={{ minHeight: 44, width: { xs: "100%", md: "auto" } }}
				>
					{saving ? "Saving…" : "Save Doff"}
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
