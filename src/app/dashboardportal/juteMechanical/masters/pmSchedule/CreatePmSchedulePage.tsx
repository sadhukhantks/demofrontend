"use client";

/**
 * Create / edit / view dialog for one PM checklist template task.
 *
 * Scope is an explicit either/or. The checklist query matches a task with
 * `s.machine_id = :machine_id OR s.machine_type_id = :machine_type_id`, so a task
 * with NEITHER set can never be picked up by any machine's checklist — the form
 * therefore forces the choice instead of leaving both blank.
 *
 * `freq_days` is what `next_pm_due` is computed from. Picking a frequency fills it
 * in from that frequency's standard day count; it stays editable for the odd task
 * that runs on its own cycle.
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
	IconButton,
	Stack,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Typography,
} from "@mui/material";
import { X } from "lucide-react";
import { z } from "zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { DIALOG_FORM_SCROLL_SX,
	DIALOG_ACTIONS_SX,
	FORM_GRID_2_SX,
	MOBILE_FULL_BLEED_PAPER,
	TOUCH_TARGET,
} from "@/components/ui/responsiveEntry";
import {
	createMechPmSchedule,
	fetchMechPmScheduleById,
	updateMechPmSchedule,
	type MechMastersSetup,
	type MechPmSchedulePayload,
} from "@/utils/juteMechanicalService";

/** See the note in CreateReasonPage — `active` rides along with the payload. */
type PmScheduleSavePayload = MechPmSchedulePayload & { active: number };

/** Which of the two mutually exclusive scopes this task uses. */
const SCOPE_MACHINE_TYPE = "MACHINE_TYPE";
const SCOPE_MACHINE = "MACHINE";

const pmScheduleFormSchema = z
	.object({
		scope: z.enum([SCOPE_MACHINE_TYPE, SCOPE_MACHINE] as const),
		// nullish, not nullable: the scope toggle unmounts one of the two Controllers
		// and react-hook-form then reports that field as `undefined`, which a
		// nullable-only schema rejects — on a field that isn't rendered, so the
		// Save button silently did nothing.
		machine_type_id: z.number().int().positive().nullish(),
		machine_id: z.number().int().positive().nullish(),
		task_desc: z
			.string()
			.min(1, "Task description is required")
			.max(500, "Task description cannot exceed 500 characters"),
		frequency: z.string().min(1, "Frequency is required"),
		freq_days: z
			.number()
			.int("Frequency days must be a whole number")
			.min(1, "Frequency days must be at least 1")
			.max(3650, "Frequency days looks too large")
			.nullable(),
		seq_no: z
			.number()
			.int("Sequence no. must be a whole number")
			.min(1, "Sequence no. must be at least 1")
			.max(9999, "Sequence no. looks too large")
			.nullable(),
		remarks: z.string().max(255, "Remarks cannot exceed 255 characters"),
		active: z.union([z.literal(0), z.literal(1)]),
	})
	.superRefine((values, ctx) => {
		if (values.scope === SCOPE_MACHINE_TYPE && values.machine_type_id == null) {
			ctx.addIssue({
				code: "custom",
				path: ["machine_type_id"],
				message: "Pick the machine type this template covers",
			});
		}
		if (values.scope === SCOPE_MACHINE && values.machine_id == null) {
			ctx.addIssue({
				code: "custom",
				path: ["machine_id"],
				message: "Pick the machine this task belongs to",
			});
		}
	});

type PmScheduleFormValues = z.infer<typeof pmScheduleFormSchema>;

const EMPTY_FORM: PmScheduleFormValues = {
	scope: SCOPE_MACHINE_TYPE,
	machine_type_id: null,
	machine_id: null,
	task_desc: "",
	frequency: "",
	freq_days: null,
	seq_no: null,
	remarks: "",
	active: 1,
};

const ACTIVE_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
	{ value: 1, label: "Active" },
	{ value: 0, label: "Inactive" },
];

/** Read a numeric text input: empty (or unparseable) means SQL NULL. */
function parseNumberInput(raw: string): number | null {
	if (raw.trim() === "") return null;
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : null;
}

export interface CreatePmSchedulePageProps {
	open: boolean;
	onClose: () => void;
	/** Called after a successful save, with the message to surface on the list. */
	onSaved: (message: string) => void;
	/** Omitted for a new task; the `pm_schedule_id` when editing or viewing one. */
	editId?: number;
	coId: number;
	/** Prefetched dropdowns from the list page; null while they are still loading. */
	setup: MechMastersSetup | null;
	/** View mode — every field disabled and no save button. */
	readOnly?: boolean;
}

export default function CreatePmSchedulePage({
	open,
	onClose,
	onSaved,
	editId,
	coId,
	setup,
	readOnly = false,
}: CreatePmSchedulePageProps) {
	const [loading, setLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

	const {
		control,
		handleSubmit,
		reset,
		setValue,
		formState: { errors, isSubmitting },
	} = useForm<PmScheduleFormValues>({
		resolver: zodResolver(pmScheduleFormSchema),
		defaultValues: EMPTY_FORM,
	});

	const scope = useWatch({ control, name: "scope" });

	const loadDetail = useCallback(async () => {
		setSaveError(null);
		setLoadError(null);
		if (editId === undefined) {
			reset(EMPTY_FORM);
			return;
		}
		setLoading(true);
		try {
			const record = await fetchMechPmScheduleById(editId, coId);
			reset({
				scope: record.machine_id !== null ? SCOPE_MACHINE : SCOPE_MACHINE_TYPE,
				machine_type_id: record.machine_type_id,
				machine_id: record.machine_id,
				task_desc: record.task_desc ?? "",
				frequency: record.frequency ?? "",
				freq_days: record.freq_days,
				seq_no: record.seq_no,
				remarks: record.remarks ?? "",
				active: record.active === 0 ? 0 : 1,
			});
		} catch (err: unknown) {
			setLoadError(err instanceof Error ? err.message : "Error loading the PM task");
		} finally {
			setLoading(false);
		}
	}, [coId, editId, reset]);

	useEffect(() => {
		if (open) {
			loadDetail();
		} else {
			reset(EMPTY_FORM);
			setLoadError(null);
			setSaveError(null);
		}
	}, [open, loadDetail, reset]);

	const machineTypeOptions = useMemo(
		() =>
			(setup?.machine_types ?? []).map((t) => ({
				value: t.machine_type_id,
				label: t.machine_type_name,
			})),
		[setup],
	);

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

	const frequencyOptions = useMemo(
		() => (setup?.pm_frequencies ?? []).map((f) => ({ value: f.code, label: f.label })),
		[setup],
	);

	/** `code -> freq_days`, used to auto-fill the day count when a frequency is picked. */
	const frequencyDays = useMemo(() => {
		const map = new Map<string, number | null>();
		for (const f of setup?.pm_frequencies ?? []) map.set(f.code, f.freq_days ?? null);
		return map;
	}, [setup]);

	/** Switching scope clears the other side so only one is ever sent. */
	const handleScopeChange = useCallback(
		(nextScope: string | null) => {
			// `null` is the toggle group deselecting the active button — a scope is
			// mandatory, so that is ignored rather than clearing the choice.
			if (nextScope === SCOPE_MACHINE_TYPE) {
				setValue("scope", SCOPE_MACHINE_TYPE, { shouldValidate: false });
				setValue("machine_id", null, { shouldValidate: false });
				return;
			}
			if (nextScope === SCOPE_MACHINE) {
				setValue("scope", SCOPE_MACHINE, { shouldValidate: false });
				setValue("machine_type_id", null, { shouldValidate: false });
			}
		},
		[setValue],
	);

	const onSubmit = useCallback(
		async (values: PmScheduleFormValues) => {
			setSaveError(null);
			const remarks = values.remarks.trim();
			const payload: PmScheduleSavePayload = {
				co_id: coId,
				machine_type_id:
					values.scope === SCOPE_MACHINE_TYPE ? (values.machine_type_id ?? null) : null,
				machine_id: values.scope === SCOPE_MACHINE ? (values.machine_id ?? null) : null,
				task_desc: values.task_desc.trim(),
				frequency: values.frequency,
				freq_days: values.freq_days,
				seq_no: values.seq_no,
				remarks: remarks === "" ? null : remarks,
				active: values.active,
			};

			try {
				if (editId === undefined) {
					await createMechPmSchedule(payload);
					onSaved("PM task created successfully");
				} else {
					await updateMechPmSchedule(editId, payload);
					onSaved("PM task updated successfully");
				}
				onClose();
			} catch (err: unknown) {
				setSaveError(err instanceof Error ? err.message : "Save failed");
			}
		},
		[coId, editId, onClose, onSaved],
	);

	const title =
		editId === undefined ? "Create PM Task" : readOnly ? "PM Task" : "Edit PM Task";

	const disabled = readOnly || isSubmitting;

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
								minHeight: 240,
							}}
						>
							<CircularProgress />
						</Box>
					) : (
						<Stack spacing={2.5} sx={{ pt: 1 }}>
							{loadError ? <Alert severity="error">{loadError}</Alert> : null}
							{saveError ? <Alert severity="error">{saveError}</Alert> : null}

							<Box>
								<Typography variant="subtitle2" sx={{ mb: 1 }}>
									This task applies to
								</Typography>
								<Controller
									name="scope"
									control={control}
									render={({ field }) => (
										<ToggleButtonGroup
											exclusive
											size="small"
											value={field.value}
											onChange={(_event, next: string | null) => handleScopeChange(next)}
											disabled={disabled}
											aria-label="Task scope"
											sx={{
												// Two long labels do not fit side by side at 360px — stack
												// them full width there, and keep each one thumb-sized.
												display: "flex",
												flexWrap: "wrap",
												width: { xs: "100%", sm: "auto" },
												"& .MuiToggleButton-root": {
													flex: { xs: "1 1 100%", sm: "0 0 auto" },
													minHeight: TOUCH_TARGET,
													textAlign: "left",
													lineHeight: 1.3,
												},
											}}
										>
											<ToggleButton value={SCOPE_MACHINE_TYPE}>
												A whole machine type (section template)
											</ToggleButton>
											<ToggleButton value={SCOPE_MACHINE}>
												One specific machine
											</ToggleButton>
										</ToggleButtonGroup>
									)}
								/>
								<Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
									One or the other, never both — a task with no scope is never picked up by
									any machine&apos;s checklist.
								</Typography>
							</Box>

							<Box sx={FORM_GRID_2_SX}>
								{scope === SCOPE_MACHINE_TYPE ? (
									<Box sx={{ gridColumn: { xs: "auto", sm: "1 / -1" } }}>
										<Controller
											name="machine_type_id"
											control={control}
											render={({ field }) => (
												<SearchableOptionSelect<number>
													label="Machine Type (section)"
													placeholder="Type to search machine types"
													options={machineTypeOptions}
													value={field.value ?? ""}
													onChange={(value) => field.onChange(value === "" ? null : value)}
													required
													disabled={disabled}
													error={Boolean(errors.machine_type_id)}
													helperText={
														errors.machine_type_id?.message ??
														"Every machine of this type gets the task on its checklist."
													}
													fullWidth
												/>
											)}
										/>
									</Box>
								) : (
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
													disabled={disabled}
													error={Boolean(errors.machine_id)}
													helperText={
														errors.machine_id?.message ??
														"Only this machine's checklist gets the task."
													}
													fullWidth
												/>
											)}
										/>
									</Box>
								)}

								<Box sx={{ gridColumn: { xs: "auto", sm: "1 / -1" } }}>
									<Controller
										name="task_desc"
										control={control}
										render={({ field }) => (
											<TextField
												{...field}
												label="Task Description"
												required
												size="small"
												multiline
												minRows={2}
												disabled={disabled}
												error={Boolean(errors.task_desc)}
												helperText={errors.task_desc?.message}
												fullWidth
											/>
										)}
									/>
								</Box>

								<Controller
									name="frequency"
									control={control}
									render={({ field }) => (
										<SearchableOptionSelect<string>
											label="Frequency"
											placeholder="Select frequency"
											options={frequencyOptions}
											value={field.value === "" ? "" : field.value}
											onChange={(value) => {
												const next = value === "" ? "" : value;
												field.onChange(next);
												// Auto-fill the day count from the frequency; still editable below.
												setValue("freq_days", next === "" ? null : (frequencyDays.get(next) ?? null), {
													shouldValidate: false,
												});
											}}
											required
											disabled={disabled}
											error={Boolean(errors.frequency)}
											helperText={errors.frequency?.message}
											fullWidth
										/>
									)}
								/>

								<Controller
									name="freq_days"
									control={control}
									render={({ field }) => (
										<TextField
											name={field.name}
											onBlur={field.onBlur}
											inputRef={field.ref}
											value={field.value === null ? "" : String(field.value)}
											onChange={(event) => field.onChange(parseNumberInput(event.target.value))}
											label="Frequency Days"
											type="number"
											size="small"
											disabled={disabled}
											error={Boolean(errors.freq_days)}
											helperText={
												errors.freq_days?.message ??
												"Filled from the frequency; edit it for an off-cycle task."
											}
											fullWidth
										/>
									)}
								/>

								<Controller
									name="seq_no"
									control={control}
									render={({ field }) => (
										<TextField
											name={field.name}
											onBlur={field.onBlur}
											inputRef={field.ref}
											value={field.value === null ? "" : String(field.value)}
											onChange={(event) => field.onChange(parseNumberInput(event.target.value))}
											label="Sequence No."
											type="number"
											size="small"
											disabled={disabled}
											error={Boolean(errors.seq_no)}
											helperText={
												errors.seq_no?.message ?? "Orders the task on the PM checklist."
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
