import type { MrListReportRow } from "../types/reportTypes";

/** Status the MR List opens with ticked: Approved (status_mst 3). */
export const MR_LIST_DEFAULT_STATUS_IDS: readonly number[] = Object.freeze([3]);

/** Status text for a row: the ERP status, plus the Returned mark when the lorry went back. */
export function mrListStatusLabel(row: Pick<MrListReportRow, "status_name" | "status_id" | "is_returned">): string {
  const base = row.status_name?.trim() || (row.status_id != null ? `Status ${row.status_id}` : "");
  return row.is_returned ? (base ? `${base} · Returned` : "Returned") : base;
}

/** The date a row is listed under in the "all" view: MR date, else gate-entry date. */
export function mrListListedDate(row: Pick<MrListReportRow, "jute_mr_date" | "jute_gate_entry_date">): string {
  return row.jute_mr_date ?? row.jute_gate_entry_date ?? "";
}
