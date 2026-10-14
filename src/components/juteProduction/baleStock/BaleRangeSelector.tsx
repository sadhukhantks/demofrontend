"use client";

import * as React from "react";
import { Box, Button, TextField, Typography } from "@mui/material";
import { ListChecks as RangeIcon, X as ClearIcon } from "lucide-react";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import type { BaleStockRow } from "@/utils/baleStockService";
import { selectRange } from "./baleStockCalc";

export interface BaleRangeSeriesOption {
	bale_series_id: number;
	series_name: string;
}

export interface BaleRangeSelectorProps {
	/** Series the operator can pick — setup.series on the page, derived from rows in the quick dialog. */
	series: ReadonlyArray<BaleRangeSeriesOption>;
	/** The rows currently loaded in the grid — the range only ever selects among these. */
	rows: ReadonlyArray<BaleStockRow>;
	selectedCount: number;
	/** Adds the ids of the range to the selection (the parent de-duplicates). */
	onAddIds: (ids: number[]) => void;
	onClearSelection: () => void;
	disabled?: boolean;
}

/**
 * @component BaleRangeSelector
 * @description Series + From–To bale numbers → ticks the matching loaded rows
 * in the grid. The mill records inspection and despatch by bale-number runs
 * ("PUNJAB 612 to 650"), so this is quicker than 39 checkboxes. Rows that are
 * not loaded (filtered out or beyond the server cap) are never selected — the
 * message under the button says how many were found.
 */
export default function BaleRangeSelector({
	series,
	rows,
	selectedCount,
	onAddIds,
	onClearSelection,
	disabled = false,
}: BaleRangeSelectorProps) {
	const [seriesId, setSeriesId] = React.useState<number | "">("");
	const [from, setFrom] = React.useState("");
	const [to, setTo] = React.useState("");
	const [note, setNote] = React.useState<string | null>(null);

	// A single series needs no picking.
	React.useEffect(() => {
		if (series.length === 1) setSeriesId(series[0].bale_series_id);
		else setSeriesId((prev) => (prev !== "" && series.some((s) => s.bale_series_id === prev) ? prev : ""));
	}, [series]);

	const seriesOptions = React.useMemo(
		() => series.map((s) => ({ value: s.bale_series_id, label: s.series_name })),
		[series]
	);

	const fromNum = Number(from);
	const toNum = Number(to);
	const canApply =
		!disabled &&
		seriesId !== "" &&
		from.trim() !== "" &&
		to.trim() !== "" &&
		Number.isInteger(fromNum) &&
		Number.isInteger(toNum) &&
		fromNum >= 0 &&
		toNum >= 0;

	const apply = () => {
		// `seriesId` first: it narrows to `number` here without leaning on `canApply`.
		if (seriesId === "" || !canApply) return;
		const ids = selectRange(rows, seriesId, fromNum, toNum);
		if (ids.length === 0) {
			setNote("No loaded bales in that range — check the series, the filters or the as-on date");
			return;
		}
		setNote(`${ids.length} ${ids.length === 1 ? "bale" : "bales"} added to the selection`);
		onAddIds(ids);
	};

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			apply();
		}
	};

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
			<Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "flex-start" }}>
				<SearchableOptionSelect<number>
					label="Series"
					size="small"
					options={seriesOptions}
					value={seriesId}
					onChange={(v) => setSeriesId(v === "" ? "" : Number(v))}
					disabled={disabled || series.length === 0}
					noOptionsText="No series among the loaded bales"
					sx={{ minWidth: 200 }}
				/>
				<TextField
					type="number"
					label="Bale No from"
					size="small"
					value={from}
					onChange={(e) => setFrom(e.target.value)}
					onKeyDown={onKeyDown}
					disabled={disabled}
					slotProps={{ htmlInput: { step: 1, min: 0, inputMode: "numeric" } }}
					sx={{ width: 140 }}
				/>
				<TextField
					type="number"
					label="to"
					size="small"
					value={to}
					onChange={(e) => setTo(e.target.value)}
					onKeyDown={onKeyDown}
					disabled={disabled}
					slotProps={{ htmlInput: { step: 1, min: 0, inputMode: "numeric" } }}
					sx={{ width: 140 }}
				/>
				<Button
					variant="outlined"
					startIcon={<RangeIcon size={16} />}
					onClick={apply}
					disabled={!canApply}
					sx={{ minHeight: 40 }}
				>
					Select range
				</Button>
				<Button
					variant="text"
					startIcon={<ClearIcon size={16} />}
					onClick={() => {
						setNote(null);
						onClearSelection();
					}}
					disabled={disabled || selectedCount === 0}
					sx={{ minHeight: 40 }}
				>
					Clear selection
				</Button>
				<Typography variant="body2" sx={{ fontWeight: 600, alignSelf: "center" }}>
					{selectedCount} selected
				</Typography>
			</Box>
			{note ? (
				<Typography variant="caption" color="text.secondary">
					{note}
				</Typography>
			) : null}
		</Box>
	);
}
