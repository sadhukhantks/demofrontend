/**
 * PURE calculation engine for Production Planning (SPEC §4.4).
 *
 * No React, no fetch — every function takes plain data and returns new data.
 * Auto/manual model: derivable cells are `CalcField {value, auto}`; a recompute
 * only overwrites cells whose `auto` flag is true (`applyAuto`). Editing a cell
 * flips it manual; per-section Recalculate resets flags to auto (`resetSectionAuto`)
 * and re-runs the pipeline. Flags are UI-only — persistence stores plain numbers.
 */

import type {
  CalcField,
  DeptLineUI,
  DeriveYarnLinesParams,
  LoomLineUI,
  LoomTotals,
  PlanningDocUI,
  PlanningSection,
  PlanningSummary,
  PlanningWarning,
  ProductGroup,
  ShiftTotals,
  WarpWeft,
  YarnLineUI,
} from "../types/productionPlanningTypes";

// ─── Numeric helpers ──────────────────────────────────────────────────────

const EPSILON = 1e-6;

export function round3(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 1000) / 1000;
}

export function round2(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export function round1(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 10) / 10;
}

/** Division with the SPEC's ÷0 → 0 guard. */
export function safeDiv(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return 0;
  if (Math.abs(denominator) < EPSILON) return 0;
  return numerator / denominator;
}

// ─── CalcField helpers ────────────────────────────────────────────────────

export function autoField(value: number): CalcField {
  return { value, auto: true };
}

export function manualField(value: number): CalcField {
  return { value, auto: false };
}

/** Recompute an auto cell; a manual cell keeps its user value. */
export function applyAuto(field: CalcField, value: number): CalcField {
  return field.auto ? { value, auto: true } : field;
}

// ─── Section 1: loom lines ────────────────────────────────────────────────

/**
 * SPEC 4.4(1): kg_per_loom = round3(kg_per_loom_100 × eff_pct/100);
 * prod_x = looms_x × kg_per_loom.
 */
export function recalcLoomLine(line: LoomLineUI): LoomLineUI {
  const kgPerLoom = applyAuto(line.kg_per_loom, round3((line.kg_per_loom_100 * line.eff_pct) / 100));
  return {
    ...line,
    kg_per_loom: kgPerLoom,
    prod_a: applyAuto(line.prod_a, round3(line.looms_a * kgPerLoom.value)),
    prod_b: applyAuto(line.prod_b, round3(line.looms_b * kgPerLoom.value)),
    prod_c: applyAuto(line.prod_c, round3(line.looms_c * kgPerLoom.value)),
  };
}

export function loomLineDayKg(line: LoomLineUI): number {
  return round3(line.prod_a.value + line.prod_b.value + line.prod_c.value);
}

export function loomLineTotalLooms(line: LoomLineUI): number {
  return line.looms_a + line.looms_b + line.looms_c;
}

const emptyShiftTotals = (): ShiftTotals => ({ a: 0, b: 0, c: 0, day: 0 });

/** Section totals per product_group + grand total cloth kg/day. */
export function computeLoomTotals(lines: readonly LoomLineUI[]): LoomTotals {
  const byGroup: Partial<Record<ProductGroup, ShiftTotals>> = {};
  const grand = emptyShiftTotals();

  for (const line of lines) {
    const g = byGroup[line.product_group] ?? emptyShiftTotals();
    g.a = round3(g.a + line.prod_a.value);
    g.b = round3(g.b + line.prod_b.value);
    g.c = round3(g.c + line.prod_c.value);
    g.day = round3(g.day + loomLineDayKg(line));
    byGroup[line.product_group] = g;

    grand.a = round3(grand.a + line.prod_a.value);
    grand.b = round3(grand.b + line.prod_b.value);
    grand.c = round3(grand.c + line.prod_c.value);
    grand.day = round3(grand.day + loomLineDayKg(line));
  }

  return { byGroup, grand };
}

// ─── Section 2: derive + recalc yarn lines ────────────────────────────────

type DerivedSpec = {
  section: ProductGroup;
  yarn_item_id: number;
  warp_weft: WarpWeft;
  a: number;
  b: number;
  c: number;
};

function derivedKey(section: string, yarnItemId: number, warpWeft: string): string {
  return `${section}|${yarnItemId}|${warpWeft}`;
}

function isDerivedYarnLine(line: YarnLineUI): boolean {
  return line.line_kind === "CLOTH" && line.warp_weft != null && line.yarn_item_id != null;
}

function reqCellsAllAuto(line: YarnLineUI): boolean {
  return line.req_kg_a.auto && line.req_kg_b.auto && line.req_kg_c.auto && line.req_kg_day.auto;
}

/**
 * SPEC 4.4(2) `deriveYarnLines`: quality-level loom rows (HESSIAN/PACKSHEET style)
 * explode into warp ('WP') and weft ('WT') yarn requirements aggregated by
 * (section=product_group, yarn_item_id, warp_weft). Derived rows MERGE into
 * existing yarn lines by that key, preserving user-edited rate/allocation cells;
 * removed sources drop their auto rows. SACKING-style pct_of_prod lines and SALE
 * lines pass through untouched here (their recompute happens in recalcYarnLine).
 */
export function deriveYarnLines(params: DeriveYarnLinesParams): YarnLineUI[] {
  const { loomLines, yarnLines, resolveRate, resolveDesc, makeUid } = params;

  // 1. Aggregate the derived requirement specs from quality-level loom rows.
  const specs = new Map<string, DerivedSpec>();
  const addSpec = (
    section: ProductGroup,
    yarnItemId: number | null,
    warpWeft: WarpWeft,
    pct: number | null,
    line: LoomLineUI
  ) => {
    if (yarnItemId == null || pct == null) return;
    const key = derivedKey(section, yarnItemId, warpWeft);
    const spec = specs.get(key) ?? { section, yarn_item_id: yarnItemId, warp_weft: warpWeft, a: 0, b: 0, c: 0 };
    spec.a = round3(spec.a + (line.prod_a.value * pct) / 100);
    spec.b = round3(spec.b + (line.prod_b.value * pct) / 100);
    spec.c = round3(spec.c + (line.prod_c.value * pct) / 100);
    specs.set(key, spec);
  };

  for (const line of loomLines) {
    if (line.quality_item_id == null) continue; // group-level rows feed pct_of_prod lines instead
    addSpec(line.product_group, line.warp_yarn_item_id, "WP", line.warp_pct, line);
    addSpec(line.product_group, line.weft_yarn_item_id, "WT", line.weft_pct, line);
  }

  // 2. Walk existing lines: update matches (preserving manual cells), drop
  //    derived auto rows whose source is gone, pass everything else through.
  const result: YarnLineUI[] = [];
  for (const line of yarnLines) {
    if (!isDerivedYarnLine(line)) {
      result.push(line);
      continue;
    }
    const key = derivedKey(line.section, line.yarn_item_id as number, line.warp_weft as string);
    const spec = specs.get(key);
    if (spec) {
      specs.delete(key);
      const reqA = applyAuto(line.req_kg_a, spec.a);
      const reqB = applyAuto(line.req_kg_b, spec.b);
      const reqC = applyAuto(line.req_kg_c, spec.c);
      result.push({ ...line, req_kg_a: reqA, req_kg_b: reqB, req_kg_c: reqC });
    } else if (!reqCellsAllAuto(line)) {
      // User hand-edited the requirement — keep the row even without a source.
      result.push(line);
    }
    // else: pure auto row whose source was removed → dropped.
  }

  // 3. Append brand-new derived rows (all cells auto, rates from norms).
  for (const spec of specs.values()) {
    const rate = resolveRate?.(spec.yarn_item_id) ?? null;
    result.push({
      uid: makeUid(),
      planning_yarn_id: null,
      line_kind: "CLOTH",
      section: spec.section,
      yarn_item_id: spec.yarn_item_id,
      yarn_desc: resolveDesc?.(spec.yarn_item_id) ?? "",
      warp_weft: spec.warp_weft,
      pct_of_prod: null,
      req_kg_a: autoField(spec.a),
      req_kg_b: autoField(spec.b),
      req_kg_c: autoField(spec.c),
      req_kg_day: autoField(round3(spec.a + spec.b + spec.c)),
      kg_per_frame_100: rate?.kg_per_frame_100 ?? 0,
      eff_pct: rate?.eff_pct ?? 0,
      kg_per_frame: autoField(0),
      frames_required: autoField(0),
      frames_a: autoField(0),
      frames_b: autoField(0),
      frames_c: autoField(0),
      priority: null,
      order_mt: null,
      days_needed: autoField(0),
      delivery_date: null,
      remarks: "",
    });
  }

  return result;
}

export function yarnFramesAllocated(line: YarnLineUI): number {
  return line.frames_a.value + line.frames_b.value + line.frames_c.value;
}

/** SALE lines: daily production commitment = (frames_a+b+c) × kg_per_frame. */
export function saleDailyCommitment(line: YarnLineUI): number {
  return round3(yarnFramesAllocated(line) * line.kg_per_frame.value);
}

/**
 * SPEC 4.4(2)+(3): pct-of-prod requirements, effective frame rate,
 * frames_required, the auto allocation suggestion, and SALE-specific math.
 */
export function recalcYarnLine(line: YarnLineUI, loomTotals: LoomTotals): YarnLineUI {
  const kgPerFrame = applyAuto(line.kg_per_frame, round3((line.kg_per_frame_100 * line.eff_pct) / 100));

  if (line.line_kind === "SALE") {
    // Frames allocation drives the commitment (frames_x are inputs here).
    const withRate: YarnLineUI = { ...line, kg_per_frame: kgPerFrame };
    const commitment = saleDailyCommitment(withRate);
    const reqDay = applyAuto(line.req_kg_day, commitment);
    const framesRequired = applyAuto(line.frames_required, round2(safeDiv(reqDay.value, kgPerFrame.value)));
    const framesTotal = yarnFramesAllocated(withRate);
    const orderKg = (line.order_mt ?? 0) * 1000;
    const daysNeeded = applyAuto(
      line.days_needed,
      round2(safeDiv(safeDiv(orderKg, kgPerFrame.value), Math.max(framesTotal, EPSILON)))
    );
    return {
      ...withRate,
      req_kg_day: reqDay,
      frames_required: framesRequired,
      days_needed: daysNeeded,
    };
  }

  // CLOTH lines. pct_of_prod rows pull from the section's cloth production.
  let reqA = line.req_kg_a;
  let reqB = line.req_kg_b;
  let reqC = line.req_kg_c;
  if (line.pct_of_prod != null) {
    const group = loomTotals.byGroup[line.section as ProductGroup];
    const pct = line.pct_of_prod;
    reqA = applyAuto(reqA, round3(((group?.a ?? 0) * pct) / 100));
    reqB = applyAuto(reqB, round3(((group?.b ?? 0) * pct) / 100));
    reqC = applyAuto(reqC, round3(((group?.c ?? 0) * pct) / 100));
  }

  const reqDay = applyAuto(line.req_kg_day, round3(reqA.value + reqB.value + reqC.value));
  const framesRequired = applyAuto(line.frames_required, round2(safeDiv(reqDay.value, kgPerFrame.value)));
  // Auto allocation suggestion: ceil(frames_required/3 × 10)/10 per shift (editable).
  const suggestion = Math.ceil((framesRequired.value / 3) * 10) / 10;

  return {
    ...line,
    req_kg_a: reqA,
    req_kg_b: reqB,
    req_kg_c: reqC,
    req_kg_day: reqDay,
    kg_per_frame: kgPerFrame,
    frames_required: framesRequired,
    frames_a: applyAuto(line.frames_a, suggestion),
    frames_b: applyAuto(line.frames_b, suggestion),
    frames_c: applyAuto(line.frames_c, suggestion),
  };
}

// ─── Section 3: dept cascade ──────────────────────────────────────────────

export function deptMachinesAllocated(line: DeptLineUI): number {
  return line.machines_a.value + line.machines_b.value + line.machines_c.value;
}

/**
 * SPEC 4.4(4) `buildDeptCascade`. WEAVING/SPINNING take machine counts from
 * Sections 1/2; BEAMING/WINDING outputs come from the yarn split; then the
 * requirement cascades backward SPINNING → DRAWING → CARDING → BATCHING via
 * each stage's input_kg_day (= output × (1 + waste/100)).
 */
export function buildDeptCascade(
  deptLines: readonly DeptLineUI[],
  loomLines: readonly LoomLineUI[],
  yarnLines: readonly YarnLineUI[],
  loomTotals: LoomTotals
): DeptLineUI[] {
  // Aggregates from Section 1.
  let loomsA = 0;
  let loomsB = 0;
  let loomsC = 0;
  for (const l of loomLines) {
    loomsA += l.looms_a;
    loomsB += l.looms_b;
    loomsC += l.looms_c;
  }
  const totalLooms = loomsA + loomsB + loomsC;
  // Weighted avg kg_per_loom (weights = loom counts) = grand kg/day ÷ loom-shifts.
  const weightedKgPerLoom = round3(safeDiv(loomTotals.grand.day, totalLooms));

  // Aggregates from Section 2.
  let clothReqDay = 0;
  let saleCommitment = 0;
  let framesA = 0;
  let framesB = 0;
  let framesC = 0;
  let framesRequiredSum = 0;
  let warpClothReqDay = 0;
  let weftClothReqDay = 0;
  for (const y of yarnLines) {
    framesA += y.frames_a.value;
    framesB += y.frames_b.value;
    framesC += y.frames_c.value;
    framesRequiredSum += y.frames_required.value;
    if (y.line_kind === "SALE") {
      saleCommitment += saleDailyCommitment(y);
    } else {
      clothReqDay += y.req_kg_day.value;
      if (y.warp_weft === "WP") warpClothReqDay += y.req_kg_day.value;
      if (y.warp_weft === "WT") weftClothReqDay += y.req_kg_day.value;
    }
  }

  const outputByCode: Partial<Record<string, number>> = {
    WEAVING: loomTotals.grand.day,
    SPINNING: round3(clothReqDay + saleCommitment),
    BEAMING: round3(warpClothReqDay),
    WINDING: round3(weftClothReqDay + saleCommitment),
  };

  // Work in flow order so the backward chain reads downstream inputs.
  const ordered = [...deptLines].sort((x, y) => x.stage_seq - y.stage_seq);
  const byCode = new Map<string, DeptLineUI>();

  const recalcStage = (line: DeptLineUI, output: number | undefined): DeptLineUI => {
    const next: DeptLineUI = { ...line };

    if (output != null) {
      next.output_kg_day = applyAuto(next.output_kg_day, round3(output));
    }

    if (next.stage_code === "WEAVING") {
      next.kg_per_machine = applyAuto(next.kg_per_machine, weightedKgPerLoom);
      next.machines_a = applyAuto(next.machines_a, round1(loomsA));
      next.machines_b = applyAuto(next.machines_b, round1(loomsB));
      next.machines_c = applyAuto(next.machines_c, round1(loomsC));
      next.machines_required = applyAuto(next.machines_required, round2(deptMachinesAllocated(next)));
    } else if (next.stage_code === "SPINNING") {
      next.machines_a = applyAuto(next.machines_a, round1(framesA));
      next.machines_b = applyAuto(next.machines_b, round1(framesB));
      next.machines_c = applyAuto(next.machines_c, round1(framesC));
      next.machines_required = applyAuto(next.machines_required, round2(framesRequiredSum));
    } else {
      next.machines_required = applyAuto(
        next.machines_required,
        round2(safeDiv(next.output_kg_day.value, next.kg_per_machine.value))
      );
    }

    next.input_kg_day = applyAuto(
      next.input_kg_day,
      round3(next.output_kg_day.value * (1 + next.waste_pct / 100))
    );

    next.machines_ready =
      next.machines_installed != null && next.machines_maint != null
        ? next.machines_installed - next.machines_maint
        : null;

    return next;
  };

  // Pass 1: stages whose output comes from Sections 1/2.
  for (const line of ordered) {
    if (line.stage_code in outputByCode) {
      byCode.set(line.stage_code, recalcStage(line, outputByCode[line.stage_code]));
    }
  }

  // Pass 2: backward chain — upstream output defaults to downstream input.
  const chain: Array<{ code: string; downstream: string }> = [
    { code: "DRAWING", downstream: "SPINNING" },
    { code: "CARDING", downstream: "DRAWING" },
    { code: "BATCHING", downstream: "CARDING" },
  ];
  for (const { code, downstream } of chain) {
    const line = ordered.find((l) => l.stage_code === code);
    if (!line) continue;
    const downstreamLine = byCode.get(downstream);
    byCode.set(code, recalcStage(line, downstreamLine?.input_kg_day.value));
  }

  // Any custom/unknown stages recalc in place with their own output.
  return ordered.map((line) => byCode.get(line.stage_code) ?? recalcStage(line, undefined));
}

// ─── Warnings (SPEC 4.4(5)) ───────────────────────────────────────────────

export function computeWarnings(doc: PlanningDocUI, loomTotals: LoomTotals): PlanningWarning[] {
  const warnings: PlanningWarning[] = [];

  // Loom quality rows: warp_pct + weft_pct must total 100.
  for (const line of doc.loom_lines) {
    if (line.quality_item_id == null) continue;
    if (line.warp_pct == null && line.weft_pct == null) continue;
    const sum = (line.warp_pct ?? 0) + (line.weft_pct ?? 0);
    if (Math.abs(sum - 100) > 0.01) {
      warnings.push({
        code: "WARP_WEFT_SUM",
        section: "loom",
        uid: line.uid,
        message: `${line.quality_desc || "Quality row"}: warp% + weft% = ${round2(sum)} (should be 100)`,
      });
    }
  }

  // Sacking-style groups: pct_of_prod lines of a producing section must total 100.
  const pctBySection = new Map<string, number>();
  for (const line of doc.yarn_lines) {
    if (line.line_kind === "CLOTH" && line.pct_of_prod != null) {
      pctBySection.set(line.section, (pctBySection.get(line.section) ?? 0) + line.pct_of_prod);
    }
  }
  for (const [section, pctSum] of pctBySection) {
    const groupDay = loomTotals.byGroup[section as ProductGroup]?.day ?? 0;
    if (groupDay > EPSILON && Math.abs(pctSum - 100) > 0.01) {
      warnings.push({
        code: "PCT_SUM",
        section: "yarn",
        message: `${section}: yarn % of production totals ${round2(pctSum)} (should be 100)`,
      });
    }
  }

  // Yarn rows: allocated frames must cover frames_required.
  for (const line of doc.yarn_lines) {
    const allocated = yarnFramesAllocated(line);
    if (allocated + EPSILON < line.frames_required.value) {
      warnings.push({
        code: "UNDER_ALLOC",
        section: "yarn",
        uid: line.uid,
        message: `${line.yarn_desc || line.section}: ${round2(allocated)} frames allocated < ${round2(
          line.frames_required.value
        )} required`,
      });
    }
  }

  // Dept rows: allocation coverage + ready-capacity ceiling.
  for (const line of doc.dept_lines) {
    const allocated = deptMachinesAllocated(line);
    if (allocated + EPSILON < line.machines_required.value) {
      warnings.push({
        code: "UNDER_ALLOC",
        section: "dept",
        uid: line.uid,
        message: `${line.stage_label}: ${round2(allocated)} allocated < ${round2(
          line.machines_required.value
        )} required`,
      });
    }
    if (line.machines_ready != null) {
      const shiftsRun = [line.machines_a.value, line.machines_b.value, line.machines_c.value].filter(
        (v) => v > EPSILON
      ).length;
      if (shiftsRun > 0 && allocated > line.machines_ready * shiftsRun + EPSILON) {
        warnings.push({
          code: "OVER_READY",
          section: "dept",
          uid: line.uid,
          message: `${line.stage_label}: ${round2(allocated)} allocated > ${line.machines_ready} ready × ${shiftsRun} shift(s)`,
        });
      }
    }
  }

  return warnings;
}

// ─── Summary (SPEC 4.5) ───────────────────────────────────────────────────

export function computeSummary(doc: PlanningDocUI, loomTotals: LoomTotals): PlanningSummary {
  let totalYarnKgDay = 0;
  let framesRequired = 0;
  let framesAllocated = 0;
  for (const y of doc.yarn_lines) {
    totalYarnKgDay += y.req_kg_day.value;
    framesRequired += y.frames_required.value;
    framesAllocated += yarnFramesAllocated(y);
  }

  const spinning = doc.dept_lines.find((d) => d.stage_code === "SPINNING");
  const batching = doc.dept_lines.find((d) => d.stage_code === "BATCHING");

  return {
    totalClothKgDay: loomTotals.grand.day,
    totalYarnKgDay: round3(totalYarnKgDay),
    framesRequired: round2(framesRequired),
    framesAllocated: round2(framesAllocated),
    framesReady: spinning?.machines_ready ?? null,
    rawJuteKgDay: batching?.input_kg_day.value ?? 0,
  };
}

// ─── Section auto reset ───────────────────────────────────────────────────

function resetField(field: CalcField): CalcField {
  return field.auto ? field : { value: field.value, auto: true };
}

/** Per-section "Recalculate": flip every derivable cell in the section back to auto. */
export function resetSectionAuto(doc: PlanningDocUI, section: PlanningSection): PlanningDocUI {
  if (section === "loom") {
    return {
      ...doc,
      loom_lines: doc.loom_lines.map((l) => ({
        ...l,
        kg_per_loom: resetField(l.kg_per_loom),
        prod_a: resetField(l.prod_a),
        prod_b: resetField(l.prod_b),
        prod_c: resetField(l.prod_c),
      })),
    };
  }
  if (section === "yarn") {
    return {
      ...doc,
      yarn_lines: doc.yarn_lines.map((y) => ({
        ...y,
        req_kg_a: resetField(y.req_kg_a),
        req_kg_b: resetField(y.req_kg_b),
        req_kg_c: resetField(y.req_kg_c),
        req_kg_day: resetField(y.req_kg_day),
        kg_per_frame: resetField(y.kg_per_frame),
        frames_required: resetField(y.frames_required),
        frames_a: resetField(y.frames_a),
        frames_b: resetField(y.frames_b),
        frames_c: resetField(y.frames_c),
        days_needed: resetField(y.days_needed),
      })),
    };
  }
  return {
    ...doc,
    dept_lines: doc.dept_lines.map((d) => ({
      ...d,
      output_kg_day: resetField(d.output_kg_day),
      input_kg_day: resetField(d.input_kg_day),
      kg_per_machine: resetField(d.kg_per_machine),
      machines_required: resetField(d.machines_required),
      machines_a: resetField(d.machines_a),
      machines_b: resetField(d.machines_b),
      machines_c: resetField(d.machines_c),
    })),
  };
}

// ─── Full pipeline ────────────────────────────────────────────────────────

export type RecalcOptions = Pick<DeriveYarnLinesParams, "resolveRate" | "resolveDesc" | "makeUid">;

/**
 * Runs the whole recalc pipeline on every edit:
 * loom lines → group totals → deriveYarnLines merge → yarn lines → dept cascade.
 */
export function recalcDocument(doc: PlanningDocUI, options: RecalcOptions): PlanningDocUI {
  const loomLines = doc.loom_lines.map(recalcLoomLine);
  const loomTotals = computeLoomTotals(loomLines);

  const mergedYarn = deriveYarnLines({
    loomLines,
    yarnLines: doc.yarn_lines,
    resolveRate: options.resolveRate,
    resolveDesc: options.resolveDesc,
    makeUid: options.makeUid,
  });
  const yarnLines = mergedYarn.map((y) => recalcYarnLine(y, loomTotals));

  const deptLines = buildDeptCascade(doc.dept_lines, loomLines, yarnLines, loomTotals);

  return { ...doc, loom_lines: loomLines, yarn_lines: yarnLines, dept_lines: deptLines };
}
