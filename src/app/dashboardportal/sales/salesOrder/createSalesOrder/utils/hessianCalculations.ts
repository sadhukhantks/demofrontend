// Sales Order hessian calc — thin re-export of the shared utility at
// `src/utils/hessianCalculations.ts`. The shared utility accepts a
// `qtyRounding` parameter; SO callers must pass `4` to preserve the legacy
// 4-decimal qtyMt rounding. Sales Invoice callers pass 3 (or the
// per-mapping rounding from uom_item_map_mst).
export { computeHessianFields } from "@/utils/hessianCalculations";
export type { HessianComputedFields } from "@/utils/hessianCalculations";
