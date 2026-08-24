"use client";
import { useEffect, useState } from "react";

/**
 * False on the server and on the first client render, true afterwards.
 *
 * The report pages fill their filters from the localStorage-backed sidebar
 * context and from module-level caches — both empty during SSR, populated by
 * the time the client renders. Gating the filter bar on this keeps the first
 * client render identical to the server HTML; without it React's `useId`
 * walks a different tree and every MUI input hydrates with a mismatched id.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
