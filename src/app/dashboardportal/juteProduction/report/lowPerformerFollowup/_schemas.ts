/**
 * Zod schemas of the follow-up detail forms (edit, close, timeline entries,
 * performance window). Each mirrors the backend's obvious rules; the backend
 * stays the authority and its errors are shown inline in the dialogs.
 */

import { z } from "zod";
import {
  noticeFileProblem,
  type FollowupEventType,
  type FollowupSpell,
  type FollowupEvent,
} from "@/utils/lowPerformerFollowupService";
import {
  REASON_MAX,
  fmtDate,
  followupFieldIssues,
  isIsoDate,
  type FieldIssue,
} from "@/components/lowPerformerFollowup/schemas";
import { spellLabel } from "@/components/lowPerformerFollowup/constants";
import { fmtHours, hoursAlreadyCut } from "./_utils";

export const REMARKS_MAX = 1000;
export const ISSUED_BY_MAX = 100;

// ─── Edit follow-up ──────────────────────────────────────────────────

export function makeEditFollowupSchema(today: string, latestStart: string | null) {
  return z
    .object({
      reason: z.string().max(REASON_MAX, `Reason cannot exceed ${REASON_MAX} characters`),
      start_date: z.string(),
      review_date: z.string(),
    })
    .superRefine((v, ctx) => {
      for (const issue of followupFieldIssues(v, today, latestStart)) {
        ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
      }
    });
}

export type EditFollowupFormValues = z.infer<ReturnType<typeof makeEditFollowupSchema>>;

// ─── Close follow-up ─────────────────────────────────────────────────

/**
 * @param lastEntryDate  latest active timeline entry — the closed date may not be
 *                       before it (backend rule, mirrored for a friendly message).
 */
export function makeCloseFollowupSchema(startDate: string, today: string, lastEntryDate: string | null = null) {
  return z
    .object({
      closed_date: z.string(),
      close_reason: z.string().min(1, "Close reason is required"),
      // close_remarks is VARCHAR(500) like the reason (backend MAX_REASON).
      close_remarks: z.string().max(REASON_MAX, `Remarks cannot exceed ${REASON_MAX} characters`),
    })
    .superRefine((v, ctx) => {
      const issue =
        dateInWindowIssue(v.closed_date, startDate, today, "Closed date") ??
        (lastEntryDate && v.closed_date.trim() < lastEntryDate
          ? `Closed date cannot be before the last entry (${fmtDate(lastEntryDate)})`
          : null);
      if (issue) ctx.addIssue({ code: "custom", path: ["closed_date"], message: issue });
    });
}

export type CloseFollowupFormValues = z.infer<ReturnType<typeof makeCloseFollowupSchema>>;

/** Problem with a date that must lie between the start date and today, else null. */
export function dateInWindowIssue(
  value: string,
  startDate: string,
  today: string,
  what: string,
): string | null {
  const d = value.trim();
  if (!d) return `${what} is required`;
  if (!isIsoDate(d)) return "Enter a valid date";
  if (d > today) return `${what} cannot be in the future`;
  if (d < startDate) return `${what} cannot be before the start date (${fmtDate(startDate)})`;
  return null;
}

// ─── Timeline entry (remark / notice / hour cut) ─────────────────────

export interface EventFormValues {
  event_date: string;
  /** NOTICE only; "" = not picked. */
  notice_type: string;
  issued_by: string;
  /** HOURS_CUT only. */
  spell_id: number | null;
  /** HOURS_CUT only — kept as typed text, parsed on validation. */
  hours_cut: string;
  /** REMARK: the remark; NOTICE: optional note; HOURS_CUT: the reason. */
  remarks: string;
  /** NOTICE create only: scan uploaded after the event is saved. */
  file: File | null;
}

export interface EventFormContext {
  eventType: FollowupEventType;
  startDate: string;
  today: string;
  spells: ReadonlyArray<FollowupSpell>;
  /** The follow-up's active events, for the per date + spell hour-cut cap. */
  events: ReadonlyArray<FollowupEvent>;
  /** The event being edited (excluded from the cap), null on create. */
  editingId: number | null;
}

type EventField = keyof EventFormValues;

/** Parses the typed hours; null when blank / not a number. */
export function parseHours(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** All problems of a timeline entry, per field. */
export function eventFormIssues(v: EventFormValues, ctx: EventFormContext): FieldIssue<EventField>[] {
  const issues: FieldIssue<EventField>[] = [];
  const add = (path: EventField, message: string) => issues.push({ path, message });

  const dateIssue = dateInWindowIssue(v.event_date, ctx.startDate, ctx.today, "Date");
  if (dateIssue) add("event_date", dateIssue);

  const remarks = v.remarks.trim();
  if (remarks.length > REMARKS_MAX) add("remarks", `Cannot exceed ${REMARKS_MAX} characters`);

  if (ctx.eventType === "REMARK") {
    if (!remarks) add("remarks", "Remark is required");
  } else if (ctx.eventType === "NOTICE") {
    if (!v.notice_type) add("notice_type", "Notice type is required");
    if (v.issued_by.trim().length > ISSUED_BY_MAX) {
      add("issued_by", `Cannot exceed ${ISSUED_BY_MAX} characters`);
    }
    if (v.file) {
      const problem = noticeFileProblem(v.file);
      if (problem) add("file", problem);
    }
  } else {
    if (!remarks) add("remarks", "Reason is required");
    const spell = v.spell_id == null ? undefined : ctx.spells.find((s) => s.spell_id === v.spell_id);
    if (v.spell_id == null) add("spell_id", "Spell is required");
    else if (!spell) add("spell_id", "Pick a spell of this branch");
    const hours = parseHours(v.hours_cut);
    if (hours == null) {
      add("hours_cut", "Hours cut is required");
    } else if (hours <= 0) {
      add("hours_cut", "Hours cut must be more than 0");
    } else if (spell && spell.working_hours != null) {
      if (hours > spell.working_hours) {
        add("hours_cut", `Cannot exceed the spell's ${fmtHours(spell.working_hours)} h`);
      } else if (!dateIssue) {
        const already = hoursAlreadyCut(ctx.events, v.event_date, spell.spell_id, ctx.editingId);
        if (already + hours > spell.working_hours) {
          const left = Math.max(0, spell.working_hours - already);
          add(
            "hours_cut",
            `${fmtHours(already)} h already cut in ${spellLabel(spell)} on ${fmtDate(v.event_date)} — at most ${fmtHours(left)} h more`,
          );
        }
      }
    }
  }
  return issues;
}

export function makeEventSchema(ctx: EventFormContext) {
  return z
    .object({
      event_date: z.string(),
      notice_type: z.string(),
      issued_by: z.string(),
      spell_id: z.number().int().nullable(),
      hours_cut: z.string(),
      remarks: z.string(),
      file: z.custom<File | null>(
        (value) => value === null || (typeof File !== "undefined" && value instanceof File),
        "Pick a file",
      ),
    })
    .superRefine((v, zctx) => {
      for (const issue of eventFormIssues(v, ctx)) {
        zctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
      }
    });
}

/** The event fields of the create / update payload; fields of other types are null. */
export function eventPayloadFields(
  v: EventFormValues,
  eventType: FollowupEventType,
): {
  event_date: string;
  notice_type: string | null;
  issued_by: string | null;
  spell_id: number | null;
  hours_cut: number | null;
  remarks: string | null;
} {
  const remarks = v.remarks.trim() || null;
  return {
    event_date: v.event_date.trim(),
    notice_type: eventType === "NOTICE" ? v.notice_type || null : null,
    issued_by: eventType === "NOTICE" ? v.issued_by.trim() || null : null,
    spell_id: eventType === "HOURS_CUT" ? v.spell_id : null,
    hours_cut: eventType === "HOURS_CUT" ? parseHours(v.hours_cut) : null,
    remarks,
  };
}

/** Form defaults: a new entry dated today, or the event being edited. */
export function eventFormDefaults(event: FollowupEvent | null, today: string): EventFormValues {
  if (!event) {
    return {
      event_date: today,
      notice_type: "",
      issued_by: "",
      spell_id: null,
      hours_cut: "",
      remarks: "",
      file: null,
    };
  }
  return {
    event_date: event.event_date,
    notice_type: event.notice_type ?? "",
    issued_by: event.issued_by ?? "",
    spell_id: event.spell_id,
    hours_cut: event.hours_cut != null ? fmtHours(event.hours_cut) : "",
    remarks: event.remarks ?? "",
    file: null,
  };
}

// ─── Performance window ──────────────────────────────────────────────

/** From / To filter: both blank (server default) or both valid with From <= To. */
export const perfWindowSchema = z
  .object({ from: z.string(), to: z.string() })
  .superRefine((v, ctx) => {
    const from = v.from.trim();
    const to = v.to.trim();
    if (!from && !to) return;
    if (!from || !to) {
      ctx.addIssue({
        code: "custom",
        path: [from ? "to" : "from"],
        message: "Enter both dates, or leave both blank",
      });
      return;
    }
    if (!isIsoDate(from)) ctx.addIssue({ code: "custom", path: ["from"], message: "Enter a valid date" });
    if (!isIsoDate(to)) ctx.addIssue({ code: "custom", path: ["to"], message: "Enter a valid date" });
    if (isIsoDate(from) && isIsoDate(to) && from > to) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "To date cannot be before From date" });
    }
  });
