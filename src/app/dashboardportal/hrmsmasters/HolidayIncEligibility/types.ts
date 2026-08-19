/**
 * Types for the Holiday & Attendance Incentive Eligibility master
 * (tbl_holiday_att_inc_eligibility).
 * Single type file for the page — do not split (avoids circular deps).
 */

/** holiday_eligibility / att_incn_eligibility are stored as char(1) Y or N. */
export const YES_NO_OPTIONS = [
  { value: "N", label: "No" },
  { value: "Y", label: "Yes" },
] as const;

/** tbl_holiday_att_inc_eligibility.status — new records start Open. */
export const STATUS_OPEN = 1;
export const STATUS_APPROVED = 3;
export const STATUS_REJECTED = 4;

/** A row of GET /hrmsMasters/get_hol_inc_elig_table (joined for display). */
export interface EligibilityRow {
  id?: number;
  hl_att_inc_id: number;
  eb_id: number | null;
  emp_code: string | null;
  emp_name: string | null;
  category: string | null;
  holiday_eligibility: string | null;
  att_incn_eligibility: string | null;
  fn_att_inc_rate: number | null;
  mn_att_inc_rate: number | null;
  status: number | null;
  /** Name from status_mst, not a client-side map. */
  status_name: string;
  [key: string]: unknown;
}

/** A single record from GET /hrmsMasters/get_hol_inc_elig_by_id/{id}. */
export interface EligibilityRecord {
  hl_att_inc_id: number;
  eb_id: number | null;
  holiday_eligibility: string | null;
  att_incn_eligibility: string | null;
  fn_att_inc_rate: number | null;
  mn_att_inc_rate: number | null;
  status: number | null;
}

export interface Option {
  label: string;
  value: string;
}

/** Body of GET /hrmsMasters/hol_inc_elig_setup. */
export interface EligibilitySetup {
  employees: Option[];
}
