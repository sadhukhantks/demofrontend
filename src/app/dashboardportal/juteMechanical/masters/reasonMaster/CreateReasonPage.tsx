"use client";

/**
 * Create / edit / view dialog for a breakdown reason code.
 *
 * The one rule worth spelling out on screen: `machine_type_id` is optional, and
 * leaving it empty makes the code GLOBAL — it appears on every machine's reason
 * dropdown. Setting it restricts the code to that section's machines.
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
} from "@/components/ui/responsiveEntry";
import {
	createMechReason,
	fetchMechReasonById,
	updateMechReason,
	type MechMastersSetup,
	type MechReasonPayload,
} from "@/utils/juteMechanicalService";

/**
 * `active` rides along with the documented payload: the backend reads it off the
 * same body (`_active_flag(body.get("active"))`) but the service's payload type
 * only declares the fields the spec pins down, so it is added here rather than
 * re-declaring the service type.
 */
type ReasonSavePayload = MechReasonPayload & { active: number };

const reasonFormSchema = z.object({
	/** null = a global code, available on every machine type. */
	machine_type_id: z.number().int().positive().nullable(),
	reason_code: z
		.string()
		.min(1, "Reason code is required")
		.max(20, "Reason code cannot exceed 20 characters"),
	reason_desc: z
		.string()
		.min(1, "Description is required")
		.max(255, "Description cannot exceed 255 characters"),
	discipline: z.string().min(1, "Discipline is required"),
	component_id: z.number().int().positive().nullable(),
	remarks: z.string().max(255, "Remarks cannot exceed 255 characters"),
	active: z.union([z.literal(0), z.literal(1)]),
});

type ReasonFormValues = z.infer<typeof reasonFormSchema>;

const EMPTY_FORM: ReasonFormValues = {
	machine_type_id: null,
	reason_code: "",
	reason_desc: "",
	discipline: "",
	component_id: null,
	remarks: "",
	active: 1,
};

const ACTIVE_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
	{ value: 1, label: "Active" },
	{ value: 0, label: "Inactive" },
];

export interface CreateReasonPageProps {
	open: boolean;
	onClose: () => void;
	/** Called after a successful save, with the message to surface on the list. */
	onSaved: (message: string) => void;
	/** Omitted for a new code; the `reason_id` when editing or viewing one. */
	editId?: number;
	coId: number;
	/** Prefetched dropdowns from the list page; null while they are still loading. */
	setup: MechMastersSetup | null;
	/** View mode — every field disabled and no save button. */
	readOnly?: boolean;
}

export default function CreateReasonPage({
	open,
	onClose,
	onSaved,
	editId,
	coId,
	setup,
	readOnly = false,
}: CreateReasonPageProps) {
	const [loading, setLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

	const {
		control,
		handleSubmit,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<ReasonFormValues>({
		resolver: zodResolver(reasonFormSchema),
		defaultValues: EMPTY_FORM,
	});

	const machineTypeId = useWatch({ control, name: "machine_type_id" });

	const loadDetail = useCallback(async () => {
		setSaveError(null);
		setLoadError(null);
		if (editId === undefined) {
			reset(EMPTY_FORM);
			return;
		}
		setLoading(true);
		try {
			const record = await fetchMechReasonById(editId, coId);
			reset({
				machine_type_id: record.machine_type_id,
				reason_code: record.reason_code ?? "",
				reason_desc: record.reason_desc ?? "",
				discipline: record.discipline ?? "",
				component_id: record.component_id,
				remarks: record.remarks ?? "",
				active: record.active === 0 ? 0 : 1,
			});
		} catch (err: unknown) {
			setLoadError(err instanceof Error ? err.message : "Error loading the reason code");
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

	const disciplineOptions = useMemo(
		() => (setup?.disciplines ?? []).map((d) => ({ value: d.code, label: d.label })),
		[setup],
	);

	const componentOptions = useMemo(
		() =>
			(setup?.components ?? []).map((c) => ({
				value: c.component_id,
				label: c.component_group
					? `${c.component_name} (${c.component_group})`
					: c.component_name,
			})),
		[setup],
	);

	const selectedMachineTypeName = useMemo(
		() =>
			machineTypeOptions.find((option) => option.value === machineTypeId)?.label ?? null,
		[machineTypeOptions, machineTypeId],
	);

	const onSubmit = useCallback(
		async (values: ReasonFormValues) => {
			setSaveError(null);
			const remarks = values.remarks.trim();
			const payload: ReasonSavePayload = {
				co_id: coId,
				machine_type_id: values.machine_type_id,
				reason_code: values.reason_code.trim(),
				reason_desc: values.reason_desc.trim(),
				discipline: values.discipline,
				component_id: values.component_id,
				remarks: remarks === "" ? null : remarks,
				active: values.active,
			};

			try {
				if (editId === undefined) {
					await createMechReason(payload);
					onSaved("Reason code created successfully");
				} else {
					await updateMechReason(editId, payload);
					onSaved("Reason code updated successfully");
				}
				onClose();
			} catch (err: unknown) {
				setSaveError(err instanceof Error ? err.message : "Save failed");
			}
		},
		[coId, editId, onClose, onSaved],
	);

	const title =
		editId === undefined
			? "Create Reason Code"
			: readOnly
				? "Reason Code"
				: "Edit Reason Code";

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
								minHeight: 220,
							}}
						>
							<CircularProgress />
						</Box>
					) : (
						<Stack spacing={2.5} sx={{ pt: 1 }}>
							{loadError ? <Alert severity="error">{loadError}</Alert> : null}
							{saveError ? <Alert severity="error">{saveError}</Alert> : null}

							<Alert severity="info" sx={{ alignItems: "flex-start" }}>
								{selectedMachineTypeName
									? `This code will only be offered on ${selectedMachineTypeName} machines. Clear the machine type to make it available on every machine.`
									: "Machine type is empty, so this is a global code — it is offered on every machine. Set a machine type to restrict it to that section."}
							</Alert>

							<Box sx={FORM_GRID_2_SX}>
								<Controller
									name="machine_type_id"
									control={control}
									render={({ field }) => (
										<SearchableOptionSelect<number>
											label="Machine Type (section)"
											placeholder="All machine types (global code)"
											options={machineTypeOptions}
											value={field.value ?? ""}
											onChange={(value) => field.onChange(value === "" ? null : value)}
											disabled={disabled}
											error={Boolean(errors.machine_type_id)}
											helperText={
												errors.machine_type_id?.message ??
												"Leave empty to make the code available on every machine."
											}
											fullWidth
										/>
									)}
								/>

								<Controller
									name="reason_code"
									control={control}
									render={({ field }) => (
										<TextField
											{...field}
											label="Reason Code"
											required
											size="small"
											disabled={disabled}
											error={Boolean(errors.reason_code)}
											helperText={
												errors.reason_code?.message ?? "Short code, e.g. RF, BJ, DHGT."
											}
											fullWidth
										/>
									)}
								/>

								<Box sx={{ gridColumn: { xs: "auto", sm: "1 / -1" } }}>
									<Controller
										name="reason_desc"
										control={control}
										render={({ field }) => (
											<TextField
												{...field}
												label="Reason Description"
												required
												size="small"
												disabled={disabled}
												error={Boolean(errors.reason_desc)}
												helperText={errors.reason_desc?.message}
												fullWidth
											/>
										)}
									/>
								</Box>

								<Controller
									name="discipline"
									control={control}
									render={({ field }) => (
										<SearchableOptionSelect<string>
											label="Discipline"
											placeholder="Select discipline"
											options={disciplineOptions}
											value={field.value === "" ? "" : field.value}
											onChange={(value) => field.onChange(value === "" ? "" : value)}
											required
											disabled={disabled}
											error={Boolean(errors.discipline)}
											helperText={errors.discipline?.message}
											fullWidth
										/>
									)}
								/>

								<Controller
									name="component_id"
									control={control}
									render={({ field }) => (
										<SearchableOptionSelect<number>
											label="Failure Component"
											placeholder="None"
											options={componentOptions}
											value={field.value ?? ""}
											onChange={(value) => field.onChange(value === "" ? null : value)}
											disabled={disabled}
											error={Boolean(errors.component_id)}
											helperText={
												errors.component_id?.message ??
												"Defaults onto a breakdown logged with this code."
											}
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
