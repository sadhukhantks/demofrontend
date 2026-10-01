"use client";

import React from "react";
import { Box } from "@mui/material";

interface FilterSlotProps {
  /** Width in px from the small breakpoint up. */
  width: number;
  children: React.ReactNode;
}

/**
 * Sizes one control of a wrapping filter row (row gap 16px): two per line on a
 * phone, a fixed width from the small breakpoint up. The width goes on this
 * wrapper and the dropdown inside is `fullWidth` — a percentage on the input
 * itself would resolve against its own content-sized Autocomplete root.
 */
export default function FilterSlot({ width, children }: FilterSlotProps) {
  return <Box sx={{ width: { xs: "calc(50% - 8px)", sm: width } }}>{children}</Box>;
}
