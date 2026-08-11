/**
 * API ⇄ UI mapping + the Zod document schema validated before save.
 *
 * Loading: CalcFields come back all-MANUAL (SPEC 4.4 — an edited plan reloads
 * as all-manual until the user presses a section's Recalculate).
 * Saving: plain numbers only; line_order = array index.
 */

import { z } from "zod";
import type {
  ApiNumeric,
  PlanningDeptLineSave,
  PlanningDocumentApi,
  PlanningLoomLineSave,
  PlanningSaveRequest,
  PlanningYarnLineSave,
} from "@/utils/juteProductionPlanningService";
import type {
  DeptLineUI,
  LoomLineUI,
  PlanningDocUI,
  ProductGroup,
  StageCode,
  WarpWeft,
  YarnLineKind,
  YarnLineUI,
  YarnSection,
} from "../types/productionPlanningTypes";
import { manualField } from "./planningCalc";
import { makeUid } from "./planningFactories";
import { PRODUCT_GROUPS, STAGES, YARN_SECTIONS } from "./planningConstants";

// ─── Coercion guards ──────────────────────────────────────────────────────

function num(value: ApiNumeric | undefined): number {
  if (value == null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numOrNull(value: ApiNumeric | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asProductGroup(value: string): ProductGroup {
  return (PRODUCT_GROUPS as readonly string[]).includes(value) ? (value as ProductGroup) : "OTHER";
}

function asYarnSection(value: string): YarnSection {
  return (YARN_SECTIONS as readonly string[]).includes(value) ? (value as YarnSection) : "OTHER";
}

function asLineKind(value: string): YarnLineKind {
  return value === "SALE" ? "SALE" : "CLOTH";
}

function asWarpWeft(value: string | null): WarpWeft | null {
  return value === "WP" || value === "WT" ? value : null;
}

function asStageCode(value: string, stageSeq: number): StageCode {
  const known = STAGES.find((s) => s.stage_code === value) ?? STAGES.find((s) => s.stage_seq === stageSeq);
  return known?.stage_code ?? "BATCHING";
}

// ─── API → UI ─────────────────────────────────────────────────────────────

export function apiToUiDoc(api: PlanningDocumentApi): PlanningDocUI {
  const loomLines: LoomLineUI[] = api.loom_lines.map((line) => ({
    uid: makeUid(),
    planning_loom_id: line.planning_loom_id ?? null,
    product_group: asProductGroup(line.product_group),
    quality_item_id: line.quality_item_id ?? null,
    quality_desc: line.quality_desc ?? "",
    looms_a: num(line.looms_a),
    looms_b: num(line.looms_b),
    looms_c: num(line.looms_c),
    kg_per_loom_100: num(line.kg_per_loom_100),
    eff_pct: num(line.eff_pct),
    kg_per_loom: manualField(num(line.kg_per_loom)),
    prod_a: manualField(num(line.prod_a)),
    prod_b: manualField(num(line.prod_b)),
    prod_c: manualField(num(line.prod_c)),
    warp_yarn_item_id: line.warp_yarn_item_id ?? null,
    weft_yarn_item_id: line.weft_yarn_item_id ?? null,
    warp_pct: numOrNull(line.warp_pct),
    weft_pct: numOrNull(line.weft_pct),
    remarks: line.remarks ?? "",
  }));

  const yarnLines: YarnLineUI[] = api.yarn_lines.map((line) => ({
    uid: makeUid(),
    planning_yarn_id: line.planning_yarn_id ?? null,
    line_kind: asLineKind(line.line_kind),
    section: asYarnSection(line.section),
    yarn_item_id: line.yarn_item_id ?? null,
    yarn_desc: line.yarn_desc ?? "",
    warp_weft: asWarpWeft(line.warp_weft),
    pct_of_prod: numOrNull(line.pct_of_prod),
    req_kg_a: manualField(num(line.req_kg_a)),
    req_kg_b: manualField(num(line.req_kg_b)),
    req_kg_c: manualField(num(line.req_kg_c)),
    req_kg_day: manualField(num(line.req_kg_day)),
    kg_per_frame_100: num(line.kg_per_frame_100),
    eff_pct: num(line.eff_pct),
    kg_per_frame: manualField(num(line.kg_per_frame)),
    frames_required: manualField(num(line.frames_required)),
    frames_a: manualField(num(line.frames_a)),
    frames_b: manualField(num(line.frames_b)),
    frames_c: manualField(num(line.frames_c)),
    priority: line.priority ?? null,
    order_mt: numOrNull(line.order_mt),
    days_needed: manualField(num(line.days_needed)),
    delivery_date: line.delivery_date ?? null,
    remarks: line.remarks ?? "",
  }));

  const deptLines: DeptLineUI[] = api.dept_lines.map((line) => ({
    uid: makeUid(),
    planning_dept_id: line.planning_dept_id ?? null,
    stage_seq: line.stage_seq,
    stage_code: asStageCode(line.stage_code, line.stage_seq),
    stage_label: line.stage_label ?? line.stage_code,
    output_kg_day: manualField(num(line.output_kg_day)),
    waste_pct: num(line.waste_pct),
    input_kg_day: manualField(num(line.input_kg_day)),
    kg_per_machine: manualField(num(line.kg_per_machine)),
    machines_required: manualField(num(line.machines_required)),
    machines_a: manualField(num(line.machines_a)),
    machines_b: manualField(num(line.machines_b)),
    machines_c: manualField(num(line.machines_c)),
    machines_installed: line.machines_installed ?? null,
    machines_maint: line.machines_maint ?? null,
    machines_ready: line.machines_ready ?? null,
    remarks: line.remarks ?? "",
  }));

  return {
    planning_id: api.header.planning_id,
    plan_no: api.header.plan_no,
    co_id: api.header.co_id,
    branch_id: api.header.branch_id,
    plan_date: (api.header.plan_date ?? "").slice(0, 10),
    plan_name: api.header.plan_name ?? "",
    remarks: api.header.remarks ?? "",
    loom_lines: loomLines,
    yarn_lines: yarnLines,
    dept_lines: deptLines,
  };
}

// ─── UI → save payload ────────────────────────────────────────────────────

export function uiToSaveRequest(doc: PlanningDocUI, updateNorms: boolean): PlanningSaveRequest {
  const loomLines: PlanningLoomLineSave[] = doc.loom_lines.map((line, index) => ({
    planning_loom_id: line.planning_loom_id,
    product_group: line.product_group,
    quality_item_id: line.quality_item_id,
    quality_desc: line.quality_desc || null,
    looms_a: line.looms_a,
    looms_b: line.looms_b,
    looms_c: line.looms_c,
    kg_per_loom_100: line.kg_per_loom_100,
    eff_pct: line.eff_pct,
    kg_per_loom: line.kg_per_loom.value,
    prod_a: line.prod_a.value,
    prod_b: line.prod_b.value,
    prod_c: line.prod_c.value,
    warp_yarn_item_id: line.warp_yarn_item_id,
    weft_yarn_item_id: line.weft_yarn_item_id,
    warp_pct: line.warp_pct,
    weft_pct: line.weft_pct,
    line_order: index,
    remarks: line.remarks || null,
  }));

  const yarnLines: PlanningYarnLineSave[] = doc.yarn_lines.map((line, index) => ({
    planning_yarn_id: line.planning_yarn_id,
    line_kind: line.line_kind,
    section: line.section,
    yarn_item_id: line.yarn_item_id,
    yarn_desc: line.yarn_desc || null,
    warp_weft: line.warp_weft,
    pct_of_prod: line.pct_of_prod,
    req_kg_a: line.req_kg_a.value,
    req_kg_b: line.req_kg_b.value,
    req_kg_c: line.req_kg_c.value,
    req_kg_day: line.req_kg_day.value,
    kg_per_frame_100: line.kg_per_frame_100,
    eff_pct: line.eff_pct,
    kg_per_frame: line.kg_per_frame.value,
    frames_required: line.frames_required.value,
    frames_a: line.frames_a.value,
    frames_b: line.frames_b.value,
    frames_c: line.frames_c.value,
    priority: line.priority,
    order_mt: line.order_mt,
    days_needed: line.days_needed.value,
    delivery_date: line.delivery_date,
    line_order: index,
    remarks: line.remarks || null,
  }));

  const deptLines: PlanningDeptLineSave[] = doc.dept_lines.map((line, index) => ({
    planning_dept_id: line.planning_dept_id,
    stage_seq: line.stage_seq,
    stage_code: line.stage_code,
    stage_label: line.stage_label || null,
    output_kg_day: line.output_kg_day.value,
    waste_pct: line.waste_pct,
    input_kg_day: line.input_kg_day.value,
    kg_per_machine: line.kg_per_machine.value,
    machines_required: line.machines_required.value,
    machines_a: line.machines_a.value,
    machines_b: line.machines_b.value,
    machines_c: line.machines_c.value,
    machines_installed: line.machines_installed,
    machines_maint: line.machines_maint,
    machines_ready: line.machines_ready,
    line_order: index,
    remarks: line.remarks || null,
  }));

  return {
    co_id: doc.co_id,
    branch_id: doc.branch_id,
    planning_id: doc.planning_id,
    plan_date: doc.plan_date,
    plan_name: doc.plan_name || null,
    remarks: doc.remarks || null,
    loom_lines: loomLines,
    yarn_lines: yarnLines,
    dept_lines: deptLines,
    update_norms: updateNorms,
  };
}

// ─── Zod document validation (before save) ────────────────────────────────

const nonNeg = z.number().min(0, "Must be ≥ 0");
const pct = z.number().min(0, "Must be ≥ 0").max(100, "Must be ≤ 100");
const nullablePct = pct.nullable();

const loomLineSchema = z.object({
  product_group: z.string().min(1),
  quality_item_id: z.number().int().nullable(),
  looms_a: nonNeg,
  looms_b: nonNeg,
  looms_c: nonNeg,
  kg_per_loom_100: nonNeg,
  eff_pct: pct,
  kg_per_loom: nonNeg,
  prod_a: nonNeg,
  prod_b: nonNeg,
  prod_c: nonNeg,
  warp_pct: nullablePct,
  weft_pct: nullablePct,
});

const yarnLineSchema = z.object({
  line_kind: z.enum(["CLOTH", "SALE"]),
  section: z.string().min(1),
  pct_of_prod: nullablePct,
  req_kg_a: nonNeg,
  req_kg_b: nonNeg,
  req_kg_c: nonNeg,
  req_kg_day: nonNeg,
  kg_per_frame_100: nonNeg,
  eff_pct: pct,
  kg_per_frame: nonNeg,
  frames_required: nonNeg,
  frames_a: nonNeg,
  frames_b: nonNeg,
  frames_c: nonNeg,
  order_mt: nonNeg.nullable(),
  // Backstop for jute_prod_planning_yarn.days_needed DECIMAL(8,2) — an
  // out-of-range value would fail the whole save under MySQL strict mode.
  days_needed: z.number().min(0, "Must be ≥ 0").max(999999.99, "Days needed is out of range").nullable(),
});

const deptLineSchema = z.object({
  stage_seq: z.number().int().min(1),
  stage_code: z.string().min(1),
  output_kg_day: nonNeg,
  waste_pct: pct,
  input_kg_day: nonNeg,
  kg_per_machine: nonNeg,
  machines_required: nonNeg,
  machines_a: nonNeg,
  machines_b: nonNeg,
  machines_c: nonNeg,
});

export const planningSaveSchema = z.object({
  co_id: z.number().int().positive("Company is required"),
  branch_id: z
    .number({ message: "Branch is required" })
    .int()
    .positive("Branch is required"),
  plan_date: z.string().min(1, "Plan date is required"),
  plan_name: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  loom_lines: z.array(loomLineSchema),
  yarn_lines: z.array(yarnLineSchema),
  dept_lines: z.array(deptLineSchema),
});

export type PlanningSaveSchema = z.infer<typeof planningSaveSchema>;

/** Returns a flat list of human-readable validation errors (empty = valid). */
export function validateSaveRequest(payload: PlanningSaveRequest): string[] {
  const parsed = planningSaveSchema.safeParse(payload);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
