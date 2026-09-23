"use client";

import * as React from "react";
import { Box, Chip, Divider, Typography } from "@mui/material";
import type { SelectionQualityTotal, SelectionTotals } from "../types/selectionTypes";
import { formatKg, toNum } from "../utils/selectionCalc";

export interface SelectionTotalsFooterProps {
	/** Day totals from GET /entries_by_date (or the client fallback). */
	totals: SelectionTotals;
	/** Per-quality roll-up from the same call. */
	byQuality: ReadonlyArray<SelectionQualityTotal>;
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<Box sx={{ minWidth: 0 }}>
			<Typography variant="caption" color="text.secondary" component="div">
				{label}
			</Typography>
			<Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
				{value}
			</Typography>
		</Box>
	);
}

/**
 * Footer under the day list: trolleys / gross / tare / net totals and one chip
 * per quality (trolleys · net kg). Wraps on small screens (D8). Colours come
 * from the MUI palette tokens only.
 */
export default function SelectionTotalsFooter({ totals, byQuality }: SelectionTotalsFooterProps) {
	const sorted = React.useMemo(
		() => [...byQuality].sort((a, b) => (a.item_name ?? "").localeCompare(b.item_name ?? "")),
		[byQuality]
	);

	if (toNum(totals.trolleys) === 0 && sorted.length === 0) return null;

	return (
		<Box
			sx={{
				mt: 1.5,
				p: 1.5,
				border: 1,
				borderColor: "divider",
				borderRadius: 1,
				bgcolor: "background.paper",
				display: "flex",
				flexDirection: "column",
				gap: 1.5,
			}}
		>
			<Box sx={{ display: "flex", flexWrap: "wrap", gap: { xs: 2, md: 4 } }}>
				<Stat label="Trolleys" value={String(toNum(totals.trolleys))} />
				<Stat label="Gross" value={`${formatKg(totals.gross_wt) || "0"} kg`} />
				<Stat label="Tare" value={`${formatKg(totals.trolly_wt) || "0"} kg`} />
				<Stat label="Net" value={`${formatKg(totals.net_wt) || "0"} kg`} />
			</Box>
			{sorted.length > 0 ? (
				<>
					<Divider />
					<Box>
						<Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
							By quality
						</Typography>
						<Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
							{sorted.map((q) => (
								<Chip
									key={q.item_id}
									size="small"
									variant="outlined"
									color="primary"
									label={`${q.item_name ?? q.item_id}: ${toNum(q.trolleys)} trolley${toNum(q.trolleys) === 1 ? "" : "s"} · ${formatKg(q.net_wt) || "0"} kg net`}
								/>
							))}
						</Box>
					</Box>
				</>
			) : null}
		</Box>
	);
}
