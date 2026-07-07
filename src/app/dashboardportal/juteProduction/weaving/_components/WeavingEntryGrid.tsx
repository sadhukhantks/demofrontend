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
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { WeavingSetup, WeavingEntryRow, LoomQualityMapRow } from "../types/weavingTypes";
import type { LoomQualityMapState } from "../hooks/useLoomQualityMap";
import { useWeavingEntriesByDate } from "../hooks/useWeavingEntriesByDate";

type Props = {
	coId: string;
	branchId: number;
	setup: WeavingSetup;
	date: string;
	spell: string;
	// Shared, page-owned map fetch (reused across tab switches — no reload on this tab).
	map: LoomQualityMapState;
};

// The operator enters cuts + the CLOSING jugar reading (close_jugar / cj).
type CellEdit = { cuts: string; close_jugar: string };

// Compact styling so all columns fit narrow (phone) widths with minimal horizontal scroll.
const tightCell = { "& .MuiTableCell-root": { px: 0.5, py: 0.75 } } as const;
const numInputSx = {
	width: 58,
	"& .MuiInputBase-input": { px: 0.75, py: 0.5, textAlign: "right" as const },
};

// Loom rows on the production grid never carry a quality dropdown — the quality is
// MAPPED on the Loom → Quality tab and inherited read-only here (like spinning).
export default function WeavingEntryGrid({ coId, branchId, date, spell, map }: Props) {
	// The mapped quality per loom (read-only source for this grid) comes from the page-owned,
	// shared map fetch — this grid needs only the loom list + saved mapping (it ignores the
	// editor's carry-forward). Sharing means switching to this tab does NOT refetch the map.
	const { rows: mapRows, loading: mapLoading, error: mapError } = map;
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

	const handleSave = async (machineId: number) => {
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

	// Per-row state. Total-jugar preview REMOVED: cut length cannot be known until the
	// quality is mapped, and the server (Process) is authoritative for every derived
	// value — the entry tab now only captures raw inputs (cuts + closing jugar).
	const deriveRow = (r: LoomQualityMapRow) => {
		const cell = edits[r.machine_id] ?? { cuts: "", close_jugar: "" };
		const entry = entryByMachine[r.machine_id];
		return { cell, entry };
	};

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
				<Typography variant="subtitle2">Production entry (per loom)</Typography>
				<Typography variant="caption" color="text.secondary">
					Enter cuts + closing jugar per loom, then Save. Quality mapping is NOT required to capture inputs — all jugar / production / efficiency values are computed later when you Process the day + spell.
				</Typography>
				<TextField
					size="small"
					label="Search loom / posting code"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					sx={{ minWidth: 200 }}
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
				<Box sx={{ width: "100%", overflow: "auto", maxHeight: "calc(100vh - 320px)" }}>
					<Table size="small" stickyHeader sx={{ minWidth: 320, ...tightCell }}>
						<TableHead>
							<TableRow>
								<TableCell>Loom</TableCell>
								<TableCell align="right">Cuts</TableCell>
								<TableCell align="right">Cl.Jugar</TableCell>
								<TableCell />
							</TableRow>
						</TableHead>
						<TableBody>
							{visibleRows.map((r) => {
								const { cell, entry } = deriveRow(r);
								return (
									<TableRow key={r.machine_id}>
										<TableCell>
											<Typography variant="body2" sx={{ lineHeight: 1.2 }}>
												{r.mech_code}
												{r.mech_posting_code != null ? (
													<Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>
														{` · #${r.mech_posting_code}`}
													</Box>
												) : null}
											</Typography>
											<Typography
												variant="caption"
												color="text.secondary"
												sx={{ display: { xs: "none", md: "block" } }}
											>
												{r.machine_name}
											</Typography>
										</TableCell>
										<TableCell align="right">
											<TextField
												type="number"
												size="small"
												slotProps={{ htmlInput: { inputMode: "decimal" } }}
												value={cell.cuts}
												onChange={(e) => setCell(r.machine_id, "cuts", e.target.value)}
												sx={numInputSx}
											/>
										</TableCell>
										<TableCell align="right">
											<TextField
												type="number"
												size="small"
												slotProps={{ htmlInput: { inputMode: "decimal" } }}
												value={cell.close_jugar}
												onChange={(e) => setCell(r.machine_id, "close_jugar", e.target.value)}
												sx={numInputSx}
											/>
										</TableCell>
										<TableCell align="right">
											<Button
												variant="contained"
												size="small"
												onClick={() => handleSave(r.machine_id)}
												disabled={savingId === r.machine_id}
												sx={{ minWidth: 0, px: 1 }}
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
