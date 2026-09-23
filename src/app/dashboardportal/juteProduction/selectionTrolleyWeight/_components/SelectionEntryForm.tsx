"use client";

import * as React from "react";
import { Alert, Box, Button, Grid, TextField, Typography } from "@mui/material";
import { Save as SaveIcon, X as CancelIcon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import type { SelectionRow, SelectionSetup } from "../types/selectionTypes";
import {
	buildDefaultSelectionFormValues,
	selectionEntrySchema,
	type SelectionEntryFormValues,
} from "../utils/selectionSchema";
import {
	SELECTION_GROSS_MAX,
	SELECTION_GROSS_MIN,
	computeNet,
	formatKg,
	formatTare,
	gateEntriesForQuality,
	gateEntryHasQuality,
	gateEntryLabel,
	qualityLabel,
	toNum,
	trollyLabel,
} from "../utils/selectionCalc";

export interface SelectionEntryFormProps {
	/** Dropdown data from GET /entry_setup for the header's branch + date. */
	setup: SelectionSetup;
	/** Row lifted from the list for editing, or null while creating. */
	editingEntry: SelectionRow | null;
	/**
	 * Monotonic counter the page bumps after a successful CREATE. The form then
	 * clears gross + remarks and refocuses the weight — quality, gate entry and
	 * trolley are kept for the next trolley (spec §4.1).
	 */
	savedToken: number;
	submitting: boolean;
	/** Backend `detail` of a 400 (or a network message) — shown verbatim. */
	submitError: string | null;
	/** Validated values — the page merges header context and calls the API. */
	onSubmit: (values: SelectionEntryFormValues) => void;
	onCancelEdit: () => void;
}

/**
 * One trolley = one weighing: quality → [gate entry] → trolley → gross →
 * [remarks]. Enter on any field moves to the next; Enter on the weight (or
 * remarks) saves. Owns only RHF state and hands validated values up — it never
 * calls the API. Single column on phones, three columns from `md` (D8).
 */
export default function SelectionEntryForm({
	setup,
	editingEntry,
	savedToken,
	submitting,
	submitError,
	onSubmit,
	onCancelEdit,
}: SelectionEntryFormProps) {
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
	} = useForm<SelectionEntryFormValues>({
		resolver: zodResolver(selectionEntrySchema),
		defaultValues: buildDefaultSelectionFormValues(),
		mode: "onTouched",
	});

	// Watched fields — declared before the memos that consume them (block-scoped
	// consts are not hoisted).
	const itemId = useWatch({ control, name: "item_id" });
	const juteMrId = useWatch({ control, name: "jute_mr_id" });
	const trollyId = useWatch({ control, name: "trolly_id" });
	const grossWt = useWatch({ control, name: "gross_wt" });

	const itemIdNum = itemId === "" ? null : Number(itemId);

	const qualityOptions = React.useMemo(
		() => setup.qualities.map((q) => ({ value: String(q.item_id), label: qualityLabel(q) })),
		[setup.qualities]
	);
	const gateEntriesForItem = React.useMemo(
		() => gateEntriesForQuality(setup.gate_entries, itemIdNum),
		[setup.gate_entries, itemIdNum]
	);
	const gateEntryOptions = React.useMemo(
		() => gateEntriesForItem.map((g) => ({ value: String(g.jute_mr_id), label: gateEntryLabel(g) })),
		[gateEntriesForItem]
	);
	const trollyOptions = React.useMemo(
		() => setup.trollies.map((t) => ({ value: String(t.trolly_id), label: trollyLabel(t) })),
		[setup.trollies]
	);
	const trolly = React.useMemo(
		() => setup.trollies.find((t) => String(t.trolly_id) === trollyId) ?? null,
		[setup.trollies, trollyId]
	);
	const selectedGateEntry = React.useMemo(
		() => setup.gate_entries.find((g) => String(g.jute_mr_id) === juteMrId) ?? null,
		[setup.gate_entries, juteMrId]
	);

	// ---------------------------------------------------------------------------
	// Live preview: net = gross − tare (D2). Never blocks except net <= 0.
	// ---------------------------------------------------------------------------
	const grossNum = grossWt === "" ? null : Number(grossWt);
	// While editing, the tare shown is the row's snapshot unless the operator
	// picks a different trolley (the server re-reads the master only then).
	const tareWt =
		editing && editingEntry.trolly_id === (trollyId === "" ? null : Number(trollyId))
			? toNum(editingEntry.trolly_wt)
			: toNum(trolly?.trolly_weight);
	const net = grossNum != null && Number.isFinite(grossNum) ? computeNet(grossNum, tareWt) : null;
	const netNonPositive = net != null && net <= 0;

	// ---------------------------------------------------------------------------
	// Effects — order matters (React runs them in declaration order).
	// ---------------------------------------------------------------------------

	// 1. Gate entry follows the quality (D7): auto-clear when the chosen quality
	//    is not among the gate entry's issued qualities.
	React.useEffect(() => {
		const current = getValues("jute_mr_id");
		if (current === "") return;
		const ge = setup.gate_entries.find((g) => String(g.jute_mr_id) === current) ?? null;
		if (!gateEntryHasQuality(ge, itemIdNum)) {
			setValue("jute_mr_id", "", { shouldValidate: false });
		}
	}, [itemIdNum, setup.gate_entries, getValues, setValue]);

	// 2. Lift a list row into edit mode.
	React.useEffect(() => {
		if (!editingEntry) return;
		reset({
			item_id: String(editingEntry.item_id),
			jute_mr_id: editingEntry.jute_mr_id == null ? "" : String(editingEntry.jute_mr_id),
			trolly_id: String(editingEntry.trolly_id),
			gross_wt: String(editingEntry.gross_wt),
			remarks: editingEntry.remarks ?? "",
		});
	}, [editingEntry, reset]);

	// 3. After a successful save: clear weight + remarks, cursor back on the
	//    weight. Quality, gate entry and trolley are remembered.
	const grossInputRef = React.useRef<HTMLInputElement>(null);
	const firstSavedToken = React.useRef(true);
	React.useEffect(() => {
		if (firstSavedToken.current) {
			firstSavedToken.current = false;
			return;
		}
		setValue("gross_wt", "", { shouldValidate: false });
		setValue("remarks", "", { shouldValidate: false });
		clearErrors();
		grossInputRef.current?.focus();
	}, [savedToken, setValue, clearErrors]);

	// ---------------------------------------------------------------------------
	// Submit — the only client-side gate beyond Zod is net > 0 (needs setup data).
	// ---------------------------------------------------------------------------
	const submit = handleSubmit((values) => {
		const n = computeNet(Number(values.gross_wt), tareWt);
		if (n <= 0) {
			setError("gross_wt", {
				type: "manual",
				message: `Net would be ${formatKg(n)} kg — gross must exceed the trolley tare (${formatTare(tareWt)} kg)`,
			});
			return;
		}
		onSubmit(values);
	});

	// Keyboard-only entry: Enter commits a field and jumps to the next editable
	// one; Enter on the Gross Weight (or Remarks) saves. An Autocomplete whose
	// list is still open swallows Enter to pick — that case must not advance.
	const gridRef = React.useRef<HTMLDivElement>(null);
	const handleEnterAdvance = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "Enter") return;
		const el = event.target as HTMLElement;
		const popupOpen = el.getAttribute("role") === "combobox" && el.getAttribute("aria-expanded") === "true";
		if (popupOpen && !event.defaultPrevented) return;
		const field = el.getAttribute("data-sel-field");
		if (field === "gross_wt" || field === "remarks") {
			event.preventDefault();
			if (!submitting) void submit();
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
			...buildDefaultSelectionFormValues(),
			item_id: current.item_id,
			jute_mr_id: current.jute_mr_id,
			trolly_id: current.trolly_id,
		});
		onCancelEdit();
	};

	const gateEntryHelper =
		errors.jute_mr_id?.message ??
		(itemIdNum == null
			? "Optional — pick a quality first"
			: gateEntriesForItem.length === 0
				? "No gate entry issued this quality in the window"
				: selectedGateEntry
					? `${gateEntriesForItem.length} gate entr${gateEntriesForItem.length === 1 ? "y" : "ies"} for this quality`
					: "Optional");

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
			<Grid container spacing={2} ref={gridRef} onKeyDown={handleEnterAdvance}>
				{/* 1. Quality (D4) */}
				<Grid size={{ xs: 12, md: 4 }}>
					<Controller
						name="item_id"
						control={control}
						render={({ field }) => (
							<SearchableOptionSelect<string>
								label="Quality"
								required
								fullWidth
								options={qualityOptions}
								value={field.value}
								onChange={(v) => field.onChange(v)}
								clearable={false}
								autoFocus={!editing}
								error={!!errors.item_id}
								helperText={errors.item_id?.message ?? "Issued to this branch in the last 7 days"}
								textFieldProps={{ onBlur: field.onBlur }}
							/>
						)}
					/>
				</Grid>

				{/* 2. Gate entry (D7) — optional, filtered to the quality */}
				<Grid size={{ xs: 12, md: 4 }}>
					<Controller
						name="jute_mr_id"
						control={control}
						render={({ field }) => (
							<SearchableOptionSelect<string>
								label="Gate Entry"
								fullWidth
								options={gateEntryOptions}
								value={field.value}
								onChange={(v) => field.onChange(v)}
								clearable
								disabled={itemIdNum == null}
								error={!!errors.jute_mr_id}
								helperText={gateEntryHelper}
								noOptionsText="No gate entry for this quality"
								textFieldProps={{ onBlur: field.onBlur }}
							/>
						)}
					/>
				</Grid>

				{/* 3. Trolley (D1) — required, remembered */}
				<Grid size={{ xs: 12, md: 4 }}>
					<Controller
						name="trolly_id"
						control={control}
						render={({ field }) => (
							<SearchableOptionSelect<string>
								label="Trolley"
								required
								fullWidth
								options={trollyOptions}
								value={field.value}
								onChange={(v) => field.onChange(v)}
								clearable={false}
								error={!!errors.trolly_id}
								helperText={errors.trolly_id?.message ?? "Tagged to the Selection stage"}
								textFieldProps={{ onBlur: field.onBlur }}
							/>
						)}
					/>
				</Grid>

				{/* 4. Gross weight — Enter here saves */}
				<Grid size={{ xs: 12, sm: 6, md: 3 }}>
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
									min: SELECTION_GROSS_MIN,
									max: SELECTION_GROSS_MAX,
									inputMode: "decimal",
									"data-sel-field": "gross_wt",
								}}
								error={!!errors.gross_wt}
								helperText={errors.gross_wt?.message ?? "Scale reading — Enter saves"}
							/>
						)}
					/>
				</Grid>

				{/* 5. Tare (read-only, from the trolley / the row's snapshot) */}
				<Grid size={{ xs: 12, sm: 6, md: 2 }}>
					<TextField
						label="Tare (kg)"
						size="small"
						fullWidth
						value={trolly || editing ? formatTare(tareWt) : ""}
						InputProps={{ readOnly: true }}
						InputLabelProps={{ shrink: true }}
						helperText={trolly ? `Trolley ${trolly.trolly_name}` : "Pick a trolley"}
					/>
				</Grid>

				{/* 6. Net preview — error-coloured when <= 0 (theme tokens only) */}
				<Grid size={{ xs: 12, sm: 6, md: 3 }}>
					<Box
						sx={{
							display: "flex",
							alignItems: "baseline",
							gap: 1,
							px: 1.5,
							py: 1,
							minHeight: 40,
							border: 1,
							borderColor: netNonPositive ? "error.main" : "divider",
							borderRadius: 1,
							bgcolor: "background.paper",
						}}
					>
						<Typography variant="body2" color="text.secondary">
							Net
						</Typography>
						<Typography
							variant="h6"
							sx={{ fontWeight: 600, color: netNonPositive ? "error.main" : "text.primary", lineHeight: 1.2 }}
						>
							{net != null ? `${formatKg(net)} kg` : "—"}
						</Typography>
						<Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
							gross − {formatTare(tareWt)}
						</Typography>
					</Box>
				</Grid>

				{/* 7. Remarks */}
				<Grid size={{ xs: 12, sm: 6, md: 4 }}>
					<Controller
						name="remarks"
						control={control}
						render={({ field }) => (
							<TextField
								{...field}
								label="Remarks"
								size="small"
								fullWidth
								inputProps={{ maxLength: 255, "data-sel-field": "remarks" }}
								error={!!errors.remarks}
								helperText={errors.remarks?.message}
							/>
						)}
					/>
				</Grid>
			</Grid>

			{editing ? (
				<Typography variant="body2" color="text.secondary">
					Editing trolley {editingEntry.trolly_name ?? editingEntry.trolly_id} weighed on {editingEntry.tran_date}
					{editingEntry.spell_code ? ` (spell ${editingEntry.spell_code})` : ""}. Date and spell are fixed for an
					existing row.
				</Typography>
			) : null}

			{submitError ? <Alert severity="error">{submitError}</Alert> : null}

			<Box
				sx={{
					position: { xs: "sticky", md: "static" },
					bottom: 0,
					zIndex: 1,
					bgcolor: "background.paper",
					py: 1,
					display: "flex",
					flexWrap: "wrap",
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
						sx={{ minHeight: 44, width: { xs: "100%", md: "auto" } }}
					>
						Cancel
					</Button>
				) : null}
				<Button
					type="submit"
					variant="contained"
					startIcon={<SaveIcon size={18} />}
					disabled={submitting}
					sx={{ minHeight: 44, width: { xs: "100%", md: "auto" } }}
				>
					{submitting ? "Saving…" : editing ? "Update" : "Save"}
				</Button>
			</Box>
		</Box>
	);
}
