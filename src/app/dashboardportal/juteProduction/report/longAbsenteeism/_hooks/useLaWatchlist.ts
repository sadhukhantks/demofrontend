"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchLaCandidates,
  fetchLaList,
  type LaCandidate,
  type LaListRow,
  type LaListView,
} from "@/utils/longAbsenteeismService";
import type { WatchView } from "../_utils";

export interface UseLaWatchlistArgs {
  coId: number | null;
  branchId: number | null;
  view: WatchView;
  /** Server-side search of the case list (EB No / name). */
  q: string;
  /** Only the list view loads; turning this back on (back from a case) reloads. */
  enabled: boolean;
}

/**
 * The watchlist of a branch: the case rows of the view and, on "Due today" and
 * "Candidates", the new candidates. The two loads fail independently so a
 * slow candidates query never hides the cases.
 *
 * Both are loaded for ALL departments (the service gets `deptId: null`): the
 * department filter and the department summary strip work on these full rows
 * on the client, so picking a department never hides the other departments
 * from the summary and never costs a reload.
 */
export function useLaWatchlist({ coId, branchId, view, q, enabled }: UseLaWatchlistArgs) {
  const [rows, setRows] = useState<LaListRow[]>([]);
  const [candidates, setCandidates] = useState<LaCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const listSeq = useRef(0);
  const candSeq = useRef(0);

  const listView: LaListView | null = view === "candidates" ? null : view;
  const wantsCandidates = view === "due" || view === "candidates";

  const reloadList = useCallback(async () => {
    if (!enabled || coId == null || branchId == null) return;
    const mine = ++listSeq.current;
    if (listView == null) {
      setRows([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await fetchLaList({ coId, branchId, view: listView, deptId: null, q });
      if (mine === listSeq.current) setRows(list);
    } catch (err: unknown) {
      if (mine === listSeq.current) {
        setRows([]);
        setError(err instanceof Error ? err.message : "Failed to load the cases");
      }
    } finally {
      if (mine === listSeq.current) setLoading(false);
    }
  }, [enabled, coId, branchId, listView, q]);

  const reloadCandidates = useCallback(async () => {
    if (!enabled || coId == null || branchId == null) return;
    const mine = ++candSeq.current;
    if (!wantsCandidates) {
      setCandidates([]);
      setCandidatesError(null);
      return;
    }
    setCandidatesLoading(true);
    setCandidatesError(null);
    try {
      const list = await fetchLaCandidates({ coId, branchId, deptId: null });
      if (mine === candSeq.current) setCandidates(list);
    } catch (err: unknown) {
      if (mine === candSeq.current) {
        setCandidates([]);
        setCandidatesError(err instanceof Error ? err.message : "Failed to load the candidates");
      }
    } finally {
      if (mine === candSeq.current) setCandidatesLoading(false);
    }
  }, [enabled, coId, branchId, wantsCandidates]);

  useEffect(() => {
    void reloadList();
  }, [reloadList]);

  useEffect(() => {
    void reloadCandidates();
  }, [reloadCandidates]);

  const reload = useCallback(async () => {
    await Promise.all([reloadList(), reloadCandidates()]);
  }, [reloadList, reloadCandidates]);

  /** Swaps in a row the server returned (inline remarks edit) without a reload. */
  const patchRow = useCallback((row: LaListRow) => {
    setRows((prev) => prev.map((r) => (r.case_id === row.case_id ? row : r)));
  }, []);

  return {
    rows,
    candidates,
    loading,
    candidatesLoading,
    error,
    candidatesError,
    reload,
    patchRow,
  };
}
