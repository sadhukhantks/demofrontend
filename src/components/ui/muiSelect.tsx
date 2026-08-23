"use client";

import * as React from 'react';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import {
  SearchableSelect,
  SearchableMultiSelect,
} from '@/components/ui/SearchableSelect';

interface Option {
  value: string | number;
  label: string;
}

interface MuiSelectProps {
  label?: string;
  options: Option[];
  value: string | number | Array<string | number>;
  onChange: (value: string | number | Array<string | number>) => void;
  multiple?: boolean;
  placeholder?: string;
  disabled?: boolean;
  minWidth?: number;
  sx?: SxProps<Theme>;
}

const getOptionLabel = (option: Option) => option.label;
const getOptionKey = (option: Option) => option.value;
const isOptionEqualToValue = (option: Option, selected: Option) =>
  option.value === selected.value;

/**
 * @component MuiSelect
 * @description Labelled dropdown for single or multiple selection. Backed by
 * {@link SearchableSelect} / {@link SearchableMultiSelect}, so it is always
 * type-to-filter (see the "Dropdowns" rule in CLAUDE.md). Callers keep working
 * with primitive ids: `value` / `onChange` deal in `string | number` (or an
 * array of them for `multiple`), never option objects — the mapping happens
 * inside this component.
 * @example
 * <MuiSelect
 *   label="Company"
 *   options={companies.map((c) => ({ value: c.co_id, label: c.co_name }))}
 *   value={selectedCompanyId ?? ''}
 *   onChange={(val) => setCompanyId(Number(val))}
 *   placeholder="Select Company"
 * />
 */
const MuiSelect: React.FC<MuiSelectProps> = ({
  label,
  options,
  value,
  onChange,
  multiple = false,
  placeholder = '',
  disabled = false,
  minWidth = 200,
  sx,
}) => {
  // The wrapper carries the sizing/`sx` the FormControl used to carry, so call
  // sites that style descendants (e.g. `& .MuiInputBase-input`) keep working.
  const wrapperSx = { width: '100%', minWidth, ...(sx as object) } as SxProps<Theme>;

  if (multiple) {
    const selectedValues = Array.isArray(value) ? value : value === '' || value === undefined ? [] : [value];
    const selectedOptions = options.filter((option) =>
      selectedValues.includes(option.value),
    );

    return (
      <Box sx={wrapperSx}>
        <SearchableMultiSelect<Option>
          variant="outlined"
          label={label}
          options={options}
          value={selectedOptions}
          onChange={(picked) => onChange(picked.map((option) => option.value))}
          getOptionLabel={getOptionLabel}
          getOptionKey={getOptionKey}
          isOptionEqualToValue={isOptionEqualToValue}
          placeholder={placeholder}
          disabled={disabled}
        />
      </Box>
    );
  }

  const singleValue = Array.isArray(value) ? value[0] : value;
  const selectedOption =
    options.find((option) => option.value === singleValue) ?? null;

  return (
    <Box sx={wrapperSx}>
      <SearchableSelect<Option>
        variant="outlined"
        label={label}
        options={options}
        value={selectedOption}
        // The MUI Select this replaced had no clear button; keeping it off means
        // the only behaviour change is that the field can now be typed into.
        clearable={false}
        onChange={(option) => onChange(option ? option.value : '')}
        getOptionLabel={getOptionLabel}
        getOptionKey={getOptionKey}
        isOptionEqualToValue={isOptionEqualToValue}
        placeholder={placeholder}
        disabled={disabled}
      />
    </Box>
  );
};

export default MuiSelect;
export type { MuiSelectProps, Option as MuiSelectOption };
