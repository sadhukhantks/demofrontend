"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	Snackbar,
	TextField,
} from "@mui/material";
import { Save as SaveIcon } from "lucide-react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { SpreaderSetup } from "../types/spreaderTypes";
import { spellFromHour, hourFromSpell, todayISO, currentHour } from "../utils/shift";
import { useBinState } from "../hooks/useBinState";
import BinStateBanner from "./BinStateBanner";
import FormAutocomplete from "./FormAutocomplete";

// Mirror the backend's Field(le=...) caps so a fat-fingered value disables Save
// instead of coming back as "Request failed with status 422".
const MAX_RATIO = 1000;
const MAX_ROLLS = 100000;
const MAX_TROLLEY_NO = 1000000;

type Props = {
	coId: string;
	branchId: number;
	setup: SpreaderSetup;
	onSaved: () => void;
};

export default function ProductionEntryForm({ coId, branchId, setup, onSaved }: Props) {
	const [entryDate, setEntryDate] = React.useState<string>(todayISO());
	const [entryTime, setEntryTime] = React.useState<number>(currentHour());
	const [spell, setSpell] = React.useState<string>(spellFromHour(currentHour()));
	const [machineId, setMachineId] = React.useState<number | "">("");
	const [binId, setBinId] = React.useState<number | "">("");
	const [itemId, setItemId] = React.useState<number | "">("");
	const [item2Id, setItem2Id] = React.useState<number | "">("");
	const [ratio1, setRatio1] = React.useState<string>("1");
	const [ratio2, setRatio2] = React.useState<string>("1");
	const [showSecond, setShowSecond] = React.useState(false);
	const [trolleyNo, setTrolleyNo] = React.useState<string>("");
	const [noOfRolls, setNoOfRolls] = React.useState<string>("");
	const [remarks, setRemarks] = React.useState<string>("");
	const [saving, setSaving] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	const wtPerRoll = React.useMemo(() => {
		if (!machineId) return 0;
		return setup.machines.find((m) => m.machine_id === Number(machineId))?.wt_per_roll ?? 0;
	}, [machineId, setup.machines]);

	const { state: binState, loading: stateLoading, refresh: refreshBinState } = useBinState(
		coId,
		binId === "" ? null : Number(binId),
		entryDate,
		Number(entryTime)
	);

	const lockedItemName = React.useMemo(() => {
		if (!binState?.locked_item_id) return null;
		if (binState.locked_quality_label) return binState.locked_quality_label;
		return setup.items.find((i) => i.item_id === binState.locked_item_id)?.item_name ?? null;
	}, [binState, setup.items]);

	// If bin has an open group, force the full blend to the locked values.
	React.useEffect(() => {
		if (binState?.locked_item_id) {
			setItemId(binState.locked_item_id);
			if (binState.locked_item_id_2) {
				setShowSecond(true);
				setItem2Id(binState.locked_item_id_2);
				setRatio1(String(binState.locked_ratio_1 ?? 1));
				setRatio2(String(binState.locked_ratio_2 ?? 1));
			} else {
				setShowSecond(false);
				setItem2Id("");
			}
		}
	}, [binState?.locked_item_id, binState?.locked_item_id_2, binState?.locked_ratio_1, binState?.locked_ratio_2]);

	// Update spell automatically when entry_time changes (unless user has overridden it manually).
	React.useEffect(() => {
		setSpell(spellFromHour(Number(entryTime)));
	}, [entryTime]);

	const windowAllowed = binState?.window ? binState.window.allowed : true;
	const formInvalid =
		!machineId ||
		!binId ||
		!itemId ||
		!noOfRolls ||
		Number(noOfRolls) <= 0 ||
		Number(noOfRolls) > MAX_ROLLS ||
		Number(trolleyNo) > MAX_TROLLEY_NO ||
		!wtPerRoll ||
		(showSecond &&
			(!item2Id ||
				Number(item2Id) === Number(itemId) ||
				Number(ratio1) < 1 ||
				Number(ratio2) < 1 ||
				Number(ratio1) > MAX_RATIO ||
				Number(ratio2) > MAX_RATIO ||
				!Number.isInteger(Number(ratio1)) ||
				!Number.isInteger(Number(ratio2)))) ||
		!windowAllowed;

	const handleSubmit = async () => {
		if (formInvalid) {
			setError("Please complete all required fields.");
			return;
		}
		setSaving(true);
		setError(null);
		const body = {
			co_id: Number(coId),
			branch_id: Number(branchId),
			entry_date: entryDate,
			entry_time: Number(entryTime),
			spell,
			machine_id: Number(machineId),
			item_id: Number(itemId),
			item_id_2: showSecond && item2Id ? Number(item2Id) : null,
			ratio_1: showSecond ? Number(ratio1) : 1,
			ratio_2: showSecond && item2Id ? Number(ratio2) : null,
			bin_id: Number(binId),
			trolley_no: trolleyNo ? Number(trolleyNo) : null,
			no_of_rolls: Number(noOfRolls),
			wt_per_roll: Number(wtPerRoll),
			remarks: remarks || null,
		};
		const { data, error: err } = await fetchWithCookie<{ data: { spreader_prod_entry_id: number; entry_id_grp: number } }>(
			apiRoutesPortalMasters.SPREADER_ENTRY_CREATE,
			"POST",
			body
		);
		setSaving(false);
		// Re-read the bin state on both paths: a success opens or extends a group, and a
		// rejection means our view of the bin was stale — either way the banner and the
		// quality lock must reflect what the server now holds.
		refreshBinState();
		if (err) {
			setError(err);
			return;
		}
		setSnack(`Saved entry #${data?.data?.spreader_prod_entry_id} (group ${data?.data?.entry_id_grp})`);
		setNoOfRolls("");
		setTrolleyNo("");
		setRemarks("");
		// The blend stays sticky across saves — state is never cleared here, so the next
		// entry keeps feeding the group we just opened.
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
					type="date"
					label="Entry Date"
					value={entryDate}
					onChange={(e) => {
						const v = e.target.value;
						setEntryDate(v && v > todayISO() ? todayISO() : v);
					}}
					inputProps={{ max: todayISO() }}
					size="small"
					InputLabelProps={{ shrink: true }}
					fullWidth
				/>
				<TextField
					type="number"
					label="Entry Hour (0-23)"
					value={entryTime}
					onChange={(e) =>
						setEntryTime(Math.max(0, Math.min(23, Number(e.target.value || 0))))
					}
					size="small"
					fullWidth
				/>
				<FormAutocomplete
					label="Spell"
					value={spell}
					options={setup.spells.map((s) => ({ value: s.code, label: s.label }))}
					onChange={(v) => {
						if (v === "") return;
						const s = String(v);
						setSpell(s);
						// Snap hour into the chosen spell's bucket (keep it if already inside).
						const h = hourFromSpell(s);
						if (h !== null && spellFromHour(Number(entryTime)) !== s) setEntryTime(h);
					}}
				/>
				<FormAutocomplete
					label="Spreader"
					value={machineId}
					options={setup.machines.map((m) => ({
						value: m.machine_id,
						label: `${m.machine_name} (${m.mech_code}) — ${m.wt_per_roll} kg`,
					}))}
					onChange={(v) => setMachineId(v === "" ? "" : Number(v))}
				/>
				<TextField
					label="Wt per Roll (kg)"
					value={wtPerRoll || ""}
					InputProps={{ readOnly: true }}
					size="small"
					fullWidth
				/>
				<FormAutocomplete
					label="Bin"
					value={binId}
					options={setup.bins.map((b) => ({
						value: b.bin_id,
						label: `${b.bin_code}${b.bin_no != null ? ` (#${b.bin_no})` : ""}`,
					}))}
					onChange={(v) => setBinId(v === "" ? "" : Number(v))}
				/>
				<FormAutocomplete
					label="Item (jute / jute waste)"
					value={itemId}
					options={setup.items.map((it) => ({ value: it.item_id, label: it.item_name }))}
					onChange={(v) => {
						const next = v === "" ? "" : Number(v);
						setItemId(next);
						if (next !== "" && Number(item2Id) === Number(next)) setItem2Id("");
					}}
					disabled={!!binState?.locked_item_id}
					helperText={binState?.locked_item_id ? "Locked by open group" : ""}
				/>
				{!showSecond ? (
					<Button
						size="small"
						onClick={() => setShowSecond(true)}
						disabled={!!binState?.locked_item_id}
						sx={{ alignSelf: "center", justifySelf: "start" }}
					>
						+ Second quality
					</Button>
				) : (
					<Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
						<FormAutocomplete
							label="Second quality"
							value={item2Id}
							options={setup.items
								.filter((it) => it.item_id !== Number(itemId))
								.map((it) => ({ value: it.item_id, label: it.item_name }))}
							onChange={(v) => setItem2Id(v === "" ? "" : Number(v))}
							sx={{ flex: 1 }}
							disabled={!!binState?.locked_item_id}
						/>
						<TextField
							type="number"
							label="Ratio 1"
							value={ratio1}
							onChange={(e) => setRatio1(e.target.value)}
							inputProps={{ min: 1, max: MAX_RATIO }}
							size="small"
							sx={{ width: 80 }}
							disabled={!!binState?.locked_item_id}
						/>
						<TextField
							type="number"
							label="Ratio 2"
							value={ratio2}
							onChange={(e) => setRatio2(e.target.value)}
							inputProps={{ min: 1, max: MAX_RATIO }}
							size="small"
							sx={{ width: 80 }}
							disabled={!!binState?.locked_item_id}
						/>
						{!binState?.locked_item_id ? (
							<Button
								size="small"
								aria-label="Remove second quality"
								onClick={() => {
									setShowSecond(false);
									setItem2Id("");
									setRatio1("1");
									setRatio2("1");
								}}
							>
								✕
							</Button>
						) : null}
					</Box>
				)}
				<TextField
					type="number"
					label="No. of Rolls"
					value={noOfRolls}
					onChange={(e) => setNoOfRolls(e.target.value)}
					inputProps={{ min: 1, max: MAX_ROLLS }}
					size="small"
					fullWidth
				/>
				<TextField
					type="number"
					label="Trolley No"
					value={trolleyNo}
					onChange={(e) => setTrolleyNo(e.target.value)}
					inputProps={{ min: 0, max: MAX_TROLLEY_NO }}
					size="small"
					fullWidth
				/>
				<TextField
					label="Remarks"
					value={remarks}
					onChange={(e) => setRemarks(e.target.value)}
					size="small"
					fullWidth
				/>
			</Box>
			<BinStateBanner state={binState} itemName={lockedItemName} loading={stateLoading} />
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
					fullWidth={false}
					sx={{ minHeight: 44, width: { xs: "100%", md: "auto" } }}
				>
					{saving ? "Saving…" : "Save Entry"}
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
