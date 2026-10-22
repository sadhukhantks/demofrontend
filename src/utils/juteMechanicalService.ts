import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";

/**
 * Service layer for the Jute Mechanical & Maintenance module (Portal).
 *
 * Backend routers (see docs/jute-mechanical-maintenance-spec.md in vowerp3be):
 *   /api/mechMaintMasters  reason / component / machine-attribute / PM-schedule masters
 *   /api/mechBreakdown     breakdown incident log
 *   /api/mechOverhaul      overhaul register
 *   /api/mechPM            preventive-maintenance executions
 *   /api/mechMaintReports  12 analytics reports
 *
 * There is NO approval workflow on this module — every save is direct. A breakdown's
 * `status` (OPEN / UNDER_REPAIR / CLOSED) tracks the repair, not a document lifecycle.
 *
 * Conventions in this file:
 *  - Query-parameter argument objects are camelCase (repo house style, mirroring
 *    inventoryReportService); they are mapped to the backend's snake_case names when
 *    the query string is built.
 *  - REQUEST BODIES are snake_case and mirror the backend Pydantic models exactly —
 *    never rename a body field.
 *  - `co_id` is required by every endpoint (the backend 400s without it);
 *    `branch_id` is optional and NULL means "all branches".
 *  - Every function throws on failure so callers can use try/catch.
 */

// =============================================================================
// Shared primitives
// =============================================================================

/** `{ data, total }` list envelope returned by every table/report endpoint. */
export interface MechListResult<T> {
  data: T[];
  total: number;
}

/**
 * Response of every create / edit / delete. The backend wraps in `{ "data": ... }`;
 * these helpers unwrap it, so a caller sees the inner object. Only the key for the
 * entity just written is populated.
 */
export interface MechWriteResult {
  message?: string;
  reason_id?: number;
  component_id?: number;
  machine_attr_id?: number;
  pm_schedule_id?: number;
  breakdown_id?: number;
  overhaul_id?: number;
  pm_exec_id?: number;
  power_meter_id?: number;
}

/**
 * An app-level enum served as a dropdown payload (disciplines, downtime types,
 * criticalities, PM frequencies, PM results, overhaul types, done-by, statuses).
 * `code` is the value stored in the DB, `label` the human label.
 *
 * The key is `code`, matching the house shape used by the jute-production
 * stoppage setup endpoint and by every setup endpoint in this module.
 *
 * `pm_frequencies` additionally carries `freq_days`, the day count the frequency
 * resolves to, so the PM form can default `next_due_date` without a round trip.
 */
export interface MechEnumOption {
  code: string;
  label: string;
  freq_days?: number | null;
}

/**
 * Machine option. `machine_mst` carries no `co_id`/`branch_id`, so `branch_id`
 * is DERIVED via `machine_mst -> dept_mst.branch_id` and can be null.
 */
export interface MechMachineOption {
  machine_id: number;
  machine_name: string;
  mech_code: string | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
  dept_id: number | null;
  dept_name: string | null;
  branch_id: number | null;
}

/** Machine type == the mill workbook's "section" (Spreader, Breaker Card, ...). */
export interface MechMachineTypeOption {
  machine_type_id: number;
  machine_type_name: string;
}

export interface MechDeptOption {
  dept_id: number;
  dept_name: string;
  dept_code: string | null;
  branch_id: number | null;
}

/** Attending crew (MECH FACTORY SIDE / MOTOR / FOUNDRY ...). */
export interface MechSubDeptOption {
  sub_dept_id: number;
  sub_dept_code: string | null;
  sub_dept_name: string;
  dept_id: number | null;
  dept_name: string | null;
  branch_id: number | null;
}

/** Spell (`spell_mst` keys activity by `status = 1`, not `active`). */
export interface MechSpellOption {
  spell_id: number;
  spell_code: string;
  spell_name: string | null;
  working_hours: number | null;
}

/** Failure-component lookup entry (Gear, Chain, Bearing, Roller, Motor, ...). */
export interface MechComponentOption {
  component_id: number;
  component_name: string;
  component_group: string | null;
}

/** Overhaul vendor from `party_mst`. */
export interface MechPartyOption {
  party_id: number;
  party_name: string;
}

// =============================================================================
// Internal request helpers
// =============================================================================

type MechHttpMethod = "GET" | "POST" | "PUT" | "DELETE";

type QueryValue = string | number | boolean | null | undefined;

/** Build a query string, dropping null/undefined/empty values. */
function buildQuery(params: Record<string, QueryValue>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    qs.set(key, String(value));
  }
  return qs.toString();
}

/** Call the API, throwing on any transport or backend error. */
async function request<T>(
  url: string,
  method: MechHttpMethod = "GET",
  body?: unknown,
): Promise<T> {
  const { data, error } = await fetchWithCookie<T>(url, method, body);
  if (error) throw new Error(error);
  if (data === null || data === undefined) {
    throw new Error(`Empty response from ${url}`);
  }
  return data;
}

/** Unwrap a `{ data: T }` envelope. */
async function requestData<T>(
  url: string,
  method: MechHttpMethod = "GET",
  body?: unknown,
): Promise<T> {
  const envelope = await request<{ data: T }>(url, method, body);
  return envelope.data;
}

/** Unwrap a `{ data: T[], total }` envelope; tolerates a missing `total`. */
async function requestList<T>(url: string): Promise<MechListResult<T>> {
  const envelope = await request<Partial<MechListResult<T>>>(url);
  const rows = envelope.data ?? [];
  return { data: rows, total: envelope.total ?? rows.length };
}

/** Shared paging arguments for every table endpoint. */
export interface MechPagingParams {
  page?: number;
  limit?: number;
  search?: string;
}

/** Reports are pulled in one page for the grid; the backend caps `limit` at 10000. */
const REPORT_PAGE_LIMIT = 10000;

// =============================================================================
// 1. Masters — /api/mechMaintMasters
// =============================================================================

/** A breakdown reason code. `machine_type_id === null` means a GLOBAL code. */
export interface MechReason {
  reason_id: number;
  co_id: number;
  machine_type_id: number | null;
  machine_type_name: string | null;
  reason_code: string;
  reason_desc: string;
  discipline: string;
  component_id: number | null;
  component_name: string | null;
  component_group: string | null;
  remarks: string | null;
  active: number;
  updated_by: number | null;
  updated_date_time: string | null;
}

/** Body for `reason_create` / `reason_edit`. */
export interface MechReasonPayload {
  co_id: number;
  /** null = a global code, available on every machine type. */
  machine_type_id?: number | null;
  reason_code: string;
  reason_desc: string;
  discipline: string;
  component_id?: number | null;
  remarks?: string | null;
}

/** Cross-section failure component master row. */
export interface MechComponent {
  component_id: number;
  co_id: number;
  component_name: string;
  component_group: string | null;
  remarks: string | null;
  active: number;
  updated_by: number | null;
  updated_date_time: string | null;
}

/** Body for `component_create` / `component_edit`. */
export interface MechComponentPayload {
  co_id: number;
  component_name: string;
  component_group?: string | null;
  remarks?: string | null;
}

/**
 * Maintenance attributes for one machine (satellite on `machine_mst`).
 *
 * The table endpoint LEFT JOINs from `machine_mst`, so a machine that has no
 * attribute row yet still comes back — with `machine_attr_id` and every attribute
 * column null. That is the normal state for most of the mill's 600+ machines.
 */
export interface MechMachineAttr {
  machine_attr_id: number | null;
  co_id: number | null;
  machine_id: number;
  machine_name: string;
  mech_code: string | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
  dept_id: number | null;
  dept_name: string | null;
  branch_id: number | null;
  make: string | null;
  model: string | null;
  serial_no: string | null;
  commissioning_date: string | null;
  /** A = critical, B = important, C = normal. */
  criticality: string | null;
  last_overhaul_date: string | null;
  overhaul_freq_months: number | null;
  /** Computed by the backend from last_overhaul_date + overhaul_freq_months. */
  next_overhaul_due: string | null;
  last_pm_date: string | null;
  pm_freq_days: number | null;
  /** Computed by the backend from last_pm_date + pm_freq_days. */
  next_pm_due: string | null;
  remarks: string | null;
  active: number | null;
  updated_by: number | null;
  updated_date_time: string | null;
}

/**
 * Body for `machine_attr_create` (upserts on co_id + machine_id) / `machine_attr_edit`.
 * `next_overhaul_due` and `next_pm_due` are derived server-side — never send them.
 */
export interface MechMachineAttrPayload {
  co_id: number;
  machine_id: number;
  make?: string | null;
  model?: string | null;
  serial_no?: string | null;
  commissioning_date?: string | null;
  criticality?: string | null;
  last_overhaul_date?: string | null;
  overhaul_freq_months?: number | null;
  last_pm_date?: string | null;
  pm_freq_days?: number | null;
  remarks?: string | null;
}

/** One PM checklist TEMPLATE task (machine-type-wide, machine-specific, or global). */
export interface MechPmSchedule {
  pm_schedule_id: number;
  co_id: number;
  machine_type_id: number | null;
  machine_type_name: string | null;
  machine_id: number | null;
  machine_name: string | null;
  mech_code: string | null;
  task_desc: string;
  frequency: string;
  /** Resolved from PM_FREQUENCY_DAYS when not supplied; drives next_pm_due. */
  freq_days: number | null;
  seq_no: number | null;
  remarks: string | null;
  active: number;
  updated_by: number | null;
  updated_date_time: string | null;
}

/** Body for `pm_schedule_create` / `pm_schedule_edit`. */
export interface MechPmSchedulePayload {
  co_id: number;
  machine_type_id?: number | null;
  machine_id?: number | null;
  task_desc: string;
  frequency: string;
  /** Omit to let the backend resolve it from `frequency`. */
  freq_days?: number | null;
  seq_no?: number | null;
  remarks?: string | null;
}

/** Every dropdown the four master screens need, in one call. */
export interface MechMastersSetup {
  machines: MechMachineOption[];
  machine_types: MechMachineTypeOption[];
  departments: MechDeptOption[];
  sub_departments: MechSubDeptOption[];
  spells: MechSpellOption[];
  components: MechComponentOption[];
  disciplines: MechEnumOption[];
  downtime_types: MechEnumOption[];
  criticalities: MechEnumOption[];
  pm_frequencies: MechEnumOption[];
}

/** GET /mechMaintMasters/masters_setup — all master-screen dropdowns in one call. */
export async function fetchMechMastersSetup(p: {
  coId: number;
  branchId?: number | null;
}): Promise<MechMastersSetup> {
  const url = `${apiRoutesPortalMasters.MECH_MASTERS_SETUP}?${buildQuery({
    co_id: p.coId,
    branch_id: p.branchId,
  })}`;
  return requestData<MechMastersSetup>(url);
}

export interface MechReasonTableParams extends MechPagingParams {
  coId: number;
  machineTypeId?: number | null;
  discipline?: string | null;
}

/** GET /mechMaintMasters/reason_table */
export async function fetchMechReasonTable(
  p: MechReasonTableParams,
): Promise<MechListResult<MechReason>> {
  const url = `${apiRoutesPortalMasters.MECH_REASON_TABLE}?${buildQuery({
    co_id: p.coId,
    machine_type_id: p.machineTypeId,
    discipline: p.discipline,
    search: p.search,
    page: p.page,
    limit: p.limit,
  })}`;
  return requestList<MechReason>(url);
}

/** GET /mechMaintMasters/reason_by_id/{reason_id} */
export async function fetchMechReasonById(
  reasonId: number,
  coId: number,
): Promise<MechReason> {
  const url = `${apiRoutesPortalMasters.MECH_REASON_BY_ID}/${reasonId}?${buildQuery({
    co_id: coId,
  })}`;
  return requestData<MechReason>(url);
}

/** POST /mechMaintMasters/reason_create */
export async function createMechReason(
  body: MechReasonPayload,
): Promise<MechWriteResult> {
  return requestData<MechWriteResult>(
    apiRoutesPortalMasters.MECH_REASON_CREATE,
    "POST",
    body,
  );
}

/** PUT /mechMaintMasters/reason_edit/{reason_id} */
export async function updateMechReason(
  reasonId: number,
  body: MechReasonPayload,
): Promise<MechWriteResult> {
  return requestData<MechWriteResult>(
    `${apiRoutesPortalMasters.MECH_REASON_EDIT}/${reasonId}`,
    "PUT",
    body,
  );
}

/** DELETE /mechMaintMasters/reason_delete/{reason_id} — soft delete; 400 if referenced. */
export async function deleteMechReason(
  reasonId: number,
  coId: number,
): Promise<MechWriteResult> {
  const url = `${apiRoutesPortalMasters.MECH_REASON_DELETE}/${reasonId}?${buildQuery({
    co_id: coId,
  })}`;
  return requestData<MechWriteResult>(url, "DELETE");
}

export interface MechComponentTableParams extends MechPagingParams {
  coId: number;
  componentGroup?: string | null;
}

/** GET /mechMaintMasters/component_table */
export async function fetchMechComponentTable(
  p: MechComponentTableParams,
): Promise<MechListResult<MechComponent>> {
  const url = `${apiRoutesPortalMasters.MECH_COMPONENT_TABLE}?${buildQuery({
    co_id: p.coId,
    component_group: p.componentGroup,
    search: p.search,
    page: p.page,
    limit: p.limit,
  })}`;
  return requestList<MechComponent>(url);
}

/** GET /mechMaintMasters/component_by_id/{component_id} */
export async function fetchMechComponentById(
  componentId: number,
  coId: number,
): Promise<MechComponent> {
  const url = `${apiRoutesPortalMasters.MECH_COMPONENT_BY_ID}/${componentId}?${buildQuery(
    { co_id: coId },
  )}`;
  return requestData<MechComponent>(url);
}

/** POST /mechMaintMasters/component_create */
export async function createMechComponent(
  body: MechComponentPayload,
): Promise<MechWriteResult> {
  return requestData<MechWriteResult>(
    apiRoutesPortalMasters.MECH_COMPONENT_CREATE,
    "POST",
    body,
  );
}

/** PUT /mechMaintMasters/component_edit/{component_id} */
export async function updateMechComponent(
  componentId: number,
  body: MechComponentPayload,
): Promise<MechWriteResult> {
  return requestData<MechWriteResult>(
    `${apiRoutesPortalMasters.MECH_COMPONENT_EDIT}/${componentId}`,
    "PUT",
    body,
  );
}

/** DELETE /mechMaintMasters/component_delete/{component_id} — 400 if referenced. */
export async function deleteMechComponent(
  componentId: number,
  coId: number,
): Promise<MechWriteResult> {
  const url = `${apiRoutesPortalMasters.MECH_COMPONENT_DELETE}/${componentId}?${buildQuery(
    { co_id: coId },
  )}`;
  return requestData<MechWriteResult>(url, "DELETE");
}

export interface MechMachineAttrTableParams extends MechPagingParams {
  coId: number;
  branchId?: number | null;
  machineTypeId?: number | null;
}

/** GET /mechMaintMasters/machine_attr_table — every machine, attributes when present. */
export async function fetchMechMachineAttrTable(
  p: MechMachineAttrTableParams,
): Promise<MechListResult<MechMachineAttr>> {
  const url = `${apiRoutesPortalMasters.MECH_MACHINE_ATTR_TABLE}?${buildQuery({
    co_id: p.coId,
    branch_id: p.branchId,
    machine_type_id: p.machineTypeId,
    search: p.search,
    page: p.page,
    limit: p.limit,
  })}`;
  return requestList<MechMachineAttr>(url);
}

/** GET /mechMaintMasters/machine_attr_by_id/{machine_attr_id} */
export async function fetchMechMachineAttrById(
  machineAttrId: number,
  coId: number,
): Promise<MechMachineAttr> {
  const url = `${apiRoutesPortalMasters.MECH_MACHINE_ATTR_BY_ID}/${machineAttrId}?${buildQuery(
    { co_id: coId },
  )}`;
  return requestData<MechMachineAttr>(url);
}

/** POST /mechMaintMasters/machine_attr_create — upserts on (co_id, machine_id). */
export async function createMechMachineAttr(
  body: MechMachineAttrPayload,
): Promise<MechWriteResult> {
  return requestData<MechWriteResult>(
    apiRoutesPortalMasters.MECH_MACHINE_ATTR_CREATE,
    "POST",
    body,
  );
}

/** PUT /mechMaintMasters/machine_attr_edit/{machine_attr_id} — recomputes both due dates. */
export async function updateMechMachineAttr(
  machineAttrId: number,
  body: MechMachineAttrPayload,
): Promise<MechWriteResult> {
  return requestData<MechWriteResult>(
    `${apiRoutesPortalMasters.MECH_MACHINE_ATTR_EDIT}/${machineAttrId}`,
    "PUT",
    body,
  );
}

/** DELETE /mechMaintMasters/machine_attr_delete/{machine_attr_id} — soft delete. */
export async function deleteMechMachineAttr(
  machineAttrId: number,
  coId: number,
): Promise<MechWriteResult> {
  const url = `${apiRoutesPortalMasters.MECH_MACHINE_ATTR_DELETE}/${machineAttrId}?${buildQuery(
    { co_id: coId },
  )}`;
  return requestData<MechWriteResult>(url, "DELETE");
}

export interface MechPmScheduleTableParams extends MechPagingParams {
  coId: number;
  machineTypeId?: number | null;
  machineId?: number | null;
  frequency?: string | null;
}

/** GET /mechMaintMasters/pm_schedule_table */
export async function fetchMechPmScheduleTable(
  p: MechPmScheduleTableParams,
): Promise<MechListResult<MechPmSchedule>> {
  const url = `${apiRoutesPortalMasters.MECH_PM_SCHEDULE_TABLE}?${buildQuery({
    co_id: p.coId,
    machine_type_id: p.machineTypeId,
    machine_id: p.machineId,
    frequency: p.frequency,
    search: p.search,
    page: p.page,
    limit: p.limit,
  })}`;
  return requestList<MechPmSchedule>(url);
}

/** GET /mechMaintMasters/pm_schedule_by_id/{pm_schedule_id} */
export async function fetchMechPmScheduleById(
  pmScheduleId: number,
  coId: number,
): Promise<MechPmSchedule> {
  const url = `${apiRoutesPortalMasters.MECH_PM_SCHEDULE_BY_ID}/${pmScheduleId}?${buildQuery(
    { co_id: coId },
  )}`;
  return requestData<MechPmSchedule>(url);
}

/** POST /mechMaintMasters/pm_schedule_create */
export async function createMechPmSchedule(
  body: MechPmSchedulePayload,
): Promise<MechWriteResult> {
  return requestData<MechWriteResult>(
    apiRoutesPortalMasters.MECH_PM_SCHEDULE_CREATE,
    "POST",
    body,
  );
}

/** PUT /mechMaintMasters/pm_schedule_edit/{pm_schedule_id} */
export async function updateMechPmSchedule(
  pmScheduleId: number,
  body: MechPmSchedulePayload,
): Promise<MechWriteResult> {
  return requestData<MechWriteResult>(
    `${apiRoutesPortalMasters.MECH_PM_SCHEDULE_EDIT}/${pmScheduleId}`,
    "PUT",
    body,
  );
}

/** DELETE /mechMaintMasters/pm_schedule_delete/{pm_schedule_id} — soft delete. */
export async function deleteMechPmSchedule(
  pmScheduleId: number,
  coId: number,
): Promise<MechWriteResult> {
  const url = `${apiRoutesPortalMasters.MECH_PM_SCHEDULE_DELETE}/${pmScheduleId}?${buildQuery(
    { co_id: coId },
  )}`;
  return requestData<MechWriteResult>(url, "DELETE");
}

// =============================================================================
// 2. Breakdown entry — /api/mechBreakdown
// =============================================================================

/** A spare consumed on a breakdown, as read back from the server. */
export interface MechBreakdownSpare {
  breakdown_spare_id: number;
  breakdown_id: number;
  item_id: number;
  item_code: string | null;
  item_name: string | null;
  qty: number | null;
  uom_id: number | null;
  uom_name: string | null;
  rate: number | null;
  amount: number | null;
  remarks: string | null;
}

/** A spare line as SENT in a breakdown create/edit body. */
export interface MechBreakdownSpareInput {
  item_id: number;
  qty?: number | null;
  uom_id?: number | null;
  rate?: number | null;
  amount?: number | null;
  remarks?: string | null;
}

/**
 * One breakdown incident. `(machine_id, tran_date)` is intentionally non-unique —
 * several incidents per machine per day are normal.
 *
 * `duration_min` and `response_min` are computed by the backend on save
 * (restart - stop, attended - stop); `duration_min === null` means still open.
 */
export interface MechBreakdown {
  breakdown_id: number;
  co_id: number;
  branch_id: number | null;
  branch_name: string | null;
  machine_id: number;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
  dept_id: number | null;
  dept_name: string | null;
  /** Date part of stop_datetime, set by the backend. */
  tran_date: string;
  spell_id: number | null;
  spell_code: string | null;
  stop_datetime: string;
  attended_datetime: string | null;
  restart_datetime: string | null;
  duration_min: number | null;
  response_min: number | null;
  reason_id: number;
  reason_code: string | null;
  reason_desc: string | null;
  component_id: number | null;
  component_name: string | null;
  discipline: string;
  downtime_type: string;
  attended_dept_id: number | null;
  attended_dept_name: string | null;
  attended_by: string | null;
  reported_by: string | null;
  /** The logged-in user who first logged the incident (stamped by the backend). */
  reported_by_user_id: number | null;
  reported_by_user_name: string | null;
  reported_date_time: string | null;
  /** The logged-in user who entered the restart / duration, i.e. the fix. */
  fixed_by_user_id: number | null;
  fixed_by_user_name: string | null;
  fixed_date_time: string | null;
  /** Production's reconfirmation of the fix: null = not checked yet. */
  prod_confirm_status: "CONFIRMED" | "DISPUTED" | null;
  prod_confirm_by: number | null;
  prod_confirm_by_name: string | null;
  prod_confirm_date_time: string | null;
  /** Production's own restart time, when it disputes the one mechanical entered. */
  prod_restart_datetime: string | null;
  prod_confirm_remarks: string | null;
  root_cause: string | null;
  action_taken: string | null;
  preventive_action: string | null;
  production_loss_qty: number | null;
  /** OPEN | UNDER_REPAIR | CLOSED — the repair state, not a document lifecycle. */
  status: string;
  remarks: string | null;
  active: number;
  updated_by: number | null;
  updated_date_time: string | null;
}

/** `entry_by_id` — the header plus its spare lines. */
export interface MechBreakdownDetail extends MechBreakdown {
  spares: MechBreakdownSpare[];
}

/**
 * Body for `entry_create` / `entry_edit` (backend `BreakdownCreate`).
 * On edit the spares list REPLACES the existing lines (old ones are soft-deleted).
 */
export interface MechBreakdownCreate {
  co_id: number;
  machine_id: number;
  stop_datetime: string;
  reason_id: number;
  /** Derived from the machine's department when omitted. */
  branch_id?: number | null;
  spell_id?: number | null;
  attended_datetime?: string | null;
  restart_datetime?: string | null;
  /** Defaults from the reason's component when omitted. */
  component_id?: number | null;
  /** Defaults from the reason's discipline when omitted. */
  discipline?: string | null;
  /** Defaults to "BREAKDOWN"; only BREAKDOWN rows count as failures in reports. */
  downtime_type?: string;
  /** sub_dept_mst.sub_dept_id of the attending crew. */
  attended_dept_id?: number | null;
  attended_by?: string | null;
  reported_by?: string | null;
  root_cause?: string | null;
  action_taken?: string | null;
  preventive_action?: string | null;
  production_loss_qty?: number | null;
  /**
   * Downtime minutes AS KEYED by the operator. Independent of the datetimes: the
   * backend stores it verbatim and it WINS over its own restart − stop figure.
   * A duration with no restart still closes the incident. Send null to clear it
   * and fall back to the computed value.
   */
  duration_min?: number | null;
  remarks?: string | null;
  spares?: MechBreakdownSpareInput[];
}

/**
 * Body for the quick close from the live board.
 *
 * `co_id` is required: every write is scoped `AND co_id = :co_id` server-side, so
 * one company cannot close another's incident even with a guessed id. The backend
 * accepts it in the body or as a query param; the body is what this service sends.
 *
 * Omitting `action_taken` leaves any note the fitter already recorded intact — the
 * backend coalesces rather than overwriting — so a bare close never wipes it.
 */
export interface MechBreakdownClosePayload {
  co_id: number;
  restart_datetime: string;
  action_taken?: string | null;
  /** Operator-keyed downtime minutes; overrides restart − stop when supplied. */
  duration_min?: number | null;
}

/**
 * Body for production's reconfirmation of a closed incident.
 *
 * `agreed: true` accepts the fix as mechanical entered it. `agreed: false` disputes
 * it and must carry a remark and/or production's own restart time. Neither changes
 * the restart / duration mechanical entered — the two versions sit side by side.
 */
export interface MechBreakdownConfirmPayload {
  co_id: number;
  agreed: boolean;
  restart_datetime?: string | null;
  remarks?: string | null;
}

/**
 * A currently-open incident from `GET /mechBreakdown/open_breakdowns`, with
 * minutes elapsed so far. Keys mirror `get_open_breakdowns_query()` exactly.
 */
export interface MechOpenBreakdown {
  breakdown_id: number;
  co_id: number;
  branch_id: number | null;
  machine_id: number;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
  dept_id: number | null;
  dept_name: string | null;
  tran_date: string;
  spell_id: number | null;
  spell_code: string | null;
  stop_datetime: string;
  attended_datetime: string | null;
  /** Minutes since stop_datetime, computed by the backend at read time. */
  elapsed_min: number | null;
  response_min: number | null;
  reason_id: number;
  reason_code: string | null;
  reason_desc: string | null;
  component_id: number | null;
  component_name: string | null;
  discipline: string;
  downtime_type: string;
  attended_dept_id: number | null;
  attended_dept_name: string | null;
  attended_by: string | null;
  reported_by: string | null;
  reported_by_user_id: number | null;
  reported_by_user_name: string | null;
  reported_date_time: string | null;
  status: string;
  remarks: string | null;
}

/** Dropdowns for the breakdown entry screen. */
export interface MechBreakdownSetup {
  machines: MechMachineOption[];
  spells: MechSpellOption[];
  components: MechComponentOption[];
  sub_departments: MechSubDeptOption[];
  disciplines: MechEnumOption[];
  downtime_types: MechEnumOption[];
  statuses: MechEnumOption[];
}

/** GET /mechBreakdown/entry_create_setup */
export async function fetchBreakdownSetup(p: {
  coId: number;
  branchId?: number | null;
}): Promise<MechBreakdownSetup> {
  const url = `${apiRoutesPortalMasters.MECH_BD_SETUP}?${buildQuery({
    co_id: p.coId,
    branch_id: p.branchId,
  })}`;
  return requestData<MechBreakdownSetup>(url);
}

/**
 * GET /mechBreakdown/reasons_by_machine — reasons for that machine's TYPE plus every
 * global (machine_type_id IS NULL) code, ordered by code.
 */
export async function fetchReasonsByMachine(p: {
  coId: number;
  machineId: number;
}): Promise<MechReason[]> {
  const url = `${apiRoutesPortalMasters.MECH_BD_REASONS_BY_MACHINE}?${buildQuery({
    co_id: p.coId,
    machine_id: p.machineId,
  })}`;
  return requestData<MechReason[]>(url);
}

export interface MechBreakdownEntriesParams extends MechPagingParams {
  coId: number;
  branchId?: number | null;
  dateFrom?: string;
  dateTo?: string;
  machineId?: number | null;
  machineTypeId?: number | null;
  discipline?: string | null;
  status?: string | null;
}

/** GET /mechBreakdown/entries — the filterable incident grid. */
export async function fetchBreakdownEntries(
  p: MechBreakdownEntriesParams,
): Promise<MechListResult<MechBreakdown>> {
  const url = `${apiRoutesPortalMasters.MECH_BD_ENTRIES}?${buildQuery({
    co_id: p.coId,
    branch_id: p.branchId,
    date_from: p.dateFrom,
    date_to: p.dateTo,
    machine_id: p.machineId,
    machine_type_id: p.machineTypeId,
    discipline: p.discipline,
    status: p.status,
    page: p.page,
    limit: p.limit,
  })}`;
  return requestList<MechBreakdown>(url);
}

/** GET /mechBreakdown/entry_by_id/{breakdown_id} — header + spares. */
export async function fetchBreakdownById(
  breakdownId: number,
  coId: number,
): Promise<MechBreakdownDetail> {
  const url = `${apiRoutesPortalMasters.MECH_BD_BY_ID}/${breakdownId}?${buildQuery({
    co_id: coId,
  })}`;
  return requestData<MechBreakdownDetail>(url);
}

/** POST /mechBreakdown/entry_create */
export async function createBreakdown(
  body: MechBreakdownCreate,
): Promise<MechWriteResult> {
  return requestData<MechWriteResult>(
    apiRoutesPortalMasters.MECH_BD_CREATE,
    "POST",
    body,
  );
}

/** PUT /mechBreakdown/entry_edit/{breakdown_id} — replaces the spare lines. */
export async function updateBreakdown(
  breakdownId: number,
  body: MechBreakdownCreate,
): Promise<MechWriteResult> {
  return requestData<MechWriteResult>(
    `${apiRoutesPortalMasters.MECH_BD_EDIT}/${breakdownId}`,
    "PUT",
    body,
  );
}

/** DELETE /mechBreakdown/entry_delete/{breakdown_id} — soft delete, cascades to spares. */
export async function deleteBreakdown(
  breakdownId: number,
  coId: number,
): Promise<MechWriteResult> {
  const url = `${apiRoutesPortalMasters.MECH_BD_DELETE}/${breakdownId}?${buildQuery({
    co_id: coId,
  })}`;
  return requestData<MechWriteResult>(url, "DELETE");
}

/**
 * POST /mechBreakdown/entry_close/{breakdown_id} — quick close from the live board.
 * The backend computes duration_min and moves the row to CLOSED.
 */
export async function closeBreakdown(
  breakdownId: number,
  body: MechBreakdownClosePayload,
): Promise<MechWriteResult> {
  return requestData<MechWriteResult>(
    `${apiRoutesPortalMasters.MECH_BD_CLOSE}/${breakdownId}`,
    "POST",
    body,
  );
}

/**
 * POST /mechBreakdown/entry_confirm/{breakdown_id} — production reconfirms (or
 * disputes) the fix on a closed incident.
 */
export async function confirmBreakdown(
  breakdownId: number,
  body: MechBreakdownConfirmPayload,
): Promise<MechWriteResult> {
  return requestData<MechWriteResult>(
    `${apiRoutesPortalMasters.MECH_BD_CONFIRM}/${breakdownId}`,
    "POST",
    body,
  );
}

/** GET /mechBreakdown/open_breakdowns — currently-open incidents + elapsed minutes. */
export async function fetchOpenBreakdowns(p: {
  coId: number;
  branchId?: number | null;
}): Promise<MechListResult<MechOpenBreakdown>> {
  const url = `${apiRoutesPortalMasters.MECH_BD_OPEN_LIST}?${buildQuery({
    co_id: p.coId,
    branch_id: p.branchId,
  })}`;
  return requestList<MechOpenBreakdown>(url);
}

// =============================================================================
// 3. Overhaul register — /api/mechOverhaul
// =============================================================================

/** A spare consumed during an overhaul, as read back from the server. */
export interface MechOverhaulSpare {
  overhaul_spare_id: number;
  overhaul_id: number;
  item_id: number;
  item_code: string | null;
  item_name: string | null;
  qty: number | null;
  uom_id: number | null;
  uom_name: string | null;
  rate: number | null;
  amount: number | null;
  remarks: string | null;
}

/** A spare line as SENT in an overhaul create/edit body. */
export interface MechOverhaulSpareInput {
  item_id: number;
  qty?: number | null;
  uom_id?: number | null;
  rate?: number | null;
  amount?: number | null;
  remarks?: string | null;
}

/**
 * One overhaul. `downtime_days`, `spare_cost` and `total_cost` are computed by the
 * backend on save, which also writes `machine_attr.last_overhaul_date` and
 * `next_overhaul_due`.
 */
export interface MechOverhaul {
  overhaul_id: number;
  co_id: number;
  branch_id: number | null;
  branch_name: string | null;
  machine_id: number;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
  dept_id: number | null;
  dept_name: string | null;
  /** MAJOR | MINOR */
  overhaul_type: string;
  from_date: string;
  to_date: string | null;
  downtime_days: number | null;
  work_done: string | null;
  /** INHOUSE | VENDOR */
  done_by: string;
  party_id: number | null;
  party_name: string | null;
  labour_cost: number | null;
  spare_cost: number | null;
  total_cost: number | null;
  next_due_date: string | null;
  remarks: string | null;
  active: number;
  updated_by: number | null;
  updated_date_time: string | null;
}

/** `overhaul_by_id` — the header plus its spare lines. */
export interface MechOverhaulDetail extends MechOverhaul {
  spares: MechOverhaulSpare[];
}

/**
 * Body for `overhaul_create` / `overhaul_edit`. Costs and downtime_days are derived
 * server-side — send `labour_cost` and the spare lines, not the rolled-up totals.
 */
export interface MechOverhaulCreate {
  co_id: number;
  machine_id: number;
  overhaul_type: string;
  from_date: string;
  to_date?: string | null;
  /** Derived from the machine's department when omitted. */
  branch_id?: number | null;
  work_done?: string | null;
  done_by?: string;
  /** party_mst.party_id — required in practice when done_by = "VENDOR". */
  party_id?: number | null;
  labour_cost?: number | null;
  remarks?: string | null;
  spares?: MechOverhaulSpareInput[];
}

/** Dropdowns for the overhaul screen. */
export interface MechOverhaulSetup {
  machines: MechMachineOption[];
  parties: MechPartyOption[];
  overhaul_types: MechEnumOption[];
  done_by_options: MechEnumOption[];
}

/** GET /mechOverhaul/overhaul_create_setup */
export async function fetchOverhaulSetup(p: {
  coId: number;
  branchId?: number | null;
}): Promise<MechOverhaulSetup> {
  const url = `${apiRoutesPortalMasters.MECH_OVERHAUL_SETUP}?${buildQuery({
    co_id: p.coId,
    branch_id: p.branchId,
  })}`;
  return requestData<MechOverhaulSetup>(url);
}

export interface MechOverhaulTableParams extends MechPagingParams {
  coId: number;
  branchId?: number | null;
  dateFrom?: string;
  dateTo?: string;
  machineId?: number | null;
  overhaulType?: string | null;
}

/** GET /mechOverhaul/overhaul_table */
export async function fetchOverhaulTable(
  p: MechOverhaulTableParams,
): Promise<MechListResult<MechOverhaul>> {
  const url = `${apiRoutesPortalMasters.MECH_OVERHAUL_TABLE}?${buildQuery({
    co_id: p.coId,
    branch_id: p.branchId,
    date_from: p.dateFrom,
    date_to: p.dateTo,
    machine_id: p.machineId,
    overhaul_type: p.overhaulType,
    page: p.page,
    limit: p.limit,
  })}`;
  return requestList<MechOverhaul>(url);
}

/** GET /mechOverhaul/overhaul_by_id/{overhaul_id} — header + spares. */
export async function fetchOverhaulById(
  overhaulId: number,
  coId: number,
): Promise<MechOverhaulDetail> {
  const url = `${apiRoutesPortalMasters.MECH_OVERHAUL_BY_ID}/${overhaulId}?${buildQuery(
    { co_id: coId },
  )}`;
  return requestData<MechOverhaulDetail>(url);
}

/** POST /mechOverhaul/overhaul_create — also updates the machine's overhaul dates. */
export async function createOverhaul(
  body: MechOverhaulCreate,
): Promise<MechWriteResult> {
  return requestData<MechWriteResult>(
    apiRoutesPortalMasters.MECH_OVERHAUL_CREATE,
    "POST",
    body,
  );
}

/** PUT /mechOverhaul/overhaul_edit/{overhaul_id} — same recomputation as create. */
export async function updateOverhaul(
  overhaulId: number,
  body: MechOverhaulCreate,
): Promise<MechWriteResult> {
  return requestData<MechWriteResult>(
    `${apiRoutesPortalMasters.MECH_OVERHAUL_EDIT}/${overhaulId}`,
    "PUT",
    body,
  );
}

/** DELETE /mechOverhaul/overhaul_delete/{overhaul_id} — soft delete, cascades to spares. */
export async function deleteOverhaul(
  overhaulId: number,
  coId: number,
): Promise<MechWriteResult> {
  const url = `${apiRoutesPortalMasters.MECH_OVERHAUL_DELETE}/${overhaulId}?${buildQuery(
    { co_id: coId },
  )}`;
  return requestData<MechWriteResult>(url, "DELETE");
}

// =============================================================================
// 4. Preventive maintenance — /api/mechPM
// =============================================================================

/** One checklist task result on a PM visit, as read back from the server. */
export interface MechPmTask {
  pm_exec_dtl_id: number;
  pm_exec_id: number;
  /** Null for an ad-hoc task done on the day (not from the template). */
  pm_schedule_id: number | null;
  /** Snapshotted at execution time so later template edits do not rewrite history. */
  task_desc: string | null;
  /** OK | NOT_OK | NA */
  result: string;
  observation: string | null;
}

/** A checklist task line as SENT in a PM execution create/edit body. */
export interface MechPmTaskInput {
  pm_schedule_id?: number | null;
  task_desc?: string | null;
  result: string;
  observation?: string | null;
}

/**
 * One PM visit on one machine. On save the backend also writes
 * `machine_attr.last_pm_date` and `next_pm_due`.
 */
export interface MechPmExecution {
  pm_exec_id: number;
  co_id: number;
  branch_id: number | null;
  branch_name: string | null;
  machine_id: number;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
  dept_id: number | null;
  dept_name: string | null;
  pm_date: string;
  /** Which cycle this visit covers: DAILY | WEEKLY | MONTHLY | ... */
  frequency: string | null;
  done_by: string | null;
  downtime_min: number | null;
  next_due_date: string | null;
  remarks: string | null;
  active: number;
  updated_by: number | null;
  updated_date_time: string | null;
}

/** `pm_execution_by_id` — the header plus its checklist task rows. */
export interface MechPmExecutionDetail extends MechPmExecution {
  tasks: MechPmTask[];
}

/**
 * Body for `pm_execution_create` / `pm_execution_edit`. On edit the tasks list
 * REPLACES the existing detail rows.
 */
export interface MechPmExecutionCreate {
  co_id: number;
  machine_id: number;
  pm_date: string;
  /** Derived from the machine's department when omitted. */
  branch_id?: number | null;
  frequency?: string | null;
  done_by?: string | null;
  downtime_min?: number | null;
  remarks?: string | null;
  tasks?: MechPmTaskInput[];
}

/** A template task returned by `pm_checklist`, used to seed the detail grid. */
export interface MechPmChecklistTask {
  pm_schedule_id: number;
  co_id: number;
  machine_type_id: number | null;
  machine_type_name: string | null;
  machine_id: number | null;
  task_desc: string;
  frequency: string;
  freq_days: number | null;
  seq_no: number | null;
  remarks: string | null;
}

/**
 * `pm_checklist` payload. The endpoint does NOT return a bare task array: it wraps
 * the tasks in the resolved machine context, which the entry screen displays
 * (machine type and the frequency actually applied).
 */
export interface MechPmChecklistResult {
  machine_id: number;
  machine_name: string | null;
  machine_type_id: number | null;
  /** Derived via machine_mst -> dept_mst.branch_id. */
  branch_id: number | null;
  /** The frequency filter that was applied, or null when unfiltered. */
  frequency: string | null;
  tasks: MechPmChecklistTask[];
}

/** Dropdowns for the PM execution screen. */
export interface MechPmSetup {
  machines: MechMachineOption[];
  pm_frequencies: MechEnumOption[];
  pm_results: MechEnumOption[];
}

/** GET /mechPM/pm_create_setup */
export async function fetchPmSetup(p: {
  coId: number;
  branchId?: number | null;
}): Promise<MechPmSetup> {
  const url = `${apiRoutesPortalMasters.MECH_PM_SETUP}?${buildQuery({
    co_id: p.coId,
    branch_id: p.branchId,
  })}`;
  return requestData<MechPmSetup>(url);
}

/**
 * GET /mechPM/pm_checklist — schedule tasks matching this machine OR its machine
 * type, ordered by seq_no. Seeds the PM execution detail grid.
 *
 * Returns the machine CONTEXT plus `tasks`, not a bare array — the caller needs
 * the resolved machine type and applied frequency to label the grid.
 */
export async function fetchPmChecklist(p: {
  coId: number;
  machineId: number;
  frequency?: string | null;
}): Promise<MechPmChecklistResult> {
  const url = `${apiRoutesPortalMasters.MECH_PM_CHECKLIST}?${buildQuery({
    co_id: p.coId,
    machine_id: p.machineId,
    frequency: p.frequency,
  })}`;
  const result = await requestData<Partial<MechPmChecklistResult>>(url);
  return {
    machine_id: result.machine_id ?? p.machineId,
    machine_name: result.machine_name ?? null,
    machine_type_id: result.machine_type_id ?? null,
    branch_id: result.branch_id ?? null,
    frequency: result.frequency ?? null,
    tasks: result.tasks ?? [],
  };
}

export interface MechPmExecutionTableParams extends MechPagingParams {
  coId: number;
  branchId?: number | null;
  dateFrom?: string;
  dateTo?: string;
  machineId?: number | null;
}

/** GET /mechPM/pm_execution_table */
export async function fetchPmExecutionTable(
  p: MechPmExecutionTableParams,
): Promise<MechListResult<MechPmExecution>> {
  const url = `${apiRoutesPortalMasters.MECH_PM_TABLE}?${buildQuery({
    co_id: p.coId,
    branch_id: p.branchId,
    date_from: p.dateFrom,
    date_to: p.dateTo,
    machine_id: p.machineId,
    page: p.page,
    limit: p.limit,
  })}`;
  return requestList<MechPmExecution>(url);
}

/** GET /mechPM/pm_execution_by_id/{pm_exec_id} — header + tasks. */
export async function fetchPmExecutionById(
  pmExecId: number,
  coId: number,
): Promise<MechPmExecutionDetail> {
  const url = `${apiRoutesPortalMasters.MECH_PM_BY_ID}/${pmExecId}?${buildQuery({
    co_id: coId,
  })}`;
  return requestData<MechPmExecutionDetail>(url);
}

/** POST /mechPM/pm_execution_create — snapshots task_desc into each detail row. */
export async function createPmExecution(
  body: MechPmExecutionCreate,
): Promise<MechWriteResult> {
  return requestData<MechWriteResult>(
    apiRoutesPortalMasters.MECH_PM_CREATE,
    "POST",
    body,
  );
}

/** PUT /mechPM/pm_execution_edit/{pm_exec_id} — replaces the detail rows. */
export async function updatePmExecution(
  pmExecId: number,
  body: MechPmExecutionCreate,
): Promise<MechWriteResult> {
  return requestData<MechWriteResult>(
    `${apiRoutesPortalMasters.MECH_PM_EDIT}/${pmExecId}`,
    "PUT",
    body,
  );
}

/** DELETE /mechPM/pm_execution_delete/{pm_exec_id} — soft delete, cascades to detail. */
export async function deletePmExecution(
  pmExecId: number,
  coId: number,
): Promise<MechWriteResult> {
  const url = `${apiRoutesPortalMasters.MECH_PM_DELETE}/${pmExecId}?${buildQuery({
    co_id: coId,
  })}`;
  return requestData<MechWriteResult>(url, "DELETE");
}

// =============================================================================
// 5. Reports — /api/mechMaintReports
// =============================================================================
//
// Every row interface below mirrors the dict literal the matching handler in
// `src/juteMechanical/reports.py` builds. That file is the authority on response
// keys — not the spec document, which is less precise. Two endpoints
// (`/top-problem-machines`, `/machine-history`) return `data` as an OBJECT of
// named lists rather than an array and therefore have their own result types and
// their own request path; routing them through `requestReport` would hand callers
// an array type they could `.map()` and blow up on at runtime.

/**
 * The `summary` block that accompanies a report.
 *
 * Every field is optional because the blocks differ by report: the failure-metric
 * reports share the `_metrics()` set, while `/maintenance-due`,
 * `/spares-consumption` and `/open-breakdown-board` each return their own
 * counters. This is the honest union of all of them.
 */
export interface MechReportSummary {
  // --- shared failure metrics (_metrics + _fetch_summary) -------------------
  breakdown_count?: number;
  total_downtime_min?: number | null;
  nr_downtime_min?: number | null;
  days_in_range?: number | null;
  available_min?: number | null;
  mttr_min?: number | null;
  mtbf_min?: number | null;
  availability_pct?: number | null;
  /** Share of downtime logged against reason code 'NR' ("No Reason mentioned"). */
  unattributed_pct?: number | null;
  downtime_per_1000_running_hrs?: number | null;
  nr_count?: number;
  machine_count?: number;
  open_count?: number;
  avg_response_min?: number | null;
  production_loss_qty?: number | null;
  first_breakdown_date?: string | null;
  last_breakdown_date?: string | null;
  // --- /maintenance-due ----------------------------------------------------
  as_on_date?: string;
  due_within_days?: number;
  due_cutoff?: string;
  pm_due_count?: number;
  pm_overdue_count?: number;
  overhaul_due_count?: number;
  overhaul_overdue_count?: number;
  critical_count?: number;
  // --- /spares-consumption -------------------------------------------------
  page_total_qty?: number | null;
  page_total_value?: number | null;
  total_maintenance_cost?: number | null;
  // --- /top-problem-machines -----------------------------------------------
  top_n?: number;
  repeat_failure_window_days?: number;
  repeat_failure_count?: number;
  // --- /machine-history ----------------------------------------------------
  breakdown_row_count?: number;
  pm_execution_count?: number;
  overhaul_count?: number;
  spare_line_count?: number;
  spare_value?: number | null;
  overhaul_cost?: number | null;
  // --- /open-breakdown-board -----------------------------------------------
  total_elapsed_min?: number | null;
  max_elapsed_min?: number | null;
  avg_elapsed_min?: number | null;
}

/**
 * A report response: the rows plus the envelope the backend sends around them.
 *
 * `unattributed_pct` is carried here deliberately. It is the share of downtime
 * booked to 'NR', and surfacing it on every summary report is what stops "No
 * Reason mentioned" quietly absorbing real causes — so the envelope preserves the
 * backend's figure instead of leaving each page to re-derive it from the rows on
 * screen (which would only ever see the current page of data).
 */
export interface MechReportResult<T> extends MechListResult<T> {
  summary: MechReportSummary | null;
  /**
   * Mill-level unattributed share for the whole filter set. Null on the three
   * reports that do not compute it (`/maintenance-due`, `/spares-consumption`,
   * `/open-breakdown-board`).
   */
  unattributed_pct: number | null;
}

/**
 * Filters accepted by every report endpoint. Only `coId` is required; the rest
 * narrow the range. `limit` defaults to the backend cap (10000) so a report grid
 * gets its whole result in one page.
 */
export interface MechReportParams {
  coId: number;
  branchId?: number | null;
  dateFrom?: string;
  dateTo?: string;
  machineTypeId?: number | null;
  machineId?: number | null;
  discipline?: string | null;
  page?: number;
  limit?: number;
}

function reportQuery(p: MechReportParams): string {
  return buildQuery({
    co_id: p.coId,
    branch_id: p.branchId,
    date_from: p.dateFrom,
    date_to: p.dateTo,
    machine_type_id: p.machineTypeId,
    machine_id: p.machineId,
    discipline: p.discipline,
    page: p.page,
    limit: p.limit ?? REPORT_PAGE_LIMIT,
  });
}

/** The raw report envelope, before defaults are applied. */
interface MechReportEnvelope<T> {
  data?: T[];
  total?: number;
  summary?: MechReportSummary;
  unattributed_pct?: number | null;
}

/**
 * Fetch an array-shaped report, preserving `summary` and `unattributed_pct`.
 * Falls back to the summary's own `unattributed_pct` when the top-level copy is
 * absent, and to null when neither is present.
 */
async function requestReport<T>(url: string): Promise<MechReportResult<T>> {
  const envelope = await request<MechReportEnvelope<T>>(url);
  const rows = envelope.data ?? [];
  const summary = envelope.summary ?? null;
  return {
    data: rows,
    total: envelope.total ?? rows.length,
    summary,
    unattributed_pct: envelope.unattributed_pct ?? summary?.unattributed_pct ?? null,
  };
}

// --- R1 /breakdown-register --------------------------------------------------

/**
 * One row of the raw incident log.
 *
 * NOT limited to `downtime_type = 'BREAKDOWN'`: the register is the audit trail
 * and shows planned PM / no-material / changeover rows too. The handler projects
 * a narrower row than the entry-screen `MechBreakdown` — no `co_id`, no
 * `branch_name`, no audit columns — so this is its own interface.
 */
export interface MechBreakdownRegisterRow {
  breakdown_id: number;
  tran_date: string | null;
  machine_id: number;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
  dept_id: number | null;
  dept_name: string | null;
  branch_id: number | null;
  spell_id: number | null;
  spell_code: string | null;
  stop_datetime: string | null;
  attended_datetime: string | null;
  restart_datetime: string | null;
  duration_min: number | null;
  response_min: number | null;
  reason_id: number | null;
  reason_code: string | null;
  reason_desc: string | null;
  component_id: number | null;
  component_name: string | null;
  component_group: string | null;
  discipline: string | null;
  downtime_type: string | null;
  attended_dept_id: number | null;
  attended_dept_name: string | null;
  attended_by: string | null;
  reported_by: string | null;
  root_cause: string | null;
  action_taken: string | null;
  preventive_action: string | null;
  production_loss_qty: number | null;
  status: string | null;
  remarks: string | null;
}

/** GET /mechMaintReports/breakdown-register */
export async function fetchBreakdownRegisterReport(
  p: MechReportParams,
): Promise<MechReportResult<MechBreakdownRegisterRow>> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_BREAKDOWN_REGISTER}?${reportQuery(p)}`;
  return requestReport<MechBreakdownRegisterRow>(url);
}

// --- R2 /machine-summary -----------------------------------------------------

/** Per machine: the workbook's main sheet, plus the MTBF/availability it cannot compute. */
export interface MechMachineSummaryRow {
  machine_id: number;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
  dept_id: number | null;
  dept_name: string | null;
  branch_id: number | null;
  criticality: string | null;
  breakdown_count: number;
  total_downtime_min: number | null;
  /** What the workbook calls "duration per breakdown". */
  mttr_min: number | null;
  mtbf_min: number | null;
  availability_pct: number | null;
  available_min: number | null;
  days_in_range: number | null;
  nr_downtime_min: number | null;
  unattributed_pct: number | null;
  nr_count: number;
  avg_response_min: number | null;
  open_count: number;
  production_loss_qty: number | null;
  pct_of_mill_downtime: number | null;
  first_breakdown_date: string | null;
  last_breakdown_date: string | null;
}

/** GET /mechMaintReports/machine-summary */
export async function fetchMachineSummaryReport(
  p: MechReportParams,
): Promise<MechReportResult<MechMachineSummaryRow>> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_MACHINE_SUMMARY}?${reportQuery(p)}`;
  return requestReport<MechMachineSummaryRow>(url);
}

// --- R3 /reason-pareto -------------------------------------------------------

/**
 * Per reason: the workbook's reason block turned into a real Pareto.
 *
 * NOTE the key names — this handler does NOT use the `breakdown_count` /
 * `total_downtime_min` names the other reports use. It emits `count`,
 * `total_duration` and `pct_share`.
 */
export interface MechReasonParetoRow {
  reason_id: number | null;
  reason_code: string | null;
  reason_desc: string | null;
  discipline: string | null;
  component_id: number | null;
  component_name: string | null;
  /** Distinct machines that hit this reason. */
  machine_count: number;
  /** Breakdown count for this reason (NOT `breakdown_count`). */
  count: number;
  /** Total downtime minutes for this reason (NOT `total_downtime_min`). */
  total_duration: number | null;
  duration_per_breakdown: number | null;
  /** Share of mill downtime (NOT `share_pct`). */
  pct_share: number | null;
  cumulative_duration: number | null;
  cumulative_pct: number | null;
}

/** GET /mechMaintReports/reason-pareto */
export async function fetchReasonParetoReport(
  p: MechReportParams,
): Promise<MechReportResult<MechReasonParetoRow>> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_REASON_PARETO}?${reportQuery(p)}`;
  return requestReport<MechReasonParetoRow>(url);
}

// --- R4 /date-machine-grid ---------------------------------------------------

/** One machine column of the date x machine grid. */
export interface MechDateMachineGridColumn {
  machine_id: number;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
}

/**
 * One grid row: a date, its daily totals, and one key per machine id
 * (stringified) holding that cell's reason codes joined with "/" — exactly how
 * the mill writes them into a single Excel cell today ("RF/DRJ", "DRJ/PB/BJ").
 *
 * The machine keys are dynamic, so cell values arrive as `unknown`; narrow them
 * at the render site.
 */
export type MechDateMachineGridRow = {
  tran_date: string | null;
  breakdown_count: number;
  total_downtime_min: number | null;
} & Record<string, unknown>;

/** The grid response: rows, the machine columns to render, and the envelope. */
export interface MechDateMachineGridResult
  extends MechReportResult<MechDateMachineGridRow> {
  columns: MechDateMachineGridColumn[];
}

/**
 * GET /mechMaintReports/date-machine-grid — the exact replica of the sheet the
 * mill keys today. Paging is on the DATE axis: one row per date.
 */
export async function fetchDateMachineGridReport(
  p: MechReportParams,
): Promise<MechDateMachineGridResult> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_DATE_MACHINE_GRID}?${reportQuery(p)}`;
  const envelope = await request<
    MechReportEnvelope<MechDateMachineGridRow> & {
      columns?: MechDateMachineGridColumn[];
    }
  >(url);
  const rows = envelope.data ?? [];
  const summary = envelope.summary ?? null;
  return {
    data: rows,
    total: envelope.total ?? rows.length,
    summary,
    unattributed_pct: envelope.unattributed_pct ?? summary?.unattributed_pct ?? null,
    columns: envelope.columns ?? [],
  };
}

// --- R5 /department-summary --------------------------------------------------

/** Per department + machine type. */
export interface MechDepartmentSummaryRow {
  dept_id: number | null;
  dept_name: string | null;
  branch_id: number | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
  machine_count: number;
  breakdown_count: number;
  total_downtime_min: number | null;
  mttr_min: number | null;
  mtbf_min: number | null;
  availability_pct: number | null;
  nr_downtime_min: number | null;
  unattributed_pct: number | null;
  nr_count: number;
  production_loss_qty: number | null;
  /** Share of total mill downtime (NOT `share_pct`). */
  pct_of_mill_downtime: number | null;
}

/** GET /mechMaintReports/department-summary */
export async function fetchDepartmentSummaryReport(
  p: MechReportParams,
): Promise<MechReportResult<MechDepartmentSummaryRow>> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_DEPARTMENT_SUMMARY}?${reportQuery(p)}`;
  return requestReport<MechDepartmentSummaryRow>(url);
}

// --- R6 /reliability ---------------------------------------------------------

/** Per machine: MTBF, MTTR, availability %, downtime per 1000 running hours. */
export interface MechReliabilityRow {
  machine_id: number;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
  dept_id: number | null;
  dept_name: string | null;
  branch_id: number | null;
  criticality: string | null;
  breakdown_count: number;
  total_downtime_min: number | null;
  days_in_range: number | null;
  available_min: number | null;
  /** (available_min - downtime) / 60 — time the machine was able to run. */
  running_hrs: number | null;
  mtbf_min: number | null;
  mtbf_hrs: number | null;
  mttr_min: number | null;
  availability_pct: number | null;
  /** Note the full key name — NOT `downtime_per_1000_hrs`. */
  downtime_per_1000_running_hrs: number | null;
  avg_response_min: number | null;
  nr_downtime_min: number | null;
  unattributed_pct: number | null;
  open_count: number;
}

/** GET /mechMaintReports/reliability */
export async function fetchReliabilityReport(
  p: MechReportParams,
): Promise<MechReportResult<MechReliabilityRow>> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_RELIABILITY}?${reportQuery(p)}`;
  return requestReport<MechReliabilityRow>(url);
}

// --- R7 /reason-trend --------------------------------------------------------

/**
 * The workbook's Summary sheets: ONE ROW PER REASON, already pivoted by month.
 *
 * Besides the fixed fields, each row carries a `"<YYYY-MM>_count"` and a
 * `"<YYYY-MM>_duration"` key for every month in the response's `months` array —
 * dynamic keys, hence the index signature. Read them via `months`, not by
 * guessing at column names.
 */
export type MechReasonTrendRow = {
  reason_id: number | null;
  reason_code: string | null;
  reason_desc: string | null;
  discipline: string | null;
  component_name: string | null;
  total_count: number;
  total_duration: number | null;
  duration_per_breakdown: number | null;
} & Record<string, unknown>;

/** The trend response: rows plus the ordered YYYY-MM columns they are keyed by. */
export interface MechReasonTrendResult extends MechReportResult<MechReasonTrendRow> {
  /** Ordered YYYY-MM keys present on every row; drives the dynamic columns. */
  months: string[];
}

/** GET /mechMaintReports/reason-trend */
export async function fetchReasonTrendReport(
  p: MechReportParams,
): Promise<MechReasonTrendResult> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_REASON_TREND}?${reportQuery(p)}`;
  const envelope = await request<
    MechReportEnvelope<MechReasonTrendRow> & { months?: string[] }
  >(url);
  const rows = envelope.data ?? [];
  const summary = envelope.summary ?? null;
  return {
    data: rows,
    total: envelope.total ?? rows.length,
    summary,
    unattributed_pct: envelope.unattributed_pct ?? summary?.unattributed_pct ?? null,
    months: envelope.months ?? [],
  };
}

// --- R8 /maintenance-due -----------------------------------------------------

/**
 * ONE ROW PER DUE ITEM — not PM and overhaul side by side.
 *
 * A machine with both a PM and an overhaul due appears TWICE; `due_type` says
 * which. `days_overdue` is positive once the date has passed and negative while
 * the item is merely upcoming inside the `due_within_days` window (default 30).
 */
export interface MechMaintenanceDueRow {
  /** 'PM' | 'OVERHAUL' */
  due_type: string;
  machine_attr_id: number | null;
  machine_id: number;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
  dept_id: number | null;
  dept_name: string | null;
  branch_id: number | null;
  criticality: string | null;
  make: string | null;
  model: string | null;
  due_date: string | null;
  last_done_date: string | null;
  /** Set on a PM row. */
  freq_days: number | null;
  /** Set on an OVERHAUL row. */
  freq_months: number | null;
  days_overdue: number | null;
  is_overdue: boolean;
}

/** GET /mechMaintReports/maintenance-due */
export async function fetchMaintenanceDueReport(
  p: MechReportParams,
): Promise<MechReportResult<MechMaintenanceDueRow>> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_MAINTENANCE_DUE}?${reportQuery(p)}`;
  return requestReport<MechMaintenanceDueRow>(url);
}

// --- R9 /spares-consumption --------------------------------------------------

/**
 * Per machine + item spares. Quantities and values arrive SPLIT by source —
 * breakdown vs overhaul — with the pair totalled; there is no single `qty`,
 * `value` or `source` field on this row.
 */
export interface MechSparesConsumptionRow {
  machine_id: number | null;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
  dept_id: number | null;
  dept_name: string | null;
  branch_id: number | null;
  item_id: number;
  item_code: string | null;
  item_name: string | null;
  uom_name: string | null;
  breakdown_qty: number | null;
  breakdown_value: number | null;
  overhaul_qty: number | null;
  overhaul_value: number | null;
  total_qty: number | null;
  total_value: number | null;
  line_count: number;
}

/**
 * Maintenance cost per machine, returned alongside the spare lines. Folds in
 * overhaul labour, so this is the real maintenance spend rather than only the
 * parts bill.
 */
export interface MechSparesMachineCostRow {
  machine_id: number | null;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
  dept_id: number | null;
  dept_name: string | null;
  branch_id: number | null;
  breakdown_spare_value: number | null;
  overhaul_spare_value: number | null;
  overhaul_labour_cost: number | null;
  total_maintenance_cost: number | null;
}

/** The spares response: item lines plus the per-machine cost roll-up. */
export interface MechSparesConsumptionResult
  extends MechReportResult<MechSparesConsumptionRow> {
  machine_cost: MechSparesMachineCostRow[];
}

/** GET /mechMaintReports/spares-consumption */
export async function fetchSparesConsumptionReport(
  p: MechReportParams,
): Promise<MechSparesConsumptionResult> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_SPARES_CONSUMPTION}?${reportQuery(p)}`;
  const envelope = await request<
    MechReportEnvelope<MechSparesConsumptionRow> & {
      machine_cost?: MechSparesMachineCostRow[];
    }
  >(url);
  const rows = envelope.data ?? [];
  const summary = envelope.summary ?? null;
  return {
    data: rows,
    total: envelope.total ?? rows.length,
    summary,
    unattributed_pct: envelope.unattributed_pct ?? summary?.unattributed_pct ?? null,
    machine_cost: envelope.machine_cost ?? [],
  };
}

// --- R10 /top-problem-machines ----------------------------------------------

/** A machine in one of the two top-N blocks. */
export interface MechTopMachineRow {
  machine_id: number;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
  dept_id: number | null;
  dept_name: string | null;
  branch_id: number | null;
  criticality: string | null;
  breakdown_count: number;
  total_downtime_min: number | null;
  mttr_min: number | null;
  mtbf_min: number | null;
  availability_pct: number | null;
  nr_downtime_min: number | null;
  unattributed_pct: number | null;
  pct_of_mill_downtime: number | null;
  first_breakdown_date: string | null;
  last_breakdown_date: string | null;
}

/**
 * The same machine + component failing again inside
 * REPEAT_FAILURE_WINDOW_DAYS — the sharpest signal this module produces, since it
 * separates "we fixed it" from "we patched it". Incidents with no component
 * tagged cannot be paired and are excluded rather than guessed at.
 */
export interface MechRepeatFailureRow {
  breakdown_id: number;
  machine_id: number;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
  dept_id: number | null;
  dept_name: string | null;
  branch_id: number | null;
  component_id: number | null;
  component_name: string | null;
  component_group: string | null;
  reason_id: number | null;
  reason_code: string | null;
  reason_desc: string | null;
  tran_date: string | null;
  stop_datetime: string | null;
  duration_min: number | null;
  prev_breakdown_id: number | null;
  prev_tran_date: string | null;
  prev_duration_min: number | null;
  prev_reason_code: string | null;
  days_since_previous: number;
}

/** `data` for /top-problem-machines: three named lists, NOT an array. */
export interface MechTopProblemMachinesData {
  by_downtime: MechTopMachineRow[];
  by_count: MechTopMachineRow[];
  repeat_failures: MechRepeatFailureRow[];
}

/**
 * /top-problem-machines does not fit the array-shaped report envelope, so it gets
 * its own result type. `data` is an OBJECT — never call `.map()` on it.
 */
export interface MechTopProblemMachinesResult {
  data: MechTopProblemMachinesData;
  /** Length of `by_downtime`, per the backend. */
  total: number;
  summary: MechReportSummary | null;
  unattributed_pct: number | null;
}

/** GET /mechMaintReports/top-problem-machines */
export async function fetchTopProblemMachinesReport(
  p: MechReportParams,
): Promise<MechTopProblemMachinesResult> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_TOP_PROBLEM_MACHINES}?${reportQuery(p)}`;
  const envelope = await request<{
    data?: Partial<MechTopProblemMachinesData>;
    total?: number;
    summary?: MechReportSummary;
    unattributed_pct?: number | null;
  }>(url);
  const summary = envelope.summary ?? null;
  const data: MechTopProblemMachinesData = {
    by_downtime: envelope.data?.by_downtime ?? [],
    by_count: envelope.data?.by_count ?? [],
    repeat_failures: envelope.data?.repeat_failures ?? [],
  };
  return {
    data,
    total: envelope.total ?? data.by_downtime.length,
    summary,
    unattributed_pct: envelope.unattributed_pct ?? summary?.unattributed_pct ?? null,
  };
}

// --- R11 /machine-history ----------------------------------------------------

/** The machine header of the history card: identity + maintenance attributes. */
export interface MechMachineHistoryMachine {
  machine_id: number;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
  dept_id: number | null;
  dept_name: string | null;
  branch_id: number | null;
  machine_attr_id: number | null;
  make: string | null;
  model: string | null;
  serial_no: string | null;
  commissioning_date: string | null;
  criticality: string | null;
  last_overhaul_date: string | null;
  overhaul_freq_months: number | null;
  next_overhaul_due: string | null;
  last_pm_date: string | null;
  pm_freq_days: number | null;
  next_pm_due: string | null;
  remarks: string | null;
}

/** A breakdown in the history panel — ALL downtime types, not failures only. */
export interface MechMachineHistoryBreakdown {
  breakdown_id: number;
  tran_date: string | null;
  spell_id: number | null;
  spell_code: string | null;
  stop_datetime: string | null;
  attended_datetime: string | null;
  restart_datetime: string | null;
  duration_min: number | null;
  response_min: number | null;
  reason_id: number | null;
  reason_code: string | null;
  reason_desc: string | null;
  component_id: number | null;
  component_name: string | null;
  discipline: string | null;
  downtime_type: string | null;
  attended_dept_name: string | null;
  attended_by: string | null;
  reported_by: string | null;
  root_cause: string | null;
  action_taken: string | null;
  preventive_action: string | null;
  production_loss_qty: number | null;
  status: string | null;
  remarks: string | null;
}

/** A PM visit in the history panel. */
export interface MechMachineHistoryPmExecution {
  pm_exec_id: number;
  pm_date: string | null;
  frequency: string | null;
  done_by: string | null;
  downtime_min: number | null;
  next_due_date: string | null;
  task_count: number;
  /** Checklist tasks that came back NOT_OK. */
  not_ok_count: number;
  remarks: string | null;
}

/** An overhaul in the history panel. */
export interface MechMachineHistoryOverhaul {
  overhaul_id: number;
  overhaul_type: string | null;
  from_date: string | null;
  to_date: string | null;
  downtime_days: number | null;
  work_done: string | null;
  done_by: string | null;
  party_id: number | null;
  party_name: string | null;
  labour_cost: number | null;
  spare_cost: number | null;
  total_cost: number | null;
  next_due_date: string | null;
  remarks: string | null;
}

/** A spare line in the history panel, from either register. */
export interface MechMachineHistorySpare {
  /** 'BREAKDOWN' | 'OVERHAUL' — which register the line came from. */
  source: string | null;
  /** breakdown_id or overhaul_id, per `source`. */
  document_id: number | null;
  document_date: string | null;
  item_id: number;
  item_code: string | null;
  item_name: string | null;
  uom_name: string | null;
  qty: number | null;
  rate: number | null;
  amount: number | null;
  remarks: string | null;
}

/** `data` for /machine-history: five named parts, NOT an array. */
export interface MechMachineHistoryData {
  machine: MechMachineHistoryMachine | null;
  breakdowns: MechMachineHistoryBreakdown[];
  pm_executions: MechMachineHistoryPmExecution[];
  overhauls: MechMachineHistoryOverhaul[];
  spares: MechMachineHistorySpare[];
}

/**
 * /machine-history does not fit the array-shaped report envelope either.
 * `data` is an OBJECT — never call `.map()` on it.
 */
export interface MechMachineHistoryResult {
  data: MechMachineHistoryData;
  /** Breakdown row count for the filter set. */
  total: number;
  summary: MechReportSummary | null;
  unattributed_pct: number | null;
}

/**
 * GET /mechMaintReports/machine-history — every breakdown, PM, overhaul and spare
 * for ONE machine. `machineId` is required; the backend 400s without it.
 */
export async function fetchMachineHistoryReport(
  p: MechReportParams & { machineId: number },
): Promise<MechMachineHistoryResult> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_MACHINE_HISTORY}?${reportQuery(p)}`;
  const envelope = await request<{
    data?: Partial<MechMachineHistoryData>;
    total?: number;
    summary?: MechReportSummary;
    unattributed_pct?: number | null;
  }>(url);
  const summary = envelope.summary ?? null;
  const data: MechMachineHistoryData = {
    machine: envelope.data?.machine ?? null,
    breakdowns: envelope.data?.breakdowns ?? [],
    pm_executions: envelope.data?.pm_executions ?? [],
    overhauls: envelope.data?.overhauls ?? [],
    spares: envelope.data?.spares ?? [],
  };
  return {
    data,
    total: envelope.total ?? data.breakdowns.length,
    summary,
    unattributed_pct: envelope.unattributed_pct ?? summary?.unattributed_pct ?? null,
  };
}

// --- R12 /open-breakdown-board -----------------------------------------------

/**
 * A live-board row. Distinct from `MechOpenBreakdown` (the entry module's
 * `/open_breakdowns`): this one adds `criticality` and `elapsed_hrs` and carries
 * no `co_id`.
 *
 * Not failure-filtered — a machine stopped for a planned PM that has not
 * restarted is still a stopped machine the board must show, so `downtime_type`
 * travels with each row.
 */
export interface MechOpenBoardRow {
  breakdown_id: number;
  tran_date: string | null;
  machine_id: number;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
  dept_id: number | null;
  dept_name: string | null;
  branch_id: number | null;
  criticality: string | null;
  spell_id: number | null;
  spell_code: string | null;
  stop_datetime: string | null;
  attended_datetime: string | null;
  response_min: number | null;
  reason_id: number | null;
  reason_code: string | null;
  reason_desc: string | null;
  component_id: number | null;
  component_name: string | null;
  discipline: string | null;
  downtime_type: string | null;
  attended_dept_name: string | null;
  attended_by: string | null;
  reported_by: string | null;
  status: string | null;
  remarks: string | null;
  /** Minutes since stop_datetime, against the server clock at read time. */
  elapsed_min: number | null;
  elapsed_hrs: number | null;
}

/** GET /mechMaintReports/open-breakdown-board — open incidents, longest-first. */
export async function fetchOpenBreakdownBoardReport(
  p: MechReportParams,
): Promise<MechReportResult<MechOpenBoardRow>> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_OPEN_BOARD}?${reportQuery(p)}`;
  return requestReport<MechOpenBoardRow>(url);
}

// =============================================================================
// Utilities — power readings (/api/mechUtility)
// =============================================================================
//
// ITM-004: one row per meter per day (optionally per spell) of main-meter kWh,
// DG hours / litres and max demand, plus the kWh-per-tonne report that divides
// the day's kWh by the DPR's spinning (yarn) and weaving (cloth) tonnes.
//
//  - spell_id: the API uses null for "whole day" (stored as 0 server-side).
//  - Decimal columns arrive as JSON numbers; null is SQL NULL.
//  - There is no approval workflow and no meter delete: a meter is deactivated
//    with active = 0 and its readings keep their meter_code.

/** Meter kinds keyed separately (owner 2026-10-18). */
export type MechMeterType = "GRID" | "DG" | "SOLAR";

/** A row of `jute_power_meter_mst`. */
export interface MechPowerMeter {
  power_meter_id: number;
  co_id: number;
  branch_id: number;
  meter_code: string;
  meter_name: string;
  meter_type: MechMeterType;
  meter_type_label: string;
  active: number;
}

/** Body of POST /meter_create and PUT /meter_edit/{id}. */
export interface MechPowerMeterPayload {
  co_id: number;
  /** Required on create; IGNORED on edit (a meter never moves branch). */
  branch_id?: number;
  /** Trimmed and upper-cased server-side, 1..20 chars. */
  meter_code: string;
  meter_name: string;
  meter_type: MechMeterType;
  active: number;
}

/** GET /meters, flattened: the meters plus the meter-type enum for the dialog. */
export interface MechPowerMetersResult {
  data: MechPowerMeter[];
  meter_types: MechEnumOption[];
}

/** GET /meters wire envelope — the house `{ data, master }` shape. */
interface MechPowerMetersEnvelope {
  data?: MechPowerMeter[];
  master?: { meter_types?: MechEnumOption[] };
}

/**
 * One row of GET /readings: an ACTIVE meter merged with its saved reading for
 * the date + spell (or a saved reading whose meter is now inactive, so it can
 * still be deleted). `power_reading_id` null means nothing is saved yet.
 */
export interface MechPowerReadingRow {
  meter_code: string;
  meter_name: string;
  meter_type: MechMeterType;
  meter_active: number;
  power_reading_id: number | null;
  opening_kwh: number | null;
  closing_kwh: number | null;
  kwh: number | null;
  dg_hours: number | null;
  dg_litres: number | null;
  max_demand_kva: number | null;
  remarks: string | null;
  /** Most recent closing_kwh strictly before tran_date for this meter (any spell). */
  prefill_opening_kwh: number | null;
  prefill_from_date: string | null;
  /** Median of the meter's daily kWh over the 30 days before tran_date. */
  median30_kwh: number | null;
}

/** GET /readings payload. */
export interface MechPowerReadingsDay {
  tran_date: string;
  spell_id: number | null;
  /** Today in IST — the server clock is UTC, so the page uses this for its date cap. */
  today: string;
  lock: {
    /** tran_date is older than `lock_days`. */
    locked: boolean;
    /**
     * The user holds Edit (access level 4) on the Power Readings menu for the
     * branch, so locked days may still be changed. Keying inside the window
     * needs Write (3).
     */
    can_override: boolean;
    lock_days: number;
  };
  spells: MechSpellOption[];
  rows: MechPowerReadingRow[];
}

/** One row of the POST /readings_save body. Every field but meter_code is optional. */
export interface MechPowerReadingSaveRow {
  meter_code: string;
  opening_kwh?: number | null;
  closing_kwh?: number | null;
  /** Ignored when both bounds are present; required when one is missing. */
  kwh?: number | null;
  dg_hours?: number | null;
  dg_litres?: number | null;
  max_demand_kva?: number | null;
  remarks?: string | null;
}

/** Body of POST /readings_save — a bulk upsert for one date + spell. */
export interface MechPowerReadingsSavePayload {
  co_id: number;
  branch_id: number;
  tran_date: string;
  spell_id: number | null;
  rows: MechPowerReadingSaveRow[];
}

/** POST /readings_save result. Warnings never block the save. */
export interface MechPowerReadingsSaveResult {
  saved: number;
  ids: number[];
  warnings: string[];
}

export interface MechPowerReportMeter {
  meter_code: string;
  meter_name: string;
  meter_type: MechMeterType;
}

/**
 * One calendar day of GET /power_report. An UNKEYED day carries 0.0 kWh (not
 * null) with `keyed` false, every `kwh_by_meter` entry null and the ratios
 * null; its tonnes are still real.
 */
export interface MechPowerReportDay {
  date: string;
  weekday: string;
  keyed: boolean;
  kwh_total: number;
  kwh_grid: number;
  kwh_dg: number;
  kwh_solar: number;
  /** One key per entry of `meters`; null when that meter was not keyed that day. */
  kwh_by_meter: Record<string, number | null>;
  dg_hours: number;
  dg_litres: number;
  max_demand_kva: number | null;
  yarn_t: number;
  cloth_t: number;
  kwh_per_t_yarn: number | null;
  kwh_per_t_cloth: number | null;
  dg_share_pct: number | null;
}

/** Range / MTD block: kWh over keyed days, tonnes of those same keyed days. */
export interface MechPowerReportTotals {
  days: number;
  days_keyed: number;
  kwh_total: number;
  kwh_grid: number;
  kwh_dg: number;
  kwh_solar: number;
  dg_hours: number;
  dg_litres: number;
  max_demand_kva: number | null;
  yarn_t: number;
  cloth_t: number;
  kwh_per_t_yarn: number | null;
  kwh_per_t_cloth: number | null;
  dg_share_pct: number | null;
  avg_kwh_per_keyed_day: number | null;
}

/** The "std" line: 30-day medians over keyed days ending on date_to (no achievement %). */
export interface MechPowerReportStd {
  basis: string;
  days_used: number;
  kwh_total: number | null;
  kwh_per_t_cloth: number | null;
  kwh_per_t_yarn: number | null;
  dg_share_pct: number | null;
}

export interface MechPowerReportMeta {
  co_id: number;
  branch_id: number;
  date_from: string;
  date_to: string;
  window_from: string;
  days_keyed: number;
  notes: string[];
}

/** GET /power_report payload. */
export interface MechPowerReport {
  meters: MechPowerReportMeter[];
  days: MechPowerReportDay[];
  totals: MechPowerReportTotals;
  mtd: MechPowerReportTotals;
  std: MechPowerReportStd;
  meta: MechPowerReportMeta;
}

const EMPTY_POWER_METERS: MechPowerMeter[] = Object.freeze([]) as unknown as MechPowerMeter[];
const EMPTY_ENUM_OPTIONS: MechEnumOption[] = Object.freeze([]) as unknown as MechEnumOption[];
const EMPTY_REPORT_METERS: MechPowerReportMeter[] = Object.freeze([]) as unknown as MechPowerReportMeter[];
const EMPTY_REPORT_DAYS: MechPowerReportDay[] = Object.freeze([]) as unknown as MechPowerReportDay[];
const EMPTY_NOTES: string[] = Object.freeze([]) as unknown as string[];

/** GET /mechUtility/meters — the branch's meters (active only unless `includeInactive`). */
export async function fetchPowerMeters(p: {
  coId: number;
  branchId: number;
  includeInactive?: boolean;
}): Promise<MechPowerMetersResult> {
  const url = `${apiRoutesPortalMasters.MECH_UTIL_METERS}?${buildQuery({
    co_id: p.coId,
    branch_id: p.branchId,
    include_inactive: p.includeInactive ? 1 : undefined,
  })}`;
  const envelope = await request<MechPowerMetersEnvelope>(url);
  return {
    data: envelope.data ?? EMPTY_POWER_METERS,
    meter_types: envelope.master?.meter_types ?? EMPTY_ENUM_OPTIONS,
  };
}

/** POST /mechUtility/meter_create — `power_meter_id` of the new meter. */
export async function createPowerMeter(body: MechPowerMeterPayload): Promise<MechWriteResult> {
  return requestData<MechWriteResult>(apiRoutesPortalMasters.MECH_UTIL_METER_CREATE, "POST", body);
}

/** PUT /mechUtility/meter_edit/{id} — code, name, type and active only; the branch never moves. */
export async function updatePowerMeter(
  powerMeterId: number,
  body: MechPowerMeterPayload,
): Promise<MechWriteResult> {
  return requestData<MechWriteResult>(
    `${apiRoutesPortalMasters.MECH_UTIL_METER_EDIT}/${powerMeterId}`,
    "PUT",
    body,
  );
}

/** GET /mechUtility/readings — the entry grid for one date (+ optional spell). */
export async function fetchPowerReadings(p: {
  coId: number;
  branchId: number;
  tranDate: string;
  spellId?: number | null;
}): Promise<MechPowerReadingsDay> {
  const url = `${apiRoutesPortalMasters.MECH_UTIL_READINGS}?${buildQuery({
    co_id: p.coId,
    branch_id: p.branchId,
    tran_date: p.tranDate,
    spell_id: p.spellId ?? undefined,
  })}`;
  const day = await requestData<Partial<MechPowerReadingsDay>>(url);
  return {
    tran_date: day.tran_date ?? p.tranDate,
    spell_id: day.spell_id ?? null,
    today: day.today ?? p.tranDate,
    // A payload without a lock block is malformed: fail CLOSED (read-only grid)
    // rather than invent an unlocked state. lock_days is only ever the server's.
    lock: day.lock ?? { locked: true, can_override: false, lock_days: 0 },
    spells: day.spells ?? [],
    rows: day.rows ?? [],
  };
}

/** POST /mechUtility/readings_save — bulk upsert; warnings come back, never block. */
export async function savePowerReadings(
  body: MechPowerReadingsSavePayload,
): Promise<MechPowerReadingsSaveResult> {
  const result = await requestData<Partial<MechPowerReadingsSaveResult>>(
    apiRoutesPortalMasters.MECH_UTIL_READINGS_SAVE,
    "POST",
    body,
  );
  return {
    saved: result.saved ?? 0,
    ids: result.ids ?? [],
    warnings: result.warnings ?? [],
  };
}

/** DELETE /mechUtility/reading_delete/{id}?co_id= — soft delete (active = 0). */
export async function deletePowerReading(
  powerReadingId: number,
  coId: number,
): Promise<{ message: string }> {
  const url = `${apiRoutesPortalMasters.MECH_UTIL_READING_DELETE}/${powerReadingId}?${buildQuery({
    co_id: coId,
  })}`;
  return requestData<{ message: string }>(url, "DELETE");
}

/** GET /mechUtility/power_report — day-wise kWh, DG and kWh/t over a range (max 93 days). */
export async function fetchPowerReport(p: {
  coId: number;
  branchId: number;
  dateFrom: string;
  dateTo: string;
}): Promise<MechPowerReport> {
  const url = `${apiRoutesPortalMasters.MECH_UTIL_POWER_REPORT}?${buildQuery({
    co_id: p.coId,
    branch_id: p.branchId,
    date_from: p.dateFrom,
    date_to: p.dateTo,
  })}`;
  const data = await requestData<Partial<MechPowerReport>>(url);
  const emptyTotals: MechPowerReportTotals = {
    days: 0,
    days_keyed: 0,
    kwh_total: 0,
    kwh_grid: 0,
    kwh_dg: 0,
    kwh_solar: 0,
    dg_hours: 0,
    dg_litres: 0,
    max_demand_kva: null,
    yarn_t: 0,
    cloth_t: 0,
    kwh_per_t_yarn: null,
    kwh_per_t_cloth: null,
    dg_share_pct: null,
    avg_kwh_per_keyed_day: null,
  };
  return {
    meters: data.meters ?? EMPTY_REPORT_METERS,
    days: data.days ?? EMPTY_REPORT_DAYS,
    totals: data.totals ?? emptyTotals,
    mtd: data.mtd ?? emptyTotals,
    std: data.std ?? {
      basis: "",
      days_used: 0,
      kwh_total: null,
      kwh_per_t_cloth: null,
      kwh_per_t_yarn: null,
      dg_share_pct: null,
    },
    meta: data.meta ?? {
      co_id: p.coId,
      branch_id: p.branchId,
      date_from: p.dateFrom,
      date_to: p.dateTo,
      window_from: p.dateFrom,
      days_keyed: 0,
      notes: EMPTY_NOTES,
    },
  };
}
