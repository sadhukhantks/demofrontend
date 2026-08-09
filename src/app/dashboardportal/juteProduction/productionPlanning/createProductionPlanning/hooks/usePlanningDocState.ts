"use client";

import * as React from "react";
import {
  fetchPlanningById,
  fetchPlanningLatest,
} from "@/utils/juteProductionPlanningService";
import type { PlanningDocUI } from "../types/productionPlanningTypes";
import { apiToUiDoc } from "../utils/planningMappers";

export type DocUpdater = (prev: PlanningDocUI) => PlanningDocUI;

/**
 * Owns the planning document state + dirty tracking, and the two async
 * loaders (load by id for edit/view; copy-latest for create). Loaded plans
 * come back all-manual via the mapper (SPEC 4.4).
 */
export function usePlanningDocState() {
  const [doc, setDocState] = React.useState<PlanningDocUI | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /** Functional update; marks the doc dirty unless told otherwise. */
  const setDoc = React.useCallback((updater: DocUpdater, markDirty: boolean = true) => {
    setDocState((prev) => (prev ? updater(prev) : prev));
    if (markDirty) setDirty(true);
  }, []);

  /** Replace the whole document (initial builds, loads). */
  const resetDoc = React.useCallback((next: PlanningDocUI | null, markDirty: boolean = false) => {
    setDocState(next);
    setDirty(markDirty);
  }, []);

  const loadById = React.useCallback(
    async (planningId: number | string, coId: string | number) => {
      setLoading(true);
      setError(null);
      try {
        const api = await fetchPlanningById(planningId, coId);
        setDocState(apiToUiDoc(api));
        setDirty(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load plan.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * "Copy latest plan": pulls the newest active plan on/before the given date
   * and re-bases it as a brand-new document for planDate (ids cleared so a save
   * inserts). Returns false when there is nothing to copy.
   */
  const copyLatest = React.useCallback(
    async (params: {
      coId: string | number;
      branchId: number | null;
      planDate: string;
    }): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const api = await fetchPlanningLatest({
          coId: params.coId,
          branchId: params.branchId,
          beforeDate: params.planDate,
        });
        if (!api) return false;
        const ui = apiToUiDoc(api);
        setDocState({
          ...ui,
          planning_id: null,
          plan_no: null,
          plan_date: params.planDate,
          branch_id: params.branchId ?? ui.branch_id,
          loom_lines: ui.loom_lines.map((l) => ({ ...l, planning_loom_id: null })),
          yarn_lines: ui.yarn_lines.map((l) => ({ ...l, planning_yarn_id: null })),
          dept_lines: ui.dept_lines.map((l) => ({ ...l, planning_dept_id: null })),
        });
        setDirty(true);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to copy the latest plan.");
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const markSaved = React.useCallback((planningId: number, planNo: string | null) => {
    setDocState((prev) => (prev ? { ...prev, planning_id: planningId, plan_no: planNo } : prev));
    setDirty(false);
  }, []);

  return { doc, dirty, loading, error, setDoc, resetDoc, loadById, copyLatest, markSaved };
}

export type PlanningDocStateHook = ReturnType<typeof usePlanningDocState>;
