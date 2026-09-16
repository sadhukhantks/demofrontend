"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableRow,
	TextField,
	Typography,
} from "@mui/material";
import { Search as SearchIcon } from "lucide-react";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { useBaleSearch } from "../hooks/useBaleSearch";
import { BALE_ENTRY_TYPES, type BaleSeriesOption } from "../types/baleTypes";
import { formatKg, formatTime } from "../utils/baleCalc";

export interface FindBaleDialogProps {
	open: boolean;
	onClose: () => void;
	coId: string;
	branchId: number;
	series: ReadonlyArray<BaleSeriesOption>;
	/** Pre-select the series the form is on, if any. */
	defaultSeriesId: number | null;
}

/**
 * "Find bale" — the history of one bale number (PROD + every REPACK of it),
 * optionally narrowed to a series (SPEC §8.1, GET /bale_search).
 */
export default function FindBaleDialog({ open, onClose, coId, branchId, series, defaultSeriesId }: FindBaleDialogProps) {
	const [baleNo, setBaleNo] = React.useState("");
	const [seriesId, setSeriesId] = React.useState<number | "">(defaultSeriesId ?? "");
	const { rows, loading, error, searched, search, clear } = useBaleSearch(coId, branchId);

	React.useEffect(() => {
		if (open) {
			setSeriesId(defaultSeriesId ?? "");
		} else {
			setBaleNo("");
			clear();
		}
	}, [open, defaultSeriesId, clear]);

	const baleNoNum = Number(baleNo);
	const canSearch = baleNo.trim() !== "" && Number.isInteger(baleNoNum) && baleNoNum >= 1 && !loading;

	const runSearch = () => {
		if (!canSearch) return;
		void search(baleNoNum, seriesId === "" ? null : seriesId);
	};

	return (
		<Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
			<DialogTitle>Find bale</DialogTitle>
			<DialogContent>
				<Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "flex-start", mt: 1 }}>
					<TextField
						type="number"
						label="Bale No"
						size="small"
						value={baleNo}
						onChange={(e) => setBaleNo(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								runSearch();
							}
						}}
						inputProps={{ step: 1, min: 1, inputMode: "numeric" }}
						autoFocus
						sx={{ minWidth: 160 }}
					/>
					<SearchableOptionSelect
						label="Series (optional)"
						size="small"
						options={series.map((s) => ({ value: s.bale_series_id, label: s.series_name }))}
						value={seriesId}
						onChange={(v) => setSeriesId(v === "" ? "" : Number(v))}
						sx={{ minWidth: 220 }}
					/>
					<Button
						variant="contained"
						startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SearchIcon size={16} />}
						onClick={runSearch}
						disabled={!canSearch}
						sx={{ minHeight: 40 }}
					>
						Search
					</Button>
				</Box>

				{error ? (
					<Alert severity="error" sx={{ mt: 2 }}>
						{error}
					</Alert>
				) : null}

				{searched && !loading && !error && rows.length === 0 ? (
					<Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
						No bale {baleNoNum} found{seriesId !== "" ? " in that series" : ""}.
					</Typography>
				) : null}

				{rows.length > 0 ? (
					<Table size="small" sx={{ mt: 2 }}>
						<TableHead>
							<TableRow>
								<TableCell>Date</TableCell>
								<TableCell>Time</TableCell>
								<TableCell>Spell</TableCell>
								<TableCell>Type</TableCell>
								<TableCell>Series</TableCell>
								<TableCell align="right">Bale No</TableCell>
								<TableCell align="right">Original</TableCell>
								<TableCell>Quality</TableCell>
								<TableCell align="right">Gross</TableCell>
								<TableCell align="right">Net</TableCell>
								<TableCell>Remarks</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{rows.map((r) => (
								<TableRow key={r.bale_entry_id} hover>
									<TableCell>{r.tran_date}</TableCell>
									<TableCell>{formatTime(r.weigh_time)}</TableCell>
									<TableCell>{r.spell_code ?? ""}</TableCell>
									<TableCell>
										{r.entry_type === BALE_ENTRY_TYPES.REPACK ? (
											<Chip label="Repack" size="small" color="secondary" variant="outlined" />
										) : (
											<Chip label="Prod" size="small" variant="outlined" />
										)}
									</TableCell>
									<TableCell>{r.series_name ?? r.bale_series_id}</TableCell>
									<TableCell align="right">{r.bale_no}</TableCell>
									<TableCell align="right">{r.original_bale_no ?? ""}</TableCell>
									<TableCell>{r.item_name ?? r.item_id}</TableCell>
									<TableCell align="right">{formatKg(r.gross_wt)}</TableCell>
									<TableCell align="right">{formatKg(r.net_wt)}</TableCell>
									<TableCell>{r.remarks ?? ""}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				) : null}
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>Close</Button>
			</DialogActions>
		</Dialog>
	);
}
