"use client";

import * as React from "react";
import { Box, Chip, Divider, Typography } from "@mui/material";
import type { FinishingStockRow } from "@/utils/finishingStockService";
import { footerTotals, formatMt } from "../utils/stockCalc";

export interface StockTotalsFooterProps {
	/** The rows currently in the grid — totals are computed client-side from
	 * them (mirroring the server formula) so the footer always matches what is
	 * on screen. */
	rows: FinishingStockRow[];
}

/**
 * Footer under the day grid: bale MT split own / other owners, loose MT, and
 * the day's total. Chips are always rendered, so a zero bucket reads as
 * "counted, none on hand" rather than vanishing.
 */
export default function StockTotalsFooter({ rows }: StockTotalsFooterProps) {
	const totals = React.useMemo(() => footerTotals(rows), [rows]);

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
				Total stock (MT)
			</Typography>
			<Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
				<Chip
					size="small"
					variant="outlined"
					color="primary"
					label={`Bales (own): ${formatMt(totals.baleOwnMt)}`}
				/>
				<Chip
					size="small"
					variant="outlined"
					color="primary"
					label={`Bales (others): ${formatMt(totals.baleOthersMt)}`}
				/>
				<Chip
					size="small"
					variant="outlined"
					color="primary"
					label={`Loose: ${formatMt(totals.looseMt)}`}
				/>
				<Divider flexItem orientation="vertical" sx={{ mx: 0.5 }} />
				<Typography variant="body2" sx={{ fontWeight: 600 }}>
					Total: {formatMt(totals.totalMt)} MT
				</Typography>
			</Box>
		</Box>
	);
}
