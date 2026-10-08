"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchFollowupList,
  type FollowupDeptCode,
  type FollowupRow,
} from "@/utils/lowPerformerFollowupService";

export interface UseFollowupListArgs {
  coId: number | null;
  branchId: number | null;
  deptCode: FollowupDeptCode | null;
  status: 0 | 1 | null;
  /** Only the list view loads; turning this back on (back to the list) reloads. */
  enabled: boolean;
}

/** The follow-up list of a branch for the current filters. */
export function useFollowupList({ coId, branchId, deptCode, status, enabled }: UseFollowupListArgs) {
  const [rows, setRows] = useState<FollowupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!enabled || coId == null || branchId == null) return;
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchFollowupList({ coId, branchId, deptCode, status });
      if (mine === seq.current) setRows(list);
    } catch (err: unknown) {
      if (mine === seq.current) {
        setRows([]);
        setError(err instanceof Error ? err.message : "Failed to load the follow-up list");
      }
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [enabled, coId, branchId, deptCode, status]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, loading, error, reload };
}
