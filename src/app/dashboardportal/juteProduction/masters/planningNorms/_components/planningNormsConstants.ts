import { z } from "zod";
import type { PlanningNormIdType } from "@/utils/juteProductionPlanningService";

/**
 * Shared constants for the Planning Norms master (SPEC §2.5, §4.3):
 * three id_type tabs (Cloth Qualities / Yarn Counts / Stages), each with its
 * own fixed set of columns (params). Kept in one file so the page, editor and
 * grid all agree on labels and column order.
 */

/** Tab order + labels for the three norm id_types. */
export const ID_TYPE_TABS: ReadonlyArray<{ idType: PlanningNormIdType; label: string }> = [
  { idType: "qid", label: "Cloth Qualities" },
  { idType: "yid", label: "Yarn Counts" },
  { idType: "stage", label: "Stages" },
];

/** Row-label column header per id_type. */
export const ROW_LABEL_HEADER: Record<PlanningNormIdType, string> = {
  qid: "Cloth Quality",
  yid: "Yarn Count",
  stage: "Stage",
};

/** Columns (params), fixed per id_type — SPEC §2.5. Column order = display order. */
export const NORM_PARAMS: Record<PlanningNormIdType, readonly string[]> = {
  qid: Object.freeze([
    "kg_per_loom_100",
    "warp_pct",
    "weft_pct",
    "warp_yarn_item",
    "weft_yarn_item",
    "std_eff",
  ]),
  yid: Object.freeze(["kg_per_frame_100", "std_eff"]),
  stage: Object.freeze(["kg_per_machine", "waste_pct"]),
};

export const PARAM_LABELS: Record<string, string> = {
  kg_per_loom_100: "Kg / Loom / Shift @100%",
  warp_pct: "Warp %",
  weft_pct: "Weft %",
  warp_yarn_item: "Warp Yarn",
  weft_yarn_item: "Weft Yarn",
  std_eff: "Std Efficiency %",
  kg_per_frame_100: "Kg / Frame / Shift @100%",
  kg_per_machine: "Kg / Machine / Shift",
  waste_pct: "Waste %",
};

/** Params whose cell is a yarn-item dropdown (value = yarn item_id), not a free number. */
export const YARN_SELECT_PARAMS: ReadonlySet<string> = new Set(["warp_yarn_item", "weft_yarn_item"]);

const PCT_PARAMS = new Set(["warp_pct", "weft_pct", "waste_pct"]);

/**
 * Zod bound for one raw numeric entry, keyed by param name. Applied
 * client-side before a cell is included in the norms_bulk_save payload
 * (CLAUDE.md requires Zod validation for all form inputs); the backend
 * remains the source of truth for persistence rules.
 */
export function paramSchema(param: string) {
  if (YARN_SELECT_PARAMS.has(param)) return z.number().int().positive();
  if (PCT_PARAMS.has(param)) return z.number().min(0).max(100);
  // Must match the plan editor's eff_pct bound (loomLineSchema/yarnLineSchema
  // cap at 100) — a norm above 100 would block saving every plan that inherits it.
  if (param === "std_eff") return z.number().min(0).max(100);
  return z.number().min(0); // kg_per_loom_100 / kg_per_frame_100 / kg_per_machine
}
