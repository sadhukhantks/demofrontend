/**
 * HRMS service layer — wraps all HRMS API calls with fetchWithCookie.
 */
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import axios from "axios";

// ─── Employee ──────────────────────────────────────────────────────

export const fetchEmployeeList = async (
  coId: string,
  params?: {
    page?: number;
    page_size?: number;
    search?: string;
    status_id?: string;
    branch_id?: string;
    sub_dept_id?: string;
    is_active?: number | null;
    columnFilters?: Record<string, string>;
  },
) => {
  const qs = new URLSearchParams({ co_id: coId });
  if (params?.page) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  if (params?.search) qs.set("search", params.search);
  if (params?.status_id) qs.set("status_id", params.status_id);
  if (params?.branch_id) qs.set("branch_id", params.branch_id);
  if (params?.sub_dept_id) qs.set("sub_dept_id", params.sub_dept_id);
  if (params?.is_active !== undefined && params?.is_active !== null) qs.set("is_active", String(params.is_active));
  if (params?.columnFilters) {
    for (const [key, val] of Object.entries(params.columnFilters)) {
      if (val) qs.set(key, val);
    }
  }
  return fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_EMPLOYEE_LIST}?${qs.toString()}`,
    "GET",
  );
};

export const fetchEmployeeById = async (coId: string, ebId: string, branchId: string) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_EMPLOYEE_BY_ID}/${ebId}?co_id=${coId}&branch_id=${branchId}`,
    "GET",
  );

export const fetchEmployeeCreateSetup = async (coId: string, branchId?: string) => {
  const qs = new URLSearchParams({ co_id: coId });
  if (branchId) qs.set("branch_id", branchId);
  return fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_EMPLOYEE_CREATE_SETUP}?${qs.toString()}`,
    "GET",
  );
};

export const fetchDesignationsByBranch = async (coId: string, branchId: string) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_DESIGNATIONS_BY_BRANCH}?co_id=${coId}&branch_id=${branchId}`,
    "GET",
  );

export const fetchDesignationsBySubDept = async (coId: string, subDeptId: string) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_DESIGNATIONS_BY_SUB_DEPT}?co_id=${coId}&sub_dept_id=${subDeptId}`,
    "GET",
  );

export const checkEmpCodeDuplicate = async (coId: string, empCode: string, branchId: string, excludeEbId?: number | null) => {
  const params = new URLSearchParams({ co_id: coId, emp_code: empCode, branch_id: branchId });
  if (excludeEbId) params.set("exclude_eb_id", String(excludeEbId));
  return fetchWithCookie(`${apiRoutesPortalMasters.HRMS_CHECK_EMP_CODE_DUPLICATE}?${params}`, "GET");
};

export const updateEmployeeStatus = async (
  payload: { eb_id: number; status_id: number; date?: string; reason?: string; remarks?: string },
) => fetchWithCookie(apiRoutesPortalMasters.HRMS_EMPLOYEE_STATUS_UPDATE, "POST", payload);

export const createEmployee = async (coId: string, branchId: string, data: Record<string, unknown>) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_EMPLOYEE_CREATE}?co_id=${coId}&branch_id=${branchId}`,
    "POST",
    data,
  );

export const saveEmployeeSection = async (
  coId: string,
  payload: { eb_id: number; section: string; data: Record<string, unknown> | Record<string, unknown>[] },
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_EMPLOYEE_SECTION_SAVE}?co_id=${coId}`,
    "POST",
    payload,
  );

export const fetchEmployeeProgress = async (coId: string, ebId: string, branchId: string) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_EMPLOYEE_PROGRESS}/${ebId}?co_id=${coId}&branch_id=${branchId}`,
    "GET",
  );

export const uploadEmployeePhoto = async (coId: string, ebId: number, file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("eb_id", String(ebId));
  try {
    const response = await axios.post(
      `${apiRoutesPortalMasters.HRMS_EMPLOYEE_PHOTO_UPLOAD}?co_id=${coId}`,
      formData,
      { withCredentials: true },
    );
    return { data: response.data, error: null, status: response.status };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message, status: 0 };
  }
};

export const getEmployeePhotoUrl = (coId: string, ebId: number | string) =>
  `${apiRoutesPortalMasters.HRMS_EMPLOYEE_PHOTO}/${ebId}?co_id=${coId}`;

export const deleteEmployeePhoto = async (coId: string, ebId: number) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_EMPLOYEE_PHOTO}/${ebId}?co_id=${coId}`,
    "DELETE",
  );

export const lookupEmployeeByCode = async (coId: string, empCode: string) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_EMPLOYEE_LOOKUP_BY_CODE}?co_id=${coId}&emp_code=${encodeURIComponent(empCode)}`,
    "GET",
  );

// ─── Employee Salary Structure ─────────────────────────────────────

export const fetchEmployeeSalarySchemes = async (coId: string) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_EMPLOYEE_SALARY_SCHEMES}?co_id=${coId}`,
    "GET",
  );

export const fetchEmployeeSalary = async (
  coId: string,
  ebId: number,
  branchId: string,
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_EMPLOYEE_SALARY}/${ebId}?co_id=${coId}&branch_id=${branchId}`,
    "GET",
  );

export const checkEmployeeSalary = async (
  coId: string,
  payload: { pay_scheme_id: number; input_values: Record<string, number> },
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_EMPLOYEE_SALARY_CHECK}?co_id=${coId}`,
    "POST",
    payload,
  );

export const saveEmployeeSalary = async (
  coId: string,
  payload: {
    eb_id: number;
    pay_scheme_id: number;
    effective_date: string | null;
    input_values: { component_id: number; amount: number }[];
  },
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_EMPLOYEE_SALARY_SAVE}?co_id=${coId}`,
    "POST",
    payload,
  );

// ─── Pay Scheme ────────────────────────────────────────────────────

export const fetchPaySchemeList = async (
  coId: string,
  params?: { page?: number; page_size?: number; search?: string },
) => {
  const qs = new URLSearchParams();
  if (coId) qs.set("co_id", coId);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  if (params?.search) qs.set("search", params.search);
  return fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_SCHEME_LIST}?${qs.toString()}`,
    "GET",
  );
};

export const fetchPaySchemeById = async (coId: string, id: string) => {
  const qs = new URLSearchParams();
  if (coId) qs.set("co_id", coId);
  return fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_SCHEME_BY_ID}/${id}?${qs.toString()}`,
    "GET",
  );
};

export const fetchPaySchemeCreateSetup = async (coId?: string) => {
  const qs = new URLSearchParams();
  if (coId) qs.set("co_id", coId);
  return fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_SCHEME_CREATE_SETUP}?${qs.toString()}`,
    "GET",
  );
};

export const createPayScheme = async (
  coId: string,
  data: Record<string, unknown>,
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_SCHEME_CREATE}`,
    "POST",
    { ...data, co_id: coId },
  );

export const updatePayScheme = async (
  coId: string,
  id: string,
  data: Record<string, unknown>,
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_SCHEME_UPDATE}/${id}`,
    "PUT",
    { ...data, co_id: coId },
  );

// ─── Pay Param / Period ────────────────────────────────────────────

export const fetchPayParamList = async (
  coId: string,
  params?: { page?: number; page_size?: number; search?: string },
) => {
  const qs = new URLSearchParams({ co_id: coId });
  if (params?.page) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  if (params?.search) qs.set("search", params.search);
  return fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_PARAM_LIST}?${qs.toString()}`,
    "GET",
  );
};

export const fetchPayParamCreateSetup = async (coId: string) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_PARAM_CREATE_SETUP}?co_id=${coId}`,
    "GET",
  );

export const createPayParam = async (coId: string, data: Record<string, unknown>) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_PARAM_CREATE}?co_id=${coId}`,
    "POST",
    data,
  );

export const updatePayParam = async (
  coId: string,
  id: string,
  data: Record<string, unknown>,
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_PARAM_UPDATE}/${id}?co_id=${coId}`,
    "PUT",
    data,
  );

// ─── Pay Register ──────────────────────────────────────────────────

export const fetchPayRegisterList = async (
  coId: string,
  params?: {
    page?: number;
    page_size?: number;
    search?: string;
    from_date?: string;
    to_date?: string;
    status?: string;
  },
) => {
  const qs = new URLSearchParams({ co_id: coId });
  if (params?.page) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  if (params?.search) qs.set("search", params.search);
  if (params?.from_date) qs.set("from_date", params.from_date);
  if (params?.to_date) qs.set("to_date", params.to_date);
  if (params?.status) qs.set("status", params.status);
  return fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_REGISTER_LIST}?${qs.toString()}`,
    "GET",
  );
};

export const fetchPayRegisterById = async (coId: string, id: string) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_REGISTER_BY_ID}/${id}?co_id=${coId}`,
    "GET",
  );

export const fetchPayRegisterCreateSetup = async (coId: string) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_REGISTER_CREATE_SETUP}?co_id=${coId}`,
    "GET",
  );

export const createPayRegister = async (coId: string, data: Record<string, unknown>) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_REGISTER_CREATE}?co_id=${coId}`,
    "POST",
    data,
  );

export const updatePayRegister = async (
  coId: string,
  id: string,
  data: Record<string, unknown>,
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_REGISTER_UPDATE}/${id}?co_id=${coId}`,
    "PUT",
    data,
  );

export const processPayRegister = async (
  coId: string,
  data: { pay_period_id: number; pay_scheme_id: number; branch_id?: number | null },
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_REGISTER_PROCESS}?co_id=${coId}`,
    "POST",
    data,
  );

export const fetchPayRegisterSalary = async (
  coId: string,
  params: {
    branch_id?: number;
    pay_scheme_id?: number;
    from_date?: string;
    to_date?: string;
    pay_period_id: number;
  },
) => {
  const qs = new URLSearchParams({ co_id: coId });
  if (params.branch_id) qs.set("branch_id", String(params.branch_id));
  if (params.pay_scheme_id) qs.set("pay_scheme_id", String(params.pay_scheme_id));
  if (params.from_date) qs.set("from_date", params.from_date);
  if (params.to_date) qs.set("to_date", params.to_date);
  qs.set("pay_period_id", String(params.pay_period_id));
  return fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_REGISTER_SALARY}?${qs.toString()}`,
    "GET",
  );
};

// ─── Pay Register Export (.xlsx) / Pay Slip Print (PDF) ────────────
//
// Both are GET endpoints returning a binary blob. Backend errors arrive as a
// JSON { detail } body wrapped in a Blob, so we unwrap it to a readable message.

async function fetchHrmsBlob(url: string): Promise<Blob> {
  try {
    const response = await axios.get<Blob>(url, {
      responseType: "blob",
      withCredentials: true,
    });
    return response.data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
      let detail = "Download failed";
      try {
        const text = await err.response.data.text();
        const parsed = JSON.parse(text) as { detail?: string };
        if (parsed?.detail) detail = parsed.detail;
      } catch {
        /* non-JSON body — keep the default message */
      }
      throw new Error(detail);
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export const exportPayRegister = (
  coId: string,
  payPeriodId: number | string,
): Promise<Blob> =>
  fetchHrmsBlob(
    `${apiRoutesPortalMasters.HRMS_PAY_REGISTER_EXPORT}?co_id=${coId}&pay_period_id=${payPeriodId}`,
  );

export const printPaySlips = (
  coId: string,
  payPeriodId: number | string,
): Promise<Blob> =>
  fetchHrmsBlob(
    `${apiRoutesPortalMasters.HRMS_PAY_REGISTER_PAYSLIPS}?co_id=${coId}&pay_period_id=${payPeriodId}`,
  );

export const printPaySlipsText = (
  coId: string,
  payPeriodId: number | string,
): Promise<Blob> =>
  fetchHrmsBlob(
    `${apiRoutesPortalMasters.HRMS_PAY_REGISTER_PAYSLIP_TEXT}?co_id=${coId}&pay_period_id=${payPeriodId}`,
  );

export const exportBankSheet = (
  coId: string,
  payPeriodId: number | string,
): Promise<Blob> =>
  fetchHrmsBlob(
    `${apiRoutesPortalMasters.HRMS_PAY_REGISTER_BANK_SHEET}?co_id=${coId}&pay_period_id=${payPeriodId}`,
  );

/** Dot-matrix .txt print for the EJM Wages Data Preparation selects — the
 *  legacy screens' "Print" (register) and text "Payslip" buttons. `list` is
 *  which select the code belongs to. */
export const downloadEjmTextPrint = (p: {
  list: "action" | "payreg" | "ot";
  kind: "register" | "payslip" | "statement";
  report: string;
  coId: string;
  branchId: number;
  dateFrom: string;
  dateTo: string;
  paySchemeId: string | number;
}): Promise<Blob> =>
  fetchHrmsBlob(
    `${apiRoutesPortalMasters.EJM_TEXT_PRINT}?${new URLSearchParams({
      list: p.list,
      kind: p.kind,
      report: p.report,
      co_id: p.coId,
      branch_id: String(p.branchId),
      date_from: p.dateFrom,
      date_to: p.dateTo,
      pay_scheme_id: String(p.paySchemeId),
    })}`,
  );

/** NJM pay slips as dot-matrix .txt (legacy Njmwagesprocess::njmcntwagespayslip):
 *  `contractor` is the two-up contractor slip with piece production lines,
 *  `main` the main-payroll slip. The backend resolves the pay period itself. */
export const downloadNjmPayslip = (p: {
  kind: "contractor" | "main";
  /** `pdf` is the legacy FPDF two-up (contractor only); `txt` the dot-matrix slip. */
  fmt: "pdf" | "txt";
  coId: string;
  branchId: number;
  dateFrom: string;
  dateTo: string;
  paySchemeId: string | number;
}): Promise<Blob> =>
  fetchHrmsBlob(
    `${apiRoutesPortalMasters.NJM_TEXT_PAYSLIP}?${new URLSearchParams({
      kind: p.kind,
      fmt: p.fmt,
      co_id: p.coId,
      branch_id: String(p.branchId),
      date_from: p.dateFrom,
      date_to: p.dateTo,
      pay_scheme_id: String(p.paySchemeId),
    })}`,
  );

/** Excel for Pay Roll: the scheme's Pay Roll upload template filled from the
 *  period's collected wages, every hand on the scheme (zeros where nothing
 *  was collected). Uploads through Pay Roll unchanged. */
export const downloadEjmWagesPayrollExcel = (p: {
  dateFrom: string;
  dateTo: string;
  paySchemeId: string | number;
}): Promise<Blob> =>
  fetchHrmsBlob(
    `${apiRoutesPortalMasters.EJM_WAGES_PAYROLL_EXCEL}?${new URLSearchParams({
      date_from: p.dateFrom,
      date_to: p.dateTo,
      pay_scheme_id: String(p.paySchemeId),
    })}`,
  );

// ─── Pay Register Display Setup (tbl_payslip_print_component) ───────

export const fetchPayslipPrintComponentList = async (
  coId: string,
  params?: {
    page?: number;
    limit?: number;
    search?: string;
    branch_id?: string;
    payscheme_id?: number | string;
  },
) => {
  const qs = new URLSearchParams({ co_id: coId });
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.search) qs.set("search", params.search);
  if (params?.branch_id) qs.set("branch_id", params.branch_id);
  if (params?.payscheme_id) qs.set("payscheme_id", String(params.payscheme_id));
  return fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAYSLIP_PRINT_COMPONENT_LIST}?${qs.toString()}`,
    "GET",
  );
};

export const fetchPayslipPrintComponentSetup = async (coId: string) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAYSLIP_PRINT_COMPONENT_SETUP}?co_id=${coId}`,
    "GET",
  );

export const fetchPaySchemeComponents = async (
  coId: string,
  payschemeId: number | string,
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_SCHEME_COMPONENTS}?co_id=${coId}&payscheme_id=${payschemeId}`,
    "GET",
  );

export const fetchPayslipPrintComponentById = async (
  coId: string,
  payId: number | string,
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAYSLIP_PRINT_COMPONENT_BY_ID}/${payId}?co_id=${coId}`,
    "GET",
  );

export const createPayslipPrintComponent = async (
  coId: string,
  data: Record<string, unknown>,
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAYSLIP_PRINT_COMPONENT_CREATE}?co_id=${coId}`,
    "POST",
    data,
  );

export const updatePayslipPrintComponent = async (
  coId: string,
  payId: number | string,
  data: Record<string, unknown>,
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAYSLIP_PRINT_COMPONENT_UPDATE}/${payId}?co_id=${coId}`,
    "PUT",
    data,
  );

export const deletePayslipPrintComponent = async (
  coId: string,
  payId: number | string,
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAYSLIP_PRINT_COMPONENT_DELETE}/${payId}?co_id=${coId}`,
    "DELETE",
  );

// ─── Pay Roll (pay_components_custom) ──────────────────────────────

export const fetchPayRollSetup = async (coId: string, branchId?: string | number) => {
  const qs = new URLSearchParams({ co_id: coId });
  if (branchId) qs.set("branch_id", String(branchId));
  return fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_ROLL_SETUP}?${qs.toString()}`,
    "GET",
  );
};

export const fetchPayRollData = async (
  coId: string,
  payload: {
    from_date: string;
    to_date: string;
    branch_id: number;
    pay_scheme_id?: number;
    dept_id?: number;
    emp_category_id?: number;
  },
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_ROLL_DATA}?co_id=${coId}`,
    "POST",
    payload,
  );

export const savePayRollData = async (
  coId: string,
  payload: {
    from_date: string;
    to_date: string;
    pay_period_id?: number | null;
    employees: {
      eb_id: number;
      pay_comp_values: Record<string, number>;
    }[];
  },
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_ROLL_SAVE}?co_id=${coId}`,
    "POST",
    payload,
  );

export const fetchPayRollAttendance = async (
  coId: string,
  params: { from_date: string; to_date: string },
) => {
  const qs = new URLSearchParams({
    co_id: coId,
    from_date: params.from_date,
    to_date: params.to_date,
  });
  return fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_ROLL_FETCH_ATTENDANCE}?${qs.toString()}`,
    "GET",
  );
};

export const fetchPayRollGeneric = async (
  coId: string,
  params: { from_date: string; to_date: string },
) => {
  const qs = new URLSearchParams({
    co_id: coId,
    from_date: params.from_date,
    to_date: params.to_date,
  });
  return fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_ROLL_FETCH_GENERIC}?${qs.toString()}`,
    "GET",
  );
};

export const fetchPayRollCumulative = async (
  coId: string,
  params: { from_date: string; to_date: string },
) => {
  const qs = new URLSearchParams({
    co_id: coId,
    from_date: params.from_date,
    to_date: params.to_date,
  });
  return fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_ROLL_FETCH_CUMULATIVE}?${qs.toString()}`,
    "GET",
  );
};

export const uploadPayRollExcel = async (
  coId: string,
  file: File,
  params: { from_date: string; to_date: string; branch_id: number },
) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("from_date", params.from_date);
  formData.append("to_date", params.to_date);
  // emp_code is only unique within a branch — without this the backend can
  // resolve a code to the same-code employee of another branch.
  formData.append("branch_id", String(params.branch_id));
  try {
    const response = await axios.post(
      `${apiRoutesPortalMasters.HRMS_PAY_ROLL_UPLOAD}?co_id=${coId}`,
      formData,
      { withCredentials: true },
    );
    return { data: response.data, error: null, status: response.status };
  } catch (err: unknown) {
    // FastAPI puts the real reason (bad header, unreadable sheet…) in `detail`;
    // axios' own message is just "Request failed with status code 400".
    const detail = axios.isAxiosError(err)
      ? (err.response?.data as { detail?: unknown } | undefined)?.detail
      : undefined;
    const message =
      typeof detail === "string" ? detail : err instanceof Error ? err.message : String(err);
    return { data: null, error: message, status: 0 };
  }
};

export const downloadPayRollTemplate = async (
  coId: string,
  payload: {
    branch_id: number;
    pay_scheme_id?: number;
    dept_id?: number;
    emp_category_id?: number;
  },
) => {
  try {
    const response = await axios.post(
      `${apiRoutesPortalMasters.HRMS_PAY_ROLL_DOWNLOAD_TEMPLATE}?co_id=${coId}`,
      payload,
      { withCredentials: true, responseType: "blob" },
    );
    return { data: response.data as Blob, error: null, status: response.status };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message, status: 0 };
  }
};

// ─── Leave Request (transaction) ───────────────────────────────────

export const fetchLeaveRequestList = async (
  branchId: string | number,
  params?: {
    page?: number;
    page_size?: number;
    search?: string;
    leave_type_id?: number | string;
    eb_no?: string;
    status_id?: number | string;
  },
) => {
  const qs = new URLSearchParams({ branch_id: String(branchId) });
  if (params?.page) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  if (params?.search) qs.set("search", params.search);
  if (params?.leave_type_id) qs.set("leave_type_id", String(params.leave_type_id));
  if (params?.eb_no) qs.set("eb_no", params.eb_no);
  if (params?.status_id) qs.set("status_id", String(params.status_id));
  return fetchWithCookie(
    `${apiRoutesPortalMasters.LEAVE_REQUEST_TABLE}?${qs.toString()}`,
    "GET",
  );
};

export const fetchLeaveRequestById = async (id: number | string) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.LEAVE_REQUEST_BY_ID}/${id}`,
    "GET",
  );

export const createLeaveRequest = async (payload: {
  branch_id: string | number;
  eb_id: number;
  leave_type_id: number;
  leave_from_date: string;
  leave_to_date: string;
  non_working_days: number;
  leave_purpose: string;
}) =>
  fetchWithCookie(apiRoutesPortalMasters.LEAVE_REQUEST_CREATE, "POST", payload);

export const updateLeaveRequest = async (
  id: number | string,
  payload: {
    branch_id: string | number;
    eb_id: number;
    leave_type_id: number;
    leave_from_date: string;
    leave_to_date: string;
    non_working_days: number;
    leave_purpose: string;
  },
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.LEAVE_REQUEST_EDIT}/${id}`,
    "PUT",
    payload,
  );

export const approveLeaveRequest = async (
  id: number | string,
  payload: { branch_id?: string | number; remarks?: string },
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.LEAVE_REQUEST_APPROVE}/${id}`,
    "PUT",
    payload,
  );

export const rejectLeaveRequest = async (
  id: number | string,
  payload: { branch_id?: string | number; remarks?: string },
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.LEAVE_REQUEST_REJECT}/${id}`,
    "PUT",
    payload,
  );

export const fetchLeaveLedgerByEb = async (
  branchId: string | number,
  ebNo: string,
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.LEAVE_LEDGER_BY_EB}/${ebNo}?branch_id=${branchId}`,
    "GET",
  );

export const fetchWorkerByEbNo = async (
  branchId: string | number,
  ebNo: string,
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.WORKER_BY_EB_NO}/${ebNo}?branch_id=${branchId}`,
    "GET",
  );

export const fetchLeaveTypeOptions = async (coId: string) => {
  const qs = new URLSearchParams({ co_id: coId, page: "1", limit: "200" });
  return fetchWithCookie(
    `${apiRoutesPortalMasters.LEAVE_TYPE_TABLE}?${qs.toString()}`,
    "GET",
  );
};

// ─── Daily Attendance (transaction) ────────────────────────────────

export interface AttendancePayload {
  branch_id: string | number;
  eb_id: number;
  attendance_date: string;
  attendance_mark: string;
  attendance_source: string;
  attendance_type: string;
  spell: string;
  spell_id: number;
  spell_hours: number;
  worked_department_id: number;
  worked_designation_id: number;
  working_hours: number;
  idle_hours: number;
  remarks: string;
  entry_time: string;
  exit_time: string;
  machine_ids: number[];
}

export const fetchAttendanceList = async (
  branchId: string | number,
  params?: {
    page?: number;
    page_size?: number;
    search?: string;
    from_date?: string;
    to_date?: string;
    eb_no?: string;
    attendance_type?: string;
    status_id?: number | string;
  },
) => {
  const qs = new URLSearchParams({ branch_id: String(branchId) });
  if (params?.page) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  if (params?.search) qs.set("search", params.search);
  if (params?.from_date) qs.set("from_date", params.from_date);
  if (params?.to_date) qs.set("to_date", params.to_date);
  if (params?.eb_no) qs.set("eb_no", params.eb_no);
  if (params?.attendance_type) qs.set("attendance_type", params.attendance_type);
  if (params?.status_id) qs.set("status_id", String(params.status_id));
  return fetchWithCookie(
    `${apiRoutesPortalMasters.ATTENDANCE_LIST}?${qs.toString()}`,
    "GET",
  );
};

export const fetchAttendanceById = async (id: number | string) =>
  fetchWithCookie(`${apiRoutesPortalMasters.ATTENDANCE_BY_ID}/${id}`, "GET");

export const createAttendance = async (payload: AttendancePayload) =>
  fetchWithCookie(apiRoutesPortalMasters.ATTENDANCE_CREATE, "POST", payload);

export const updateAttendance = async (
  id: number | string,
  payload: AttendancePayload,
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.ATTENDANCE_EDIT}/${id}`,
    "PUT",
    payload,
  );

export const approveAttendance = async (id: number | string) =>
  fetchWithCookie(`${apiRoutesPortalMasters.ATTENDANCE_APPROVE}/${id}`, "PUT", {});

export const rejectAttendance = async (id: number | string) =>
  fetchWithCookie(`${apiRoutesPortalMasters.ATTENDANCE_REJECT}/${id}`, "PUT", {});

export const fetchAttendanceCreateSetup = async (
  branchId: string | number,
) => {
  const qs = new URLSearchParams({ branch_id: String(branchId) });
  return fetchWithCookie(
    `${apiRoutesPortalMasters.ATTENDANCE_CREATE_SETUP}?${qs.toString()}`,
    "GET",
  );
};

/** Leave-conflict check for the Mark Attendance form (from vw_leave_dates). */
export const fetchAttendanceLeaveStatus = async (
  ebId: number | string,
  attendanceDate: string,
) => {
  const qs = new URLSearchParams({
    eb_id: String(ebId),
    attendance_date: attendanceDate,
  });
  return fetchWithCookie(
    `${apiRoutesPortalMasters.ATTENDANCE_LEAVE_STATUS}?${qs.toString()}`,
    "GET",
  );
};

export const fetchMachinesByDesignation = async (
  branchId: string | number,
  designationId?: number | string,
) => {
  const qs = new URLSearchParams({ branch_id: String(branchId) });
  if (designationId) qs.set("designation_id", String(designationId));
  return fetchWithCookie(
    `${apiRoutesPortalMasters.ATTENDANCE_MACHINES}?${qs.toString()}`,
    "GET",
  );
};

// ─── Attendance Open / Close ───────────────────────────────────────

/** One (branch, date, spell) slice — the key the update is scoped by. */
export interface AttendanceSliceParams {
  branch_id: string | number;
  attendance_date: string;
  spell_id: string | number;
  /** Widens the match to legacy rows that never got a spell_id. */
  spell_name?: string;
}

export interface AttendanceOpenCloseRow {
  /** NULL when every row of the spell group predates spell_id and the name
   *  was too ambiguous to resolve — such a spell can be viewed, not toggled. */
  spell_id: number | null;
  spell_name: string;
  dept_id: number | null;
  dept_name: string;
  attendance_date: string;
  status: "Open" | "Close";
  open_count: number;
  total_count: number;
}

/**
 * Every (spell, department) with attendance on a branch + date, with its
 * Open/Close state. Deliberately not spell-scoped: the page's Spell and
 * Department dropdowns are both derived from this, so they only ever offer
 * what the day's attendance actually contains.
 */
export const fetchAttendanceOpenCloseStatus = async (params: {
  branch_id: string | number;
  attendance_date: string;
}) => {
  const qs = new URLSearchParams({
    branch_id: String(params.branch_id),
    attendance_date: params.attendance_date,
  });
  return fetchWithCookie<{ data: AttendanceOpenCloseRow[] }>(
    `${apiRoutesPortalMasters.ATTENDANCE_OPEN_CLOSE_STATUS}?${qs.toString()}`,
    "GET",
  );
};

/**
 * Open (3→1) or close (1→3) the slice for one department, or `"all"` departments
 * of the spell — close only. Only the open direction is password-gated: closing
 * just returns records to the state they are written in.
 */
export const submitAttendanceOpenClose = async (
  body: AttendanceSliceParams & {
    /** A department id, or "all" (close only) for the whole spell. */
    worked_department_id: string | number;
    action: "open" | "close";
    /** Required for `action: "open"` only. */
    password?: string;
  },
) =>
  fetchWithCookie<{ message: string; updated: number }>(
    apiRoutesPortalMasters.ATTENDANCE_OPEN_CLOSE,
    "POST",
    body,
  );

// ─── Attendance Checklist (flat register report) ───────────────────

export interface AttendanceRegisterParams {
  from_date: string;
  to_date: string;
  branch_id?: string | number;
  /** Backend query param — maps from the form field `dept_id`. */
  department_id?: string | number;
  designation_id?: string | number;
  shift_name?: string;
  att_type?: string;
  emp_code?: string;
  emp_name?: string;
}

/**
 * Builds the query string for GET /attendance-report.
 * Empty/undefined optional params are omitted. Exported for unit tests.
 */
export const buildAttendanceRegisterQuery = (
  params: AttendanceRegisterParams,
): string => {
  const qs = new URLSearchParams({
    from_date: params.from_date,
    to_date: params.to_date,
  });
  if (params.branch_id) qs.set("branch_id", String(params.branch_id));
  if (params.department_id) qs.set("department_id", String(params.department_id));
  if (params.designation_id) qs.set("designation_id", String(params.designation_id));
  if (params.shift_name) qs.set("shift_name", params.shift_name);
  if (params.att_type) qs.set("att_type", params.att_type);
  if (params.emp_code) qs.set("emp_code", params.emp_code);
  if (params.emp_name) qs.set("emp_name", params.emp_name);
  return qs.toString();
};

/** Flat attendance register rows for the Attendance Checklist page. */
export const fetchAttendanceRegister = async (params: AttendanceRegisterParams) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.ATTENDANCE_CHECKLIST_REPORT}?${buildAttendanceRegisterQuery(params)}`,
    "GET",
  );

// ─── NJM Wages Data Preparation — the five "Updates" actions ───────

/** The shared header every NJM Updates action posts. */
export interface NjmUpdateParams {
  branchId: number;
  dateFrom: string;
  dateTo: string;
  /** The rows these actions write are keyed by pay scheme. */
  paySchemeId: string | number;
}

/** Cad/Vard/GWF deduction amounts. Ignored by the four upload actions. */
export interface NjmDedAmounts {
  cad_ded: string;
  vard_ded: string;
  gwf_ded: string;
}

/** Action value (the legacy handler name the page's select carries) -> route. */
export const NJM_UPDATE_ENDPOINTS: Readonly<Record<string, string>> = Object.freeze({
  njmwrkvardupdate: apiRoutesPortalMasters.NJM_WRK_VARD_UPDATE,
  cntexlupload: apiRoutesPortalMasters.NJM_CNT_WAGES_UPLOAD,
  njmwrkfauploadjs: apiRoutesPortalMasters.NJM_WRK_FA_UPLOAD,
  njmwrkothadjsuploadjs: apiRoutesPortalMasters.NJM_WRK_OTH_ADJS_UPLOAD,
  wrklinehoursupload: apiRoutesPortalMasters.NJM_LINE_HOURS_UPLOAD,
});

/**
 * Run one NJM Updates action. All five take the same multipart header; only
 * Cad/Vard/GWF sends amounts and only the other four send a file.
 */
export const runNjmUpdate = async (
  action: string,
  params: NjmUpdateParams,
  extra: { file?: File | null; deds?: NjmDedAmounts } = {},
) => {
  const url = NJM_UPDATE_ENDPOINTS[action];
  if (!url) return { data: null, error: `Unknown update action "${action}"` };

  const form = new FormData();
  form.append("branch_id", String(params.branchId));
  form.append("date_from", params.dateFrom);
  form.append("date_to", params.dateTo);
  form.append("pay_scheme_id", String(params.paySchemeId));
  if (extra.deds) {
    for (const [name, value] of Object.entries(extra.deds)) {
      form.append(name, value === "" ? "0" : value);
    }
  }
  if (extra.file) form.append("file", extra.file);

  return fetchWithCookie<{ data: { message: string; rows: number } }>(
    url,
    "POST",
    form,
  );
};

/** Generic row shape for the NJM checklists/exports — each report has its own
 *  columns, so the page supplies the column defs and reads by key. */
export type NjmReportRow = Record<string, unknown> & { id: number };

/** One NJM report: GET with a query string, `{ data, total }` back. */
export const fetchNjmReport = async (
  url: string,
  params: Record<string, string | number | undefined>,
) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }
  const query = qs.toString();
  // `columns` is only sent by the mapping-driven Main Wages export.
  return fetchWithCookie<{ data: NjmReportRow[]; total: number; columns?: string[] }>(
    query ? `${url}?${query}` : url,
    "GET",
  );
};

/** The same NJM report endpoint asked for its legacy PDF (`fmt=pdf`). */
export const downloadNjmReportPdf = (
  url: string,
  params: Record<string, string | number | undefined>,
): Promise<Blob> => {
  const qs = new URLSearchParams({ fmt: "pdf" });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }
  return fetchHrmsBlob(`${url}?${qs}`);
};

/** Resolve the screen's period + pay scheme to a pay_period id, so Pay
 *  Register / Pay Slip / Bank Statement can reuse the existing Pay Register
 *  screens instead of this page growing its own copies. */
export const fetchNjmPayPeriod = async (p: {
  branchId: number;
  dateFrom: string;
  dateTo: string;
  paySchemeId: string | number;
}) =>
  fetchWithCookie<{ data: { payperiod_id: number; payscheme_name: string | null } }>(
    `${apiRoutesPortalMasters.NJM_PAY_PERIOD}?${new URLSearchParams({
      branch_id: String(p.branchId),
      date_from: p.dateFrom,
      date_to: p.dateTo,
      pay_scheme_id: String(p.paySchemeId),
    })}`,
    "GET",
  );

/** Contractor Wages Process / Payroll Posting — the two write actions on the
 *  NJM Process list. Both take JSON, not multipart. */
export const runNjmProcess = async (
  url: string,
  body: Record<string, unknown>,
) =>
  fetchWithCookie<{ data: { message: string; rows: number } }>(url, "POST", body);

/** Contractor ESI: the portal's own template in, the filled return rows out. */
export const runNjmContractorEsi = async (
  p: { branchId: number; dateFrom: string; dateTo: string; file: File },
) => {
  const form = new FormData();
  form.append("branch_id", String(p.branchId));
  form.append("date_from", p.dateFrom);
  form.append("date_to", p.dateTo);
  form.append("file", p.file);
  return fetchWithCookie<{
    data: NjmReportRow[];
    total: number;
    unmatched: string[];
  }>(apiRoutesPortalMasters.NJM_CONTRACTOR_ESI, "POST", form);
};
