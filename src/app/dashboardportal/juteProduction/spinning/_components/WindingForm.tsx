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
import { Save as SaveIcon } from "lucide-react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { useWindingSetup } from "../hooks/useWinding";
import WindingGrid from "./WindingGrid";

type Props = {
	coId: string;
	branchId: number;
	date: string;
};

export default function WindingForm({ coId, branchId, date }: Props) {
	const { setup, loading: setupLoading, error: setupError } = useWindingSetup(coId, branchId);
	const [shift, setShift] = React.useState<string>("");
	const [qty, setQty] = React.useState<Record<number, string>>({});
	const [saving, setSaving] = React.useState(false);
	const [snack, setSnack] = React.useState<string | null>(null);
	const [refreshSignal, setRefreshSignal] = React.useState(0);

	const shifts = setup?.shifts ?? [];
	const qualities = setup?.qualities ?? [];

	// Default the shift selector to the first available shift once setup loads.
	React.useEffect(() => {
		if (shifts.length > 0 && !shift) setShift(shifts[0]);
	}, [shifts, shift]);

	const setQtyFor = (qualityId: number, v: string) => {
		setQty((prev) => ({ ...prev, [qualityId]: v }));
	};

	const handleSave = async () => {
		if (!shift) {
			setSnack("Select a shift.");
			return;
		}
		const entries = qualities
			.map((q) => ({
				yarn_quality_id: q.yarn_quality_id,
				qty_wind: Number(qty[q.yarn_quality_id] || 0),
			}))
			.filter((e) => e.qty_wind > 0);

		if (entries.length === 0) {
			setSnack("Enter at least one winding quantity.");
			return;
		}

		setSaving(true);
		const body = {
			co_id: Number(coId),
			branch_id: Number(branchId),
			prod_date: date,
			shift,
			entries,
		};
		const { error: err } = await fetchWithCookie(
			apiRoutesPortalMasters.WINDING_SAVE,
			"POST",
			body
		);
		setSaving(false);
		if (err) {
			setSnack(err);
			return;
		}
		setSnack(`Saved ${entries.length} winding qty(s).`);
		setRefreshSignal((v) => v + 1);
	};

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
			<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
				<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
					<Typography variant="subtitle2">Winding production (per quality)</Typography>
					<TextField
						select
						size="small"
						label="Shift"
						value={shift}
						onChange={(e) => setShift(e.target.value)}
						sx={{ minWidth: 120 }}
					>
						{shifts.map((s) => (
							<MenuItem key={s} value={s}>
								{s}
							</MenuItem>
						))}
					</TextField>
					<Button
						variant="contained"
						size="small"
						startIcon={<SaveIcon size={16} />}
						onClick={handleSave}
						disabled={saving || setupLoading || qualities.length === 0}
					>
						{saving ? "Saving…" : "Save"}
					</Button>
				</Box>

				{setupError ? <Alert severity="error">{setupError}</Alert> : null}

				{setupLoading ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
						<CircularProgress />
					</Box>
				) : qualities.length === 0 ? (
					<Alert severity="info">No qualities found for this branch.</Alert>
				) : (
					<Box sx={{ width: "100%", overflowX: "auto" }}>
						<Table size="small" sx={{ minWidth: 500 }}>
							<TableHead>
								<TableRow>
									<TableCell>Quality</TableCell>
									<TableCell>Qty Wind</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{qualities.map((q) => (
									<TableRow key={q.yarn_quality_id}>
										<TableCell>
											{q.quality_code} — {q.quality_name}
										</TableCell>
										<TableCell>
											<TextField
												type="number"
												size="small"
												value={qty[q.yarn_quality_id] ?? ""}
												onChange={(ev) => setQtyFor(q.yarn_quality_id, ev.target.value)}
												sx={{ width: 140 }}
											/>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</Box>
				)}
			</Box>

			<WindingGrid
				coId={coId}
				branchId={branchId}
				date={date}
				shift={shift}
				qualities={qualities}
				refreshSignal={refreshSignal}
			/>

			<Snackbar
				open={!!snack}
				autoHideDuration={3000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</Box>
	);
}
