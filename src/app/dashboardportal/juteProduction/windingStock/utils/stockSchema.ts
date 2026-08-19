import { z } from "zod";
import type {
  WindingStockCreatePayload,
  WindingStockEditPayload,
} from "@/utils/windingStockService";

export const MAX_SAMPLES = 1_000_000;
export const MAX_WT = 2000;

function isFutureISODate(value: string): boolean {
  return value > new Date().toISOString().slice(0, 10);
}

export const windingStockSchema = z.object({
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
});

export type WindingStockFormValues = z.infer<typeof windingStockSchema>;

export function buildDefaultFormValues(tranDate: string): WindingStockFormValues {
  return {
    tran_date: tranDate,
    bucket: "MILL_USE",
    item_id: "",
    package_label: "",
    wastage_area_id: "",
    no_of_samples: "",
    wt_per_sample: "",
    remarks: "",
  };
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
    no_of_samples: Number(values.no_of_samples),
    wt_per_sample: Number(values.wt_per_sample),
    remarks: values.remarks.trim() === "" ? null : values.remarks.trim(),
  };
}
