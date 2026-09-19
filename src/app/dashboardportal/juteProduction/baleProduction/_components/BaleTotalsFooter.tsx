"use client";

import * as React from "react";
import { Box, Chip, Divider, Typography } from "@mui/material";
import { BALE_ENTRY_TYPES, type BaleEntryType, type BaleQualityTotal } from "../types/baleTypes";
import { formatKg, roundWt, toNum } from "../utils/baleCalc";

export interface BaleTotalsFooterProps {
	/** Server-computed per-quality totals from GET /entries_by_date (SPEC §6.3). */
	totals: ReadonlyArray<BaleQualityTotal>;
}

type GrandTotal = { bales: number; totalGross: number; totalNet: number };

function sumTotals(list: ReadonlyArray<BaleQualityTotal>): GrandTotal {
	return list.reduce<GrandTotal>(
		(acc, t) => ({
			bales: acc.bales + toNum(t.bales),
			totalGross: roundWt(acc.totalGross + toNum(t.total_gross)),
			totalNet: roundWt(acc.totalNet + toNum(t.total_net)),
		}),
		{ bales: 0, totalGross: 0, totalNet: 0 }
	);
}

function TypeBlock({
	title,
	entryType,
	items,
	chipColor,
}: {
	title: string;
	entryType: BaleEntryType;
	items: ReadonlyArray<BaleQualityTotal>;
	chipColor: "primary" | "secondary";
}) {
	if (items.length === 0) return null;
	const grand = sumTotals(items);
	return (
		<Box>
			<Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
				{title}
			</Typography>
			<Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
				{items.map((t) => (
					<Chip
						key={`${entryType}-${t.finishing_quality_id}`}
						size="small"
						variant="outlined"
						color={chipColor}
						label={`${t.item_name ?? t.finishing_quality_id}: ${t.bales} bale${t.bales === 1 ? "" : "s"} · ${formatKg(t.total_net)} kg net${
							t.avg_net != null ? ` · avg ${formatKg(t.avg_net)}` : ""
						}${t.std_bale_wt != null ? ` (std ${formatKg(t.std_bale_wt)})` : ""}`}
					/>
				))}
				<Divider flexItem orientation="vertical" sx={{ mx: 0.5 }} />
				<Typography variant="body2" sx={{ fontWeight: 600 }}>
					{grand.bales} bale{grand.bales === 1 ? "" : "s"} · gross {formatKg(grand.totalGross)} kg · net{" "}
					{formatKg(grand.totalNet)} kg
				</Typography>
			</Box>
		</Box>
	);
}

/**
 * Footer under the day grid: per-quality totals, PROD and REPACK shown
 * separately (Q4 — repacks re-press an already-counted bale, so they never fold
 * into production totals). Colours come from the MUI palette tokens only.
 */
export default function BaleTotalsFooter({ totals }: BaleTotalsFooterProps) {
	const prod = React.useMemo(
		() => totals.filter((t) => t.entry_type === BALE_ENTRY_TYPES.PROD).sort((a, b) => (a.item_name ?? "").localeCompare(b.item_name ?? "")),
		[totals]
	);
	const repack = React.useMemo(
		() => totals.filter((t) => t.entry_type === BALE_ENTRY_TYPES.REPACK).sort((a, b) => (a.item_name ?? "").localeCompare(b.item_name ?? "")),
		[totals]
	);

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
				display: "flex",
				flexDirection: "column",
				gap: 1.5,
			}}
		>
			<TypeBlock title="Production by quality" entryType={BALE_ENTRY_TYPES.PROD} items={prod} chipColor="primary" />
			<TypeBlock title="Repack by quality" entryType={BALE_ENTRY_TYPES.REPACK} items={repack} chipColor="secondary" />
		</Box>
	);
}
