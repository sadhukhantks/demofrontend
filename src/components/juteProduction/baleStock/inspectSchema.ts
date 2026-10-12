import { z } from "zod";
import { backdateMessage, isBeyondBackdateWindow } from "@/utils/backdate";
import type { MarkInspectedPayload } from "@/utils/baleStockService";
import { todayISO } from "./baleStockCalc";

/**
 * Zod schema for the "Mark inspected" form — shared by `MarkInspectedDialog`
 * (page selection) and `BaleInspectQuickDialog` (opened from Finishing Stock)
 * so both validate identically. Limits mirror BALE_INSPECTION_REF_MAX /
 * BALE_INSPECTION_INSPECTOR_MAX and the 255-char remarks column
 * (vowerp3be src/juteProduction/constants.py, spec §2).
 */

export const INSPECTION_REF_MAX = 100;
export const INSPECTOR_MAX = 100;
export const INSPECTION_REMARKS_MAX = 255;

export const inspectSchema = z.object({
  inspection_date: z
    .string()
    .min(1, "Inspection date is required")
    // Local-date compare: `new Date().toISOString()` is the UTC date, which is
    // still "yesterday" in IST before 05:30 and would reject the default.
    .refine((v) => v <= todayISO(), { message: "Inspection date cannot be in the future" })
    .refine((v) => !isBeyondBackdateWindow(v), { message: backdateMessage("Inspection date") }),
  inspection_ref: z
    .string()
    .max(INSPECTION_REF_MAX, `Reference cannot exceed ${INSPECTION_REF_MAX} characters`),
  inspector: z.string().max(INSPECTOR_MAX, `Inspector cannot exceed ${INSPECTOR_MAX} characters`),
  remarks: z
    .string()
    .max(INSPECTION_REMARKS_MAX, `Remarks cannot exceed ${INSPECTION_REMARKS_MAX} characters`),
});

export type InspectFormValues = z.infer<typeof inspectSchema>;

export function inspectDefaults(date: string = todayISO()): InspectFormValues {
  return { inspection_date: date, inspection_ref: "", inspector: "", remarks: "" };
}

function textOrNull(value: string): string | null {
  const t = value.trim();
  return t === "" ? null : t;
}

/** POST /baleStock/inspect body from validated values + the selection. */
export function buildInspectPayload(
  values: InspectFormValues,
  ctx: { coId: number; branchId: number; baleEntryIds: ReadonlyArray<number> },
): MarkInspectedPayload {
  return {
    co_id: ctx.coId,
    branch_id: ctx.branchId,
    bale_entry_ids: [...ctx.baleEntryIds],
    inspection_date: values.inspection_date,
    inspection_ref: textOrNull(values.inspection_ref),
    inspector: textOrNull(values.inspector),
    remarks: textOrNull(values.remarks),
  };
}
