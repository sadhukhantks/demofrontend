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
import type { ActCountRow } from "../types/spinningTypes";
import { useActCount } from "../hooks/useActCount";

type Props = {
	coId: string;
	branchId: number;
	date: string;
};

// Composite key: a quality can appear with multiple params.
function rowKey(r: { yarn_quality_id: number; param_id: number }): string {
	return `${r.yarn_quality_id}:${r.param_id}`;
}

export default function ActCountGrid({ coId, branchId, date }: Props) {
	const { rows, loading, error, refresh } = useActCount(coId, branchId, date);
	const [values, setValues] = React.useState<Record<string, string>>({});
	const [saving, setSaving] = React.useState(false);
	const [snack, setSnack] = React.useState<string | null>(null);

	React.useEffect(() => {
		const seed: Record<string, string> = {};
		rows.forEach((r) => {
			seed[rowKey(r)] = String(r.spg_actual_count ?? "");
		});
		setValues(seed);
	}, [rows]);

	const setValue = (key: string, v: string) => {
		setValues((prev) => ({ ...prev, [key]: v }));
	};

	const handleSave = async () => {
		setSaving(true);
		const entries = rows.map((r) => ({
			yarn_quality_id: r.yarn_quality_id,
			param_id: r.param_id,
			spg_actual_count: Number(values[rowKey(r)] || 0),
		}));
		const body = { co_id: Number(coId), branch_id: Number(branchId), mapping_date: date, entries };
		const { error: err } = await fetchWithCookie(
			apiRoutesPortalMasters.SPINNING_ACT_COUNT_SAVE,
			"POST",
			body
		);
		setSaving(false);
		if (err) {
			setSnack(err);
			return;
		}
		setSnack(`Saved ${entries.length} actual count(s).`);
		refresh();
	};

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
				<Typography variant="subtitle2">Actual count per quality</Typography>
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
				<Alert severity="info">No qualities found for this mapping date.</Alert>
			) : (
				<Box sx={{ width: "100%", overflowX: "auto" }}>
					<Table size="small" sx={{ minWidth: 600 }}>
						<TableHead>
							<TableRow>
								<TableCell>Quality</TableCell>
								<TableCell>Set</TableCell>
								<TableCell>Actual Count</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{rows.map((r: ActCountRow) => {
								const key = rowKey(r);
								return (
									<TableRow key={key}>
										<TableCell>{r.quality_code}</TableCell>
										<TableCell>{r.set_name}</TableCell>
										<TableCell>
											<TextField
												type="number"
												size="small"
												value={values[key] ?? ""}
												onChange={(ev) => setValue(key, ev.target.value)}
												sx={{ width: 140 }}
											/>
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
