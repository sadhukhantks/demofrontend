"use client";

import * as React from "react";
import { Box, Chip, Divider, Typography } from "@mui/material";
import type { WasteItemTotal } from "../types/wasteTypes";
import { formatQty } from "../utils/wasteCalc";

export interface WasteTotalsFooterProps {
	/** Per-waste-item subtotals for the rows currently in the grid. */
	totals: WasteItemTotal[];
	/** Sum of every row's waste_qty for the selected date. */
	grandTotal: number;
}

/**
 * Footer under the day grid: total `waste_qty` grouped by waste type, plus the
 * day's grand total (SPEC §3.1). Colours come from the MUI palette (theme
 * tokens) — nothing is hardcoded.
 */
export default function WasteTotalsFooter({ totals, grandTotal }: WasteTotalsFooterProps) {
	if (totals.length === 0) return null;

	return (
		<Box
			sx={{
				mt: 1.5,
				p: 1.5,
				border: 1,
				borderColor: "divider",
				borderRadius: 1,
				bgcolor: "background.paper",
			}}
		>
			<Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
				Total waste by type (kg)
			</Typography>
			<Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
				{totals.map((t) => (
					<Chip
						key={t.item_id}
						size="small"
						variant="outlined"
						color="primary"
						label={`${t.label}: ${formatQty(t.total)}`}
					/>
				))}
				<Divider flexItem orientation="vertical" sx={{ mx: 0.5 }} />
				<Typography variant="body2" sx={{ fontWeight: 600 }}>
					All types: {formatQty(grandTotal)} kg
				</Typography>
			</Box>
		</Box>
	);
}
