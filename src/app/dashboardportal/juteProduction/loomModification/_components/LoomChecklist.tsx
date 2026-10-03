"use client";

import * as React from "react";
import {
	Box,
	Button,
	Checkbox,
	Chip,
	FormControlLabel,
	TextField,
	Typography,
} from "@mui/material";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { TOUCH_TARGET } from "@/components/ui/responsiveEntry";
import type { ChecklistMember, ChecklistRow, ChecklistTag } from "../types/modificationTypes";
import {
	addMembers,
	existingGroupings,
	loomLabel,
	pickByLine,
	pickByNameRange,
} from "../types/modificationTypes";

export interface LoomChecklistProps {
	/** Every loom that may be ticked, already labelled (see `buildChecklistRows`). */
	rows: ReadonlyArray<ChecklistRow>;
	/** Distinct line numbers of the branch, as strings. */
	lines: ReadonlyArray<string>;
	/** Ticked looms with their optional per-loom dates. */
	value: ReadonlyArray<ChecklistMember>;
	onChange: (next: ChecklistMember[]) => void;
	/** Show the per-row Done date / Done-to date inputs (register only). */
	withDates?: boolean;
	/** Event dates, echoed as the placeholder of blank per-loom dates. */
	eventDate?: string;
	eventToDate?: string;
	/**
	 * When set, only these looms are listed until the user asks for the whole
	 * branch (follow-up mode: the parent snapshot ∪ current group members).
	 */
	focusIds?: ReadonlySet<number> | null;
	disabled?: boolean;
	error?: string | null;
	/** Caption under the count badge (e.g. "members as recorded"). */
	caption?: string;
}

const TAG_COLOR: Record<ChecklistTag, "default" | "warning" | "info"> = {
	inactive: "default",
	"no longer in group": "warning",
	"not in previous stage": "info",
};

/**
 * Tick-list of looms, shared by the Loom Groups master and the modification
 * register. Rows are `mech_code — machine_name (line N)`; helpers above the list
 * add looms in bulk (select all / none, a name range by the numeric tail, a whole
 * line, an existing grouping — a band of six or a share code, see
 * `existingGroupings`) and a badge keeps "Selected k of n" visible.
 *
 * A retired loom is shown "inactive" and cannot be newly ticked, but one that is
 * already a member stays ticked so editing an old record never fails because a
 * loom was scrapped (§5). Per-row dates are only rendered when `withDates` is on
 * and the row is ticked.
 */
export default function LoomChecklist({
	rows,
	lines,
	value,
	onChange,
	withDates = false,
	eventDate = "",
	eventToDate = "",
	focusIds = null,
	disabled = false,
	error = null,
	caption,
}: LoomChecklistProps) {
	const [search, setSearch] = React.useState("");
	const [rangeFrom, setRangeFrom] = React.useState("");
	const [rangeTo, setRangeTo] = React.useState("");
	const [line, setLine] = React.useState<string>("");
	const [grouping, setGrouping] = React.useState<string>("");
	const [showAll, setShowAll] = React.useState(false);

	const byId = React.useMemo(() => {
		const map = new Map<number, ChecklistMember>();
		value.forEach((member) => map.set(member.machine_id, member));
		return map;
	}, [value]);

	// Rows currently listed: the focus set (plus anything ticked) unless "show all".
	const listed = React.useMemo(() => {
		let base: ReadonlyArray<ChecklistRow> = rows;
		if (focusIds && !showAll) {
			base = rows.filter((row) => focusIds.has(row.machine_id) || byId.has(row.machine_id));
		}
		const needle = search.trim().toLowerCase();
		if (!needle) return base;
		return base.filter((row) => loomLabel(row).toLowerCase().includes(needle));
	}, [rows, focusIds, showAll, byId, search]);

	const selectableIds = React.useCallback(
		(source: ReadonlyArray<ChecklistRow>) =>
			source.filter((row) => row.active || byId.has(row.machine_id)).map((row) => row.machine_id),
		[byId],
	);

	const lineOptions = React.useMemo(
		() => lines.map((entry) => ({ value: entry, label: `Line ${entry}` })),
		[lines],
	);

	// Bands of six and share codes already in the data — the same list the
	// register's "From group" picker offers under its saved groups.
	const groupings = React.useMemo(() => existingGroupings(rows), [rows]);
	const groupingOptions = React.useMemo(
		() => groupings.map((group) => ({ value: group.key, label: group.label })),
		[groupings],
	);

	const toggle = React.useCallback(
		(row: ChecklistRow) => {
			if (byId.has(row.machine_id)) {
				onChange(value.filter((member) => member.machine_id !== row.machine_id));
			} else if (row.active) {
				onChange(addMembers(value, [row.machine_id]));
			}
		},
		[byId, onChange, value],
	);

	const setMemberDate = React.useCallback(
		(machineId: number, field: "done_date" | "done_to_date", next: string) => {
			onChange(
				value.map((member) =>
					member.machine_id === machineId ? { ...member, [field]: next } : member,
				),
			);
		},
		[onChange, value],
	);

	const selectAllListed = React.useCallback(() => {
		onChange(addMembers(value, selectableIds(listed)));
	}, [listed, onChange, selectableIds, value]);

	const clearAll = React.useCallback(() => onChange([]), [onChange]);

	const applyRange = React.useCallback(() => {
		const ids = pickByNameRange(rows, rangeFrom, rangeTo).filter((id) => {
			const row = rows.find((r) => r.machine_id === id);
			return row ? row.active || byId.has(id) : false;
		});
		onChange(addMembers(value, ids));
	}, [byId, onChange, rangeFrom, rangeTo, rows, value]);

	const applyLine = React.useCallback(() => {
		const ids = pickByLine(rows, line).filter((id) => {
			const row = rows.find((r) => r.machine_id === id);
			return row ? row.active || byId.has(id) : false;
		});
		onChange(addMembers(value, ids));
	}, [byId, line, onChange, rows, value]);

	const applyGrouping = React.useCallback(() => {
		const group = groupings.find((entry) => entry.key === grouping);
		if (!group) return;
		// `existingGroupings` only lists active looms, so every id is tickable.
		onChange(addMembers(value, group.machine_ids));
	}, [grouping, groupings, onChange, value]);

	const total = rows.length;
	const selected = value.length;

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
				<Chip
					size="small"
					color={selected > 0 ? "primary" : "default"}
					label={`Selected ${selected} of ${total}`}
				/>
				{caption ? (
					<Typography variant="caption" color="text.secondary">
						{caption}
					</Typography>
				) : null}
				<Box sx={{ flex: 1 }} />
				<Button size="small" onClick={selectAllListed} disabled={disabled || listed.length === 0}>
					Select all
				</Button>
				<Button size="small" onClick={clearAll} disabled={disabled || selected === 0}>
					None
				</Button>
			</Box>

			<Box
				sx={{
					display: "grid",
					gap: 1,
					alignItems: "center",
					gridTemplateColumns: {
						xs: "1fr 1fr auto",
						sm: "minmax(0, 1fr) minmax(0, 1fr) auto minmax(0, 1.4fr) auto",
					},
				}}
			>
				<TextField
					size="small"
					label="From loom"
					placeholder="S101"
					value={rangeFrom}
					onChange={(e) => setRangeFrom(e.target.value)}
					disabled={disabled}
				/>
				<TextField
					size="small"
					label="To loom"
					placeholder="S112"
					value={rangeTo}
					onChange={(e) => setRangeTo(e.target.value)}
					disabled={disabled}
				/>
				<Button
					size="small"
					variant="outlined"
					onClick={applyRange}
					disabled={disabled || !rangeFrom.trim() || !rangeTo.trim()}
					sx={{ minHeight: TOUCH_TARGET - 4 }}
				>
					Pick range
				</Button>
				{/* The select's own `sx` styles its inner TextField, so the grid cell is a wrapper. */}
				<Box sx={{ gridColumn: { xs: "1 / span 2", sm: "auto" }, minWidth: 0 }}>
					<SearchableOptionSelect
						label="Line"
						size="small"
						fullWidth
						placeholder="Line no."
						options={lineOptions}
						value={line}
						onChange={(next) => setLine(next === "" ? "" : String(next))}
						disabled={disabled || lineOptions.length === 0}
					/>
				</Box>
				<Button
					size="small"
					variant="outlined"
					onClick={applyLine}
					disabled={disabled || line === ""}
					sx={{ minHeight: TOUCH_TARGET - 4 }}
				>
					Fill from line
				</Button>
				<Box sx={{ gridColumn: { xs: "1 / span 2", sm: "1 / span 4" }, minWidth: 0 }}>
					<SearchableOptionSelect
						label="Existing grouping"
						size="small"
						fullWidth
						placeholder="Band of 6 or share code"
						options={groupingOptions}
						value={grouping}
						onChange={(next) => setGrouping(next === "" ? "" : String(next))}
						disabled={disabled || groupingOptions.length === 0}
					/>
				</Box>
				<Button
					size="small"
					variant="outlined"
					onClick={applyGrouping}
					disabled={disabled || grouping === ""}
					sx={{ minHeight: TOUCH_TARGET - 4 }}
				>
					Fill from grouping
				</Button>
			</Box>

			<Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
				<TextField
					size="small"
					label="Find loom"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					sx={{ flex: 1, minWidth: 160 }}
				/>
				{focusIds ? (
					<FormControlLabel
						control={
							<Checkbox
								size="small"
								checked={showAll}
								onChange={(e) => setShowAll(e.target.checked)}
							/>
						}
						label="Show all looms of the branch"
					/>
				) : null}
			</Box>

			{error ? (
				<Typography variant="caption" color="error">
					{error}
				</Typography>
			) : null}

			<Box
				sx={{
					border: 1,
					borderColor: error ? "error.main" : "divider",
					borderRadius: 1,
					maxHeight: { xs: 360, md: 420 },
					overflowY: "auto",
				}}
			>
				{listed.length === 0 ? (
					<Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
						No looms to show.
					</Typography>
				) : null}
				{listed.map((row) => {
					const member = byId.get(row.machine_id);
					const ticked = member !== undefined;
					const canTick = row.active || ticked;
					return (
						<Box
							key={row.machine_id}
							sx={{
								display: "flex",
								flexWrap: "wrap",
								alignItems: "center",
								gap: 1,
								px: 1,
								py: 0.25,
								borderBottom: 1,
								borderColor: "divider",
								"&:last-of-type": { borderBottom: 0 },
								opacity: canTick ? 1 : 0.6,
							}}
						>
							<FormControlLabel
								sx={{ flex: 1, minWidth: 200, mr: 0 }}
								control={
									<Checkbox
										size="small"
										checked={ticked}
										disabled={disabled || !canTick}
										onChange={() => toggle(row)}
									/>
								}
								label={
									<Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
										<Typography variant="body2">{loomLabel(row)}</Typography>
										{row.tag ? (
											<Chip
												size="small"
												variant="outlined"
												color={TAG_COLOR[row.tag]}
												label={row.tag}
											/>
										) : null}
									</Box>
								}
							/>
							{withDates && ticked && member ? (
								<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
									<TextField
										type="date"
										size="small"
										label="Done on"
										value={member.done_date}
										onChange={(e) => setMemberDate(row.machine_id, "done_date", e.target.value)}
										disabled={disabled}
										InputLabelProps={{ shrink: true }}
										inputProps={{ min: eventDate || undefined, max: eventToDate || eventDate || undefined }}
										helperText={member.done_date ? undefined : eventDate ? `= ${eventDate}` : undefined}
										sx={{ width: 160 }}
									/>
									<TextField
										type="date"
										size="small"
										label="Done to"
										value={member.done_to_date}
										onChange={(e) =>
											setMemberDate(row.machine_id, "done_to_date", e.target.value)
										}
										disabled={disabled}
										InputLabelProps={{ shrink: true }}
										inputProps={{ min: member.done_date || eventDate || undefined, max: eventToDate || undefined }}
										sx={{ width: 160 }}
									/>
								</Box>
							) : null}
						</Box>
					);
				})}
			</Box>
		</Box>
	);
}
