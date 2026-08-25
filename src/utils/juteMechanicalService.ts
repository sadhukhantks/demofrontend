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
  remarks?: string | null;
  spares?: MechBreakdownSpareInput[];
}

/** Body for the quick close from the live board. */
export interface MechBreakdownClosePayload {
  restart_datetime: string;
  action_taken?: string | null;
}

/** A currently-open incident, with minutes elapsed so far. */
export interface MechOpenBreakdown {
  breakdown_id: number;
  co_id: number;
  branch_id: number | null;
  machine_id: number;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_name: string | null;
  dept_name: string | null;
  tran_date: string;
  stop_datetime: string;
  attended_datetime: string | null;
  /** Minutes since stop_datetime, computed by the backend at read time. */
  elapsed_min: number | null;
  response_min: number | null;
  reason_id: number;
  reason_code: string | null;
  reason_desc: string | null;
  component_name: string | null;
  discipline: string;
  downtime_type: string;
  attended_by: string | null;
  reported_by: string | null;
  status: string;
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
  machine_type_id: number | null;
  machine_id: number | null;
  task_desc: string;
  frequency: string;
  freq_days: number | null;
  seq_no: number | null;
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
 */
export async function fetchPmChecklist(p: {
  coId: number;
  machineId: number;
  frequency?: string | null;
}): Promise<MechPmChecklistTask[]> {
  const url = `${apiRoutesPortalMasters.MECH_PM_CHECKLIST}?${buildQuery({
    co_id: p.coId,
    machine_id: p.machineId,
    frequency: p.frequency,
  })}`;
  return requestData<MechPmChecklistTask[]>(url);
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

/** R1 breakdown-register: the raw filterable incident log. */
export type MechBreakdownRegisterRow = MechBreakdown;

/** R2 machine-summary: the workbook's main sheet. */
export interface MechMachineSummaryRow {
  machine_id: number;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
  dept_id: number | null;
  dept_name: string | null;
  branch_id: number | null;
  breakdown_count: number;
  total_downtime_min: number;
  /** SUM(duration_min) / COUNT(*) */
  mttr_min: number | null;
  production_loss_qty: number | null;
  /** Downtime on reason code 'NR' as a share of this machine's downtime. */
  unattributed_pct: number | null;
}

/** R3 reason-pareto: the workbook's reason block. */
export interface MechReasonParetoRow {
  reason_id: number;
  reason_code: string | null;
  reason_desc: string | null;
  component_id: number | null;
  component_name: string | null;
  discipline: string | null;
  breakdown_count: number;
  total_downtime_min: number;
  duration_per_breakdown: number | null;
  share_pct: number | null;
  cumulative_pct: number | null;
}

/** One machine column of the date x machine grid. */
export interface MechDateMachineGridColumn {
  machine_id: number;
  machine_name: string;
}

/**
 * R4 date-machine-grid row: `tran_date` plus one key per machine id (stringified),
 * whose value is the reason code(s) for that cell, e.g. `"RF/DRJ"`. The machine keys
 * are dynamic, so cell values are `unknown` — narrow them at the render site.
 */
export type MechDateMachineGridRow = { tran_date: string } & Record<string, unknown>;

/** R4 date-machine-grid response: rows plus the machine columns to render. */
export interface MechDateMachineGridResult {
  data: MechDateMachineGridRow[];
  columns: MechDateMachineGridColumn[];
}

/** R5 department-summary. */
export interface MechDepartmentSummaryRow {
  dept_id: number | null;
  dept_name: string | null;
  machine_type_id: number | null;
  machine_type_name: string | null;
  branch_id: number | null;
  breakdown_count: number;
  total_downtime_min: number;
  /** Share of total mill downtime in the range. */
  share_pct: number | null;
  unattributed_pct: number | null;
}

/** R6 reliability: MTBF / MTTR / availability per machine. */
export interface MechReliabilityRow {
  machine_id: number;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_name: string | null;
  dept_name: string | null;
  breakdown_count: number;
  total_downtime_min: number;
  available_min: number | null;
  mtbf_min: number | null;
  mttr_min: number | null;
  availability_pct: number | null;
  downtime_per_1000_hrs: number | null;
}

/** R7 reason-trend: month x reason, the workbook's Summary sheets. */
export interface MechReasonTrendRow {
  /** YYYY-MM */
  month: string;
  reason_id: number | null;
  reason_code: string | null;
  reason_desc: string | null;
  breakdown_count: number;
  total_downtime_min: number;
}

/** R8 maintenance-due: PM due/overdue + overhaul due, ordered by criticality. */
export interface MechMaintenanceDueRow {
  machine_id: number;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_name: string | null;
  dept_name: string | null;
  branch_id: number | null;
  criticality: string | null;
  last_pm_date: string | null;
  next_pm_due: string | null;
  pm_days_overdue: number | null;
  last_overhaul_date: string | null;
  next_overhaul_due: string | null;
  overhaul_days_overdue: number | null;
}

/** R9 spares-consumption: qty and value per machine/item. */
export interface MechSparesConsumptionRow {
  machine_id: number | null;
  machine_name: string | null;
  item_id: number;
  item_code: string | null;
  item_name: string | null;
  uom_name: string | null;
  qty: number | null;
  value: number | null;
  /** BREAKDOWN | OVERHAUL — which register the spare was booked on. */
  source: string | null;
}

/**
 * R10 top-problem-machines. Rows arrive in the uniform `{ data, total }` envelope;
 * `rank_type` says which list a row belongs to (top-N by downtime, top-N by count,
 * or the repeat-failure list — same machine + component inside the repeat window).
 */
export interface MechTopProblemMachineRow {
  machine_id: number;
  machine_name: string | null;
  mech_code: string | null;
  machine_type_name: string | null;
  dept_name: string | null;
  component_id: number | null;
  component_name: string | null;
  breakdown_count: number;
  total_downtime_min: number;
  mttr_min: number | null;
  repeat_failure_count: number | null;
  /** DOWNTIME | COUNT | REPEAT */
  rank_type: string | null;
  rank_no: number | null;
}

/** R11 machine-history: one interleaved event stream for a single machine. */
export interface MechMachineHistoryRow {
  /** BREAKDOWN | PM | OVERHAUL | SPARE */
  event_type: string;
  event_date: string | null;
  /** Primary key of the source row (breakdown_id / pm_exec_id / overhaul_id). */
  ref_id: number | null;
  machine_id: number;
  machine_name: string | null;
  reason_code: string | null;
  component_name: string | null;
  discipline: string | null;
  description: string | null;
  duration_min: number | null;
  cost: number | null;
  done_by: string | null;
  remarks: string | null;
}

/** R12 open-breakdown-board: same shape as the live board, longest-first. */
export type MechOpenBoardRow = MechOpenBreakdown;

/** GET /mechMaintReports/breakdown-register */
export async function fetchBreakdownRegisterReport(
  p: MechReportParams,
): Promise<MechListResult<MechBreakdownRegisterRow>> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_BREAKDOWN_REGISTER}?${reportQuery(p)}`;
  return requestList<MechBreakdownRegisterRow>(url);
}

/** GET /mechMaintReports/machine-summary */
export async function fetchMachineSummaryReport(
  p: MechReportParams,
): Promise<MechListResult<MechMachineSummaryRow>> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_MACHINE_SUMMARY}?${reportQuery(p)}`;
  return requestList<MechMachineSummaryRow>(url);
}

/** GET /mechMaintReports/reason-pareto */
export async function fetchReasonParetoReport(
  p: MechReportParams,
): Promise<MechListResult<MechReasonParetoRow>> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_REASON_PARETO}?${reportQuery(p)}`;
  return requestList<MechReasonParetoRow>(url);
}

/**
 * GET /mechMaintReports/date-machine-grid — the exact replica of the sheet the mill
 * keys today. Returns dynamic machine columns alongside the rows.
 */
export async function fetchDateMachineGridReport(
  p: MechReportParams,
): Promise<MechDateMachineGridResult> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_DATE_MACHINE_GRID}?${reportQuery(p)}`;
  const result = await request<Partial<MechDateMachineGridResult>>(url);
  return { data: result.data ?? [], columns: result.columns ?? [] };
}

/** GET /mechMaintReports/department-summary */
export async function fetchDepartmentSummaryReport(
  p: MechReportParams,
): Promise<MechListResult<MechDepartmentSummaryRow>> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_DEPARTMENT_SUMMARY}?${reportQuery(p)}`;
  return requestList<MechDepartmentSummaryRow>(url);
}

/** GET /mechMaintReports/reliability */
export async function fetchReliabilityReport(
  p: MechReportParams,
): Promise<MechListResult<MechReliabilityRow>> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_RELIABILITY}?${reportQuery(p)}`;
  return requestList<MechReliabilityRow>(url);
}

/** GET /mechMaintReports/reason-trend */
export async function fetchReasonTrendReport(
  p: MechReportParams,
): Promise<MechListResult<MechReasonTrendRow>> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_REASON_TREND}?${reportQuery(p)}`;
  return requestList<MechReasonTrendRow>(url);
}

/** GET /mechMaintReports/maintenance-due */
export async function fetchMaintenanceDueReport(
  p: MechReportParams,
): Promise<MechListResult<MechMaintenanceDueRow>> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_MAINTENANCE_DUE}?${reportQuery(p)}`;
  return requestList<MechMaintenanceDueRow>(url);
}

/** GET /mechMaintReports/spares-consumption */
export async function fetchSparesConsumptionReport(
  p: MechReportParams,
): Promise<MechListResult<MechSparesConsumptionRow>> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_SPARES_CONSUMPTION}?${reportQuery(p)}`;
  return requestList<MechSparesConsumptionRow>(url);
}

/** GET /mechMaintReports/top-problem-machines */
export async function fetchTopProblemMachinesReport(
  p: MechReportParams,
): Promise<MechListResult<MechTopProblemMachineRow>> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_TOP_PROBLEM_MACHINES}?${reportQuery(p)}`;
  return requestList<MechTopProblemMachineRow>(url);
}

/**
 * GET /mechMaintReports/machine-history — every breakdown, PM, overhaul and spare
 * for ONE machine. `machineId` is required by this report.
 */
export async function fetchMachineHistoryReport(
  p: MechReportParams & { machineId: number },
): Promise<MechListResult<MechMachineHistoryRow>> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_MACHINE_HISTORY}?${reportQuery(p)}`;
  return requestList<MechMachineHistoryRow>(url);
}

/** GET /mechMaintReports/open-breakdown-board — open incidents, longest-first. */
export async function fetchOpenBreakdownBoardReport(
  p: MechReportParams,
): Promise<MechListResult<MechOpenBoardRow>> {
  const url = `${apiRoutesPortalMasters.MECH_RPT_OPEN_BOARD}?${reportQuery(p)}`;
  return requestList<MechOpenBoardRow>(url);
}
