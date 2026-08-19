"use client";

import * as React from "react";
import { Box, Chip, Divider, Typography } from "@mui/material";
import { BUCKET_LABELS, formatMt } from "../utils/stockCalc";

export interface StockTotalsFooterProps {
	/** MT total per bucket for the rows currently in the grid. */
	bucketTotals: Record<string, number>;
	/** Sum of every bucket's MT for the selected date. */
	grandTotal: number;
}

/**
 * Footer under the day grid: one chip per bucket (fixed set, always shown so
 * a zero-count bucket still reads as "counted, none on hand" rather than
 * vanishing), plus the day's grand total. Same shape as WasteTotalsFooter.
 */
export default function StockTotalsFooter({ bucketTotals, grandTotal }: StockTotalsFooterProps) {
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
				Total stock by bucket (MT)
			</Typography>
			<Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
				{Object.entries(BUCKET_LABELS).map(([code, label]) => (
					<Chip
						key={code}
						size="small"
						variant="outlined"
						color="primary"
						label={`${label}: ${formatMt(bucketTotals[code] ?? 0)}`}
					/>
				))}
				<Divider flexItem orientation="vertical" sx={{ mx: 0.5 }} />
				<Typography variant="body2" sx={{ fontWeight: 600 }}>
					All buckets: {formatMt(grandTotal)} MT
				</Typography>
			</Box>
		</Box>
	);
}
