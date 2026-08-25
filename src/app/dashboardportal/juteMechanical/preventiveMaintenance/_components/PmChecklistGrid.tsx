"use client";

import * as React from "react";
import { alpha } from "@mui/material/styles";
import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
	IconButton,
	Paper,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import { Plus as PlusIcon, RotateCcw as ReseedIcon, Trash2 as TrashIcon } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type { MechEnumOption } from "@/utils/juteMechanicalService";
import type { EditablePmTask } from "../types/pmTypes";
import { FALLBACK_PM_RESULTS, PM_RESULT_NOT_OK, countNotOk } from "../types/pmTypes";

export interface PmChecklistGridProps {
	tasks: ReadonlyArray<EditablePmTask>;
	/** Result codes from `/pm_create_setup`; falls back to OK / NOT_OK / NA. */
	resultOptions: ReadonlyArray<MechEnumOption>;
	loading: boolean;
	error: string | null;
	/** True once a seed returned no template rows for this machine + frequency. */
	templateEmpty: boolean;
	/** True once both machine and frequency are chosen — before that there is nothing to show. */
	ready: boolean;
	onUpdate: (rowId: string, patch: Partial<Omit<EditablePmTask, "row_id">>) => void;
	onAddAdhoc: () => void;
	onRemove: (rowId: string) => void;
	/** Re-pull the template, discarding the current rows. Hidden while editing a saved PM. */
	onReseed?: () => void;
	disabled?: boolean;
}

/** One entry of the in-cell result dropdown. */
interface ResultOption {
	value: string;
	label: string;
}

/**
 * The PM checklist. Rows are seeded from the machine's schedule template and each
 * one is filled in by the fitter: a result (OK / NOT_OK / NA) and an observation.
 * Rows the template does not cover can be added ad hoc, and are posted with a null
 * `pm_schedule_id`.
 *
 * A NOT_OK row is tinted with the theme's error color (via `alpha`, never a
 * hardcoded hex) and flagged in its own column, because a failed check is the
 * earliest warning that a breakdown is coming — it is the one thing on this screen
 * that must not be scrolled past.
 */
export default function PmChecklistGrid({
	tasks,
	resultOptions,
	loading,
	error,
	templateEmpty,
	ready,
	onUpdate,
	onAddAdhoc,
	onRemove,
	onReseed,
	disabled = false,
}: PmChecklistGridProps) {
	const options = React.useMemo<ResultOption[]>(() => {
		const source = resultOptions.length > 0 ? resultOptions : FALLBACK_PM_RESULTS;
		return source.map((option) => ({ value: option.code, label: option.label }));
	}, [resultOptions]);

	const notOkCount = React.useMemo(() => countNotOk(tasks), [tasks]);

	const findOption = React.useCallback(
		(code: string): ResultOption | null => options.find((o) => o.value === code) ?? null,
		[options],
	);

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
				<Typography variant="subtitle2">Checklist</Typography>
				<Chip size="small" variant="outlined" label={`${tasks.length} task${tasks.length === 1 ? "" : "s"}`} />
				{notOkCount > 0 ? (
					<Chip size="small" color="error" label={`${notOkCount} not OK`} />
				) : null}
				<Button
					size="small"
					variant="outlined"
					startIcon={<PlusIcon size={16} />}
					onClick={onAddAdhoc}
					disabled={disabled || !ready}
					sx={{ minHeight: 36 }}
				>
					Add task
				</Button>
				{onReseed ? (
					<Tooltip title="Reload the checklist template, discarding the rows below">
						<span>
							<Button
								size="small"
								variant="text"
								startIcon={<ReseedIcon size={16} />}
								onClick={onReseed}
								disabled={disabled || !ready || loading}
								sx={{ minHeight: 36 }}
							>
								Reload template
							</Button>
						</span>
					</Tooltip>
				) : null}
				{loading ? <CircularProgress size={18} /> : null}
			</Box>

			{!ready ? (
				<Alert severity="info">
					Pick a machine and a frequency to load that machine&apos;s checklist.
				</Alert>
			) : null}

			{error ? <Alert severity="error">{error}</Alert> : null}

			{ready && templateEmpty && tasks.length === 0 ? (
				<Alert severity="warning">
					No checklist template exists for this machine and frequency. Add the tasks done today
					with <strong>Add task</strong>, or define the template in Maintenance Masters &gt; PM
					Schedule so the next round is seeded automatically.
				</Alert>
			) : null}

			{tasks.length > 0 ? (
				<TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto" }}>
					<Table size="small">
						<TableHead>
							<TableRow>
								<TableCell sx={{ width: 56 }}>#</TableCell>
								<TableCell sx={{ minWidth: 260 }}>Task</TableCell>
								<TableCell sx={{ width: 150 }}>Result</TableCell>
								<TableCell sx={{ minWidth: 220 }}>Observation</TableCell>
								<TableCell sx={{ width: 110 }}>Source</TableCell>
								<TableCell sx={{ width: 56 }} />
							</TableRow>
						</TableHead>
						<TableBody>
							{tasks.map((task, index) => {
								const failed = task.result === PM_RESULT_NOT_OK;
								return (
									<TableRow
										key={task.row_id}
										hover
										sx={{
											// Theme error token, softened — never a hardcoded color.
											bgcolor: failed
												? (theme) => alpha(theme.palette.error.main, 0.1)
												: undefined,
											borderLeft: failed ? 3 : 0,
											borderLeftColor: "error.main",
											borderLeftStyle: "solid",
										}}
									>
										<TableCell>{index + 1}</TableCell>
										<TableCell>
											{task.source === "ADHOC" ? (
												<TextField
													value={task.task_desc}
													onChange={(e) =>
														onUpdate(task.row_id, { task_desc: e.target.value })
													}
													size="small"
													fullWidth
													placeholder="Describe the task done"
													disabled={disabled}
													inputProps={{ maxLength: 255 }}
													error={task.task_desc.trim() === ""}
												/>
											) : (
												<Typography variant="body2">{task.task_desc}</Typography>
											)}
										</TableCell>
										<TableCell>
											<SearchableSelect<ResultOption>
												variant="bare"
												size="small"
												fullWidth
												clearable={false}
												disabled={disabled}
												options={options}
												value={findOption(task.result)}
												onChange={(option) =>
													onUpdate(task.row_id, {
														result: option ? option.value : task.result,
													})
												}
												getOptionLabel={(option) => option.label}
												getOptionKey={(option) => option.value}
												isOptionEqualToValue={(option, current) =>
													option.value === current.value
												}
											/>
										</TableCell>
										<TableCell>
											<TextField
												value={task.observation}
												onChange={(e) =>
													onUpdate(task.row_id, { observation: e.target.value })
												}
												size="small"
												fullWidth
												disabled={disabled}
												placeholder={failed ? "What is wrong?" : "Optional"}
												inputProps={{ maxLength: 255 }}
											/>
										</TableCell>
										<TableCell>
											<Chip
												size="small"
												variant="outlined"
												label={task.source === "TEMPLATE" ? "Template" : "Ad-hoc"}
											/>
										</TableCell>
										<TableCell>
											<Tooltip title="Remove task">
												<span>
													<IconButton
														size="small"
														color="error"
														onClick={() => onRemove(task.row_id)}
														disabled={disabled}
														sx={{ minWidth: 40, minHeight: 40 }}
													>
														<TrashIcon size={16} />
													</IconButton>
												</span>
											</Tooltip>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</TableContainer>
			) : null}

			{notOkCount > 0 ? (
				<Alert severity="warning">
					{notOkCount} check{notOkCount === 1 ? "" : "s"} failed. Record what you saw in the
					observation column — these are the machines most likely to break down next.
				</Alert>
			) : null}
		</Box>
	);
}
