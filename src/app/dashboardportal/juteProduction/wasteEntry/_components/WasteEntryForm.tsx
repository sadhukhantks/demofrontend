"use client";

import * as React from "react";
import { Alert, Autocomplete, Box, Button, TextField, Typography } from "@mui/material";
import { Save as SaveIcon, X as CancelIcon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { WasteEntryRow, WasteSetup } from "../types/wasteTypes";
import {
	buildDefaultFormValues,
	wasteEntrySchema,
	type WasteEntryFormValues,
} from "../utils/wasteSchema";
import { MAX_WASTE_QTY, WASTE_QTY_SCALE, todayISO } from "../utils/wasteCalc";

/** An option row reduced to what a picker needs: a numeric id and its label. */
type PickerOption = { id: number; label: string };

/**
 * A searchable (type-to-filter) replacement for `TextField select`, bound to a
 * React Hook Form field that holds the id as a STRING like every other select
 * on this page.
 *
 * `allowClear = false` swallows the Autocomplete clear button instead of hiding
 * it: the edit endpoint reads null as "leave unchanged", so clearing an
 * already-attributed machine would silently no-op rather than un-set it.
 *
 * `renderOption` sets an explicit key because tenants do carry duplicate
 * display names (dev3 has two 'SPREADER 2' machines) — without it React keys
 * collide on the label.
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

export interface WasteEntryFormProps {
	/** Dropdown data from GET /entry_create_setup. */
	setup: WasteSetup;
	/** Date the day grid is showing — new entries default to it. */
	tranDate: string;
	/** Row lifted from the grid for editing, or null while creating. */
	editingEntry: WasteEntryRow | null;
	/**
	 * Monotonic counter the page bumps after a successful save or when leaving
	 * edit mode. Any change clears the form back to blank (keeping date + spell
	 * so the operator can book the next waste row without re-picking them).
	 */
	formResetToken: number;
	/** True while the parent's create/edit request is in flight. */
	submitting: boolean;
	/** Server-side error surfaced by the parent, or null. */
	submitError: string | null;
	/** Validated values — the parent builds the payload and calls the API. */
	onSubmit: (values: WasteEntryFormValues) => void;
	/** Leave edit mode and return to a blank create form. */
	onCancelEdit: () => void;
}

/**
 * Waste Entry form (SPEC §3.1). Purely presentational with respect to data:
 * it owns only React Hook Form state, receives every option list via props and
 * hands validated values back to the page — it never calls the API itself.
 */
export default function WasteEntryForm({
	setup,
	tranDate,
	editingEntry,
	formResetToken,
	submitting,
	submitError,
	onSubmit,
	onCancelEdit,
}: WasteEntryFormProps) {
	const editing = editingEntry != null;

	const {
		control,
		handleSubmit,
		reset,
		setValue,
		getValues,
		formState: { errors },
	} = useForm<WasteEntryFormValues>({
		resolver: zodResolver(wasteEntrySchema),
		defaultValues: buildDefaultFormValues(tranDate),
		mode: "onTouched",
	});

	// Department drives BOTH the wastage-area and the machine list (SPEC §3.1) —
	// declared before the memos that consume it, since block-scoped consts are
	// not hoisted.
	const selectedDeptId = useWatch({ control, name: "dept_id" });

	const areasForDept = React.useMemo<PickerOption[]>(
		() =>
			selectedDeptId === ""
				? []
				: setup.wastage_areas
						.filter((a) => a.dept_id === Number(selectedDeptId))
						.map((a) => ({ id: a.wastage_area_id, label: a.area_name })),
		[selectedDeptId, setup.wastage_areas]
	);

	const machinesForDept = React.useMemo<PickerOption[]>(
		() =>
			selectedDeptId === ""
				? []
				: setup.machines
						.filter((m) => m.dept_id === Number(selectedDeptId))
						.map((m) => ({ id: m.machine_id, label: m.machine_name })),
		[selectedDeptId, setup.machines]
	);

	const spellOptions = React.useMemo<PickerOption[]>(
		() =>
			setup.spells.map((s) => ({
				id: s.spell_id,
				label: s.spell_code ? `${s.spell_code} — ${s.spell_name}` : s.spell_name,
			})),
		[setup.spells]
	);

	const deptOptions = React.useMemo<PickerOption[]>(
		() => setup.departments.map((d) => ({ id: d.dept_id, label: d.dept_desc })),
		[setup.departments]
	);

	const itemOptions = React.useMemo<PickerOption[]>(
		() => setup.waste_items.map((i) => ({ id: i.item_id, label: i.item_name })),
		[setup.waste_items]
	);

	// SPEC §6.1: on edit a null field means "leave unchanged", NOT "clear", so an
	// already-attributed machine cannot be un-set through the edit endpoint —
	// picking the blank option would silently no-op. Offer it only when it is
	// truthful: while creating, or while editing a row that has no machine yet
	// (where "blank" genuinely leaves it department-level). To move an attributed
	// row back to department level, delete and re-add it.
	const allowBlankMachine = !editing || editingEntry.machine_id == null;

	// The three effects below MUST stay in this order — React runs effects in
	// declaration order, and each later one refines the state the earlier one set.

	// 1. Lift a grid row into edit mode.
	React.useEffect(() => {
		if (!editingEntry) return;
		reset({
			tran_date: editingEntry.tran_date,
			spell_id: String(editingEntry.spell_id),
			dept_id: String(editingEntry.dept_id),
			// Rows booked before the wastage-area master existed come back null —
			// the field lands empty and the operator must pick one to save.
			wastage_area_id:
				editingEntry.wastage_area_id == null ? "" : String(editingEntry.wastage_area_id),
			machine_id: editingEntry.machine_id == null ? "" : String(editingEntry.machine_id),
			item_id: String(editingEntry.item_id),
			waste_qty: String(editingEntry.waste_qty),
			remarks: editingEntry.remarks ?? "",
		});
	}, [editingEntry, reset]);

	// 2. Clear the form after a save / on leaving edit mode. Date and spell are
	//    carried over so sequential waste rows for the same shift are quick to book.
	const firstResetToken = React.useRef(true);
	React.useEffect(() => {
		if (firstResetToken.current) {
			firstResetToken.current = false;
			return;
		}
		const current = getValues();
		reset({ ...buildDefaultFormValues(current.tran_date), spell_id: current.spell_id });
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
							inputProps={{ max: todayISO() }}
							InputLabelProps={{ shrink: true }}
							error={!!errors.tran_date}
							helperText={errors.tran_date?.message}
						/>
					)}
				/>

				<Controller
					name="spell_id"
					control={control}
					render={({ field }) => (
						<PickerField
							value={field.value}
							onChange={field.onChange}
							onBlur={field.onBlur}
							options={spellOptions}
							label="Spell"
							required
							error={!!errors.spell_id}
							helperText={errors.spell_id?.message}
						/>
					)}
				/>

				<Controller
					name="dept_id"
					control={control}
					render={({ field }) => (
						<PickerField
							value={field.value}
							onChange={(next) => {
								field.onChange(next);
								// Cascade reset (SPEC §3.1): an area or machine from the old
								// department can never be valid for the new one.
								setValue("wastage_area_id", "", { shouldValidate: false });
								setValue("machine_id", "", { shouldValidate: false });
							}}
							onBlur={field.onBlur}
							options={deptOptions}
							label="Department"
							required
							disabled={editing}
							error={!!errors.dept_id}
							helperText={errors.dept_id?.message}
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
							options={areasForDept}
							label="Wastage Area"
							required
							disabled={selectedDeptId === ""}
							error={!!errors.wastage_area_id}
							helperText={
								errors.wastage_area_id?.message ??
								(selectedDeptId !== "" && areasForDept.length === 0
									? "No areas defined for this department — add them in Wastage Area Master"
									: undefined)
							}
						/>
					)}
				/>

				<Controller
					name="machine_id"
					control={control}
					render={({ field }) => (
						<PickerField
							value={field.value}
							onChange={field.onChange}
							onBlur={field.onBlur}
							options={machinesForDept}
							label="Machine"
							disabled={selectedDeptId === ""}
							allowClear={allowBlankMachine}
							error={!!errors.machine_id}
							helperText={
								errors.machine_id?.message ??
								(allowBlankMachine
									? "Optional — blank books waste to the department"
									: "Cannot be cleared on edit — delete and re-add for department level")
							}
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
							label="Waste Type"
							required
							error={!!errors.item_id}
							helperText={errors.item_id?.message}
						/>
					)}
				/>

				<Controller
					name="waste_qty"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							type="number"
							label="Quantity (kg)"
							size="small"
							fullWidth
							inputProps={{ step: 0.001, min: 0, max: MAX_WASTE_QTY }}
							error={!!errors.waste_qty}
							helperText={
								errors.waste_qty?.message ??
								`Greater than 0, up to ${MAX_WASTE_QTY} (${WASTE_QTY_SCALE} decimals)`
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
					Editing entry #{editingEntry.waste_entry_id}. Date and department are fixed for an
					existing row — delete and re-enter to move it.
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
					{submitting ? "Saving…" : editing ? "Update" : "Save Entry"}
				</Button>
			</Box>
		</Box>
	);
}
