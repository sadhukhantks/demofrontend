"use client";

import * as React from "react";
import {
  fetchPlanningSetup,
  type ClothQualityOption,
  type PlanningSetupData,
  type PlanningStageSetup,
  type YarnItemOption,
} from "@/utils/juteProductionPlanningService";
import type { YarnDescResolver, YarnRateResolver } from "../types/productionPlanningTypes";
import type { NormResolver } from "../utils/planningFactories";

const EMPTY_QUALITIES: readonly ClothQualityOption[] = Object.freeze([]);
const EMPTY_YARNS: readonly YarnItemOption[] = Object.freeze([]);
const EMPTY_STAGES: readonly PlanningStageSetup[] = Object.freeze([]);

/**
 * Fetches planning_setup (cloth qualities, yarn items, stages + installed
 * machine counts, resolved norms for the plan date) and exposes the norms as
 * memoized lookup resolvers for the calc pipeline and factories.
 */
export function usePlanningSetup(
  coId: string | null | undefined,
  branchId: number | null,
  planDate: string
) {
  const [setup, setSetup] = React.useState<PlanningSetupData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!coId) {
      setSetup(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPlanningSetup({ coId, branchId, planDate });
      setSetup(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load planning setup.");
      setSetup(null);
    } finally {
      setLoading(false);
    }
  }, [coId, branchId, planDate]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // Norms as `${id_type}:${ref_id}:${param}` → value.
  const normLookup = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const norm of setup?.norms ?? []) {
      const value = typeof norm.value === "number" ? norm.value : Number(norm.value);
      if (Number.isFinite(value)) {
        map.set(`${norm.id_type}:${norm.ref_id}:${norm.param}`, value);
      }
    }
    return map;
  }, [setup]);

  const resolveNorm = React.useCallback<NormResolver>(
    (idType, refId, param) => normLookup.get(`${idType}:${refId}:${param}`) ?? null,
    [normLookup]
  );

  const yarnItemById = React.useMemo(() => {
    const map = new Map<number, YarnItemOption>();
    for (const item of setup?.yarn_items ?? []) {
      map.set(item.item_id, item);
    }
    return map;
  }, [setup]);

  const clothQualityById = React.useMemo(() => {
    const map = new Map<number, ClothQualityOption>();
    for (const item of setup?.cloth_qualities ?? []) {
      map.set(item.item_id, item);
    }
    return map;
  }, [setup]);

  /** Rate norms for derived yarn lines (deriveYarnLines input). */
  const resolveYarnRate = React.useCallback<YarnRateResolver>(
    (yarnItemId) => {
      const kgPerFrame100 = resolveNorm("yid", yarnItemId, "kg_per_frame_100");
      const stdEff = resolveNorm("yid", yarnItemId, "std_eff");
      if (kgPerFrame100 == null && stdEff == null) return null;
      return { kg_per_frame_100: kgPerFrame100 ?? 0, eff_pct: stdEff ?? 0 };
    },
    [resolveNorm]
  );

  const resolveYarnDesc = React.useCallback<YarnDescResolver>(
    (yarnItemId) => yarnItemById.get(yarnItemId)?.item_name ?? "",
    [yarnItemById]
  );

  return {
    setup,
    loading,
    error,
    refresh,
    clothQualities: setup?.cloth_qualities ?? EMPTY_QUALITIES,
    yarnItems: setup?.yarn_items ?? EMPTY_YARNS,
    stages: setup?.stages ?? EMPTY_STAGES,
    latestPlanningId: setup?.latest_planning_id ?? null,
    normLookup,
    resolveNorm,
    resolveYarnRate,
    resolveYarnDesc,
    yarnItemById,
    clothQualityById,
  };
}

export type PlanningSetupHook = ReturnType<typeof usePlanningSetup>;
