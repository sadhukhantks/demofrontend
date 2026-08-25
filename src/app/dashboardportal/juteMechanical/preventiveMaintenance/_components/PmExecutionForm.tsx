"use client";

import * as React from "react";
import { Alert, Box, Button, Chip, Divider, TextField, Typography } from "@mui/material";
import { Save as SaveIcon, X as CancelIcon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	FORM_GRID_SX,
	STICKY_ACTIONS_SX,
	TOUCH_TARGET,
} from "@/components/ui/responsiveEntry";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import type { MechPmSetup } from "@/utils/juteMechanicalService";
import type { PmEnumLike, PmExecutionFormValues } from "../types/pmTypes";
import {
	FALLBACK_PM_FREQUENCIES,
	buildDefaultPmFormValues,
	pmExecutionFormSchema,
} from "../types/pmTypes";

export interface PmExecutionFormProps {
	/** Dropdowns from `/pm_create_setup`. */
	setup: MechPmSetup;
	/** Header being edited, or null while creating. */
	initialValues: PmExecutionFormValues | null;
	editing: boolean;
	/** Bumped by the page after a save or when leaving edit mode; any change resets the form. */
	resetToken: number;
	submitting: boolean;
	submitError: string | null;
	/** Live header values, so the page can drive the checklist off machine + frequency. */
	onValuesChange: (values: { machineId: number | null; frequency: string }) => void;
	/** Validated header — the page pairs it with the checklist rows and calls the API. */
	onSubmit: (values: PmExecutionFormValues) => void;
	onCancelEdit: () => void;
	/** Rendered between the header fields and the action bar (the checklist grid). */
	children?: React.ReactNode;
	/** Blocks submit with this message when the checklist is not postable. */
	blockingMessage?: string | null;
}

/**
 * PM execution header.
 *
 * Purely presentational with respect to data: it owns React Hook Form state,
 * receives every option list through props, and hands validated values back to the
 * page — it never calls the API itself.
 *
 * `machine_id` + `frequency` are lifted to the page through `onValuesChange`
 * because they are what the checklist is seeded from: choosing them is the gesture
 * that loads the template. `done_by` is FREE TEXT on this router (the fitter or
 * crew who did the round), unlike the overhaul screen where it is an enum.
 */
export default function PmExecutionForm({
	setup,
	initialValues,
	editing,
	resetToken,
	submitting,
	submitError,
	onValuesChange,
	onSubmit,
	onCancelEdit,
	children,
	blockingMessage,
}: PmExecutionFormProps) {
	const {
		control,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<PmExecutionFormValues>({
		resolver: zodResolver(pmExecutionFormSchema),
		defaultValues: initialValues ?? buildDefaultPmFormValues(),
		mode: "onBlur",
	});

	React.useEffect(() => {
		reset(initialValues ?? buildDefaultPmFormValues());
		// initialValues is rebuilt by the page alongside resetToken.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [resetToken, reset]);

	const values = useWatch({ control });
	const machineIdValue = values.machine_id ?? "";
	const frequencyValue = values.frequency ?? "";

	// Report the two checklist-driving fields upward whenever they change.
	React.useEffect(() => {
		onValuesChange({
			machineId: machineIdValue === "" ? null : Number(machineIdValue),
			frequency: frequencyValue,
		});
	}, [machineIdValue, frequencyValue, onValuesChange]);

	const machineOptions = React.useMemo(
		() =>
			setup.machines.map((machine) => ({
				value: String(machine.machine_id),
				label: machine.mech_code
					? `${machine.mech_code} — ${machine.machine_name}`
					: machine.machine_name,
			})),
		[setup.machines],
	);

	const frequencySource = React.useMemo<ReadonlyArray<PmEnumLike>>(
		() => (setup.pm_frequencies.length > 0 ? setup.pm_frequencies : FALLBACK_PM_FREQUENCIES),
		[setup.pm_frequencies],
	);

	const frequencyOptions = React.useMemo(
		() =>
			frequencySource.map((option) => ({
				value: option.code,
				label: option.freq_days ? `${option.label} (${option.freq_days} d)` : option.label,
			})),
		[frequencySource],
	);

	// The day count the chosen frequency resolves to — one input into the server's
	// next_pm_due, shown so the fitter knows when the machine is due back.
	const freqDays = React.useMemo(
		() => frequencySource.find((option) => option.code === frequencyValue)?.freq_days ?? null,
		[frequencySource, frequencyValue],
	);

	const submit = handleSubmit((formValues) => onSubmit(formValues));

	return (
		<Box component="form" onSubmit={submit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
				{editing ? "Edit PM execution" : "Record a PM round"}
			</Typography>

			<Box sx={FORM_GRID_SX}>
				<Controller
					control={control}
					name="machine_id"
					render={({ field }) => (
						<SearchableOptionSelect
							label="Machine"
							required
							size="small"
							fullWidth
							disabled={submitting}
							options={machineOptions}
							value={field.value}
							onChange={(next) => field.onChange(next === "" ? "" : String(next))}
							error={Boolean(errors.machine_id)}
							helperText={errors.machine_id?.message}
						/>
					)}
				/>

				<Controller
					control={control}
					name="frequency"
					render={({ field }) => (
						<SearchableOptionSelect
							label="Frequency"
							required
							size="small"
							fullWidth
							disabled={submitting}
							options={frequencyOptions}
							value={field.value}
							onChange={(next) => field.onChange(next === "" ? "" : String(next))}
							error={Boolean(errors.frequency)}
							helperText={errors.frequency?.message ?? "Seeds the checklist below"}
						/>
					)}
				/>

				<Controller
					control={control}
					name="pm_date"
					render={({ field }) => (
						<TextField
							{...field}
							type="date"
							label="PM date"
							required
							size="small"
							fullWidth
							disabled={submitting}
							InputLabelProps={{ shrink: true }}
							error={Boolean(errors.pm_date)}
							helperText={errors.pm_date?.message}
						/>
					)}
				/>

				<Controller
					control={control}
					name="done_by"
					render={({ field }) => (
						<TextField
							{...field}
							label="Done by"
							size="small"
							fullWidth
							disabled={submitting}
							placeholder="Fitter or crew"
							inputProps={{ maxLength: 100 }}
							error={Boolean(errors.done_by)}
							helperText={errors.done_by?.message}
						/>
					)}
				/>

				<Controller
					control={control}
					name="downtime_min"
					render={({ field }) => (
						<TextField
							{...field}
							type="number"
							label="Downtime (min)"
							size="small"
							fullWidth
							disabled={submitting}
							inputProps={{ min: 0, step: 1 }}
							error={Boolean(errors.downtime_min)}
							helperText={errors.downtime_min?.message ?? "Minutes the machine was stopped"}
						/>
					)}
				/>

				<Controller
					control={control}
					name="remarks"
					render={({ field }) => (
						<TextField
							{...field}
							label="Remarks"
							size="small"
							fullWidth
							disabled={submitting}
							error={Boolean(errors.remarks)}
							helperText={errors.remarks?.message}
						/>
					)}
				/>
			</Box>

			{freqDays ? (
				<Box>
					<Chip
						size="small"
						variant="outlined"
						label={`Cycle: every ${freqDays} day${freqDays === 1 ? "" : "s"}`}
					/>
				</Box>
			) : null}

			<Divider />

			{children}

			{blockingMessage ? (
				<Alert severity="warning" sx={{ overflowWrap: "anywhere" }}>
					{blockingMessage}
				</Alert>
			) : null}
			{submitError ? <Alert severity="error">{submitError}</Alert> : null}

			<Box sx={STICKY_ACTIONS_SX} justifyContent={{ xs: "stretch", sm: "flex-end" }}>
				{editing ? (
					<Button
						variant="outlined"
						startIcon={<CancelIcon size={18} />}
						onClick={onCancelEdit}
						disabled={submitting}
						sx={{ minHeight: TOUCH_TARGET }}
					>
						Cancel edit
					</Button>
				) : null}
				<Button
					type="submit"
					variant="contained"
					startIcon={<SaveIcon size={18} />}
					disabled={submitting || Boolean(blockingMessage)}
					sx={{ minHeight: TOUCH_TARGET }}
				>
					{submitting ? "Saving…" : editing ? "Update PM" : "Save PM"}
				</Button>
			</Box>
		</Box>
	);
}
