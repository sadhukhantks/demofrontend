"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
	MenuItem,
	Snackbar,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableRow,
	TextField,
	Typography,
} from "@mui/material";
import { Save as SaveIcon, Stamp as StampIcon } from "lucide-react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { WeavingSetup } from "../types/weavingTypes";
import { useLoomQualityMap } from "../hooks/useLoomQualityMap";

type Props = {
	coId: string;
	branchId: number;
	setup: WeavingSetup;
	date: string;
	spell: string;
};

export default function LoomQualityMapGrid({ coId, branchId, setup, date, spell }: Props) {
	const { rows, lastUpdated, loading, error, refresh } = useLoomQualityMap(
		coId,
		branchId,
		date,
		spell
	);
	const [edits, setEdits] = React.useState<Record<number, number | "">>({});
	const [saving, setSaving] = React.useState(false);
	const [busy, setBusy] = React.useState(false);
	const [snack, setSnack] = React.useState<string | null>(null);

	// Seed local edit state (loom -> wv_quality_id) from fetched rows. Prefill from the
	// prior date's mapping when nothing is saved yet today, so the operator only has to
	// tweak the 1-2 looms whose quality changed.
	React.useEffect(() => {
		const seed: Record<number, number | ""> = {};
		rows.forEach((r) => {
			seed[r.machine_id] = r.wv_quality_id ?? r.prev_quality_id ?? "";
		});
		setEdits(seed);
	}, [rows]);

	// Baseline = what is actually persisted today (null/"" when unsaved). A cell is
	// dirty when its current selection differs from the saved baseline — carried-
	// forward prefills are therefore dirty until the operator clicks Save Map.
	const savedMap = React.useMemo(() => {
		const m: Record<number, number | ""> = {};
		rows.forEach((r) => {
			m[r.machine_id] = r.wv_quality_id ?? "";
		});
		return m;
	}, [rows]);

	const isDirty = React.useCallback(
		(machineId: number) => (edits[machineId] ?? "") !== (savedMap[machineId] ?? ""),
		[edits, savedMap]
	);
	const dirtyCount = rows.reduce((n, r) => (isDirty(r.machine_id) ? n + 1 : n), 0);

	// Banner: surface the date the draft was prefilled from (first row carrying one).
	const prevDate = rows.find((r) => r.prev_date)?.prev_date ?? null;
	const hasCarryForward = rows.some((r) => r.wv_quality_id == null && r.prev_quality_id != null);

	const setQuality = (machineId: number, value: number | "") => {
		setEdits((prev) => ({ ...prev, [machineId]: value }));
	};

	const handleSaveMap = async () => {
		setSaving(true);
		const entries = rows
			.map((r) => {
				const q = edits[r.machine_id];
				return q !== undefined && q !== ""
					? { machine_id: r.machine_id, wv_quality_id: Number(q) }
					: null;
			})
			.filter((x): x is { machine_id: number; wv_quality_id: number } => x !== null);

		const body = { co_id: Number(coId), branch_id: Number(branchId), tran_date: date, spell, entries };
		const { error: err } = await fetchWithCookie(
			apiRoutesPortalMasters.WEAVING_QUALITY_MAP_SAVE,
			"POST",
			body
		);
		setSaving(false);
		if (err) {
			setSnack(err);
			return;
		}
		setSnack(`Saved ${entries.length} loom mapping(s).`);
		refresh();
	};

	const handleMapped = async () => {
		setBusy(true);
		const body = { co_id: Number(coId), branch_id: Number(branchId), tran_date: date, spell };
		const { data, error: err } = await fetchWithCookie<{
			data: { quality_stamped: number; operator_stamped: number };
		}>(apiRoutesPortalMasters.WEAVING_QUALITY_MAP_MAPPED, "POST", body);
		setBusy(false);
		if (err) {
			setSnack(err);
			return;
		}
		const d = data?.data;
		setSnack(
			`Quality stamped: ${d?.quality_stamped ?? 0}, Operator stamped: ${d?.operator_stamped ?? 0}`
		);
		refresh();
	};

	if (!spell) {
		return <Alert severity="info">Select a spell to load loom → quality mapping.</Alert>;
	}

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
				<Typography variant="subtitle2">Loom → Quality mapping</Typography>
				<Button
					variant="contained"
					size="small"
					startIcon={<SaveIcon size={16} />}
					onClick={handleSaveMap}
					disabled={saving || loading || rows.length === 0}
				>
					{saving ? "Saving…" : dirtyCount > 0 ? `Save Map (${dirtyCount} unsaved)` : "Save Map"}
				</Button>
				<Button
					variant="outlined"
					size="small"
					startIcon={<StampIcon size={16} />}
					onClick={handleMapped}
					disabled={busy || loading}
				>
					Mapped
				</Button>
				{lastUpdated ? (
					<Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
						Last updated: {new Date(lastUpdated.replace(" ", "T")).toLocaleString()}
					</Typography>
				) : null}
			</Box>

			{error ? <Alert severity="error">{error}</Alert> : null}

			{!loading && rows.length > 0 && hasCarryForward ? (
				<Alert severity="info">
					Prefilled from {prevDate ?? "the last saved day"}
					{dirtyCount > 0 ? ` — ${dirtyCount} unsaved change(s). Review and Save Map.` : "."}
				</Alert>
			) : null}

			{loading ? (
				<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
					<CircularProgress />
				</Box>
			) : rows.length === 0 ? (
				<Alert severity="info">No looms found for this date and spell.</Alert>
			) : (
				<Box sx={{ width: "100%", overflowX: "auto" }}>
					<Table size="small" sx={{ minWidth: 600 }}>
						<TableHead>
							<TableRow>
								<TableCell>Mc Code</TableCell>
								<TableCell>Loom</TableCell>
								<TableCell>Quality</TableCell>
								<TableCell>Status</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{rows.map((r) => {
								const q = edits[r.machine_id] ?? "";
								const dirty = isDirty(r.machine_id);
								return (
									<TableRow
										key={r.machine_id}
										sx={{ bgcolor: dirty ? "rgba(255, 193, 7, 0.12)" : undefined }}
									>
										<TableCell>{r.mech_code}</TableCell>
										<TableCell>{r.machine_name}</TableCell>
										<TableCell>
											<TextField
												select
												size="small"
												value={q}
												onChange={(ev) =>
													setQuality(
														r.machine_id,
														ev.target.value === "" ? "" : Number(ev.target.value)
													)
												}
												sx={{ minWidth: 180 }}
											>
												<MenuItem value="">
													<em>None</em>
												</MenuItem>
												{setup.qualities.map((qq) => (
													<MenuItem key={qq.wv_quality_id} value={qq.wv_quality_id}>
														{qq.wv_quality_name ?? qq.wv_quality_code} ({qq.wv_quality_code})
													</MenuItem>
												))}
											</TextField>
										</TableCell>
										<TableCell>
											{dirty ? (
												<Chip
													size="small"
													color="warning"
													variant="outlined"
													label={
														r.wv_quality_id == null && r.prev_quality_id != null
															? `Unsaved · from ${r.prev_quality_name ?? "prev"}`
															: "Unsaved"
													}
												/>
											) : r.wv_quality_id != null ? (
												<Chip size="small" color="success" variant="outlined" label="Saved" />
											) : null}
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
