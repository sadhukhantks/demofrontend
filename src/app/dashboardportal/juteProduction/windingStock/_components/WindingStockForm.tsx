"use client";

import * as React from "react";
import { Alert, Autocomplete, Box, Button, TextField, Typography } from "@mui/material";
import { Save as SaveIcon, X as CancelIcon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { WindingStockRow, WindingStockSetup } from "@/utils/windingStockService";
import {
	buildDefaultFormValues,
	windingStockSchema,
	MAX_SAMPLES,
	MAX_WT,
	type WindingStockFormValues,
} from "../utils/stockSchema";
import { BUCKET_LABELS } from "../utils/stockCalc";

/** An option row reduced to what a picker needs: an id (numeric or, for the
 * bucket field, its string code) and its label. */
type PickerOption = { id: string | number; label: string };

/**
 * A searchable (type-to-filter) replacement for `TextField select`, bound to a
 * React Hook Form field that holds the id as a STRING like every other select
 * on this page.
 *
 * `allowClear = false` swallows the Autocomplete clear button instead of hiding
 * it: the edit endpoint reads null as "leave unchanged", so clearing an
 * already-attributed item/area would silently no-op rather than un-set it.
 *
 * `renderOption` sets an explicit key because tenants do carry duplicate
 * display names (yarn items in particular) — without it React keys collide on
 * the label.
 */
function PickerField({
	value,
	onChange,
	onBlur,
	options,
	label,
	disabled,
	required,
	error,
	helperText,
	allowClear = true,
}: {
	value: string;
	onChange: (next: string) => void;
	onBlur?: () => void;
	options: PickerOption[];
	label: string;
	disabled?: boolean;
	required?: boolean;
	error?: boolean;
	helperText?: React.ReactNode;
	allowClear?: boolean;
}) {
	const selected = options.find((o) => String(o.id) === value) ?? null;
	return (
		<Autocomplete
			options={options}
			value={selected}
			onChange={(_, next) => {
				if (!next && !allowClear) return;
				onChange(next ? String(next.id) : "");
			}}
			onBlur={onBlur}
			disabled={disabled}
			getOptionLabel={(o) => o.label}
			isOptionEqualToValue={(opt, val) => opt.id === val.id}
			renderOption={(props, o) => (
				<li {...props} key={o.id}>
					{o.label}
				</li>
			)}
			size="small"
			fullWidth
			renderInput={(params) => (
				<TextField
					{...params}
					label={label}
					required={required}
					error={error}
					helperText={helperText}
				/>
			)}
		/>
	);
}

export interface WindingStockFormProps {
	/** Dropdown data from GET /windingStock/setup. */
	setup: WindingStockSetup;
	/** Date the day grid is showing — new lines default to it. */
	tranDate: string;
	/** Row lifted from the grid for editing, or null while creating. */
	editingEntry: WindingStockRow | null;
	/**
	 * Monotonic counter the page bumps after a successful save or when leaving
	 * edit mode. Any change clears the form back to blank (keeping the bucket so
	 * the operator can book the next line of the same kind without re-picking it).
	 */
	formResetToken: number;
	/** True while the parent's create/edit request is in flight. */
	submitting: boolean;
	/** Server-side error surfaced by the parent, or null. */
	submitError: string | null;
	/** Validated values — the parent builds the payload and calls the API. */
	onSubmit: (values: WindingStockFormValues) => void;
	/** Leave edit mode and return to a blank create form. */
	onCancelEdit: () => void;
	/**
	 * Looks up the last-saved kg-per-piece for (item_id, package_label) — the
	 * entire weight-per-sample "master". The page owns the network call (it
	 * already has co_id/branch_id in scope); this form only decides WHEN to ask.
	 * Returns null when there is no earlier line for that key.
	 */
	fetchWtDefault: (itemId: number | null, packageLabel: string) => Promise<number | null>;
}

/**
 * Winding Stock count form. Purely presentational with respect to data: it
 * owns only React Hook Form state, receives every option list via props and
 * hands validated values back to the page — it never calls the mutation API
 * itself (the weight-prefill lookup excepted, and even that goes through a
 * page-owned callback).
 */
export default function WindingStockForm({
	setup,
	tranDate,
	editingEntry,
	formResetToken,
	submitting,
	submitError,
	onSubmit,
	onCancelEdit,
	fetchWtDefault,
}: WindingStockFormProps) {
	const editing = editingEntry != null;

	const {
		control,
		handleSubmit,
		reset,
		setValue,
		getValues,
		formState: { errors },
	} = useForm<WindingStockFormValues>({
		resolver: zodResolver(windingStockSchema),
		defaultValues: buildDefaultFormValues(tranDate),
		mode: "onTouched",
	});

	const bucketOptions = React.useMemo<PickerOption[]>(
		() => setup.buckets.map((b) => ({ id: b, label: BUCKET_LABELS[b] ?? b })),
		[setup.buckets]
	);

	const itemOptions = React.useMemo<PickerOption[]>(
		() =>
			setup.yarn_items.map((i) => ({
				id: i.item_id,
				label: [i.item_name, i.quality_name, i.yarn_count != null ? `${i.yarn_count} lbs` : null]
					.filter((part): part is string => !!part)
					.join(" — "),
			})),
		[setup.yarn_items]
	);

	const areaOptions = React.useMemo<PickerOption[]>(
		() => setup.areas.map((a) => ({ id: a.wastage_area_id, label: a.area_name })),
		[setup.areas]
	);

	// The edit endpoint reads a null item_id / wastage_area_id as "leave
	// unchanged", not "clear" — so an already-attributed one cannot be un-set
	// through edit. Offer the blank option only when it is truthful: while
	// creating, or while editing a row that has none yet.
	const allowClearItem = !editing || editingEntry.item_id == null;
	const allowClearArea = !editing || editingEntry.wastage_area_id == null;

	// Watched so the weight-prefill effect below can react to a bucket/item
	// change — declared before the effects that consume them.
	const bucket = useWatch({ control, name: "bucket" });
	const itemId = useWatch({ control, name: "item_id" });

	// Ask for the last-saved kg/sample once bucket + item + package are all
	// filled and the operator hasn't typed a weight yet. Re-checks the field
	// right before writing so a value typed while the lookup was in flight is
	// never clobbered.
	const maybePrefillWeight = React.useCallback(async () => {
		const values = getValues();
		if (!values.bucket || !values.item_id || !values.package_label.trim()) return;
		if (values.wt_per_sample !== "") return;
		const wt = await fetchWtDefault(Number(values.item_id), values.package_label.trim());
		if (wt == null) return;
		if (getValues("wt_per_sample") !== "") return;
		setValue("wt_per_sample", String(wt), { shouldValidate: true });
	}, [fetchWtDefault, getValues, setValue]);

	React.useEffect(() => {
		void maybePrefillWeight();
	}, [bucket, itemId, maybePrefillWeight]);

	// The three effects below MUST stay in this order — React runs effects in
	// declaration order, and each later one refines the state the earlier one set.

	// 1. Lift a grid row into edit mode.
	React.useEffect(() => {
		if (!editingEntry) return;
		reset({
			tran_date: editingEntry.tran_date,
			bucket: editingEntry.bucket,
			item_id: editingEntry.item_id == null ? "" : String(editingEntry.item_id),
			package_label: editingEntry.package_label,
			wastage_area_id:
				editingEntry.wastage_area_id == null ? "" : String(editingEntry.wastage_area_id),
			no_of_samples: String(editingEntry.no_of_samples),
			wt_per_sample: String(editingEntry.wt_per_sample),
			remarks: editingEntry.remarks ?? "",
		});
	}, [editingEntry, reset]);

	// 2. Clear the form after a save / on leaving edit mode. The bucket is
	//    carried over so a run of same-bucket lines is quick to book.
	const firstResetToken = React.useRef(true);
	React.useEffect(() => {
		if (firstResetToken.current) {
			firstResetToken.current = false;
			return;
		}
		const current = getValues();
		reset({ ...buildDefaultFormValues(current.tran_date), bucket: current.bucket });
	}, [formResetToken, getValues, reset]);

	// 3. Keep the form's date on the date the grid is showing (create mode only —
	//    an existing row's date is immutable).
	React.useEffect(() => {
		if (editingEntry) return;
		setValue("tran_date", tranDate, { shouldValidate: false });
	}, [tranDate, editingEntry, setValue]);

	return (
		<Box
			component="form"
			onSubmit={handleSubmit(onSubmit)}
			noValidate
			sx={{ display: "flex", flexDirection: "column", gap: 2 }}
		>
			<Box
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
				<Controller
					name="tran_date"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							type="date"
							label="Date"
							size="small"
							fullWidth
							disabled={editing}
							InputLabelProps={{ shrink: true }}
							error={!!errors.tran_date}
							helperText={errors.tran_date?.message}
						/>
					)}
				/>

				<Controller
					name="bucket"
					control={control}
					render={({ field }) => (
						<PickerField
							value={field.value}
							onChange={field.onChange}
							onBlur={field.onBlur}
							options={bucketOptions}
							label="Bucket"
							required
							allowClear={false}
							error={!!errors.bucket}
							helperText={errors.bucket?.message}
						/>
					)}
				/>

				<Controller
					name="item_id"
					control={control}
					render={({ field }) => (
						<PickerField
							value={field.value}
							onChange={field.onChange}
							onBlur={field.onBlur}
							options={itemOptions}
							label="Yarn Item"
							allowClear={allowClearItem}
							error={!!errors.item_id}
							helperText={
								errors.item_id?.message ??
								(allowClearItem
									? "Optional — blank for lines with no yarn-master row (e.g. beam on floor)"
									: "Cannot be cleared on edit — delete and re-add for a blank item")
							}
						/>
					)}
				/>

				<Controller
					name="package_label"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							label="Package / Description"
							size="small"
							fullWidth
							required
							inputProps={{ maxLength: 60 }}
							onBlur={() => {
								field.onBlur();
								void maybePrefillWeight();
							}}
							error={!!errors.package_label}
							helperText={errors.package_label?.message}
						/>
					)}
				/>

				<Controller
					name="wastage_area_id"
					control={control}
					render={({ field }) => (
						<PickerField
							value={field.value}
							onChange={field.onChange}
							onBlur={field.onBlur}
							options={areaOptions}
							label="Place / Area"
							allowClear={allowClearArea}
							error={!!errors.wastage_area_id}
							helperText={
								errors.wastage_area_id?.message ??
								(allowClearArea
									? "Optional"
									: "Cannot be cleared on edit — delete and re-add for a blank area")
							}
						/>
					)}
				/>

				<Controller
					name="no_of_samples"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							type="number"
							label="Samples"
							size="small"
							fullWidth
							required
							inputProps={{ step: 1, min: 0, max: MAX_SAMPLES }}
							error={!!errors.no_of_samples}
							helperText={errors.no_of_samples?.message ?? "Number of pieces counted"}
						/>
					)}
				/>

				<Controller
					name="wt_per_sample"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							type="number"
							label="Kg / Sample"
							size="small"
							fullWidth
							required
							inputProps={{ step: 0.001, min: 0, max: MAX_WT }}
							error={!!errors.wt_per_sample}
							helperText={
								errors.wt_per_sample?.message ??
								`Greater than 0, up to ${MAX_WT} kg — auto-fills from the last line with this item + package`
							}
						/>
					)}
				/>

				<Controller
					name="remarks"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							label="Remarks"
							size="small"
							fullWidth
							inputProps={{ maxLength: 255 }}
							error={!!errors.remarks}
							helperText={errors.remarks?.message}
						/>
					)}
				/>
			</Box>

			{editing ? (
				<Typography variant="body2" color="text.secondary">
					Editing line #{editingEntry.winding_stock_id}. Date is fixed for an existing line —
					delete and re-enter to move it.
				</Typography>
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
						onClick={onCancelEdit}
						sx={{ minHeight: 44 }}
					>
						Cancel Edit
					</Button>
				) : null}
				<Button
					type="submit"
					variant="contained"
					startIcon={<SaveIcon size={18} />}
					disabled={submitting}
					sx={{ minHeight: 44, width: { xs: "100%", md: "auto" } }}
				>
					{submitting ? "Saving…" : editing ? "Update" : "Save Line"}
				</Button>
			</Box>
		</Box>
	);
}
