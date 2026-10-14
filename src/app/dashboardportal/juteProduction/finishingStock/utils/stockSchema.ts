import { z } from "zod";
import { backdateMessage, isBeyondBackdateWindow } from "@/utils/backdate";
import type {
  FinishingStockBucket,
  FinishingStockCreatePayload,
  FinishingStockEditPayload,
  FinishingStockWorkBy,
} from "@/utils/finishingStockService";
import { todayISO } from "./stockCalc";

/** Mirrors FINISHING_STOCK_QTY_MAX / _WT_MAX in src/juteProduction/constants.py. */
export const QTY_MAX = 999_999;
export const WT_MAX = 999_999;
export const REMARKS_MAX = 255;
export const BALE_QTY_UOM = "BALE";
export const DEFAULT_LOOSE_UOM = "CUTS";

/** Local-date compare (todayISO) — new Date().toISOString() reads the UTC date,
 * which is still "yesterday" in IST before 05:30 and would reject the form's
 * own default tran_date. */
function isFutureISODate(value: string): boolean {
  return value > todayISO();
}

function isNumeric(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

export interface FinishingStockSchemaOptions {
  /** BALE_PROD mode: own-company bales are derived from Bale Production, so a
   * BALE line must name another owner — a blank owner (= own company) is an
   * error instead of the default. */
  ownerRequired?: boolean;
}

/**
 * Build the form schema for the page's bale mode. The MANUAL-mode schema
 * (`finishingStockSchema`) is unchanged; `ownerRequired` only adds the owner
 * check for BALE lines.
 */
export const buildFinishingStockSchema = (
  { ownerRequired = false }: FinishingStockSchemaOptions = {},
) =>
  z
    .object({
      tran_date: z
        .string()
        .min(1, "Date is required")
        .refine((v) => !isFutureISODate(v), { message: "Date cannot be in the future" })
        .refine((v) => !isBeyondBackdateWindow(v), { message: backdateMessage("Date") }),
      bucket: z.enum(["BALE", "LOOSE"]),
      finishing_quality_id: z.string().min(1, "Quality is required"),
      // Every bucket-specific field defaults to "": react-hook-form drops the
      // values of Controllers that are unmounted at submit time, so the half of
      // the form the current bucket does not render arrives as undefined. Without
      // the default, zod rejects it as "expected string, received undefined" on a
      // field that has no error UI (it is not on screen) — Save Line then does
      // nothing at all, silently. buildBody() nulls the inactive half anyway.
      /** BALE only — "" means own company. */
      owner_co_id: z.string().default(""),
      /** LOOSE only — "" means no stage. */
      stage: z.string().default(""),
      work_by: z.string().default("0"),
      qty: z.string().default(""),
      qty_uom: z.string().default(""),
      wt_per_unit_kg: z.string().default(""),
      wt_kg: z.string().default(""),
      remarks: z.string().max(REMARKS_MAX, `Remarks cannot exceed ${REMARKS_MAX} characters`),
    })
    .superRefine((values, ctx) => {
      const bale = values.bucket === "BALE";
      const qty = Number(values.qty);

      if (!isNumeric(values.qty)) {
        ctx.addIssue({
          code: "custom",
          path: ["qty"],
          message: bale ? "Bales is required" : "Count is required",
        });
      } else if (bale && qty <= 0) {
        ctx.addIssue({ code: "custom", path: ["qty"], message: "Must be greater than 0" });
      } else if (!bale && qty < 0) {
        ctx.addIssue({ code: "custom", path: ["qty"], message: "Cannot be negative" });
      } else if (qty > QTY_MAX) {
        ctx.addIssue({ code: "custom", path: ["qty"], message: `Cannot exceed ${QTY_MAX}` });
      }

      if (bale) {
        if (ownerRequired && values.owner_co_id.trim() === "") {
          ctx.addIssue({
            code: "custom",
            path: ["owner_co_id"],
            message: "Owner company is required",
          });
        }
        if (!isNumeric(values.wt_per_unit_kg)) {
          ctx.addIssue({
            code: "custom",
            path: ["wt_per_unit_kg"],
            message: "Per-bale weight required",
          });
        } else if (Number(values.wt_per_unit_kg) <= 0) {
          ctx.addIssue({
            code: "custom",
            path: ["wt_per_unit_kg"],
            message: "Must be greater than 0",
          });
        } else if (Number(values.wt_per_unit_kg) > WT_MAX) {
          ctx.addIssue({
            code: "custom",
            path: ["wt_per_unit_kg"],
            message: `Cannot exceed ${WT_MAX} kg`,
          });
        }
        return;
      }

      if (values.qty_uom.trim() === "") {
        ctx.addIssue({ code: "custom", path: ["qty_uom"], message: "UoM is required" });
      }
      if (!isNumeric(values.wt_kg)) {
        ctx.addIssue({ code: "custom", path: ["wt_kg"], message: "Weight (kg) is required" });
      } else if (Number(values.wt_kg) < 0) {
        ctx.addIssue({ code: "custom", path: ["wt_kg"], message: "Cannot be negative" });
      } else if (Number(values.wt_kg) > WT_MAX) {
        ctx.addIssue({ code: "custom", path: ["wt_kg"], message: `Cannot exceed ${WT_MAX} kg` });
      }
    });

/** The MANUAL-mode schema — "" owner means the own company. */
export const finishingStockSchema = buildFinishingStockSchema();

/** Parsed values — what the resolver hands `onSubmit`; every field is a string. */
export type FinishingStockFormValues = z.infer<typeof finishingStockSchema>;

/** What the form itself holds. The bucket-specific halves are optional here
 * because react-hook-form drops unmounted Controllers' values on submit; the
 * defaults above put them back before anything reads them. */
export type FinishingStockFormInput = z.input<typeof finishingStockSchema>;

export function buildDefaultFormValues(
  tranDate: string,
  bucket: FinishingStockBucket = "BALE",
): FinishingStockFormValues {
  return {
    tran_date: tranDate,
    bucket,
    finishing_quality_id: "",
    owner_co_id: "",
    stage: "",
    work_by: "0",
    qty: bucket === "LOOSE" ? "0" : "",
    qty_uom: bucket === "LOOSE" ? DEFAULT_LOOSE_UOM : BALE_QTY_UOM,
    wt_per_unit_kg: "",
    wt_kg: "",
    remarks: "",
  };
}

/** Everything both create and edit send — the bucket decides which half of the
 * form reaches the API; the other half is nulled so a bucket switch can never
 * smuggle stale values through (the backend rejects them with a 400 anyway). */
function buildBody(
  values: FinishingStockFormValues,
  coId: number | null,
): FinishingStockEditPayload {
  const remarks = values.remarks.trim();
  const common = {
    bucket: values.bucket,
    finishing_quality_id: Number(values.finishing_quality_id),
    qty: Number(values.qty),
    remarks: remarks === "" ? null : remarks,
  };

  if (values.bucket === "BALE") {
    const owner = values.owner_co_id === "" ? null : Number(values.owner_co_id);
    return {
      ...common,
      stage: null,
      work_by: 0,
      // The own company is stored as NULL (the backend normalises too).
      owner_co_id: owner != null && coId != null && owner === coId ? null : owner,
      qty_uom: BALE_QTY_UOM,
      wt_per_unit_kg: Number(values.wt_per_unit_kg),
      wt_kg: null,
    };
  }

  return {
    ...common,
    stage: values.stage === "" ? null : values.stage,
    work_by: (Number(values.work_by) === 1 ? 1 : 0) as FinishingStockWorkBy,
    owner_co_id: null,
    qty_uom: values.qty_uom,
    wt_per_unit_kg: null,
    wt_kg: Number(values.wt_kg),
  };
}

export function buildCreatePayload(
  values: FinishingStockFormValues,
  ctx: { coId: number; branchId: number },
): FinishingStockCreatePayload {
  return {
    co_id: ctx.coId,
    branch_id: ctx.branchId,
    tran_date: values.tran_date,
    ...buildBody(values, ctx.coId),
  };
}

export function buildEditPayload(
  values: FinishingStockFormValues,
): FinishingStockEditPayload {
  // No coId in scope here: the backend normalises owner_co_id == co_id to NULL.
  return buildBody(values, null);
}
