"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
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
import type { SpinningSetup } from "../types/spinningTypes";
import { useFrameMap } from "../hooks/useFrameMap";

type Props = {
	coId: string;
	branchId: number;
	setup: SpinningSetup;
	date: string;
	spell: string;
};

export default function FrameMapGrid({ coId, branchId, setup, date, spell }: Props) {
	const { rows, loading, error, refresh } = useFrameMap(coId, branchId, date, spell);
	const [edits, setEdits] = React.useState<Record<number, number | "">>({});
	const [saving, setSaving] = React.useState(false);
	const [busy, setBusy] = React.useState(false);
	const [snack, setSnack] = React.useState<string | null>(null);

	// Seed local edit state (machine -> item_id) from fetched rows.
	React.useEffect(() => {
		const seed: Record<number, number | ""> = {};
		rows.forEach((r) => {
			seed[r.machine_id] = r.item_id ?? "";
		});
		setEdits(seed);
	}, [rows]);

	const setYarn = (machineId: number, value: number | "") => {
		setEdits((prev) => ({ ...prev, [machineId]: value }));
	};

	const handleSaveMap = async () => {
		setSaving(true);
		const entries = rows
			.map((r) => {
				const q = edits[r.machine_id];
				return q !== undefined && q !== ""
					? { machine_id: r.machine_id, item_id: Number(q) }
					: null;
			})
			.filter((x): x is { machine_id: number; item_id: number } => x !== null);

		const body = { co_id: Number(coId), branch_id: Number(branchId), tran_date: date, spell, entries };
		const { error: err } = await fetchWithCookie(
			apiRoutesPortalMasters.SPINNING_FRAME_MAP_SAVE,
			"POST",
			body
		);
		setSaving(false);
		if (err) {
			setSnack(err);
			return;
		}
		setSnack(`Saved ${entries.length} frame mapping(s).`);
		refresh();
	};

	const handleMapped = async () => {
		setBusy(true);
		const body = { co_id: Number(coId), branch_id: Number(branchId), tran_date: date, spell };
		const { data, error: err } = await fetchWithCookie<{
			data: { quality_stamped: number; operator_stamped: number };
		}>(apiRoutesPortalMasters.SPINNING_FRAME_MAP_MAPPED, "POST", body);
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
		return <Alert severity="info">Select a spell to load frame → yarn mapping.</Alert>;
	}

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
				<Typography variant="subtitle2">Frame → Yarn mapping</Typography>
				<Button
					variant="contained"
					size="small"
					startIcon={<SaveIcon size={16} />}
					onClick={handleSaveMap}
					disabled={saving || loading || rows.length === 0}
				>
					{saving ? "Saving…" : "Save Map"}
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
			</Box>

			{error ? <Alert severity="error">{error}</Alert> : null}

			{loading ? (
				<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
					<CircularProgress />
				</Box>
			) : rows.length === 0 ? (
				<Alert severity="info">No frames found for this date and spell.</Alert>
			) : (
				<Box sx={{ width: "100%", overflowX: "auto" }}>
					<Table size="small" sx={{ minWidth: 600 }}>
						<TableHead>
							<TableRow>
								<TableCell>Mc Code</TableCell>
								<TableCell>Machine</TableCell>
								<TableCell>Yarn</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{rows.map((r) => {
								const q = edits[r.machine_id] ?? "";
								return (
									<TableRow key={r.machine_id}>
										<TableCell>{r.mech_code}</TableCell>
										<TableCell>{r.machine_name}</TableCell>
										<TableCell>
											<TextField
												select
												size="small"
												value={q}
												onChange={(ev) =>
													setYarn(
														r.machine_id,
														ev.target.value === "" ? "" : Number(ev.target.value)
													)
												}
												sx={{ minWidth: 180 }}
											>
												<MenuItem value="">
													<em>None</em>
												</MenuItem>
												{setup.yarn_items.map((yy) => (
													<MenuItem key={yy.item_id} value={yy.item_id}>
														{yy.item_name} ({yy.item_code})
													</MenuItem>
												))}
											</TextField>
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
