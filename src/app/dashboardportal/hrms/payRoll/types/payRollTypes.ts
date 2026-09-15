export interface Option {
  label: string;
  value: string;
}

export interface PayRollSetupData {
  pay_schemes: Option[];
  branches: Option[];
  departments: Option[];
  categories: Option[];
}

export interface PayComponentMeta {
  id: number;
  code: string;
  name: string;
}

export interface EmpPayComponentValue {
  component_id: number;
  value: number;
}

export interface EmployeePaySchemeRow {
  emp_id: number;
  emp_code: string;
  emp_name: string;
  pay_scheme_name: string | null;
  pcc_list?: EmpPayComponentValue[];
}

export interface PayRollDataResponse {
  pay_components: PayComponentMeta[];
  emp_pay_scheme_list: EmployeePaySchemeRow[];
  pay_period_id?: number | null;
}

/** `data` of POST /hrms/pay_roll_upload, plus the summary line shown on the page. */
export interface PayRollUploadResult {
  message: string;
  records_saved: number;
  skipped_employee_codes: string[];
}

export type PayRollGridRow = {
  id: number;
  eb_id: number;
  emp_code: string;
  emp_name: string;
  pay_scheme_name: string | null;
} & Record<string, string | number | null>;

export interface PayRollFilterValues {
  from_date: string;
  to_date: string;
  pay_scheme_id: string;
  dept_id: string;
  branch_id: string;
  emp_category_id: string;
}
