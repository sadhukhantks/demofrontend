"use client";

import { useState, useEffect } from "react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { AssignmentValue } from "./types";

type AssignmentOption = { label: string; value: AssignmentValue };

interface AssignmentDropdownProps {
  itemId: string;
  value: AssignmentValue;
  onChange: (value: AssignmentValue) => void;
  options: AssignmentOption[];
}

/**
 * @component AssignmentDropdown
 * @description Per-menu-item assignment picker used inside the expandable menu
 * table. Type-to-filter (see the "Dropdowns" rule in CLAUDE.md); it reports the
 * option's `value` (`string | null`), never the option object, so callers are
 * unchanged.
 * @example
 * <AssignmentDropdown itemId={item.id} value={assignment} onChange={handleAssign} options={opts} />
 */
export function AssignmentDropdown({
  itemId,
  value,
  onChange,
  options
}: AssignmentDropdownProps) {
  const [selectedValue, setSelectedValue] = useState<AssignmentValue>(value);

  // Handle selection change
  const handleChange = (option: AssignmentOption | null) => {
    const newValue = option ? option.value : null;
    setSelectedValue(newValue);
    onChange(newValue);
  };

  // Update internal state when prop changes
  useEffect(() => {
    setSelectedValue(value);
  }, [value]);

  const selectedOption =
    options.find((option) => option.value === selectedValue) ?? null;

  return (
    <SearchableSelect<AssignmentOption>
      variant="outlined"
      className="w-[140px]"
      fullWidth={false}
      options={options}
      value={selectedOption}
      onChange={handleChange}
      getOptionLabel={(option) => option.label}
      // `value` can be null (the "not assigned" option), so the key is built
      // from the row id plus the option's own value.
      getOptionKey={(option) => `${itemId}-${option.value ?? "null"}`}
      isOptionEqualToValue={(option, selected) => option.value === selected.value}
      placeholder="Not assigned"
      clearable={false}
    />
  );
}
