"use client";

import * as React from "react";
import { Alert, Box, Button, Chip, Divider, TextField, Typography } from "@mui/material";
import { Save as SaveIcon, X as CancelIcon } from "lucide-react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { FORM_GRID_SX, STICKY_ACTIONS_SX } from "@/components/ui/responsiveEntry";
import type { MechBreakdownSetup, MechReason } from "@/utils/juteMechanicalService";
import SpareLinesEditor from "./SpareLinesEditor";
import {
	breakdownFormSchema,
	buildDefaultFormValues,
	buildFormValuesFromEntry,
	createBlankSpareLine,
	type BreakdownFormValues,
	type EditingBreakdown,
	type SpareItemOption,
	type UomOption,
} from "../types/breakdownTypes";
import {
	BREAKDOWN_STATUS,
	deriveStatus,
	durationMinutes,
	formatDateTimeDisplay,
	formatMinutes,
	nowDateTimeLocal,
	responseMinutes,
	statusFallbackLabel,
	toNumberOrNull,
} from "../utils/breakdownCalc";

export interface BreakdownEntryFormProps {
	/** Dropdowns from GET /entry_create_setup. */
	setup: MechBreakdownSetup;
	/** Reasons valid for the currently-picked machine (its type + all globals). */
	reasons: ReadonlyArray<MechReason>;
	reasonsLoading: boolean;
	reasonsError: string | null;
	spareItems: ReadonlyArray<SpareItemOption>;
	uoms: ReadonlyArray<UomOption>;
	itemsError: string | null;
	/** Incident lifted from the grid for editing, or null while creating. */
	editingEntry: EditingBreakdown | null;
	/** Bumped by the page after a save / on leaving edit mode; clears the form. */
	formResetToken: number;
	submitting: boolean;
	submitError: string | null;
	/** Validated values — the page builds the payload and calls the service. */
	onSubmit: (values: BreakdownFormValues) => void;
	onCancelEdit: () => void;
	/**
	 * The picked machine changed. The page refetches the reason list, because
	 * reason codes are scoped to the machine's type plus the global codes.
	 */
	onMachineChange: (machineId: number | null) => void;
}

/**
 * Breakdown entry form — the highest-traffic screen in the module.
 *
 * Optimised for speed of entry, not completeness: only machine, stop time and
 * reason have to be keyed to report a stop. Everything else (attendance,
 * restart, component, downtime type, root cause, spares) is filled in later by
 * the attending crew editing the incident; downtime type starts as BREAKDOWN.
 *
 * Presentational with respect to data: it owns React Hook Form state only,
 * receives every option list via props and never calls the API itself.
 */
export default function BreakdownEntryForm({
	setup,
	reasons,
	reasonsLoading,
	reasonsError,
	spareItems,
	uoms,
	itemsError,
	editingEntry,
	formResetToken,
	submitting,
	submitError,
	onSubmit,
	onCancelEdit,
	onMachineChange,
}: BreakdownEntryFormProps) {
	const editing = editingEntry != null;

	const {
		control,
		handleSubmit,
		reset,
		setValue,
		formState: { errors },
	} = useForm<BreakdownFormValues>({
		resolver: zodResolver(breakdownFormSchema),
		defaultValues: buildDefaultFormValues(nowDateTimeLocal()),
		mode: "onTouched",
	});

	const { fields, append, remove } = useFieldArray({ control, name: "spares" });

	// Watched values first — block-scoped consts are not hoisted, and every memo
	// below depends on them.
	const stopDateTime = useWatch({ control, name: "stop_datetime" });
	const attendedDateTime = useWatch({ control, name: "attended_datetime" });
	const restartDateTime = useWatch({ control, name: "restart_datetime" });
	const durationValue = useWatch({ control, name: "duration_min" });
	const machineIdValue = useWatch({ control, name: "machine_id" });

	// ---------------------------------------------------------------- options
	const machineOptions = React.useMemo(
		() =>
			setup.machines.map((machine) => ({
				value: machine.machine_id,
				label: machine.mech_code
					? `${machine.mech_code} — ${machine.machine_name}`
					: machine.machine_name,
			})),
		[setup.machines]
	);

	const spellOptions = React.useMemo(
		() =>
			setup.spells.map((spell) => ({
				value: spell.spell_id,
				label: spell.spell_name ? `${spell.spell_code} — ${spell.spell_name}` : spell.spell_code,
			})),
		[setup.spells]
	);

	const reasonOptions = React.useMemo(
		() =>
			reasons.map((reason) => ({
				value: reason.reason_id,
				label: `${reason.reason_code} — ${reason.reason_desc}`,
			})),
		[reasons]
	);

	const componentOptions = React.useMemo(
		() =>
			setup.components.map((component) => ({
				value: component.component_id,
				label: component.component_group
					? `${component.component_name} (${component.component_group})`
					: component.component_name,
			})),
		[setup.components]
	);

	const subDeptOptions = React.useMemo(
		() =>
			setup.sub_departments.map((sub) => ({
				value: sub.sub_dept_id,
				label: sub.sub_dept_code ? `${sub.sub_dept_code} — ${sub.sub_dept_name}` : sub.sub_dept_name,
			})),
		[setup.sub_departments]
	);

	// Enum payloads are keyed by `code`, never `value` — bind to `.code`.
	const disciplineOptions = React.useMemo(
		() => setup.disciplines.map((d) => ({ value: d.code, label: d.label })),
		[setup.disciplines]
	);

	const downtimeTypeOptions = React.useMemo(
		() => setup.downtime_types.map((d) => ({ value: d.code, label: d.label })),
		[setup.downtime_types]
	);

	const statusLabels = React.useMemo(() => {
		const map = new Map<string, string>();
		setup.statuses.forEach((status) => map.set(status.code, status.label));
		return map;
	}, [setup.statuses]);

	// ------------------------------------------------------- derived preview
	// A keyed duration WINS over restart − stop, exactly as it does server-side.
	// ponytail: display only — nothing here ever writes back into a field.
	const keyedDurationMin = React.useMemo(
		() => toNumberOrNull(durationValue),
		[durationValue]
	);

	const downtimeMin = React.useMemo(
		() => keyedDurationMin ?? durationMinutes(stopDateTime, restartDateTime),
		[keyedDurationMin, stopDateTime, restartDateTime]
	);

	const responseMin = React.useMemo(
		() => responseMinutes(stopDateTime, attendedDateTime),
		[stopDateTime, attendedDateTime]
	);

	// A duration-only incident (no restart) still saves as CLOSED server-side.
	const derivedStatus = React.useMemo(
		() =>
			keyedDurationMin != null
				? BREAKDOWN_STATUS.CLOSED
				: deriveStatus(stopDateTime, attendedDateTime, restartDateTime),
		[keyedDurationMin, stopDateTime, attendedDateTime, restartDateTime]
	);

	const derivedStatusLabel =
		statusLabels.get(derivedStatus) ?? statusFallbackLabel(derivedStatus);

	const statusColor =
		derivedStatus === BREAKDOWN_STATUS.CLOSED
			? "success"
			: derivedStatus === BREAKDOWN_STATUS.UNDER_REPAIR
				? "warning"
				: "error";

	const machinePicked = machineIdValue !== "";

	// ---------------------------------------------------------------- effects
	// 1. Lift a grid row into edit mode (and tell the page to load its reasons).
	React.useEffect(() => {
		if (!editingEntry) return;
		reset(buildFormValuesFromEntry(editingEntry));
		onMachineChange(editingEntry.machine_id);
	}, [editingEntry, reset, onMachineChange]);

	// 2. Clear the form after a save / on leaving edit mode. The stop time is
	//    re-defaulted to "now" so the next incident is one click from being keyed.
	const firstResetToken = React.useRef(true);
	React.useEffect(() => {
		if (firstResetToken.current) {
			firstResetToken.current = false;
			return;
		}
		reset(buildDefaultFormValues(nowDateTimeLocal()));
		onMachineChange(null);
	}, [formResetToken, reset, onMachineChange]);

	// ---------------------------------------------------------------- handlers
	const handleMachinePicked = React.useCallback(
		(nextMachineId: string) => {
			// CASCADE: a reason valid for the old machine's section may not exist
			// for the new one, so the selection is always cleared and the list
			// refetched. Component and discipline default off the reason, so they
			// are cleared with it.
			setValue("reason_id", "", { shouldValidate: false });
			setValue("component_id", "", { shouldValidate: false });
			setValue("discipline", "", { shouldValidate: false });
			onMachineChange(nextMachineId === "" ? null : Number(nextMachineId));
		},
		[onMachineChange, setValue]
	);

	const handleReasonPicked = React.useCallback(
		(reasonId: string) => {
			if (reasonId === "") return;
			const reason = reasons.find((r) => r.reason_id === Number(reasonId));
			if (!reason) return;
			// The backend defaults component and discipline off the reason when they
			// are omitted; pre-filling them makes that visible and still editable.
			if (reason.component_id != null) {
				setValue("component_id", String(reason.component_id), { shouldValidate: false });
			}
			if (reason.discipline) {
				setValue("discipline", reason.discipline, { shouldValidate: false });
			}
		},
		[reasons, setValue]
	);

	const handleAddLine = React.useCallback(() => {
		append(createBlankSpareLine());
	}, [append]);

	const handleRemoveLine = React.useCallback(
		(index: number) => {
			if (fields.length <= 1) {
				// Keep one row on screen rather than emptying the editor entirely.
				setValue(`spares.${index}`, createBlankSpareLine(), { shouldValidate: false });
				return;
			}
			remove(index);
		},
		[fields.length, remove, setValue]
	);

	const handlePickItem = React.useCallback(
		(index: number, option: SpareItemOption | null) => {
			// Default the line's unit from the item's base UOM.
			if (option?.uom_id != null) {
				setValue(`spares.${index}.uom_id`, String(option.uom_id), { shouldValidate: false });
			}
			// Keep a trailing blank line so the next spare needs no extra click.
			if (option && index === fields.length - 1) {
				append(createBlankSpareLine());
			}
		},
		[append, fields.length, setValue]
	);

	return (
		<Box
			component="form"
			onSubmit={handleSubmit(onSubmit)}
			noValidate
			sx={{ display: "flex", flexDirection: "column", gap: 2 }}
		>
			<Typography variant="subtitle2">Incident</Typography>
			<Box sx={FORM_GRID_SX}>
				<Controller
					name="machine_id"
					control={control}
					render={({ field }) => (
						<SearchableOptionSelect
							label="Machine"
							size="small"
							fullWidth
							required
							autoFocus
							options={machineOptions}
							value={field.value === "" ? "" : Number(field.value)}
							onChange={(selectedValue) => {
								const next = selectedValue === "" ? "" : String(selectedValue);
								field.onChange(next);
								handleMachinePicked(next);
							}}
							error={!!errors.machine_id}
							helperText={errors.machine_id?.message ?? "Type to search the machine list"}
						/>
					)}
				/>

				<Controller
					name="stop_datetime"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							type="datetime-local"
							label="Stopped at (date & time)"
							size="small"
							fullWidth
							required
							InputLabelProps={{ shrink: true }}
							error={!!errors.stop_datetime}
							helperText={errors.stop_datetime?.message ?? "Defaults to now"}
						/>
					)}
				/>

				<Controller
					name="spell_id"
					control={control}
					render={({ field }) => (
						<SearchableOptionSelect
							label="Spell"
							size="small"
							fullWidth
							options={spellOptions}
							value={field.value === "" ? "" : Number(field.value)}
							onChange={(selectedValue) =>
								field.onChange(selectedValue === "" ? "" : String(selectedValue))
							}
							error={!!errors.spell_id}
							helperText={errors.spell_id?.message}
						/>
					)}
				/>

				<Controller
					name="reason_id"
					control={control}
					render={({ field }) => (
						<SearchableOptionSelect
							label="Reason"
							size="small"
							fullWidth
							required
							disabled={!machinePicked}
							loading={reasonsLoading}
							options={reasonOptions}
							value={field.value === "" ? "" : Number(field.value)}
							onChange={(selectedValue) => {
								const next = selectedValue === "" ? "" : String(selectedValue);
								field.onChange(next);
								handleReasonPicked(next);
							}}
							error={!!errors.reason_id || !!reasonsError}
							helperText={
								reasonsError ??
								errors.reason_id?.message ??
								(!machinePicked
									? "Pick a machine first — codes are scoped to its section"
									: reasonsLoading
										? "Loading codes for this machine…"
										: reasonOptions.length === 0
											? "No reason codes for this machine's section"
											: undefined)
							}
							noOptionsText="No matching reason code"
						/>
					)}
				/>

				<Controller
					name="discipline"
					control={control}
					render={({ field }) => (
						<SearchableOptionSelect
							label="Discipline"
							size="small"
							fullWidth
							options={disciplineOptions}
							value={field.value}
							onChange={(selectedValue) => field.onChange(selectedValue)}
							error={!!errors.discipline}
							helperText={errors.discipline?.message ?? "Defaults from the reason"}
						/>
					)}
				/>
			</Box>

			<Divider />

			<Typography variant="subtitle2">Response &amp; restart</Typography>
			<Box sx={FORM_GRID_SX}>
				<Controller
					name="attended_datetime"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							type="datetime-local"
							label="Attended at"
							size="small"
							fullWidth
							InputLabelProps={{ shrink: true }}
							error={!!errors.attended_datetime}
							helperText={
								errors.attended_datetime?.message ?? "When the crew reached the machine"
							}
						/>
					)}
				/>

				<Controller
					name="restart_datetime"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							type="datetime-local"
							label="Restarted at"
							size="small"
							fullWidth
							InputLabelProps={{ shrink: true }}
							error={!!errors.restart_datetime}
							helperText={
								errors.restart_datetime?.message ??
								"Leave blank if the machine is still down"
							}
						/>
					)}
				/>

				<Controller
					name="duration_min"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							type="number"
							label="Duration (min)"
							size="small"
							fullWidth
							inputProps={{ step: 1, min: 1 }}
							error={!!errors.duration_min}
							helperText={
								errors.duration_min?.message ??
								"Optional — overrides the time-based duration"
							}
						/>
					)}
				/>

				<Controller
					name="attended_dept_id"
					control={control}
					render={({ field }) => (
						<SearchableOptionSelect
							label="Attended by (crew)"
							size="small"
							fullWidth
							options={subDeptOptions}
							value={field.value === "" ? "" : Number(field.value)}
							onChange={(selectedValue) =>
								field.onChange(selectedValue === "" ? "" : String(selectedValue))
							}
							error={!!errors.attended_dept_id}
							helperText={errors.attended_dept_id?.message}
						/>
					)}
				/>

				<Controller
					name="attended_by"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							label="Attended by (name)"
							size="small"
							fullWidth
							inputProps={{ maxLength: 255 }}
							error={!!errors.attended_by}
							helperText={errors.attended_by?.message}
						/>
					)}
				/>

				{/* Component and downtime type are judged by the crew that attends the
				    machine, not by whoever reports the stop (owner, 2026-10-01). They keep
				    their defaults (the reason's component, BREAKDOWN) until then. */}
				<Controller
					name="component_id"
					control={control}
					render={({ field }) => (
						<SearchableOptionSelect
							label="Component"
							size="small"
							fullWidth
							options={componentOptions}
							value={field.value === "" ? "" : Number(field.value)}
							onChange={(selectedValue) =>
								field.onChange(selectedValue === "" ? "" : String(selectedValue))
							}
							error={!!errors.component_id}
							helperText={errors.component_id?.message ?? "Defaults from the reason — the crew corrects it here"}
						/>
					)}
				/>

				<Controller
					name="downtime_type"
					control={control}
					render={({ field }) => (
						<SearchableOptionSelect
							label="Downtime type"
							size="small"
							fullWidth
							required
							clearable={false}
							options={downtimeTypeOptions}
							value={field.value}
							onChange={(selectedValue) => field.onChange(selectedValue)}
							error={!!errors.downtime_type}
							helperText={
								errors.downtime_type?.message ??
								"Starts as Breakdown — the crew sets the actual type. Only BREAKDOWN counts as a failure"
							}
						/>
					)}
				/>

				<Controller
					name="reported_by"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							label="Reported by (person on the floor)"
							size="small"
							fullWidth
							inputProps={{ maxLength: 255 }}
							error={!!errors.reported_by}
							helperText={
								errors.reported_by?.message ??
								"Optional — your login is recorded automatically"
							}
						/>
					)}
				/>

				<Controller
					name="production_loss_qty"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							type="number"
							label="Production loss qty"
							size="small"
							fullWidth
							inputProps={{ step: 0.001, min: 0 }}
							error={!!errors.production_loss_qty}
							helperText={errors.production_loss_qty?.message}
						/>
					)}
				/>
			</Box>

			{/* Live derived preview — the server recomputes all of this on save. */}
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 1.5,
					flexWrap: "wrap",
					bgcolor: "action.hover",
					borderRadius: 1,
					px: 1.5,
					py: 1,
				}}
			>
				<Chip size="small" color={statusColor} label={derivedStatusLabel} />
				<Typography variant="body2" color="text.secondary">
					Duration:{" "}
					<Typography component="span" variant="body2" color="text.primary" fontWeight={600}>
						{downtimeMin == null ? "still down" : formatMinutes(downtimeMin)}
					</Typography>
				</Typography>
				<Typography variant="body2" color="text.secondary">
					Response:{" "}
					<Typography component="span" variant="body2" color="text.primary" fontWeight={600}>
						{responseMin == null ? "not recorded" : formatMinutes(responseMin)}
					</Typography>
				</Typography>
				{downtimeMin == null ? (
					<Typography
						variant="caption"
						color="text.secondary"
						sx={{ flexBasis: { xs: "100%", md: "auto" }, minWidth: 0 }}
					>
						No restart time — this incident stays on the open board until it is closed.
					</Typography>
				) : null}
			</Box>

			<Divider />

			<Typography variant="subtitle2">Analysis</Typography>
			<Box sx={FORM_GRID_SX}>
				<Controller
					name="root_cause"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							label="Root cause"
							size="small"
							fullWidth
							multiline
							minRows={2}
							error={!!errors.root_cause}
							helperText={errors.root_cause?.message}
						/>
					)}
				/>
				<Controller
					name="action_taken"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							label="Action taken"
							size="small"
							fullWidth
							multiline
							minRows={2}
							error={!!errors.action_taken}
							helperText={errors.action_taken?.message}
						/>
					)}
				/>
				<Controller
					name="preventive_action"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							label="Preventive action"
							size="small"
							fullWidth
							multiline
							minRows={2}
							error={!!errors.preventive_action}
							helperText={errors.preventive_action?.message}
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

			<Divider />

			<SpareLinesEditor
				control={control}
				fields={fields}
				errors={errors}
				spareItems={spareItems}
				uoms={uoms}
				itemsError={itemsError}
				disabled={submitting}
				onAddLine={handleAddLine}
				onRemoveLine={handleRemoveLine}
				onPickItem={handlePickItem}
			/>

			{editing ? (
				<Typography variant="body2" color="text.secondary">
					Editing incident #{editingEntry.breakdown_id}. Clearing the restart time reopens it.
					{editingEntry.reported_by_user_name
						? ` Reported by ${editingEntry.reported_by_user_name}${
								editingEntry.reported_date_time
									? ` on ${formatDateTimeDisplay(editingEntry.reported_date_time)}`
									: ""
							}.`
						: ""}
					{editingEntry.fixed_by_user_name
						? ` Fix entered by ${editingEntry.fixed_by_user_name}${
								editingEntry.fixed_date_time
									? ` on ${formatDateTimeDisplay(editingEntry.fixed_date_time)}`
									: ""
							}.`
						: ""}
					{editingEntry.prod_confirm_status
						? " Changing the restart time or duration resets production's check."
						: ""}
				</Typography>
			) : null}

			{submitError ? <Alert severity="error">{submitError}</Alert> : null}

			{/* The form runs well past a phone's fold and the entry is keyed with a
			    machine stopped, so Save pins to the bottom of the viewport on xs
			    and returns to normal flow from sm up. STICKY_ACTIONS_SX also
			    stretches both buttons to a 44px thumb target on a phone. */}
			<Box sx={STICKY_ACTIONS_SX}>
				{/* Spacer, not `justifyContent`: on xs the buttons are flex:1 and
				    fill the bar, so there is nothing to align; from sm up this
				    pushes them back to the right edge. */}
				<Box sx={{ flexGrow: 1, display: { xs: "none", sm: "block" } }} />
				{editing ? (
					<Button
						type="button"
						variant="outlined"
						startIcon={<CancelIcon size={18} />}
						onClick={onCancelEdit}
					>
						Cancel Edit
					</Button>
				) : null}
				<Button
					type="submit"
					variant="contained"
					startIcon={<SaveIcon size={18} />}
					disabled={submitting}
				>
					{submitting ? "Saving…" : editing ? "Update incident" : "Save incident"}
				</Button>
			</Box>
		</Box>
	);
}
