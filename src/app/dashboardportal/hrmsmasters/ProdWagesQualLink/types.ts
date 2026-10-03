/**
 * Types for the Production Quality <-> Wages Quality link master
 * (link_prodquality_wagequality_mst).
 * Single type file for the page — do not split (avoids circular deps).
 */

/** A row of GET /hrmsMasters/get_prod_wages_link_table (joined for display). */
export interface LinkRow {
  id?: number;
  link_prod_wages_id: number;
  dept_id: number | null;
  dept_desc: string | null;
  branch_id: number | null;
  branch_name: string | null;
  prod_quality_id: number | null;
  prod_quality_name: string;
  wages_quality_id: number | null;
  wages_quality_name: string;
  active: number | null;
  process: string | null;
  [key: string]: unknown;
}

/** A single record from GET /hrmsMasters/get_prod_wages_link_by_id/{id}. */
export interface LinkRecord {
  link_prod_wages_id: number;
  prod_quality_id: number | null;
  wages_quality_id: number | null;
  branch_id: number | null;
  dept_id: number | null;
  active: number | null;
  process: string | null;
}

export interface Option {
  label: string;
  value: string;
}

export type QualityType = "weaving" | "winding" | "finishing" | "beaming";

export interface DepartmentOption extends Option {
  quality_type: QualityType;
}

/** Wages qualities carry the department (tbl_wages_quality_master.master_dept_id) they rate. */
export interface WagesQualityOption extends Option {
  dept_id: string | null;
}

/** Body of GET /hrmsMasters/prod_wages_link_setup. */
export interface LinkSetup {
  departments: DepartmentOption[];
  wages_qualities: WagesQualityOption[];
}

/** Body of GET /hrmsMasters/prod_wages_link_qualities?dept_id=. */
export interface ProdQualities {
  quality_type: QualityType;
  qualities: Option[];
}
