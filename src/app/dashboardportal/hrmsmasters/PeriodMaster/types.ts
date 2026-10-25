/**
 * Types and Zod schemas for the Period Master.
 * Single type file for the page — do not split (avoids circular deps).
 */
import { z } from "zod";

export const FREQUENCIES = ["FORTNIGHTLY", "MONTHLY", "WEEKLY", "CUSTOM"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_OPTIONS = Object.freeze([
  { value: "FORTNIGHTLY", label: "Fortnightly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "CUSTOM", label: "Custom" },
] as const);

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export const WEEKDAY_OPTIONS = Object.freeze([
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
] as const);

/** One slot of a period type (splits the month). to_day null = month end. */
export interface SlotInput {
  slot_no: number;
  slot_name: string;
  slot_code: string;
  from_day: number;
  from_prev_month: number;
  to_day: number | null;
}

export const slotSchema = z.object({
  slot_no: z.number().int().min(1),
  slot_name: z.string().trim().min(1, "Slot name is required").max(50, "Max 50 characters"),
  slot_code: z.string().trim().min(1, "Code is required").max(10, "Max 10 characters"),
  from_day: z.number({ error: "Required" }).int().min(1, "1–31").max(31, "1–31"),
  from_prev_month: z.number().int().min(0).max(1),
  to_day: z.number().int().min(1, "1–31").max(31, "1–31").nullable(),
});

export const periodTypeFormSchema = z
  .object({
    period_type_name: z.string().trim().min(1, "Name is required").max(100, "Max 100 characters"),
    frequency: z.enum(FREQUENCIES),
    week_start_day: z.number().int().min(1).max(7).nullable(),
    remarks: z.string().max(255, "Max 255 characters"),
    active: z.boolean(),
    slots: z.array(slotSchema),
  })
  .superRefine((v, ctx) => {
    if (v.frequency === "WEEKLY" && v.week_start_day == null) {
      ctx.addIssue({ code: "custom", path: ["week_start_day"], message: "Week start day is required" });
    }
    if (v.frequency !== "WEEKLY" && v.slots.length === 0) {
      ctx.addIssue({ code: "custom", path: ["slots"], message: "At least one slot is required" });
    }
  });

export type PeriodTypeFormValues = z.infer<typeof periodTypeFormSchema>;

export const periodEditSchema = z
  .object({
    period_name: z.string().trim().min(1, "Name is required").max(100, "Max 100 characters"),
    from_date: z.string().min(1, "From date is required"),
    to_date: z.string().min(1, "To date is required"),
    active: z.boolean(),
  })
  .refine((v) => v.to_date >= v.from_date, {
    path: ["to_date"],
    message: "To date must not be before From date",
  });

export type PeriodEditFormValues = z.infer<typeof periodEditSchema>;

/** A row of GET /hrmsMasters/get_period_type_table. */
export interface PeriodTypeRow {
  id?: number;
  period_type_id: number;
  co_id: number;
  branch_id: number;
  branch_name: string;
  period_type_name: string;
  frequency: Frequency;
  week_start_day: number | null;
  remarks: string | null;
  active: number | boolean;
  slot_summary: string;
  period_count: number;
  [key: string]: unknown;
}

export interface PeriodTypeSlotRecord extends SlotInput {
  period_type_slot_id: number;
}

/** GET /hrmsMasters/get_period_type_by_id/{id}. */
export interface PeriodTypeRecord {
  period_type_id: number;
  co_id: number;
  branch_id: number;
  period_type_name: string;
  frequency: Frequency;
  week_start_day: number | null;
  remarks: string | null;
  active: number | boolean;
  period_count: number;
  rules_locked: boolean;
  slots: PeriodTypeSlotRecord[];
}

/** A row of GET /hrmsMasters/get_period_table. */
export interface PeriodRow {
  id?: number;
  period_id: number;
  period_type_id: number;
  period_type_slot_id: number | null;
  period_year: number;
  period_month: number;
  period_no: number;
  period_code: string;
  period_name: string;
  from_date: string;
  to_date: string;
  active: number | boolean;
  [key: string]: unknown;
}

export interface PeriodGenerateResult {
  message: string;
  created: number;
  skipped: number;
  conflicts: string[];
}

/** Preset slots loaded when a frequency is chosen on create. */
export function presetSlots(freq: Frequency): SlotInput[] {
  if (freq === "FORTNIGHTLY") {
    return [
      { slot_no: 1, slot_name: "1st Fortnight", slot_code: "F1", from_day: 1, from_prev_month: 0, to_day: 15 },
      { slot_no: 2, slot_name: "2nd Fortnight", slot_code: "F2", from_day: 16, from_prev_month: 0, to_day: null },
    ];
  }
  if (freq === "MONTHLY") {
    return [{ slot_no: 1, slot_name: "Month", slot_code: "M", from_day: 1, from_prev_month: 0, to_day: null }];
  }
  if (freq === "CUSTOM") {
    return [{ slot_no: 1, slot_name: "Period 1", slot_code: "P1", from_day: 1, from_prev_month: 0, to_day: null }];
  }
  return [];
}
