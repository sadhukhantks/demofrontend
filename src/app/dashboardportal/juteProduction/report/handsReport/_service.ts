/**
 * Hands Report service.
 *
 * Backend: GET /api/juteProductionReports/hands_report
 * (vowerp3be src/juteProduction/hands_report.py). Actual worker hands from
 * `daily_attendance` against the effective-dated manning norms in
 * `hands_norm_mst`, per designation per date.
 *
 * The endpoint rolls up server-side and returns ONE `rows` array per `view`, so
 * the view selector is a refetch, not a client-side regroup — the four manning
 * views are different grains of the same detail grid and re-deriving them here
 * would only let them drift.
 *
 * The fifth view (`machines_run` on the wire, "Machines Worked" on screen) is
 * the machine-wise sheet behind the machine targets and has its own tab: one row
 * per date x shift x machine with its status — worked (a worker is marked on it
 * in attendance and it was not stopped all shift), stopped all shift, or no
 * worker marked — a per-type summary block, and the norm scopes that say which
 * machines each designation is targeted off. Its Shift / Status / Type / Group /
 * Designation filters are client-side (pure helpers below): they only narrow
 * the rows already loaded.
 *
 * Manual additions and exclusions (spec §12): a role with edit access to the
 * Hands Report menu may count a machine attendance missed (ADD) or leave out one
 * that was wrongly marked (EXCLUDE), each with a reason, and undo either. The
 * rows then carry `manual_action` / `override_id` / `manual_*` / `suggested`
 * and `meta` carries `can_edit`; a backend that predates this sends none of
 * them, and the fallbacks below read that as "no manual change, cannot edit".
 *
 * Kept next to the page rather than in utils/juteProductionReportService.ts:
 * these types are used by this route only.
 */

import { z } from "zod";
import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

export type HandsView =
  | "detailed"
  | "by_date"
  | "by_occupation"
  | "by_department"
  | "machines_run";

/** API value of the Machines Worked tab — the endpoint still calls it machines_run. */
export const MACHINES_VIEW = "machines_run" as const;
export const MACHINES_VIEW_LABEL = "Machines Worked";

/** The views of the Manning tab's selector (Machines Worked is a tab, not a view). */
export type ManningView = Exclude<HandsView, typeof MACHINES_VIEW>;

export const MANNING_VIEWS: { value: ManningView; label: string }[] = [
  { value: "detailed", label: "Detailed" },
  { value: "by_date", label: "By Date" },
  { value: "by_occupation", label: "By Occupation" },
  { value: "by_department", label: "By Department" },
];

/** Every view the endpoint serves, with its on-screen name. */
export const HANDS_VIEWS: { value: HandsView; label: string }[] = [
  ...MANNING_VIEWS,
  { value: MACHINES_VIEW, label: MACHINES_VIEW_LABEL },
];

/**
 * One row of any view. Which identity fields are filled depends on the view
 * (detailed has all of them, by_date only `date`, by_department only the dept
 * pair) — the numeric columns are the same set throughout, which is what lets
 * one row type and one grid serve all four.
 *
 * A null target means the norm could not be resolved (no norm row, or a
 * variable norm with no machine link); it is NOT a zero target, and the
 * backend leaves excess/short null with it rather than inventing a shortfall.
 */
export interface HandsRow {
  date?: string;
  dept_id?: number | null;
  dept?: string | null;
  designation_id?: number | null;
  designation?: string | null;
  /** 'D' / 'I' — from the norm row, falling back to the designation master. */
  direct_indirect?: string | null;
  /** 'V' / 'F' — legacy flag (V = machine / production based). Kept for
   * pre-v2 backends; `norm_kind` is the real kind when present. */
  variable_fixed?: string | null;
  /** Hands Norms v2: F fixed, M machine-based, P production-based, N no norm
   * (target blank, out of excess/short), A as actual (target = hands). */
  norm_kind?: string | null;
  norms_text?: string | null;
  machine_type_id?: number | null;
  machine_group_id?: number | null;
  machine_group?: string | null;
  /** M: group / type / department units one hand covers. */
  units_per_hand?: number | null;
  /** P: production per hand per shift, in qty_uom ('kg' | 'cuts'). */
  qty_per_hand?: number | null;
  qty_uom?: string | null;

  shift_a: number | null;
  shift_b: number | null;
  shift_c: number | null;
  shift_g: number | null;
  target_a: number | null;
  target_b: number | null;
  target_c: number | null;
  target_g: number | null;
  total_actual: number | null;
  total_target: number | null;
  excess: number | null;
  short: number | null;

  /** Month-to-date (TKT-000154): the 1st of the To Date's month up to the To
   * Date on the rollup views; on Detailed / By Date each row runs up to its
   * own date. Same per-day excess/short rule, summed — never netted. */
  mtd_actual?: number | null;
  mtd_target?: number | null;
  mtd_excess?: number | null;
  mtd_short?: number | null;

  /** by_date only — the direct/indirect split of that day's hands. */
  direct_actual?: number | null;
  direct_target?: number | null;
  indirect_actual?: number | null;
  indirect_target?: number | null;
  /** Hands whose designation carries no D/I marking — shown, never dropped. */
  unclassified_actual?: number | null;
  unclassified_target?: number | null;
}

/** What a machine-shift is on the Machines Worked tab (spec §11): it worked
 * only when a worker is marked on it in attendance and it was not stopped for
 * the whole shift — unless a supervisor added it or excluded it by hand (§12),
 * which wins over what the entries say. */
export type MachineStatus =
  | "WORKED"
  | "ADDED_MANUALLY"
  | "STOPPED_ALL_SHIFT"
  | "NO_WORKER_MARKED"
  | "EXCLUDED_MANUALLY";

/** A manual override of a machine-shift: count it (ADD) or leave it out (EXCLUDE). */
export type ManualAction = "ADD" | "EXCLUDE";

/**
 * One machine-shift of the Machines Worked tab, as the endpoint sends it.
 * `sources` is the comma-joined list of entries the machine was seen in (e.g.
 * "Weaving, Attendance, Stoppage") — kept as a string so the Excel export and
 * the auto-sized column see the same text the chips render. `counted` is true
 * only for a machine-shift that worked.
 *
 * `workers`, `shift_hours`, `status`, `group_ids` and `groups` arrived with the
 * attendance-based rule (2026-10-01), `manual_*`, `override_id` and `suggested`
 * with the manual overrides (§12); a backend that predates either omits them, so
 * they are optional here and filled by `toMachineWorkedRow`.
 */
export interface MachineRunRow {
  date: string;
  shift: string;
  dept_id?: number | null;
  dept?: string | null;
  machine_type_id?: number | null;
  machine_type?: string | null;
  machine_id: number;
  machine: string;
  mech_code?: string | null;
  /** Null on a machine-shift that exists only because it was added manually —
   * no entry anywhere mentions it. */
  sources: string | null;
  /** Distinct workers marked on the machine in attendance; null if none marked. */
  hands: number | null;
  stoppage_hours: number | null;
  breakdown_min: number | null;
  counted: boolean;
  /** v2: production the machine-shift carried on its run-source legs (null when none). */
  prod_kg?: number | null;
  prod_cuts?: number | null;
  /** Distinct workers marked on the machine in attendance (0 when none). */
  workers?: number | null;
  /** Hours of the shift the stoppage is measured against. */
  shift_hours?: number | null;
  /** A MachineStatus; typed loosely because it is read off the wire. */
  status?: string | null;
  /** Machine groups the machine belongs to, and their names comma-joined. */
  group_ids?: number[] | null;
  groups?: string | null;
  /** The active manual override of the machine-shift ("ADD" | "EXCLUDE"), if any. */
  manual_action?: string | null;
  /** Id of that override — what Undo sends. */
  override_id?: number | null;
  manual_reason?: string | null;
  /** Name of the user who made the override. */
  manual_by?: string | null;
  /** When it was made (ISO). */
  manual_at?: string | null;
  /** Production entered, no worker marked and no override: offered for adding. */
  suggested?: boolean | null;
}

/** The manual-override fields of a row with the missing ones filled in. */
export interface ManualInfo {
  manual_action: ManualAction | null;
  override_id: number | null;
  manual_reason: string | null;
  manual_by: string | null;
  manual_at: string | null;
  suggested: boolean;
}

/** A machine-shift with every field the tab reads filled in — see `toMachineWorkedRow`. */
export interface MachineWorkedRow
  extends Omit<
      MachineRunRow,
      "sources" | "workers" | "shift_hours" | "status" | "group_ids" | "groups" | keyof ManualInfo
    >,
    ManualInfo {
  /** "" when the machine-shift has no entry behind it (added manually). */
  sources: string;
  workers: number;
  shift_hours: number | null;
  status: MachineStatus;
  /** The status as shown — its own field so the Excel export writes "Worked",
   * not the API code. */
  status_label: string;
  group_ids: number[];
  groups: string;
  /** The manual change in one line for the Excel "Manual" column, e.g.
   * "Added: loom ran, operator not marked (A. Kumar, 2026-10-01 14:32)";
   * "" when the machine-shift has none. */
  manual: string;
}

/** Counted machines per date x machine type, by shift — the machine-norm
 * multiplier read straight off the sheet. */
export interface MachineTypeSummaryRow {
  date: string;
  machine_type_id?: number | null;
  machine_type?: string | null;
  run_a: number;
  run_b: number;
  run_c: number;
  run_g: number;
  /** Sum of the shift counts. */
  machine_shifts: number;
  /** Distinct machines that day — a loom in A and B is one here, two above. */
  machines: number;
  /** v2: production summed over the type's counted machine-shifts. */
  prod_kg?: number | null;
  prod_cuts?: number | null;
  /** Machine-shifts of the type listed but not counted, by reason. */
  stopped_all_shift?: number | null;
  no_worker_marked?: number | null;
}

/**
 * One machine / production norm in force in the window: the machines a
 * designation is targeted off. `scope` says what `scope_id` is — a machine
 * group, a machine type or a department.
 */
export interface MachineScope {
  designation_id: number;
  designation: string;
  norm_kind: "M" | "P";
  scope: "group" | "type" | "dept";
  scope_id: number;
  scope_name: string;
  /** M: units one hand covers. */
  units_per_hand: number | null;
  /** P: production per hand per shift. */
  qty_per_hand: number | null;
  /** P: unit of qty_per_hand ('kg' | 'cuts'); absent on older responses. */
  qty_uom?: string | null;
  /** Group scopes: the group's unit label (machine / point / spindle). */
  unit_label?: string | null;
}

export type NormKind = "F" | "M" | "P" | "N" | "A";

/** Short code the Kind column shows, and its full name for the tooltip / legend. */
export const NORM_KIND_NAMES: Record<NormKind, string> = {
  F: "Fixed",
  M: "Machine-based",
  P: "Production-based",
  N: "No norm",
  A: "As actual",
};

/**
 * The row's norm kind: `norm_kind` when the backend sends one (v2), else the
 * legacy reading — V or a machine link is M, F is F, nothing is nothing. Total
 * rows and designations without a norm carry no kind.
 */
export function normKindOf(
  row: Pick<HandsRow, "norm_kind" | "variable_fixed" | "machine_type_id" | "machine_group_id">,
): NormKind | null {
  const k = (row.norm_kind ?? "").trim().toUpperCase();
  if (k === "F" || k === "M" || k === "P" || k === "N" || k === "A") return k;
  const vf = (row.variable_fixed ?? "").trim().toUpperCase();
  if (vf === "V" || row.machine_type_id != null || row.machine_group_id != null) return "M";
  return vf === "F" ? "F" : null;
}

/** Cell text of the Kind column: the letter, "" when the row has no norm. */
export function normKindLabel(row: Parameters<typeof normKindOf>[0]): string {
  return normKindOf(row) ?? "";
}

/** A machine-shift row, as against a manning row: it names a machine, and
 * carries `sources` or — a manually added machine-shift may come without any —
 * at least its shift letter. */
export function isMachineRunRow(row: HandsRow | MachineRunRow): row is MachineRunRow {
  return (
    typeof (row as MachineRunRow).machine_id === "number" && ("sources" in row || "shift" in row)
  );
}

/** "Weaving, Attendance" -> ["Weaving", "Attendance"]; blanks dropped. */
export function splitSources(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Machines Worked tab — pure helpers (unit-tested in _service.test.ts)
// ---------------------------------------------------------------------------

/** Display order: the two counted statuses first (worked, added manually),
 * then the three "listed, not counted" ones. */
export const MACHINE_STATUSES: readonly MachineStatus[] = Object.freeze([
  "WORKED",
  "ADDED_MANUALLY",
  "STOPPED_ALL_SHIFT",
  "NO_WORKER_MARKED",
  "EXCLUDED_MANUALLY",
] as const);

export const MACHINE_STATUS_LABELS: Record<MachineStatus, string> = {
  WORKED: "Worked",
  ADDED_MANUALLY: "Added manually",
  STOPPED_ALL_SHIFT: "Stopped all shift",
  NO_WORKER_MARKED: "No worker marked",
  EXCLUDED_MANUALLY: "Excluded manually",
};

/** MUI chip colour of a status — palette names, so the theme owns the shade. */
export type MachineStatusTone = "success" | "info" | "warning" | "default" | "error";

const MACHINE_STATUS_TONES: Record<MachineStatus, MachineStatusTone> = {
  WORKED: "success",
  ADDED_MANUALLY: "info",
  STOPPED_ALL_SHIFT: "warning",
  NO_WORKER_MARKED: "default",
  EXCLUDED_MANUALLY: "error",
};

/** MUI chip variant of a status: an excluded machine-shift is drawn outlined,
 * so it reads as "taken out" rather than as an alarm. */
export type MachineStatusChipVariant = "filled" | "outlined";

export function isMachineStatus(value: unknown): value is MachineStatus {
  return typeof value === "string" && (MACHINE_STATUSES as readonly string[]).includes(value);
}

export function machineStatusLabel(status: MachineStatus): string {
  return MACHINE_STATUS_LABELS[status];
}

export function machineStatusTone(status: MachineStatus): MachineStatusTone {
  return MACHINE_STATUS_TONES[status];
}

/** Whether a machine-shift of this status counts for the machine targets:
 * it worked by the entries, or a supervisor added it by hand (§12.2). */
export function isCountedStatus(status: MachineStatus): boolean {
  return status === "WORKED" || status === "ADDED_MANUALLY";
}

export function machineStatusChipVariant(status: MachineStatus): MachineStatusChipVariant {
  return status === "EXCLUDED_MANUALLY" ? "outlined" : "filled";
}

/** "ADD" / "EXCLUDE" off the wire (any case); anything else — and a backend
 * that sends no `manual_action` at all — is null. */
export function manualActionOf(value: unknown): ManualAction | null {
  const sent = typeof value === "string" ? value.trim().toUpperCase() : "";
  return sent === "ADD" || sent === "EXCLUDE" ? sent : null;
}

/**
 * The row's status. With no (known) status sent, an active manual override
 * decides — added beats excluded beats everything else (§12.2). Failing that, a
 * backend that predates the attendance rule leaves only its `counted` flag as
 * evidence, so a counted row reads as worked and anything else as "no worker
 * marked".
 */
export function machineStatusOf(
  row: Pick<MachineRunRow, "status" | "counted" | "manual_action">,
): MachineStatus {
  const sent = (row.status ?? "").trim().toUpperCase();
  if (isMachineStatus(sent)) return sent;
  const manual = manualActionOf(row.manual_action);
  if (manual === "ADD") return "ADDED_MANUALLY";
  if (manual === "EXCLUDE") return "EXCLUDED_MANUALLY";
  return row.counted ? "WORKED" : "NO_WORKER_MARKED";
}

const finiteOr = (value: unknown, fallback: number): number => {
  const n = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
};

const textOrNull = (value: unknown): string | null => {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
};

/**
 * The manual-override fields of a row. A backend that predates §12 sends none
 * of them: every `manual_*` and the `override_id` then read as null and
 * `suggested` as false — "no manual change, nothing to suggest".
 */
export function manualInfoOf(
  row: Pick<MachineRunRow, "manual_action" | "override_id" | "manual_reason" | "manual_by" | "manual_at" | "suggested">,
): ManualInfo {
  const id = row.override_id;
  return {
    manual_action: manualActionOf(row.manual_action),
    override_id: typeof id === "number" && Number.isFinite(id) ? id : null,
    manual_reason: textOrNull(row.manual_reason),
    manual_by: textOrNull(row.manual_by),
    manual_at: textOrNull(row.manual_at),
    suggested: row.suggested === true,
  };
}

/** "2026-10-01T14:32:10" -> "2026-10-01 14:32" — date and time as the server
 * wrote them (no timezone shift); a bare date stays a date; null when blank. */
export function manualAtLabel(manualAt: string | null | undefined): string | null {
  const text = (manualAt ?? "").trim();
  if (!text) return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}):(\d{2}))?/.exec(text);
  if (!m) return text;
  return m[2] ? `${m[1]} ${m[2]}:${m[3]}` : m[1];
}

const MANUAL_VERBS: Record<ManualAction, string> = { ADD: "Added", EXCLUDE: "Excluded" };

/**
 * The manual change in one line, for the Excel "Manual" column:
 * "Added: reason (name, 2026-10-01 14:32)". Whatever the backend left out is
 * simply not written; "" when the machine-shift has no manual change.
 */
export function manualText(
  info: Pick<ManualInfo, "manual_action" | "manual_reason" | "manual_by" | "manual_at">,
): string {
  if (!info.manual_action) return "";
  const head = info.manual_reason
    ? `${MANUAL_VERBS[info.manual_action]}: ${info.manual_reason}`
    : MANUAL_VERBS[info.manual_action];
  const tail = [info.manual_by, manualAtLabel(info.manual_at)].filter(Boolean).join(", ");
  return tail ? `${head} (${tail})` : head;
}

/**
 * The lines of the Status cell's tooltip on a manually changed machine-shift:
 * what was done, the reason, and who did it when. [] for every other row, which
 * therefore gets no tooltip.
 */
export function manualTooltipLines(
  info: Pick<ManualInfo, "manual_action" | "manual_reason" | "manual_by" | "manual_at">,
): string[] {
  if (!info.manual_action) return [];
  const lines = [info.manual_action === "ADD" ? "Added manually" : "Excluded manually"];
  if (info.manual_reason) lines.push(`Reason: ${info.manual_reason}`);
  const when = manualAtLabel(info.manual_at);
  if (info.manual_by || when) {
    lines.push([info.manual_by ? `By ${info.manual_by}` : null, when].filter(Boolean).join(" · "));
  }
  return lines;
}

/**
 * Fills what an older backend leaves out so the tab never reads an undefined:
 * status (see `machineStatusOf`), `workers` (the legacy `hands`, else 0),
 * `group_ids` ([]), `groups` ("") and `shift_hours` (null), the manual override
 * fields (see `manualInfoOf`), and `sources` ("" on a machine-shift that was
 * added manually with no entry behind it).
 */
export function toMachineWorkedRow(row: MachineRunRow): MachineWorkedRow {
  const status = machineStatusOf(row);
  const manual = manualInfoOf(row);
  return {
    ...row,
    ...manual,
    manual: manualText(manual),
    sources: row.sources ?? "",
    workers: finiteOr(row.workers, finiteOr(row.hands, 0)),
    shift_hours: row.shift_hours ?? null,
    status,
    status_label: machineStatusLabel(status),
    group_ids: Array.isArray(row.group_ids)
      ? row.group_ids.filter((id): id is number => typeof id === "number" && Number.isFinite(id))
      : [],
    groups: row.groups ?? "",
  };
}

/** The norm scopes of a machines_run response; [] when the backend sends none. */
export function machineScopesOf(report: Pick<HandsReport, "scopes"> | null | undefined): MachineScope[] {
  return Array.isArray(report?.scopes) ? report.scopes : [];
}

/** Whether the machine-shift belongs to the machines a norm is targeted off. */
export function machineInScope(
  row: Pick<MachineWorkedRow, "group_ids" | "machine_type_id" | "dept_id">,
  scope: Pick<MachineScope, "scope" | "scope_id">,
): boolean {
  if (scope.scope === "group") return row.group_ids.includes(scope.scope_id);
  if (scope.scope === "type") return row.machine_type_id === scope.scope_id;
  return row.dept_id === scope.scope_id;
}

/** The tab's client-side filters; "" means "all". */
export interface MachineFilters {
  shift: string;
  status: MachineStatus | "";
  machineTypeId: number | "";
  groupId: number | "";
  designationId: number | "";
}

export const NO_MACHINE_FILTERS: Readonly<MachineFilters> = Object.freeze({
  shift: "",
  status: "",
  machineTypeId: "",
  groupId: "",
  designationId: "",
});

/**
 * Narrows the loaded machine-shifts. Every filter is an AND. A designation
 * keeps the machines of its norm scope(s) — a designation whose norm changed
 * scope inside the window has more than one, and a machine in any of them
 * stays; one with no scope at all keeps nothing.
 */
export function filterMachineRows(
  rows: MachineWorkedRow[],
  filters: MachineFilters,
  scopes: MachineScope[],
): MachineWorkedRow[] {
  const { shift, status, machineTypeId, groupId, designationId } = filters;
  const designationScopes =
    designationId === "" ? null : scopes.filter((s) => s.designation_id === designationId);
  return rows.filter(
    (r) =>
      (shift === "" || r.shift === shift) &&
      (status === "" || r.status === status) &&
      (machineTypeId === "" || r.machine_type_id === machineTypeId) &&
      (groupId === "" || r.group_ids.includes(groupId)) &&
      (designationScopes === null || designationScopes.some((s) => machineInScope(r, s))),
  );
}

const SHIFT_ORDER = ["A", "B", "C", "G"];

/** A, B, C, G first, anything else after them alphabetically. */
function sortShifts(shifts: string[]): string[] {
  const rank = (s: string) => {
    const i = SHIFT_ORDER.indexOf(s);
    return i === -1 ? SHIFT_ORDER.length : i;
  };
  return [...shifts].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export interface MachineFilterOption<T extends string | number> {
  value: T;
  label: string;
}

export interface MachineFilterOptions {
  shifts: MachineFilterOption<string>[];
  statuses: MachineFilterOption<MachineStatus>[];
  machineTypes: MachineFilterOption<number>[];
  groups: MachineFilterOption<number>[];
  designations: MachineFilterOption<number>[];
}

const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);

/**
 * Name of every machine group seen on the rows. A row carries the ids and the
 * comma-joined names separately, so a name is taken from a group-scoped norm
 * when there is one, else by position from the row's own `groups` text (only
 * when it lists exactly as many names as ids), else "Group <id>".
 */
export function machineGroupNames(
  rows: ReadonlyArray<Pick<MachineWorkedRow, "group_ids" | "groups">>,
  scopes: MachineScope[],
): Map<number, string> {
  const names = new Map<number, string>();
  for (const s of scopes) {
    if (s.scope === "group" && s.scope_name && !names.has(s.scope_id)) {
      names.set(s.scope_id, s.scope_name);
    }
  }
  const unnamed = new Set<number>();
  for (const r of rows) {
    if (!r.group_ids.length) continue;
    const listed = splitSources(r.groups);
    r.group_ids.forEach((id, i) => {
      if (names.has(id)) return;
      if (listed.length === r.group_ids.length) {
        names.set(id, listed[i]);
        unnamed.delete(id);
      } else {
        unnamed.add(id);
      }
    });
  }
  for (const id of unnamed) names.set(id, `Group ${id}`);
  return names;
}

/**
 * The choices of the five filters, read off what was loaded: only the shifts,
 * machine types and groups the rows actually carry, and the designations that
 * have a machine / production norm in force.
 */
export function machineFilterOptions(rows: MachineWorkedRow[], scopes: MachineScope[]): MachineFilterOptions {
  const shifts = sortShifts([...new Set(rows.map((r) => r.shift).filter(Boolean))]);

  const types = new Map<number, string>();
  for (const r of rows) {
    if (r.machine_type_id != null && !types.has(r.machine_type_id)) {
      types.set(r.machine_type_id, r.machine_type || `Type ${r.machine_type_id}`);
    }
  }

  const groupNames = machineGroupNames(rows, scopes);
  const groupIds = new Set(rows.flatMap((r) => r.group_ids));

  const designations = new Map<number, string>();
  for (const s of scopes) {
    if (!designations.has(s.designation_id)) {
      designations.set(s.designation_id, s.designation || `Designation ${s.designation_id}`);
    }
  }

  return {
    shifts: shifts.map((s) => ({ value: s, label: s })),
    statuses: MACHINE_STATUSES.map((s) => ({ value: s, label: MACHINE_STATUS_LABELS[s] })),
    machineTypes: [...types].map(([value, label]) => ({ value, label })).sort(byLabel),
    groups: [...groupIds]
      .map((value) => ({ value, label: groupNames.get(value) ?? `Group ${value}` }))
      .sort(byLabel),
    designations: [...designations].map(([value, label]) => ({ value, label })).sort(byLabel),
  };
}

/**
 * Drops a filter whose choice is no longer on offer (a reload for other dates
 * brought different shifts / groups / norms). Without this the dropdown shows
 * empty while the stale value still hides every row.
 */
export function effectiveMachineFilters(filters: MachineFilters, options: MachineFilterOptions): MachineFilters {
  const keep = <T extends string | number>(value: T | "", list: MachineFilterOption<T>[]): T | "" =>
    value !== "" && list.some((o) => o.value === value) ? value : "";
  return {
    shift: keep(filters.shift, options.shifts),
    status: keep(filters.status, options.statuses),
    machineTypeId: keep(filters.machineTypeId, options.machineTypes),
    groupId: keep(filters.groupId, options.groups),
    designationId: keep(filters.designationId, options.designations),
  };
}

export interface MachineStatusCounts {
  worked: number;
  addedManually: number;
  stoppedAllShift: number;
  noWorkerMarked: number;
  excludedManually: number;
}

const STATUS_COUNT_KEYS: Record<MachineStatus, keyof MachineStatusCounts> = {
  WORKED: "worked",
  ADDED_MANUALLY: "addedManually",
  STOPPED_ALL_SHIFT: "stoppedAllShift",
  NO_WORKER_MARKED: "noWorkerMarked",
  EXCLUDED_MANUALLY: "excludedManually",
};

/** Machine-shifts per status among the given rows. */
export function countMachineStatuses(rows: Pick<MachineWorkedRow, "status">[]): MachineStatusCounts {
  const counts: MachineStatusCounts = {
    worked: 0,
    addedManually: 0,
    stoppedAllShift: 0,
    noWorkerMarked: 0,
    excludedManually: 0,
  };
  for (const r of rows) counts[STATUS_COUNT_KEYS[r.status] ?? "noWorkerMarked"] += 1;
  return counts;
}

/**
 * The figures of the status chips: the endpoint's own counts when `meta`
 * carries them, else the rows counted by status — an older backend sends none.
 * Pass no meta to force the row count (e.g. when the rows are a filtered subset
 * of the window the meta figures describe).
 *
 * `machine_shifts_run` is every COUNTED machine-shift, so it includes the ones
 * added manually; they are taken off it here so that "Worked" and "Added
 * manually" are separate figures, each matching its Status filter. The two
 * manual counts fall back to the rows when meta lacks them (a backend without
 * the overrides has no such rows, so both read 0).
 */
export function machineStatusCounts(
  rows: Pick<MachineWorkedRow, "status">[],
  meta?: Pick<
    HandsMeta,
    "machine_shifts_run" | "stopped_all_shift" | "no_worker_marked" | "added_manually" | "excluded_manually"
  > | null,
): MachineStatusCounts {
  const counted = countMachineStatuses(rows);
  if (typeof meta?.stopped_all_shift !== "number" || typeof meta.no_worker_marked !== "number") {
    return counted;
  }
  const addedManually =
    typeof meta.added_manually === "number" ? meta.added_manually : counted.addedManually;
  return {
    worked:
      typeof meta.machine_shifts_run === "number"
        ? Math.max(meta.machine_shifts_run - addedManually, 0)
        : counted.worked,
    addedManually,
    stoppedAllShift: meta.stopped_all_shift,
    noWorkerMarked: meta.no_worker_marked,
    excludedManually:
      typeof meta.excluded_manually === "number" ? meta.excluded_manually : counted.excludedManually,
  };
}

/** "2026-10-01T14:32:10" / "2026-10-01 14:32:10" -> "14:32". The time is shown
 * as the server wrote it (no timezone shift); null when there is none to show. */
export function syncedTimeLabel(syncedAt: string | null | undefined): string | null {
  const m = /[T\s](\d{2}):(\d{2})/.exec(syncedAt ?? "");
  return m ? `${m[1]}:${m[2]}` : null;
}

/** 24 -> "24", 23.5 -> "23.5", 7.333… -> "7.33". */
const trimNum = (n: number): string => String(Number(n.toFixed(2)));

const handsText = (n: number): string => `${trimNum(n)} ${trimNum(n) === "1" ? "hand" : "hands"}`;

const SCOPE_WORDS: Record<MachineScope["scope"], string> = {
  group: "group",
  type: "machine type",
  dept: "department",
};

/**
 * One line saying what a designation's norm is targeted off and how many of
 * those machines worked, per shift, among `rows` (the rows as filtered — only
 * the counted ones: worked, or added manually):
 *
 *   "WEAVER(S4): Loom machine type, 2 per hand → A: 48 worked ÷ 2 = 24 hands"
 *   "WEAVER(H): Hessian looms group, 2 units per hand → A: 48 worked · B: 46 worked"
 *
 * The division is only written for a machine norm on a machine type or a
 * department, where every machine is one unit. Group members carry their own
 * units (a drawing frame is 10 points) and a production norm divides kg, and
 * neither figure is on the row — so those lines stop at the machines counted
 * instead of printing a hands figure that could be wrong.
 */
export function scopeCaption(scope: MachineScope, rows: MachineWorkedRow[]): string {
  const worked = rows.filter((r) => isCountedStatus(r.status) && machineInScope(r, scope));
  const perShift = new Map<string, number>();
  for (const r of worked) perShift.set(r.shift, (perShift.get(r.shift) ?? 0) + 1);

  const name = scope.designation || `Designation ${scope.designation_id}`;
  let head = `${name}: ${scope.scope_name} ${SCOPE_WORDS[scope.scope]}`;
  const units = scope.units_per_hand;
  const qty = scope.qty_per_hand;
  const hasUnits = scope.norm_kind === "M" && typeof units === "number" && units > 0;
  if (scope.norm_kind === "P") {
    head += typeof qty === "number" && qty > 0
      ? `, production norm (${trimNum(qty)}${scope.qty_uom ? ` ${scope.qty_uom}` : ""} per hand per shift)`
      : ", production norm";
  } else if (hasUnits) {
    head += `, ${trimNum(units)} ${scope.scope === "group" ? "units per hand" : "per hand"}`;
  }

  if (!worked.length) return `${head} → no machines worked in the rows shown`;

  const divide = hasUnits && scope.scope !== "group";
  const parts = sortShifts([...perShift.keys()]).map((shift) => {
    const n = perShift.get(shift) ?? 0;
    return divide
      ? `${shift}: ${n} worked ÷ ${trimNum(units)} = ${handsText(n / units)}`
      : `${shift}: ${n} worked`;
  });
  const dates = new Set(worked.map((r) => r.date)).size;
  return `${head} → ${parts.join(" · ")}${dates > 1 ? ` (machine-shifts over ${dates} dates)` : ""}`;
}

/** The caption line(s) of a designation — one per distinct scope of its norms. */
export function designationCaptions(
  designationId: number | "",
  scopes: MachineScope[],
  rows: MachineWorkedRow[],
): string[] {
  if (designationId === "") return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of scopes) {
    if (s.designation_id !== designationId) continue;
    const key = [s.norm_kind, s.scope, s.scope_id, s.units_per_hand, s.qty_per_hand].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(scopeCaption(s, rows));
  }
  return out;
}

export interface HandsMeta {
  co_id: number;
  branch_id: number;
  date_from: string;
  date_to: string;
  view: HandsView;
  row_count: number;
  total_actual: number | null;
  total_target: number | null;
  total_excess: number | null;
  total_short: number | null;
  /** Month-to-date as at date_to, from mtd_from (the 1st of its month). */
  mtd_from?: string;
  mtd_actual?: number | null;
  mtd_target?: number | null;
  mtd_excess?: number | null;
  mtd_short?: number | null;
  /** Machines Worked figures for the whole window, present on every view:
   * machine-shifts that worked, and the distinct machines behind them. */
  machine_shifts_run?: number;
  machines_run?: number;
  /** Rows listed but not counted (legacy total of the two reasons below). */
  stopped_only_rows?: number;
  /** A worker was marked but the machine was stopped the whole shift. */
  stopped_all_shift?: number | null;
  /** Entries exist for the machine-shift but no worker is marked on it. */
  no_worker_marked?: number | null;
  /** When the machines-worked table was last rebuilt for this window. */
  synced_at?: string | null;
  /** Machine-shifts counted / left out by a manual override (§12). */
  added_manually?: number | null;
  excluded_manually?: number | null;
  /** Whether the caller's role may add / exclude / undo. Absent on a backend
   * that predates the overrides — read as false (see `canEditMachinesWorked`). */
  can_edit?: boolean | null;
  notes: string[];
}

export interface HandsReport {
  view: HandsView;
  /** HandsRow[] for the manning views, MachineRunRow[] for machines_run. */
  rows: Array<HandsRow | MachineRunRow>;
  /** by_department only — the GRAND TOTAL line, carried separately so it is
   * never sorted into the middle of the departments. */
  grand_total?: HandsRow;
  /** machines_run only. */
  type_summary?: MachineTypeSummaryRow[];
  /** machines_run only — the machine / production norms in force. */
  scopes?: MachineScope[];
  /** detailed only (TKT-000167) — one total per date x department, and one
   * per date, rolled up server-side; placed by `withDetailedTotals`. */
  dept_totals?: HandsRow[];
  day_totals?: HandsRow[];
  meta: HandsMeta;
}

/** Label of a department subtotal whose rows carry no department. */
export const NO_DEPARTMENT = "(No department)";

/**
 * Detailed view (TKT-000167): puts the department subtotals and day totals the
 * endpoint returns beside `rows` where a printed sheet has them, so each
 * department closes with its Total line and each date with the day's Total.
 * Pure placement: every figure comes from the server, nothing is summed here.
 * Relies on the endpoint's date -> department -> occupation row order.
 *
 * The labels are what ReportGrid and the Excel export detect: a cell reading
 * "Total" marks a total row, and its level comes from the Date column, so the
 * department line (Date blank) shades as an inner subtotal and the day line
 * (Date filled) as the group total above it.
 */
export function withDetailedTotals(
  rows: HandsRow[],
  deptTotals: HandsRow[],
  dayTotals: HandsRow[],
): HandsRow[] {
  const deptKey = (date?: string, deptId?: number | null) => `${date ?? ""}|${deptId ?? ""}`;
  const byDept = new Map(deptTotals.map((t) => [deptKey(t.date, t.dept_id), t]));
  const byDay = new Map(dayTotals.map((t) => [t.date ?? "", t]));
  const out: HandsRow[] = [];
  rows.forEach((row, i) => {
    out.push(row);
    const next: HandsRow | undefined = rows[i + 1];
    const dateEnds = next === undefined || next.date !== row.date;
    const deptEnds = dateEnds || (next?.dept_id ?? null) !== (row.dept_id ?? null);
    if (deptEnds) {
      const t = byDept.get(deptKey(row.date, row.dept_id));
      if (t) out.push({ ...t, date: "", dept: t.dept || NO_DEPARTMENT, designation: "Total" });
    }
    if (dateEnds) {
      const t = byDay.get(row.date ?? "");
      if (t) out.push({ ...t, dept: "Total", designation: "" });
    }
  });
  return out;
}

export interface HandsReportFilters {
  coId: number;
  branchId: number;
  dateFrom: string;
  dateTo: string;
  view: HandsView;
  deptId?: string;
  directIndirect?: string;
}

export async function fetchHandsReport(f: HandsReportFilters): Promise<HandsReport> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(f.coId));
  qs.set("branch_id", String(f.branchId));
  qs.set("date_from", f.dateFrom);
  qs.set("date_to", f.dateTo);
  qs.set("view", f.view);
  // Blank filters are omitted, not sent empty: the endpoint treats a present
  // param as a filter to apply.
  if (f.deptId?.trim()) qs.set("dept_id", f.deptId.trim());
  // Machines have no direct/indirect side; the endpoint ignores it on that
  // view, so it is simply not sent.
  if (f.view !== MACHINES_VIEW && f.directIndirect?.trim()) {
    qs.set("direct_indirect", f.directIndirect.trim());
  }

  const url = `${apiRoutesPortalMasters.JP_HANDS_REPORT}?${qs.toString()}`;
  const res = await fetchWithCookie<{ data: HandsReport }>(url);
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the hands report");
  }
  return res.data.data;
}

// ---------------------------------------------------------------------------
// Manual additions and exclusions of worked machines (spec §12)
// ---------------------------------------------------------------------------

/**
 * Whether the add / exclude / undo actions are offered: the backend must say
 * the caller's role may edit (`meta.can_edit`) AND the sidebar menu must grant
 * edit on the page (`hasMenuAccess(pathname, "edit")`). A backend that predates
 * the overrides sends no `can_edit`, which reads as false — no actions show
 * until it is in.
 */
export function canEditMachinesWorked(
  meta: Pick<HandsMeta, "can_edit"> | null | undefined,
  menuEdit: boolean,
): boolean {
  return menuEdit && meta?.can_edit === true;
}

/** The one action a row offers: count a machine nobody was marked on, exclude
 * one that counted, or undo a manual change. */
export type MachineRowAction = "count" | "exclude" | "undo";

export const MACHINE_ROW_ACTION_LABELS: Record<MachineRowAction, string> = {
  count: "Count as worked",
  exclude: "Exclude",
  undo: "Undo",
};

/**
 * The action offered on a row, or null: Count on "no worker marked", Exclude on
 * "worked", Undo on a manually added / excluded machine-shift (only when the
 * row carries the override's id — there is nothing to send without it). A
 * machine stopped all shift offers none. Nothing is offered without edit access.
 */
export function machineRowAction(
  row: Pick<MachineWorkedRow, "status" | "override_id">,
  canEdit: boolean,
): MachineRowAction | null {
  if (!canEdit) return null;
  if (row.status === "NO_WORKER_MARKED") return "count";
  if (row.status === "WORKED") return "exclude";
  if (row.status === "ADDED_MANUALLY" || row.status === "EXCLUDED_MANUALLY") {
    return row.override_id != null ? "undo" : null;
  }
  return null;
}

/** Reason offered when counting a machine that has production but no worker mark. */
export const COUNT_SUGGESTED_REASON = "Production entered, no worker marked";

/** The reason a row's dialog opens with: pre-filled only for Count on a
 * suggested row (still editable); otherwise the user writes it. */
export function defaultOverrideReason(
  action: MachineRowAction,
  row: Pick<MachineWorkedRow, "suggested">,
): string {
  return action === "count" && row.suggested ? COUNT_SUGGESTED_REASON : "";
}

const byMachineName = (a: { machine: string }, b: { machine: string }) =>
  a.machine.localeCompare(b.machine, undefined, { numeric: true });

/**
 * The Suggested list of the Add machines dialog: the loaded machine-shifts of
 * one date and shift that the backend flags `suggested` (production entered, no
 * worker marked, no override), one per machine, by machine name.
 */
export function suggestedMachines(
  rows: MachineWorkedRow[],
  date: string,
  shift: string,
): MachineWorkedRow[] {
  const seen = new Set<number>();
  const out: MachineWorkedRow[] = [];
  for (const r of rows) {
    if (!r.suggested || r.date !== date || r.shift !== shift || seen.has(r.machine_id)) continue;
    seen.add(r.machine_id);
    out.push(r);
  }
  return out.sort(byMachineName);
}

/** The shift letters an override may be keyed for. */
export const OVERRIDE_SHIFTS = ["A", "B", "C", "G"] as const;
export type OverrideShift = (typeof OVERRIDE_SHIFTS)[number];

export const OVERRIDE_SHIFT_OPTIONS: ReadonlyArray<MachineFilterOption<OverrideShift>> = Object.freeze(
  OVERRIDE_SHIFTS.map((s) => ({ value: s, label: s === "G" ? "G (General)" : s })),
);

export function isOverrideShift(value: unknown): value is OverrideShift {
  return typeof value === "string" && (OVERRIDE_SHIFTS as readonly string[]).includes(value);
}

export const OVERRIDE_REASON_MIN = 3;
export const OVERRIDE_REASON_MAX = 255;
export const OVERRIDE_MAX_MACHINES = 500;

/**
 * The override form (Add machines dialog, and the Count / Exclude row dialogs).
 * Mirrors the endpoint's own 400s — date, shift letter, 1..500 machines, a
 * reason of 3–255 characters — so the user sees them before the round trip;
 * the backend stays the source of truth.
 */
export const machineOverrideSchema = z.object({
  tran_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  shift: z.enum(OVERRIDE_SHIFTS, { message: "Pick a shift" }),
  machine_ids: z
    .array(z.number().int().positive())
    .min(1, "Pick at least one machine")
    .max(OVERRIDE_MAX_MACHINES, `At most ${OVERRIDE_MAX_MACHINES} machines at a time`),
  action: z.enum(["ADD", "EXCLUDE"]),
  reason: z
    .string()
    .trim()
    .min(OVERRIDE_REASON_MIN, `Give a reason (at least ${OVERRIDE_REASON_MIN} characters)`)
    .max(OVERRIDE_REASON_MAX, `Keep the reason within ${OVERRIDE_REASON_MAX} characters`),
});

export type MachineOverrideForm = z.infer<typeof machineOverrideSchema>;

/** What the dialogs hold before validation — the shift may still be unpicked. */
export interface MachineOverrideInput {
  tran_date: string;
  shift: string;
  machine_ids: number[];
  action: ManualAction;
  reason: string;
}

export type MachineOverrideErrors = Partial<Record<keyof MachineOverrideForm, string>>;

/** The dates an override may be keyed for: the loaded From–To window, and
 * (the endpoint refuses it) never a day after `today`. */
export interface OverrideDateWindow {
  from?: string | null;
  to?: string | null;
  today?: string | null;
}

/** min / max of the dialog's date input: the loaded window, capped at today
 * when the window runs past it. */
export function overrideDateBounds(window: OverrideDateWindow): { min: string; max: string } {
  const min = window.from ?? "";
  let max = window.to ?? "";
  const today = window.today ?? "";
  if (today && (!max || max > today) && (!min || today >= min)) max = today;
  return { min, max };
}

export type MachineOverrideValidation =
  | { ok: true; data: MachineOverrideForm }
  | { ok: false; errors: MachineOverrideErrors };

/**
 * Validates the override form: the Zod schema, plus the date being inside the
 * loaded window and not in the future. Returns the parsed form (reason trimmed)
 * or one message per field.
 */
export function validateMachineOverride(
  input: MachineOverrideInput,
  window: OverrideDateWindow = {},
): MachineOverrideValidation {
  const parsed = machineOverrideSchema.safeParse(input);
  const errors: MachineOverrideErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && field in machineOverrideSchema.shape) {
        const key = field as keyof MachineOverrideForm;
        errors[key] ??= issue.message;
      }
    }
  }
  if (!errors.tran_date) {
    const date = input.tran_date;
    if ((window.from && date < window.from) || (window.to && date > window.to)) {
      errors.tran_date = `Pick a date between ${window.from ?? "…"} and ${window.to ?? "…"} (the dates loaded)`;
    } else if (window.today && date > window.today) {
      errors.tran_date = "The date cannot be in the future";
    }
  }
  if (!parsed.success || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: parsed.data };
}

/** Machine ids of several lists as one, each id once, in first-seen order —
 * a machine ticked under Suggested and picked again in the list is sent once. */
export function uniqueMachineIds(...lists: ReadonlyArray<ReadonlyArray<number>>): number[] {
  return [...new Set(lists.flat())];
}

/** Body of POST /hands_report_machine_override. */
export interface MachineOverridePayload {
  co_id: number;
  branch_id: number;
  tran_date: string;
  shift: OverrideShift;
  machine_ids: number[];
  action: ManualAction;
  reason: string;
}

export function buildOverridePayload(
  coId: number,
  branchId: number,
  form: MachineOverrideForm,
): MachineOverridePayload {
  return {
    co_id: coId,
    branch_id: branchId,
    tran_date: form.tran_date,
    shift: form.shift,
    machine_ids: uniqueMachineIds(form.machine_ids),
    action: form.action,
    reason: form.reason.trim(),
  };
}

/** Body of POST /hands_report_machine_override_undo. */
export interface MachineOverrideUndoPayload {
  co_id: number;
  branch_id: number;
  override_ids: number[];
}

export function buildUndoPayload(
  coId: number,
  branchId: number,
  overrideIds: ReadonlyArray<number>,
): MachineOverrideUndoPayload {
  return { co_id: coId, branch_id: branchId, override_ids: uniqueMachineIds(overrideIds) };
}

/** One active machine of the branch, for the Add machines picker. */
export interface BranchMachine {
  machine_id: number;
  machine: string;
  mech_code: string | null;
  machine_type_id: number | null;
  machine_type: string | null;
  dept_id: number | null;
  dept: string | null;
  group_ids: number[];
  groups: string;
}

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** A machine of GET /hands_report_machines with the optional fields filled in;
 * null for an entry without a numeric machine id. */
export function toBranchMachine(raw: unknown): BranchMachine | null {
  if (raw == null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = numberOrNull(r.machine_id);
  if (id == null) return null;
  return {
    machine_id: id,
    machine: textOrNull(r.machine) ?? `Machine ${id}`,
    mech_code: textOrNull(r.mech_code),
    machine_type_id: numberOrNull(r.machine_type_id),
    machine_type: textOrNull(r.machine_type),
    dept_id: numberOrNull(r.dept_id),
    dept: textOrNull(r.dept),
    group_ids: Array.isArray(r.group_ids)
      ? r.group_ids.filter((g): g is number => typeof g === "number" && Number.isFinite(g))
      : [],
    groups: textOrNull(r.groups) ?? "",
  };
}

/** "S4 LOOM - 7 (L07) — Loom": the picker's option text, which is also what
 * typing filters on (name, mech code or type). */
export function branchMachineLabel(
  m: Pick<BranchMachine, "machine" | "mech_code" | "machine_type">,
): string {
  return `${m.machine}${m.mech_code ? ` (${m.mech_code})` : ""}${m.machine_type ? ` — ${m.machine_type}` : ""}`;
}

/** The picker's two optional filters; "" means "all". */
export interface BranchMachineFilters {
  machineTypeId: number | "";
  groupId: number | "";
  /** Department of the machine; omitted or "" = every department. */
  deptId?: number | "";
}

/**
 * The picker's options: the branch machines of the chosen machine type and
 * group. Machines already picked (`keepIds`) stay listed whatever the filters
 * say, so narrowing the list never drops a pick out of it.
 */
export function filterBranchMachines(
  machines: ReadonlyArray<BranchMachine>,
  filters: BranchMachineFilters,
  keepIds: ReadonlySet<number> = new Set(),
): BranchMachine[] {
  return machines.filter(
    (m) =>
      keepIds.has(m.machine_id) ||
      ((filters.deptId == null || filters.deptId === "" || m.dept_id === filters.deptId) &&
        (filters.machineTypeId === "" || m.machine_type_id === filters.machineTypeId) &&
        (filters.groupId === "" || m.group_ids.includes(filters.groupId))),
  );
}

/** Choices of the picker's Machine type and Group filters, read off the branch
 * machines (group names by position from each machine's `groups` text). */
export function branchMachineFilterOptions(
  machines: ReadonlyArray<BranchMachine>,
): Pick<MachineFilterOptions, "machineTypes" | "groups"> {
  const types = new Map<number, string>();
  for (const m of machines) {
    if (m.machine_type_id != null && !types.has(m.machine_type_id)) {
      types.set(m.machine_type_id, m.machine_type || `Type ${m.machine_type_id}`);
    }
  }
  const groupNames = machineGroupNames(machines, []);
  return {
    machineTypes: [...types].map(([value, label]) => ({ value, label })).sort(byLabel),
    groups: [...groupNames].map(([value, label]) => ({ value, label })).sort(byLabel),
  };
}

/** Choices of the picker's Department filter: the departments of the branch
 * machines plus those of the loaded rows (the Suggested list can name a
 * department before the machine list has loaded). */
export function branchMachineDepartmentOptions(
  machines: ReadonlyArray<Pick<BranchMachine, "dept_id" | "dept">>,
  rows: ReadonlyArray<Pick<MachineWorkedRow, "dept_id" | "dept">> = [],
): Array<{ value: number; label: string }> {
  const depts = new Map<number, string>();
  for (const m of [...machines, ...rows]) {
    if (m.dept_id != null && !depts.has(m.dept_id)) depts.set(m.dept_id, m.dept || `Department ${m.dept_id}`);
  }
  return [...depts].map(([value, label]) => ({ value, label })).sort(byLabel);
}

/**
 * Saves one manual ADD / EXCLUDE for the machines of the payload; resolves to
 * how many machine-shifts were saved. Rejects with the server's plain-language
 * `detail` (400 validation, 403 "this role can view … but not change …").
 */
export async function saveMachineOverride(payload: MachineOverridePayload): Promise<number> {
  const res = await fetchWithCookie<{ data?: { saved?: number } }>(
    apiRoutesPortalMasters.JP_HANDS_REPORT_MACHINE_OVERRIDE,
    "POST",
    payload,
  );
  if (res.error) throw new Error(res.error);
  const saved = res.data?.data?.saved;
  return typeof saved === "number" ? saved : payload.machine_ids.length;
}

/** Retires manual overrides by id; resolves to how many were undone. Rejects
 * with the server's `detail`. */
export async function undoMachineOverride(payload: MachineOverrideUndoPayload): Promise<number> {
  const res = await fetchWithCookie<{ data?: { undone?: number } }>(
    apiRoutesPortalMasters.JP_HANDS_REPORT_MACHINE_OVERRIDE_UNDO,
    "POST",
    payload,
  );
  if (res.error) throw new Error(res.error);
  const undone = res.data?.data?.undone;
  return typeof undone === "number" ? undone : payload.override_ids.length;
}

/** The branch's active machines for the Add machines picker, by machine name. */
export async function fetchBranchMachines(coId: number, branchId: number): Promise<BranchMachine[]> {
  const qs = new URLSearchParams({ co_id: String(coId), branch_id: String(branchId) });
  const res = await fetchWithCookie<{ data?: unknown }>(
    `${apiRoutesPortalMasters.JP_HANDS_REPORT_MACHINES}?${qs.toString()}`,
  );
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to load the branch machines");
  }
  const list = Array.isArray(res.data.data) ? res.data.data : [];
  return list
    .map(toBranchMachine)
    .filter((m): m is BranchMachine => m !== null)
    .sort(byMachineName);
}
