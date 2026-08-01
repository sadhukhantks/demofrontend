"use client";

import * as React from "react";
import { Alert, Box, Button, MenuItem, Snackbar, TextField, Typography } from "@mui/material";
import { Save as SaveIcon } from "lucide-react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { WindingJugarSetup } from "../types/windingTypes";
import { useJugarPrevState } from "../hooks/useJugarPrevState";
import { useQualityByDate } from "../hooks/useQualityByDate";
import { JUGAR_MIN, JUGAR_MAX } from "../utils/windingCalc";

type Props = {
	coId: string;
	branchId: number;
	setup: WindingJugarSetup;
	date: string;
	spellId: number | null;
	onSaved: () => void;
};

// Spindle leftover weight at the shift boundary, per winder, Opening ('O') or
// Closing ('C'). The carry-forward lookup pre-fills the weight and, when a row
// already exists for the date/spell/winder/open-close, returns its id so the
// form switches Save -> Update.
//
// The winder is picked the same way as on the doff form — yarn quality first,
// then the EB nos mapped to it in this date+spell's person -> quality map. Unlike
// doff this stays SINGLE-select (user decision): a jugar weight is one person's
// leftover, and both the carry-forward prefill and the Save -> Update flip are
// per-person lookups that have no meaning for a set.
export default function JugarForm({ coId, branchId, setup, date, spellId, onSaved }: Props) {
	const [ebId, setEbId] = React.useState<number | "">("");
	const [yarnItemId, setYarnItemId] = React.useState<number | "">("");
	const [openClose, setOpenClose] = React.useState<"O" | "C">("O");
	const [weight, setWeight] = React.useState<string>("");
	const [weightDirty, setWeightDirty] = React.useState(false);
	const [saving, setSaving] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	const { state: prevState } = useJugarPrevState(
		coId,
		ebId === "" ? null : Number(ebId),
		date,
		openClose,
		spellId,
	);

	const existingId = prevState?.winding_jugar_id ?? null;
	const editing = existingId != null;

	// The person -> quality map for this date + spell (Quality tab) drives both
	// pickers — there is no free worker list here either.
	const { rows: qualityRows } = useQualityByDate(coId, date, branchId, spellId);

	// Distinct qualities on the map (item_code comes off the row).
	const qualityOpts = React.useMemo(() => {
		const seen = new Map<number, string>();
		qualityRows.forEach((r) => {
			if (r.item_id == null || seen.has(r.item_id)) return;
			seen.set(r.item_id, r.item_code ?? String(r.item_id));
		});
		return Array.from(seen, ([item_id, label]) => ({ item_id, label }));
	}, [qualityRows]);

	// Winders mapped to the chosen quality, deduped, sorted by name then EB no.
	const ebOpts = React.useMemo(() => {
		if (yarnItemId === "") return [];
		const seen = new Set<number>();
		return qualityRows
			.filter((r) => {
				if (r.item_id !== Number(yarnItemId) || r.eb_id == null || seen.has(r.eb_id)) return false;
				seen.add(r.eb_id);
				return true;
			})
			.sort(
				(a, b) =>
					(a.worker_name ?? "").localeCompare(b.worker_name ?? "") ||
					(a.emp_code ?? String(a.eb_id)).localeCompare(b.emp_code ?? String(b.eb_id)),
			);
	}, [qualityRows, yarnItemId]);

	// A different quality means a different set of winders — drop the old pick.
	const handlePickQuality = (itemId: number) => {
		setYarnItemId(itemId);
		setEbId("");
	};

	// Mill-floor tablet: compact but >= 40px tall so it stays thumb-hittable.
	const pickSx = { minHeight: 40, px: 1.5, textTransform: "none" as const };

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
	}, [ebId, openClose, date, spellId]);

	const weightNum = weight === "" ? 0 : Number(weight);
	const weightInRange = weightNum > JUGAR_MIN && weightNum <= JUGAR_MAX;

	const formInvalid =
		!date || spellId == null || ebId === "" || weight === "" || !weightInRange || saving;

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
			spell_id: spellId,
			eb_id: Number(ebId),
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
			{qualityOpts.length === 0 ? (
				<Alert severity="info">
					No yarn quality mapped for this date and spell. Map the winders in the Quality tab
					first — jugar entry picks the winder from that map.
				</Alert>
			) : (
				<>
					<Box>
						<Typography variant="subtitle2" sx={{ mb: 1 }}>
							Yarn Quality
						</Typography>
						<Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
							{qualityOpts.map((q) => {
								const on = yarnItemId === q.item_id;
								return (
									<Button
										key={q.item_id}
										size="small"
										variant={on ? "contained" : "outlined"}
										color={on ? "primary" : "inherit"}
										onClick={() => handlePickQuality(q.item_id)}
										sx={pickSx}
									>
										{q.label}
									</Button>
								);
							})}
						</Box>
					</Box>

					<Box>
						<Typography variant="subtitle2" sx={{ mb: 1 }}>
							EB No
						</Typography>
						{yarnItemId === "" ? (
							<Typography variant="body2" color="text.secondary">
								Pick a yarn quality to list its winders.
							</Typography>
						) : ebOpts.length === 0 ? (
							<Typography variant="body2" color="text.secondary">
								No winder mapped to this quality.
							</Typography>
						) : (
							<Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
								{ebOpts.map((r) => {
									const on = ebId === r.eb_id;
									return (
										<Button
											key={r.eb_id}
											size="small"
											variant={on ? "contained" : "outlined"}
											color={on ? "primary" : "inherit"}
											onClick={() => setEbId(r.eb_id as number)}
											sx={{ ...pickSx, flexDirection: "column", lineHeight: 1.15, py: 0.5 }}
										>
											<Box component="span">{r.emp_code ?? r.eb_id}</Box>
											<Box component="span" sx={{ fontSize: "0.7rem", opacity: 0.75 }}>
												{/* worker_name is "FIRST MIDDLE LAST" from the server — first word only. */}
												{(r.worker_name ?? "").split(" ")[0]}
											</Box>
										</Button>
									);
								})}
							</Box>
						)}
					</Box>
				</>
			)}

			<Box
				sx={{
					display: "grid",
					gap: 2,
					gridTemplateColumns: {
						xs: "1fr",
						sm: "repeat(2, minmax(0, 1fr))",
					},
				}}
			>
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
					An entry already exists for this winder / spell / {openClose === "O" ? "opening" : "closing"} —
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
