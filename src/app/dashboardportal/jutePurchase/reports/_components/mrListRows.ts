import type { MrListReportRow } from "../types/reportTypes";
import type { MrListStatusMode } from "@/utils/juteReportService";

/** The two views of the MR List report. The Tally sheet is approved-only in both. */
export const MR_LIST_STATUS_OPTIONS: ReadonlyArray<{ value: MrListStatusMode; label: string }> =
  Object.freeze([
    { value: "approved", label: "Approved MRs (by MR date)" },
    { value: "all", label: "All MRs with status (by MR or gate-entry date)" },
  ]);

/** Status text for a row: the ERP status, plus the Returned mark when the lorry went back. */
export function mrListStatusLabel(row: Pick<MrListReportRow, "status_name" | "status_id" | "is_returned">): string {
  const base = row.status_name?.trim() || (row.status_id != null ? `Status ${row.status_id}` : "");
  return row.is_returned ? (base ? `${base} · Returned` : "Returned") : base;
}

/** The date a row is listed under in the "all" view: MR date, else gate-entry date. */
export function mrListListedDate(row: Pick<MrListReportRow, "jute_mr_date" | "jute_gate_entry_date">): string {
  return row.jute_mr_date ?? row.jute_gate_entry_date ?? "";
}
