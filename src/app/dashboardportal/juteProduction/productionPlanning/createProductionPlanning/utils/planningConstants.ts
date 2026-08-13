import type {
  DeptLineUI,
  LoomLineUI,
  ProductGroup,
  ShiftKey,
  StageDef,
  YarnLineUI,
  YarnSection,
} from "../types/productionPlanningTypes";

/** Loom-plan product groups (Section 1 grouping). */
export const PRODUCT_GROUPS: readonly ProductGroup[] = Object.freeze([
  "SACKING",
  "HESSIAN",
  "PACKSHEET",
  "OTHER",
]);

/** Yarn-plan sections (Section 2). */
export const YARN_SECTIONS: readonly YarnSection[] = Object.freeze([
  "SACKING",
  "HESSIAN",
  "PACKSHEET",
  "TWINE",
  "SALE",
  "OTHER",
]);

export const SHIFT_KEYS: readonly ShiftKey[] = Object.freeze(["a", "b", "c"]);

export const SHIFT_LABELS: Readonly<Record<ShiftKey, string>> = Object.freeze({
  a: "A",
  b: "B",
  c: "C",
});

/**
 * Material chain, flow order stage_seq 1→7 (must match backend PLANNING_STAGES).
 * WINDING is person-keyed in this ERP, hence the "Machines / Workers" label.
 */
export const STAGES: readonly StageDef[] = Object.freeze([
  { stage_seq: 1, stage_code: "BATCHING", stage_label: "Batching (Spreader)", machine_label: "Machines" },
  { stage_seq: 2, stage_code: "CARDING", stage_label: "Carding", machine_label: "Machines" },
  { stage_seq: 3, stage_code: "DRAWING", stage_label: "Drawing", machine_label: "Machines" },
  { stage_seq: 4, stage_code: "SPINNING", stage_label: "Spinning", machine_label: "Frames" },
  { stage_seq: 5, stage_code: "WINDING", stage_label: "Winding", machine_label: "Machines / Workers" },
  { stage_seq: 6, stage_code: "BEAMING", stage_label: "Beaming", machine_label: "Machines" },
  { stage_seq: 7, stage_code: "WEAVING", stage_label: "Weaving", machine_label: "Looms" },
] as StageDef[]);

/** Direct-CRUD documents in this module carry status_id = 1 (no approval flow). */
export const PLANNING_STATUS_OPEN = 1;

/** Frozen empties for safe defaults. */
export const EMPTY_LOOM_LINES: readonly LoomLineUI[] = Object.freeze([]);
export const EMPTY_YARN_LINES: readonly YarnLineUI[] = Object.freeze([]);
export const EMPTY_DEPT_LINES: readonly DeptLineUI[] = Object.freeze([]);

/** Norm params by id_type (mirror SPEC §2.5). */
export const QID_NORM_PARAMS = Object.freeze([
  "kg_per_loom_100",
  "warp_pct",
  "weft_pct",
  "warp_yarn_item",
  "weft_yarn_item",
  "std_eff",
]);

export const YID_NORM_PARAMS = Object.freeze(["kg_per_frame_100", "std_eff"]);

export const STAGE_NORM_PARAMS = Object.freeze(["kg_per_machine", "waste_pct"]);
