"use client";

import * as React from "react";
import { TextField } from "@mui/material";

interface NumberCellProps {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	/** Accessible label for the input (tables have no visible labels). */
	ariaLabel: string;
}

/**
 * Small right-aligned numeric entry cell used across the gain/loss tables.
 * Values stay raw strings in state; parsing happens at total/save time so
 * partial input ("-", "1.") never fights the user. Negatives are allowed
 * (e.g. Lead Roll).
 */
export default function NumberCell({ value, onChange, disabled, ariaLabel }: NumberCellProps) {
	return (
		<TextField
			type="number"
			size="small"
			value={value}
			disabled={disabled}
			onChange={(e) => onChange(e.target.value)}
			inputProps={{
				step: 0.001,
				"aria-label": ariaLabel,
				style: { textAlign: "right" },
			}}
			sx={{ width: "100%", minWidth: 96 }}
		/>
	);
}
