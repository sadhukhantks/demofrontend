"use client";

import * as React from "react";
import type {
  DeptCalcKey,
  DeptLineUI,
  LoomCalcKey,
  LoomLineUI,
  LoomTotals,
  PlanningDocUI,
  PlanningSection,
  PlanningSummary,
  PlanningWarning,
  ProductGroup,
  YarnCalcKey,
  YarnLineUI,
  YarnSection,
} from "../types/productionPlanningTypes";
import {
  computeLoomTotals,
  computeSummary,
  computeWarnings,
  manualField,
  recalcDocument,
  resetSectionAuto,
  type RecalcOptions,
} from "../utils/planningCalc";
import {
  applyQualityNorms,
  applyYarnNorms,
  createBlankLoomLine,
  createBlankYarnLine,
  makeUid,
  type NormResolver,
} from "../utils/planningFactories";
import type { DocUpdater } from "./usePlanningDocState";
import type { YarnDescResolver, YarnRateResolver } from "../types/productionPlanningTypes";

const EMPTY_TOTALS: LoomTotals = Object.freeze({
  byGroup: {},
  grand: { a: 0, b: 0, c: 0, day: 0 },
});
const EMPTY_WARNINGS: readonly PlanningWarning[] = Object.freeze([]);

type UsePlanningCalcParams = {
  doc: PlanningDocUI | null;
  setDoc: (updater: DocUpdater, markDirty?: boolean) => void;
  resolveNorm: NormResolver;
  resolveYarnRate: YarnRateResolver;
  resolveYarnDesc: YarnDescResolver;
};

/**
 * Orchestrates the recalc pipeline on every edit: every mutation goes through
 * `apply`, which runs the edited document through `recalcDocument` so auto
 * cells stay live while manual overrides stick. Also memoizes the derived
 * totals / warnings / summary for the page.
 */
export function usePlanningCalc({
  doc,
  setDoc,
  resolveNorm,
  resolveYarnRate,
  resolveYarnDesc,
}: UsePlanningCalcParams) {
  const recalcOpts = React.useMemo<RecalcOptions>(
    () => ({ resolveRate: resolveYarnRate, resolveDesc: resolveYarnDesc, makeUid }),
    [resolveYarnRate, resolveYarnDesc]
  );

  const apply = React.useCallback(
    (mutate: (d: PlanningDocUI) => PlanningDocUI) => {
      setDoc((prev) => recalcDocument(mutate(prev), recalcOpts), true);
    },
    [setDoc, recalcOpts]
  );

  // ── Header ──────────────────────────────────────────────────────────────

  const patchHeader = React.useCallback(
    (patch: Partial<Pick<PlanningDocUI, "plan_date" | "plan_name" | "branch_id" | "remarks">>) => {
      apply((d) => ({ ...d, ...patch }));
    },
    [apply]
  );

  // ── Section 1: loom lines ───────────────────────────────────────────────

  const patchLoomLine = React.useCallback(
    (uid: string, patch: Partial<LoomLineUI>) => {
      apply((d) => ({
        ...d,
        loom_lines: d.loom_lines.map((l) => (l.uid === uid ? { ...l, ...patch } : l)),
      }));
    },
    [apply]
  );

  /** Manual override of a derivable loom cell. */
  const setLoomCalcCell = React.useCallback(
    (uid: string, key: LoomCalcKey, value: number) => {
      apply((d) => ({
        ...d,
        loom_lines: d.loom_lines.map((l) =>
          l.uid === uid ? { ...l, [key]: manualField(value) } : l
        ),
      }));
    },
    [apply]
  );

  /** Picking (or clearing) a cloth quality pulls its qid norms onto the row. */
  const setLoomQuality = React.useCallback(
    (uid: string, qualityItemId: number | null, qualityDesc: string) => {
      apply((d) => ({
        ...d,
        loom_lines: d.loom_lines.map((l) => {
          if (l.uid !== uid) return l;
          if (qualityItemId == null) {
            return { ...l, quality_item_id: null, quality_desc: qualityDesc };
          }
          return applyQualityNorms(l, qualityItemId, qualityDesc, resolveNorm);
        }),
      }));
    },
    [apply, resolveNorm]
  );

  const addLoomLine = React.useCallback(
    (group: ProductGroup) => {
      apply((d) => ({ ...d, loom_lines: [...d.loom_lines, createBlankLoomLine(group)] }));
    },
    [apply]
  );

  const removeLoomLine = React.useCallback(
    (uid: string) => {
      apply((d) => ({ ...d, loom_lines: d.loom_lines.filter((l) => l.uid !== uid) }));
    },
    [apply]
  );

  // ── Section 2: yarn lines ───────────────────────────────────────────────

  const patchYarnLine = React.useCallback(
    (uid: string, patch: Partial<YarnLineUI>) => {
      apply((d) => ({
        ...d,
        yarn_lines: d.yarn_lines.map((l) => (l.uid === uid ? { ...l, ...patch } : l)),
      }));
    },
    [apply]
  );

  const setYarnCalcCell = React.useCallback(
    (uid: string, key: YarnCalcKey, value: number) => {
      apply((d) => ({
        ...d,
        yarn_lines: d.yarn_lines.map((l) =>
          l.uid === uid ? { ...l, [key]: manualField(value) } : l
        ),
      }));
    },
    [apply]
  );

  /** Picking a yarn item pulls its yid norms (rate + std eff) onto the row. */
  const setYarnItem = React.useCallback(
    (uid: string, yarnItemId: number | null, yarnDesc: string) => {
      apply((d) => ({
        ...d,
        yarn_lines: d.yarn_lines.map((l) => {
          if (l.uid !== uid) return l;
          if (yarnItemId == null) {
            return { ...l, yarn_item_id: null, yarn_desc: yarnDesc };
          }
          return applyYarnNorms(l, yarnItemId, yarnDesc, resolveNorm);
        }),
      }));
    },
    [apply, resolveNorm]
  );

  /** SACKING-style "% of production" row (line_kind CLOTH). */
  const addPctYarnLine = React.useCallback(
    (section: YarnSection) => {
      apply((d) => ({ ...d, yarn_lines: [...d.yarn_lines, createBlankYarnLine("CLOTH", section)] }));
    },
    [apply]
  );

  /** Order-driven SALE row. */
  const addSaleYarnLine = React.useCallback(() => {
    apply((d) => ({ ...d, yarn_lines: [...d.yarn_lines, createBlankYarnLine("SALE", "SALE")] }));
  }, [apply]);

  const removeYarnLine = React.useCallback(
    (uid: string) => {
      apply((d) => ({ ...d, yarn_lines: d.yarn_lines.filter((l) => l.uid !== uid) }));
    },
    [apply]
  );

  // ── Section 3: dept lines ───────────────────────────────────────────────

  const patchDeptLine = React.useCallback(
    (uid: string, patch: Partial<DeptLineUI>) => {
      apply((d) => ({
        ...d,
        dept_lines: d.dept_lines.map((l) => (l.uid === uid ? { ...l, ...patch } : l)),
      }));
    },
    [apply]
  );

  const setDeptCalcCell = React.useCallback(
    (uid: string, key: DeptCalcKey, value: number) => {
      apply((d) => ({
        ...d,
        dept_lines: d.dept_lines.map((l) =>
          l.uid === uid ? { ...l, [key]: manualField(value) } : l
        ),
      }));
    },
    [apply]
  );

  // ── Section Recalculate (reset manual → auto) ───────────────────────────

  const recalcSection = React.useCallback(
    (section: PlanningSection) => {
      apply((d) => resetSectionAuto(d, section));
    },
    [apply]
  );

  // ── Memoized derived data ───────────────────────────────────────────────

  const loomTotals = React.useMemo<LoomTotals>(
    () => (doc ? computeLoomTotals(doc.loom_lines) : EMPTY_TOTALS),
    [doc]
  );

  const warnings = React.useMemo<readonly PlanningWarning[]>(
    () => (doc ? computeWarnings(doc, loomTotals) : EMPTY_WARNINGS),
    [doc, loomTotals]
  );

  const warningUids = React.useMemo(() => {
    const set = new Set<string>();
    for (const w of warnings) {
      if (w.uid) set.add(w.uid);
    }
    return set;
  }, [warnings]);

  const summary = React.useMemo<PlanningSummary | null>(
    () => (doc ? computeSummary(doc, loomTotals) : null),
    [doc, loomTotals]
  );

  return {
    patchHeader,
    patchLoomLine,
    setLoomCalcCell,
    setLoomQuality,
    addLoomLine,
    removeLoomLine,
    patchYarnLine,
    setYarnCalcCell,
    setYarnItem,
    addPctYarnLine,
    addSaleYarnLine,
    removeYarnLine,
    patchDeptLine,
    setDeptCalcCell,
    recalcSection,
    loomTotals,
    warnings,
    warningUids,
    summary,
  };
}

export type PlanningCalcHook = ReturnType<typeof usePlanningCalc>;
