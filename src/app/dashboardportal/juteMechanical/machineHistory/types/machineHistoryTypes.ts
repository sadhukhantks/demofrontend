/**
 * Every type the Machine History page uses, in ONE file (house rule: a single type
 * module per page). This module imports nothing local.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE PARSES INSTEAD OF JUST IMPORTING A TYPE
 * ---------------------------------------------------------------------------
 * `GET /mechMaintReports/machine-history` does not return a flat row list. Its
 * envelope is:
 *
 *   { "data": { machine, breakdowns[], pm_executions[], overhauls[], spares[] },
 *     "total": <breakdown row count>, "summary": {...}, "unattributed_pct": n }
 *
 * The service's `fetchMachineHistoryReport` is declared as
 * `Promise<MechListResult<MechMachineHistoryRow>>` and runs the payload through the
 * shared list unwrapper, so at runtime its `.data` is that OBJECT, not an array of
 * `MechMachineHistoryRow`. The declared type is therefore not something this page
 * can trust. Rather than redeclare the service (owned elsewhere) or cast a lie into
 * place, the page routes `.data` through `unknown` and narrows it here with real
 * guards — so a shape change degrades to empty panels instead of a runtime crash.
 *
 * The `summary` block the server computes is dropped by the same list unwrapper, so
 * the summary strip is recomputed client-side from the collections that do arrive.
 */

// =============================================================================
// Narrowing primitives
// =============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
	return typeof value === "string" && value !== "" ? value : null;
}

function asNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
		return Number(value);
	}
	return null;
}

function recordsAt(source: Record<string, unknown>, key: string): Record<string, unknown>[] {
	const value = source[key];
	return Array.isArray(value) ? value.filter(isRecord) : [];
}

// =============================================================================
// Panel row types
// =============================================================================

/** The machine itself, with its maintenance attributes. */
export interface MachineHistoryMachine {
	machine_id: number | null;
	machine_name: string | null;
	mech_code: string | null;
	machine_type_name: string | null;
	dept_name: string | null;
	criticality: string | null;
	make: string | null;
	model: string | null;
	serial_no: string | null;
	commissioning_date: string | null;
	last_overhaul_date: string | null;
	overhaul_freq_months: number | null;
	next_overhaul_due: string | null;
	last_pm_date: string | null;
	pm_freq_days: number | null;
	next_pm_due: string | null;
	remarks: string | null;
}

/** One incident from the breakdown panel. All downtime types, not just failures. */
export interface MachineHistoryBreakdown {
	breakdown_id: number;
	tran_date: string | null;
	spell_code: string | null;
	stop_datetime: string | null;
	restart_datetime: string | null;
	duration_min: number | null;
	response_min: number | null;
	reason_code: string | null;
	reason_desc: string | null;
	component_name: string | null;
	discipline: string | null;
	downtime_type: string | null;
	attended_by: string | null;
	root_cause: string | null;
	action_taken: string | null;
	status: string | null;
	remarks: string | null;
}

/** One PM visit, with how many of its checks failed. */
export interface MachineHistoryPmExecution {
	pm_exec_id: number;
	pm_date: string | null;
	frequency: string | null;
	done_by: string | null;
	downtime_min: number | null;
	next_due_date: string | null;
	task_count: number | null;
	not_ok_count: number | null;
	remarks: string | null;
}

/** One overhaul with its cost breakdown. */
export interface MachineHistoryOverhaul {
	overhaul_id: number;
	overhaul_type: string | null;
	from_date: string | null;
	to_date: string | null;
	downtime_days: number | null;
	work_done: string | null;
	done_by: string | null;
	party_name: string | null;
	labour_cost: number | null;
	spare_cost: number | null;
	total_cost: number | null;
	next_due_date: string | null;
	remarks: string | null;
}

/** One spare line, booked either on a breakdown or on an overhaul. */
export interface MachineHistorySpare {
	/** Client-side row key — spare lines share no single id across the two sources. */
	row_id: string;
	/** BREAKDOWN | OVERHAUL */
	source: string | null;
	document_id: number | null;
	document_date: string | null;
	item_id: number | null;
	item_code: string | null;
	item_name: string | null;
	uom_name: string | null;
	qty: number | null;
	rate: number | null;
	amount: number | null;
	remarks: string | null;
}

/** The whole parsed payload of one machine's history. */
export interface MachineHistoryPayload {
	machine: MachineHistoryMachine | null;
	breakdowns: MachineHistoryBreakdown[];
	pm_executions: MachineHistoryPmExecution[];
	overhauls: MachineHistoryOverhaul[];
	spares: MachineHistorySpare[];
}

/** An empty, frozen payload — the safe render for "nothing loaded yet". */
export const EMPTY_MACHINE_HISTORY: MachineHistoryPayload = Object.freeze({
	machine: null,
	breakdowns: [],
	pm_executions: [],
	overhauls: [],
	spares: [],
});

// =============================================================================
// Parsing
// =============================================================================

function parseMachine(raw: unknown): MachineHistoryMachine | null {
	if (!isRecord(raw)) return null;
	return {
		machine_id: asNumber(raw.machine_id),
		machine_name: asString(raw.machine_name),
		mech_code: asString(raw.mech_code),
		machine_type_name: asString(raw.machine_type_name),
		dept_name: asString(raw.dept_name),
		criticality: asString(raw.criticality),
		make: asString(raw.make),
		model: asString(raw.model),
		serial_no: asString(raw.serial_no),
		commissioning_date: asString(raw.commissioning_date),
		last_overhaul_date: asString(raw.last_overhaul_date),
		overhaul_freq_months: asNumber(raw.overhaul_freq_months),
		next_overhaul_due: asString(raw.next_overhaul_due),
		last_pm_date: asString(raw.last_pm_date),
		pm_freq_days: asNumber(raw.pm_freq_days),
		next_pm_due: asString(raw.next_pm_due),
		remarks: asString(raw.remarks),
	};
}

function parseBreakdown(raw: Record<string, unknown>): MachineHistoryBreakdown | null {
	const id = asNumber(raw.breakdown_id);
	if (id === null) return null;
	return {
		breakdown_id: id,
		tran_date: asString(raw.tran_date),
		spell_code: asString(raw.spell_code),
		stop_datetime: asString(raw.stop_datetime),
		restart_datetime: asString(raw.restart_datetime),
		duration_min: asNumber(raw.duration_min),
		response_min: asNumber(raw.response_min),
		reason_code: asString(raw.reason_code),
		reason_desc: asString(raw.reason_desc),
		component_name: asString(raw.component_name),
		discipline: asString(raw.discipline),
		downtime_type: asString(raw.downtime_type),
		attended_by: asString(raw.attended_by),
		root_cause: asString(raw.root_cause),
		action_taken: asString(raw.action_taken),
		status: asString(raw.status),
		remarks: asString(raw.remarks),
	};
}

function parsePmExecution(raw: Record<string, unknown>): MachineHistoryPmExecution | null {
	const id = asNumber(raw.pm_exec_id);
	if (id === null) return null;
	return {
		pm_exec_id: id,
		pm_date: asString(raw.pm_date),
		frequency: asString(raw.frequency),
		done_by: asString(raw.done_by),
		downtime_min: asNumber(raw.downtime_min),
		next_due_date: asString(raw.next_due_date),
		task_count: asNumber(raw.task_count),
		not_ok_count: asNumber(raw.not_ok_count),
		remarks: asString(raw.remarks),
	};
}

function parseOverhaul(raw: Record<string, unknown>): MachineHistoryOverhaul | null {
	const id = asNumber(raw.overhaul_id);
	if (id === null) return null;
	return {
		overhaul_id: id,
		overhaul_type: asString(raw.overhaul_type),
		from_date: asString(raw.from_date),
		to_date: asString(raw.to_date),
		downtime_days: asNumber(raw.downtime_days),
		work_done: asString(raw.work_done),
		done_by: asString(raw.done_by),
		party_name: asString(raw.party_name),
		labour_cost: asNumber(raw.labour_cost),
		spare_cost: asNumber(raw.spare_cost),
		total_cost: asNumber(raw.total_cost),
		next_due_date: asString(raw.next_due_date),
		remarks: asString(raw.remarks),
	};
}

function parseSpare(raw: Record<string, unknown>, index: number): MachineHistorySpare {
	const source = asString(raw.source);
	const documentId = asNumber(raw.document_id);
	const itemId = asNumber(raw.item_id);
	return {
		row_id: `${source ?? "SPARE"}-${documentId ?? "x"}-${itemId ?? "x"}-${index}`,
		source,
		document_id: documentId,
		document_date: asString(raw.document_date),
		item_id: itemId,
		item_code: asString(raw.item_code),
		item_name: asString(raw.item_name),
		uom_name: asString(raw.uom_name),
		qty: asNumber(raw.qty),
		rate: asNumber(raw.rate),
		amount: asNumber(raw.amount),
		remarks: asString(raw.remarks),
	};
}

function isNotNull<T>(value: T | null): value is T {
	return value !== null;
}

/**
 * Narrow the `/machine-history` `data` block into the four panels plus the machine.
 * Accepts the real `{machine, breakdowns, ...}` object; anything else (including the
 * bare array the service's declared type implies) yields an empty payload rather
 * than throwing.
 */
export function parseMachineHistoryPayload(raw: unknown): MachineHistoryPayload {
	if (!isRecord(raw)) return EMPTY_MACHINE_HISTORY;
	return {
		machine: parseMachine(raw.machine),
		breakdowns: recordsAt(raw, "breakdowns").map(parseBreakdown).filter(isNotNull),
		pm_executions: recordsAt(raw, "pm_executions").map(parsePmExecution).filter(isNotNull),
		overhauls: recordsAt(raw, "overhauls").map(parseOverhaul).filter(isNotNull),
		spares: recordsAt(raw, "spares").map(parseSpare),
	};
}

// =============================================================================
// Summary strip
// =============================================================================

/**
 * The five-or-so numbers a maintenance engineer wants before deciding whether to
 * overhaul a machine. Recomputed from the returned collections (see the file
 * header: the server's own `summary` block never reaches the caller).
 *
 * `breakdownCount` and `totalDowntimeMin` count only rows whose `downtime_type` is
 * BREAKDOWN, matching the module's failure definition — the panel itself lists
 * every downtime type, so the two numbers can legitimately differ from the row
 * count on screen.
 */
export interface MachineHistorySummary {
	breakdownCount: number;
	/** Total failure downtime in minutes. */
	totalDowntimeMin: number;
	/** SUM(duration_min) / COUNT(*) over failures, or null when there are none. */
	mttrMin: number | null;
	openBreakdownCount: number;
	lastPmDate: string | null;
	nextPmDue: string | null;
	failedChecksLastPm: number | null;
	lastOverhaulDate: string | null;
	nextOverhaulDue: string | null;
	overhaulCount: number;
	overhaulCost: number;
	spareValue: number;
	/** True when the machine has no overhaul interval configured. */
	overhaulIntervalMissing: boolean;
}

const FAILURE_DOWNTIME_TYPE = "BREAKDOWN";

/** Latest-first comparison on an ISO date string; nulls sort last. */
function latestOf(values: Array<string | null>): string | null {
	return values.filter(isNotNull).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))[0] ?? null;
}

export function buildMachineHistorySummary(
	payload: MachineHistoryPayload,
): MachineHistorySummary {
	const failures = payload.breakdowns.filter(
		(row) => row.downtime_type === FAILURE_DOWNTIME_TYPE,
	);
	const totalDowntimeMin = failures.reduce((sum, row) => sum + (row.duration_min ?? 0), 0);

	// Most recent PM by date; its failed-check count is the freshest health signal.
	const sortedPm = [...payload.pm_executions].sort((a, b) =>
		(a.pm_date ?? "") < (b.pm_date ?? "") ? 1 : -1,
	);
	const latestPm = sortedPm[0] ?? null;

	const overhaulDates = payload.overhauls.map((row) => row.to_date ?? row.from_date);

	return {
		breakdownCount: failures.length,
		totalDowntimeMin,
		mttrMin: failures.length > 0 ? totalDowntimeMin / failures.length : null,
		openBreakdownCount: payload.breakdowns.filter((row) => row.restart_datetime === null).length,
		lastPmDate: payload.machine?.last_pm_date ?? latestPm?.pm_date ?? null,
		nextPmDue: payload.machine?.next_pm_due ?? latestPm?.next_due_date ?? null,
		failedChecksLastPm: latestPm ? (latestPm.not_ok_count ?? 0) : null,
		lastOverhaulDate: payload.machine?.last_overhaul_date ?? latestOf(overhaulDates),
		nextOverhaulDue: payload.machine?.next_overhaul_due ?? null,
		overhaulCount: payload.overhauls.length,
		overhaulCost: payload.overhauls.reduce((sum, row) => sum + (row.total_cost ?? 0), 0),
		spareValue: payload.spares.reduce((sum, row) => sum + (row.amount ?? 0), 0),
		overhaulIntervalMissing: !payload.machine?.overhaul_freq_months,
	};
}

/** Money for display — two decimals, grouped, no currency symbol. */
export function formatAmount(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return "—";
	return value.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

/** Minutes rendered as `2h 15m`, or `—` when unknown. */
export function formatMinutes(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return "—";
	const total = Math.round(value);
	if (total < 60) return `${total}m`;
	const hours = Math.floor(total / 60);
	const minutes = total % 60;
	return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
