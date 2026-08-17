/**
 * Types for the Holiday Master (holiday_master).
 * Single type file for the page — do not split (avoids circular deps).
 */

/** holiday_master.holiday_type — must match the backend HOLIDAY_TYPES map. */
export const HOLIDAY_TYPE_OPTIONS = [
  { value: "1", label: "Occasional" },
  { value: "2", label: "Weekly" },
  { value: "3", label: "Monthly" },
] as const;

/** holiday_master.status — new holidays start Open. */
export const STATUS_OPEN = 1;
export const STATUS_APPROVED = 3;
export const STATUS_REJECTED = 4;

/** A row of GET /hrmsMasters/get_holiday_table (joined for display). */
export interface HolidayRow {
  id?: number;
  holiday_id: number;
  branch_id: number | null;
  branch_name: string | null;
  holiday: string | null;
  /** YYYY-MM-DD */
  holiday_date: string | null;
  holiday_type: number | null;
  holiday_type_name: string;
  period_start_date: string | null;
  period_end_date: string | null;
  spell_id: number | null;
  spell_name: string | null;
  status: number | null;
  status_name: string;
  /** Active hrms_holiday_transactions rows — 0 means not processed yet. */
  processed_count: number;
  [key: string]: unknown;
}

/** Body of the row-action endpoints (holiday_process / _approve / _open). */
export interface HolidayActionResult {
  message: string;
}

/** A single record from GET /hrmsMasters/get_holiday_by_id/{id}. */
export interface HolidayRecord {
  holiday_id: number;
  branch_id: number | null;
  holiday: string | null;
  holiday_date: string | null;
  holiday_type: number | null;
  period_start_date: string | null;
  period_end_date: string | null;
  spell_id: number | null;
  status: number | null;
}

export interface Option {
  label: string;
  value: string;
}

/** Row shape borrowed from the Spell Master list endpoint (spell dropdown). */
export interface SpellRow {
  spell_id: number;
  spell_name: string | null;
  spell_code: string | null;
}
