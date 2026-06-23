"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	Alert,
	Autocomplete,
	Box,
	Button,
	Divider,
	MenuItem,
	Snackbar,
	TextField,
	Typography,
} from "@mui/material";
import { Save as SaveIcon, X as CancelIcon } from "lucide-react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type {
	FinishingEntryRow,
	FinishingEntrySaveBody,
	FinishingParam,
	FinishingSaveResult,
	FinishingSetup,
} from "../types/finishingTypes";
import {
	useFinishingFormSchema,
	type FinishingFormValues,
} from "../hooks/useFinishingFormSchema";
import { paramLabel, type FinishingProcessConfig } from "../_shared/finishingConfig";

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

function buildDefaultValues(paramTokens: string[]): FinishingFormValues {
	const params: Record<string, string> = {};
	for (const token of paramTokens) params[token] = "";
	return {
		machineId: "",
		qualityId: "",
		spellId: "",
		ebId: "",
		inputQty: "",
		prodQty: "",
		wastageKg: "",
		params,
	};
}

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
	const schema = useFinishingFormSchema(setup.param_tokens);

	const {
		control,
		handleSubmit,
		reset,
		setValue,
		getValues,
		watch,
		formState: { errors, isSubmitting },
	} = useForm<FinishingFormValues>({
		resolver: zodResolver(schema),
		defaultValues: buildDefaultValues(setup.param_tokens),
	});

	const [error, setError] = React.useState<string | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);
	const [lastResult, setLastResult] = React.useState<FinishingSaveResult | null>(null);

	// Re-seed the form when the set of param tokens changes (process switch) so
	// the dynamic `params` object always matches the rendered inputs.
	const tokensKey = setup.param_tokens.join(",");
	React.useEffect(() => {
		reset(buildDefaultValues(setup.param_tokens));
		setLastResult(null);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tokensKey, reset]);

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
		const params: Record<string, string> = {};
		for (const token of setup.param_tokens) {
			const found = editingEntry.params.find((p) => p.param === token);
			params[token] = found?.value != null ? String(found.value) : "";
		}
		reset({
			machineId: String(editingEntry.machine_id),
			qualityId: String(editingEntry.finishing_quality_id),
			spellId: String(editingEntry.spell_id),
			ebId: editingEntry.eb_id != null ? String(editingEntry.eb_id) : "",
			inputQty: editingEntry.input_qty != null ? String(editingEntry.input_qty) : "",
			prodQty: editingEntry.prod_qty != null ? String(editingEntry.prod_qty) : "",
			wastageKg: editingEntry.wastage_kg != null ? String(editingEntry.wastage_kg) : "",
			params,
		});
		setError(null);
		setLastResult(null);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editingEntry, tokensKey, reset]);

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

		const params: FinishingParam[] = setup.param_tokens
			.map((token) => {
				const raw = values.params[token];
				return {
					param: token,
					value: raw === "" || raw == null ? null : Number(raw),
				};
			})
			// Only send params the operator actually filled in.
			.filter((p) => p.value != null);

		const body: FinishingEntrySaveBody = {
			co_id: Number(coId),
			branch_id: branchId,
			tran_date: date,
			spell_id: resolvedSpellId,
			process,
			machine_id: Number(values.machineId),
			finishing_quality_id: Number(values.qualityId),
			eb_id: values.ebId !== "" ? Number(values.ebId) : null,
			input_qty: values.inputQty !== "" ? Number(values.inputQty) : null,
			input_uom: config.inputUom,
			prod_qty: Number(values.prodQty),
			prod_uom: config.prodUom,
			wastage_kg: values.wastageKg !== "" ? Number(values.wastageKg) : null,
			params,
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
		setLastResult(result);
		setSnack(
			editing
				? `Updated ${config.title} entry #${result?.finishing_daily_id}`
				: `Saved ${config.title} entry #${result?.finishing_daily_id}`
		);
		// Keep machine/spell for rapid sequential entry; clear the rest.
		const prev = getValues();
		reset({
			...buildDefaultValues(setup.param_tokens),
			machineId: editing ? "" : prev.machineId,
			spellId: prev.spellId,
		});
		if (editing) onCancelEdit();
		onSaved();
	};

	const handleCancelEdit = () => {
		onCancelEdit();
		reset(buildDefaultValues(setup.param_tokens));
		setError(null);
		setLastResult(null);
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
						md: "repeat(3, minmax(0, 1fr))",
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

				{/* Operator (EB) — optional */}
				<Controller
					control={control}
					name="ebId"
					render={({ field }) => (
						<TextField
							select
							label="Operator (EB)"
							value={field.value}
							onChange={(e) => field.onChange(e.target.value)}
							size="small"
							fullWidth
						>
							<MenuItem value="">
								<em>None</em>
							</MenuItem>
							{setup.eb_list.map((eb) => (
								<MenuItem key={eb.eb_id} value={String(eb.eb_id)}>
									{eb.emp_code} — {eb.eb_name}
								</MenuItem>
							))}
						</TextField>
					)}
				/>

				{/* Input qty */}
				<Controller
					control={control}
					name="inputQty"
					render={({ field }) => (
						<TextField
							type="number"
							label={`Input (${config.inputUom})`}
							value={field.value}
							onChange={(e) => field.onChange(e.target.value)}
							size="small"
							fullWidth
							inputProps={{ min: 0, step: "any" }}
							error={!!errors.inputQty}
							helperText={errors.inputQty?.message}
						/>
					)}
				/>

				{/* Prod qty */}
				<Controller
					control={control}
					name="prodQty"
					render={({ field }) => (
						<TextField
							type="number"
							label={`Output (${config.prodUom})`}
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

				{/* Wastage */}
				<Controller
					control={control}
					name="wastageKg"
					render={({ field }) => (
						<TextField
							type="number"
							label="Wastage (kg)"
							value={field.value}
							onChange={(e) => field.onChange(e.target.value)}
							size="small"
							fullWidth
							inputProps={{ min: 0, step: "any" }}
							error={!!errors.wastageKg}
							helperText={errors.wastageKg?.message}
						/>
					)}
				/>
			</Box>

			{/* Dynamic captured process params */}
			{setup.param_tokens.length > 0 ? (
				<>
					<Divider textAlign="left">
						<Typography variant="caption" color="text.secondary">
							Process Parameters
						</Typography>
					</Divider>
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
						{setup.param_tokens.map((token) => (
							<Controller
								key={token}
								control={control}
								name={`params.${token}` as const}
								render={({ field }) => (
									<TextField
										type="number"
										label={paramLabel(token)}
										value={field.value ?? ""}
										onChange={(e) => field.onChange(e.target.value)}
										size="small"
										fullWidth
										inputProps={{ step: "any" }}
										error={!!errors.params?.[token]}
										helperText={errors.params?.[token]?.message}
									/>
								)}
							/>
						))}
					</Box>
				</>
			) : null}

			{/* Server-computed read-only snapshot from the last save */}
			{lastResult ? (
				<Alert severity="success" sx={{ "& .MuiAlert-message": { width: "100%" } }}>
					<Typography variant="subtitle2" sx={{ mb: 0.5 }}>
						Computed (server-authoritative)
					</Typography>
					<Box
						sx={{
							display: "grid",
							gap: 1,
							gridTemplateColumns: {
								xs: "repeat(2, minmax(0, 1fr))",
								sm: "repeat(3, minmax(0, 1fr))",
								md: "repeat(4, minmax(0, 1fr))",
							},
						}}
					>
						<ReadOnlyStat label="Std Speed" value={lastResult.standards.std_speed} />
						<ReadOnlyStat label="Target Speed" value={lastResult.standards.target_speed} />
						<ReadOnlyStat label="P100 Prod" value={lastResult.computed.p100prod} />
						<ReadOnlyStat label="Std Prod" value={lastResult.computed.std_prod} />
						<ReadOnlyStat label="Target Prod" value={lastResult.computed.target_prod} />
						<ReadOnlyStat label="Act Eff %" value={lastResult.computed.act_eff} />
						{lastResult.computed.prod_wt_kg != null ? (
							<ReadOnlyStat label="Prod Wt (kg)" value={lastResult.computed.prod_wt_kg} />
						) : null}
						<ReadOnlyStat
							label="Working Hrs"
							value={lastResult.standards.working_hours}
						/>
					</Box>
				</Alert>
			) : null}

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

function ReadOnlyStat({ label, value }: { label: string; value: number | null }) {
	return (
		<Box>
			<Typography variant="caption" color="text.secondary" display="block">
				{label}
			</Typography>
			<Typography variant="body2" sx={{ fontWeight: 600 }}>
				{value != null ? value : "—"}
			</Typography>
		</Box>
	);
}
