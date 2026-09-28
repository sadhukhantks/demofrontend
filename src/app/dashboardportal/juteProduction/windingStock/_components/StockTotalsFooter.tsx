"use client";

import * as React from "react";
import { Box, Chip, Divider, Typography } from "@mui/material";
import { BUCKET_LABELS, LOCATION_LABELS, formatMt, type LocationTotals } from "../utils/stockCalc";

export interface StockTotalsFooterProps {
	/** MT total per bucket for the rows currently in the grid. */
	bucketTotals: Record<string, number>;
	/** Sum of every bucket's MT for the selected date. */
	grandTotal: number;
	/** MT split by where the yarn sits (godown vs floor); sums to grandTotal. */
	locationTotals: LocationTotals;
}

/**
 * Footer under the day grid: one chip per bucket (fixed set, always shown so
 * a zero-count bucket still reads as "counted, none on hand" rather than
 * vanishing), plus the day's grand total, with the godown / floor split on a
 * second line. Same shape as WasteTotalsFooter.
 */
export default function StockTotalsFooter({
	bucketTotals,
	grandTotal,
	locationTotals,
}: StockTotalsFooterProps) {
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
			<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
				{LOCATION_LABELS.GODOWN} {formatMt(locationTotals.GODOWN)} MT · {LOCATION_LABELS.FLOOR}{" "}
				{formatMt(locationTotals.FLOOR)} MT
			</Typography>
		</Box>
	);
}
