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
	FormControl,
	FormControlLabel,
	FormLabel,
	Radio,
	RadioGroup,
	Switch,
	TextField,
	Typography,
	useMediaQuery,
	useTheme,
} from "@mui/material";
import { DIALOG_ACTIONS_SX } from "@/components/ui/responsiveEntry";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import type {
	DirectIndirect,
	MachineGroupRow,
	NormDepartment,
	NormDesignation,
	NormKind,
	NormMachineType,
	ProdUom,
} from "../_service";
import {
	DIRECT_INDIRECT_OPTIONS,
	NORM_KIND_OPTIONS,
	NORMS_TEXT_MAX,
	PROD_UOM_OPTIONS,
	SCOPE_OPTIONS,
	SHIFT_KEYS,
	SHIFT_LABELS,
	handsPerUnitToUnits,
	pluralUnits,
	unitsToHandsPerUnit,
	type HandsNormForm,
	type NormScope,
} from "../_schema";

export type HandsNormDialogMode = "create" | "revision" | "edit";

/**
 * Create / edit / new-revision form for one hands norm. Presentational: the
 * page owns the form state, validation and saving.
 */
export interface HandsNormDialogProps {
	open: boolean;
	mode: HandsNormDialogMode;
	form: HandsNormForm;
	onChange: (next: HandsNormForm) => void;
	/** Field errors to show (the page passes them only after a save attempt). */
	errors: Partial<Record<keyof HandsNormForm, string>>;
	designations: ReadonlyArray<NormDesignation>;
	machineTypes: ReadonlyArray<NormMachineType>;
	machineGroups: ReadonlyArray<MachineGroupRow>;
	departments: ReadonlyArray<NormDepartment>;
	/** The page's branch — designations of other company branches are labelled. */
	branchId: number | null;
	saving: boolean;
	error: string | null;
	onClose: () => void;
	onSave: () => void;
}

const TITLES: Record<HandsNormDialogMode, string> = {
	create: "New hands norm",
	revision: "New revision",
	edit: "Edit hands norm",
};

const KIND_INFO: Partial<Record<NormKind, string>> = {
	N: "No norm by design: the report leaves the target blank and keeps this designation out of excess / short.",
	A: "As actual: the target equals the hands present in every shift, so excess and short are always 0.",
};

const fmtUnits = (n: number) => String(Number(n.toFixed(3)));

export default function HandsNormDialog({
	open,
	mode,
	form,
	onChange,
	errors,
	designations,
	machineTypes,
	machineGroups,
	departments,
	branchId,
	saving,
	error,
	onClose,
	onSave,
}: HandsNormDialogProps) {
	const theme = useTheme();
	const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

	const designationOptions = React.useMemo(
		() =>
			designations.map((d) => {
				const other = branchId != null && d.branch_id !== branchId && d.branch_name;
				return {
					value: d.designation_id,
					label: `${d.desig ?? `#${d.designation_id}`}${d.dept ? ` — ${d.dept}` : ""}${other ? ` [${d.branch_name}]` : ""}`,
				};
			}),
		[designations, branchId]
	);
	const machineTypeOptions = React.useMemo(
		() =>
			machineTypes.map((m) => ({
				value: m.machine_type_id,
				label: `${m.machine_type_name ?? `Type ${m.machine_type_id}`} (${m.machine_count} machine${m.machine_count === 1 ? "" : "s"})`,
			})),
		[machineTypes]
	);
	const groupOptions = React.useMemo(
		() =>
			machineGroups
				.filter((g) => g.active || g.machine_group_id === form.machine_group_id)
				.map((g) => ({
					value: g.machine_group_id,
					label: `${g.group_name} (${g.member_count} member${g.member_count === 1 ? "" : "s"} · ${fmtUnits(g.total_units)} ${pluralUnits(g.total_units, g.unit_label)})${g.active ? "" : " [retired]"}`,
				})),
		[machineGroups, form.machine_group_id]
	);
	const deptOptions = React.useMemo(
		() => departments.map((d) => ({ value: d.dept_id, label: d.dept_desc ?? `Dept ${d.dept_id}` })),
		[departments]
	);

	const kind = form.norm_kind;
	const scoped = kind === "M" || kind === "P";
	const set = (patch: Partial<HandsNormForm>) => onChange({ ...form, ...patch });

	const pickDesignation = (value: number | "") => {
		const patch: Partial<HandsNormForm> = { designation_id: value };
		// Default Direct/Indirect from the designation master, as the report does.
		if (value !== "" && form.direct_indirect === "") {
			const di = (designations.find((d) => d.designation_id === value)?.direct_indirect ?? "")
				.trim()
				.toUpperCase()
				.charAt(0);
			if (di === "D" || di === "I") patch.direct_indirect = di;
		}
		set(patch);
	};

	const pickKind = (next: NormKind) => {
		// P norms are usually department-scoped (winding); M norms group-scoped.
		// Only the default moves — a scope the user already picked is kept.
		const patch: Partial<HandsNormForm> = { norm_kind: next };
		const noScopeId = form.machine_group_id === "" && form.machine_type_id === "" && form.scope_dept_id === "";
		if (noScopeId && next === "P") patch.scope = "dept";
		if (noScopeId && next === "M") patch.scope = "group";
		set(patch);
	};

	// Picking a scope clears the other two ids: exactly one is ever sent.
	const pickScope = (scope: NormScope) =>
		set({
			scope,
			machine_group_id: scope === "group" ? form.machine_group_id : "",
			machine_type_id: scope === "type" ? form.machine_type_id : "",
			scope_dept_id: scope === "dept" ? form.scope_dept_id : "",
		});

	// "Hands per unit" is the inverse view of units per hand. Keep what the user
	// typed there while it still maps to the stored value (3 -> 0.333 would
	// otherwise read back as 3.003), else show the derived figure.
	const [hpuText, setHpuText] = React.useState("");
	const hpuTyped = hpuText !== "" && handsPerUnitToUnits(hpuText) === form.units_per_hand;
	const handsPerUnit = hpuTyped ? hpuText : unitsToHandsPerUnit(form.units_per_hand);

	const selectedGroup = machineGroups.find((g) => g.machine_group_id === form.machine_group_id);
	const selectedType = machineTypes.find((m) => m.machine_type_id === form.machine_type_id);
	const unitLabel = form.scope === "group" ? selectedGroup?.unit_label ?? "unit" : "machine";
	const units = Number(form.units_per_hand);

	const scopeHelper =
		form.scope === "group"
			? machineGroups.length === 0
				? "No machine groups yet — create one on the Machine groups tab, or scope by machine type / department."
				: selectedGroup && selectedGroup.member_count === 0
					? "This group has no members — the target will be 0."
					: undefined
			: form.scope === "type"
				? selectedType && selectedType.machine_count === 0
					? "This branch has no active machine of this type — the target will be 0."
					: undefined
				: kind === "P"
					? "Production of every machine of the department, plus person-keyed winding doffs of its winders."
					: "Every active machine of the department counts 1 unit.";

	const scopeSelect =
		form.scope === "group" ? (
			<SearchableOptionSelect
				label="Machine group"
				size="small"
				fullWidth
				required
				options={groupOptions}
				value={form.machine_group_id}
				onChange={(v) => set({ machine_group_id: v === "" ? "" : Number(v) })}
				error={!!errors.machine_group_id}
				helperText={errors.machine_group_id ?? scopeHelper}
			/>
		) : form.scope === "type" ? (
			<SearchableOptionSelect
				label="Machine type"
				size="small"
				fullWidth
				required
				options={machineTypeOptions}
				value={form.machine_type_id}
				onChange={(v) => set({ machine_type_id: v === "" ? "" : Number(v) })}
				error={!!errors.machine_type_id}
				helperText={errors.machine_type_id ?? scopeHelper}
			/>
		) : (
			<SearchableOptionSelect
				label="Department"
				size="small"
				fullWidth
				required
				options={deptOptions}
				value={form.scope_dept_id}
				onChange={(v) => set({ scope_dept_id: v === "" ? "" : Number(v) })}
				error={!!errors.scope_dept_id}
				helperText={errors.scope_dept_id ?? scopeHelper}
			/>
		);

	return (
		<Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth fullScreen={fullScreen}>
			<DialogTitle>{TITLES[mode]}</DialogTitle>
			<DialogContent>
				<Box sx={{ display: "grid", gap: 2, mt: 1 }}>
					{mode === "revision" ? (
						<Alert severity="info">
							Saves a new row from the effective date below. The current row stays in force for earlier dates.
						</Alert>
					) : null}
					<SearchableOptionSelect
						label="Designation"
						size="small"
						fullWidth
						required
						disabled={mode !== "create"}
						options={designationOptions}
						value={form.designation_id}
						onChange={(v) => pickDesignation(v === "" ? "" : Number(v))}
						error={!!errors.designation_id}
						helperText={errors.designation_id}
					/>
					<Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
						<TextField
							type="date"
							label="Effective from"
							size="small"
							required
							value={form.effective_date}
							onChange={(e) => set({ effective_date: e.target.value })}
							InputLabelProps={{ shrink: true }}
							error={!!errors.effective_date}
							helperText={errors.effective_date}
						/>
						<SearchableOptionSelect
							label="Direct / Indirect"
							size="small"
							fullWidth
							options={DIRECT_INDIRECT_OPTIONS}
							value={form.direct_indirect}
							onChange={(v) => set({ direct_indirect: v === "" ? "" : (v as DirectIndirect) })}
						/>
					</Box>
					<SearchableOptionSelect
						label="Norm kind"
						size="small"
						fullWidth
						required
						clearable={false}
						options={NORM_KIND_OPTIONS}
						value={form.norm_kind}
						onChange={(v) => pickKind((v === "" ? "F" : v) as NormKind)}
					/>

					{scoped ? (
						<>
							<FormControl>
								<FormLabel sx={{ fontSize: 14 }}>Scope</FormLabel>
								<RadioGroup
									row
									value={form.scope}
									onChange={(_e, v) => pickScope(v as NormScope)}
									sx={{ gap: 1, "& .MuiFormControlLabel-root": { minHeight: 40 } }}
								>
									{SCOPE_OPTIONS.map((o) => (
										<FormControlLabel key={o.value} value={o.value} control={<Radio size="small" />} label={o.label} />
									))}
								</RadioGroup>
							</FormControl>
							{scopeSelect}
						</>
					) : null}

					{kind === "M" ? (
						<Box>
							<Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
								<TextField
									type="number"
									label="Units per hand"
									size="small"
									required
									inputProps={{ step: 0.001, min: 0 }}
									value={form.units_per_hand}
									onChange={(e) => set({ units_per_hand: e.target.value })}
									error={!!errors.units_per_hand}
									helperText={
										errors.units_per_hand ??
										(units > 0 ? `1 hand per ${fmtUnits(units)} ${pluralUnits(units, unitLabel)}` : `e.g. 2 for 1 hand per 2 ${pluralUnits(2, unitLabel)}`)
									}
								/>
								<TextField
									type="number"
									label="or: hands per unit"
									size="small"
									inputProps={{ step: 0.0001, min: 0 }}
									value={handsPerUnit}
									onChange={(e) => {
										setHpuText(e.target.value);
										set({ units_per_hand: handsPerUnitToUnits(e.target.value) });
									}}
									helperText={`e.g. 0.5 for half a hand per ${unitLabel}`}
								/>
							</Box>
							<Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
								Target = Σ units of the machines that ran in the shift ÷ units per hand.
							</Typography>
						</Box>
					) : kind === "P" ? (
						<Box>
							<Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr" } }}>
								<TextField
									type="number"
									label="Qty per hand per shift"
									size="small"
									required
									inputProps={{ step: 0.001, min: 0 }}
									value={form.qty_per_hand}
									onChange={(e) => set({ qty_per_hand: e.target.value })}
									error={!!errors.qty_per_hand}
									helperText={errors.qty_per_hand ?? "e.g. 315 kg per winder per shift"}
								/>
								<SearchableOptionSelect
									label="Unit"
									size="small"
									fullWidth
									required
									options={PROD_UOM_OPTIONS}
									value={form.qty_uom}
									onChange={(v) => set({ qty_uom: v === "" ? "" : (v as ProdUom) })}
									error={!!errors.qty_uom}
									helperText={errors.qty_uom}
								/>
							</Box>
							<Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
								Target = production of the scope in the shift ÷ qty per hand. Cuts are weaving only.
							</Typography>
						</Box>
					) : kind === "F" ? (
						<Box>
							<Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
								Target hands per shift
							</Typography>
							<Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" } }}>
								{SHIFT_KEYS.map((k) => (
									<TextField
										key={k}
										type="number"
										label={SHIFT_LABELS[k]}
										size="small"
										inputProps={{ step: 0.5, min: 0 }}
										value={form[k]}
										onChange={(e) => set({ [k]: e.target.value } as Partial<HandsNormForm>)}
										error={!!errors[k]}
										helperText={errors[k]}
									/>
								))}
							</Box>
						</Box>
					) : (
						<Alert severity="info">{KIND_INFO[kind]}</Alert>
					)}

					<TextField
						label="Norms text"
						size="small"
						value={form.norms_text}
						onChange={(e) => set({ norms_text: e.target.value })}
						inputProps={{ maxLength: NORMS_TEXT_MAX }}
						error={!!errors.norms_text}
						helperText={errors.norms_text ?? "Free text shown on the report, e.g. \"2 MC = 1 HAND\""}
					/>
					{mode === "edit" ? (
						<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
							<Typography variant="body2">Active</Typography>
							<Switch checked={form.active === 1} onChange={(e) => set({ active: e.target.checked ? 1 : 0 })} />
						</Box>
					) : null}
					{error ? <Alert severity="error">{error}</Alert> : null}
				</Box>
			</DialogContent>
			<DialogActions sx={DIALOG_ACTIONS_SX}>
				<Button onClick={onClose} disabled={saving}>
					Cancel
				</Button>
				<Button variant="contained" onClick={onSave} disabled={saving}>
					{saving ? "Saving..." : "Save"}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
