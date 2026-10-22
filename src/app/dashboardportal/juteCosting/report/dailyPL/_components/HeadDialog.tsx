"use client";

/**
 * The lazy breakdown of one P&L head (ITM-027 §1.5): the dialog fetches
 * `GET /daily_pl/breakdown?head=…` when it opens (once per opening; Reload
 * refetches) and renders the small aggregated tables the backend returns —
 * never line-level dumps. Full-screen on phones; one layout mounted (plain
 * tables on desktop, cards on phones) — no DataGrid inside a dialog.
 *
 * Raw material shows its KPIs first — jute per kg cloth against the std and
 * the count of ₹0-value issue lines — and the "Check issue data" button that
 * opens the jute-issue check. Wages shows hands × the wage rate in force.
 *
 * Scope: the statement covers the PRICED days only, while a breakdown covers
 * the whole range. The tiles that sit above the tables therefore read the
 * breakdown's own `summary` (so they add up with the tables below them), and a
 * caption says which days the statement figures cover. Jute per kg cloth, hands
 * per t and kWh per t need cloth tonnes, which only the statement has — those
 * stay statement figures. On close the last head stays rendered until the exit
 * transition ends, so the dialog does not blank while it fades out.
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
	Stack,
	Typography,
	useMediaQuery,
	useTheme,
} from "@mui/material";
import { RefreshCw as ReloadIcon, X as CloseIcon } from "lucide-react";
import { DIALOG_ACTIONS_SX } from "@/components/ui/responsiveEntry";
import { KpiCard } from "../../../../juteProduction/report/dailyProductionReport/_components/DprPieces";
import {
	fetchPlBreakdown,
	type BreakdownHead,
	type PlBreakdown,
	type PowerBreakdown,
	type RawMaterialBreakdown,
	type StatementHead,
	type StoresBreakdown,
	type WagesBreakdown,
} from "../_service";
import { fmtMoney, fmtRupee, fmtT, shortDate } from "../dayColumns";
import { kgPerKgVerdict } from "../statement";
import BreakdownSection, { type BreakdownCol } from "./BreakdownSection";

export interface HeadDialogProps {
	open: boolean;
	/** The head whose breakdown is shown; null keeps the dialog closed. */
	head: StatementHead | null;
	onClose: () => void;
	coId: number;
	branchId: number | null;
	dateFrom: string;
	dateTo: string;
	/** Days the statement covers (statement.priced_days); null/undefined = unknown, no caption. */
	pricedDays?: number | null;
	/** Opens the jute-issue data check — offered for the heads that have one (raw material). */
	onCheck?: () => void;
	}

	/** The range the breakdown covers and the days the statement behind the head's tiles covers. */
	interface Scope {
	pricedDays: number | null;
	dateFrom: string;
	dateTo: string;
	}

const BREAKDOWN_HEADS: ReadonlyArray<string> = ["raw_material", "stores", "power", "wages"];

function isBreakdownHead(key: string): key is BreakdownHead {
	return BREAKDOWN_HEADS.includes(key);
}

function errText(e: unknown): string {
	return e instanceof Error && e.message ? e.message : "Failed to load the breakdown";
}

const money = (v: number | null | undefined): string => fmtMoney(v);
const qtl = (v: number | null | undefined): string => fmtMoney(v, 2);
const count = (v: number | null | undefined): string => (v == null ? "—" : String(v));
const text = (v: string | null | undefined): string => (v == null || v === "" ? "—" : v);

interface LoadState {
	loading: boolean;
	error: string | null;
	data: PlBreakdown | null;
}

const IDLE: LoadState = { loading: false, error: null, data: null };

/** "Statement figures cover the 15 priced days; this breakdown covers the whole range 2026-10-01–2026-10-19". */
function ScopeCaption({ scope }: { scope: Scope }) {
	if (scope.pricedDays == null) return null;
	const n = scope.pricedDays;
	return (
		<Typography variant="caption" color="text.secondary" component="p">
			Statement figures cover the {n} priced day{n === 1 ? "" : "s"}; this breakdown covers the whole range {scope.dateFrom}–{scope.dateTo}.
		</Typography>
	);
}

function RawMaterialBody({
	data,
	head,
	isPhone,
	onCheck,
	scope,
}: {
	data: RawMaterialBreakdown;
	head: StatementHead;
	isPhone: boolean;
	onCheck?: () => void;
	scope: Scope;
}) {
	const k = head.kpis ?? {};
	// Ratio = jute ÷ cloth, so it is a statement figure; the rest of the tiles are the breakdown's own totals.
	const ratio = kgPerKgVerdict(k.jute_kg_per_kg_cloth, k.jute_kg_per_kg_cloth_std);
	const s = data.summary ?? {};
	const zero = s.zero_value_lines ?? k.zero_value_lines ?? null;
	const lines = s.lines ?? null;
	const issuedT = s.kg != null ? s.kg / 1000 : (k.jute_issued_t ?? null);
	const byQuality: BreakdownCol<RawMaterialBreakdown["by_quality"][number]>[] = [
		{ header: "Quality", cell: (r) => text(r.item_name) },
		{ header: "Lines", cell: (r) => count(r.lines), num: true },
		{ header: "kg", cell: (r) => money(r.kg), num: true },
		{ header: "Booked ₹", cell: (r) => money(r.value), num: true },
		{ header: "Avg ₹/qtl", cell: (r) => qtl(r.avg_rate_qtl), num: true },
		{ header: "₹0 lines", cell: (r) => count(r.zero_value_lines), num: true },
		{ header: "MR-rated ₹", cell: (r) => money(r.mr_rated_value), num: true },
	];
	const byMr: BreakdownCol<RawMaterialBreakdown["by_mr"][number]>[] = [
		{ header: "MR no", cell: (r) => text(r.branch_mr_no) },
		{ header: "Gate entry", cell: (r) => text(r.jute_gate_entry_no) },
		{ header: "MR date", cell: (r) => (r.mr_date ? shortDate(r.mr_date) : "—") },
		{ header: "Quality", cell: (r) => text(r.item_name) },
		{ header: "Items", cell: (r) => count(r.items), num: true },
		{ header: "MR ₹/qtl", cell: (r) => qtl(r.mr_rate_qtl), num: true },
		{ header: "kg", cell: (r) => money(r.kg), num: true },
		{ header: "Booked ₹", cell: (r) => money(r.value), num: true },
		{ header: "Lines", cell: (r) => count(r.lines), num: true },
	];
	const byDay: BreakdownCol<RawMaterialBreakdown["by_day"][number]>[] = [
		{ header: "Date", cell: (r) => shortDate(r.tran_date) },
		{ header: "kg", cell: (r) => money(r.kg), num: true },
		{ header: "Booked ₹", cell: (r) => money(r.value), num: true },
		{ header: "Lines", cell: (r) => count(r.lines), num: true },
		{ header: "₹0 lines", cell: (r) => count(r.zero_value_lines), num: true },
	];
	const waste: BreakdownCol<RawMaterialBreakdown["waste_by_item"][number]>[] = [
		{ header: "Waste item", cell: (r) => text(r.item_name) },
		{ header: "kg", cell: (r) => money(r.kg), num: true },
		{ header: "Booked ₹", cell: (r) => money(r.value), num: true },
	];
	return (
		<Stack spacing={1.5}>
			<Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
				<KpiCard
					label="Jute per kg cloth"
					value={k.jute_kg_per_kg_cloth == null ? "—" : `${k.jute_kg_per_kg_cloth.toFixed(2)} kg`}
					sub={ratio.text}
					state={ratio.tone}
				/>
				<KpiCard
					label="Issue lines with ₹0 value"
					value={zero == null ? "—" : String(zero)}
					sub={
						zero != null && zero > 0
							? `of ${lines ?? "—"} lines · priced at the MR / keyed rate — check issue data`
							: "every line carries a booked value"
					}
					state={zero != null && zero > 0 ? "warn" : zero === 0 ? "good" : undefined}
				/>
				<KpiCard
					label="Jute issued"
					value={issuedT == null ? "—" : `${fmtT(issuedT)} t`}
					sub={lines != null ? `${lines} lines · ₹${money(s.value)} booked` : undefined}
				/>
			</Box>
			<ScopeCaption scope={scope} />
			{onCheck ? (
				<Box>
					<Button
						variant="outlined"
						onClick={onCheck}
						sx={{ textTransform: "none", minHeight: 44, width: { xs: "100%", md: "auto" } }}
					>
						Check issue data
					</Button>
				</Box>
			) : null}
			<BreakdownSection
				title="By quality"
				subtitle="booked value and the average rate over the valued lines; ₹0 lines are priced at the MR / keyed rate in the P&L"
				rows={data.by_quality}
				columns={byQuality}
				rowKey={(r, i) => r.item_id ?? `q${i}`}
				isPhone={isPhone}
				emptyText="No jute issued in this range."
			/>
			<BreakdownSection
				title="Top MRs by kg"
				subtitle="the 30 MRs that fed the most jute"
				rows={data.by_mr}
				columns={byMr}
				rowKey={(r, i) => `${r.jute_mr_id}-${i}`}
				isPhone={isPhone}
				emptyText="No MR fed jute in this range."
			/>
			<BreakdownSection
				title="By day"
				rows={data.by_day}
				columns={byDay}
				rowKey={(r) => r.tran_date}
				isPhone={isPhone}
				emptyText="No jute issued in this range."
				maxRows={10}
			/>
			<BreakdownSection
				title="Jute waste issued"
				subtitle="booked value only — 0 on sls today"
				rows={data.waste_by_item}
				columns={waste}
				rowKey={(r, i) => r.item_name ?? `w${i}`}
				isPhone={isPhone}
				emptyText="No jute waste issued in this range."
			/>
		</Stack>
	);
}

function StoresBody({ data, isPhone }: { data: StoresBreakdown; isPhone: boolean }) {
	const byCategory: BreakdownCol<StoresBreakdown["by_category"][number]>[] = [
		{ header: "Category", cell: (r) => text(r.label ?? r.category) },
		{ header: "Value ₹", cell: (r) => money(r.value), num: true },
		{ header: "Lines", cell: (r) => count(r.lines), num: true },
	];
	const byGroup: BreakdownCol<StoresBreakdown["by_group"][number]>[] = [
		{ header: "Item group", cell: (r) => text(r.item_grp_name) },
		{ header: "Category", cell: (r) => text(r.category) },
		{ header: "Value ₹", cell: (r) => money(r.value), num: true },
		{ header: "Lines", cell: (r) => count(r.lines), num: true },
	];
	const byDept: BreakdownCol<StoresBreakdown["by_dept"][number]>[] = [
		{ header: "Department", cell: (r) => text(r.dept_desc) },
		{ header: "Value ₹", cell: (r) => money(r.value), num: true },
		{ header: "Lines", cell: (r) => count(r.lines), num: true },
	];
	const byExpense: BreakdownCol<StoresBreakdown["by_expense_type"][number]>[] = [
		{ header: "Expense type", cell: (r) => text(r.expense_type_name) },
		{ header: "Value ₹", cell: (r) => money(r.value), num: true },
		{ header: "Lines", cell: (r) => count(r.lines), num: true },
	];
	const topItems: BreakdownCol<StoresBreakdown["top_items"][number]>[] = [
		{ header: "Item", cell: (r) => text(r.item_name) },
		{ header: "Group", cell: (r) => text(r.item_grp_name) },
		{ header: "Qty", cell: (r) => fmtMoney(r.qty, 2), num: true },
		{ header: "Value ₹", cell: (r) => money(r.value), num: true },
	];
	return (
		<Stack spacing={1.5}>
			<BreakdownSection
				title="By category"
				subtitle="spares · process consumables (oil/ecofin, chemicals, dyes) · packing · general stores — by item group name"
				rows={data.by_category}
				columns={byCategory}
				rowKey={(r, i) => r.category ?? `c${i}`}
				isPhone={isPhone}
				emptyText="No stores issued in this range."
			/>
			<BreakdownSection
				title="By item group"
				subtitle="top 25"
				rows={data.by_group}
				columns={byGroup}
				rowKey={(r, i) => `${r.item_grp_name ?? "g"}-${i}`}
				isPhone={isPhone}
				emptyText="No stores issued in this range."
			/>
			<BreakdownSection
				title="By department"
				subtitle="top 15, from the issue header"
				rows={data.by_dept}
				columns={byDept}
				rowKey={(r, i) => `${r.dept_desc ?? "d"}-${i}`}
				isPhone={isPhone}
				emptyText="No stores issued in this range."
			/>
			<BreakdownSection
				title="By expense type"
				subtitle="Capital and Overhauling issues are shown here so they can be moved out of stores later"
				rows={data.by_expense_type}
				columns={byExpense}
				rowKey={(r, i) => `${r.expense_type_name ?? "e"}-${i}`}
				isPhone={isPhone}
				emptyText="No stores issued in this range."
			/>
			<BreakdownSection
				title="Top items"
				subtitle="top 25 by value"
				rows={data.top_items}
				columns={topItems}
				rowKey={(r, i) => `${r.item_name ?? "i"}-${i}`}
				isPhone={isPhone}
				emptyText="No stores issued in this range."
			/>
		</Stack>
	);
}

function PowerBody({ data, head, isPhone, scope }: { data: PowerBreakdown; head: StatementHead; isPhone: boolean; scope: Scope }) {
	const k = head.kpis ?? {};
	const s = data.summary ?? {};
	const kwh = s.kwh ?? null;
	const dgHours = s.dg_hours ?? k.dg_hours ?? null;
	const dgLitres = s.dg_litres ?? k.dg_litres ?? null;
	const byMeter: BreakdownCol<PowerBreakdown["by_meter"][number]>[] = [
		{ header: "Meter", cell: (r) => text(r.meter_code) },
		{ header: "Name", cell: (r) => text(r.meter_name) },
		{ header: "Type", cell: (r) => text(r.meter_type_label ?? r.meter_type) },
		{ header: "kWh", cell: (r) => money(r.kwh), num: true },
		{ header: "DG hours", cell: (r) => fmtMoney(r.dg_hours, 1), num: true },
		{ header: "DG litres", cell: (r) => fmtMoney(r.dg_litres, 1), num: true },
		{ header: "Max demand kVA", cell: (r) => fmtMoney(r.max_demand_kva, 1), num: true },
		{ header: "Days", cell: (r) => count(r.days), num: true },
	];
	const byDayType: BreakdownCol<PowerBreakdown["by_day_type"][number]>[] = [
		{ header: "Date", cell: (r) => shortDate(r.tran_date) },
		{ header: "Type", cell: (r) => text(r.meter_type) },
		{ header: "kWh", cell: (r) => money(r.kwh), num: true },
	];
	return (
		<Stack spacing={1.5}>
			<Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
				<KpiCard label="kWh" value={kwh == null ? "—" : fmtMoney(kwh)} />
				<KpiCard label="kWh per t cloth" value={k.kwh_per_t == null ? "—" : fmtMoney(k.kwh_per_t)} />
				<KpiCard label="DG hours" value={dgHours == null ? "—" : fmtMoney(dgHours, 1)} />
				<KpiCard label="DG litres" value={dgLitres == null ? "—" : fmtMoney(dgLitres, 1)} />
			</Box>
			<ScopeCaption scope={scope} />
			<BreakdownSection
				title="By meter"
				subtitle="GRID at the keyed power rate; DG at DG_RATE_PER_KWH (else the grid rate); SOLAR at SOLAR_RATE_PER_KWH (else ₹0)"
				rows={data.by_meter}
				columns={byMeter}
				rowKey={(r, i) => `${r.meter_code ?? "m"}-${i}`}
				isPhone={isPhone}
				emptyText="No power reading in this range."
			/>
			<BreakdownSection
				title="By day and type"
				rows={data.by_day_type}
				columns={byDayType}
				rowKey={(r, i) => `${r.tran_date}-${r.meter_type ?? ""}-${i}`}
				isPhone={isPhone}
				emptyText="No power reading in this range."
				maxRows={10}
			/>
		</Stack>
	);
}

function WagesBody({ data, head, isPhone, scope }: { data: WagesBreakdown; head: StatementHead; isPhone: boolean; scope: Scope }) {
	const k = head.kpis ?? {};
	const s = data.summary ?? {};
	const hands = s.hands ?? k.hands ?? null;
	const hours = s.hours ?? k.hours ?? null;
	const wages = s.wages ?? null;
	const rows = s.rows ?? null;
	const rate = data.rate?.value ?? null;
	const bySpell: BreakdownCol<WagesBreakdown["by_spell"][number]>[] = [
		{ header: "Spell", cell: (r) => text(r.spell_name ?? r.spell) },
		{ header: "Hands", cell: (r) => fmtMoney(r.hands, 1), num: true },
		{ header: "Hours", cell: (r) => fmtMoney(r.hours, 1), num: true },
	];
	const byDesignation: BreakdownCol<WagesBreakdown["by_designation"][number]>[] = [
		{ header: "Designation", cell: (r) => text(r.designation ?? r.designation_name) },
		{ header: "Hands", cell: (r) => fmtMoney(r.hands, 1), num: true },
		{ header: "Hours", cell: (r) => fmtMoney(r.hours, 1), num: true },
	];
	const byDepartment: BreakdownCol<WagesBreakdown["by_department"][number]>[] = [
		{ header: "Department", cell: (r) => text(r.department ?? r.dept_desc) },
		{ header: "Hands", cell: (r) => fmtMoney(r.hands, 1), num: true },
		{ header: "Hours", cell: (r) => fmtMoney(r.hours, 1), num: true },
	];
	const hoursProfile: BreakdownCol<WagesBreakdown["hours_profile"][number]>[] = [
		{ header: "Working hours", cell: (r) => fmtMoney(r.working_hours, 1) },
		{ header: "Attendance rows", cell: (r) => count(r.rows), num: true },
	];
	return (
		<Stack spacing={1.5}>
			<Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
				<KpiCard
					label="Hand-days"
					value={hands == null ? "—" : fmtMoney(hands, 1)}
					sub={hours != null ? `${fmtMoney(hours)} hours` : undefined}
				/>
				<KpiCard
					label="Wage per hand-day"
					value={rate == null ? "—" : fmtRupee(rate)}
					sub={data.rate?.source ? `in force on ${data.rate.effective_date ?? "the To date"} · ${data.rate.source}` : "WAGE_PER_HAND_DAY in force on the To date"}
				/>
				<KpiCard
					label="Hands per t cloth"
					value={k.hands_per_t == null ? "—" : fmtMoney(k.hands_per_t, 1)}
					sub={scope.pricedDays != null ? `over the ${scope.pricedDays} priced days` : undefined}
				/>
				<KpiCard
					label="Wages (hands × rate)"
					value={wages == null ? "—" : fmtRupee(wages)}
					sub={rows != null ? `${fmtMoney(rows)} attendance rows` : undefined}
				/>
			</Box>
			<ScopeCaption scope={scope} />
			<BreakdownSection
				title="By spell"
				rows={data.by_spell}
				columns={bySpell}
				rowKey={(r, i) => `${r.spell_name ?? r.spell ?? "s"}-${i}`}
				isPhone={isPhone}
				emptyText="No attendance in this range."
			/>
			<BreakdownSection
				title="By designation"
				subtitle="top 15; 'Not assigned' when the worked designation is blank"
				rows={data.by_designation}
				columns={byDesignation}
				rowKey={(r, i) => `${r.designation ?? r.designation_name ?? "d"}-${i}`}
				isPhone={isPhone}
				emptyText="No attendance in this range."
			/>
			<BreakdownSection
				title="By department"
				subtitle="'Not assigned' when the worked department is blank"
				rows={data.by_department}
				columns={byDepartment}
				rowKey={(r, i) => `${r.department ?? r.dept_desc ?? "p"}-${i}`}
				isPhone={isPhone}
				emptyText="No attendance in this range."
			/>
			<BreakdownSection
				title="Hours profile"
				subtitle="attendance rows by working hours"
				rows={data.hours_profile}
				columns={hoursProfile}
				rowKey={(r, i) => `${r.working_hours ?? "h"}-${i}`}
				isPhone={isPhone}
				emptyText="No attendance in this range."
			/>
		</Stack>
	);
}

function Body({
	breakdown,
	head,
	isPhone,
	onCheck,
	scope,
}: {
	breakdown: PlBreakdown;
	head: StatementHead;
	isPhone: boolean;
	onCheck?: () => void;
	scope: Scope;
}) {
	switch (breakdown.head) {
		case "raw_material":
			return <RawMaterialBody data={breakdown.data} head={head} isPhone={isPhone} onCheck={onCheck} scope={scope} />;
		case "stores":
			return <StoresBody data={breakdown.data} isPhone={isPhone} />;
		case "power":
			return <PowerBody data={breakdown.data} head={head} isPhone={isPhone} scope={scope} />;
		case "wages":
			return <WagesBody data={breakdown.data} head={head} isPhone={isPhone} scope={scope} />;
	}
}

export default function HeadDialog({ open, head, onClose, coId, branchId, dateFrom, dateTo, pricedDays = null, onCheck }: HeadDialogProps) {
	const theme = useTheme();
	// One layout is MOUNTED, not CSS-hidden (noSsr: the dialog only renders client-side).
	const isPhone = useMediaQuery(theme.breakpoints.down("md"), { noSsr: true });
	const [state, setState] = React.useState<LoadState>(IDLE);
	const [reloadNo, setReloadNo] = React.useState(0);
	const headKey = head?.key ?? null;

	// The head stays rendered while the dialog fades out: `head` goes null the moment it
	// closes, which would otherwise blank the title and the body mid-transition. The last
	// head is kept as state (adjusted while rendering) and cleared in onExited.
	const [lastHead, setLastHead] = React.useState<StatementHead | null>(head);
	if (head != null && head !== lastHead) setLastHead(head);
	const shown = head ?? lastHead;
	const scope: Scope = { pricedDays, dateFrom, dateTo };

	// One fetch per opening (and per Reload); a close while loading is ignored. A close does not
	// clear the answer — it stays up for the exit transition and onExited resets it.
	React.useEffect(() => {
		if (!open || headKey == null) return;
		if (!isBreakdownHead(headKey)) {
			setState(IDLE);
			return;
		}
		let alive = true;
		setState({ loading: true, error: null, data: null });
		void (async () => {
			try {
				const data = await fetchPlBreakdown(headKey, { coId, branchId, dateFrom, dateTo });
				if (alive) setState({ loading: false, error: null, data });
			} catch (e: unknown) {
				if (alive) setState({ loading: false, error: errText(e), data: null });
			}
		})();
		return () => {
			alive = false;
		};
	}, [open, headKey, coId, branchId, dateFrom, dateTo, reloadNo]);

	const reload = React.useCallback(() => setReloadNo((n) => n + 1), []);
	const afterClose = React.useCallback(() => {
		setLastHead(null);
		setState(IDLE);
	}, []);
	// A stale answer for another head must never be rendered against this head's tiles.
	const breakdown = state.data && shown && state.data.head === shown.key ? state.data : null;
	const notes = breakdown?.data.notes ?? [];

	return (
		<Dialog
			open={open && head != null}
			onClose={onClose}
			fullScreen={isPhone}
			fullWidth
			maxWidth="lg"
			slotProps={{ transition: { onExited: afterClose } }}
		>
			<DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
				<Box sx={{ flexGrow: 1, minWidth: 0 }}>
					{shown ? `${shown.no} · ${shown.label}` : ""}
					<Typography variant="caption" color="text.secondary" component="span" sx={{ display: "block" }}>
						breakdown for {dateFrom} to {dateTo}
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
				) : breakdown && shown ? (
					<>
						<Body breakdown={breakdown} head={shown} isPhone={isPhone} onCheck={shown.has_check ? onCheck : undefined} scope={scope} />
						{notes.length > 0 ? (
							<Box sx={{ mt: 1.5 }}>
								{notes.map((n) => (
									<Typography key={n} variant="caption" color="text.secondary" component="p">
										{n}
									</Typography>
								))}
							</Box>
						) : null}
					</>
				) : shown && !isBreakdownHead(shown.key) ? (
					<Alert severity="info">
						This head has no breakdown — its lines are on the statement. <Chip size="small" label={shown.key} />
					</Alert>
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
