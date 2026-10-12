import { z } from "zod";

/**
 * TKT-000206 — why the Batch Cost Report's planned weight is 0.
 *
 * The backend returns `plan_status` beside the rows: whether a batch plan was
 * assigned for the As of Date (only Open/Approved assignments count), which
 * issued yarn qualities had none, and earlier days of the month with unplanned
 * issues. `messages` is ready to show; the page renders each as an Alert.
 */
const planMessageSchema = z.object({
  severity: z.enum(["warning", "info"]),
  text: z.string(),
});

const planStatusSchema = z.object({
  day_has_issue: z.boolean(),
  day_has_plan: z.boolean(),
  day_unplanned_yarns: z.array(
    z.object({
      yarn_type_id: z.number().nullable(),
      yarn_type_name: z.string().nullable(),
      weight: z.number(),
      assignment: z.enum(["none", "draft", "pending"]),
    }),
  ),
  mtd_unplanned_days: z.array(z.string()),
  messages: z.array(planMessageSchema),
});

export type BatchPlanMessage = z.infer<typeof planMessageSchema>;
export type BatchPlanStatus = z.infer<typeof planStatusSchema>;

/** The plan status from an API payload, or null when it is missing or
 * malformed (an older backend) — the report itself still renders. */
export function parseBatchPlanStatus(value: unknown): BatchPlanStatus | null {
  const parsed = planStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Messages to show for a plan status (none when it is unknown). */
export function planMessages(status: BatchPlanStatus | null): BatchPlanMessage[] {
  return status?.messages ?? [];
}
