"use client";

import { Box, TextField } from "@mui/material";
import { Controller, type Control, type FieldErrors } from "react-hook-form";
import { BACKDATE_DAYS_MAX, laterOf, minBackdateISO } from "@/utils/backdate";
import { INSPECTION_REF_MAX, INSPECTION_REMARKS_MAX, INSPECTOR_MAX, type InspectFormValues } from "./inspectSchema";

export interface InspectFormFieldsProps {
	control: Control<InspectFormValues>;
	errors: FieldErrors<InspectFormValues>;
	disabled: boolean;
	/** Latest allowed inspection date (today). */
	maxDate: string;
	/** Earliest sensible date — the latest press date among the selected bales; null when unknown. */
	minDate: string | null;
}

/**
 * @component InspectFormFields
 * @description The four "Mark inspected" inputs (date, certificate / reference
 * no, inspector, remarks) wired to a react-hook-form `control` built with
 * `inspectSchema`. Shared by `MarkInspectedDialog` and `BaleInspectQuickDialog`
 * so the two entry points cannot drift.
 */
export default function InspectFormFields({ control, errors, disabled, maxDate, minDate }: InspectFormFieldsProps) {
	return (
		<Box
			sx={{
				display: "grid",
				gap: 2,
				gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
			}}
		>
			<Controller
				name="inspection_date"
				control={control}
				render={({ field }) => (
					<TextField
						{...field}
						type="date"
						label="Inspection date"
						size="small"
						required
						fullWidth
						disabled={disabled}
						error={!!errors.inspection_date}
						helperText={
							errors.inspection_date?.message ??
							(minDate
								? `Not before the last press date of the selection (${minDate}); up to ${BACKDATE_DAYS_MAX} days back`
								: `Up to ${BACKDATE_DAYS_MAX} days back`)
						}
						slotProps={{
							inputLabel: { shrink: true },
							htmlInput: { min: laterOf(minDate, minBackdateISO()), max: maxDate },
						}}
					/>
				)}
			/>
			<Controller
				name="inspection_ref"
				control={control}
				render={({ field }) => (
					<TextField
						{...field}
						label="Certificate / inspection ref"
						size="small"
						fullWidth
						disabled={disabled}
						error={!!errors.inspection_ref}
						helperText={errors.inspection_ref?.message ?? "Optional — inspection note or certificate no"}
						slotProps={{ htmlInput: { maxLength: INSPECTION_REF_MAX } }}
					/>
				)}
			/>
			<Controller
				name="inspector"
				control={control}
				render={({ field }) => (
					<TextField
						{...field}
						label="Inspector / agency"
						size="small"
						fullWidth
						disabled={disabled}
						error={!!errors.inspector}
						helperText={errors.inspector?.message ?? "Optional"}
						slotProps={{ htmlInput: { maxLength: INSPECTOR_MAX } }}
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
						fullWidth
						disabled={disabled}
						error={!!errors.remarks}
						helperText={errors.remarks?.message}
						slotProps={{ htmlInput: { maxLength: INSPECTION_REMARKS_MAX } }}
					/>
				)}
			/>
		</Box>
	);
}
