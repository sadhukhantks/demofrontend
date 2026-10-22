"use client";

/**
 * The jute-issue data check (ITM-027 §1.6): fetches
 * `GET /daily_pl/jute_issue_checks` when it opens and lists the flagged
 * issue lines of the range — ₹0 values, no MR rate, value ≠ MR rate, rate
 * outliers, item mismatches, unapproved MRs, duplicates, over-issues,
 * future dates — with the suggested value (weight × MR rate) and an Open
 * link to the jute-issue screen for that day (the screen is keyed per day;
 * that is how the user re-evaluates the line). Summary chips filter by flag;
 * the kg-per-kg-cloth ratio and the no-issue days sit above the rows.
 * Full-screen on phones; one layout mounted (table on desktop, cards on
 * phones).
 */

import React from "react";
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
	IconButton,
	Paper,
	Stack,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Typography,
	useMediaQuery,
	useTheme,
} from "@mui/material";
import { ExternalLink as OpenIcon, RefreshCw as ReloadIcon, X as CloseIcon } from "lucide-react";
import { DIALOG_ACTIONS_SX } from "@/components/ui/responsiveEntry";
import { fetchJuteIssueChecks, type JuteIssueCheckData, type JuteIssueCheckRow } from "../_service";
import { fmtMoney, fmtT, shortDate } from "../dayColumns";

export interface JuteIssueCheckDialogProps {
	open: boolean;
	onClose: () => void;
	coId: number;
	branchId: number | null;
	dateFrom: string;
	dateTo: string;
}

export const EMPTY_TEXT = "No issue with the jute issue lines in this range.";

/** Summary chips: long labels wrap instead of being cut, and the tap target is 44 px. */
const CHIP_SX = { height: "auto", minHeight: 44, "& .MuiChip-label": { whiteSpace: "normal", py: 0.5 } } as const;

function errText(e: unknown): string {
	return e instanceof Error && e.message ? e.message : "Failed to load the jute issue checks";
}

/** The jute-issue entry screen for one day — opened in a new tab. */
export function issueEditHref(issueDate: string, branchId: number | null): string {
	const qs = new URLSearchParams({ mode: "edit", date: issueDate });
	if (branchId != null) qs.set("branch_id", String(branchId));
	return `/dashboardportal/jutePurchase/juteIssue/edit?${qs.toString()}`;
}

/** The kg-per-kg ratio line, in words. */
export function ratioText(s: JuteIssueCheckData["summary"]): { text: string; severity: "info" | "warning" | "success" } {
	if (s.jute_kg_per_kg_cloth == null) {
		return { text: "Jute per kg cloth: — (no cloth or no jute issued in the range)", severity: "info" };
	}
	const std = s.std ?? 1.06;
	const base = `Jute per kg cloth ${s.jute_kg_per_kg_cloth.toFixed(2)} vs std ${std.toFixed(2)}`;
	if (s.ratio_flag === "LOW") return { text: `${base} — LOW (below 0.90): issue lines may be missing or under-weighed`, severity: "warning" };
	if (s.ratio_flag === "HIGH") return { text: `${base} — HIGH (above 1.25): issue lines may be duplicated or over-weighed`, severity: "warning" };
	return { text: `${base} — within range`, severity: "success" };
}

const money = (v: number | null | undefined): string => fmtMoney(v);
const qtl = (v: number | null | undefined): string => fmtMoney(v, 2);
const mrRef = (r: JuteIssueCheckRow): string => {
	const parts = [r.branch_mr_no, r.jute_gate_entry_no ? `GE ${r.jute_gate_entry_no}` : null].filter(Boolean);
	return parts.length > 0 ? parts.join(" · ") : r.jute_mr_id != null ? `MR #${r.jute_mr_id}` : "—";
};

interface LoadState {
	loading: boolean;
	error: string | null;
	data: JuteIssueCheckData | null;
}

const IDLE: LoadState = { loading: false, error: null, data: null };

/** "(at MR rate)" / "(at period median)" after the suggested value. */
export function suggestedBasisText(basis: JuteIssueCheckRow["suggested_basis"]): string {
	return basis === "mr_rate" ? " (at MR rate)" : basis === "median" ? " (at period median)" : "";
}

/**
 * The caption under the chips: the backend's notes (the waste-ledger lines that sit outside the check),
 * else — on a backend that sends only the summary — the same sentence built from the waste-ledger totals.
 */
export function checkNotesText(data: JuteIssueCheckData): string {
	const notes = (data.notes ?? []).filter(Boolean);
	if (notes.length > 0) return notes.join(" · ");
	const n = data.summary.waste_ledger_lines;
	if (n == null || n <= 0) return "";
	const kg = data.summary.waste_ledger_kg;
	return `${n} waste-ledger line${n === 1 ? "" : "s"}${kg != null ? ` (${fmtT(kg / 1000)} t)` : ""} are outside this check`;
}

/** The DUPLICATE chip says how big its group is ("×3"). */
function flagChipLabel(row: JuteIssueCheckRow, code: string, labels: Record<string, string>): string {
	const base = labels[code] ?? code;
	if (code === "DUPLICATE" && row.dup_group_size != null && row.dup_group_size > 1) return `${base} ×${row.dup_group_size}`;
	return base;
}

function FlagChips({ row, labels }: { row: JuteIssueCheckRow; labels: Record<string, string> }) {
	return (
		<Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
			{row.flags.map((f) => (
				<Chip
					key={f}
					size="small"
					variant="outlined"
					color="warning"
					title={f === "DUPLICATE" && row.dup_seconds != null ? `keyed ${row.dup_seconds} s apart` : undefined}
					label={flagChipLabel(row, f, labels)}
					sx={{ height: "auto", "& .MuiChip-label": { whiteSpace: "normal", py: 0.25 } }}
				/>
			))}
		</Box>
	);
}

function OpenLink({ row, branchId, full }: { row: JuteIssueCheckRow; branchId: number | null; full?: boolean }) {
	return (
		<Button
			component="a"
			href={issueEditHref(row.issue_date, branchId)}
			target="_blank"
			rel="noopener noreferrer"
			size="small"
			variant="outlined"
			endIcon={<OpenIcon size={14} />}
			sx={{ textTransform: "none", minHeight: full ? 44 : 32, width: full ? "100%" : "auto" }}
		>
			Open{full ? ` ${shortDate(row.issue_date)}` : ""}
		</Button>
	);
}

export default function JuteIssueCheckDialog({ open, onClose, coId, branchId, dateFrom, dateTo }: JuteIssueCheckDialogProps) {
	const theme = useTheme();
	// One layout is MOUNTED, not CSS-hidden (noSsr: the dialog only renders client-side).
	const isPhone = useMediaQuery(theme.breakpoints.down("md"), { noSsr: true });
	const [state, setState] = React.useState<LoadState>(IDLE);
	const [reloadNo, setReloadNo] = React.useState(0);
	const [flag, setFlag] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (!open) {
			setState(IDLE);
			setFlag(null);
			return;
		}
		let alive = true;
		setState({ loading: true, error: null, data: null });
		void (async () => {
			try {
				const data = await fetchJuteIssueChecks({ coId, branchId, dateFrom, dateTo });
				if (alive) {
					setState({ loading: false, error: null, data });
					// A reload may have cleared the flag the user was filtering on — back to "All".
					setFlag((f) => (f != null && !data.rows.some((r) => r.flags.includes(f)) ? null : f));
				}
			} catch (e: unknown) {
				if (alive) setState({ loading: false, error: errText(e), data: null });
			}
		})();
		return () => {
			alive = false;
		};
	}, [open, coId, branchId, dateFrom, dateTo, reloadNo]);

	const reload = React.useCallback(() => setReloadNo((n) => n + 1), []);
	const data = state.data;
	const labels = React.useMemo(() => data?.flag_labels ?? {}, [data]);
	// One chip per flag that hit a listed line. A day-level flag (NO_ISSUE_DAY) sits on no row, so a
	// chip for it would filter the table to nothing — it stays in the day-flags alert instead.
	const flagCounts = React.useMemo(() => {
		const by = data?.summary.by_flag ?? {};
		const onRows = new Set((data?.rows ?? []).flatMap((r) => r.flags));
		return Object.entries(by)
			.filter((e): e is [string, number] => typeof e[1] === "number" && e[1] > 0 && onRows.has(e[0]))
			.sort((a, b) => b[1] - a[1]);
	}, [data]);
	const checksRun = React.useMemo(() => Object.values(labels).join(" · "), [labels]);
	const thresholds = React.useMemo(() => {
		const t = data?.meta?.thresholds;
		if (!t || typeof t !== "object") return "";
		return Object.entries(t)
			.map(([k, v]) => `${k} ${String(v)}`)
			.join(" · ");
	}, [data]);
	const rows = React.useMemo(() => {
		const all = data?.rows ?? [];
		return flag == null ? all : all.filter((r) => r.flags.includes(flag));
	}, [data, flag]);
	const empty = data != null && data.rows.length === 0 && data.day_flags.length === 0;
	const ratio = data ? ratioText(data.summary) : null;

	return (
		<Dialog open={open} onClose={onClose} fullScreen={isPhone} fullWidth maxWidth="xl">
			<DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
				<Box sx={{ flexGrow: 1, minWidth: 0 }}>
					Jute issue data check
					<Typography variant="caption" color="text.secondary" component="span" sx={{ display: "block" }}>
						{dateFrom} to {dateTo} — wrong, un-updated or ₹0 values keyed in the jute issue
					</Typography>
				</Box>
				<IconButton aria-label="Reload" onClick={reload} disabled={state.loading} sx={{ minWidth: 44, minHeight: 44 }}>
					<ReloadIcon size={18} />
				</IconButton>
				<IconButton aria-label="Close" onClick={onClose} sx={{ minWidth: 44, minHeight: 44 }}>
					<CloseIcon size={20} />
				</IconButton>
			</DialogTitle>
			<DialogContent dividers sx={{ bgcolor: "background.default" }}>
				{state.loading ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
						<CircularProgress />
					</Box>
				) : state.error ? (
					<Alert
						severity="error"
						action={
							<Button color="inherit" size="small" onClick={reload} sx={{ textTransform: "none" }}>
								Reload
							</Button>
						}
					>
						{state.error}
					</Alert>
				) : data ? (
					<Stack spacing={1.5}>
						{/* Summary chips: one per flag with its count; tap to filter. */}
						<Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, alignItems: "center" }}>
							<Chip
								label={`All · ${data.summary.flagged} of ${data.summary.lines} lines flagged`}
								color={flag == null ? "primary" : "default"}
								variant={flag == null ? "filled" : "outlined"}
								onClick={() => setFlag(null)}
								sx={CHIP_SX}
							/>
							{flagCounts.map(([code, n]) => (
								<Chip
									key={code}
									label={`${labels[code] ?? code} · ${n}`}
									color={flag === code ? "primary" : "default"}
									variant={flag === code ? "filled" : "outlined"}
									onClick={() => setFlag(flag === code ? null : code)}
									sx={CHIP_SX}
								/>
							))}
						</Box>

						{checkNotesText(data) ? (
							<Typography variant="caption" color="text.secondary" component="p" sx={{ mt: -0.5 }}>
								{checkNotesText(data)}
							</Typography>
						) : null}

						{data.summary.identical_pairs != null && data.summary.identical_pairs > 0 ? (
							<Typography variant="caption" color="text.secondary" component="p" sx={{ mt: -0.5 }}>
								{data.summary.identical_pairs} identical pair{data.summary.identical_pairs === 1 ? "" : "s"} (same day, MR line,
								weight) not flagged — repeated trolley weights are normal
							</Typography>
						) : null}

						{ratio ? (
							<Alert severity={ratio.severity} sx={{ py: 0.25 }}>
								{ratio.text}
								{data.summary.issued_kg != null || data.summary.cloth_t != null
									? ` · ${money(data.summary.issued_kg)} kg issued · ${fmtT(data.summary.cloth_t)} t cloth`
									: ""}
							</Alert>
						) : null}

						{data.day_flags.length > 0 ? (
							<Alert severity="warning" sx={{ py: 0.25 }}>
								<Typography variant="body2" sx={{ fontWeight: 700 }}>
									Cloth woven with no jute issue booked
								</Typography>
								<Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 0.75 }}>
									{data.day_flags.map((d) => (
										<Button
											key={d.tran_date}
											component="a"
											href={issueEditHref(d.tran_date, branchId)}
											target="_blank"
											rel="noopener noreferrer"
											size="small"
											variant="outlined"
											color="warning"
											endIcon={<OpenIcon size={14} />}
											sx={{ textTransform: "none", minHeight: isPhone ? 44 : 32, textAlign: "left" }}
										>
											{`${shortDate(d.tran_date)} · ${fmtT(d.cloth_t)} t cloth, ${money(d.issued_kg)} kg issued`}
										</Button>
									))}
								</Box>
							</Alert>
						) : null}

						{empty ? (
							<Alert severity="success">{EMPTY_TEXT}</Alert>
						) : rows.length === 0 ? (
							<Typography variant="body2" color="text.secondary">
								No line carries this flag.
							</Typography>
						) : isPhone ? (
							<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
								{rows.map((r) => (
									<Paper key={r.jute_issue_id} variant="outlined" sx={{ p: 1.25 }}>
										<Typography variant="subtitle2" fontWeight={700}>
											{shortDate(r.issue_date)} · {r.item_name ?? "—"}
										</Typography>
										<Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
											{mrRef(r)}
											{r.mr_status ? ` · MR ${r.mr_status}` : ""}
										</Typography>
										<Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 0.5, my: 0.75 }}>
											<Cell label="Weight kg" value={money(r.weight_kg)} />
											<Cell label="Booked ₹" value={money(r.issue_value)} />
											<Cell label="Implied ₹/qtl" value={qtl(r.implied_rate_qtl)} />
											<Cell label="MR ₹/qtl" value={qtl(r.mr_rate_qtl)} />
											<Cell label="Median ₹/qtl" value={qtl(r.median_rate_qtl)} />
											<Cell label="Suggested ₹" value={`${money(r.suggested_value)}${suggestedBasisText(r.suggested_basis)}`} />
										</Box>
										<FlagChips row={r} labels={labels} />
										<Box sx={{ mt: 1 }}>
											<OpenLink row={r} branchId={branchId} full />
										</Box>
									</Paper>
								))}
							</Box>
						) : (
							<TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto" }}>
								<Table
									size="small"
									stickyHeader
									sx={{
										"& th": { fontWeight: 700, whiteSpace: "nowrap", bgcolor: "action.hover", py: 0.5 },
										"& td": { py: 0.4, whiteSpace: "nowrap" },
										"& .num": { textAlign: "right", fontVariantNumeric: "tabular-nums" },
									}}
								>
									<TableHead>
										<TableRow>
											<TableCell>Date</TableCell>
											<TableCell />
											<TableCell>MR no / gate entry</TableCell>
											<TableCell>Item</TableCell>
											<TableCell className="num">Weight kg</TableCell>
											<TableCell className="num">Booked ₹</TableCell>
											<TableCell className="num">Implied ₹/qtl</TableCell>
											<TableCell className="num">MR ₹/qtl</TableCell>
											<TableCell className="num">Median ₹/qtl</TableCell>
											<TableCell className="num">Suggested ₹</TableCell>
											<TableCell>Flags</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{rows.map((r) => (
											<TableRow key={r.jute_issue_id} hover>
												<TableCell>{shortDate(r.issue_date)}</TableCell>
												<TableCell>
													<OpenLink row={r} branchId={branchId} />
												</TableCell>
												<TableCell>
													{mrRef(r)}
													{r.mr_status ? (
														<Typography variant="caption" color="text.secondary" component="span" sx={{ display: "block" }}>
															MR {r.mr_status}
														</Typography>
													) : null}
												</TableCell>
												<TableCell>{r.item_name ?? "—"}</TableCell>
												<TableCell className="num">{money(r.weight_kg)}</TableCell>
												<TableCell className="num">{money(r.issue_value)}</TableCell>
												<TableCell className="num">{qtl(r.implied_rate_qtl)}</TableCell>
												<TableCell className="num">{qtl(r.mr_rate_qtl)}</TableCell>
												<TableCell className="num">{qtl(r.median_rate_qtl)}</TableCell>
												<TableCell className="num">
													{money(r.suggested_value)}
													{r.suggested_basis ? (
														<Typography variant="caption" color="text.secondary" component="span" sx={{ display: "block" }}>
															{suggestedBasisText(r.suggested_basis).trim()}
														</Typography>
													) : null}
												</TableCell>
												<TableCell sx={{ whiteSpace: "normal", minWidth: 220 }}>
													<FlagChips row={r} labels={labels} />
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</TableContainer>
						)}
						<Typography variant="caption" color="text.secondary" component="p">
							Suggested ₹ = weight ÷ 100 × MR ₹/qtl, or × the period median ₹/qtl for this quality when the MR line has no
							rate. Open goes to the jute-issue screen for that day in a new tab; correct the line there and reload this
							check.
							{checksRun ? ` Checks run: ${checksRun}.` : ""}
							{thresholds ? ` Thresholds: ${thresholds}.` : ""}
						</Typography>
					</Stack>
				) : null}
			</DialogContent>
			<DialogActions sx={DIALOG_ACTIONS_SX}>
				<Button onClick={onClose} variant="outlined" sx={{ textTransform: "none" }}>
					Close
				</Button>
			</DialogActions>
		</Dialog>
	);
}

function Cell({ label, value }: { label: string; value: string }) {
	return (
		<Box sx={{ minWidth: 0 }}>
			<Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
				{label}
			</Typography>
			<Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
				{value}
			</Typography>
		</Box>
	);
}
