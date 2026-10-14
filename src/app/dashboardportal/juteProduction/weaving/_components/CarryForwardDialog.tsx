"use client";

// TKT-000119 (1): "Fill from previous" — one action writes the unchanged mapping for every
// spell of a date range, instead of opening each date + spell and pressing Save Map.
// Preview (dry run) first, then Fill. Saved mappings are never changed; processed (locked)
// spells are skipped and listed.

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableRow,
	TextField,
	Typography,
} from "@mui/material";
import { SearchableMultiSelect } from "@/components/ui/SearchableSelect";
import {
	carryForwardQualityMap,
	carryForwardRequestSchema,
	firstIssue,
	type CarryForwardResult,
} from "@/utils/weavingQualityMapService";
import type { WeavingSpellOption } from "../types/weavingTypes";
import { summarizeFill } from "../utils/bulkMapping";
import { todayISO } from "../utils/weavingCalc";

interface CarryForwardDialogProps {
	open: boolean;
	onClose: () => void;
	coId: number;
	branchId: number;
	spells: readonly WeavingSpellOption[];
	/** The grid's applied date — default for both ends of the range. */
	defaultDate: string;
	/** Operator changes on the current grid that a fill (which reloads the grid) discards. */
	discardCount: number;
	onFilled: (result: CarryForwardResult) => void;
}

export default function CarryForwardDialog({
	open,
	onClose,
	coId,
	branchId,
	spells,
	defaultDate,
	discardCount,
	onFilled,
}: CarryForwardDialogProps) {
	const [fromDate, setFromDate] = React.useState(defaultDate);
	const [toDate, setToDate] = React.useState(defaultDate);
	const [spellIds, setSpellIds] = React.useState<number[]>(() => spells.map((s) => s.spell_id));
	const [preview, setPreview] = React.useState<CarryForwardResult | null>(null);
	const [previewKey, setPreviewKey] = React.useState<string | null>(null);
	const [busy, setBusy] = React.useState<"preview" | "fill" | null>(null);
	const [error, setError] = React.useState<string | null>(null);

	// Fresh state each time the dialog opens.
	React.useEffect(() => {
		if (!open) return;
		setFromDate(defaultDate);
		setToDate(defaultDate);
		setSpellIds(spells.map((s) => s.spell_id));
		setPreview(null);
		setPreviewKey(null);
		setError(null);
	}, [open, defaultDate, spells]);

	const today = todayISO();
	const request = {
		co_id: coId,
		branch_id: branchId,
		from_date: fromDate,
		to_date: toDate,
		spell_ids: spellIds,
		today,
	};
	const key = JSON.stringify(request);
	const validation = carryForwardRequestSchema.safeParse({ ...request, dry_run: true });
	const inputError = validation.success ? null : firstIssue(validation.error);
	const summary = preview ? summarizeFill(preview.cells) : null;
	const previewCurrent = preview != null && previewKey === key;

	const run = async (dryRun: boolean) => {
		setBusy(dryRun ? "preview" : "fill");
		setError(null);
		try {
			const result = await carryForwardQualityMap({ ...request, dry_run: dryRun });
			if (dryRun) {
				setPreview(result);
				setPreviewKey(key);
			} else {
				onFilled(result);
				onClose();
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "Fill from previous failed");
		} finally {
			setBusy(null);
		}
	};

	const spellOptions = spells.map((s) => ({ id: s.spell_id, label: s.spell_code }));

	return (
		<Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
			<DialogTitle>Fill from previous mapping</DialogTitle>
			<DialogContent>
				<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
					Every loom with no mapping for the chosen dates and spells gets its previous
					mapping. Mappings already saved are not changed. Processed (locked) spells are
					skipped.
				</Typography>
				<Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
					<TextField
						type="date"
						size="small"
						label="From"
						value={fromDate}
						onChange={(e) => setFromDate(e.target.value)}
						inputProps={{ max: today }}
						InputLabelProps={{ shrink: true }}
					/>
					<TextField
						type="date"
						size="small"
						label="To"
						value={toDate}
						onChange={(e) => setToDate(e.target.value)}
						inputProps={{ max: today }}
						InputLabelProps={{ shrink: true }}
					/>
					<Box sx={{ minWidth: 220 }}>
						<SearchableMultiSelect
							variant="outlined"
							size="small"
							label="Spells"
							options={spellOptions}
							value={spellOptions.filter((o) => spellIds.includes(o.id))}
							onChange={(opts) => setSpellIds(opts.map((o) => o.id))}
							getOptionLabel={(o) => o.label}
							isOptionEqualToValue={(o, v) => o.id === v.id}
							keepOpenOnSelect
						/>
					</Box>
					<Button
						variant="outlined"
						size="small"
						onClick={() => void run(true)}
						disabled={busy != null || inputError != null}
					>
						{busy === "preview" ? <CircularProgress size={16} /> : "Preview"}
					</Button>
				</Box>

				{inputError ? <Alert severity="warning" sx={{ mb: 2 }}>{inputError}</Alert> : null}
				{error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
				{discardCount > 0 ? (
					<Alert severity="warning" sx={{ mb: 2 }}>
						{discardCount} change(s) you made on the spell on screen are not saved. If the fill
						covers that spell they are discarded; press Save Map first to keep them.
					</Alert>
				) : null}

				{preview && summary ? (
					<>
						<Alert severity={summary.toFill > 0 ? "info" : "success"} sx={{ mb: 1 }}>
							{summary.toFill > 0
								? `${summary.toFill} loom mapping(s) will be filled across ${summary.cells} spell(s).`
								: "Nothing to fill: every loom already has a mapping for these spells."}
							{summary.noPrevious > 0
								? ` ${summary.noPrevious} loom/spell(s) have no previous mapping and stay blank.`
								: ""}
							{summary.fromProduction > 0
								? ` ${summary.fromProduction} take the quality already on their production entry.`
								: ""}
							{summary.restamp > 0
								? ` ${summary.restamp} production entr(ies) saved without a quality get it.`
								: ""}
							{!previewCurrent ? " Inputs changed — preview again." : ""}
						</Alert>
						<Box sx={{ maxHeight: 320, overflowY: "auto" }}>
							<Table size="small" stickyHeader>
								<TableHead>
									<TableRow>
										<TableCell>Date</TableCell>
										<TableCell>Spell</TableCell>
										<TableCell align="right">Already mapped</TableCell>
										<TableCell align="right">Will fill</TableCell>
										<TableCell align="right">No previous</TableCell>
										<TableCell>Status</TableCell>
									</TableRow>
								</TableHead>
								<TableBody>
									{preview.cells.map((c) => (
										<TableRow key={`${c.tran_date}-${c.spell_id}`}>
											<TableCell>{c.tran_date}</TableCell>
											<TableCell>{c.spell_code ?? c.spell_id}</TableCell>
											<TableCell align="right">{c.already_mapped}</TableCell>
											<TableCell align="right">{c.to_fill}</TableCell>
											<TableCell align="right">{c.no_previous}</TableCell>
											<TableCell>
												{c.locked ? (
													<Chip
														size="small"
														color="warning"
														variant="outlined"
														label={
															c.skipped_locked > 0
																? `Processed - ${c.skipped_locked} skipped`
																: "Processed"
														}
													/>
												) : null}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</Box>
					</>
				) : null}
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose} disabled={busy != null}>
					Cancel
				</Button>
				<Button
					variant="contained"
					onClick={() => void run(false)}
					disabled={busy != null || !previewCurrent || !summary || summary.toFill === 0}
				>
					{busy === "fill" ? (
						<CircularProgress size={16} />
					) : summary && previewCurrent && summary.toFill > 0 ? (
						`Fill ${summary.toFill} mapping(s)`
					) : (
						"Fill"
					)}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
