"use client";

import * as React from "react";
import type { TextFieldProps } from "@mui/material/TextField";
import { SearchableSelect } from "./SearchableSelect";

/**
 * @component SearchableOptionSelect
 * @description Primitive-value adapter over {@link SearchableSelect} — the drop-in
 * replacement for `<TextField select>` + `<MenuItem>` and for `FormControl` +
 * `InputLabel` + `<Select>` where form state stores a plain `string`/`number` id
 * rather than an option object.
 *
 * `SearchableSelect` is the canonical dropdown and deals in option *objects*.
 * Most existing call sites keep only the primitive id in state and described
 * their options as `<MenuItem>` children, so this adapter owns the object↔id
 * mapping in one place instead of repeating `find(...) ?? null` at every screen.
 * Like every dropdown in the app it is type-to-filter; see the "Dropdowns" rule
 * in `CLAUDE.md`.
 *
 * Empty selection is represented by `""`, exactly as MUI's `Select` does, so the
 * `onChange` handlers of converted call sites keep working unchanged.
 *
 * @example
 * ```tsx
 * <SearchableOptionSelect
 *   label="Branch"
 *   size="small"
 *   options={branches.map((b) => ({ value: b.branch_id, label: b.branch_name }))}
 *   value={branchId}
 *   onChange={(selectedValue) => setBranchId(selectedValue === "" ? "" : Number(selectedValue))}
 * />
 * ```
 */

/** One entry of a primitive-valued dropdown. */
export interface SearchableOption<TValue extends string | number> {
	value: TValue;
	label: string;
	/** Renders the entry but blocks picking it. */
	disabled?: boolean;
}

export interface SearchableOptionSelectProps<TValue extends string | number> {
	/** Selectable entries. Build them from your data with `.map(...)`. */
	options: ReadonlyArray<SearchableOption<TValue>>;
	/** Currently selected primitive value; `""`/`null`/`undefined` means nothing selected. */
	value: TValue | "" | null | undefined;
	/** Receives the picked primitive value, or `""` when the field is cleared. */
	onChange: (value: TValue | "") => void;
	/** Floating label. */
	label?: React.ReactNode;
	/** Hint shown while nothing is selected (e.g. the old `All` / `None` entry). */
	placeholder?: string;
	required?: boolean;
	error?: boolean;
	helperText?: React.ReactNode;
	disabled?: boolean;
	loading?: boolean;
	/** When false the clear (×) button is hidden — for fields that must hold a value. */
	clearable?: boolean;
	noOptionsText?: string;
	size?: "small" | "medium";
	/** Defaults to false so the field keeps the intrinsic width a `TextField` had. */
	fullWidth?: boolean;
	className?: string;
	id?: string;
	name?: string;
	autoFocus?: boolean;
	/** Styles applied to the underlying input, matching the old `TextField` `sx`. */
	sx?: TextFieldProps["sx"];
	/**
	 * Escape hatch for the underlying `TextField` (e.g. `InputLabelProps`).
	 * Do not override `inputProps`/`slotProps.htmlInput` — the Autocomplete owns those.
	 */
	textFieldProps?: Partial<TextFieldProps>;
}

export function SearchableOptionSelect<TValue extends string | number>({
	options,
	value,
	onChange,
	label,
	placeholder,
	required,
	error,
	helperText,
	disabled,
	loading,
	clearable,
	noOptionsText,
	size = "small",
	fullWidth = false,
	className,
	id,
	name,
	autoFocus,
	sx,
	textFieldProps,
}: SearchableOptionSelectProps<TValue>) {
	const optionList = React.useMemo(() => [...options], [options]);

	const selected = React.useMemo(
		() =>
			value === "" || value === null || value === undefined
				? null
				: (optionList.find((option) => option.value === value) ?? null),
		[optionList, value],
	);

	const handleChange = React.useCallback(
		(option: SearchableOption<TValue> | null) => {
			onChange(option ? option.value : "");
		},
		[onChange],
	);

	return (
		<SearchableSelect<SearchableOption<TValue>>
			variant="outlined"
			options={optionList}
			value={selected}
			onChange={handleChange}
			getOptionLabel={(option) => option.label}
			getOptionKey={(option) => option.value}
			isOptionEqualToValue={(option, current) => option.value === current.value}
			getOptionDisabled={(option) => option.disabled === true}
			label={label}
			placeholder={placeholder}
			required={required}
			error={error}
			helperText={helperText}
			disabled={disabled}
			loading={loading}
			clearable={clearable}
			noOptionsText={noOptionsText}
			size={size}
			fullWidth={fullWidth}
			className={className}
			textFieldProps={{ ...textFieldProps, sx, id, name, autoFocus }}
		/>
	);
}

export default SearchableOptionSelect;
