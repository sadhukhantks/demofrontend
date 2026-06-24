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
import { useWeavingAdjustment } from "../hooks/useWeavingAdjustment";

type Props = {
	coId: string;
	branchId: number;
	date: string;
	spell: string;
};

// Reduce-jugar adjustment per loom for a (date, spell). Editing "Reduce Jugar" sets
// less_production on the loom's daily row, which deducts from production_yds in
// vw_weaving_daily. Only mapped looms are editable; batch "save all dirty".
export default function WeavingAdjustmentGrid({ coId, branchId, date, spell }: Props) {
	const { rows, loading, error, refresh } = useWeavingAdjustment(coId, branchId, date, spell);
	const [edits, setEdits] = React.useState<Record<number, string>>({});
	const [saving, setSaving] = React.useState(false);
	const [snack, setSnack] = React.useState<string | null>(null);
	const [query, setQuery] = React.useState("");

	// Seed local edit state (loom -> reduce value) from fetched rows. Blank when 0.
	React.useEffect(() => {
		const seed: Record<number, string> = {};
		rows.forEach((r) => {
			seed[r.machine_id] = String(r.less_production || "");
		});
		setEdits(seed);
	}, [rows]);

	const savedMap = React.useMemo(() => {
		const m: Record<number, string> = {};
		rows.forEach((r) => {
			m[r.machine_id] = String(r.less_production || "");
		});
		return m;
	}, [rows]);

	const isDirty = React.useCallback(
		(machineId: number) => (edits[machineId] ?? "") !== (savedMap[machineId] ?? ""),
		[edits, savedMap]
	);
	const dirtyCount = rows.reduce((n, r) => (isDirty(r.machine_id) ? n + 1 : n), 0);

	const setReduce = (machineId: number, value: string) => {
		setEdits((prev) => ({ ...prev, [machineId]: value }));
	};

	const q = query.trim().toLowerCase();
	const visibleRows =
		q === ""
			? rows
			: rows.filter(
					(r) =>
						String(r.mech_posting_code ?? "").toLowerCase().includes(q) ||
						(r.mech_code ?? "").toLowerCase().includes(q) ||
						(r.machine_name ?? "").toLowerCase().includes(q)
			  );

	const handleSave = async () => {
		setSaving(true);
		const entries = rows
			.filter((r) => r.weaving_quality_id != null && isDirty(r.machine_id))
			.map((r) => ({
				machine_id: r.machine_id,
				less_production: Number(edits[r.machine_id] || 0),
			}));

		const body = { co_id: Number(coId), branch_id: Number(branchId), tran_date: date, spell, entries };
		const { data, error: err } = await fetchWithCookie<{ data: { saved: number; skipped: number } }>(
			apiRoutesPortalMasters.WEAVING_ADJUSTMENT_SAVE,
			"POST",
			body
		);
		setSaving(false);
		if (err) {
			setSnack(err);
			return;
		}
		const saved = data?.data?.saved ?? entries.length;
		const skipped = data?.data?.skipped ?? 0;
		setSnack(`Saved ${saved} adjustment(s)${skipped ? `, skipped ${skipped}` : ""}.`);
		refresh();
	};

	if (!spell) {
		return <Alert severity="info">Select a spell to load production adjustments.</Alert>;
	}

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
				<Typography variant="subtitle2">Production adjustment (reduce jugar)</Typography>
				<TextField
					size="small"
					label="Search loom / posting code"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					sx={{ minWidth: 240 }}
				/>
				<Button
					variant="contained"
					size="small"
					startIcon={<SaveIcon size={16} />}
					onClick={handleSave}
					disabled={saving || loading || rows.length === 0}
					sx={{ ml: "auto" }}
				>
					{saving ? "Saving…" : dirtyCount > 0 ? `Save (${dirtyCount} unsaved)` : "Save"}
				</Button>
			</Box>

			<Typography variant="caption" color="text.secondary">
				Reduce-jugar deducted from production: prod_yds = (cuts + jugar/jpc − reduce/jpc) × finished
				length. 0/blank = no deduction. Does not change open/closing jugar.
			</Typography>

			{error ? <Alert severity="error">{error}</Alert> : null}

			{loading ? (
				<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
					<CircularProgress />
				</Box>
			) : rows.length === 0 ? (
				<Alert severity="info">No looms found for this date and spell.</Alert>
			) : (
				<Box sx={{ width: "100%", overflowX: "auto" }}>
					<Table size="small" sx={{ minWidth: 700 }}>
						<TableHead>
							<TableRow>
								<TableCell>Posting</TableCell>
								<TableCell>Mc Code</TableCell>
								<TableCell>Loom</TableCell>
								<TableCell>Quality</TableCell>
								<TableCell>Reduce Jugar</TableCell>
								<TableCell>Status</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{visibleRows.map((r) => {
								const mapped = r.weaving_quality_id != null;
								const v = edits[r.machine_id] ?? "";
								const dirty = isDirty(r.machine_id);
								return (
									<TableRow
										key={r.machine_id}
										sx={{ bgcolor: dirty ? "rgba(255, 193, 7, 0.12)" : undefined }}
									>
										<TableCell>{r.mech_posting_code ?? "—"}</TableCell>
										<TableCell>{r.mech_code}</TableCell>
										<TableCell>{r.machine_name}</TableCell>
										<TableCell>
											{mapped ? (
												<Chip
													size="small"
													variant="outlined"
													label={r.weaving_quality_name ?? r.weaving_quality_code}
												/>
											) : (
												<Chip size="small" color="warning" variant="outlined" label="Not mapped" />
											)}
										</TableCell>
										<TableCell>
											<TextField
												type="number"
												size="small"
												value={v}
												onChange={(ev) => setReduce(r.machine_id, ev.target.value)}
												disabled={!mapped}
												sx={{ width: 110 }}
											/>
										</TableCell>
										<TableCell>
											{dirty ? (
												<Chip size="small" color="warning" variant="outlined" label="Unsaved" />
											) : r.less_production ? (
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
