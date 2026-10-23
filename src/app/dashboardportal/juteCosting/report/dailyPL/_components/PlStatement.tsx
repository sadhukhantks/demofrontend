"use client";

/**
 * The P&L statement in the owner's order (ITM-027): Realisation (Sacking /
 * Hessian inline, muted), heads 1–4 (raw material, stores, electricity,
 * wages) → Contribution, head 5 (overheads) → Operating profit, head 6
 * (capital cost) → Net. Every head carries its period money in lakh, its
 * ₹ per tonne of cloth, the benchmark ₹/t (industry rule of thumb or a keyed
 * BENCH_* parameter) and the verdict in words — "₹1,086 below rule of
 * thumb" — toned, never colour alone. Sub-lines of a head sit under a
 * chevron, collapsed by default; an estimated head (overheads at ₹2,000/t
 * until a parameter is keyed) wears an "est." chip and a caption; an
 * unavailable head prints "—" and says why.
 *
 * Head 6 carries the "Include capital cost in net" switch, OFF by default
 * (the owner's note: jute bought on 60–90 days credit carries its interest
 * in the jute price). While OFF, Net = Operating profit and the capital row
 * is a greyed memo. "Details" opens the lazy HeadDialog for heads with a
 * breakdown; head 1 also opens the jute-issue data check.
 *
 * Desktop: one table. Phone: one card per row, buttons full width. The
 * statement sits inside `.pl-print-root`, so it prints; the dialogs are
 * portals outside it and never print. The dialogs render beside (not inside)
 * the phone / desktop layout, so crossing the breakpoint while one is open
 * does not remount it, and the open head is held by KEY and looked up in the
 * current statement on every render, so a page refetch updates its tiles.
 */

import React from "react";
import {
	Box,
	Button,
	Chip,
	Collapse,
	FormControlLabel,
	IconButton,
	Paper,
	Switch,
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
import { ChevronDown, ChevronRight } from "lucide-react";
import { SectionCard } from "../../../../juteProduction/report/dailyProductionReport/_components/DprPieces";
import type {
  DailyPlCapital,
  DailyPlStatement,
  NotKeyed,
  StatementAmount,
  StatementHead,
  StatementHeadKey,
  StatementLine,
} from "../_service";
import { fmtLakh, fmtMoney, fmtRupee, fmtT } from "../dayColumns";
import {
	capitalFgLabel,
	conversionRow,
	fgDetail,
	headReason,
	lineDetail,
	netShown,
	statementCoverage,
	vsBenchmark,
	type Verdict,
} from "../statement";
import HeadDialog from "./HeadDialog";
import JuteIssueCheckDialog from "./JuteIssueCheckDialog";

export interface PlStatementProps {
	statement: DailyPlStatement;
	capital: DailyPlCapital | null;
	notKeyed: ReadonlyArray<NotKeyed>;
	/** "MTD" / "Period" — the column header. */
	periodLabel: string;
	coId: number;
	branchId: number | null;
	/** The fetched period (meta.date_from / date_to), so the dialogs match the shown figures. */
	dateFrom: string;
	dateTo: string;
	/** The page is refetching — the Details / Check issue data buttons wait for the new figures. */
	loading?: boolean;
	}

const CAPITAL_SWITCH_LABEL = "Include capital cost in net";

/** A sub-line as rendered: the backend line, optionally with a detail text of its own. */
type RenderLine = StatementLine & { detail?: string };

const detailOf = (l: RenderLine): string => l.detail ?? lineDetail(l);

/** Short form of the benchmark source for the Benchmark column. */
function benchmarkCaption(head: StatementHead): string {
	if (head.benchmark_per_t == null) return head.benchmark_label ?? "";
	return head.benchmark_label === "keyed" ? "keyed" : "rule of thumb";
}

const toneColor = (v: Verdict): string | undefined =>
	v.tone === "good" ? "success.main" : v.tone === "warn" ? "warning.main" : undefined;

/** The stock position behind head 6, one line, for the memo caption. */
function capitalCaption(capital: DailyPlCapital | null, head: StatementHead): string {
	const parts: string[] = [];
	if (capital) {
		if (capital.jute_stock_value != null) {
			parts.push(`jute stock ${capital.jute_stock_kg != null ? `${fmtT(capital.jute_stock_kg / 1000)} t / ` : ""}${fmtLakh(capital.jute_stock_value)}`);
		}
		if (capital.fg_value != null) {
			parts.push(`finished goods ${capital.fg_t != null ? `${fmtT(capital.fg_t)} t / ` : ""}${fmtLakh(capital.fg_value)}`);
		}
		if (capital.other != null && capital.other !== 0) parts.push(`other ${fmtLakh(capital.other)}`);
		if (capital.pct != null) parts.push(`${fmtMoney(capital.pct, 2)} % p.a. ÷ 365 per day`);
	}
	const memo = head.memo ? head.memo : "";
	const pos = parts.length > 0 ? `position as read today${capital?.as_on ? ` for ${capital.as_on}` : ""}: ${parts.join(" · ")}` : "";
	return [memo, pos].filter(Boolean).join(" — ");
}

export default function PlStatement({
	statement,
	capital,
	notKeyed,
	periodLabel,
	coId,
	branchId,
	dateFrom,
	dateTo,
	loading = false,
	}: PlStatementProps) {
	const theme = useTheme();
	// One layout is MOUNTED, not CSS-hidden (noSsr: the body renders only after the client-side fetch).
	const isPhone = useMediaQuery(theme.breakpoints.down("md"), { noSsr: true });
	const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
	const [includeCapital, setIncludeCapital] = React.useState(false);
	const [dialogKey, setDialogKey] = React.useState<StatementHeadKey | null>(null);
	const [checkOpen, setCheckOpen] = React.useState(false);

	const toggle = React.useCallback((key: string) => setExpanded((s) => ({ ...s, [key]: !s[key] })), []);
	const openCheck = React.useCallback(() => setCheckOpen(true), []);
	const closeCheck = React.useCallback(() => setCheckOpen(false), []);
	const closeHead = React.useCallback(() => setDialogKey(null), []);

	const heads = statement.heads;
	// The open head, looked up in the CURRENT statement: a refetch while the dialog is open refreshes its tiles.
	const dialogHead = dialogKey == null ? null : (heads.find((h) => h.key === dialogKey) ?? null);
const net = netShown(statement, includeCapital);
	const netCaption = includeCapital
		? statement.net.period == null
			? "operating profit − capital cost — capital cost not available (see head 6)"
			: "operating profit − capital cost"
		: "= operating profit — capital cost excluded (switch on head 6 to include it)";
	const conv = statement.conversion_cost;
	// The backend's conversion cost includes wages, so its benchmark here is the ₹10,000 PLUS the wages head (as on the KPI tile).
	const convRow = conversionRow(statement);
	const CONVERSION_LABEL = "Conversion cost (stores + electricity + wages + overheads)";

	// ----- shared bits -----

	const headCaption = (head: StatementHead): string | null => {
		if (head.key === "capital") {
			const reason = head.not_keyed || !head.available ? headReason(head, notKeyed) : null;
			return [capitalCaption(capital, head), reason].filter(Boolean).join(" — ") || null;
		}
		if (head.not_keyed || head.estimated || !head.available) return headReason(head, notKeyed);
		return null;
	};

	/** Head 6's sub-lines name where the finished-goods tonnes come from and list the products. */
	const linesOf = (head: StatementHead): StatementLine[] =>
		head.key === "capital"
			? head.lines.map((l) =>
					l.key === "finished_goods"
						? { ...l, label: capitalFgLabel(capital, l.label), detail: fgDetail(capital) }
						: l,
				)
			: head.lines;
	/** Captions under a head's sub-lines (the capital position notes). */
	const notesOf = (head: StatementHead): string[] => (head.key === "capital" ? (capital?.notes ?? []) : []);
	const coverage = statementCoverage(statement);

	const actions = (head: StatementHead, full: boolean) => {
		if (!head.has_breakdown && !head.has_check) return null;
		return (
			<Box sx={{ display: "flex", gap: 0.75, flexDirection: full ? "column" : "row", flexWrap: "wrap" }}>
				{head.has_breakdown ? (
					<Button
						size="small"
						variant="outlined"
						disabled={loading}
						onClick={() => setDialogKey(head.key)}
						sx={{ textTransform: "none", minHeight: full ? 44 : 36, whiteSpace: "nowrap" }}
					>
						Details
					</Button>
				) : null}
				{head.has_check ? (
					<Button
						size="small"
						variant="outlined"
						color="warning"
						disabled={loading}
						onClick={openCheck}
						sx={{ textTransform: "none", minHeight: full ? 44 : 36, whiteSpace: "nowrap" }}
					>
						Check issue data
					</Button>
				) : null}
			</Box>
		);
	};

	const capitalSwitch = (
		<FormControlLabel
			control={
				<Switch
					size="small"
					checked={includeCapital}
					onChange={(e) => setIncludeCapital(e.target.checked)}
					slotProps={{ input: { "aria-label": CAPITAL_SWITCH_LABEL } }}
				/>
			}
			label={<Typography variant="caption">{CAPITAL_SWITCH_LABEL}</Typography>}
			sx={{ ml: 0, mr: 0, minHeight: isPhone ? 44 : 36, displayPrint: "none" }}
		/>
	);

	const dialogs = (
		<>
			<HeadDialog
				open={dialogHead != null}
				head={dialogHead}
				onClose={closeHead}
				coId={coId}
				branchId={branchId}
				dateFrom={dateFrom}
				dateTo={dateTo}
				pricedDays={statement.priced_days ?? null}
				onCheck={openCheck}
			/>
			<JuteIssueCheckDialog
				open={checkOpen}
				onClose={closeCheck}
				coId={coId}
				branchId={branchId}
				dateFrom={dateFrom}
				dateTo={dateTo}
			/>
		</>
	);

	const subtitle = `${periodLabel} money in lakh · ₹/t over the cloth tonnes of the priced days · benchmarks: industry rule of thumb unless keyed (BENCH_*) · — = not available, never 0`;

	// ----- phone: one card per row -----

	const renderPhone = () => {
		const lineList = (lines: RenderLine[], notes: string[] = []) => (
			<Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 0.5 }}>
				{lines.map((l, i) => {
					const detail = detailOf(l);
					return (
						<Box key={l.key ?? l.code ?? `${l.label}-${i}`} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
							<Box sx={{ flexGrow: 1, minWidth: 0 }}>
								<Typography variant="body2" color="text.secondary">
									{l.label}
								</Typography>
								{detail ? (
									<Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
										{detail}
									</Typography>
								) : null}
							</Box>
							<Box sx={{ textAlign: "right", flexShrink: 0 }}>
								<Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
									{fmtLakh(l.period)}
								</Typography>
								<Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
									{fmtRupee(l.per_t)}/t
								</Typography>
							</Box>
						</Box>
					);
				})}
				{notes.map((n) => (
					<Typography key={n} variant="caption" color="text.secondary">
						{n}
					</Typography>
				))}
			</Box>
		);

		const totalCard = (key: string, label: string, amount: StatementAmount, caption?: string) => (
			<Paper key={key} variant="outlined" sx={{ p: 1.25, bgcolor: "action.selected" }}>
				<Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
					<Typography variant="subtitle2" fontWeight={700} sx={{ flexGrow: 1 }}>
						{label}
					</Typography>
					<Typography variant="h6" sx={{ fontVariantNumeric: "tabular-nums", lineHeight: 1.3 }}>
						{fmtLakh(amount.period)}
					</Typography>
				</Box>
				<Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
					{fmtRupee(amount.per_t)} per t cloth
				</Typography>
				{caption ? (
					<Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
						{caption}
					</Typography>
				) : null}
			</Paper>
		);

		const headCard = (head: StatementHead) => {
			const verdict = vsBenchmark(head.per_t, head.benchmark_per_t, head.benchmark_label, head.estimated);
			const caption = headCaption(head);
			const isCapital = head.key === "capital";
			const muted = isCapital && !includeCapital;
			const open = !!expanded[head.key];
			return (
				<Paper key={head.key} variant="outlined" sx={{ p: 1.25, opacity: muted ? 0.7 : 1 }}>
					<Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
						<Typography variant="subtitle2" fontWeight={700} sx={{ flexGrow: 1 }}>
							{head.no} · {head.label}
						</Typography>
						{head.estimated ? <Chip size="small" label="est." color="warning" variant="outlined" /> : null}
						{muted ? <Chip size="small" label="memo" variant="outlined" /> : null}
					</Box>
					<Typography variant="h6" sx={{ fontVariantNumeric: "tabular-nums", lineHeight: 1.3 }}>
						{head.available ? fmtLakh(head.period) : "—"}
					</Typography>
					<Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
						{head.available ? fmtRupee(head.per_t) : "—"} per t cloth
						{head.benchmark_per_t != null ? ` · benchmark ${fmtRupee(head.benchmark_per_t)}/t (${benchmarkCaption(head)})` : ""}
					</Typography>
					{verdict.text ? (
						<Typography variant="body2" sx={{ color: toneColor(verdict), fontWeight: 600 }}>
							{verdict.text}
						</Typography>
					) : head.benchmark_per_t == null && head.benchmark_label ? (
						<Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
							benchmark: {head.benchmark_label}
						</Typography>
					) : null}
					{caption ? (
						<Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
							{caption}
						</Typography>
					) : null}
					{isCapital ? <Box sx={{ mt: 0.5 }}>{capitalSwitch}</Box> : null}
					{head.lines.length > 0 ? (
						<>
							<Button
								size="small"
								onClick={() => toggle(head.key)}
								startIcon={open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
								sx={{ textTransform: "none", minHeight: 44, px: 0.5, mt: 0.25, displayPrint: "none" }}
								aria-expanded={open}
							>
								{open ? "Hide" : "Show"} {head.lines.length} line{head.lines.length === 1 ? "" : "s"}
							</Button>
							<Collapse in={open} unmountOnExit>
								{lineList(linesOf(head), notesOf(head))}
							</Collapse>
						</>
					) : null}
					<Box sx={{ mt: 1, displayPrint: "none" }}>{actions(head, true)}</Box>
				</Paper>
			);
		};

		return (
			<SectionCard title="Profit and loss" subtitle={subtitle}>
				<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
					<Paper variant="outlined" sx={{ p: 1.25 }}>
						<Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
							<Typography variant="subtitle2" fontWeight={700} sx={{ flexGrow: 1 }}>
								Realisation
							</Typography>
							<Typography variant="h6" sx={{ fontVariantNumeric: "tabular-nums", lineHeight: 1.3 }}>
								{fmtLakh(statement.realisation.period)}
							</Typography>
						</Box>
						<Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
							{fmtRupee(statement.realisation.per_t)} per t cloth
						</Typography>
						{lineList(statement.realisation.lines)}
					</Paper>
					{heads.filter((h) => h.no <= 4).map(headCard)}
					{totalCard("contribution", "Contribution", statement.contribution, "realisation − heads 1 to 4")}
					{heads.filter((h) => h.no === 5).map(headCard)}
					{totalCard("operating_profit", "Operating profit", statement.operating_profit, "contribution − overheads")}
					{heads.filter((h) => h.no === 6).map(headCard)}
					{totalCard("net", "Net", net, netCaption)}
					{coverage ? (
						<Typography variant="caption" color="text.secondary">
							{coverage}
						</Typography>
					) : null}
					<Paper variant="outlined" sx={{ p: 1.25 }}>
						<Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
							{CONVERSION_LABEL}
						</Typography>
						<Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
							{fmtLakh(conv.period)} · {fmtRupee(convRow.perT)} per t
							{convRow.benchmarkPerT != null ? ` · benchmark ${convRow.benchmarkText}` : ""}
						</Typography>
						{convRow.verdict.text ? (
							<Typography variant="body2" sx={{ color: toneColor(convRow.verdict), fontWeight: 600 }}>
								{convRow.verdict.text}
							</Typography>
						) : null}
					</Paper>
				</Box>
			</SectionCard>
		);
	};

	// ----- desktop: one table -----

	const lineRows = (lines: RenderLine[], parentKey: string, notes: string[] = []) => [
		...lines.map((l, i) => {
			const detail = detailOf(l);
			return (
				<TableRow key={`${parentKey}-${l.key ?? l.code ?? i}`} className="subline">
					<TableCell sx={{ pl: 7 }}>
						{l.label}
						{detail ? (
							<Typography variant="caption" color="text.secondary" component="span" sx={{ display: "block" }}>
								{detail}
							</Typography>
						) : null}
					</TableCell>
					<TableCell className="num">{fmtLakh(l.period)}</TableCell>
					<TableCell className="num">{fmtRupee(l.per_t)}</TableCell>
					<TableCell />
					<TableCell />
					<TableCell sx={{ displayPrint: "none" }} />
				</TableRow>
			);
		}),
		...notes.map((n, i) => (
			<TableRow key={`${parentKey}-note-${i}`} className="subline">
				<TableCell colSpan={5} sx={{ pl: 7, whiteSpace: "normal" }}>
					<Typography variant="caption" color="text.secondary">
						{n}
					</Typography>
				</TableCell>
				<TableCell sx={{ displayPrint: "none" }} />
			</TableRow>
		)),
	];

	const totalRow = (key: string, label: string, amount: StatementAmount, caption?: string) => (
		<TableRow key={key} className="total">
			<TableCell>
				{label}
				{caption ? (
					<Typography variant="caption" color="text.secondary" component="span" sx={{ display: "block", fontWeight: 400 }}>
						{caption}
					</Typography>
				) : null}
			</TableCell>
			<TableCell className="num">{fmtLakh(amount.period)}</TableCell>
			<TableCell className="num">{fmtRupee(amount.per_t)}</TableCell>
			<TableCell />
			<TableCell />
			<TableCell sx={{ displayPrint: "none" }} />
		</TableRow>
	);

	const headRows = (head: StatementHead) => {
		const verdict = vsBenchmark(head.per_t, head.benchmark_per_t, head.benchmark_label, head.estimated);
		const caption = headCaption(head);
		const isCapital = head.key === "capital";
		const muted = isCapital && !includeCapital;
		const open = !!expanded[head.key];
		const hasLines = head.lines.length > 0;
		return (
			<React.Fragment key={head.key}>
				<TableRow className={muted ? "memo" : undefined}>
					<TableCell>
						<Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.5 }}>
							{hasLines ? (
								<IconButton
									size="small"
									aria-label={`${open ? "Hide" : "Show"} lines of ${head.label}`}
									aria-expanded={open}
									onClick={() => toggle(head.key)}
									sx={{ mt: -0.25, displayPrint: "none" }}
								>
									{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
								</IconButton>
							) : (
								<Box sx={{ width: 34, flexShrink: 0 }} />
							)}
							<Box sx={{ minWidth: 0 }}>
								<Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
									<Typography variant="body2" fontWeight={600}>
										{head.no} · {head.label}
									</Typography>
									{head.estimated ? <Chip size="small" label="est." color="warning" variant="outlined" /> : null}
									{muted ? <Chip size="small" label="memo" variant="outlined" /> : null}
								</Box>
								{caption ? (
									<Typography variant="caption" color="text.secondary" component="span" sx={{ display: "block", whiteSpace: "normal" }}>
										{caption}
									</Typography>
								) : null}
								{isCapital ? capitalSwitch : null}
							</Box>
						</Box>
					</TableCell>
					<TableCell className="num">{head.available ? fmtLakh(head.period) : "—"}</TableCell>
					<TableCell className="num">{head.available ? fmtRupee(head.per_t) : "—"}</TableCell>
					<TableCell className="num">
						{head.benchmark_per_t != null ? fmtRupee(head.benchmark_per_t) : "—"}
						{benchmarkCaption(head) ? (
							<Typography
								variant="caption"
								color="text.secondary"
								component="span"
								sx={{ display: "block", whiteSpace: "normal", maxWidth: 300 }}
							>
								{benchmarkCaption(head)}
							</Typography>
						) : null}
					</TableCell>
					<TableCell>
						{verdict.text ? (
							<Typography variant="body2" sx={{ color: toneColor(verdict), fontWeight: 600, whiteSpace: "nowrap" }}>
								{verdict.text}
							</Typography>
						) : null}
					</TableCell>
					<TableCell sx={{ displayPrint: "none" }}>{actions(head, false)}</TableCell>
				</TableRow>
				{open ? lineRows(linesOf(head), head.key, notesOf(head)) : null}
			</React.Fragment>
		);
	};

	const renderDesktop = () => (
	<SectionCard title="Profit and loss" subtitle={subtitle}>
	<TableContainer sx={{ overflowX: "auto" }}>
				<Table
					size="small"
					sx={{
						"& th": { fontWeight: 700, whiteSpace: "nowrap", bgcolor: "action.hover", py: 0.5 },
						"& td": { py: 0.6, verticalAlign: "top" },
						"& .num": { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
						"& .total td": { fontWeight: 700, bgcolor: "action.selected" },
						"& .subline td": { color: "text.secondary", py: 0.25, borderBottom: 0 },
						"& .memo td": { color: "text.disabled" },
						"& .memo .num": { color: "text.disabled" },
						"@media print": { "& td, & th": { whiteSpace: "normal" } },
					}}
				>
					<TableHead>
						<TableRow>
							<TableCell>Head</TableCell>
							<TableCell className="num">{periodLabel} ₹</TableCell>
							<TableCell className="num">₹/t cloth</TableCell>
							<TableCell className="num">Benchmark ₹/t</TableCell>
							<TableCell>vs benchmark</TableCell>
							<TableCell sx={{ displayPrint: "none" }}>Details</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						<TableRow>
							<TableCell>
								<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
									<Box sx={{ width: 34, flexShrink: 0 }} />
									<Typography variant="body2" fontWeight={600}>
										Realisation
									</Typography>
								</Box>
							</TableCell>
							<TableCell className="num">{fmtLakh(statement.realisation.period)}</TableCell>
							<TableCell className="num">{fmtRupee(statement.realisation.per_t)}</TableCell>
							<TableCell />
							<TableCell />
							<TableCell sx={{ displayPrint: "none" }} />
						</TableRow>
						{lineRows(statement.realisation.lines, "realisation")}
						{heads.filter((h) => h.no <= 4).map(headRows)}
						{totalRow("contribution", "Contribution", statement.contribution, "realisation − heads 1 to 4")}
						{heads.filter((h) => h.no === 5).map(headRows)}
						{totalRow("operating_profit", "Operating profit", statement.operating_profit, "contribution − overheads")}
						{heads.filter((h) => h.no === 6).map(headRows)}
						{totalRow("net", "Net", net, netCaption)}
						<TableRow className="subline">
							<TableCell sx={{ pl: 5.25 }}>{CONVERSION_LABEL}</TableCell>
							<TableCell className="num">{fmtLakh(conv.period)}</TableCell>
							<TableCell className="num">{fmtRupee(convRow.perT)}</TableCell>
							<TableCell className="num" sx={{ whiteSpace: "normal", minWidth: 150 }}>
								{convRow.benchmarkText}
							</TableCell>
							<TableCell>
								{convRow.verdict.text ? (
									<Typography variant="body2" sx={{ color: toneColor(convRow.verdict), fontWeight: 600, whiteSpace: "nowrap" }}>
										{convRow.verdict.text}
									</Typography>
								) : null}
							</TableCell>
							<TableCell sx={{ displayPrint: "none" }} />
						</TableRow>
					</TableBody>
				</Table>
			</TableContainer>
			{coverage ? (
				<Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.75 }}>
					{coverage}
				</Typography>
			) : null}
		</SectionCard>
	);

	return (
		<>
			{isPhone ? renderPhone() : renderDesktop()}
			{dialogs}
		</>
	);
}
