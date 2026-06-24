"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
	Snackbar,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableRow,
	TextField,
	Typography,
} from "@mui/material";
import { Save as SaveIcon } from "lucide-react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { WeavingSetup, WeavingEntryRow } from "../types/weavingTypes";
import { useLoomQualityMap } from "../hooks/useLoomQualityMap";
import { useWeavingEntriesByDate } from "../hooks/useWeavingEntriesByDate";
import { productionYds, productionKg, stdProdYds, efficiency } from "../utils/weavingCalc";

type Props = {
	coId: string;
	branchId: number;
	setup: WeavingSetup;
	date: string;
	spell: string;
};

type CellEdit = { cuts: string; jugar: string };

// Loom rows on the production grid never carry a quality dropdown — the quality is
// MAPPED on the Loom → Quality tab and inherited read-only here (like spinning).
export default function WeavingEntryGrid({ coId, branchId, setup, date, spell }: Props) {
	const spellOpt = React.useMemo(
		() => setup.spells.find((s) => s.spell_code === spell) ?? null,
		[setup.spells, spell]
	);
	const workingHours = spellOpt ? Number(spellOpt.working_hours) : 0;

	// The mapped quality per loom (read-only source for this grid).
	const { rows: mapRows, loading: mapLoading, error: mapError } = useLoomQualityMap(
		coId,
		branchId,
		date,
		spell
	);
	// Existing day entries (to prefill cuts/jugar and show server-computed outputs).
	const { rows: entryRows, loading: entriesLoading, error: entriesError, refresh } =
		useWeavingEntriesByDate(coId, date, branchId, spell);

	const [edits, setEdits] = React.useState<Record<number, CellEdit>>({});
	const [savingId, setSavingId] = React.useState<number | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	// Index existing entries by machine for prefill + edit-vs-create resolution.
	const entryByMachine = React.useMemo(() => {
		const m: Record<number, WeavingEntryRow> = {};
		entryRows.forEach((e) => {
			m[e.machine_id] = e;
		});
		return m;
	}, [entryRows]);

	// Seed cuts/jugar from any saved entry for the loom.
	React.useEffect(() => {
		const seed: Record<number, CellEdit> = {};
		mapRows.forEach((r) => {
			const e = entryByMachine[r.machine_id];
			seed[r.machine_id] = {
				cuts: e ? String(e.cuts ?? "") : "",
				jugar: e ? String(e.jugar ?? "") : "",
			};
		});
		setEdits(seed);
	}, [mapRows, entryByMachine]);

	const setCell = (machineId: number, field: keyof CellEdit, value: string) => {
		setEdits((prev) => ({
			...prev,
			[machineId]: { ...(prev[machineId] ?? { cuts: "", jugar: "" }), [field]: value },
		}));
	};

	const handleSave = async (machineId: number, mapped: boolean) => {
		if (!mapped) {
			setSnack("Map a quality to this loom on the Loom → Quality tab first.");
			return;
		}
		const cell = edits[machineId] ?? { cuts: "", jugar: "" };
		if (cell.cuts === "" || Number(cell.cuts) < 0) {
			setSnack("Enter cuts for this loom.");
			return;
		}
		setSavingId(machineId);
		const existing = entryByMachine[machineId];
		if (existing) {
			const body = { cuts: Number(cell.cuts), jugar: Number(cell.jugar || 0) };
			const url = `${apiRoutesPortalMasters.WEAVING_ENTRY_EDIT}/${existing.weaving_daily_id}?co_id=${coId}`;
			const { error: err } = await fetchWithCookie(url, "PUT", body);
			setSavingId(null);
			if (err) {
				setSnack(err);
				return;
			}
			setSnack(`Updated entry #${existing.weaving_daily_id}`);
			refresh();
			return;
		}
		const body = {
			co_id: Number(coId),
			branch_id: Number(branchId),
			tran_date: date,
			spell,
			machine_id: machineId,
			cuts: Number(cell.cuts),
			jugar: Number(cell.jugar || 0),
		};
		const { data, error: err } = await fetchWithCookie<{
			data: { weaving_daily_id: number; production_yds: number };
		}>(apiRoutesPortalMasters.WEAVING_ENTRY_CREATE, "POST", body);
		setSavingId(null);
		if (err) {
			setSnack(err);
			return;
		}
		setSnack(`Saved entry #${data?.data?.weaving_daily_id} (prod ${data?.data?.production_yds ?? 0} yds)`);
		refresh();
	};

	if (!spell) {
		return <Alert severity="info">Select a spell to load the production grid.</Alert>;
	}

	const loading = mapLoading || entriesLoading;
	const error = mapError || entriesError;

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
				<Typography variant="subtitle2">Production entry (per loom)</Typography>
				<Typography variant="caption" color="text.secondary">
					Quality is inherited from the Loom → Quality map (read-only). Enter cuts + jugar; preview
					values are recomputed and made authoritative on the server.
				</Typography>
			</Box>

			{error ? <Alert severity="error">{error}</Alert> : null}

			{loading ? (
				<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
					<CircularProgress />
				</Box>
			) : mapRows.length === 0 ? (
				<Alert severity="info">No looms found for this date and spell.</Alert>
			) : (
				<Box sx={{ width: "100%", overflowX: "auto" }}>
					<Table size="small" sx={{ minWidth: 980 }}>
						<TableHead>
							<TableRow>
								<TableCell>Mc Code</TableCell>
								<TableCell>Loom</TableCell>
								<TableCell>Quality</TableCell>
								<TableCell align="right">Cuts</TableCell>
								<TableCell align="right">Jugar</TableCell>
								<TableCell align="right">Prod (yd)</TableCell>
								<TableCell align="right">Prod (kg)</TableCell>
								<TableCell align="right">Eff %</TableCell>
								<TableCell />
							</TableRow>
						</TableHead>
						<TableBody>
							{mapRows.map((r) => {
								const cell = edits[r.machine_id] ?? { cuts: "", jugar: "" };
								const entry = entryByMachine[r.machine_id];
								const mapped = r.wv_quality_id != null;

								// FE PREVIEW ONLY — server is authoritative. Standards (fl/jpc/open/
								// ozs_yds/speed/picks) are resolved server-side and surfaced on saved
								// entries; preview falls back to 0 (showing "—") when not yet available.
								const fl = Number(entry?.fl ?? 0);
								const jpc = Number(entry?.jpc ?? 0);
								const open = Number(entry?.open ?? 0);
								const ozs = Number(entry?.ozs_yds ?? 0);
								const cutsNum = Number(cell.cuts || 0);
								const jugarNum = Number(cell.jugar || 0);
								// True when the unsaved edits match what is already persisted, so we can
								// surface the server-authoritative values instead of the FE preview.
								const inSync =
									entry != null &&
									cell.cuts === String(entry.cuts ?? "") &&
									cell.jugar === String(entry.jugar ?? "");

								const prodYds =
									inSync && entry?.production_yds != null
										? Number(entry.production_yds)
										: productionYds(cutsNum, fl, open, jugarNum, jpc);
								const prodKg =
									inSync && entry?.production_kg != null
										? Number(entry.production_kg)
										: productionKg(prodYds, ozs);
								const stdProd =
									entry?.std_prod_yds != null
										? Number(entry.std_prod_yds)
										: stdProdYds(0, workingHours, 0);
								const eff =
									inSync && entry?.efficiency != null
										? Number(entry.efficiency)
										: efficiency(prodYds, stdProd);

								const fmt = (n: number) => (n ? n : "—");

								return (
									<TableRow key={r.machine_id}>
										<TableCell>{r.mech_code}</TableCell>
										<TableCell>{r.machine_name}</TableCell>
										<TableCell>
											{mapped ? (
												<Chip
													size="small"
													variant="outlined"
													label={r.wv_quality_name ?? r.wv_quality_code ?? "—"}
												/>
											) : (
												<Chip size="small" color="warning" variant="outlined" label="Not mapped" />
											)}
										</TableCell>
										<TableCell align="right">
											<TextField
												type="number"
												size="small"
												value={cell.cuts}
												onChange={(e) => setCell(r.machine_id, "cuts", e.target.value)}
												disabled={!mapped}
												sx={{ width: 90 }}
											/>
										</TableCell>
										<TableCell align="right">
											<TextField
												type="number"
												size="small"
												value={cell.jugar}
												onChange={(e) => setCell(r.machine_id, "jugar", e.target.value)}
												disabled={!mapped}
												sx={{ width: 90 }}
											/>
										</TableCell>
										<TableCell align="right">{fmt(prodYds)}</TableCell>
										<TableCell align="right">{fmt(prodKg)}</TableCell>
										<TableCell align="right">{fmt(eff)}</TableCell>
										<TableCell align="right">
											<Button
												variant="contained"
												size="small"
												startIcon={<SaveIcon size={14} />}
												onClick={() => handleSave(r.machine_id, mapped)}
												disabled={!mapped || savingId === r.machine_id}
											>
												{savingId === r.machine_id ? "…" : entry ? "Update" : "Save"}
											</Button>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</Box>
			)}

			<Snackbar
				open={!!snack}
				autoHideDuration={4000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</Box>
	);
}
