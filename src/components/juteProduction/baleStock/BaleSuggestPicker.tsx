"use client";

import * as React from "react";
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { Sparkles as SuggestIcon } from "lucide-react";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import {
	fetchBaleStockRows,
	fetchBaleStockSetup,
	fetchBaleSuggestions,
	type BaleStockRow,
	type BaleStockSetup,
	type BaleSuggestPurpose,
} from "@/utils/baleStockService";
import BaleStockGrid from "./BaleStockGrid";
import { mergeRowsById, selectedMt, shortfallMessage, suggestCaption, suggestSeriesOptions } from "./baleStockCalc";

/**
 * Prop contract shared with the sales invoice create page and the Bale Stock
 * page / quick dialogs (spec §7e). Do not rename or retype these.
 */
export interface BaleSuggestPickerProps {
	coId: number;
	branchId: number;
	asOn: string;
	purpose: BaleSuggestPurpose;
	/** Controlled selection — the parent owns it. */
	selectedIds: number[];
	/**
	 * The new complete selection, plus the rows (of this picker's series) that
	 * are in it, so the parent can gate actions on bales its own grid has not
	 * loaded. Ids the picker does not know (other series, the parent's grid)
	 * are always kept.
	 */
	onSelectionChange: (ids: number[], rows: BaleStockRow[]) => void;
	/** Optional: restrict to one quality. */
	finishingQualityId?: number | null;
	disabled?: boolean;
	/** Compact grid (dialogs). */
	compact?: boolean;
}

/**
 * @component BaleSuggestPicker
 * @description "Pick by state and count" — the operator names the bale
 * series (the consignee state the bales were numbered in) and how many
 * bales, **Suggest** asks GET /baleStock/suggest for that many eligible bales
 * (inspect: uninspected sacking, oldest first; despatch: in stock, inspected
 * first then oldest) and they become the selection. Below, every eligible
 * bale of that series is listed in a checkbox grid so the pick is adjusted by
 * hand. Self-contained: loads the setup (series list) once per company /
 * branch and the series' rows whenever the series, as-on date or quality
 * changes. Suggest and the grid replace the selection *within this series*
 * and keep whatever else the parent has selected.
 */
export default function BaleSuggestPicker({
	coId,
	branchId,
	asOn,
	purpose,
	selectedIds,
	onSelectionChange,
	finishingQualityId,
	disabled = false,
	compact = false,
}: BaleSuggestPickerProps) {
	// Strict-mode mounts twice, so the flag is re-armed in the effect body.
	const mounted = React.useRef(true);
	React.useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	// ---------------------------------------------------------------------
	// Setup — once per company / branch.
	// ---------------------------------------------------------------------
	const [setup, setSetup] = React.useState<BaleStockSetup | null>(null);
	const [setupLoading, setSetupLoading] = React.useState(false);
	const [setupError, setSetupError] = React.useState<string | null>(null);

	React.useEffect(() => {
		let cancelled = false;
		setSetupLoading(true);
		setSetupError(null);
		fetchBaleStockSetup({ coId, branchId })
			.then((data) => {
				if (!cancelled) setSetup(data);
			})
			.catch((err: Error) => {
				if (cancelled) return;
				setSetupError(err.message);
				setSetup(null);
			})
			.finally(() => {
				if (!cancelled) setSetupLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [coId, branchId]);

	const seriesList = React.useMemo(
		() => suggestSeriesOptions(setup?.series ?? [], setup?.qualities ?? [], purpose, finishingQualityId),
		[setup, purpose, finishingQualityId]
	);
	const seriesOptions = React.useMemo(
		() => seriesList.map((s) => ({ value: s.bale_series_id, label: s.series_name })),
		[seriesList]
	);

	const [seriesId, setSeriesId] = React.useState<number | "">("");
	// A single series needs no picking; a series that left the list is dropped.
	React.useEffect(() => {
		if (seriesList.length === 1) setSeriesId(seriesList[0].bale_series_id);
		else setSeriesId((prev) => (prev !== "" && seriesList.some((s) => s.bale_series_id === prev) ? prev : ""));
	}, [seriesList]);

	const [countText, setCountText] = React.useState("");
	const count = Number(countText);
	const countValid = countText.trim() !== "" && Number.isInteger(count) && count >= 1;
	const countError = countText.trim() !== "" && !countValid;

	// ---------------------------------------------------------------------
	// Eligible rows of the picked series — the grid the operator adjusts in.
	// ---------------------------------------------------------------------
	const [rows, setRows] = React.useState<BaleStockRow[]>([]);
	const [rowsLoading, setRowsLoading] = React.useState(false);
	const [rowsError, setRowsError] = React.useState<string | null>(null);
	/** `available` from the last suggestion — the eligible total even when the row list is capped. */
	const [suggestAvailable, setSuggestAvailable] = React.useState<number | null>(null);
	const [suggesting, setSuggesting] = React.useState(false);
	const [suggestError, setSuggestError] = React.useState<string | null>(null);

	const status = purpose === "inspect" ? "NOT_INSPECTED" : "STOCK";

	React.useEffect(() => {
		setSuggestAvailable(null);
		setSuggestError(null);
		if (seriesId === "") {
			setRows([]);
			setRowsError(null);
			return;
		}
		let cancelled = false;
		setRowsLoading(true);
		setRowsError(null);
		fetchBaleStockRows({ coId, branchId, asOn, status, baleSeriesId: seriesId, finishingQualityId })
			.then((result) => {
				if (!cancelled) setRows(result.rows);
			})
			.catch((err: Error) => {
				if (cancelled) return;
				setRowsError(err.message);
				setRows([]);
			})
			.finally(() => {
				if (!cancelled) setRowsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [coId, branchId, asOn, status, seriesId, finishingQualityId]);

	// Split the parent's selection into "this series" and "everything else".
	const pickerIds = React.useMemo(() => new Set(rows.map((r) => r.bale_entry_id)), [rows]);
	const outsideIds = React.useMemo(() => selectedIds.filter((id) => !pickerIds.has(id)), [selectedIds, pickerIds]);
	const selectedHere = React.useMemo(() => selectedIds.filter((id) => pickerIds.has(id)), [selectedIds, pickerIds]);
	const mt = React.useMemo(() => selectedMt(rows, selectedIds), [rows, selectedIds]);

	const available = Math.max(rows.length, suggestAvailable ?? 0);
	const shortfall = seriesId !== "" && !rowsLoading && !rowsError && countValid ? shortfallMessage(count, available) : null;

	const canSuggest = !disabled && seriesId !== "" && countValid && !rowsLoading && !suggesting && !setupLoading;

	const suggest = async () => {
		// `seriesId` first: it narrows to `number` here without leaning on `canSuggest`.
		if (seriesId === "" || !canSuggest) return;
		setSuggesting(true);
		setSuggestError(null);
		try {
			const result = await fetchBaleSuggestions({
				coId,
				branchId,
				baleSeriesId: seriesId,
				count,
				purpose,
				asOn,
				finishingQualityId,
			});
			if (!mounted.current) return;
			// A suggested bale beyond the row cap still shows up ticked.
			setRows((prev) => mergeRowsById(prev, result.rows));
			setSuggestAvailable(result.available);
			const ids = result.rows.map((r) => r.bale_entry_id);
			onSelectionChange([...new Set([...outsideIds, ...ids])], result.rows);
		} catch (err) {
			if (!mounted.current) return;
			setSuggestError(err instanceof Error ? err.message : "Could not suggest bales");
		} finally {
			if (mounted.current) setSuggesting(false);
		}
	};

	const onGridChange = (ids: number[]) => {
		// The checkbox column stays (no layout flash during a save); ticks are just ignored.
		if (disabled) return;
		const wanted = new Set(ids);
		const chosen = rows.filter((r) => wanted.has(r.bale_entry_id));
		onSelectionChange([...new Set([...outsideIds, ...ids])], chosen);
	};

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			void suggest();
		}
	};

	const noSeriesText =
		finishingQualityId != null
			? "No series for this quality"
			: purpose === "inspect"
				? "No sacking series set up for this branch"
				: "No bale series set up for this branch";
	const emptyText =
		purpose === "inspect"
			? `No uninspected bales in this series as on ${asOn}`
			: `No bales in stock in this series as on ${asOn}`;

	return (
		<Stack spacing={1}>
			<Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "flex-start" }}>
				<SearchableOptionSelect<number>
					label="Series (state)"
					size="small"
					options={seriesOptions}
					value={seriesId}
					onChange={(v) => setSeriesId(v === "" ? "" : Number(v))}
					disabled={disabled || setupLoading || seriesOptions.length === 0}
					loading={setupLoading}
					noOptionsText={noSeriesText}
					sx={{ minWidth: 200 }}
				/>
				<TextField
					type="number"
					label="Number of bales"
					size="small"
					value={countText}
					onChange={(e) => setCountText(e.target.value)}
					onKeyDown={onKeyDown}
					disabled={disabled}
					error={countError}
					helperText={countError ? "Whole number, at least 1" : undefined}
					slotProps={{ htmlInput: { step: 1, min: 1, inputMode: "numeric" } }}
					sx={{ width: 160, "& input": { textAlign: "right" } }}
				/>
				<Button
					variant="contained"
					startIcon={suggesting ? <CircularProgress size={16} color="inherit" /> : <SuggestIcon size={16} />}
					onClick={() => {
						void suggest();
					}}
					disabled={!canSuggest}
					sx={{ minHeight: 40 }}
				>
					{suggesting ? "Suggesting…" : "Suggest"}
				</Button>
				{rowsLoading ? (
					<Box sx={{ display: "flex", alignItems: "center", gap: 1, minHeight: 40 }}>
						<CircularProgress size={18} />
						<Typography variant="caption" color="text.secondary">
							Loading bales…
						</Typography>
					</Box>
				) : null}
			</Box>
			{setupError ? <Alert severity="error">{setupError}</Alert> : null}
			{rowsError ? <Alert severity="error">{rowsError}</Alert> : null}
			{suggestError ? (
				<Alert severity="error" onClose={() => setSuggestError(null)}>
					{suggestError}
				</Alert>
			) : null}
			{shortfall ? <Alert severity="warning">{shortfall}</Alert> : null}
			{seriesId !== "" ? (
				<>
					<Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
						{suggestCaption(selectedHere.length, available, mt)}
					</Typography>
					<BaleStockGrid
						rows={rows}
						loading={rowsLoading}
						selectedIds={selectedIds}
						onSelectionChange={onGridChange}
						compact={compact}
						emptyText={emptyText}
					/>
				</>
			) : null}
		</Stack>
	);
}
