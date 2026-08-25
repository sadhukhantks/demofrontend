"use client";

/**
 * Create / edit / view dialog for one machine's maintenance attributes.
 *
 * The backend upserts on (co_id, machine_id), so "create" here means "fill in the
 * maintenance record for this machine". Both due dates are derived server-side
 * (`next_pm_due = last_pm_date + pm_freq_days`,
 * `next_overhaul_due = last_overhaul_date + overhaul_freq_months`); the preview
 * in the dialog mirrors that arithmetic so the effect of an interval is visible
 * before saving.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
	Alert,
	Box,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Divider,
	IconButton,
	Stack,
	TextField,
	Typography,
} from "@mui/material";
import { X } from "lucide-react";
import { z } from "zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import {
	DIALOG_ACTIONS_SX,
	FORM_GRID_2_SX,
	MOBILE_FULL_BLEED_PAPER,
} from "@/components/ui/responsiveEntry";
import { DIALOG_FORM_SCROLL_SX } from "../_components/responsiveDialog";
import {
	createMechMachineAttr,
	fetchMechMachineAttrById,
	updateMechMachineAttr,
	type MechMachineAttrPayload,
	type MechMastersSetup,
} from "@/utils/juteMechanicalService";

/** See the note in CreateReasonPage — `active` rides along with the payload. */
type MachineAttrSavePayload = MechMachineAttrPayload & { active: number };

const machineAttrFormSchema = z
	.object({
		machine_id: z.number().int().positive().nullable(),
		make: z.string().max(100, "Make cannot exceed 100 characters"),
		model: z.string().max(100, "Model cannot exceed 100 characters"),
		serial_no: z.string().max(100, "Serial no. cannot exceed 100 characters"),
		commissioning_date: z.string(),
		criticality: z.string(),
		last_overhaul_date: z.string(),
		overhaul_freq_months: z
			.number()
			.int("Overhaul frequency must be a whole number of months")
			.min(1, "Overhaul frequency must be at least 1 month")
			.max(600, "Overhaul frequency looks too large")
			.nullable(),
		last_pm_date: z.string(),
		pm_freq_days: z
			.number()
			.int("PM frequency must be a whole number of days")
			.min(1, "PM frequency must be at least 1 day")
			.max(3650, "PM frequency looks too large")
			.nullable(),
		remarks: z.string().max(255, "Remarks cannot exceed 255 characters"),
		active: z.union([z.literal(0), z.literal(1)]),
	})
	.superRefine((values, ctx) => {
		if (values.machine_id === null) {
			ctx.addIssue({
				code: "custom",
				path: ["machine_id"],
				message: "Machine is required",
			});
		}
	});

type MachineAttrFormValues = z.infer<typeof machineAttrFormSchema>;

const EMPTY_FORM: MachineAttrFormValues = {
	machine_id: null,
	make: "",
	model: "",
	serial_no: "",
	commissioning_date: "",
	criticality: "",
	last_overhaul_date: "",
	overhaul_freq_months: null,
	last_pm_date: "",
	pm_freq_days: null,
	remarks: "",
	active: 1,
};

const ACTIVE_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
	{ value: 1, label: "Active" },
	{ value: 0, label: "Inactive" },
];

/** Backend dates arrive as `YYYY-MM-DD` (or a datetime); the inputs want the date part. */
function toDateInput(value: string | null): string {
	return value ? String(value).slice(0, 10) : "";
}

/** `""` from a date input means SQL NULL. */
function fromDateInput(value: string): string | null {
	return value === "" ? null : value;
}

/** Read a numeric text input: empty (or unparseable) means "no interval set". */
function parseIntervalInput(raw: string): number | null {
	if (raw.trim() === "") return null;
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Local-calendar `YYYY-MM-DD`. Never use `toISOString()` here: these are calendar
 * dates built at local midnight, and the UTC conversion shifts them by a day for
 * any positive offset (IST included).
 */
function formatLocalDate(value: Date): string {
	return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
		value.getDate(),
	).padStart(2, "0")}`;
}

/** Mirrors the backend's `date + N days`. */
function addDays(isoDate: string, days: number): string | null {
	if (!isoDate) return null;
	const parsed = new Date(`${isoDate}T00:00:00`);
	if (Number.isNaN(parsed.getTime())) return null;
	parsed.setDate(parsed.getDate() + days);
	return formatLocalDate(parsed);
}

/** Mirrors the backend's calendar month addition, clamping to the month's last day. */
function addMonths(isoDate: string, months: number): string | null {
	if (!isoDate) return null;
	const parsed = new Date(`${isoDate}T00:00:00`);
	if (Number.isNaN(parsed.getTime())) return null;
	const day = parsed.getDate();
	const target = new Date(parsed.getFullYear(), parsed.getMonth() + months, 1);
	const lastDayOfTarget = new Date(
		target.getFullYear(),
		target.getMonth() + 1,
		0,
	).getDate();
	target.setDate(Math.min(day, lastDayOfTarget));
	return formatLocalDate(target);
}

export interface CreateMachineAttributePageProps {
	open: boolean;
	onClose: () => void;
	/** Called after a successful save, with the message to surface on the list. */
	onSaved: (message: string) => void;
	/** Present only when the machine already has an attribute record (drives PUT). */
	machineAttrId?: number;
	/** Preselects and locks the machine when the dialog was opened from a grid row. */
	machineId?: number;
	coId: number;
	/** Prefetched dropdowns from the list page; null while they are still loading. */
	setup: MechMastersSetup | null;
	/** View mode — every field disabled and no save button. */
	readOnly?: boolean;
}

export default function CreateMachineAttributePage({
	open,
	onClose,
	onSaved,
	machineAttrId,
	machineId,
	coId,
	setup,
	readOnly = false,
}: CreateMachineAttributePageProps) {
	const [loading, setLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

	const {
		control,
		handleSubmit,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<MachineAttrFormValues>({
		resolver: zodResolver(machineAttrFormSchema),
		defaultValues: EMPTY_FORM,
	});

	const lastPmDate = useWatch({ control, name: "last_pm_date" });
	const pmFreqDays = useWatch({ control, name: "pm_freq_days" });
	const lastOverhaulDate = useWatch({ control, name: "last_overhaul_date" });
	const overhaulFreqMonths = useWatch({ control, name: "overhaul_freq_months" });

	const loadDetail = useCallback(async () => {
		setSaveError(null);
		setLoadError(null);

		if (machineAttrId === undefined) {
			// Never configured (or a fresh "Configure Machine" from the toolbar).
			reset({ ...EMPTY_FORM, machine_id: machineId ?? null });
			return;
		}

		setLoading(true);
		try {
			const record = await fetchMechMachineAttrById(machineAttrId, coId);
			reset({
				machine_id: record.machine_id,
				make: record.make ?? "",
				model: record.model ?? "",
				serial_no: record.serial_no ?? "",
				commissioning_date: toDateInput(record.commissioning_date),
				criticality: record.criticality ?? "",
				last_overhaul_date: toDateInput(record.last_overhaul_date),
				overhaul_freq_months: record.overhaul_freq_months,
				last_pm_date: toDateInput(record.last_pm_date),
				pm_freq_days: record.pm_freq_days,
				remarks: record.remarks ?? "",
				active: record.active === 0 ? 0 : 1,
			});
		} catch (err: unknown) {
			setLoadError(
				err instanceof Error ? err.message : "Error loading the machine attributes",
			);
		} finally {
			setLoading(false);
		}
	}, [coId, machineAttrId, machineId, reset]);

	useEffect(() => {
		if (open) {
			loadDetail();
		} else {
			reset(EMPTY_FORM);
			setLoadError(null);
			setSaveError(null);
		}
	}, [open, loadDetail, reset]);

	const machineOptions = useMemo(
		() =>
			(setup?.machines ?? []).map((m) => {
				const suffix = [m.mech_code, m.machine_type_name, m.dept_name]
					.filter((part): part is string => Boolean(part))
					.join(" · ");
				return {
					value: m.machine_id,
					label: suffix ? `${m.machine_name} — ${suffix}` : m.machine_name,
				};
			}),
		[setup],
	);

	const criticalityOptions = useMemo(
		() => (setup?.criticalities ?? []).map((c) => ({ value: c.code, label: c.label })),
		[setup],
	);

	const nextPmPreview = useMemo(
		() => (pmFreqDays ? addDays(lastPmDate, pmFreqDays) : null),
		[lastPmDate, pmFreqDays],
	);

	const nextOverhaulPreview = useMemo(
		() => (overhaulFreqMonths ? addMonths(lastOverhaulDate, overhaulFreqMonths) : null),
		[lastOverhaulDate, overhaulFreqMonths],
	);

	const onSubmit = useCallback(
		async (values: MachineAttrFormValues) => {
			setSaveError(null);
			if (values.machine_id === null) return;

			const make = values.make.trim();
			const model = values.model.trim();
			const serialNo = values.serial_no.trim();
			const remarks = values.remarks.trim();

			const payload: MachineAttrSavePayload = {
				co_id: coId,
				machine_id: values.machine_id,
				make: make === "" ? null : make,
				model: model === "" ? null : model,
				serial_no: serialNo === "" ? null : serialNo,
				commissioning_date: fromDateInput(values.commissioning_date),
				criticality: values.criticality === "" ? null : values.criticality,
				last_overhaul_date: fromDateInput(values.last_overhaul_date),
				overhaul_freq_months: values.overhaul_freq_months,
				last_pm_date: fromDateInput(values.last_pm_date),
				pm_freq_days: values.pm_freq_days,
				remarks: remarks === "" ? null : remarks,
				active: values.active,
			};

			try {
				if (machineAttrId === undefined) {
					await createMechMachineAttr(payload);
					onSaved("Machine attributes saved successfully");
				} else {
					await updateMechMachineAttr(machineAttrId, payload);
					onSaved("Machine attributes updated successfully");
				}
				onClose();
			} catch (err: unknown) {
				setSaveError(err instanceof Error ? err.message : "Save failed");
			}
		},
		[coId, machineAttrId, onClose, onSaved],
	);

	const title =
		machineAttrId === undefined
			? "Configure Machine Attributes"
			: readOnly
				? "Machine Attributes"
				: "Edit Machine Attributes";

	const disabled = readOnly || isSubmitting;
	// Opened from a grid row: the row IS the machine, so it must not be re-keyed here.
	const machineLocked = disabled || machineId !== undefined;

	return (
		<Dialog
			open={open}
			onClose={onClose}
			fullWidth
			maxWidth="md"
			PaperProps={MOBILE_FULL_BLEED_PAPER}
			sx={DIALOG_FORM_SCROLL_SX}
		>
			<form onSubmit={handleSubmit(onSubmit)} noValidate>
				<DialogTitle
					sx={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						pb: 1,
					}}
				>
					<Typography variant="h6" component="span">
						{title}
					</Typography>
					<IconButton onClick={onClose} size="small" aria-label="Close dialog">
						<X size={20} />
					</IconButton>
				</DialogTitle>

				<DialogContent dividers>
					{loading ? (
						<Box
							sx={{
								display: "flex",
								justifyContent: "center",
								alignItems: "center",
								minHeight: 260,
							}}
						>
							<CircularProgress />
						</Box>
					) : (
						<Stack spacing={2.5} sx={{ pt: 1 }}>
							{loadError ? <Alert severity="error">{loadError}</Alert> : null}
							{saveError ? <Alert severity="error">{saveError}</Alert> : null}

							{machineAttrId === undefined ? (
								<Alert severity="info">
									This machine has no maintenance record yet. Setting a PM or overhaul
									interval below is what puts it on the maintenance-due report.
								</Alert>
							) : null}

							<Box sx={FORM_GRID_2_SX}>
								<Box sx={{ gridColumn: { xs: "auto", sm: "1 / -1" } }}>
									<Controller
										name="machine_id"
										control={control}
										render={({ field }) => (
											<SearchableOptionSelect<number>
												label="Machine"
												placeholder="Type to search machines"
												options={machineOptions}
												value={field.value ?? ""}
												onChange={(value) => field.onChange(value === "" ? null : value)}
												required
												disabled={machineLocked}
												error={Boolean(errors.machine_id)}
												helperText={
													errors.machine_id?.message ??
													(machineId !== undefined
														? "Locked to the machine you opened from the list."
														: "One maintenance record per machine.")
												}
												fullWidth
											/>
										)}
									/>
								</Box>

								<Controller
									name="make"
									control={control}
									render={({ field }) => (
										<TextField
											{...field}
											label="Make"
											size="small"
											disabled={disabled}
											error={Boolean(errors.make)}
											helperText={errors.make?.message}
											fullWidth
										/>
									)}
								/>

								<Controller
									name="model"
									control={control}
									render={({ field }) => (
										<TextField
											{...field}
											label="Model"
											size="small"
											disabled={disabled}
											error={Boolean(errors.model)}
											helperText={errors.model?.message}
											fullWidth
										/>
									)}
								/>

								<Controller
									name="serial_no"
									control={control}
									render={({ field }) => (
										<TextField
											{...field}
											label="Serial No."
											size="small"
											disabled={disabled}
											error={Boolean(errors.serial_no)}
											helperText={errors.serial_no?.message}
											fullWidth
										/>
									)}
								/>

								<Controller
									name="commissioning_date"
									control={control}
									render={({ field }) => (
										<TextField
											{...field}
											label="Commissioning Date"
											type="date"
											size="small"
											disabled={disabled}
											InputLabelProps={{ shrink: true }}
											error={Boolean(errors.commissioning_date)}
											helperText={errors.commissioning_date?.message}
											fullWidth
										/>
									)}
								/>

								<Controller
									name="criticality"
									control={control}
									render={({ field }) => (
										<SearchableOptionSelect<string>
											label="Criticality"
											placeholder="Not rated"
											options={criticalityOptions}
											value={field.value === "" ? "" : field.value}
											onChange={(value) => field.onChange(value === "" ? "" : value)}
											disabled={disabled}
											error={Boolean(errors.criticality)}
											helperText={
												errors.criticality?.message ??
												"Orders the maintenance-due report."
											}
											fullWidth
										/>
									)}
								/>

								<Controller
									name="active"
									control={control}
									render={({ field }) => (
										<SearchableOptionSelect<number>
											label="Status"
											options={ACTIVE_OPTIONS}
											value={field.value}
											onChange={(value) => field.onChange(value === "" ? 1 : value)}
											clearable={false}
											disabled={disabled}
											error={Boolean(errors.active)}
											helperText={errors.active?.message}
											fullWidth
										/>
									)}
								/>
							</Box>

							<Divider textAlign="left">
								<Typography variant="overline" color="text.secondary">
									Maintenance intervals
								</Typography>
							</Divider>

							<Box sx={FORM_GRID_2_SX}>
								<Controller
									name="last_overhaul_date"
									control={control}
									render={({ field }) => (
										<TextField
											{...field}
											label="Last Overhaul Date"
											type="date"
											size="small"
											disabled={disabled}
											InputLabelProps={{ shrink: true }}
											error={Boolean(errors.last_overhaul_date)}
											helperText={errors.last_overhaul_date?.message}
											fullWidth
										/>
									)}
								/>

								<Controller
									name="overhaul_freq_months"
									control={control}
									render={({ field }) => (
										<TextField
											name={field.name}
											onBlur={field.onBlur}
											inputRef={field.ref}
											value={field.value === null ? "" : String(field.value)}
											onChange={(event) =>
												field.onChange(parseIntervalInput(event.target.value))
											}
											label="Overhaul Frequency (months)"
											type="number"
											size="small"
											disabled={disabled}
											error={Boolean(errors.overhaul_freq_months)}
											helperText={errors.overhaul_freq_months?.message}
											fullWidth
										/>
									)}
								/>

								<Controller
									name="last_pm_date"
									control={control}
									render={({ field }) => (
										<TextField
											{...field}
											label="Last PM Date"
											type="date"
											size="small"
											disabled={disabled}
											InputLabelProps={{ shrink: true }}
											error={Boolean(errors.last_pm_date)}
											helperText={errors.last_pm_date?.message}
											fullWidth
										/>
									)}
								/>

								<Controller
									name="pm_freq_days"
									control={control}
									render={({ field }) => (
										<TextField
											name={field.name}
											onBlur={field.onBlur}
											inputRef={field.ref}
											value={field.value === null ? "" : String(field.value)}
											onChange={(event) =>
												field.onChange(parseIntervalInput(event.target.value))
											}
											label="PM Frequency (days)"
											type="number"
											size="small"
											disabled={disabled}
											error={Boolean(errors.pm_freq_days)}
											helperText={errors.pm_freq_days?.message}
											fullWidth
										/>
									)}
								/>

								<Box sx={{ gridColumn: { xs: "auto", sm: "1 / -1" } }}>
									<Controller
										name="remarks"
										control={control}
										render={({ field }) => (
											<TextField
												{...field}
												label="Remarks"
												size="small"
												multiline
												minRows={2}
												disabled={disabled}
												error={Boolean(errors.remarks)}
												helperText={errors.remarks?.message}
												fullWidth
											/>
										)}
									/>
								</Box>
							</Box>

							<Alert
								severity={nextPmPreview || nextOverhaulPreview ? "info" : "warning"}
								// The preview names two dates and an explanation; at 360px it has to
								// wrap inside the alert rather than push the dialog sideways.
								sx={{ "& .MuiAlert-message": { minWidth: 0, overflowWrap: "anywhere" } }}
							>
								{nextPmPreview || nextOverhaulPreview ? (
									<>
										Due dates are computed on save:{" "}
										{nextPmPreview
											? `next PM ${nextPmPreview}`
											: "next PM not derivable yet"}
										{" · "}
										{nextOverhaulPreview
											? `next overhaul ${nextOverhaulPreview}`
											: "next overhaul not derivable yet"}
										. A due date needs both the last date and the interval.
									</>
								) : (
									"No interval set — this machine will not appear on the maintenance-due report."
								)}
							</Alert>
						</Stack>
					)}
				</DialogContent>

				<DialogActions sx={DIALOG_ACTIONS_SX}>
					<Button type="button" variant="outline" onClick={onClose}>
						{readOnly ? "Close" : "Cancel"}
					</Button>
					{readOnly ? null : (
						<Button type="submit" disabled={isSubmitting || loading}>
							{isSubmitting ? "Saving..." : "Save"}
						</Button>
					)}
				</DialogActions>
			</form>
		</Dialog>
	);
}
