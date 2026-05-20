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
  params?: { co_id?: string; page?: number; page_size?: number; search?: string },
) => {
  const qs = new URLSearchParams();
  if (params?.co_id) qs.set("co_id", params.co_id);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  if (params?.search) qs.set("search", params.search);
  return fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_SCHEME_LIST}?${qs.toString()}`,
    "GET",
  );
};

export const fetchPaySchemeById = async (id: string) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_SCHEME_BY_ID}/${id}`,
    "GET",
  );

export const fetchPaySchemeCreateSetup = async (coId?: string) => {
  const qs = new URLSearchParams();
  if (coId) qs.set("co_id", coId);
  return fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_SCHEME_CREATE_SETUP}?${qs.toString()}`,
    "GET",
  );
};

export const createPayScheme = async (data: Record<string, unknown>) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_SCHEME_CREATE}`,
    "POST",
    data,
  );

export const updatePayScheme = async (
  id: string,
  data: Record<string, unknown>,
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_SCHEME_UPDATE}/${id}`,
    "PUT",
    data,
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

// ─── Pay Roll (pay_components_custom) ──────────────────────────────

export const fetchPayRollSetup = async (coId: string) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.HRMS_PAY_ROLL_SETUP}?co_id=${coId}`,
    "GET",
  );

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
  params: { from_date: string; to_date: string },
) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("from_date", params.from_date);
  formData.append("to_date", params.to_date);
  try {
    const response = await axios.post(
      `${apiRoutesPortalMasters.HRMS_PAY_ROLL_UPLOAD}?co_id=${coId}`,
      formData,
      { withCredentials: true },
    );
    return { data: response.data, error: null, status: response.status };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
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
  coId: string,
  params?: {
    page?: number;
    page_size?: number;
    search?: string;
    leave_type_id?: number | string;
    eb_no?: string;
    status_id?: number | string;
  },
) => {
  const qs = new URLSearchParams({ co_id: coId });
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
  co_id: string | number;
  eb_id: number;
  leave_type_id: number;
  leave_from_date: string;
  leave_to_date: string;
  leave_purpose: string;
}) =>
  fetchWithCookie(apiRoutesPortalMasters.LEAVE_REQUEST_CREATE, "POST", payload);

export const updateLeaveRequest = async (
  id: number | string,
  payload: {
    co_id: string | number;
    eb_id: number;
    leave_type_id: number;
    leave_from_date: string;
    leave_to_date: string;
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
  payload: { co_id: string | number; remarks?: string },
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.LEAVE_REQUEST_APPROVE}/${id}`,
    "PUT",
    payload,
  );

export const rejectLeaveRequest = async (
  id: number | string,
  payload: { co_id: string | number; remarks?: string },
) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.LEAVE_REQUEST_REJECT}/${id}`,
    "PUT",
    payload,
  );

export const fetchLeaveLedgerByEb = async (coId: string, ebNo: string) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.LEAVE_LEDGER_BY_EB}/${ebNo}?co_id=${coId}`,
    "GET",
  );

export const fetchWorkerByEbNo = async (coId: string, ebNo: string) =>
  fetchWithCookie(
    `${apiRoutesPortalMasters.WORKER_BY_EB_NO}/${ebNo}?co_id=${coId}`,
    "GET",
  );

export const fetchLeaveTypeOptions = async (coId: string) => {
  const qs = new URLSearchParams({ co_id: coId, page: "1", limit: "200" });
  return fetchWithCookie(
    `${apiRoutesPortalMasters.LEAVE_TYPE_TABLE}?${qs.toString()}`,
    "GET",
  );
};
