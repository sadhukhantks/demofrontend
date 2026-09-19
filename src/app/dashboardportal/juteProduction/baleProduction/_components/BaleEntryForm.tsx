"use client";

import * as React from "react";
import { Alert, Box, Button, Chip, TextField, Typography } from "@mui/material";
import { Save as SaveIcon, X as CancelIcon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
	BALE_ENTRY_TYPES,
	BALE_QUALITY_TYPE_LABELS,
	type BaleEntryType,
	type BaleQualityOption,
	type BaleQualityType,
	type BaleRow,
	type BaleSeriesOption,
	type BaleSetup,
	type BaleTrollyOption,
} from "../types/baleTypes";
import {
	baleEntrySchema,
	buildDefaultBaleFormValues,
	type BaleEntryFormValues,
} from "../utils/baleSchema";
import {
	BALE_DEVIATION_WARN_PCT,
	BALE_GROSS_MAX,
	BALE_GROSS_MIN,
	computeNet,
	deviationPct,
	deviationSeverity,
	formatKg,
	formatPct,
	resolveSeries,
	toNum,
} from "../utils/baleCalc";

export interface BaleEntryFormProps {
	/** Dropdown data from GET /entry_setup. */
	setup: BaleSetup;
	/** PROD / REPACK toggle owned by the page (SPEC D2). */
	entryType: BaleEntryType;
	/** Row lifted from the grid for editing, or null while creating. */
	editingEntry: BaleRow | null;
	/** `last_bale_no + 1` for the selected series (page merges hook + last save). */
	nextBaleNo: number | null;
	nextBaleNoLoading: boolean;
	/**
	 * Monotonic counter the page bumps after a successful CREATE. The form then
	 * clears gross + original bale no, takes the new bale no and refocuses the
	 * weight — quality, series and trolley are kept for the next bale (SPEC §3).
	 */
	savedToken: number;
	/** True while the header (date / spell) is incomplete — Save stays disabled. */
	headerIncomplete: boolean;
	submitting: boolean;
	submitError: string | null;
	/** The page runs useNextBaleNo on this. */
	onSeriesChange: (seriesId: number | null) => void;
	/** Validated values — the page merges header context and calls the API. */
	onSubmit: (values: BaleEntryFormValues) => void;
	onCancelEdit: () => void;
}

const qualityLabel = (q: BaleQualityOption) => `${q.item_code} — ${q.item_name}`;
const trollyLabel = (t: BaleTrollyOption) => `${t.trolly_name} — ${formatKg(t.trolly_weight) || "0"} kg`;
const seriesLabel = (s: BaleSeriesOption) => s.series_name;

/**
 * One bale = one weighing (SPEC §3): quality → series (auto) → bale no
 * (pre-filled) → [original bale no when repacking] → gross weight → trolley →
 * remarks. Enter on any field moves to the next; Enter on the weight (or
 * remarks) saves. Presentational with respect to data: it owns only RHF state
 * and hands validated values up — it never calls the API.
 */
export default function BaleEntryForm({
	setup,
	entryType,
	editingEntry,
	nextBaleNo,
	nextBaleNoLoading,
	savedToken,
	headerIncomplete,
	submitting,
	submitError,
	onSeriesChange,
	onSubmit,
	onCancelEdit,
}: BaleEntryFormProps) {
	const editing = editingEntry != null;

	const {
		control,
		handleSubmit,
		reset,
		setValue,
		getValues,
		setError,
		clearErrors,
		formState: { errors },
	} = useForm<BaleEntryFormValues>({
		resolver: zodResolver(baleEntrySchema),
		defaultValues: buildDefaultBaleFormValues(entryType),
		mode: "onTouched",
	});

	// Watched fields — declared before the memos that consume them (block-scoped
	// consts are not hoisted).
	const qualityId = useWatch({ control, name: "finishing_quality_id" });
	const seriesId = useWatch({ control, name: "bale_series_id" });
	const trollyId = useWatch({ control, name: "trolly_id" });
	const grossWt = useWatch({ control, name: "gross_wt" });
	const formEntryType = useWatch({ control, name: "entry_type" });
	const isRepack = formEntryType === BALE_ENTRY_TYPES.REPACK;

	const quality = React.useMemo(
		() => setup.qualities.find((q) => String(q.finishing_quality_id) === qualityId) ?? null,
		[setup.qualities, qualityId]
	);
	const trolly = React.useMemo(
		() => setup.trollies.find((t) => String(t.trolly_id) === trollyId) ?? null,
		[setup.trollies, trollyId]
	);
	const resolution = React.useMemo(() => resolveSeries(setup.series, quality), [setup.series, quality]);
	const selectedSeries = React.useMemo(
		() => resolution.candidates.find((s) => String(s.bale_series_id) === seriesId) ?? null,
		[resolution.candidates, seriesId]
	);

	// ---------------------------------------------------------------------------
	// Live preview (SPEC F0 + deviation vs standard; never blocks except net <= 0)
	// ---------------------------------------------------------------------------
	const grossNum = grossWt === "" ? null : Number(grossWt);
	const packsheetWt = toNum(quality?.packsheet_wt);
	const trollyWt = toNum(trolly?.trolly_weight);
	const net = grossNum != null && Number.isFinite(grossNum) ? computeNet(grossNum, trollyWt, packsheetWt) : null;
	const pct = net != null ? deviationPct(net, quality?.std_bale_weight) : null;
	const severity = deviationSeverity(pct);
	const netNonPositive = net != null && net <= 0;

	// ---------------------------------------------------------------------------
	// Effects — order matters (React runs them in declaration order).
	// ---------------------------------------------------------------------------

	// 1. Follow the page's PROD/REPACK toggle while creating. Switching to PROD
	//    drops the original bale no (the server rejects it on PROD rows).
	React.useEffect(() => {
		if (editing) return;
		setValue("entry_type", entryType, { shouldValidate: false });
		if (entryType === BALE_ENTRY_TYPES.PROD) {
			setValue("original_bale_no", "", { shouldValidate: false });
			clearErrors("original_bale_no");
		}
	}, [entryType, editing, setValue, clearErrors]);

	// 2. Series auto-resolution whenever the quality (or the setup) changes:
	//    exactly one candidate → take it; the remembered series still valid →
	//    keep it; otherwise clear so the operator picks.
	React.useEffect(() => {
		if (editing) return;
		const current = getValues("bale_series_id");
		if (resolution.auto) {
			if (String(resolution.auto.bale_series_id) !== current) {
				setValue("bale_series_id", String(resolution.auto.bale_series_id), { shouldValidate: false });
			}
			return;
		}
		if (current !== "" && !resolution.candidates.some((s) => String(s.bale_series_id) === current)) {
			setValue("bale_series_id", "", { shouldValidate: false });
		}
	}, [resolution, editing, getValues, setValue]);

	// 3. Tell the page which series is live so it can fetch next_bale_no.
	React.useEffect(() => {
		onSeriesChange(seriesId === "" ? null : Number(seriesId));
	}, [seriesId, onSeriesChange]);

	// 4. Pre-fill the bale no from the series counter (create mode only — an
	//    existing row keeps its own number until the operator changes it).
	React.useEffect(() => {
		if (editing || nextBaleNo == null) return;
		setValue("bale_no", String(nextBaleNo), { shouldValidate: false });
		clearErrors("bale_no");
	}, [nextBaleNo, editing, setValue, clearErrors]);

	// 5. Lift a grid row into edit mode.
	React.useEffect(() => {
		if (!editingEntry) return;
		reset({
			entry_type: editingEntry.entry_type,
			finishing_quality_id: String(editingEntry.finishing_quality_id),
			bale_series_id: String(editingEntry.bale_series_id),
			bale_no: String(editingEntry.bale_no),
			original_bale_no: editingEntry.original_bale_no == null ? "" : String(editingEntry.original_bale_no),
			trolly_id: editingEntry.trolly_id == null ? "" : String(editingEntry.trolly_id),
			gross_wt: String(editingEntry.gross_wt),
			remarks: editingEntry.remarks ?? "",
		});
	}, [editingEntry, reset]);

	// 6. After a successful save: clear weight + original, take the advanced bale
	//    no, put the cursor back on the weight. Everything else is remembered.
	const grossInputRef = React.useRef<HTMLInputElement>(null);
	// Mirrors the prop into a ref via an effect (declared BEFORE the save effect,
	// so it is current when that one runs) — refs are never written during render.
	const latestNextBaleNo = React.useRef<number | null>(null);
	React.useEffect(() => {
		latestNextBaleNo.current = nextBaleNo;
	}, [nextBaleNo]);
	const firstSavedToken = React.useRef(true);
	React.useEffect(() => {
		if (firstSavedToken.current) {
			firstSavedToken.current = false;
			return;
		}
		setValue("gross_wt", "", { shouldValidate: false });
		setValue("original_bale_no", "", { shouldValidate: false });
		if (latestNextBaleNo.current != null) {
			setValue("bale_no", String(latestNextBaleNo.current), { shouldValidate: false });
		}
		clearErrors();
		grossInputRef.current?.focus();
	}, [savedToken, setValue, clearErrors]);

	// ---------------------------------------------------------------------------
	// Submit — the only client-side gate beyond Zod is net > 0 (needs setup data).
	// ---------------------------------------------------------------------------
	const submit = handleSubmit((values) => {
		const g = Number(values.gross_wt);
		const n = computeNet(g, trollyWt, packsheetWt);
		if (n <= 0) {
			setError("gross_wt", {
				type: "manual",
				message: `Net would be ${formatKg(n)} kg — gross must exceed trolley (${formatKg(trollyWt) || 0}) + packsheet (${formatKg(packsheetWt) || 0})`,
			});
			return;
		}
		onSubmit(values);
	});

	// Keyboard-only entry: Enter commits a field and jumps to the next editable
	// one; Enter on the Gross Weight (or Remarks) saves. An Autocomplete whose
	// list is still ambiguous swallows Enter (SearchableSelect's single-match
	// guard) — that case must not advance either.
	const gridRef = React.useRef<HTMLDivElement>(null);
	const handleEnterAdvance = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "Enter") return;
		const el = event.target as HTMLElement;
		const popupOpen =
			el.getAttribute("role") === "combobox" && el.getAttribute("aria-expanded") === "true";
		if (popupOpen && !event.defaultPrevented) return;
		const field = el.getAttribute("data-bale-field");
		if (field === "gross_wt" || field === "remarks") {
			event.preventDefault();
			if (!submitting && !headerIncomplete) void submit();
			return;
		}
		const fields = Array.from(
			gridRef.current?.querySelectorAll<HTMLInputElement>("input:not([readonly]):not([disabled])") ?? []
		);
		const idx = fields.indexOf(el as HTMLInputElement);
		if (idx === -1) return;
		const next = fields[idx + 1];
		if (next) {
			event.preventDefault();
			next.focus();
			next.select();
		}
	};

	const handleCancelEdit = () => {
		const current = getValues();
		reset({
			...buildDefaultBaleFormValues(entryType),
			finishing_quality_id: current.finishing_quality_id,
			bale_series_id: current.bale_series_id,
			trolly_id: current.trolly_id,
		});
		onCancelEdit();
	};

	const seriesAuto = !editing && resolution.auto != null;
	const seriesHelper = errors.bale_series_id?.message
		?? (quality == null
			? "Pick a quality first"
			: resolution.rule === "none"
				? "No series for this quality — add one in Bale Series Master"
				: seriesAuto
					? resolution.rule === "item"
						? "Bound to this quality"
						: "Only series of this type"
					: "Remembered between bales");

	const qualityTypeLabel = quality
		? BALE_QUALITY_TYPE_LABELS[Number(quality.quality_type) as BaleQualityType] ?? String(quality.quality_type)
		: null;

	return (
		<Box
			component="form"
			onSubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
			noValidate
			sx={{ display: "flex", flexDirection: "column", gap: 2 }}
		>
			<Box
				ref={gridRef}
				onKeyDown={handleEnterAdvance}
				sx={{
					display: "grid",
					gap: 2,
					gridTemplateColumns: {
						xs: "1fr",
						sm: "repeat(2, minmax(0, 1fr))",
						md: "repeat(3, minmax(0, 1fr))",
					},
				}}
			>
				{/* 1. Quality */}
				<Box>
					<Controller
						name="finishing_quality_id"
						control={control}
						render={({ field }) => (
							<SearchableSelect<BaleQualityOption>
								variant="outlined"
								label="Quality"
								required
								options={setup.qualities}
								value={quality}
								onChange={(opt) => field.onChange(opt ? String(opt.finishing_quality_id) : "")}
								getOptionLabel={qualityLabel}
								getOptionKey={(q) => q.finishing_quality_id}
								isOptionEqualToValue={(a, b) => a.finishing_quality_id === b.finishing_quality_id}
								disabled={editing}
								clearable={false}
								error={!!errors.finishing_quality_id}
								helperText={errors.finishing_quality_id?.message}
								textFieldProps={{ onBlur: field.onBlur, autoFocus: !editing }}
							/>
						)}
					/>
					{quality ? (
						<Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.75 }}>
							<Chip size="small" variant="outlined" label={qualityTypeLabel} />
							<Chip
								size="small"
								variant="outlined"
								color={quality.std_bale_weight ? "default" : "warning"}
								label={quality.std_bale_weight ? `Std ${formatKg(quality.std_bale_weight)} kg` : "No std weight"}
							/>
							<Chip size="small" variant="outlined" label={`Packsheet ${formatKg(quality.packsheet_wt) || "0"} kg`} />
							{quality.weft_count != null ? (
								<Chip size="small" variant="outlined" label={`Weft ${formatKg(quality.weft_count)} lbs`} />
							) : null}
						</Box>
					) : null}
				</Box>

				{/* 2. Series — auto-resolved from the quality (SPEC §3) */}
				<Controller
					name="bale_series_id"
					control={control}
					render={({ field }) => (
						<SearchableSelect<BaleSeriesOption>
							variant="outlined"
							label="Series"
							required
							options={resolution.candidates}
							value={selectedSeries}
							onChange={(opt) => field.onChange(opt ? String(opt.bale_series_id) : "")}
							getOptionLabel={seriesLabel}
							getOptionKey={(s) => s.bale_series_id}
							isOptionEqualToValue={(a, b) => a.bale_series_id === b.bale_series_id}
							disabled={editing || seriesAuto || resolution.candidates.length === 0}
							clearable={false}
							error={!!errors.bale_series_id}
							helperText={seriesHelper}
							textFieldProps={{ onBlur: field.onBlur }}
						/>
					)}
				/>

				{/* 3. Bale no — pre-filled with last + 1, editable */}
				<Controller
					name="bale_no"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							type="number"
							label={isRepack ? "Bale No (new)" : "Bale No"}
							size="small"
							fullWidth
							required
							inputProps={{ step: 1, min: 1, inputMode: "numeric", "data-bale-field": "bale_no" }}
							error={!!errors.bale_no}
							helperText={
								errors.bale_no?.message
									?? (nextBaleNoLoading
										? "Fetching next number…"
										: selectedSeries && nextBaleNo != null && field.value === String(nextBaleNo)
											? `Next in ${selectedSeries.series_name}`
											: undefined)
							}
						/>
					)}
				/>

				{/* 3b. Original bale no — REPACK only (D2) */}
				{isRepack ? (
					<Controller
						name="original_bale_no"
						control={control}
						render={({ field }) => (
							<TextField
								{...field}
								type="number"
								label="Original Bale No"
								size="small"
								fullWidth
								required
								inputProps={{ step: 1, min: 1, inputMode: "numeric", "data-bale-field": "original_bale_no" }}
								error={!!errors.original_bale_no}
								helperText={errors.original_bale_no?.message ?? "The bale that was opened and re-pressed"}
							/>
						)}
					/>
				) : null}

				{/* 4. Gross weight — Enter here saves */}
				<Controller
					name="gross_wt"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							inputRef={grossInputRef}
							type="number"
							label="Gross Weight (kg)"
							size="small"
							fullWidth
							required
							inputProps={{
								step: 0.001,
								min: BALE_GROSS_MIN,
								max: BALE_GROSS_MAX,
								inputMode: "decimal",
								"data-bale-field": "gross_wt",
							}}
							error={!!errors.gross_wt}
							helperText={errors.gross_wt?.message ?? "Scale reading — Enter saves"}
						/>
					)}
				/>

				{/* 5. Trolley — optional, remembered */}
				<Controller
					name="trolly_id"
					control={control}
					render={({ field }) => (
						<SearchableSelect<BaleTrollyOption>
							variant="outlined"
							label="Trolley"
							options={setup.trollies}
							value={trolly}
							onChange={(opt) => field.onChange(opt ? String(opt.trolly_id) : "")}
							getOptionLabel={trollyLabel}
							getOptionKey={(t) => t.trolly_id}
							isOptionEqualToValue={(a, b) => a.trolly_id === b.trolly_id}
							error={!!errors.trolly_id}
							helperText={errors.trolly_id?.message ?? (trolly ? `Tare ${formatKg(trolly.trolly_weight) || 0} kg` : "Blank = scale tared (0 kg)")}
							textFieldProps={{ onBlur: field.onBlur }}
						/>
					)}
				/>

				{/* 6. Remarks */}
				<Controller
					name="remarks"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							label="Remarks"
							size="small"
							fullWidth
							inputProps={{ maxLength: 255, "data-bale-field": "remarks" }}
							error={!!errors.remarks}
							helperText={errors.remarks?.message}
						/>
					)}
				/>
			</Box>

			{/* Live preview: net = gross − trolley − packsheet; deviation vs std */}
			<Box
				sx={{
					display: "flex",
					flexWrap: "wrap",
					alignItems: "center",
					gap: 1.5,
					p: 1.5,
					border: 1,
					borderColor: netNonPositive ? "error.main" : "divider",
					borderRadius: 1,
					bgcolor: "background.paper",
				}}
			>
				<Typography variant="body2" color="text.secondary">
					Net
				</Typography>
				<Typography variant="h6" sx={{ fontWeight: 600, color: netNonPositive ? "error.main" : "text.primary" }}>
					{net != null ? `${formatKg(net)} kg` : "—"}
				</Typography>
				<Typography variant="caption" color="text.secondary">
					= {grossNum != null ? formatKg(grossNum) : "gross"} − {formatKg(trollyWt) || "0"} trolley −{" "}
					{formatKg(packsheetWt) || "0"} packsheet
				</Typography>
				{quality?.std_bale_weight ? (
					<>
						<Typography variant="body2" color="text.secondary" sx={{ ml: { sm: 2 } }}>
							vs std {formatKg(quality.std_bale_weight)} kg
						</Typography>
						{pct != null ? (
							<Chip
								size="small"
								color={severity === "warn" ? "warning" : "success"}
								label={`${formatPct(pct)} ${pct > 0 ? "heavy" : pct < 0 ? "light" : ""}`.trim()}
							/>
						) : null}
						{severity === "warn" ? (
							<Typography variant="caption" sx={{ color: "warning.main" }}>
								Beyond ±{BALE_DEVIATION_WARN_PCT} % — check the scale, saving is still allowed
							</Typography>
						) : null}
					</>
				) : null}
			</Box>

			{editing ? (
				<Typography variant="body2" color="text.secondary">
					Editing bale #{editingEntry.bale_no} ({editingEntry.series_name ?? "series"}) weighed at{" "}
					{editingEntry.tran_date}. Quality and series are fixed for an existing row.
				</Typography>
			) : null}

			{headerIncomplete ? (
				<Alert severity="info">Pick a spell above before weighing bales.</Alert>
			) : null}

			{submitError ? <Alert severity="error">{submitError}</Alert> : null}

			<Box
				sx={{
					position: { xs: "sticky", md: "static" },
					bottom: 0,
					bgcolor: "background.paper",
					py: 1,
					display: "flex",
					gap: 1,
					justifyContent: { xs: "stretch", md: "flex-end" },
				}}
			>
				{editing ? (
					<Button
						type="button"
						variant="outlined"
						startIcon={<CancelIcon size={18} />}
						onClick={handleCancelEdit}
						sx={{ minHeight: 44 }}
					>
						Cancel Edit
					</Button>
				) : null}
				<Button
					type="submit"
					variant="contained"
					startIcon={<SaveIcon size={18} />}
					disabled={submitting || headerIncomplete}
					sx={{ minHeight: 44, width: { xs: "100%", md: "auto" } }}
				>
					{submitting ? "Saving…" : editing ? "Update Bale" : isRepack ? "Save Repack" : "Save Bale"}
				</Button>
			</Box>
		</Box>
	);
}
