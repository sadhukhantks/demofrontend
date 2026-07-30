"use client";

import * as React from "react";
import { Alert, Autocomplete, Box, Button, MenuItem, Snackbar, TextField } from "@mui/material";
import { Save as SaveIcon } from "lucide-react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { WindingDoffSetup } from "../types/windingTypes";
import { useWindingDoffPrevState } from "../hooks/useWindingDoffPrevState";
import { useQualityByDate } from "../hooks/useQualityByDate";
import {
	computeWindingNet,
	validateWindingNet,
	WINDING_NET_MIN,
	WINDING_NET_MAX,
} from "../utils/windingCalc";

type Props = {
	coId: string;
	branchId: number;
	setup: WindingDoffSetup;
	date: string;
	spellId: number | null;
	onSaved: () => void;
};

// A doff is one weighing by one winder: pick the EB no, pick (or inherit) the
// yarn, enter the gross weight — no machine anywhere on the form. Exactly one
// row is written. The Save gate mirrors the backend: net > 0 and 1 <= net <= 500.
export default function DoffForm({ coId, branchId, setup, date, spellId, onSaved }: Props) {
	const [ebId, setEbId] = React.useState<number | "">("");
	const [trollyId, setTrollyId] = React.useState<number | "">("");
	const [spoolId, setSpoolId] = React.useState<number | "">("");
	const [yarnItemId, setYarnItemId] = React.useState<number | "">("");
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

	// Prefill from this winder's last active doff (trolly/spool/quality).
	const { state: prevState } = useWindingDoffPrevState(
		coId,
		ebId === "" ? null : Number(ebId),
		branchId,
	);

	// The person -> quality map for this date + spell (Quality tab). Read-only
	// here: it seeds the Yarn field, which stays editable inline.
	const { rows: qualityRows } = useQualityByDate(coId, date, branchId, spellId);
	const mappedItemId = React.useMemo(() => {
		if (ebId === "") return null;
		return qualityRows.find((r) => r.eb_id === Number(ebId))?.item_id ?? null;
	}, [qualityRows, ebId]);

	React.useEffect(() => {
		if (prevState) {
			if (prevState.trolly_id != null) setTrollyId(prevState.trolly_id);
			if (prevState.spool_id != null) setSpoolId(prevState.spool_id);
			// The quality map wins — the previous doff is only the fallback.
			if (prevState.item_id != null && mappedItemId == null) setYarnItemId(prevState.item_id);
		}
		// Only re-run when a new prev state arrives.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [prevState?.winding_doff_id]);

	React.useEffect(() => {
		if (mappedItemId != null) setYarnItemId(mappedItemId);
	}, [mappedItemId]);

	const grossNum = grossWeight === "" ? 0 : Number(grossWeight);
	const net = grossWeight === "" ? 0 : computeWindingNet(grossNum, trollyWt, spoolWt);
	const netPositive = net > 0;
	const netInRange = validateWindingNet(net);

	const formInvalid =
		!date ||
		spellId == null ||
		ebId === "" ||
		trollyId === "" ||
		spoolId === "" ||
		yarnItemId === "" ||
		grossWeight === "" ||
		grossNum <= 0 ||
		!netPositive ||
		!netInRange ||
		saving;

	const handleSubmit = async () => {
		if (formInvalid) {
			if (!netPositive) {
				setError("Net weight must be greater than 0.");
			} else if (!netInRange) {
				setError(`Net must be between ${WINDING_NET_MIN} and ${WINDING_NET_MAX} kg.`);
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
			spell_id: spellId,
			eb_id: Number(ebId),
			trolly_id: Number(trollyId),
			spool_id: Number(spoolId),
			quality_id: Number(yarnItemId),
			gross_weight: grossNum,
		};
		const { data, error: err } = await fetchWithCookie<{
			data: { winding_doff_id: number; net: number; row_gross_wt: number };
		}>(apiRoutesPortalMasters.WINDING_DOFF_CREATE, "POST", body);
		setSaving(false);
		if (err) {
			setError(err);
			return;
		}
		setSnack(`Saved doff #${data?.data?.winding_doff_id} (net ${data?.data?.net}).`);
		setGrossWeight(""); // Keep worker/trolly/spool/quality for rapid sequential entry.
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
				<Autocomplete
					options={setup.workers}
					getOptionLabel={(w) => w.label}
					renderOption={(props, w) => (
						<li {...props} key={w.eb_id}>
							{w.label}
						</li>
					)}
					value={ebId === "" ? null : setup.workers.find((w) => w.eb_id === Number(ebId)) ?? null}
					onChange={(_, newVal) => setEbId(newVal ? newVal.eb_id : "")}
					size="small"
					fullWidth
					clearOnEscape
					isOptionEqualToValue={(opt, val) => opt.eb_id === val.eb_id}
					renderInput={(params) => <TextField {...params} label="EB No" />}
				/>
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
					label="Yarn"
					value={yarnItemId}
					onChange={(e) => setYarnItemId(e.target.value === "" ? "" : Number(e.target.value))}
					size="small"
					fullWidth
					helperText={
						ebId === ""
							? ""
							: mappedItemId != null
								? "From the quality map — editable"
								: "No quality mapped for this winder"
					}
				>
					{setup.yarn_items.map((y) => (
						<MenuItem key={y.item_id} value={y.item_id}>
							{y.item_code} — {y.item_name ?? ""}
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
					label="Net"
					value={grossWeight === "" ? "" : net}
					InputProps={{ readOnly: true }}
					size="small"
					fullWidth
					error={grossWeight !== "" && (!netPositive || !netInRange)}
					helperText={
						grossWeight === ""
							? ""
							: !netPositive
								? "Net must be > 0"
								: !netInRange
									? `Must be ${WINDING_NET_MIN}–${WINDING_NET_MAX}`
									: ""
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
