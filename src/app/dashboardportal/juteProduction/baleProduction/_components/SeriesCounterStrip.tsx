"use client";

import * as React from "react";
import { Box, Chip, Tooltip, Typography } from "@mui/material";
import { BALE_QUALITY_TYPE_LABELS, type BaleQualityType, type BaleSeriesOption } from "../types/baleTypes";

export interface SeriesCounterStripProps {
	/** Series in scope for this branch (from setup). */
	series: ReadonlyArray<BaleSeriesOption>;
	/**
	 * Counters advanced by saves made on this page since setup loaded
	 * (series id → last_bale_no from the save echo). Wins over the setup value.
	 */
	liveCounters: Readonly<Record<number, number>>;
	/** Series currently selected in the form — highlighted. */
	selectedSeriesId: number | null;
}

/**
 * "PUNJAB · last 24746" chips — the sheet's Last Bale No tab as a glance strip
 * (SPEC §8.1). Read-only; the master page edits counters.
 */
export default function SeriesCounterStrip({ series, liveCounters, selectedSeriesId }: SeriesCounterStripProps) {
	if (series.length === 0) return null;
	return (
		<Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
			<Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
				Series counters
			</Typography>
			{series.map((s) => {
				const last = Math.max(Number(s.last_bale_no) || 0, liveCounters[s.bale_series_id] ?? 0);
				const selected = s.bale_series_id === selectedSeriesId;
				const typeLabel = BALE_QUALITY_TYPE_LABELS[Number(s.quality_type) as BaleQualityType] ?? "";
				return (
					<Tooltip key={s.bale_series_id} title={`${typeLabel}${s.item_id != null ? " · bound to one quality" : ""}`}>
						<Chip
							size="small"
							color={selected ? "primary" : "default"}
							variant={selected ? "filled" : "outlined"}
							label={`${s.series_name} · last ${last.toLocaleString()}`}
						/>
					</Tooltip>
				);
			})}
		</Box>
	);
}
