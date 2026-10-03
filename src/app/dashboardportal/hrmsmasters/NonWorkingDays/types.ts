/**
 * Types for the Non Working Days master (tbl_non_working_days).
 * Single type file for the page — do not split (avoids circular deps).
 */

/** A row of GET /hrmsMasters/get_non_working_days_table. */
export interface NonWorkingDayRow {
  id?: number;
  non_working_days_id: number;
  company_id: number | null;
  branch_id: number | null;
  /** "All branches" for legacy rows with no branch. */
  branch_name: string;
  non_working_date: string | null;
  is_active: number | null;
  offday_leave: number | null;
  [key: string]: unknown;
}

/** A single record from GET /hrmsMasters/get_non_working_day_by_id/{id}. */
export interface NonWorkingDayRecord {
  non_working_days_id: number;
  company_id: number | null;
  branch_id: number | null;
  non_working_date: string | null;
  is_active: number | null;
  offday_leave: number | null;
}
