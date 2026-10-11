"use client";

// TKT-000119 (2): change many looms in one action. Pick looms (row ticks, shift-click
// ranges, "select shown", by current quality, or by an existing loom grouping), then set
// one quality on all of them. This only changes the grid; Save Map persists it with the
// same lock/permission checks as changing looms one by one.

import * as React from "react";
import { Box, Button, Chip, Typography } from "@mui/material";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import type { LoomGrouping } from "@/utils/weavingQualityMapService";

type QualityOption = { value: number; label: string };

interface BulkQualityBarProps {
	qualityOptions: readonly QualityOption[];
	/** Existing groupings that contain at least one loom of this grid. */
	groups: readonly LoomGrouping[];
	selectedCount: number;
	/** Selected looms outside the rows currently shown (other lines / search). */
	hiddenSelectedCount: number;
	shownCount: number;
	onSelectShown: () => void;
	onSelectQuality: (qualityId: number) => void;
	onSelectGroup: (group: LoomGrouping) => void;
	onClear: () => void;
	onApply: (qualityId: number) => void;
}

function groupLabel(g: LoomGrouping): string {
	const kind = g.source === "loom_group" ? "Loom group" : "Machine group";
	const name = g.group_name && g.group_name !== g.group_code ? ` - ${g.group_name}` : "";
	return `${g.group_code ?? g.group_id}${name} (${kind}, ${g.machine_ids.length})`;
}

export default function BulkQualityBar({
	qualityOptions,
	groups,
	selectedCount,
	hiddenSelectedCount,
	shownCount,
	onSelectShown,
	onSelectQuality,
	onSelectGroup,
	onClear,
	onApply,
}: BulkQualityBarProps) {
	const [target, setTarget] = React.useState<number | "">("");
	const groupOptions = groups.map((g, i) => ({ value: i, label: groupLabel(g) }));

	return (
		<Box
			sx={{
				display: "flex",
				alignItems: "center",
				gap: 1.5,
				flexWrap: "wrap",
				p: 1,
				border: 1,
				borderColor: "divider",
				borderRadius: 1,
			}}
		>
			<Typography variant="body2" sx={{ fontWeight: 600 }}>
				Select looms:
			</Typography>
			<Button size="small" variant="outlined" onClick={onSelectShown} disabled={shownCount === 0}>
				Shown ({shownCount})
			</Button>
			<SearchableOptionSelect
				size="small"
				placeholder="With quality…"
				options={qualityOptions}
				value=""
				onChange={(v) => {
					if (v !== "") onSelectQuality(Number(v));
				}}
				sx={{ minWidth: 200 }}
			/>
			{groupOptions.length > 0 ? (
				<SearchableOptionSelect
					size="small"
					placeholder="In group…"
					options={groupOptions}
					value=""
					onChange={(v) => {
						if (v !== "") onSelectGroup(groups[Number(v)]);
					}}
					sx={{ minWidth: 220 }}
				/>
			) : null}
			<Chip
				size="small"
				color={selectedCount > 0 ? "primary" : "default"}
				label={
					hiddenSelectedCount > 0
						? `${selectedCount} selected (${hiddenSelectedCount} not shown)`
						: `${selectedCount} selected`
				}
			/>
			<Button size="small" onClick={onClear} disabled={selectedCount === 0}>
				Clear
			</Button>
			<Box sx={{ display: "flex", alignItems: "center", gap: 1, ml: { md: "auto" } }}>
				<SearchableOptionSelect
					size="small"
					placeholder="Set quality…"
					options={qualityOptions}
					value={target}
					onChange={(v) => setTarget(v === "" ? "" : Number(v))}
					sx={{ minWidth: 200 }}
				/>
				<Button
					size="small"
					variant="contained"
					disabled={selectedCount === 0 || target === ""}
					onClick={() => {
						if (target !== "") onApply(target);
					}}
				>
					Apply to {selectedCount}
				</Button>
			</Box>
		</Box>
	);
}
