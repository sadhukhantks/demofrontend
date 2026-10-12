"use client";

import * as React from "react";
import { Box, Button, TextField } from "@mui/material";
import { RotateCcw as ResetIcon, Search as ApplyIcon } from "lucide-react";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { qualityTypeLabel } from "@/components/juteProduction/baleStock/baleStockCalc";
import type { BaleStockFilter, BaleStockRowsQuery, BaleStockSetup } from "@/utils/baleStockService";
import type { FinishingQualityType } from "@/utils/finishingStockService";

/** Draft filter values as the form holds them (primitive ids, strings for free text). */
export interface BaleStockFilterValues {
	status: BaleStockFilter;
	/** "" = all, "1" = Hessian, "2" = Sacking. */
	qualityType: "" | "1" | "2";
	finishingQualityId: number | "";
	baleSeriesId: number | "";
	baleNoFrom: string;
	baleNoTo: string;
	dateFrom: string;
	dateTo: string;
}

export const DEFAULT_BALE_STOCK_FILTERS: Readonly<BaleStockFilterValues> = Object.freeze<BaleStockFilterValues>({
	status: "STOCK",
	qualityType: "",
	finishingQualityId: "",
	baleSeriesId: "",
	baleNoFrom: "",
	baleNoTo: "",
	dateFrom: "",
	dateTo: "",
});

const QUALITY_TYPE_OPTIONS = [
	{ value: "" as const, label: "All" },
	{ value: "1" as const, label: "Hessian" },
	{ value: "2" as const, label: "Sacking" },
];

function intOrNull(value: string): number | null {
	const t = value.trim();
	if (t === "") return null;
	const n = Number(t);
	return Number.isInteger(n) && n >= 0 ? n : null;
}

/** The query-string half of `fetchBaleStockRows` built from the applied filters. */
export function toRowsQuery(
	f: BaleStockFilterValues
): Omit<BaleStockRowsQuery, "coId" | "branchId" | "asOn"> {
	return {
		status: f.status,
		qualityType: f.qualityType === "" ? null : (Number(f.qualityType) as FinishingQualityType),
		finishingQualityId: f.finishingQualityId === "" ? null : f.finishingQualityId,
		baleSeriesId: f.baleSeriesId === "" ? null : f.baleSeriesId,
		baleNoFrom: intOrNull(f.baleNoFrom),
		baleNoTo: intOrNull(f.baleNoTo),
		dateFrom: f.dateFrom || null,
		dateTo: f.dateTo || null,
	};
}

export interface BaleStockFiltersProps {
	setup: BaleStockSetup;
	/** Draft values — applied only when the operator presses Apply. */
	value: BaleStockFilterValues;
	onChange: (next: BaleStockFilterValues) => void;
	onApply: () => void;
	onReset: () => void;
	disabled?: boolean;
	/** Latest allowed pressed date (the as-on date). */
	maxDate: string;
}

/**
 * Filter bar of the Bale Stock page: status, quality type, quality, series,
 * bale-number range and pressed-date range. Presentational — the page owns the
 * draft and applied values; picking a quality type narrows the quality and
 * series lists and clears a choice that no longer fits.
 */
export default function BaleStockFilters({
	setup,
	value,
	onChange,
	onApply,
	onReset,
	disabled = false,
	maxDate,
}: BaleStockFiltersProps) {
	const statusOptions = React.useMemo(
		() => setup.statuses.map((s) => ({ value: s.code, label: s.label })),
		[setup.statuses]
	);

	const qualityOptions = React.useMemo(
		() =>
			[...setup.qualities]
				.filter((q) => value.qualityType === "" || String(q.quality_type) === value.qualityType)
				.sort(
					(a, b) =>
						a.quality_type - b.quality_type || (a.item_name ?? "").localeCompare(b.item_name ?? "")
				)
				.map((q) => ({
					value: q.finishing_quality_id,
					label: `${qualityTypeLabel(q.quality_type)} · ${q.item_name ?? `#${q.item_id}`}`,
				})),
		[setup.qualities, value.qualityType]
	);

	const seriesOptions = React.useMemo(
		() =>
			setup.series
				.filter((s) => value.qualityType === "" || String(s.quality_type) === value.qualityType)
				.map((s) => ({ value: s.bale_series_id, label: s.series_name })),
		[setup.series, value.qualityType]
	);

	const set = <K extends keyof BaleStockFilterValues>(key: K, next: BaleStockFilterValues[K]) =>
		onChange({ ...value, [key]: next });

	const onQualityTypeChange = (next: "" | "1" | "2") => {
		const quality = setup.qualities.find((q) => q.finishing_quality_id === value.finishingQualityId);
		const series = setup.series.find((s) => s.bale_series_id === value.baleSeriesId);
		onChange({
			...value,
			qualityType: next,
			finishingQualityId:
				quality && (next === "" || String(quality.quality_type) === next) ? value.finishingQualityId : "",
			baleSeriesId: series && (next === "" || String(series.quality_type) === next) ? value.baleSeriesId : "",
		});
	};

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			onApply();
		}
	};

	return (
		<Box
			component="form"
			noValidate
			onSubmit={(e: React.FormEvent) => {
				e.preventDefault();
				onApply();
			}}
			sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
		>
			<Box
				sx={{
					display: "grid",
					gap: 1.5,
					gridTemplateColumns: {
						xs: "1fr",
						sm: "repeat(2, minmax(0, 1fr))",
						md: "repeat(4, minmax(0, 1fr))",
					},
				}}
			>
				<SearchableOptionSelect<BaleStockFilter>
					label="Status"
					fullWidth
					clearable={false}
					options={statusOptions}
					value={value.status}
					onChange={(v) => set("status", v === "" ? "STOCK" : v)}
					disabled={disabled}
				/>
				<SearchableOptionSelect<"" | "1" | "2">
					label="Quality type"
					fullWidth
					clearable={false}
					options={QUALITY_TYPE_OPTIONS}
					value={value.qualityType}
					onChange={(v) => onQualityTypeChange(v === "" ? "" : v)}
					disabled={disabled}
				/>
				<SearchableOptionSelect<number>
					label="Quality"
					fullWidth
					options={qualityOptions}
					value={value.finishingQualityId}
					onChange={(v) => set("finishingQualityId", v === "" ? "" : Number(v))}
					disabled={disabled}
					placeholder="All"
				/>
				<SearchableOptionSelect<number>
					label="Series"
					fullWidth
					options={seriesOptions}
					value={value.baleSeriesId}
					onChange={(v) => set("baleSeriesId", v === "" ? "" : Number(v))}
					disabled={disabled}
					placeholder="All"
				/>
				<TextField
					type="number"
					label="Bale No from"
					size="small"
					fullWidth
					value={value.baleNoFrom}
					onChange={(e) => set("baleNoFrom", e.target.value)}
					onKeyDown={onKeyDown}
					disabled={disabled}
					slotProps={{ htmlInput: { step: 1, min: 0, inputMode: "numeric" } }}
				/>
				<TextField
					type="number"
					label="Bale No to"
					size="small"
					fullWidth
					value={value.baleNoTo}
					onChange={(e) => set("baleNoTo", e.target.value)}
					onKeyDown={onKeyDown}
					disabled={disabled}
					slotProps={{ htmlInput: { step: 1, min: 0, inputMode: "numeric" } }}
				/>
				<TextField
					type="date"
					label="Pressed from"
					size="small"
					fullWidth
					value={value.dateFrom}
					onChange={(e) => set("dateFrom", e.target.value)}
					disabled={disabled}
					slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: value.dateTo || maxDate } }}
				/>
				<TextField
					type="date"
					label="Pressed to"
					size="small"
					fullWidth
					value={value.dateTo}
					onChange={(e) => set("dateTo", e.target.value)}
					disabled={disabled}
					slotProps={{
						inputLabel: { shrink: true },
						htmlInput: { min: value.dateFrom || undefined, max: maxDate },
					}}
				/>
			</Box>
			<Box sx={{ display: "flex", gap: 1, justifyContent: { xs: "stretch", md: "flex-end" } }}>
				<Button
					type="button"
					variant="outlined"
					startIcon={<ResetIcon size={16} />}
					onClick={onReset}
					disabled={disabled}
					sx={{ minHeight: 40 }}
				>
					Reset
				</Button>
				<Button
					type="submit"
					variant="contained"
					startIcon={<ApplyIcon size={16} />}
					disabled={disabled}
					sx={{ minHeight: 40 }}
				>
					Apply
				</Button>
			</Box>
		</Box>
	);
}
