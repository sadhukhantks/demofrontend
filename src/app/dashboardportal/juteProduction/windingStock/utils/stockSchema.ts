import { z } from "zod";
import {
  STOCK_LOCATIONS,
  type WindingStockCreatePayload,
  type WindingStockEditPayload,
} from "@/utils/windingStockService";
import { todayISO } from "./stockCalc";

export const MAX_SAMPLES = 1_000_000;
export const MAX_WT = 2000;

function isFutureISODate(value: string): boolean {
  // Local-date compare (todayISO), not new Date().toISOString() — that reads
  // the UTC date, which is still "yesterday" in IST before 05:30, failing the
  // form's own default tran_date against its own validation.
  return value > todayISO();
}

export const windingStockSchema = z
  .object({
    tran_date: z
      .string()
      .min(1, "Date is required")
      .refine((v) => !isFutureISODate(v), { message: "Date cannot be in the future" }),
    bucket: z.string().min(1, "Bucket is required"),
    // Blank is legitimate: BEAM ON FLOOR and the waste lines have no yarn master row.
    item_id: z.string(),
    package_label: z
      .string()
      .min(1, "Package / description is required")
      .max(60, "Cannot exceed 60 characters"),
    wastage_area_id: z.string(),
    // Where the counted yarn sits (yarn-purchase design §3.3). Every line counted
    // before the column existed is FLOOR, so that is the default for a new line.
    stock_loc: z.enum(STOCK_LOCATIONS).default("FLOOR"),
    // Department for a FLOOR line — optional. Held as a number (not the string
    // the other pickers use) because the payload sends it as-is and null must
    // survive the round trip untouched. Godown lines never carry one.
    dept_id: z.number().int().nullable().default(null),
    no_of_samples: z
      .string()
      .min(1, "Number of samples is required")
      .refine((v) => Number.isFinite(Number(v)), { message: "Must be a number" })
      .refine((v) => Number(v) > 0, { message: "Must be greater than 0" })
      .refine((v) => Number(v) <= MAX_SAMPLES, { message: `Cannot exceed ${MAX_SAMPLES}` }),
    wt_per_sample: z
      .string()
      .min(1, "Weight per sample is required")
      .refine((v) => Number.isFinite(Number(v)), { message: "Must be a number" })
      .refine((v) => Number(v) > 0, { message: "Must be greater than 0" })
      .refine((v) => Number(v) <= MAX_WT, { message: `Cannot exceed ${MAX_WT} kg` }),
    remarks: z.string().max(255, "Remarks cannot exceed 255 characters"),
  })
  .refine((v) => v.stock_loc !== "GODOWN" || v.dept_id == null, {
    path: ["dept_id"],
    message: "A godown line has no department",
  });

/** Parsed values — what the resolver hands `onSubmit`. */
export type WindingStockFormValues = z.infer<typeof windingStockSchema>;

/** What the form itself holds: the defaulted fields are optional here. */
export type WindingStockFormInput = z.input<typeof windingStockSchema>;

export function buildDefaultFormValues(tranDate: string): WindingStockFormValues {
  return {
    tran_date: tranDate,
    bucket: "MILL_USE",
    item_id: "",
    package_label: "",
    wastage_area_id: "",
    stock_loc: "FLOOR",
    dept_id: null,
    no_of_samples: "",
    wt_per_sample: "",
    remarks: "",
  };
}

/** The department to send: a godown line never carries one, whatever the form held. */
function deptForPayload(values: WindingStockFormValues): number | null {
  return values.stock_loc === "GODOWN" ? null : values.dept_id;
}

export function buildCreatePayload(
  values: WindingStockFormValues,
  coId: number,
  branchId: number,
): WindingStockCreatePayload {
  return {
    co_id: coId,
    branch_id: branchId,
    tran_date: values.tran_date,
    bucket: values.bucket,
    item_id: values.item_id === "" ? null : Number(values.item_id),
    package_label: values.package_label.trim(),
    wastage_area_id: values.wastage_area_id === "" ? null : Number(values.wastage_area_id),
    stock_loc: values.stock_loc,
    dept_id: deptForPayload(values),
    no_of_samples: Number(values.no_of_samples),
    wt_per_sample: Number(values.wt_per_sample),
    remarks: values.remarks.trim() === "" ? null : values.remarks.trim(),
  };
}

export function buildEditPayload(values: WindingStockFormValues): WindingStockEditPayload {
  return {
    bucket: values.bucket,
    item_id: values.item_id === "" ? null : Number(values.item_id),
    package_label: values.package_label.trim(),
    wastage_area_id: values.wastage_area_id === "" ? null : Number(values.wastage_area_id),
    stock_loc: values.stock_loc,
    dept_id: deptForPayload(values),
    no_of_samples: Number(values.no_of_samples),
    wt_per_sample: Number(values.wt_per_sample),
    remarks: values.remarks.trim() === "" ? null : values.remarks.trim(),
  };
}
