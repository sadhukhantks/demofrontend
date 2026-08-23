"use client";

import * as React from "react";
import { Autocomplete, TextField } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";

export type FormAutocompleteOption = { value: number | string; label: string };

type Props = {
	label: string;
	value: number | string | "";
	options: FormAutocompleteOption[];
	onChange: (value: number | string | "") => void;
	disabled?: boolean;
	helperText?: string;
	fullWidth?: boolean;
	sx?: SxProps<Theme>;
};

// ponytail: local labeled-outlined wrapper; the shared SearchableSelect is styled
// borderless for grid cells and doesn't fit these forms.
export default function FormAutocomplete({
	label,
	value,
	options,
	onChange,
	disabled,
	helperText,
	fullWidth = true,
	sx,
}: Props) {
	const selected = options.find((o) => o.value === value) ?? null;
	return (
		<Autocomplete
			options={options}
			value={selected}
			onChange={(_, next) => onChange(next ? next.value : "")}
			getOptionLabel={(o) => o.label}
			getOptionKey={(o) => o.value}
			isOptionEqualToValue={(a, b) => a.value === b.value}
			disabled={disabled}
			size="small"
			fullWidth={fullWidth}
			sx={sx}
			openOnFocus
			renderInput={(params) => (
				<TextField {...params} label={label} size="small" helperText={helperText} />
			)}
		/>
	);
}
