"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
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
import { effectiveJugar } from "../utils/weavingCalc";

type Props = {
	coId: string;
	branchId: number;
	setup: WeavingSetup;
	date: string;
	spell: string;
};

// The operator enters cuts + the CLOSING jugar reading (close_jugar / cj).
type CellEdit = { cuts: string; close_jugar: string };

// Loom rows on the production grid never carry a quality dropdown — the quality is
// MAPPED on the Loom → Quality tab and inherited read-only here (like spinning).
export default function WeavingEntryGrid({ coId, branchId, date, spell }: Props) {
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
	const [query, setQuery] = React.useState("");

	// Index existing entries by machine for prefill + edit-vs-create resolution.
	const entryByMachine = React.useMemo(() => {
		const m: Record<number, WeavingEntryRow> = {};
		entryRows.forEach((e) => {
			m[e.machine_id] = e;
		});
		return m;
	}, [entryRows]);

	// Seed cuts/close_jugar from any saved entry for the loom.
	React.useEffect(() => {
		const seed: Record<number, CellEdit> = {};
		mapRows.forEach((r) => {
			const e = entryByMachine[r.machine_id];
			seed[r.machine_id] = {
				cuts: e ? String(e.cuts ?? "") : "",
				close_jugar: e ? String(e.close_jugar ?? "") : "",
			};
		});
		setEdits(seed);
	}, [mapRows, entryByMachine]);

	const setCell = (machineId: number, field: keyof CellEdit, value: string) => {
		setEdits((prev) => ({
			...prev,
			[machineId]: { ...(prev[machineId] ?? { cuts: "", close_jugar: "" }), [field]: value },
		}));
	};

	const handleSave = async (machineId: number, mapped: boolean) => {
		if (!mapped) {
			setSnack("Map a quality to this loom on the Loom → Quality tab first.");
			return;
		}
		const cell = edits[machineId] ?? { cuts: "", close_jugar: "" };
		if (cell.cuts === "" || Number(cell.cuts) < 0) {
			setSnack("Enter cuts for this loom.");
			return;
		}
		setSavingId(machineId);
		const existing = entryByMachine[machineId];
		if (existing) {
			const body = { cuts: Number(cell.cuts), close_jugar: Number(cell.close_jugar || 0) };
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
			close_jugar: Number(cell.close_jugar || 0),
		};
		const { data, error: err } = await fetchWithCookie<{
			data: { weaving_daily_id: number; weaving_quality_id: number };
		}>(apiRoutesPortalMasters.WEAVING_ENTRY_CREATE, "POST", body);
		setSavingId(null);
		if (err) {
			setSnack(err);
			return;
		}
		setSnack(`Saved entry #${data?.data?.weaving_daily_id}`);
		refresh();
	};

	if (!spell) {
		return <Alert severity="info">Select a spell to load the production grid.</Alert>;
	}

	const loading = mapLoading || entriesLoading;
	const error = mapError || entriesError;

	const q = query.trim().toLowerCase();
	const visibleRows =
		q === ""
			? mapRows
			: mapRows.filter(
					(r) =>
						String(r.mech_posting_code ?? "").toLowerCase().includes(q) ||
						(r.mech_code ?? "").toLowerCase().includes(q) ||
						(r.machine_name ?? "").toLowerCase().includes(q)
			  );

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
				<Typography variant="subtitle2">Production entry (per loom)</Typography>
				<Typography variant="caption" color="text.secondary">
					Quality is inherited from the Loom → Quality map (read-only). Enter cuts + closing jugar;
					Open and the produced Jugar are derived (server/view authoritative).
				</Typography>
				<TextField
					size="small"
					label="Search loom / posting code"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					sx={{ minWidth: 240 }}
				/>
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
					<Table size="small" sx={{ minWidth: 640 }}>
						<TableHead>
							<TableRow>
								<TableCell>Mc Code</TableCell>
								<TableCell>Posting</TableCell>
								<TableCell>Loom</TableCell>
								<TableCell align="right">Cuts</TableCell>
								<TableCell align="right">Closing Jugar</TableCell>
								<TableCell align="right">Jugar</TableCell>
								<TableCell />
							</TableRow>
						</TableHead>
						<TableBody>
							{visibleRows.map((r) => {
								const cell = edits[r.machine_id] ?? { cuts: "", close_jugar: "" };
								const entry = entryByMachine[r.machine_id];
								const mapped = r.weaving_quality_id != null;

								// FE PREVIEW ONLY — server / vw_weaving_daily is authoritative for the
								// produced jugar. jpc/open_jugar are resolved server-side and surfaced on
								// saved entries; preview falls back to 0 (showing "—") when not yet
								// available. open_jugar (oj) is the last available close — read-only.
								const jpc = Number(entry?.jpc ?? 0);
								const openJugar = Number(entry?.open_jugar ?? entry?.open ?? 0);
								const closeJugarNum = Number(cell.close_jugar || 0);
								// True when the unsaved edits match what is already persisted, so we can
								// surface the server-authoritative value instead of the FE preview.
								const inSync =
									entry != null &&
									cell.cuts === String(entry.cuts ?? "") &&
									cell.close_jugar === String(entry.close_jugar ?? "");

								// Derived produced-jugar: use the view value when in sync, else preview
								// via effectiveJugar(jc, oj, cj).
								const derivedJugar =
									inSync && entry?.jugar != null
										? Number(entry.jugar)
										: effectiveJugar(jpc, openJugar, closeJugarNum);

								const fmt = (n: number) => (n ? n : "—");

								return (
									<TableRow key={r.machine_id}>
										<TableCell>{r.mech_code}</TableCell>
										<TableCell>{r.mech_posting_code != null ? r.mech_posting_code : "—"}</TableCell>
										<TableCell>{r.machine_name}</TableCell>
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
												value={cell.close_jugar}
												onChange={(e) => setCell(r.machine_id, "close_jugar", e.target.value)}
												disabled={!mapped}
												sx={{ width: 90 }}
											/>
										</TableCell>
										<TableCell align="right">{fmt(derivedJugar)}</TableCell>
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
					{visibleRows.length === 0 ? (
						<Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
							No looms match the search.
						</Typography>
					) : null}
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
