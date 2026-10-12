"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchLaCase,
  fetchLaStruckOffPermissions,
  type LaCase,
  type LaCaseDetail,
  type LaPermissions,
} from "@/utils/longAbsenteeismService";

/**
 * One case (header, letters, timeline, earlier cases) and its struck-off
 * approval permissions. Data is only returned for the requested id, so a
 * previous case never flashes up.
 */
export function useLaCase(coId: number | null, caseId: number | null) {
  const [detail, setDetail] = useState<{ id: number; data: LaCaseDetail } | null>(null);
  const [perms, setPerms] = useState<{ id: number; data: LaPermissions } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permsError, setPermsError] = useState<string | null>(null);
  const seq = useRef(0);
  const permSeq = useRef(0);

  const reloadDetail = useCallback(async () => {
    if (coId == null || caseId == null) return;
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLaCase(coId, caseId);
      if (mine === seq.current) setDetail({ id: caseId, data });
    } catch (err: unknown) {
      if (mine === seq.current) setError(err instanceof Error ? err.message : "Failed to load the case");
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [coId, caseId]);

  const reloadPerms = useCallback(async () => {
    if (coId == null || caseId == null) return;
    const mine = ++permSeq.current;
    setPermsError(null);
    try {
      const data = await fetchLaStruckOffPermissions(coId, caseId);
      if (mine === permSeq.current) setPerms({ id: caseId, data });
    } catch (err: unknown) {
      if (mine === permSeq.current) {
        setPerms(null);
        setPermsError(err instanceof Error ? err.message : "Failed to load the approval permissions");
      }
    }
  }, [coId, caseId]);

  /** Everything, after any action (the case, letters, timeline and the approval state all move together). */
  const reload = useCallback(async () => {
    await Promise.all([reloadDetail(), reloadPerms()]);
  }, [reloadDetail, reloadPerms]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Swaps in the case an action returned, before the full reload lands. */
  const setCase = useCallback(
    (c: LaCase) => {
      setDetail((prev) => (prev && prev.id === c.case_id ? { id: prev.id, data: { ...prev.data, case: c } } : prev));
    },
    [],
  );

  const current = detail && detail.id === caseId ? detail.data : null;
  return {
    detail: current,
    perms: perms && perms.id === caseId ? perms.data : null,
    loading: loading && current == null,
    error,
    permsError,
    reload,
    setCase,
  };
}
