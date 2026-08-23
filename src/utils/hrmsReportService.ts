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

/** Row from GET /hrmsReports/employee-headcount — the finest summary grain.
 * The department/category/designation summary pages aggregate these rows. */
export interface EmployeeHeadcountRow {
  id: number;
  department: string | null;
  sub_department: string | null;
  designation: string | null;
  category: string | null;
  emp_count: number;
}

/** Active-employee headcount by dept/sub-dept/designation/category. */
export async function fetchEmployeeHeadcount(p: {
  coId: number;
  branchId?: number | null;
}): Promise<EmployeeHeadcountRow[]> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(p.coId));
  if (p.branchId != null) qs.set("branch_id", String(p.branchId));
  const url = `${apiRoutesPortalMasters.EMPLOYEE_HEADCOUNT_REPORT}?${qs.toString()}`;
  const result = await fetchWithCookie<{ data: EmployeeHeadcountRow[] }>(url);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch employee headcount");
  }
  return result.data.data;
}

/** Aggregated headcount row produced by {@link aggregateHeadcount}. */
export interface HeadcountSummaryRow {
  id: string;
  department: string;
  sub_department: string;
  designation: string;
  category: string;
  emp_count: number;
}

/**
 * Aggregate headcount rows by the given keys and append a Total row —
 * shared by the department/category/designation summary report pages.
 */
export function aggregateHeadcount(
  rows: EmployeeHeadcountRow[],
  keys: (keyof Omit<EmployeeHeadcountRow, "id" | "emp_count">)[],
): HeadcountSummaryRow[] {
  const map = new Map<string, HeadcountSummaryRow>();
  let total = 0;
  for (const r of rows) {
    const key = keys.map((k) => r[k] ?? "").join("|");
    let agg = map.get(key);
    if (!agg) {
      agg = {
        id: key,
        department: keys.includes("department") ? (r.department ?? "") : "",
        sub_department: keys.includes("sub_department")
          ? (r.sub_department ?? "")
          : "",
        designation: keys.includes("designation") ? (r.designation ?? "") : "",
        category: keys.includes("category") ? (r.category ?? "") : "",
        emp_count: 0,
      };
      map.set(key, agg);
    }
    agg.emp_count += r.emp_count;
    total += r.emp_count;
  }
  const out = [...map.values()];
  const totalRow: HeadcountSummaryRow = {
    id: "__total__",
    department: "",
    sub_department: "",
    designation: "",
    category: "",
    emp_count: total,
  };
  totalRow[keys[0]] = "Total";
  out.push(totalRow);
  return out;
}

/** Row from GET /hrmsReports/spell-wise (long format — pivoted on the page). */
export interface SpellWiseRow {
  id: number;
  department: string | null;
  designation: string | null;
  spell: string | null;
  hands: number;
}

/** Spell-wise hands per department + designation (long format). */
export function fetchSpellWise(p: RangeParams): Promise<SpellWiseRow[]> {
  return fetchRangeReport(
    apiRoutesPortalMasters.SPELL_WISE_REPORT,
    p,
    "spell-wise report",
  );
}

/** Row from GET /hrmsReports/shift-wise (long format — pivoted on the page). */
export interface ShiftWiseRow {
  id: number;
  department: string | null;
  designation: string | null;
  shift: string | null;
  hands: number;
}

/** Shift-wise hands per department + designation (long format). */
export function fetchShiftWise(p: RangeParams): Promise<ShiftWiseRow[]> {
  return fetchRangeReport(
    apiRoutesPortalMasters.SHIFT_WISE_REPORT,
    p,
    "shift-wise report",
  );
}

/** Row from GET /hrmsReports/bank-statement. */
export interface BankStatementRow {
  id: number;
  emp_code: string | null;
  emp_name: string | null;
  bank_name: string | null;
  bank_acc_no: string | null;
  ifsc_code: string | null;
  from_date: string | null;
  to_date: string | null;
  net_pay: number;
}

/** Employee bank statement: net pay + bank details per pay period in range. */
export function fetchBankStatement(p: RangeParams): Promise<BankStatementRow[]> {
  return fetchRangeReport(
    apiRoutesPortalMasters.BANK_STATEMENT_REPORT,
    p,
    "bank statement",
  );
}

/** Row from GET /hrmsReports/hands-complement — hands split by shift and by
 * worker category, per date + master department + designation. Second sheet of
 * the Attendance Check List export. */
export interface HandsComplementRow {
  id: number;
  attendance_date: string | null;
  department: string | null;
  designation: string | null;
  shift_a: number;
  shift_b: number;
  shift_c: number;
  shift_total: number;
  permanent: number;
  budli: number;
  retired: number;
  new_budli: number;
  contract: number;
  outsider: number;
  apprentice: number;
  total_hands: number;
}

/** Hands Complement summary over a date range. */
export function fetchHandsComplement(
  p: RangeParams,
): Promise<HandsComplementRow[]> {
  return fetchRangeReport(
    apiRoutesPortalMasters.HANDS_COMPLEMENT_REPORT,
    p,
    "hands complement",
  );
}

/** A processed cash payment row (daily_cash_outsider_payment + names). */
export interface CashHandsRow {
  id: number;
  eb_id: number | null;
  eb_no: string | null;
  worker_name: string | null;
  pay_date: string | null;
  shift: string | null;
  dept_code: string | null;
  department: string | null;
  occupation: string | null;
  working_hours: number;
  rate: number;
  amount: number;
}

/** Department x shift totals per pay date. */
export interface CashHandsSummaryRow {
  id: number;
  pay_date: string | null;
  dept_code: string | null;
  department: string | null;
  shift: string | null;
  hours: number;
  amount: number;
}

/** Outcome of a Cash Hands process run. */
export interface CashHandsProcessResult {
  message: string;
  deleted: number;
  inserted: number;
  total_hours: number;
  total_amount: number;
  /** Rows whose worker had no approved rate for that date/shift (priced 0). */
  rows_without_rate: number;
}

/** Processed cash payment rows for the period. */
export function fetchCashHands(p: RangeParams): Promise<CashHandsRow[]> {
  return fetchRangeReport(
    apiRoutesPortalMasters.CASH_HANDS_REPORT,
    p,
    "cash hands report",
  );
}

/** Department/shift totals for the period. */
export function fetchCashHandsSummary(
  p: RangeParams,
): Promise<CashHandsSummaryRow[]> {
  return fetchRangeReport(
    apiRoutesPortalMasters.CASH_HANDS_SUMMARY_REPORT,
    p,
    "cash hands summary",
  );
}

/**
 * Process (or re-process) a period into daily_cash_outsider_payment. Rows
 * previously processed for the same scope are deleted first, so running this
 * twice leaves one set of payment rows, not two.
 */
export async function processCashHands(p: {
  coId: number;
  branchId?: number | null;
  dateFrom: string;
  dateTo: string;
}): Promise<CashHandsProcessResult> {
  const result = await fetchWithCookie<CashHandsProcessResult>(
    apiRoutesPortalMasters.CASH_HANDS_PROCESS,
    "POST",
    {
      co_id: p.coId,
      branch_id: p.branchId ?? null,
      date_from: p.dateFrom,
      date_to: p.dateTo,
    },
  );
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to process cash hands");
  }
  return result.data;
}

/** Row from GET /hrmsReports/pay-periods — the period picker. */
export interface PayPeriodOption {
  payperiod_id: number;
  from_date: string | null;
  to_date: string | null;
  status: number;
}

/** Non-cancelled pay periods for a payscheme, newest first. */
export async function fetchPayPeriods(p: {
  payschemeId: number;
  branchId?: number | null;
}): Promise<PayPeriodOption[]> {
  const qs = new URLSearchParams();
  qs.set("payscheme_id", String(p.payschemeId));
  if (p.branchId != null) qs.set("branch_id", String(p.branchId));
  const result = await fetchWithCookie<{ data: PayPeriodOption[] }>(
    `${apiRoutesPortalMasters.PAY_PERIODS_REPORT}?${qs.toString()}`,
  );
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch pay periods");
  }
  return result.data.data;
}

/** Row from GET /hrmsReports/pay-register-print — one employee's pivoted
 * payroll for a pay period (legacy Main Pay Roll register columns). */
export interface PayRegisterPrintRow {
  id: number;
  eb_no: string;
  wname: string;
  dept_code: string;
  dept_desc: string;
  desig: string;
  time_piece: string;
  esi_no: string;
  pf_no: string;
  pf_uan_no: string;
  shift: string;
  basic_rate: number;
  working_hours: number;
  ns_hrs: number;
  hl_hrs: number;
  ls_hrs: number;
  stl_d: number;
  wrk_days: number;
  c_work_day: number;
  prod_basic: number;
  time_rated_basic: number;
  fix_basic: number;
  c_bon_ern: number;
  pf_gross: number;
  da: number;
  ns_amount: number;
  hol_amt: number;
  increment_amt: number;
  layoff_wgs: number;
  incentive_amount: number;
  misc_earn: number;
  stl_wgs: number;
  gross_pay: number;
  hra: number;
  b_f: number;
  total_earn: number;
  epf: number;
  c_pf_cont: number;
  c_fpf_cont: number;
  epf_833: number;
  epf_167: number;
  co_cont: number;
  esi_gross: number;
  esic: number;
  p_tax: number;
  lwf: number;
  co_loan: number;
  co_loan_bal: number;
  puja_advance: number;
  stl_advance: number;
  exadvance: number;
  arrear_plus: number;
  arrear_minus: number;
  total_deduction: number;
  c_f: number;
  net_pay: number;
}

/** Pay register / payslip print rows for one pay period. */
export async function fetchPayRegisterPrint(p: {
  payperiodId: number;
}): Promise<PayRegisterPrintRow[]> {
  const qs = new URLSearchParams();
  qs.set("payperiod_id", String(p.payperiodId));
  const result = await fetchWithCookie<{ data: PayRegisterPrintRow[] }>(
    `${apiRoutesPortalMasters.PAY_REGISTER_PRINT_REPORT}?${qs.toString()}`,
  );
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch pay register data");
  }
  return result.data.data;
}

/** Download URL for the Cash Hands PDF (streamed by the backend). */
export function cashHandsPdfUrl(p: {
  coId: number;
  branchId?: number | null;
  dateFrom: string;
  dateTo: string;
  companyName?: string | null;
}): string {
  const qs = new URLSearchParams();
  qs.set("co_id", String(p.coId));
  qs.set("date_from", p.dateFrom);
  qs.set("date_to", p.dateTo);
  if (p.branchId != null) qs.set("branch_id", String(p.branchId));
  if (p.companyName) qs.set("company_name", p.companyName);
  return `${apiRoutesPortalMasters.CASH_HANDS_PDF}?${qs.toString()}`;
}

/** Row from GET /hrmsReports/attendance-payscheme.
 *  Index signature so it drops into the generic NJM report grid alongside the
 *  other checklists, which are typed as plain keyed rows. */
export interface AttendancePayschemeRow {
  [key: string]: unknown;
  id: number;
  emp_code: string | null;
  emp_name: string | null;
  department: string | null;
  sub_department: string | null;
  category: string | null;
  status_name: string | null;
  pay_scheme: string | null;
  work_hours: number;
  date_of_join: string | null;
  pf_uan_no: string | null;
  esi_no: string | null;
}

/** "Attendance With PaySchemes" checklist for NJM Wages Data Preparation:
 *  worked hours (net of idle) per employee for the wage period. */
export async function fetchAttendancePayscheme(p: {
  branchId: number;
  dateFrom: string;
  dateTo: string;
  paySchemeId: string | number;
  subDeptId?: string | number | null;
}): Promise<AttendancePayschemeRow[]> {
  const qs = new URLSearchParams();
  qs.set("branch_id", String(p.branchId));
  qs.set("date_from", p.dateFrom);
  qs.set("date_to", p.dateTo);
  qs.set("pay_scheme_id", String(p.paySchemeId));
  if (p.subDeptId) qs.set("sub_dept_id", String(p.subDeptId));
  const result = await fetchWithCookie<{ data: AttendancePayschemeRow[] }>(
    `${apiRoutesPortalMasters.ATTENDANCE_PAYSCHEME_REPORT}?${qs.toString()}`,
  );
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch attendance with pay schemes");
  }
  return result.data.data;
}

/** Row from GET /hrmsReports/daily-hands-complement (legacy report option 2). */
export interface DailyHandsComplementRow {
  id: number;
  attendance_date: string | null;
  dept_code: string | null;
  department: string | null;
  occupation: string | null;
  shift_a: number;
  shift_b: number;
  shift_c: number;
  shift_total: number;
  ot_a: number;
  ot_b: number;
  ot_c: number;
  ot_total: number;
}

/** Daily hands complement: hands per date / department / occupation, split by
 *  shift for regular attendance and for overtime. */
export function fetchDailyHandsComplement(
  p: RangeParams,
): Promise<DailyHandsComplementRow[]> {
  return fetchRangeReport(
    apiRoutesPortalMasters.DAILY_HANDS_COMPLEMENT_REPORT,
    p,
    "daily hands complement report",
  );
}

/** Row from GET /hrmsReports/extra-advance-payment (legacy report option 8). */
export interface ExtraAdvancePaymentRow {
  id: number;
  attendance_date: string | null;
  eb_no: string | null;
  worker_name: string | null;
  shift: string | null;
  department: string | null;
  occupation: string | null;
  work_hours: number;
  advance_amount: number;
}

/** Daily extra advance payment: overtime attendance priced from the
 *  extra_advance_rate slabs. Optionally narrowed to one shift. */
export async function fetchExtraAdvancePayment(
  p: RangeParams & { shift?: string | null },
): Promise<ExtraAdvancePaymentRow[]> {
  const qs = new URLSearchParams();
  qs.set("co_id", String(p.coId));
  qs.set("date_from", p.dateFrom);
  qs.set("date_to", p.dateTo);
  if (p.branchId != null) qs.set("branch_id", String(p.branchId));
  if (p.shift) qs.set("shift", p.shift);
  const result = await fetchWithCookie<{ data: ExtraAdvancePaymentRow[] }>(
    `${apiRoutesPortalMasters.EXTRA_ADVANCE_PAYMENT_REPORT}?${qs.toString()}`,
  );
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to fetch extra advance payment report");
  }
  return result.data.data;
}
