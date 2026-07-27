"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	CircularProgress,
	IconButton,
	MenuItem,
	Snackbar,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableRow,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import { RefreshCw as GetIcon, Save as SaveIcon } from "lucide-react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { YarnItemOption, WindingQualityRow } from "../types/windingTypes";
import { useQualitySetup } from "../hooks/useQualitySetup";
import { useQualityByDate } from "../hooks/useQualityByDate";
import { SPINDLE_MIN, SPINDLE_MAX } from "../utils/windingCalc";

type Props = {
	coId: string;
	branchId: number;
	date: string;
	spellId: number | null;
	yarnItems: YarnItemOption[];
};

type EditState = {
	item_id: number | "";
	no_of_spindle: string;
};

// "Get Quality" auto-seeds one row per winding machine (inheriting the prior
// spell's yarn + spindle) and returns the rows; each row's yarn + spindle
// (1..30) is editable and saved individually.
export default function QualityGrid({ coId, branchId, date, spellId, yarnItems }: Props) {
	const { setup, loading: setupLoading, error: setupError, run, reset } = useQualitySetup(
		coId,
		branchId,
	);
	const { rows: dayRows, loading: dayLoading, refresh: refreshDay } = useQualityByDate(
		coId,
		date,
		branchId,
		spellId,
	);
	const [edits, setEdits] = React.useState<Record<number, EditState>>({});
	const [savingId, setSavingId] = React.useState<number | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	const yarnOpts = setup?.yarn_items ?? yarnItems;

	// Reset the editable section when the date/spell context changes.
	React.useEffect(() => {
		reset();
		setEdits({});
	}, [date, spellId, reset]);

	// Seed local edit state from fetched setup rows.
	React.useEffect(() => {
		if (!setup) return;
		const seed: Record<number, EditState> = {};
		setup.machines.forEach((r) => {
			seed[r.winding_daily_qlty_id] = {
				item_id: r.item_id ?? "",
				no_of_spindle: String(r.no_of_spindle ?? 0),
			};
		});
		setEdits(seed);
	}, [setup]);

	const handleGet = async () => {
		if (spellId == null) {
			setSnack("Select a spell first.");
			return;
		}
		await run(date, spellId);
	};

	const setYarn = (id: number, value: number | "") =>
		setEdits((prev) => ({ ...prev, [id]: { ...prev[id], item_id: value } }));
	const setSpindle = (id: number, value: string) =>
		setEdits((prev) => ({ ...prev, [id]: { ...prev[id], no_of_spindle: value } }));

	const handleSaveRow = async (row: WindingQualityRow) => {
		const e = edits[row.winding_daily_qlty_id];
		if (!e) return;
		const spindle = e.no_of_spindle === "" ? NaN : Number(e.no_of_spindle);
		if (Number.isNaN(spindle) || spindle < SPINDLE_MIN || spindle > SPINDLE_MAX) {
			setSnack(`Spindles must be between ${SPINDLE_MIN} and ${SPINDLE_MAX}.`);
			return;
		}
		setSavingId(row.winding_daily_qlty_id);
		const url = `${apiRoutesPortalMasters.WINDING_QUALITY_SAVE}/${row.winding_daily_qlty_id}?co_id=${coId}`;
		const body = {
			co_id: Number(coId),
			item_id: e.item_id === "" ? null : Number(e.item_id),
			no_of_spindle: spindle,
		};
		const { error: err } = await fetchWithCookie(url, "PUT", body);
		setSavingId(null);
		if (err) {
			setSnack(err);
			return;
		}
		setSnack(`Saved yarn for ${row.mech_code ?? row.machine_id}`);
		refreshDay();
	};

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
			<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
				<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
					<Typography variant="subtitle2">Yarn &amp; spindle entry</Typography>
					<Button
						variant="contained"
						size="small"
						startIcon={<GetIcon size={16} />}
						onClick={handleGet}
						disabled={setupLoading || spellId == null}
					>
						{setupLoading ? "Loading…" : "Get Quality"}
					</Button>
				</Box>

				{setupError ? <Alert severity="error">{setupError}</Alert> : null}

				{setupLoading ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
						<CircularProgress />
					</Box>
				) : setup && setup.machines.length > 0 ? (
					<Box sx={{ width: "100%", overflowX: "auto" }}>
						<Table size="small" sx={{ minWidth: 760 }}>
							<TableHead>
								<TableRow>
									<TableCell>Mc Code</TableCell>
									<TableCell>Machine</TableCell>
									<TableCell>Yarn</TableCell>
									<TableCell>No. of Spindle</TableCell>
									<TableCell align="right">Save</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{setup.machines.map((r) => {
									const e = edits[r.winding_daily_qlty_id] ?? {
										item_id: "",
										no_of_spindle: "0",
									};
									return (
										<TableRow key={r.winding_daily_qlty_id}>
											<TableCell>{r.mech_code}</TableCell>
											<TableCell>{r.machine_name}</TableCell>
											<TableCell>
												<TextField
													select
													size="small"
													value={e.item_id}
													onChange={(ev) =>
														setYarn(
															r.winding_daily_qlty_id,
															ev.target.value === "" ? "" : Number(ev.target.value),
														)
													}
													sx={{ minWidth: 200 }}
												>
													<MenuItem value="">
														<em>None</em>
													</MenuItem>
													{yarnOpts.map((y) => (
														<MenuItem key={y.item_id} value={y.item_id}>
															{y.item_code} — {y.item_name ?? ""}
														</MenuItem>
													))}
												</TextField>
											</TableCell>
											<TableCell>
												<TextField
													type="number"
													size="small"
													value={e.no_of_spindle}
													onChange={(ev) => setSpindle(r.winding_daily_qlty_id, ev.target.value)}
													inputProps={{ min: SPINDLE_MIN, max: SPINDLE_MAX }}
													sx={{ width: 120 }}
												/>
											</TableCell>
											<TableCell align="right">
												<Tooltip title="Save row">
													<span>
														<IconButton
															size="small"
															color="primary"
															onClick={() => handleSaveRow(r)}
															disabled={savingId === r.winding_daily_qlty_id}
															sx={{ minWidth: 40, minHeight: 40 }}
														>
															<SaveIcon size={16} />
														</IconButton>
													</span>
												</Tooltip>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</Box>
				) : setup ? (
					<Alert severity="info">No winding machines found for this date and spell.</Alert>
				) : (
					<Alert severity="info">Press &ldquo;Get Quality&rdquo; to load / seed the machine rows.</Alert>
				)}
			</Box>

			<Box>
				<Typography variant="subtitle2" sx={{ mb: 1 }}>
					Yarn entries
				</Typography>
				<Box sx={{ width: "100%", overflowX: "auto" }}>
					<Table size="small" sx={{ minWidth: 760 }}>
						<TableHead>
							<TableRow>
								<TableCell>Spell</TableCell>
								<TableCell>Mc Code</TableCell>
								<TableCell>Machine</TableCell>
								<TableCell>Yarn</TableCell>
								<TableCell>Spindles</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{dayLoading ? (
								<TableRow>
									<TableCell colSpan={5} align="center">
										<CircularProgress size={20} />
									</TableCell>
								</TableRow>
							) : dayRows.length === 0 ? (
								<TableRow>
									<TableCell colSpan={5} align="center">
										No entries for this date / spell.
									</TableCell>
								</TableRow>
							) : (
								dayRows.map((r) => (
									<TableRow key={r.winding_daily_qlty_id}>
										<TableCell>{r.spell_code}</TableCell>
										<TableCell>{r.mech_code}</TableCell>
										<TableCell>{r.machine_name}</TableCell>
										<TableCell>{r.item_code ?? "—"}</TableCell>
										<TableCell>{r.no_of_spindle}</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</Box>
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
