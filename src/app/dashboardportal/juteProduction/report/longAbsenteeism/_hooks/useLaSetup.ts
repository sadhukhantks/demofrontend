"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLaSetup, type LaSetup } from "@/utils/longAbsenteeismService";

/**
 * GET /setup for a branch (codes + labels, rule, departments, server date,
 * access level). `setup` is only returned for the requested branch, so a
 * previous branch's departments never show up under the new one.
 */
export function useLaSetup(coId: number | null, branchId: number | null) {
  const [state, setState] = useState<{ key: string; setup: LaSetup } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const key = coId != null && branchId != null ? `${coId}:${branchId}` : null;

  /** Also used after Settings save a new rule (extra column labels, waits). */
  const reload = useCallback(async () => {
    if (coId == null || branchId == null) return;
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const setup = await fetchLaSetup(coId, branchId);
      if (mine === seq.current) setState({ key: `${coId}:${branchId}`, setup });
    } catch (err: unknown) {
      if (mine === seq.current) setError(err instanceof Error ? err.message : "Failed to load the setup");
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [coId, branchId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    setup: state && state.key === key ? state.setup : null,
    error,
    loading,
    reload,
  };
}
