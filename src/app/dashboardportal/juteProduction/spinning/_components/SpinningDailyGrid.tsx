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
import type { SpinningDailyRow } from "../types/spinningTypes";
import { computeSpinningDaily } from "../utils/spinningCalc";
import { useSpinningDaily } from "../hooks/useSpinningDaily";

type Props = {
	coId: string;
	branchId: number;
	date: string;
};

type EditState = {
	frames_a: string;
	frames_b: string;
	frames_c: string;
	prod_a: string;
	prod_b: string;
	prod_c: string;
	hrs_a: string;
	hrs_b: string;
	hrs_c: string;
	winders: string;
};

function rowKey(r: { yarn_quality_id: number; param_id: number }): string {
	return `${r.yarn_quality_id}:${r.param_id}`;
}

function seedFromRow(r: SpinningDailyRow): EditState {
	return {
		frames_a: String(r.frames_a ?? 0),
		frames_b: String(r.frames_b ?? 0),
		frames_c: String(r.frames_c ?? 0),
		prod_a: String(r.prod_a ?? 0),
		prod_b: String(r.prod_b ?? 0),
		prod_c: String(r.prod_c ?? 0),
		hrs_a: String(r.hrs_a ?? 0),
		hrs_b: String(r.hrs_b ?? 0),
		hrs_c: String(r.hrs_c ?? 0),
		winders: String(r.winders ?? 0),
	};
}

export default function SpinningDailyGrid({ coId, branchId, date }: Props) {
	const { rows, loading, error, refresh } = useSpinningDaily(coId, branchId, date);
	const [edits, setEdits] = React.useState<Record<string, EditState>>({});
	const [saving, setSaving] = React.useState(false);
	const [snack, setSnack] = React.useState<string | null>(null);

	React.useEffect(() => {
		const seed: Record<string, EditState> = {};
		rows.forEach((r) => {
			seed[rowKey(r)] = seedFromRow(r);
		});
		setEdits(seed);
	}, [rows]);

	const setField = (key: string, field: keyof EditState, v: string) => {
		setEdits((prev) => ({ ...prev, [key]: { ...prev[key], [field]: v } }));
	};

	const handleSave = async () => {
		setSaving(true);
		const entries = rows.map((r) => {
			const e = edits[rowKey(r)] ?? seedFromRow(r);
			return {
				yarn_quality_id: r.yarn_quality_id,
				param_id: r.param_id,
				frames_a: Number(e.frames_a || 0),
				frames_b: Number(e.frames_b || 0),
				frames_c: Number(e.frames_c || 0),
				prod_a: Number(e.prod_a || 0),
				prod_b: Number(e.prod_b || 0),
				prod_c: Number(e.prod_c || 0),
				hrs_a: Number(e.hrs_a || 0),
				hrs_b: Number(e.hrs_b || 0),
				hrs_c: Number(e.hrs_c || 0),
				winders: Number(e.winders || 0),
			};
		});
		const body = { co_id: Number(coId), branch_id: Number(branchId), tran_date: date, entries };
		const { error: err } = await fetchWithCookie(
			apiRoutesPortalMasters.SPINNING_DAILY_SAVE,
			"POST",
			body
		);
		setSaving(false);
		if (err) {
			setSnack(err);
			return;
		}
		setSnack(`Saved ${entries.length} spinning daily row(s).`);
		refresh();
	};

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
				<Typography variant="subtitle2">Spinning daily production</Typography>
				<Button
					variant="contained"
					size="small"
					startIcon={<SaveIcon size={16} />}
					onClick={handleSave}
					disabled={saving || loading || rows.length === 0}
				>
					{saving ? "Saving…" : "Save"}
				</Button>
			</Box>

			{error ? <Alert severity="error">{error}</Alert> : null}

			{loading ? (
				<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
					<CircularProgress />
				</Box>
			) : rows.length === 0 ? (
				<Alert severity="info">No qualities found for this date.</Alert>
			) : (
				<Box sx={{ width: "100%", overflowX: "auto" }}>
					<Table size="small" sx={{ minWidth: 1600 }}>
						<TableHead>
							<TableRow>
								<TableCell>Quality</TableCell>
								<TableCell>Set</TableCell>
								<TableCell align="right">Std Cnt</TableCell>
								<TableCell align="right">Act Cnt</TableCell>
								<TableCell>Frames A/B/C</TableCell>
								<TableCell>Prod A/B/C</TableCell>
								<TableCell>Hrs A/B/C</TableCell>
								<TableCell>Winders</TableCell>
								<TableCell align="right">Tar Prod</TableCell>
								<TableCell align="right">Act Eff %</TableCell>
								<TableCell align="right">Eff A/B/C</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{rows.map((r) => {
								const key = rowKey(r);
								const e = edits[key] ?? seedFromRow(r);
								const computed = computeSpinningDaily({
									speed: r.speed,
									tpi: r.tpi,
									spindle: r.spindle,
									act_count: r.act_count,
									tar_eff: r.target_eff,
									frames_a: Number(e.frames_a || 0),
									frames_b: Number(e.frames_b || 0),
									frames_c: Number(e.frames_c || 0),
									prod_a: Number(e.prod_a || 0),
									prod_b: Number(e.prod_b || 0),
									prod_c: Number(e.prod_c || 0),
									hrs_a: Number(e.hrs_a || 0),
									hrs_b: Number(e.hrs_b || 0),
									hrs_c: Number(e.hrs_c || 0),
									winders: Number(e.winders || 0),
								});
								const numCell = (field: keyof EditState) => (
									<TextField
										type="number"
										size="small"
										value={e[field] ?? ""}
										onChange={(ev) => setField(key, field, ev.target.value)}
										sx={{ width: 64 }}
										inputProps={{ style: { padding: "6px 8px" } }}
									/>
								);
								return (
									<TableRow key={key}>
										<TableCell>{r.quality_code}</TableCell>
										<TableCell>{r.set_name}</TableCell>
										<TableCell align="right">{r.std_count}</TableCell>
										<TableCell align="right">{r.act_count}</TableCell>
										<TableCell>
											<Box sx={{ display: "flex", gap: 0.5 }}>
												{numCell("frames_a")}
												{numCell("frames_b")}
												{numCell("frames_c")}
											</Box>
										</TableCell>
										<TableCell>
											<Box sx={{ display: "flex", gap: 0.5 }}>
												{numCell("prod_a")}
												{numCell("prod_b")}
												{numCell("prod_c")}
											</Box>
										</TableCell>
										<TableCell>
											<Box sx={{ display: "flex", gap: 0.5 }}>
												{numCell("hrs_a")}
												{numCell("hrs_b")}
												{numCell("hrs_c")}
											</Box>
										</TableCell>
										<TableCell>{numCell("winders")}</TableCell>
										<TableCell align="right">{computed.tar_prd}</TableCell>
										<TableCell align="right">{computed.act_eff}</TableCell>
										<TableCell align="right">
											{computed.eff_a} / {computed.eff_b} / {computed.eff_c}
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
				autoHideDuration={3000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</Box>
	);
}
