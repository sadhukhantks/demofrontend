"use client";

import * as React from "react";
import { Alert, Box, Button, CircularProgress, IconButton, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { History as HistoryIcon, Save as SaveIcon } from "lucide-react";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import type {
	NormsBulkSaveEntry,
	NormsGridResponse,
	PlanningNormIdType,
	YarnItemOption,
} from "@/utils/juteProductionPlanningService";
import {
	NORM_PARAMS,
	PARAM_LABELS,
	ROW_LABEL_HEADER,
	YARN_SELECT_PARAMS,
	paramSchema,
} from "./planningNormsConstants";

// Local editable state: ref_id -> param -> raw string ("" = empty / not set).
type EditState = Record<number, Record<string, string>>;

const numToStr = (v: number | string | null | undefined): string =>
	v === null || v === undefined || v === "" ? "" : String(v);

export type NormsGridProps = {
	idType: PlanningNormIdType;
	grid: NormsGridResponse;
	/** Options for the warp/weft yarn dropdown cells (Cloth Qualities tab only). */
	yarnOptions: YarnItemOption[];
	loading: boolean;
	saving: boolean;
	effectiveDate: string;
	onSave: (entries: NormsBulkSaveEntry[]) => void;
	onViewHistory: (refId: number, refLabel: string) => void;
};

/**
 * Agnostic inline-edit grid for one norm id_type: rows = refs (cloth
 * qualities / yarn items / stages) returned by norms_grid, columns = the
 * fixed param set for that id_type (NORM_PARAMS). Mirrors the spngTargetMap
 * TargetGrid dirty-cell / bulk-save UX, adapted so warp/weft yarn cells are
 * dropdowns instead of numeric inputs and there is no value_role (v1: always
 * 'standard').
 */
export default function NormsGrid({
	idType,
	grid,
	yarnOptions,
	loading,
	saving,
	effectiveDate,
	onSave,
	onViewHistory,
}: NormsGridProps) {
	const theme = useTheme();
	const params = NORM_PARAMS[idType];

	// Baseline = the resolved value per cell as a string ("" when absent). A
	// cell is dirty when its current edit differs from this baseline.
	const baseline = React.useMemo<EditState>(() => {
		const m: EditState = {};
		grid.rows.forEach((r) => {
			m[r.ref_id] = {};
			params.forEach((p) => {
				m[r.ref_id][p] = numToStr(r.cells[p]?.value ?? null);
			});
		});
		return m;
	}, [grid, params]);

	const [edits, setEdits] = React.useState<EditState>(baseline);

	// Reseed edits whenever a fresh grid loads (tab / effective-date change).
	React.useEffect(() => {
		setEdits(baseline);
	}, [baseline]);

	const setCell = (refId: number, param: string, raw: string) => {
		setEdits((prev) => ({
			...prev,
			[refId]: { ...(prev[refId] ?? {}), [param]: raw },
		}));
	};

	const isDirty = React.useCallback(
		(refId: number, param: string) =>
			(edits[refId]?.[param] ?? "") !== (baseline[refId]?.[param] ?? ""),
		[edits, baseline]
	);

	const { dirtyEntries, invalidCount } = React.useMemo(() => {
		const out: NormsBulkSaveEntry[] = [];
		let invalid = 0;
		grid.rows.forEach((r) => {
			params.forEach((p) => {
				if (!isDirty(r.ref_id, p)) return;
				const raw = edits[r.ref_id]?.[p] ?? "";
				if (raw === "") {
					// norms_bulk_save has no null/clear semantics (unlike
					// target_map_bulk_save) — clearing a previously-set value back to
					// blank can't be sent; use History to deactivate the row instead.
					invalid += 1;
					return;
				}
				const num = Number(raw);
				if (!Number.isFinite(num)) {
					invalid += 1;
					return;
				}
				const parsed = paramSchema(p).safeParse(num);
				if (!parsed.success) {
					invalid += 1;
					return;
				}
				out.push({ id_type: idType, ref_id: r.ref_id, param: p, value: parsed.data });
			});
		});
		return { dirtyEntries: out, invalidCount: invalid };
	}, [grid, params, edits, isDirty, idType]);

	const dirtyCount = dirtyEntries.length;

	if (loading) {
		return (
			<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
				<CircularProgress />
			</Box>
		);
	}

	if (grid.rows.length === 0) {
		return <Alert severity="info">No records found for this company / branch.</Alert>;
	}

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
				<Typography variant="subtitle2">Inline entry</Typography>
				<Button
					variant="contained"
					size="small"
					startIcon={<SaveIcon size={16} />}
					onClick={() => onSave(dirtyEntries)}
					disabled={saving || dirtyCount === 0 || invalidCount > 0}
				>
					{saving ? "Saving…" : dirtyCount > 0 ? `Save (${dirtyCount} changed)` : "Save"}
				</Button>
				{invalidCount > 0 ? (
					<Typography variant="caption" color="error">
						{invalidCount} invalid entr{invalidCount === 1 ? "y" : "ies"} — fix to save.
					</Typography>
				) : null}
				<Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
					Values take effect from {effectiveDate}. Use History to view or deactivate past entries.
				</Typography>
			</Box>

			<Box sx={{ width: "100%", overflowX: "auto" }}>
				<Table size="small" sx={{ minWidth: 600 }}>
					<TableHead>
						<TableRow>
							<TableCell>{ROW_LABEL_HEADER[idType]}</TableCell>
							{params.map((p) => (
								<TableCell key={p} align="right">
									{PARAM_LABELS[p] ?? p}
								</TableCell>
							))}
							<TableCell align="center">History</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{grid.rows.map((r) => (
							<TableRow key={r.ref_id}>
								<TableCell>{r.ref_name ?? r.ref_code ?? r.ref_id}</TableCell>
								{params.map((p) => {
									const dirty = isDirty(r.ref_id, p);
									const raw = edits[r.ref_id]?.[p] ?? "";
									const dirtyBg = dirty ? alpha(theme.palette.warning.main, 0.14) : undefined;

									if (YARN_SELECT_PARAMS.has(p)) {
										return (
											<TableCell key={p} align="right">
												<SearchableOptionSelect
													size="small"
													placeholder="\u2014"
													options={yarnOptions.map((y) => ({ value: String(y.item_id), label: y.item_name }))}
													value={raw}
													onChange={(selectedValue) => setCell(r.ref_id, p, selectedValue)}
													sx={{ width: 170, bgcolor: dirtyBg }}
												/>
											</TableCell>
										);
									}

									return (
										<TableCell key={p} align="right">
											<TextField
												type="number"
												size="small"
												value={raw}
												onChange={(ev) => setCell(r.ref_id, p, ev.target.value)}
												inputProps={{ step: 0.001, style: { textAlign: "right" } }}
												sx={{ width: 110, bgcolor: dirtyBg }}
											/>
										</TableCell>
									);
								})}
								<TableCell align="center">
									<Tooltip title="View history">
										<IconButton
											size="small"
											onClick={() => onViewHistory(r.ref_id, r.ref_name ?? r.ref_code ?? String(r.ref_id))}
										>
											<HistoryIcon size={16} />
										</IconButton>
									</Tooltip>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Box>
		</Box>
	);
}
