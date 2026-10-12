import { z } from "zod";
import { backdateMessage, isBeyondBackdateWindow } from "@/utils/backdate";
import type { FieldErrors } from "react-hook-form";
import type { LinkInvoicePayload } from "@/utils/baleStockService";
import { todayISO } from "./baleStockCalc";

/**
 * Zod schema for the "Mark despatched / Link to invoice" form — shared by
 * `LinkInvoiceDialog` (page selection) and `BaleDespatchQuickDialog` (opened
 * from Finishing Stock) so both validate identically.
 *
 * Two modes (spec §7b): **INVOICE** links the bales to a sales invoice (the
 * invoice is required, the despatch date defaults to the invoice date);
 * **NO_INVOICE** marks them despatched on a challan / delivery order /
 * transfer / sample (reason and despatch date required, invoice null — the
 * invoice can be linked later). The fields are kept flat and the mode rule
 * lives in a `superRefine`, so react-hook-form sees one plain object type.
 *
 * The despatch date may not be in the future; "not before the last press date
 * of the selection" is the input's `min` plus the server's own check.
 */

/** How far back the invoice picker looks from the as-on date. */
export const INVOICE_WINDOW_DAYS = 365;
export const LINK_REMARKS_MAX = 255;
/** Mirrors BALE_DESPATCH_REF_MAX (vowerp3be src/juteProduction/constants.py). */
export const DESPATCH_REF_MAX = 100;

export const DESPATCH_MODES = ["INVOICE", "NO_INVOICE"] as const;
export type DespatchMode = (typeof DESPATCH_MODES)[number];

export const linkSchema = z
  .object({
    mode: z.enum(DESPATCH_MODES),
    /**
     * Invoice id as a string ("" = none) — INVOICE mode only. Optional because
     * the picker is NOT rendered in NO_INVOICE mode and react-hook-form then
     * reports the unmounted field as `undefined`; a plain `z.string()` here
     * rejected every "Without invoice" save with no visible error (2026-10-12).
     */
    invoice_id: z.string().optional(),
    /** `BaleDespatchReason.code` ("" = none) — NO_INVOICE mode only; optional for the same reason. */
    despatch_reason: z.string().optional(),
    despatch_ref: z
      .string()
      .max(DESPATCH_REF_MAX, `Reference no cannot exceed ${DESPATCH_REF_MAX} characters`),
    despatch_date: z
      .string()
      .min(1, "Despatch date is required")
      // Local-date compare: `new Date().toISOString()` is the UTC date, which is
      // still "yesterday" in IST before 05:30 and would reject the default.
      .refine((v) => v <= todayISO(), { message: "Despatch date cannot be in the future" })
      .refine((v) => !isBeyondBackdateWindow(v), { message: backdateMessage("Despatch date") }),
    remarks: z.string().max(LINK_REMARKS_MAX, `Remarks cannot exceed ${LINK_REMARKS_MAX} characters`),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "INVOICE" && (v.invoice_id ?? "").trim() === "") {
      ctx.addIssue({ code: "custom", path: ["invoice_id"], message: "Pick an invoice" });
    }
    if (v.mode === "NO_INVOICE" && (v.despatch_reason ?? "").trim() === "") {
      ctx.addIssue({ code: "custom", path: ["despatch_reason"], message: "Pick a reason" });
    }
  });

export type LinkFormValues = z.infer<typeof linkSchema>;

/** Blank form dated `date` (the as-on day, capped at today by the callers), in `mode`. */
export function linkDefaults(date: string = todayISO(), mode: DespatchMode = "INVOICE"): LinkFormValues {
  return { mode, invoice_id: "", despatch_reason: "", despatch_ref: "", despatch_date: date, remarks: "" };
}

function textOrNull(value: string): string | null {
  const t = value.trim();
  return t === "" ? null : t;
}

/**
 * POST /baleStock/despatch body from validated values + the selection.
 * INVOICE mode sends the invoice id and no reason; NO_INVOICE mode sends
 * `invoice_id: null` with the reason code. The reference no and remarks go
 * either way, blanked to null.
 */
export function buildLinkPayload(
  values: LinkFormValues,
  ctx: { coId: number; branchId: number; baleEntryIds: ReadonlyArray<number> },
): LinkInvoicePayload {
  const noInvoice = values.mode === "NO_INVOICE";
  return {
    co_id: ctx.coId,
    branch_id: ctx.branchId,
    bale_entry_ids: [...ctx.baleEntryIds],
    invoice_id: noInvoice ? null : Number(values.invoice_id ?? ""),
    despatch_date: values.despatch_date,
    despatch_reason: noInvoice ? (values.despatch_reason ?? "") : null,
    despatch_ref: textOrNull(values.despatch_ref),
    remarks: textOrNull(values.remarks),
  };
}

const FIELD_LABELS: Record<keyof LinkFormValues, string> = {
  mode: "Mode",
  invoice_id: "Invoice",
  despatch_reason: "Reason",
  despatch_ref: "Reference no",
  despatch_date: "Despatch date",
  remarks: "Remarks",
};

/**
 * One readable line for the dialog's error Alert when react-hook-form refuses
 * to submit — "Cannot save: Despatch date — Despatch date is required". A
 * silent refusal (no request, dialog still open) is exactly what the owner
 * hit on 2026-10-12, so an invalid submission must always say why.
 */
export function describeLinkErrors(errors: FieldErrors<LinkFormValues>): string {
  const parts = (Object.keys(FIELD_LABELS) as Array<keyof LinkFormValues>)
    .filter((k) => errors[k])
    .map((k) => `${FIELD_LABELS[k]} — ${errors[k]?.message ?? "invalid"}`);
  return parts.length ? `Cannot save: ${parts.join("; ")}` : "Cannot save: please check the highlighted fields";
}
