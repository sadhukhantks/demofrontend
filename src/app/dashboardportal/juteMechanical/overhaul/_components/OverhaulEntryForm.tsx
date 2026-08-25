"use client";

import * as React from "react";
import { Alert, Box, Button, Chip, Divider, TextField, Typography } from "@mui/material";
import { Save as SaveIcon, X as CancelIcon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import type { MechMachineAttr, MechOverhaulSetup } from "@/utils/juteMechanicalService";
import OverhaulSpareLinesEditor from "./OverhaulSpareLinesEditor";
import type {
	EditableOverhaulSpare,
	OverhaulEnumLike,
	OverhaulFormValues,
} from "../types/overhaulTypes";
import {
	DONE_BY_VENDOR,
	FALLBACK_DONE_BY_OPTIONS,
	FALLBACK_OVERHAUL_TYPES,
	buildDefaultOverhaulFormValues,
	overhaulFormSchema,
} from "../types/overhaulTypes";
import {
	downtimeDays,
	formatAmount,
	nextOverhaulDueISO,
	spareCost,
	totalCost,
} from "../utils/overhaulCalc";

export interface OverhaulEntryFormProps {
	coId: string;
	/** Dropdowns from `/overhaul_create_setup`. */
	setup: MechOverhaulSetup;
	/** machine_id -> maintenance attributes; supplies `overhaul_freq_months`. */
	attrByMachine: ReadonlyMap<number, MechMachineAttr>;
	/** Header being edited, or null while creating. */
	initialValues: OverhaulFormValues | null;
	/** Spare lines of the overhaul being edited, or the empty set while creating. */
	initialSpares: ReadonlyArray<EditableOverhaulSpare>;
	/** True when `initialValues` refers to an existing overhaul. */
	editing: boolean;
	/**
	 * Bumped by the page after a save or when leaving edit mode; any change resets
	 * the form and the spare lines back to `initialValues` / `initialSpares`.
	 */
	resetToken: number;
	submitting: boolean;
	submitError: string | null;
	/** Validated header + spare lines — the page builds the payload and calls the API. */
	onSubmit: (values: OverhaulFormValues, spares: EditableOverhaulSpare[]) => void;
	onCancelEdit: () => void;
}

/**
 * Overhaul header entry.
 *
 * Purely presentational with respect to data: it owns React Hook Form state and the
 * in-progress spare lines, receives every option list through props, and hands
 * validated values back to the page — it never calls the API itself.
 *
 * Two rules from the backend are enforced here so the user never eats a 400:
 *  - `party_id` is required (and only shown) when `done_by = VENDOR`;
 *  - `to_date` may not precede `from_date`.
 *
 * The derived strip under the fields shows the same downtime_days / spare_cost /
 * total_cost the server will compute on save, plus the next-due preview — and, when
 * the machine has no `overhaul_freq_months`, an explicit warning that no due date
 * can be produced. That blank is invisible on the saved record but it keeps the
 * machine off the maintenance-due report forever, so it must not pass silently.
 */
export default function OverhaulEntryForm({
	coId,
	setup,
	attrByMachine,
	initialValues,
	initialSpares,
	editing,
	resetToken,
	submitting,
	submitError,
	onSubmit,
	onCancelEdit,
}: OverhaulEntryFormProps) {
	const [spares, setSpares] = React.useState<EditableOverhaulSpare[]>([...initialSpares]);

	const {
		control,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<OverhaulFormValues>({
		resolver: zodResolver(overhaulFormSchema),
		defaultValues: initialValues ?? buildDefaultOverhaulFormValues(),
		mode: "onBlur",
	});

	// Re-seed on every reset token change (save finished, edit started, edit cancelled).
	React.useEffect(() => {
		reset(initialValues ?? buildDefaultOverhaulFormValues());
		setSpares([...initialSpares]);
		// initialSpares/initialValues are rebuilt by the page alongside resetToken.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [resetToken, reset]);

	const values = useWatch({ control });
	const machineIdValue = values.machine_id ?? "";
	const doneByValue = values.done_by ?? "";
	const fromDateValue = values.from_date ?? "";
	const toDateValue = values.to_date ?? "";
	const labourCostValue = values.labour_cost ?? "";

	const isVendor = doneByValue === DONE_BY_VENDOR;

	// ---- Option lists (declared before every memo that reads them) -------------
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

	const overhaulTypeOptions = React.useMemo(() => {
		const source: ReadonlyArray<OverhaulEnumLike> =
			setup.overhaul_types.length > 0 ? setup.overhaul_types : FALLBACK_OVERHAUL_TYPES;
		return source.map((option) => ({ value: option.code, label: option.label }));
	}, [setup.overhaul_types]);

	const doneByOptions = React.useMemo(() => {
		const source: ReadonlyArray<OverhaulEnumLike> =
			setup.done_by_options.length > 0 ? setup.done_by_options : FALLBACK_DONE_BY_OPTIONS;
		return source.map((option) => ({ value: option.code, label: option.label }));
	}, [setup.done_by_options]);

	const partyOptions = React.useMemo(
		() =>
			setup.parties.map((party) => ({
				value: String(party.party_id),
				label: party.party_name,
			})),
		[setup.parties],
	);

	// ---- Live derivations (mirror the server's own formulas) -------------------
	const selectedAttr = React.useMemo(
		() => (machineIdValue === "" ? null : (attrByMachine.get(Number(machineIdValue)) ?? null)),
		[attrByMachine, machineIdValue],
	);

	const freqMonths = selectedAttr?.overhaul_freq_months ?? null;

	const derivedDowntimeDays = React.useMemo(
		() => downtimeDays(fromDateValue, toDateValue),
		[fromDateValue, toDateValue],
	);

	const derivedSpareCost = React.useMemo(() => spareCost(spares), [spares]);

	const derivedTotalCost = React.useMemo(
		() => totalCost(labourCostValue, derivedSpareCost),
		[labourCostValue, derivedSpareCost],
	);

	const derivedNextDue = React.useMemo(
		() => nextOverhaulDueISO(fromDateValue, toDateValue, freqMonths),
		[fromDateValue, toDateValue, freqMonths],
	);

	const submit = handleSubmit((formValues) => onSubmit(formValues, spares));

	return (
		<Box component="form" onSubmit={submit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
				{editing ? "Edit overhaul" : "Record an overhaul"}
			</Typography>

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
					name="overhaul_type"
					render={({ field }) => (
						<SearchableOptionSelect
							label="Overhaul type"
							required
							size="small"
							fullWidth
							clearable={false}
							disabled={submitting}
							options={overhaulTypeOptions}
							value={field.value}
							onChange={(next) => field.onChange(next === "" ? "" : String(next))}
							error={Boolean(errors.overhaul_type)}
							helperText={errors.overhaul_type?.message}
						/>
					)}
				/>

				<Controller
					control={control}
					name="done_by"
					render={({ field }) => (
						<SearchableOptionSelect
							label="Done by"
							required
							size="small"
							fullWidth
							clearable={false}
							disabled={submitting}
							options={doneByOptions}
							value={field.value}
							onChange={(next) => field.onChange(next === "" ? "" : String(next))}
							error={Boolean(errors.done_by)}
							helperText={errors.done_by?.message}
						/>
					)}
				/>

				<Controller
					control={control}
					name="from_date"
					render={({ field }) => (
						<TextField
							{...field}
							type="date"
							label="From date"
							required
							size="small"
							fullWidth
							disabled={submitting}
							InputLabelProps={{ shrink: true }}
							error={Boolean(errors.from_date)}
							helperText={errors.from_date?.message}
						/>
					)}
				/>

				<Controller
					control={control}
					name="to_date"
					render={({ field }) => (
						<TextField
							{...field}
							type="date"
							label="To date"
							size="small"
							fullWidth
							disabled={submitting}
							InputLabelProps={{ shrink: true }}
							error={Boolean(errors.to_date)}
							helperText={errors.to_date?.message ?? "Leave blank while the machine is still down"}
						/>
					)}
				/>

				<Controller
					control={control}
					name="labour_cost"
					render={({ field }) => (
						<TextField
							{...field}
							type="number"
							label="Labour cost"
							size="small"
							fullWidth
							disabled={submitting}
							inputProps={{ min: 0, step: "any" }}
							error={Boolean(errors.labour_cost)}
							helperText={errors.labour_cost?.message}
						/>
					)}
				/>

				{/*
				 * The vendor picker only exists when the work was outsourced. Rendering it
				 * conditionally (rather than disabling it) keeps the in-house case from
				 * carrying a stale party_id the backend would reject.
				 */}
				{isVendor ? (
					<Controller
						control={control}
						name="party_id"
						render={({ field }) => (
							<SearchableOptionSelect
								label="Vendor"
								required
								size="small"
								fullWidth
								disabled={submitting}
								options={partyOptions}
								value={field.value}
								onChange={(next) => field.onChange(next === "" ? "" : String(next))}
								error={Boolean(errors.party_id)}
								helperText={
									errors.party_id?.message ?? "Required for vendor-executed overhauls"
								}
							/>
						)}
					/>
				) : null}

				<Controller
					control={control}
					name="work_done"
					render={({ field }) => (
						<TextField
							{...field}
							label="Work done"
							size="small"
							fullWidth
							multiline
							minRows={2}
							disabled={submitting}
							error={Boolean(errors.work_done)}
							helperText={errors.work_done?.message}
							sx={{ gridColumn: { xs: "auto", md: "span 2" } }}
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

			<Divider />

			<OverhaulSpareLinesEditor
				coId={coId}
				lines={spares}
				onChange={setSpares}
				disabled={submitting}
			/>

			<Divider />

			{/* Live preview of what the server will store on save. */}
			<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
				<Chip
					size="small"
					variant="outlined"
					label={`Downtime: ${derivedDowntimeDays === null ? "—" : `${derivedDowntimeDays} day${derivedDowntimeDays === 1 ? "" : "s"}`}`}
				/>
				<Chip size="small" variant="outlined" label={`Spare cost: ${formatAmount(derivedSpareCost)}`} />
				<Chip size="small" color="primary" label={`Total cost: ${formatAmount(derivedTotalCost)}`} />
				<Chip
					size="small"
					variant="outlined"
					label={`Next due: ${derivedNextDue ?? "not computable"}`}
				/>
			</Box>

			{machineIdValue !== "" && !freqMonths ? (
				<Alert severity="warning">
					No overhaul interval set for this machine; set it in Maintenance Masters &gt; Machine
					Attributes to track the next due date. The overhaul will still save, but it will have
					no next-due date and the machine will not appear on the maintenance-due report.
				</Alert>
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
						variant="outlined"
						startIcon={<CancelIcon size={18} />}
						onClick={onCancelEdit}
						disabled={submitting}
						sx={{ minHeight: 44 }}
					>
						Cancel edit
					</Button>
				) : null}
				<Button
					type="submit"
					variant="contained"
					startIcon={<SaveIcon size={18} />}
					disabled={submitting}
					sx={{ minHeight: 44, width: { xs: "100%", md: "auto" } }}
				>
					{submitting ? "Saving…" : editing ? "Update overhaul" : "Save overhaul"}
				</Button>
			</Box>
		</Box>
	);
}
