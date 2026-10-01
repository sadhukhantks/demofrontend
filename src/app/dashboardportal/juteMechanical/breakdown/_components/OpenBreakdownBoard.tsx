"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
	Divider,
	IconButton,
	Paper,
	Tooltip,
	Typography,
} from "@mui/material";
import { CheckCircle2 as CloseIcon, RefreshCw as RefreshIcon } from "lucide-react";
import {
	TOUCH_ICON_BUTTON_SX,
	TOUCH_TARGET,
} from "@/components/ui/responsiveEntry";
import type { OpenBreakdownRow } from "../hooks/useOpenBreakdowns";
import {
	BREAKDOWN_STATUS,
	elapsedSeverity,
	formatDateTimeDisplay,
	formatMinutes,
	statusFallbackLabel,
} from "../utils/breakdownCalc";

export interface OpenBreakdownBoardProps {
	/** Open incidents, already sorted longest-running first. */
	rows: ReadonlyArray<OpenBreakdownRow>;
	loading: boolean;
	error: string | null;
	/** code -> label from the setup enum. */
	statusLabels: ReadonlyMap<string, string>;
	onRefresh: () => void;
	/** Opens the close dialog for one incident. */
	onClose: (row: OpenBreakdownRow) => void;
	/** True while a close is in flight. */
	closing: boolean;
}

/**
 * The live board of machines that are still down.
 *
 * An incident lands here purely because its `restart_datetime` is NULL — which is
 * why the entry form treats a blank restart as meaningful rather than incomplete.
 * Longest-running first, because that is the one the shift supervisor has to act
 * on; the elapsed counters tick locally between server pulls.
 */
export default function OpenBreakdownBoard({
	rows,
	loading,
	error,
	statusLabels,
	onRefresh,
	onClose,
	closing,
}: OpenBreakdownBoardProps) {
	return (
		<Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 } }}>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 1.5,
					flexWrap: "wrap",
					mb: 1.5,
				}}
			>
				<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
					Machines currently down
				</Typography>
				<Chip
					size="small"
					color={rows.length === 0 ? "success" : "error"}
					label={rows.length === 0 ? "None" : `${rows.length} open`}
				/>
				{loading ? <CircularProgress size={16} /> : null}
				<Box sx={{ flexGrow: 1 }} />
				<Tooltip title="Refresh the board">
					<span>
						<IconButton size="small" onClick={onRefresh} sx={TOUCH_ICON_BUTTON_SX}>
							<RefreshIcon size={16} />
						</IconButton>
					</span>
				</Tooltip>
			</Box>

			{error ? (
				<Alert severity="error" sx={{ mb: 1.5 }}>
					{error}
				</Alert>
			) : null}

			{rows.length === 0 && !loading ? (
				<Typography variant="body2" color="text.secondary">
					No open breakdowns — every logged incident has a restart time.
				</Typography>
			) : null}

			<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
				{rows.map((row) => {
					const severity = elapsedSeverity(row.live_elapsed_min);
					const statusLabel =
						statusLabels.get(row.status) ?? statusFallbackLabel(row.status);

					return (
						<React.Fragment key={row.breakdown_id}>
							{/* One row on a desktop; on a phone it wraps into three bands —
							    the two chips, then the detail block, then a full-width
							    Close. `order` does the re-sequencing in CSS so the DOM
							    order (and the desktop layout) is untouched. */}
							<Box
								sx={{
									display: "flex",
									alignItems: "center",
									flexWrap: { xs: "wrap", md: "nowrap" },
									gap: 1.5,
									py: 1,
								}}
							>
								<Box
									sx={{
										minWidth: { xs: 0, md: 108 },
										display: "flex",
										alignItems: "center",
										gap: 1,
										order: { xs: 1, md: 0 },
									}}
								>
									<Chip
										size="small"
										color={severity}
										label={formatMinutes(row.live_elapsed_min)}
									/>
								</Box>

								<Box
									sx={{
										flexGrow: 1,
										minWidth: 0,
										flexBasis: { xs: "100%", md: "auto" },
										order: { xs: 3, md: 0 },
									}}
								>
									<Typography variant="body2" sx={{ fontWeight: 600 }}>
										{row.mech_code ? `${row.mech_code} — ` : ""}
										{row.machine_name ?? `Machine #${row.machine_id}`}
									</Typography>
									<Typography variant="caption" color="text.secondary" component="div">
										{row.reason_code ? `${row.reason_code} · ` : ""}
										{row.reason_desc ?? "No reason recorded"}
										{row.component_name ? ` · ${row.component_name}` : ""}
										{row.machine_type_name ? ` · ${row.machine_type_name}` : ""}
									</Typography>
									<Typography variant="caption" color="text.secondary" component="div">
										Stopped {formatDateTimeDisplay(row.stop_datetime)}
										{row.status === BREAKDOWN_STATUS.UNDER_REPAIR && row.response_min != null
											? ` · attended after ${formatMinutes(row.response_min)}`
											: " · not attended yet"}
										{row.reported_by_user_name || row.reported_by
											? ` · reported by ${row.reported_by_user_name ?? row.reported_by}`
											: ""}
									</Typography>
								</Box>

								<Chip
									size="small"
									variant="outlined"
									label={statusLabel}
									sx={{ order: { xs: 2, md: 0 } }}
								/>

								<Button
									size="small"
									variant="contained"
									startIcon={<CloseIcon size={16} />}
									disabled={closing}
									onClick={() => onClose(row)}
									sx={{
										minHeight: TOUCH_TARGET,
										whiteSpace: "nowrap",
										width: { xs: "100%", md: "auto" },
										order: { xs: 4, md: 0 },
									}}
								>
									Close
								</Button>
							</Box>
							<Divider />
						</React.Fragment>
					);
				})}
			</Box>
		</Paper>
	);
}
