/**
 * Zod schemas + date rules for the Low Performer Follow-up forms.
 *
 * The date rules mirror what the backend enforces (it stays the authority):
 * start date required and not in the future, review date (if any) on or after
 * the start date. Schemas that depend on "today" are built by factories so the
 * server date from GET /setup can be plugged in.
 */

import { z } from "zod";
import { FOLLOWUP_DEPT_CODES } from "./constants";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Today's date in the browser's local zone, YYYY-MM-DD. */
export function localTodayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** DD-MM-YYYY for display; blank for null, the raw value if not a date. */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  const iso = value.slice(0, 10);
  if (!isIsoDate(iso)) return value;
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

export interface FieldIssue<P extends string> {
  path: P;
  message: string;
}

export interface FollowupDateFields {
  start_date: string;
  /** "" = no review date. */
  review_date: string;
}

/**
 * Start / review date problems of a follow-up form.
 *
 * @param latestStart  the start date may not move after this (earliest active
 *                     event date) — edit form only.
 */
export function followupFieldIssues(
  v: FollowupDateFields,
  today: string,
  latestStart?: string | null,
): FieldIssue<"start_date" | "review_date">[] {
  const issues: FieldIssue<"start_date" | "review_date">[] = [];
  const start = v.start_date.trim();
  const review = v.review_date.trim();
  if (!start) {
    issues.push({ path: "start_date", message: "Start date is required" });
  } else if (!isIsoDate(start)) {
    issues.push({ path: "start_date", message: "Enter a valid date" });
  } else if (start > today) {
    issues.push({ path: "start_date", message: "Start date cannot be in the future" });
  } else if (latestStart && start > latestStart) {
    issues.push({
      path: "start_date",
      message: `Start date cannot be after the first entry (${fmtDate(latestStart)})`,
    });
  }
  if (review) {
    if (!isIsoDate(review)) {
      issues.push({ path: "review_date", message: "Enter a valid date" });
    } else if (start && isIsoDate(start) && review < start) {
      issues.push({ path: "review_date", message: "Review date cannot be before the start date" });
    }
  }
  return issues;
}

export const REASON_MAX = 500;

/** Add-person form. dept_code "" = not picked yet. */
export function makeAddFollowupSchema(today: string) {
  return z
    .object({
      eb_no: z.string().trim().min(1, "EB No is required").max(30, "EB No is too long"),
      dept_code: z.union([z.enum(FOLLOWUP_DEPT_CODES), z.literal("")]),
      reason: z.string().max(REASON_MAX, `Reason cannot exceed ${REASON_MAX} characters`),
      start_date: z.string(),
      review_date: z.string(),
    })
    .superRefine((v, ctx) => {
      if (v.dept_code === "") {
        ctx.addIssue({ code: "custom", path: ["dept_code"], message: "Department is required" });
      }
      for (const issue of followupFieldIssues(v, today)) {
        ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
      }
    });
}

export type AddFollowupFormValues = z.infer<ReturnType<typeof makeAddFollowupSchema>>;
