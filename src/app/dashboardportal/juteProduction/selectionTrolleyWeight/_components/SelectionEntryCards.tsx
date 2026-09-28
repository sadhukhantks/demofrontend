"use client";

import * as React from "react";
import { Box, IconButton, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import { Pencil as EditIcon, Trash2 as Trash2Icon } from "lucide-react";
import type { SelectionRow } from "../types/selectionTypes";
import { formatKg, formatTime, gateEntryShort } from "../utils/selectionCalc";

export interface SelectionEntryCardsProps {
	/** Active rows for the selected date (all spells). */
	rows: ReadonlyArray<SelectionRow>;
	loading: boolean;
	onEdit: (row: SelectionRow) => void;
	onDelete: (row: SelectionRow) => void;
	actionsDisabled: boolean;
	editingId?: number | null;
}

/**
 * Phone rendering of the day's trolleys (below `md`, D8): the SAME rows as
 * `SelectionEntryGrid`, one stacked card each — quality and net kg prominent,
 * trolley / gross / tare / gate entry / spell / time as secondary text, and
 * touch-sized (≥ 40 px) edit + delete buttons. Newest first.
 */
export default function SelectionEntryCards({
	rows,
	loading,
	onEdit,
	onDelete,
	actionsDisabled,
	editingId,
}: SelectionEntryCardsProps) {
	const sorted = React.useMemo(
		() =>
			[...rows].sort(
				(a, b) => (b.weigh_time ?? "").localeCompare(a.weigh_time ?? "") || b.selection_wt_id - a.selection_wt_id
			),
		[rows]
	);

	return (
		<Box sx={{ width: "100%" }}>
			{loading ? <LinearProgress sx={{ mb: 1 }} /> : null}
			{sorted.length === 0 && !loading ? (
				<Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
					No trolleys weighed on this date yet.
				</Typography>
			) : null}
			<Stack spacing={1}>
				{sorted.map((row) => {
					const isEditing = row.selection_wt_id === editingId;
					const ge = gateEntryShort(row);
					const secondary = [
						`Trolley ${row.trolly_name ?? row.trolly_id}`,
						`gross ${formatKg(row.gross_wt)}`,
						`tare ${formatKg(row.trolly_wt)}`,
					].join(" · ");
					const tertiary = [ge, row.spell_code ? `Spell ${row.spell_code}` : "", formatTime(row.weigh_time)]
						.filter(Boolean)
						.join(" · ");
					return (
						<Paper
							key={row.selection_wt_id}
							variant="outlined"
							sx={{
								p: 1.5,
								display: "flex",
								alignItems: "flex-start",
								gap: 1,
								bgcolor: isEditing ? "action.selected" : "background.paper",
							}}
						>
							<Box sx={{ flex: 1, minWidth: 0 }}>
								<Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1 }}>
									<Typography variant="subtitle1" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>
										{row.item_name ?? String(row.item_id)}
									</Typography>
									<Typography variant="h6" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
										{formatKg(row.net_wt)} kg
									</Typography>
								</Box>
								<Typography variant="body2" color="text.secondary">
									{secondary}
								</Typography>
								{tertiary ? (
									<Typography variant="caption" color="text.secondary" component="div">
										{tertiary}
									</Typography>
								) : null}
								{row.remarks ? (
									<Typography variant="caption" component="div" sx={{ mt: 0.5, overflowWrap: "anywhere" }}>
										{row.remarks}
									</Typography>
								) : null}
							</Box>
							<Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
								<IconButton
									color="primary"
									disabled={actionsDisabled}
									onClick={() => onEdit(row)}
									sx={{ minWidth: 44, minHeight: 44 }}
									aria-label="Edit"
								>
									<EditIcon size={18} />
								</IconButton>
								<IconButton
									color="error"
									disabled={actionsDisabled}
									onClick={() => onDelete(row)}
									sx={{ minWidth: 44, minHeight: 44 }}
									aria-label="Delete"
								>
									<Trash2Icon size={18} />
								</IconButton>
							</Box>
						</Paper>
					);
				})}
			</Stack>
		</Box>
	);
}
