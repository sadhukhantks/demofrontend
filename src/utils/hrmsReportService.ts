import { fetchWithCookie } from "./apiClient2";
import { apiRoutesPortalMasters } from "./api";

/**
 * Service for HRMS / labour reports surfaced under Jute Production > Production
 * Reports. Backend: GET /api/hrmsReports/* (tenant-scoped by subdomain).
 */

/** Row from GET /hrmsReports/attendance-summary. */
export interface AttendanceSummaryRow {
  id: number;
  department: string | null;
  designation: string | null;
  work_hours: number;
  hands: number;
}

/** Attendance summary by department + designation over a date range. */
export async function fetchAttendanceSummary(p: {
  coId: number;
  branchId?: number | null;
  dateFrom: string;
  dateTo: string;
}): Promise<AttendanceSummaryRow[]> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(p.coId));
  qs.set("date_from", p.dateFrom);
  qs.set("date_to", p.dateTo);
  if (p.branchId != null) qs.set("branch_id", String(p.branchId));
  const url = `${apiRoutesPortalMasters.ATTENDANCE_SUMMARY_REPORT}?${qs.toString()}`;
  const result = await fetchWithCookie<{ data: AttendanceSummaryRow[] }>(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch attendance summary");
  }
  return result.data.data;
}

/** Row from GET /hrmsReports/worker-master (employee master + last working day). */
export interface WorkerMasterRow {
  id: number;
  emp_code: string | null;
  emp_name: string | null;
  gender: string | null;
  dept_desc: string | null;
  sub_dept_desc: string | null;
  designation: string | null;
  category: string | null;
  date_of_birth: string | null;
  date_of_join: string | null;
  contractor_name: string | null;
  esi_no: string | null;
  pf_no: string | null;
  pf_uan_no: string | null;
  bank_acc_no: string | null;
  bank_name: string | null;
  pay_scheme: string | null;
  status_name: string | null;
  is_active: string | null;
  last_working_day: string | null;
}

/** Worker / employee master listing (branch-scoped; no date range). */
export async function fetchWorkerMaster(p: {
  coId: number;
  branchId?: number | null;
  search?: string;
}): Promise<WorkerMasterRow[]> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(p.coId));
  if (p.branchId != null) qs.set("branch_id", String(p.branchId));
  if (p.search) qs.set("search", p.search);
  const url = `${apiRoutesPortalMasters.WORKER_MASTER_REPORT}?${qs.toString()}`;
  const result = await fetchWithCookie<{ data: WorkerMasterRow[] }>(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch worker master");
  }
  return result.data.data;
}

/** Row from GET /hrmsReports/man-machine. */
export interface ManMachineRow {
  id: number;
  machine_name: string | null;
  department: string | null;
  designation: string | null;
  spell: string | null;
  hands: number;
  stoppage_hours: number;
}

/** Man-machine deployment: hands + stoppage per machine/designation/spell. */
export async function fetchManMachine(p: {
  coId: number;
  branchId?: number | null;
  dateFrom: string;
  dateTo: string;
}): Promise<ManMachineRow[]> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(p.coId));
  qs.set("date_from", p.dateFrom);
  qs.set("date_to", p.dateTo);
  if (p.branchId != null) qs.set("branch_id", String(p.branchId));
  const url = `${apiRoutesPortalMasters.MAN_MACHINE_REPORT}?${qs.toString()}`;
  const result = await fetchWithCookie<{ data: ManMachineRow[] }>(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch man-machine report");
  }
  return result.data.data;
}

/** Row from GET /hrmsReports/attendance-register. */
export interface AttendanceRegisterRow {
  id: number;
  eb_no: string | null;
  emp_name: string | null;
  attendance_date: string | null;
  department: string | null;
  designation: string | null;
  mark: string | null;
  spell: string | null;
  idle_hours: number;
  spell_hours: number;
  working_hours: number;
  status_name: string | null;
}

/** Attendance register: daily_attendance detail rows over a date range. */
export async function fetchAttendanceRegister(p: {
  coId: number;
  branchId?: number | null;
  dateFrom: string;
  dateTo: string;
}): Promise<AttendanceRegisterRow[]> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(p.coId));
  qs.set("date_from", p.dateFrom);
  qs.set("date_to", p.dateTo);
  if (p.branchId != null) qs.set("branch_id", String(p.branchId));
  const url = `${apiRoutesPortalMasters.ATTENDANCE_REGISTER_REPORT}?${qs.toString()}`;
  const result = await fetchWithCookie<{ data: AttendanceRegisterRow[] }>(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch attendance register");
  }
  return result.data.data;
}

/** Row from GET /hrmsReports/employee-working (per employee per month). */
export interface EmployeeWorkingRow {
  id: number;
  yearmn: string | null;
  emp_code: string | null;
  emp_name: string | null;
  department: string | null;
  category: string | null;
  status_name: string | null;
  wdays: number;
  lvdays: number;
  hldays: number;
  total_days: number;
}

/** Employee working details: work/leave/total days per employee per month. */
export async function fetchEmployeeWorking(p: {
  coId: number;
  branchId?: number | null;
  dateFrom: string;
  dateTo: string;
}): Promise<EmployeeWorkingRow[]> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(p.coId));
  qs.set("date_from", p.dateFrom);
  qs.set("date_to", p.dateTo);
  if (p.branchId != null) qs.set("branch_id", String(p.branchId));
  const url = `${apiRoutesPortalMasters.EMPLOYEE_WORKING_REPORT}?${qs.toString()}`;
  const result = await fetchWithCookie<{ data: EmployeeWorkingRow[] }>(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch employee working details");
  }
  return result.data.data;
}

/** Shared date-range params for the HRMS report fetchers below. */
interface RangeParams {
  coId: number;
  branchId?: number | null;
  dateFrom: string;
  dateTo: string;
}

async function fetchRangeReport<TRow>(
  url: string,
  p: RangeParams,
  what: string,
): Promise<TRow[]> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(p.coId));
  qs.set("date_from", p.dateFrom);
  qs.set("date_to", p.dateTo);
  if (p.branchId != null) qs.set("branch_id", String(p.branchId));
  const result = await fetchWithCookie<{ data: TRow[] }>(`${url}?${qs.toString()}`);
  if (result.error || !result.data) {
    throw new Error(result.error ?? `Failed to fetch ${what}`);
  }
  return result.data.data;
}

/** Row from GET /hrmsReports/full-attendance. */
export interface FullAttendanceRow {
  id: number;
  eb_no: string | null;
  emp_name: string | null;
  attendance_date: string | null;
  department: string | null;
  designation: string | null;
  mark: string | null;
  spell: string | null;
  idle_hours: number;
  spell_hours: number;
  working_hours: number;
  source: string | null;
  att_type: string | null;
  status_name: string | null;
  remarks: string | null;
}

/** Full attendance: detail rows with decoded source/type over a date range. */
export function fetchFullAttendance(p: RangeParams): Promise<FullAttendanceRow[]> {
  return fetchRangeReport(
    apiRoutesPortalMasters.FULL_ATTENDANCE_REPORT,
    p,
    "full attendance",
  );
}

/** Row from GET /hrmsReports/absenteeism. */
export interface AbsenteeismRow {
  id: number;
  emp_code: string | null;
  emp_name: string | null;
  department: string | null;
  category: string | null;
  last_seen: string | null;
  absent_for: number;
}

/** Absenteeism: last-seen date + days absent per employee as on a date. */
export async function fetchAbsenteeism(p: {
  coId: number;
  branchId?: number | null;
  asOn: string;
  minDays?: number;
}): Promise<AbsenteeismRow[]> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(p.coId));
  qs.set("as_on", p.asOn);
  if (p.branchId != null) qs.set("branch_id", String(p.branchId));
  if (p.minDays != null) qs.set("min_days", String(p.minDays));
  const url = `${apiRoutesPortalMasters.ABSENTEEISM_REPORT}?${qs.toString()}`;
  const result = await fetchWithCookie<{ data: AbsenteeismRow[] }>(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch absenteeism report");
  }
  return result.data.data;
}

/** Row from GET /hrmsReports/half-day. */
export interface HalfDayRow {
  id: number;
  emp_code: string | null;
  emp_name: string | null;
  department: string | null;
  attendance_date: string | null;
  shift: string | null;
  day_hours: number;
  halfdays_month: number;
  halfdays_total: number;
}

/** Half-day absenteeism: single-spell days with per-month/range counts. */
export function fetchHalfDay(p: RangeParams): Promise<HalfDayRow[]> {
  return fetchRangeReport(
    apiRoutesPortalMasters.HALF_DAY_REPORT,
    p,
    "half-day report",
  );
}

/** Row from GET /hrmsReports/overstay. */
export interface OverstayRow {
  id: number;
  emp_code: string | null;
  emp_name: string | null;
  department: string | null;
  category: string | null;
  leave_type: string | null;
  leave_from_date: string | null;
  leave_to_date: string | null;
  rejoin_date: string | null;
  overstay_days: number;
}

/** Overstay after leave: late (or no) rejoin after approved leaves. */
export function fetchOverstay(p: RangeParams): Promise<OverstayRow[]> {
  return fetchRangeReport(
    apiRoutesPortalMasters.OVERSTAY_REPORT,
    p,
    "overstay report",
  );
}

/** Row from GET /hrmsReports/occupation-deviation. */
export interface OccupationDeviationRow {
  id: number;
  eb_no: string | null;
  emp_name: string | null;
  attendance_date: string | null;
  actual_dept: string | null;
  actual_desig: string | null;
  advised_dept: string | null;
  advised_desig: string | null;
  spell: string | null;
  work_hours: number;
}

/** Occupation deviation: worked vs advised department/designation mismatches. */
export function fetchOccupationDeviation(
  p: RangeParams,
): Promise<OccupationDeviationRow[]> {
  return fetchRangeReport(
    apiRoutesPortalMasters.OCCUPATION_DEVIATION_REPORT,
    p,
    "occupation deviation",
  );
}

/** Row from GET /hrmsReports/cash-attendance. */
export interface CashAttendanceRow {
  id: number;
  eb_no: string | null;
  emp_name: string | null;
  department: string | null;
  designation: string | null;
  attendance_date: string | null;
  spell: string | null;
  hours: number;
}

/** Cash attendance: cash-type attendance hours per employee/date/spell. */
export function fetchCashAttendance(p: RangeParams): Promise<CashAttendanceRow[]> {
  return fetchRangeReport(
    apiRoutesPortalMasters.CASH_ATTENDANCE_REPORT,
    p,
    "cash attendance",
  );
}
