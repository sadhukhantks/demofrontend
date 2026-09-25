/**
 * @file YarnIssueTotals.tsx
 * @description Footer totals (packages, kg) for the Yarn Issue line grid.
 */
import * as React from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import type { LineTotals } from "../types/yarnIssueTypes";
import { formatNumber } from "../../utils/yarnIssueFormat";

type StatProps = { label: string; value: string };

function Stat({ label, value }: StatProps) {
	return (
		<Box sx={{ minWidth: 140, textAlign: { xs: "left", sm: "right" } }}>
			<Typography variant="caption" color="text.secondary" display="block">
				{label}
			</Typography>
			<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
				{value}
			</Typography>
		</Box>
	);
}

export function YarnIssueTotals({ totals }: { totals: LineTotals }) {
	return (
		<Paper variant="outlined" sx={{ p: 2 }}>
			<Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 1.5, sm: 4 }} justifyContent="flex-end">
				<Stat label="Total Packages" value={formatNumber(totals.packages, 0)} />
				<Stat label="Total Weight (kg)" value={formatNumber(totals.weightKg, 2)} />
			</Stack>
		</Paper>
	);
}

export default YarnIssueTotals;
