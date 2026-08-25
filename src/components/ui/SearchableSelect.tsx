"use client";

import * as React from "react";
import type { FilterOptionsState } from "@mui/material";
import Autocomplete, {
  createFilterOptions,
  type AutocompleteProps,
} from "@mui/material/Autocomplete";
import Checkbox from "@mui/material/Checkbox";
import TextField, { type TextFieldProps } from "@mui/material/TextField";

/**
 * Visual presentation of the input.
 *
 * - `bare` — no border/outline; used inside DataGrid cells and line-item tables
 *   where the surrounding cell already provides the frame. This is the historic
 *   look of the transaction `SearchableSelect` and stays the default so existing
 *   call sites are unchanged.
 * - `outlined` — a normal bordered form field with a floating label, the drop-in
 *   replacement for `FormControl` + `InputLabel` + MUI `Select`.
 */
export type SearchableSelectVariant = "bare" | "outlined";

/**
 * Cap on rendered options. MUI's Autocomplete renders a DOM node per matching
 * option, so an unfiltered master list (items, parties, ledgers) can mount
 * thousands of nodes and freeze the dropdown. Typing narrows the list, which is
 * exactly what the searchable-dropdown standard is for.
 */
const OPTION_RENDER_LIMIT = 200;

const limitedFilter = createFilterOptions<unknown>({ limit: OPTION_RENDER_LIMIT });

/**
 * Shared filter plus the type-ahead autofill behaviour every dropdown gets.
 *
 * Two MUI props do the autofilling, and neither is on by default:
 *
 *   `autoComplete`  completes the typed text inline with the first match, so the
 *                   rest of "SPREADER 3" appears as you type "SPR".
 *   `autoHighlight` highlights that first match, which is what lets Enter commit
 *                   it without arrowing down first.
 *
 * `autoHighlight` alone is unsafe for this app: it makes Enter accept the first
 * of SEVERAL matches, so typing "FRAME 1" and hitting Enter silently picks
 * "FRAME 12" when the operator meant "FRAME 13". A mis-keyed machine on a
 * production or breakdown entry is a genuinely costly mistake and an invisible
 * one.
 *
 * So Enter is swallowed unless the filter left EXACTLY ONE option. One match is
 * unambiguous and commits instantly; zero or several fall back to the previous
 * behaviour, where Enter does nothing and the operator picks deliberately. This
 * is the guard the spinning doff-entry form arrived at (`useEnterOnSingleMatch`);
 * it belongs here so all ~310 dropdowns share it rather than one screen having it.
 *
 * `selectOnFocus` and `handleHomeEndKeys` are already MUI defaults for
 * non-freeSolo Autocompletes, so they need no wiring.
 */
function useTypeAheadFilter<TOption>() {
  // Live count of what the last filter pass left, read by the Enter guard.
  // A ref, not state: it is written during render-time filtering and only read
  // in an event handler, so it must never itself trigger a re-render.
  const matchCount = React.useRef(0);

  const filterOptions = React.useMemo(
    () =>
      ((options: unknown[], state: FilterOptionsState<unknown>) => {
        const result = limitedFilter(options, state);
        matchCount.current = result.length;
        return result;
      }) as unknown as NonNullable<
        AutocompleteProps<TOption, boolean, false, false>["filterOptions"]
      >,
    [],
  );

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent & { defaultMuiPrevented?: boolean }) => {
      if (event.key === "Enter" && matchCount.current !== 1) {
        // MUI checks `defaultMuiPrevented`, not `defaultPrevented`, to bail out
        // of its own key handling (useAutocomplete calls our handler first).
        event.defaultMuiPrevented = true;
      }
    },
    [],
  );

  return { filterOptions, onKeyDown };
}

/** Input styling shared by both the single- and multi-select variants. */
function buildInputSx(variant: SearchableSelectVariant, sx: TextFieldProps["sx"]) {
  if (variant === "outlined") {
    return sx;
  }
  return {
    "& .MuiInputBase-root": {
      backgroundColor: "transparent",
      border: "none",
      boxShadow: "none",
      "&:hover": {
        border: "none",
        boxShadow: "none",
      },
      "&.Mui-focused": {
        border: "1px solid #3b82f6",
        boxShadow: "0 0 0 1px #3b82f6",
      },
      "& fieldset": {
        border: "none",
      },
    },
    "& .MuiOutlinedInput-input": {
      py: 0.5,
      px: 1,
      fontSize: "0.875rem",
      lineHeight: "1.25rem",
    },
    ...(sx as object),
  } as TextFieldProps["sx"];
}

export type SearchableSelectProps<TOption> = {
  options: readonly TOption[];
  value: TOption | null;
  onChange: (option: TOption | null) => void;
  getOptionLabel?: AutocompleteProps<TOption, false, false, false>["getOptionLabel"];
  getOptionKey?: AutocompleteProps<TOption, false, false, false>["getOptionKey"];
  isOptionEqualToValue?: AutocompleteProps<TOption, false, false, false>["isOptionEqualToValue"];
  getOptionDisabled?: AutocompleteProps<TOption, false, false, false>["getOptionDisabled"];
  placeholder?: string;
  /** Floating label. Only rendered by the `outlined` variant. */
  label?: React.ReactNode;
  required?: boolean;
  error?: boolean;
  helperText?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  noOptionsText?: string;
  textFieldProps?: Partial<TextFieldProps>;
  className?: string;
  fullWidth?: boolean;
  clearOnEscape?: boolean;
  /** When false the clear (×) button is hidden — for fields that must hold a value. */
  clearable?: boolean;
  variant?: SearchableSelectVariant;
  size?: "small" | "medium";
};

/**
 * The canonical dropdown for the whole app: always type-to-filter (autofill),
 * never selection-only.
 *
 * Every dropdown in VoWERP3 — including two-option ones like Active/Inactive —
 * must use this (or {@link SearchableMultiSelect}) rather than a raw MUI
 * `Select`, so users never have to guess whether a given dropdown lets them
 * type. See the "Dropdowns" rule in `CLAUDE.md`.
 *
 * @example Drop-in for a labelled form Select
 * ```tsx
 * <SearchableSelect
 *   variant="outlined"
 *   label="Branch"
 *   options={branches}
 *   value={branches.find((b) => b.branch_id === value) ?? null}
 *   onChange={(opt) => setValue(opt?.branch_id ?? null)}
 *   getOptionLabel={(o) => o.branch_name}
 *   isOptionEqualToValue={(o, v) => o.branch_id === v.branch_id}
 * />
 * ```
 */
export function SearchableSelect<TOption>({
  options,
  value,
  onChange,
  getOptionLabel,
  getOptionKey,
  isOptionEqualToValue,
  getOptionDisabled,
  placeholder,
  label,
  required,
  error,
  helperText,
  disabled,
  loading,
  noOptionsText,
  textFieldProps,
  className,
  fullWidth = true,
  clearOnEscape = true,
  clearable = true,
  variant = "bare",
  size,
}: SearchableSelectProps<TOption>) {
  const {
    sx,
    size: textFieldSize,
    placeholder: overridePlaceholder,
    ...restTextFieldProps
  } = textFieldProps ?? {};
  const { filterOptions, onKeyDown: typeAheadKeyDown } = useTypeAheadFilter<TOption>();

  return (
    <Autocomplete<TOption, false, boolean, false>
      options={options}
      value={value}
      onChange={(_, next) => onChange(next)}
      getOptionLabel={getOptionLabel}
      getOptionKey={getOptionKey}
      isOptionEqualToValue={isOptionEqualToValue}
      getOptionDisabled={getOptionDisabled}
      filterOptions={filterOptions}
      disabled={disabled}
      loading={loading}
      noOptionsText={noOptionsText ?? "No options"}
      clearOnEscape={clearOnEscape}
      disableClearable={!clearable}
      className={className}
      fullWidth={fullWidth}
      size={size ?? textFieldSize ?? "small"}
      openOnFocus
      autoComplete
      autoHighlight
      onKeyDown={typeAheadKeyDown}
      renderInput={(params) => (
        <TextField
          {...params}
          {...restTextFieldProps}
          label={variant === "outlined" ? label : restTextFieldProps.label}
          required={required}
          error={error}
          helperText={helperText}
          placeholder={overridePlaceholder ?? placeholder}
          size={size ?? textFieldSize ?? "small"}
          sx={buildInputSx(variant, sx)}
        />
      )}
    />
  );
}

export type SearchableMultiSelectProps<TOption> = Omit<
  SearchableSelectProps<TOption>,
  "value" | "onChange" | "clearable"
> & {
  value: TOption[];
  onChange: (options: TOption[]) => void;
  /** Keeps the menu open after each pick, so several options can be ticked in one go. */
  keepOpenOnSelect?: boolean;
  limitTags?: number;
};

/**
 * Multi-select counterpart of {@link SearchableSelect} — same type-to-filter
 * behaviour, with checkboxes and chips.
 */
export function SearchableMultiSelect<TOption>({
  options,
  value,
  onChange,
  getOptionLabel,
  getOptionKey,
  isOptionEqualToValue,
  getOptionDisabled,
  placeholder,
  label,
  required,
  error,
  helperText,
  disabled,
  loading,
  noOptionsText,
  textFieldProps,
  className,
  fullWidth = true,
  clearOnEscape = true,
  variant = "bare",
  size,
  keepOpenOnSelect = true,
  limitTags = 3,
}: SearchableMultiSelectProps<TOption>) {
  const {
    sx,
    size: textFieldSize,
    placeholder: overridePlaceholder,
    ...restTextFieldProps
  } = textFieldProps ?? {};
  const { filterOptions, onKeyDown: typeAheadKeyDown } = useTypeAheadFilter<TOption>();

  return (
    <Autocomplete<TOption, true, false, false>
      multiple
      disableCloseOnSelect={keepOpenOnSelect}
      limitTags={limitTags}
      options={options}
      value={value}
      onChange={(_, next) => onChange([...next])}
      getOptionLabel={getOptionLabel}
      getOptionKey={getOptionKey}
      isOptionEqualToValue={isOptionEqualToValue}
      getOptionDisabled={getOptionDisabled}
      filterOptions={filterOptions}
      disabled={disabled}
      loading={loading}
      noOptionsText={noOptionsText ?? "No options"}
      clearOnEscape={clearOnEscape}
      className={className}
      fullWidth={fullWidth}
      size={size ?? textFieldSize ?? "small"}
      openOnFocus
      autoComplete
      autoHighlight
      onKeyDown={typeAheadKeyDown}
      renderOption={(props, option, { selected }) => {
        const { key, ...optionProps } = props as React.HTMLAttributes<HTMLLIElement> & {
          key: React.Key;
        };
        return (
          <li key={key} {...optionProps}>
            <Checkbox size="small" checked={selected} sx={{ mr: 1, p: 0.5 }} />
            {getOptionLabel ? getOptionLabel(option) : String(option)}
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          {...restTextFieldProps}
          label={variant === "outlined" ? label : restTextFieldProps.label}
          required={required}
          error={error}
          helperText={helperText}
          placeholder={overridePlaceholder ?? placeholder}
          size={size ?? textFieldSize ?? "small"}
          sx={buildInputSx(variant, sx)}
        />
      )}
    />
  );
}
