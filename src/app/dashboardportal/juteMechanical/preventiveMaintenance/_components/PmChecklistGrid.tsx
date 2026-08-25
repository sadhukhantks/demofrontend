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
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography,
} from "@mui/material";
import { Plus as PlusIcon, RotateCcw as ReseedIcon, Trash2 as TrashIcon } from "lucide-react";
import {
	DESKTOP_ONLY_SX,
	MOBILE_ONLY_SX,
	TOUCH_ICON_BUTTON_SX,
	TOUCH_TARGET,
} from "@/components/ui/responsiveEntry";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type { MechEnumOption } from "@/utils/juteMechanicalService";
import type { EditablePmTask, PmEnumLike } from "../types/pmTypes";
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
 * Above this many result codes the phone layout keeps the searchable dropdown: a
 * segmented control stops being thumb-sized once the segments have to share a
 * 360px row. The server's `pm_results` is OK / NOT_OK / NA today, so in practice
 * the segmented control is what a fitter sees.
 */
const MAX_SEGMENTED_OPTIONS = 3;

/** Wrap long checklist wording instead of clipping it — a task can run to 500 chars. */
const WRAP_SX = { overflowWrap: "anywhere", whiteSpace: "pre-wrap" } as const;

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
 *
 * This is the most phone-first surface in the module: it is ticked off one-handed
 * while walking round a running machine. Below `md` each task becomes a stacked
 * card — wording on its own full-width line (wrapped, never truncated), then a
 * thumb-sized segmented result control, then the observation — instead of a
 * six-column row where the result cell would be about 60px wide. The swap is
 * CSS-only (`DESKTOP_ONLY_SX` / `MOBILE_ONLY_SX`); both trees render, so there is
 * no `useMediaQuery` and no hydration mismatch. The segmented control writes the
 * same `result` code the dropdown does, so the payload is untouched.
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
		const source: ReadonlyArray<PmEnumLike> =
			resultOptions.length > 0 ? resultOptions : FALLBACK_PM_RESULTS;
		return source.map((option) => ({ value: option.code, label: option.label }));
	}, [resultOptions]);

	const notOkCount = React.useMemo(() => countNotOk(tasks), [tasks]);

	const findOption = React.useCallback(
		(code: string): ResultOption | null => options.find((o) => o.value === code) ?? null,
		[options],
	);

	const useSegmented = options.length > 0 && options.length <= MAX_SEGMENTED_OPTIONS;

	/** Shared by both layouts, so a result set from either path is identical. */
	const setResult = React.useCallback(
		(task: EditablePmTask, next: string | null) => {
			onUpdate(task.row_id, { result: next ?? task.result });
		},
		[onUpdate],
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
					sx={{ minHeight: TOUCH_TARGET }}
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
								sx={{ minHeight: TOUCH_TARGET }}
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
				<Box sx={DESKTOP_ONLY_SX}>
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
													<Typography variant="body2" sx={WRAP_SX}>
														{task.task_desc}
													</Typography>
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
														setResult(task, option ? option.value : null)
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
				</Box>
			) : null}

			{/* Phone: one card per task — wording, then a thumb-sized result control,
			    then the observation. Same handlers, same values as the table above. */}
			{tasks.length > 0 ? (
				<Box sx={MOBILE_ONLY_SX}>
					{tasks.map((task, index) => {
						const failed = task.result === PM_RESULT_NOT_OK;
						return (
							<Paper
								key={task.row_id}
								variant="outlined"
								sx={{
									p: 1.5,
									bgcolor: failed
										? (theme) => alpha(theme.palette.error.main, 0.1)
										: undefined,
									borderLeft: failed ? 3 : undefined,
									borderLeftColor: failed ? "error.main" : undefined,
									borderLeftStyle: failed ? "solid" : undefined,
								}}
							>
								<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
									<Typography variant="caption" color="text.secondary">
										#{index + 1}
									</Typography>
									<Chip
										size="small"
										variant="outlined"
										label={task.source === "TEMPLATE" ? "Template" : "Ad-hoc"}
									/>
									<IconButton
										size="small"
										color="error"
										aria-label="Remove task"
										onClick={() => onRemove(task.row_id)}
										disabled={disabled}
										sx={{ ...TOUCH_ICON_BUTTON_SX, ml: "auto" }}
									>
										<TrashIcon size={18} />
									</IconButton>
								</Box>

								{task.source === "ADHOC" ? (
									<TextField
										label="Task"
										value={task.task_desc}
										onChange={(e) => onUpdate(task.row_id, { task_desc: e.target.value })}
										size="small"
										fullWidth
										multiline
										minRows={2}
										placeholder="Describe the task done"
										disabled={disabled}
										InputLabelProps={{ shrink: true }}
										inputProps={{ maxLength: 255 }}
										error={task.task_desc.trim() === ""}
										sx={{ mb: 1.5 }}
									/>
								) : (
									<Typography variant="body2" sx={{ ...WRAP_SX, mb: 1.5, fontWeight: 500 }}>
										{task.task_desc}
									</Typography>
								)}

								{useSegmented ? (
									<ToggleButtonGroup
										exclusive
										fullWidth
										size="medium"
										color={failed ? "error" : "primary"}
										value={task.result}
										disabled={disabled}
										aria-label="Result"
										onChange={(_event, next: string | null) => setResult(task, next)}
										sx={{
											mb: 1.5,
											"& .MuiToggleButton-root": { minHeight: TOUCH_TARGET, flex: 1 },
										}}
									>
										{options.map((option) => (
											<ToggleButton key={option.value} value={option.value}>
												{option.label}
											</ToggleButton>
										))}
									</ToggleButtonGroup>
								) : (
									<Box sx={{ mb: 1.5 }}>
										<SearchableSelect<ResultOption>
											variant="outlined"
											size="medium"
											fullWidth
											clearable={false}
											disabled={disabled}
											label="Result"
											options={options}
											value={findOption(task.result)}
											onChange={(option) => setResult(task, option ? option.value : null)}
											getOptionLabel={(option) => option.label}
											getOptionKey={(option) => option.value}
											isOptionEqualToValue={(option, current) =>
												option.value === current.value
											}
										/>
									</Box>
								)}

								<TextField
									label="Observation"
									value={task.observation}
									onChange={(e) => onUpdate(task.row_id, { observation: e.target.value })}
									size="small"
									fullWidth
									multiline
									minRows={2}
									disabled={disabled}
									InputLabelProps={{ shrink: true }}
									placeholder={failed ? "What is wrong?" : "Optional"}
									inputProps={{ maxLength: 255 }}
								/>
							</Paper>
						);
					})}
				</Box>
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
