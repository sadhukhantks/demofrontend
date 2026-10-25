/**
 * Joining Pass (HRMS) service — the gate pass a worker needs after an absence of
 * more than `min_absent_days` working days (default 3) before rejoining.
 *
 * Backend: vowerp3be src/hrms/joiningPass.py, mounted at /api/joiningPass (portal
 * persona, cookie auth). Every response is `{ data: ... }`; errors are 4xx/5xx with
 * `{ detail }`, which fetchWithCookie flattens into `error`. Each function throws
 * `Error(detail)` on failure so callers need one try/catch. Responses are parsed
 * with Zod (contract drift surfaces as a readable error, not a blank screen).
 *
 * The letter text is rendered by the server from the frozen pass figures and is
 * never edited by hand; the page only lays it out for print.
 */

import { z } from "zod";
import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

const R = apiRoutesPortalMasters;

// ─── Schemas ─────────────────────────────────────────────────────────

const nStr = z.string().nullable();
const nNum = z.number().nullable();

export const jpRuleSchema = z.object({
  min_absent_days: z.number().int(),
  lookback_days: z.number().int(),
  fortnight_days: z.number().int(),
});
export type JpRule = z.infer<typeof jpRuleSchema>;

const limitSchema = z.object({ min: z.number(), max: z.number() });

export const jpSetupSchema = z.object({
  rule: jpRuleSchema,
  rule_limits: z.object({
    min_absent_days: limitSchema,
    lookback_days: limitSchema,
    fortnight_days: limitSchema,
  }),
  depts: z.array(z.object({ dept_id: z.number(), dept_desc: nStr })),
  spells: z.array(z.object({ spell_id: z.number(), spell_code: nStr, shift_name: nStr })),
  authorities: z.array(z.string()),
  letterhead: z.object({ co_name: nStr, address: nStr }),
  today: z.string(),
  access_level: z.number(),
});
export type JpSetup = z.infer<typeof jpSetupSchema>;

export const jpLetterSchema = z.object({
  company_name: nStr,
  company_address: nStr,
  date: z.string(),
  eb_no: nStr,
  name: nStr,
  department: nStr,
  title: z.string(),
  paragraphs: z.array(z.string()),
  signature_label: z.string(),
  authorised_label: z.string(),
  manager_label: z.string(),
  issued_on: z.string(),
  pass_no: nStr,
});
export type JpLetter = z.infer<typeof jpLetterSchema>;

export const jpCheckSchema = z.object({
  eb_id: z.number(),
  emp_code: nStr,
  emp_name: nStr,
  dept_desc: nStr,
  sub_dept_desc: nStr,
  designation: nStr,
  category: nStr,
  separated: z.boolean(),
  join_date: z.string(),
  min_absent_days: z.number(),
  last_seen_date: nStr,
  last_attendance_date: nStr,
  last_spell_code: nStr,
  absent_from: nStr,
  absent_working_days: z.number(),
  absent_calendar_days: z.number(),
  pass_required: z.boolean(),
  existing_pass: z
    .object({ joining_pass_id: z.number(), pass_no: nStr, join_date: nStr, issue_date: nStr })
    .nullable(),
  fn_from: nStr,
  fn_to: nStr,
  fn_days_present: nNum,
  fn_working_days: nNum,
  fn_efficiency: nNum,
  fn_eff_dept: nStr,
  eff_note: nStr,
  la_case: z.object({ case_id: z.number(), case_no: nStr }).nullable(),
  note: z.string().optional(),
  letter: jpLetterSchema,
});
export type JpCheck = z.infer<typeof jpCheckSchema>;

export const jpAbsenteeSchema = z.object({
  eb_id: z.number(),
  emp_code: nStr,
  emp_name: nStr,
  dept_id: nNum,
  dept_desc: nStr,
  designation: nStr,
  category: nStr,
  last_seen_date: nStr,
  absent_from: nStr,
  absent_working_days: z.number(),
  absent_calendar_days: z.number(),
  joining_pass_id: nNum,
  pass_no: nStr,
  pass_join_date: nStr,
});
export type JpAbsentee = z.infer<typeof jpAbsenteeSchema>;

const jpAbsenteesSchema = z.object({
  as_on: z.string(),
  min_absent_days: z.number(),
  rows: z.array(jpAbsenteeSchema),
});

export const jpPassSchema = z.object({
  joining_pass_id: z.number(),
  pass_no: nStr,
  branch_id: z.number(),
  branch_name: nStr.optional(),
  eb_id: z.number(),
  emp_code: nStr,
  emp_name: nStr,
  dept_desc: nStr,
  designation: nStr,
  last_seen_date: nStr,
  absent_from: nStr,
  absent_working_days: z.number(),
  absent_calendar_days: z.number(),
  join_date: nStr,
  issue_date: nStr,
  absent_to: nStr,
  spell_id: nNum,
  spell_code: nStr,
  authority: nStr,
  fn_from: nStr,
  fn_to: nStr,
  fn_days_present: nNum,
  fn_working_days: nNum,
  fn_efficiency: nNum,
  la_case_id: nNum,
  remarks: nStr,
  active: z.number(),
  cancel_reason: nStr,
  issued_by_name: nStr,
});
export type JpPass = z.infer<typeof jpPassSchema>;

const jpPassWithLetterSchema = jpPassSchema.extend({ letter: jpLetterSchema });
export type JpPassWithLetter = z.infer<typeof jpPassWithLetterSchema>;

/** The issue form (Zod-validated before the POST). */
export const jpIssueFormSchema = z
  .object({
    joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Joining date is required"),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Issue date is required"),
    spellId: z.union([z.number().int(), z.literal("")]),
    authority: z.string().min(1, "Authority is required"),
    remarks: z.string().max(500, "At most 500 characters"),
  })
  .refine((v) => v.issueDate <= v.joinDate, {
    message: "The pass is issued on or before the joining date",
    path: ["issueDate"],
  });
export type JpIssueForm = z.infer<typeof jpIssueFormSchema>;

// ─── Plumbing ────────────────────────────────────────────────────────

/** Query string of the non-empty params (null / undefined / "" are dropped; 0 is kept). */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  return search.toString();
}

async function call<T>(schema: z.ZodType<T>, url: string, fallback: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetchWithCookie<unknown>(url, method, body);
  if (res.error) throw new Error(res.error);
  const payload = res.data;
  if (!payload || typeof payload !== "object" || !("data" in payload)) throw new Error(fallback);
  const parsed = schema.safeParse((payload as { data: unknown }).data);
  if (!parsed.success) throw new Error(`${fallback} (unexpected response)`);
  return parsed.data;
}

// ─── API ─────────────────────────────────────────────────────────────

export function fetchJpSetup(coId: number, branchId: number): Promise<JpSetup> {
  return call(jpSetupSchema, `${R.JPASS_SETUP}?${qs({ co_id: coId, branch_id: branchId })}`, "Failed to load the joining pass setup");
}

export interface JpCheckParams {
  coId: number;
  branchId: number;
  empCode?: string | null;
  ebId?: number | null;
  /** YYYY-MM-DD; server default = today (IST). */
  joinDate?: string | null;
}

/** The attendance criterion for one worker + the letter preview. */
export function checkJoiningPass(p: JpCheckParams): Promise<JpCheck> {
  return call(
    jpCheckSchema,
    `${R.JPASS_CHECK}?${qs({
      co_id: p.coId,
      branch_id: p.branchId,
      emp_code: p.empCode ?? undefined,
      eb_id: p.ebId ?? undefined,
      join_date: p.joinDate ?? undefined,
    })}`,
    "Failed to check the worker",
  );
}

export function fetchJpAbsentees(coId: number, branchId: number, asOn?: string | null, deptId?: number | null) {
  return call(
    jpAbsenteesSchema,
    `${R.JPASS_ABSENTEES}?${qs({ co_id: coId, branch_id: branchId, as_on: asOn ?? undefined, dept_id: deptId ?? undefined })}`,
    "Failed to load the absentees",
  );
}

export interface JpIssueBody {
  coId: number;
  branchId: number;
  ebId: number;
  joinDate: string;
  issueDate: string;
  spellId?: number | null;
  authority: string;
  remarks?: string | null;
}

export function issueJoiningPass(b: JpIssueBody): Promise<JpPassWithLetter> {
  return call(jpPassWithLetterSchema, R.JPASS_ISSUE, "Failed to issue the joining pass", "POST", {
    co_id: b.coId,
    branch_id: b.branchId,
    eb_id: b.ebId,
    join_date: b.joinDate,
    issue_date: b.issueDate,
    spell_id: b.spellId ?? null,
    authority: b.authority,
    remarks: b.remarks?.trim() || null,
  });
}

export interface JpListParams {
  coId: number;
  branchId: number;
  dateFrom?: string | null;
  dateTo?: string | null;
  search?: string | null;
  includeCancelled?: boolean;
}

export function fetchJpList(p: JpListParams): Promise<JpPass[]> {
  return call(
    z.array(jpPassSchema),
    `${R.JPASS_LIST}?${qs({
      co_id: p.coId,
      branch_id: p.branchId,
      date_from: p.dateFrom ?? undefined,
      date_to: p.dateTo ?? undefined,
      search: p.search ?? undefined,
      include_cancelled: p.includeCancelled ? 1 : undefined,
    })}`,
    "Failed to load the passes",
  );
}

export function fetchJpPass(coId: number, passId: number): Promise<JpPassWithLetter> {
  return call(jpPassWithLetterSchema, `${R.JPASS_GET}?${qs({ co_id: coId, joining_pass_id: passId })}`, "Failed to load the pass");
}

export function cancelJoiningPass(coId: number, passId: number, reason: string): Promise<JpPass> {
  return call(jpPassSchema, R.JPASS_CANCEL, "Failed to cancel the pass", "POST", {
    co_id: coId,
    joining_pass_id: passId,
    reason,
  });
}

export function saveJpRule(coId: number, branchId: number, rule: JpRule): Promise<JpRule> {
  return call(jpRuleSchema, R.JPASS_RULE_SAVE, "Failed to save the rule", "POST", {
    co_id: coId,
    branch_id: branchId,
    ...rule,
  });
}
