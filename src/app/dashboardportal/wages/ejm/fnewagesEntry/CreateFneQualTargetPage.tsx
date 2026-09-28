"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
	Alert,
	Box,
	CircularProgress,
	Dialog,
	DialogContent,
	DialogTitle,
	IconButton,
	Snackbar,
	Typography,
} from "@mui/material";
import { X } from "lucide-react";
import { MuiForm } from "@/components/ui/muiform";
import type { MuiFormMode, Schema } from "@/components/ui/muiform";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import {
	fneQualTargetSchema,
	type DepartmentOption,
	type WagesQualityOption,
} from "./types";

type Props = {
	open: boolean;
	onClose: () => void;
	onSaved?: () => void;
	editId?: number;
	departments: DepartmentOption[];
	qualities: WagesQualityOption[];
};

export default function CreateFneQualTargetPage({
	open,
	onClose,
	onSaved,
	editId,
	departments,
	qualities,
}: Props) {
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [mode, setMode] = useState<MuiFormMode>("create");
	const [snackbar, setSnackbar] = useState<{
		open: boolean;
		message: string;
		severity: "success" | "error";
	}>({ open: false, message: "", severity: "success" });
	const [initialValues, setInitialValues] = useState<Record<string, unknown>>({});
	const [formKey, setFormKey] = useState(0);

	const loadData = useCallback(async () => {
		if (editId === undefined) {
			setInitialValues({ dept_id: null, quality_it: null, eff_pc: "" });
			setFormKey((prev) => prev + 1);
			return;
		}

		setLoading(true);
		try {
			const { data, error } = await fetchWithCookie(
				`${apiRoutesPortalMasters.EJM_FNE_QUAL_TARGET_BY_ID}/${editId}`,
				"GET"
			);
			if (error || !data) throw new Error(error || "Failed to load quality target");

			const rec = data.data ?? data;
			setInitialValues({
				dept_id: rec.dept_id ?? null,
				quality_it: rec.quality_it ?? null,
				eff_pc: rec.eff_pc ?? "",
			});
			setFormKey((prev) => prev + 1);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Error loading data";
			setSnackbar({ open: true, message, severity: "error" });
		} finally {
			setLoading(false);
		}
	}, [editId]);

	useEffect(() => {
		if (open) {
			setMode(editId !== undefined ? "edit" : "create");
			loadData();
		} else {
			setInitialValues({});
			setFormKey(0);
		}
	}, [open, editId, loadData]);

	const schema = useMemo<Schema>(
		() => ({
			fields: [
				{
					name: "dept_id",
					label: "Department",
					type: "custom",
					required: true,
					grid: { xs: 12, sm: 6 },
					hideLabel: true,
					render: ({ value, onChange, disabled }) => (
						<SearchableSelect
							variant="outlined"
							label="Department"
							required
							disabled={disabled}
							options={departments}
							value={departments.find((d) => d.dept_id === value) ?? null}
							onChange={(opt) => onChange(opt?.dept_id ?? null)}
							getOptionLabel={(o) => o.dept_desc}
							isOptionEqualToValue={(o, v) => o.dept_id === v.dept_id}
							noOptionsText="No departments for this branch"
						/>
					),
				},
				{
					name: "quality_it",
					label: "Wages Quality",
					type: "custom",
					required: true,
					grid: { xs: 12, sm: 6 },
					hideLabel: true,
					render: ({ value, onChange, disabled }) => (
						<SearchableSelect
							variant="outlined"
							label="Wages Quality"
							required
							disabled={disabled}
							options={qualities}
							value={qualities.find((q) => q.q_code_id === value) ?? null}
							onChange={(opt) => onChange(opt?.q_code_id ?? null)}
							getOptionLabel={(o) => `${o.q_code} — ${o.quality}`}
							isOptionEqualToValue={(o, v) => o.q_code_id === v.q_code_id}
							noOptionsText="No wages qualities for this company/branch"
						/>
					),
				},
				{
					name: "eff_pc",
					label: "Target Efficiency %",
					type: "number",
					required: true,
					grid: { xs: 12, sm: 6 },
				},
			],
		}),
		[departments, qualities]
	);

	const handleSubmit = async (values: Record<string, unknown>) => {
		setSaving(true);
		try {
			const rawPc = values.eff_pc;
			const parsed = fneQualTargetSchema.safeParse({
				dept_id: Number(values.dept_id),
				quality_it: Number(values.quality_it),
				eff_pc:
					rawPc === "" || rawPc === null || rawPc === undefined ? NaN : Number(rawPc),
			});
			if (!parsed.success) throw new Error(parsed.error.issues[0].message);

			const [url, method] =
				editId !== undefined
					? ([`${apiRoutesPortalMasters.EJM_FNE_QUAL_TARGET_EDIT}/${editId}`, "PUT"] as const)
					: ([apiRoutesPortalMasters.EJM_FNE_QUAL_TARGET_CREATE, "POST"] as const);

			const { error } = await fetchWithCookie(url, method, parsed.data);
			if (error) throw new Error(error);

			setSnackbar({
				open: true,
				message:
					editId !== undefined
						? "Quality target updated successfully"
						: "Quality target created successfully",
				severity: "success",
			});
			onSaved?.();
			onClose();
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Save failed";
			setSnackbar({ open: true, message, severity: "error" });
		} finally {
			setSaving(false);
		}
	};

	const dialogTitle =
		editId !== undefined ? "Edit Quality Target" : "Create Quality Target";

	return (
		<>
			<Dialog
				open={open}
				onClose={onClose}
				fullWidth
				maxWidth="md"
				PaperProps={{ sx: { borderRadius: 2 } }}
			>
				<DialogTitle
					sx={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						pb: 1,
					}}
				>
					<Typography variant="h6" component="span">
						{dialogTitle}
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
						<Box sx={{ pt: 1 }}>
							<MuiForm
								key={formKey}
								schema={schema}
								mode={mode}
								initialValues={initialValues}
								onSubmit={handleSubmit}
								submitLabel={saving ? "Saving..." : "Save"}
								cancelLabel="Cancel"
								onCancel={onClose}
								hideModeToggle
							/>
						</Box>
					)}
				</DialogContent>
			</Dialog>

			<Snackbar
				open={snackbar.open}
				autoHideDuration={4000}
				onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
				anchorOrigin={{ vertical: "top", horizontal: "center" }}
			>
				<Alert
					severity={snackbar.severity}
					onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
					sx={{ width: "100%" }}
				>
					{snackbar.message}
				</Alert>
			</Snackbar>
		</>
	);
}
