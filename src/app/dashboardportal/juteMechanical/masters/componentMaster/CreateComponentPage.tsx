"use client";

/**
 * Create / edit / view dialog for a failure component.
 *
 * `component_group` is deliberately free text rather than a dropdown: the column
 * is an open VARCHAR and new groups get coined as new plant is added. The groups
 * already in use are offered as a hint so spellings stay consistent.
 */

import React, { useCallback, useEffect, useState } from "react";
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
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import {
	createMechComponent,
	fetchMechComponentById,
	updateMechComponent,
	type MechComponentPayload,
} from "@/utils/juteMechanicalService";

/** See the note in CreateReasonPage — `active` rides along with the payload. */
type ComponentSavePayload = MechComponentPayload & { active: number };

const componentFormSchema = z.object({
	component_name: z
		.string()
		.min(1, "Component name is required")
		.max(100, "Component name cannot exceed 100 characters"),
	component_group: z.string().max(50, "Group cannot exceed 50 characters"),
	remarks: z.string().max(255, "Remarks cannot exceed 255 characters"),
	active: z.union([z.literal(0), z.literal(1)]),
});

type ComponentFormValues = z.infer<typeof componentFormSchema>;

const EMPTY_FORM: ComponentFormValues = {
	component_name: "",
	component_group: "",
	remarks: "",
	active: 1,
};

const ACTIVE_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
	{ value: 1, label: "Active" },
	{ value: 0, label: "Inactive" },
];

export interface CreateComponentPageProps {
	open: boolean;
	onClose: () => void;
	/** Called after a successful save, with the message to surface on the list. */
	onSaved: (message: string) => void;
	/** Omitted for a new component; the `component_id` when editing or viewing one. */
	editId?: number;
	coId: number;
	/** Groups already in use, shown as a spelling hint under the group field. */
	knownGroups: readonly string[];
	/** View mode — every field disabled and no save button. */
	readOnly?: boolean;
}

export default function CreateComponentPage({
	open,
	onClose,
	onSaved,
	editId,
	coId,
	knownGroups,
	readOnly = false,
}: CreateComponentPageProps) {
	const [loading, setLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

	const {
		control,
		handleSubmit,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<ComponentFormValues>({
		resolver: zodResolver(componentFormSchema),
		defaultValues: EMPTY_FORM,
	});

	const loadDetail = useCallback(async () => {
		setSaveError(null);
		setLoadError(null);
		if (editId === undefined) {
			reset(EMPTY_FORM);
			return;
		}
		setLoading(true);
		try {
			const record = await fetchMechComponentById(editId, coId);
			reset({
				component_name: record.component_name ?? "",
				component_group: record.component_group ?? "",
				remarks: record.remarks ?? "",
				active: record.active === 0 ? 0 : 1,
			});
		} catch (err: unknown) {
			setLoadError(err instanceof Error ? err.message : "Error loading the component");
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

	const onSubmit = useCallback(
		async (values: ComponentFormValues) => {
			setSaveError(null);
			const group = values.component_group.trim();
			const remarks = values.remarks.trim();
			const payload: ComponentSavePayload = {
				co_id: coId,
				component_name: values.component_name.trim(),
				component_group: group === "" ? null : group,
				remarks: remarks === "" ? null : remarks,
				active: values.active,
			};

			try {
				if (editId === undefined) {
					await createMechComponent(payload);
					onSaved("Component created successfully");
				} else {
					await updateMechComponent(editId, payload);
					onSaved("Component updated successfully");
				}
				onClose();
			} catch (err: unknown) {
				setSaveError(err instanceof Error ? err.message : "Save failed");
			}
		},
		[coId, editId, onClose, onSaved],
	);

	const groupHint =
		knownGroups.length > 0
			? `Already in use: ${knownGroups.join(", ")}`
			: "e.g. Transmission, Bearing, Roller, Electrical, Hydraulic, Structural";

	const title =
		editId === undefined
			? "Create Component"
			: readOnly
				? "Component"
				: "Edit Component";

	const disabled = readOnly || isSubmitting;

	return (
		<Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
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
								minHeight: 200,
							}}
						>
							<CircularProgress />
						</Box>
					) : (
						<Stack spacing={2.5} sx={{ pt: 1 }}>
							{loadError ? <Alert severity="error">{loadError}</Alert> : null}
							{saveError ? <Alert severity="error">{saveError}</Alert> : null}

							<Controller
								name="component_name"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="Component Name"
										required
										size="small"
										disabled={disabled}
										error={Boolean(errors.component_name)}
										helperText={errors.component_name?.message}
										fullWidth
									/>
								)}
							/>

							<Controller
								name="component_group"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="Component Group"
										size="small"
										disabled={disabled}
										error={Boolean(errors.component_group)}
										helperText={errors.component_group?.message ?? groupHint}
										fullWidth
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
										multiline
										minRows={2}
										disabled={disabled}
										error={Boolean(errors.remarks)}
										helperText={errors.remarks?.message}
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
						</Stack>
					)}
				</DialogContent>

				<DialogActions sx={{ px: 3, py: 2 }}>
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
