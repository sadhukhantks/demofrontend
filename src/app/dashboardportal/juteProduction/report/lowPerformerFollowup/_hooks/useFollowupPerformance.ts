"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchFollowupPerformance,
  type FollowupPerformance,
} from "@/utils/lowPerformerFollowupService";

/**
 * Performance of a follow-up for a date window ("" / "" = the server default:
 * start date .. yesterday, clipped to the department's maximum). Loads once
 * automatically when the follow-up opens; afterwards only on demand.
 */
export function useFollowupPerformance(coId: number | null, followupId: number | null) {
  const [data, setData] = useState<FollowupPerformance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const lastWindow = useRef({ from: "", to: "" });

  const load = useCallback(
    async (from: string, to: string) => {
      if (coId == null || followupId == null) return;
      lastWindow.current = { from, to };
      const mine = ++seq.current;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchFollowupPerformance({ coId, followupId, dateFrom: from, dateTo: to });
        if (mine === seq.current) setData(res);
      } catch (err: unknown) {
        if (mine === seq.current) {
          setData(null);
          setError(err instanceof Error ? err.message : "Failed to load the performance");
        }
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [coId, followupId],
  );

  /** Same window again (after the start date was edited, say). */
  const reload = useCallback(
    () => load(lastWindow.current.from, lastWindow.current.to),
    [load],
  );

  useEffect(() => {
    void load("", "");
  }, [load]);

  const current = data && data.followup.followup_id === followupId ? data : null;
  return { data: current, loading, error, load, reload };
}
