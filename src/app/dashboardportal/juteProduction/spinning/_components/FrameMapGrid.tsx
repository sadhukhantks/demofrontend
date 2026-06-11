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
import type { SpinningSetup, YarnQualityParamRow } from "../types/spinningTypes";
import { useFrameMap } from "../hooks/useFrameMap";

type Props = {
	coId: string;
	branchId: number;
	setup: SpinningSetup;
	date: string;
	spell: string;
};

type EditState = {
	yarn_quality_id: number | "";
	param_id: number | "";
};

export default function FrameMapGrid({ coId, branchId, setup, date, spell }: Props) {
	const { rows, loading, error, refresh } = useFrameMap(coId, branchId, date, spell);
	const [edits, setEdits] = React.useState<Record<number, EditState>>({});
	const [paramsByQuality, setParamsByQuality] = React.useState<Record<number, YarnQualityParamRow[]>>(
		{}
	);
	const [saving, setSaving] = React.useState(false);
	const [busy, setBusy] = React.useState(false);
	const [snack, setSnack] = React.useState<string | null>(null);

	// Seed local edit state from fetched rows.
	React.useEffect(() => {
		const seed: Record<number, EditState> = {};
		rows.forEach((r) => {
			seed[r.machine_id] = {
				yarn_quality_id: r.yarn_quality_id ?? "",
				param_id: r.param_id ?? "",
			};
		});
		setEdits(seed);
	}, [rows]);

	// Lazily load param options for a quality so the param dropdown can populate.
	const loadParams = React.useCallback(
		async (qualityId: number) => {
			if (paramsByQuality[qualityId]) return;
			const url = `${apiRoutesPortalMasters.YARN_QUALITY_PARAM_LIST}?co_id=${coId}&yarn_quality_id=${qualityId}`;
			const { data } = await fetchWithCookie<{ data: YarnQualityParamRow[] }>(url, "GET");
			setParamsByQuality((prev) => ({ ...prev, [qualityId]: data?.data ?? [] }));
		},
		[coId, paramsByQuality]
	);

	React.useEffect(() => {
		rows.forEach((r) => {
			if (r.yarn_quality_id != null) void loadParams(r.yarn_quality_id);
		});
	}, [rows, loadParams]);

	const setQuality = (machineId: number, value: number | "") => {
		setEdits((prev) => ({
			...prev,
			[machineId]: { yarn_quality_id: value, param_id: "" },
		}));
		if (value !== "") void loadParams(value);
	};

	const setParam = (machineId: number, value: number | "") => {
		setEdits((prev) => ({
			...prev,
			[machineId]: { ...prev[machineId], param_id: value },
		}));
	};

	const handleSaveMap = async () => {
		setSaving(true);
		const entries = rows
			.map((r) => {
				const e = edits[r.machine_id];
				return e && e.yarn_quality_id !== ""
					? {
							machine_id: r.machine_id,
							yarn_quality_id: Number(e.yarn_quality_id),
							param_id: e.param_id === "" ? null : Number(e.param_id),
						}
					: null;
			})
			.filter(
				(x): x is { machine_id: number; yarn_quality_id: number; param_id: number | null } =>
					x !== null
			);

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
		return <Alert severity="info">Select a spell to load frame → quality mapping.</Alert>;
	}

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
				<Typography variant="subtitle2">Frame → Quality mapping</Typography>
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
					<Table size="small" sx={{ minWidth: 700 }}>
						<TableHead>
							<TableRow>
								<TableCell>Mc Code</TableCell>
								<TableCell>Machine</TableCell>
								<TableCell>Yarn Quality</TableCell>
								<TableCell>Param / Set</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{rows.map((r) => {
								const e = edits[r.machine_id] ?? { yarn_quality_id: "", param_id: "" };
								const paramOpts =
									e.yarn_quality_id !== "" ? paramsByQuality[Number(e.yarn_quality_id)] ?? [] : [];
								return (
									<TableRow key={r.machine_id}>
										<TableCell>{r.mech_code}</TableCell>
										<TableCell>{r.machine_name}</TableCell>
										<TableCell>
											<TextField
												select
												size="small"
												value={e.yarn_quality_id}
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
												{setup.qualities.map((q) => (
													<MenuItem key={q.yarn_quality_id} value={q.yarn_quality_id}>
														{q.quality_code} — {q.quality_name}
													</MenuItem>
												))}
											</TextField>
										</TableCell>
										<TableCell>
											<TextField
												select
												size="small"
												value={e.param_id}
												onChange={(ev) =>
													setParam(
														r.machine_id,
														ev.target.value === "" ? "" : Number(ev.target.value)
													)
												}
												disabled={e.yarn_quality_id === ""}
												sx={{ minWidth: 180 }}
											>
												<MenuItem value="">
													<em>None</em>
												</MenuItem>
												{paramOpts.map((p) => (
													<MenuItem key={p.param_id} value={p.param_id}>
														{p.set_name ?? `Param ${p.param_id}`}
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
