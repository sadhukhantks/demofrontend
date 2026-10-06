"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	TextField,
} from "@mui/material";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type { WasteReportMapRow, WasteReportMapSetup } from "@/utils/wasteReportMapService";
import {
	COL_LABEL_MAX,
	NEW_GROUP_VALUE,
	blankFormValues,
	buildWasteReportMapSchema,
	groupDefaults,
	normalizeGroupCode,
	rowToFormValues,
	type WasteReportMapFormValues,
} from "../utils/wasteReportMapSchema";

/** A picker option: the form field stores `value` (an id or code as a string). */
type Option = { value: string; label: string };

const ANY_DEPARTMENT: Option = { value: "", label: "Any department" };

export interface WasteReportMapDialogProps {
	/** Pickers from GET /setup. */
	setup: WasteReportMapSetup;
	/** Row being edited, or null when adding. */
	editingRow: WasteReportMapRow | null;
	/** True while the page's create / update request is in flight. */
	saving: boolean;
	/** Backend error from the last save, or null. */
	submitError: string | null;
	/** Validated values; the page builds the payload and calls the service. */
	onSubmit: (values: WasteReportMapFormValues) => void;
	onClose: () => void;
}

/**
 * One option-list select bound to a string form field. Wraps SearchableSelect
 * (the only permitted dropdown) so each field maps option <-> string once.
 */
function OptionSelect({
	label,
	options,
	value,
	onChange,
	required,
	error,
	helperText,
	disabled,
	clearable = true,
}: {
	label: string;
	options: readonly Option[];
	value: string;
	onChange: (next: string) => void;
	required?: boolean;
	error?: boolean;
	helperText?: React.ReactNode;
	disabled?: boolean;
	clearable?: boolean;
}) {
	return (
		<SearchableSelect<Option>
			variant="outlined"
			size="small"
			label={label}
			options={options}
			value={options.find((o) => o.value === value) ?? null}
			onChange={(opt) => onChange(opt?.value ?? "")}
			getOptionLabel={(o) => o.label}
			getOptionKey={(o) => o.value || "__blank__"}
			isOptionEqualToValue={(o, v) => o.value === v.value}
			required={required}
			error={error}
			helperText={helperText}
			disabled={disabled}
			clearable={clearable}
		/>
	);
}

/**
 * Add / edit dialog for one Wastage Report mapping row. Mounted fresh by the
 * page each time it opens, so the form initialises from props with no reset
 * effect. Presentational with respect to data: it never calls the API.
 *
 * Group-level fields (name, daily / monthly % base, display order) are stored
 * on every row of a group and the backend propagates them, so choosing an
 * existing group prefills them from the group, and the note below says that
 * changing them affects the whole group.
 */
export default function WasteReportMapDialog({
	setup,
	editingRow,
	saving,
	submitError,
	onSubmit,
	onClose,
}: WasteReportMapDialogProps) {
	const schema = React.useMemo(
		() => buildWasteReportMapSchema(setup.groups.map((g) => g.group_code)),
		[setup.groups],
	);

	const {
		control,
		handleSubmit,
		setValue,
		formState: { errors },
	} = useForm<WasteReportMapFormValues>({
		resolver: zodResolver(schema),
		defaultValues: editingRow ? rowToFormValues(editingRow) : blankFormValues(),
		mode: "onTouched",
	});

	const groupChoice = useWatch({ control, name: "group_choice" });
	const isNewGroup = groupChoice === NEW_GROUP_VALUE;
	const chosenGroup = setup.groups.find((g) => g.group_code === groupChoice) ?? null;

	const groupOptions = React.useMemo<Option[]>(
		() => [
			{ value: NEW_GROUP_VALUE, label: "New group…" },
			...setup.groups.map((g) => ({ value: g.group_code, label: `${g.group_name} (${g.group_code})` })),
		],
		[setup.groups],
	);

	const denomOptions = React.useMemo<Option[]>(
		() => setup.denominators.map((d) => ({ value: d.code, label: d.label })),
		[setup.denominators],
	);

	// The picker lists active items; an edited row whose item has since been
	// retired keeps its own item as an option so the field never shows blank.
	const itemOptions = React.useMemo<Option[]>(() => {
		const opts = setup.waste_items.map((i) => ({
			value: String(i.item_id),
			label: i.item_code ? `${i.item_name} (${i.item_code})` : i.item_name,
		}));
		if (editingRow && !opts.some((o) => o.value === String(editingRow.item_id))) {
			opts.unshift({
				value: String(editingRow.item_id),
				label: editingRow.item_name ?? `Item ${editingRow.item_id}`,
			});
		}
		return opts;
	}, [setup.waste_items, editingRow]);

	// Department names repeat across branches, so the branch is part of the label.
	const deptOptions = React.useMemo<Option[]>(() => {
		const opts = setup.departments.map((d) => ({
			value: String(d.dept_id),
			label: d.branch_name ? `${d.dept_desc} — ${d.branch_name}` : d.dept_desc,
		}));
		if (editingRow?.dept_id != null && !opts.some((o) => o.value === String(editingRow.dept_id))) {
			opts.unshift({
				value: String(editingRow.dept_id),
				label: editingRow.dept_desc ?? `Department ${editingRow.dept_id}`,
			});
		}
		return [ANY_DEPARTMENT, ...opts];
	}, [setup.departments, editingRow]);

	const handleGroupChange = (next: string) => {
		setValue("group_choice", next, { shouldValidate: true, shouldTouch: true });
		setValue("group_code", "");
		const defaults = groupDefaults(next, setup.groups);
		setValue("group_name", defaults.group_name, { shouldValidate: next !== "" });
		setValue("day_denom", defaults.day_denom, { shouldValidate: next !== "" });
		setValue("total_denom", defaults.total_denom, { shouldValidate: next !== "" });
		setValue("display_order", defaults.display_order, { shouldValidate: next !== "" });
	};

	return (
		<Dialog open onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
			<DialogTitle>
				{editingRow
					? `Edit mapping — ${editingRow.item_name ?? editingRow.item_id}`
					: "New Wastage Report mapping"}
			</DialogTitle>
			<form
				noValidate
				onSubmit={(e) => {
					void handleSubmit(onSubmit)(e);
				}}
			>
				<DialogContent>
					<Box sx={{ display: "grid", gap: 2, mt: 1 }}>
						{submitError ? <Alert severity="error">{submitError}</Alert> : null}

						<Controller
							control={control}
							name="group_choice"
							render={({ field }) => (
								<OptionSelect
									label="Group"
									options={groupOptions}
									value={field.value}
									onChange={handleGroupChange}
									required
									error={!!errors.group_choice}
									helperText={
										errors.group_choice?.message ??
										(chosenGroup
											? `${chosenGroup.item_count} item${chosenGroup.item_count === 1 ? "" : "s"} in this group`
											: undefined)
									}
								/>
							)}
						/>

						{groupChoice !== "" ? (
							<Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: isNewGroup ? "1fr 2fr" : "1fr" } }}>
								{isNewGroup ? (
									<Controller
										control={control}
										name="group_code"
										render={({ field }) => (
											<TextField
												{...field}
												onChange={(e) => field.onChange(normalizeGroupCode(e.target.value).slice(0, 40))}
												label="Group code"
												size="small"
												required
												fullWidth
												error={!!errors.group_code}
												helperText={errors.group_code?.message ?? "e.g. LINE_WASTE"}
											/>
										)}
									/>
								) : null}
								<Controller
									control={control}
									name="group_name"
									render={({ field }) => (
										<TextField
											{...field}
											label="Group name"
											size="small"
											required
											fullWidth
											error={!!errors.group_name}
											helperText={errors.group_name?.message ?? "Shown as the band heading in the report"}
										/>
									)}
								/>
							</Box>
						) : null}

						<Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
							<Controller
								control={control}
								name="day_denom"
								render={({ field }) => (
									<OptionSelect
										label="Daily % on"
										options={denomOptions}
										value={field.value}
										onChange={(v) => field.onChange(v)}
										required
										error={!!errors.day_denom}
										helperText={errors.day_denom?.message}
									/>
								)}
							/>
							<Controller
								control={control}
								name="total_denom"
								render={({ field }) => (
									<OptionSelect
										label="Monthly % on"
										options={denomOptions}
										value={field.value}
										onChange={(v) => field.onChange(v)}
										required
										error={!!errors.total_denom}
										helperText={errors.total_denom?.message}
									/>
								)}
							/>
						</Box>

						<Controller
							control={control}
							name="display_order"
							render={({ field }) => (
								<TextField
									{...field}
									label="Display order"
									type="number"
									size="small"
									required
									fullWidth
									inputProps={{ min: 0, step: 1 }}
									error={!!errors.display_order}
									helperText={errors.display_order?.message ?? "Groups appear in the report in this order"}
								/>
							)}
						/>

						<Alert severity="info">
							Group name, daily / monthly % base and display order belong to the whole group —
							changing them here updates every item in that group.
						</Alert>

						<Controller
							control={control}
							name="item_id"
							render={({ field }) => (
								<OptionSelect
									label="Waste item"
									options={itemOptions}
									value={field.value}
									onChange={(v) => field.onChange(v)}
									required
									error={!!errors.item_id}
									helperText={errors.item_id?.message}
								/>
							)}
						/>

						<Controller
							control={control}
							name="dept_id"
							render={({ field }) => (
								<OptionSelect
									label="Department"
									options={deptOptions}
									value={field.value}
									onChange={(v) => field.onChange(v)}
									helperText="Any department = the item maps to this group from every department; a department row overrides it"
								/>
							)}
						/>

						<Controller
							control={control}
							name="col_label"
							render={({ field }) => (
								<TextField
									{...field}
									label="Column label"
									size="small"
									fullWidth
									inputProps={{ maxLength: COL_LABEL_MAX }}
									error={!!errors.col_label}
									helperText={
										errors.col_label?.message ??
										"Optional — column heading in the report (defaults to item — department)"
									}
								/>
							)}
						/>
					</Box>
				</DialogContent>
				<DialogActions>
					<Button onClick={onClose} disabled={saving}>
						Cancel
					</Button>
					<Button type="submit" variant="contained" disabled={saving}>
						{saving ? "Saving…" : "Save"}
					</Button>
				</DialogActions>
			</form>
		</Dialog>
	);
}
