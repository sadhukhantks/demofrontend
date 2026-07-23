/**
 * Pure helpers for the Attendance Checklist page: backend-row → grid-row
 * mapping, attendance-type labels, and filter validation.
 */
import { z } from "zod";
import type {
  AttendanceReportRow,
  ChecklistGridRow,
} from "../types/attendanceChecklistTypes";

/** attendance_type codes → readable labels (see vowerp3be mobileapp models). */
export const ATT_TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  R: "Regular",
  O: "OT",
  C: "Cash",
});

export const attTypeLabel = (code: string): string =>
  ATT_TYPE_LABELS[code || "R"] ?? code;

export const mapReportRows = (rows: AttendanceReportRow[]): ChecklistGridRow[] =>
  rows.map((r) => ({
    id: r.id,
    date: r.attendance_date || "",
    spell: r.shift_name || "",
    ebNo: r.emp_code || "",
    name: r.emp_name || "",
    department: r.department_name || "",
    designation: r.designation_name || "",
    source: r.status || "",
    attType: attTypeLabel(r.att_type),
    workingHours: Number(r.working_hours ?? 0),
  }));

/**
 * Mandatory search inputs — guard for manual `safeParse` before fetching
 * (surface the first issue via snackbar). NOT for zodResolver, and the parsed
 * output must not be used to build queries: optional filters (dept_id, etc.)
 * are intentionally absent here and would be stripped.
 */
export const checklistFilterSchema = z
  .object({
    from_date: z.string().min(1, "Please enter the From Date"),
    to_date: z.string().min(1, "Please enter the To Date"),
    branch_id: z.string().min(1, "Please select the Branch"),
  })
  .refine((v) => v.from_date <= v.to_date, {
    message: "From Date should not be greater than To Date",
    path: ["to_date"],
  });

const CSV_HEADERS = [
  "Date",
  "Spell",
  "EB No",
  "Name",
  "Department",
  "Designation",
  "Source",
  "Type",
  "Working Hours",
] as const;

const csvEscape = (value: string | number): string => {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const rowsToCsv = (rows: ChecklistGridRow[]): string => {
  const lines = rows.map((r) =>
    [
      r.date,
      r.spell,
      r.ebNo,
      r.name,
      r.department,
      r.designation,
      r.source,
      r.attType,
      r.workingHours,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [CSV_HEADERS.join(","), ...lines].join("\n");
};

export const csvFilename = (fromDate: string, toDate: string): string =>
  `attendance-checklist_${fromDate}_${toDate}.csv`;
