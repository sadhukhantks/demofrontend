"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	Alert,
	Autocomplete,
	Box,
	Button,
	Snackbar,
	TextField,
} from "@mui/material";
import { Save as SaveIcon, X as CancelIcon } from "lucide-react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type {
	FinishingEntryRow,
	FinishingEntrySaveBody,
	FinishingSaveResult,
	FinishingSetup,
} from "../types/finishingTypes";
import {
	finishingFormSchema,
	type FinishingFormValues,
} from "../hooks/useFinishingFormSchema";
import type { FinishingProcessConfig } from "../_shared/finishingConfig";

type Props = {
	coId: string;
	branchId: number | null;
	process: string;
	config: FinishingProcessConfig;
	setup: FinishingSetup;
	date: string;
	spellId: number | null;
	editingEntry: FinishingEntryRow | null;
	onSaved: () => void;
	onCancelEdit: () => void;
};

const EMPTY_VALUES: FinishingFormValues = {
	machineId: "",
	qualityId: "",
	spellId: "",
	prodQty: "",
};

export default function FinishingEntryForm({
	coId,
	branchId,
	process,
	config,
	setup,
	date,
	spellId,
	editingEntry,
	onSaved,
	onCancelEdit,
}: Props) {
	const editing = editingEntry != null;

	const {
		control,
		handleSubmit,
		reset,
		setValue,
		getValues,
		watch,
		formState: { errors, isSubmitting },
	} = useForm<FinishingFormValues>({
		resolver: zodResolver(finishingFormSchema),
		defaultValues: EMPTY_VALUES,
	});

	const [error, setError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	// Keep the hidden spellId field in sync with the shared spell selector.
	React.useEffect(() => {
		if (spellId != null) {
			setValue("spellId", String(spellId));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [spellId]);

	// Prefill the form when a grid row is lifted into edit mode.
	React.useEffect(() => {
		if (!editingEntry) return;
		reset({
			machineId: String(editingEntry.machine_id),
			qualityId: String(editingEntry.finishing_quality_id),
			spellId: String(editingEntry.spell_id),
			prodQty: editingEntry.prod_qty != null ? String(editingEntry.prod_qty) : "",
		});
		setError(null);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editingEntry, reset]);

	const watchedSpellId = watch("spellId");
	const effectiveSpellId =
		watchedSpellId !== "" ? Number(watchedSpellId) : spellId != null ? spellId : null;

	const onSubmit = async (values: FinishingFormValues) => {
		setError(null);
		if (!date) {
			setError("Select a date.");
			return;
		}
		const resolvedSpellId =
			values.spellId !== "" ? Number(values.spellId) : effectiveSpellId;
		if (resolvedSpellId == null) {
			setError("Select a spell.");
			return;
		}

		const body: FinishingEntrySaveBody = {
			co_id: Number(coId),
			branch_id: branchId,
			tran_date: date,
			spell_id: resolvedSpellId,
			process,
			machine_id: Number(values.machineId),
			finishing_quality_id: Number(values.qualityId),
			prod_qty: Number(values.prodQty),
			prod_uom: config.prodUom,
		};

		const { data, error: err } = await fetchWithCookie<{ data: FinishingSaveResult }>(
			apiRoutesPortalMasters.FINISHING_PROD_ENTRY_SAVE,
			"POST",
			body
		);
		if (err) {
			setError(err);
			return;
		}
		const result = data?.data ?? null;
		setSnack(
			editing
				? `Updated ${config.title} entry #${result?.finishing_daily_id}`
				: `Saved ${config.title} entry #${result?.finishing_daily_id}`
		);
		// Keep machine/spell for rapid sequential entry; clear the rest.
		const prev = getValues();
		reset({
			...EMPTY_VALUES,
			machineId: editing ? "" : prev.machineId,
			spellId: prev.spellId,
		});
		if (editing) onCancelEdit();
		onSaved();
	};

	const handleCancelEdit = () => {
		onCancelEdit();
		reset(EMPTY_VALUES);
		setError(null);
	};

	return (
		<Box
			component="form"
			onSubmit={handleSubmit(onSubmit)}
			sx={{ display: "flex", flexDirection: "column", gap: 2 }}
		>
			<Box
				sx={{
					display: "grid",
					gap: 2,
					gridTemplateColumns: {
						xs: "1fr",
						sm: "repeat(2, minmax(0, 1fr))",
						md: "repeat(4, minmax(0, 1fr))",
					},
				}}
			>
				{/* Machine */}
				<Controller
					control={control}
					name="machineId"
					render={({ field }) => (
						<Autocomplete
							options={setup.machines}
							getOptionLabel={(m) => `${m.mech_code} — ${m.machine_name}`}
							value={
								setup.machines.find((m) => String(m.machine_id) === field.value) ?? null
							}
							onChange={(_, newVal) =>
								field.onChange(newVal ? String(newVal.machine_id) : "")
							}
							size="small"
							fullWidth
							disabled={editing}
							clearOnEscape
							isOptionEqualToValue={(opt, val) => opt.machine_id === val.machine_id}
							renderInput={(params) => (
								<TextField
									{...params}
									label="Machine"
									error={!!errors.machineId}
									helperText={errors.machineId?.message}
								/>
							)}
						/>
					)}
				/>

				{/* Quality */}
				<Controller
					control={control}
					name="qualityId"
					render={({ field }) => (
						<Autocomplete
							options={setup.qualities}
							getOptionLabel={(q) =>
								`${q.fin_quality_code} — ${q.fin_quality_name}`
							}
							value={
								setup.qualities.find(
									(q) => String(q.finishing_quality_id) === field.value
								) ?? null
							}
							onChange={(_, newVal) =>
								field.onChange(newVal ? String(newVal.finishing_quality_id) : "")
							}
							size="small"
							fullWidth
							disabled={editing}
							clearOnEscape
							isOptionEqualToValue={(opt, val) =>
								opt.finishing_quality_id === val.finishing_quality_id
							}
							renderInput={(params) => (
								<TextField
									{...params}
									label="Quality"
									error={!!errors.qualityId}
									helperText={errors.qualityId?.message}
								/>
							)}
						/>
					)}
				/>

				{/* Production figure */}
				<Controller
					control={control}
					name="prodQty"
					render={({ field }) => (
						<TextField
							type="number"
							label={`Production (${config.prodUom})`}
							value={field.value}
							onChange={(e) => field.onChange(e.target.value)}
							size="small"
							fullWidth
							inputProps={{ min: 0, step: "any" }}
							error={!!errors.prodQty}
							helperText={errors.prodQty?.message}
						/>
					)}
				/>
			</Box>

			{error ? (
				<Alert severity="error" onClose={() => setError(null)}>
					{error}
				</Alert>
			) : null}

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
						onClick={handleCancelEdit}
						sx={{ minHeight: 44 }}
					>
						Cancel Edit
					</Button>
				) : null}
				<Button
					type="submit"
					variant="contained"
					startIcon={<SaveIcon size={18} />}
					disabled={isSubmitting}
					sx={{ minHeight: 44, width: { xs: "100%", md: "auto" } }}
				>
					{isSubmitting ? "Saving…" : editing ? "Update" : "Save Entry"}
				</Button>
			</Box>

			<Snackbar
				open={!!snack}
				autoHideDuration={3000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</Box>
	);
}
